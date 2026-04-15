#[cfg(target_os = "macos")]
mod macos {
    use std::{
        cell::RefCell,
        sync::LazyLock,
        time::{Duration, Instant},
    };

    use objc2::rc::Retained;
    use objc2::{define_class, msg_send, sel, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{
        NSApp, NSWindow, NSWindowDidExitFullScreenNotification, NSWindowStyleMask,
    };
    use objc2_foundation::{NSNotification, NSNotificationCenter, NSObject, NSObjectProtocol};
    use parking_lot::Mutex;
    use tauri::Manager;

    const MAIN_WINDOW_LABEL: &str = "main";
    const FULLSCREEN_EXIT_TIMEOUT: Duration = Duration::from_secs(2);
    const HIDE_VERIFICATION_DELAY: Duration = Duration::from_millis(75);

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum CloseRequestAction {
        None,
        HideImmediately,
        ExitFullscreenThenHide,
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum MainEventsAction {
        None,
        RetryExitFullscreen,
        Hide,
        Stop,
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum PendingHide {
        None,
        WaitingForFullscreenExit {
            retry_count: u8,
            deadline: Instant,
        },
        WaitingForHideVerification {
            retry_count: u8,
            verify_after: Instant,
        },
    }

    #[derive(Debug)]
    struct MainWindowCloseState {
        pending_hide: PendingHide,
    }

    impl MainWindowCloseState {
        fn new() -> Self {
            Self {
                pending_hide: PendingHide::None,
            }
        }

        fn on_close_requested(&mut self, is_fullscreen: bool, now: Instant) -> CloseRequestAction {
            match self.pending_hide {
                PendingHide::None => {
                    if is_fullscreen {
                        self.pending_hide = PendingHide::WaitingForFullscreenExit {
                            retry_count: 0,
                            deadline: now + FULLSCREEN_EXIT_TIMEOUT,
                        };
                        CloseRequestAction::ExitFullscreenThenHide
                    } else {
                        self.pending_hide = PendingHide::WaitingForHideVerification {
                            retry_count: 0,
                            verify_after: now + HIDE_VERIFICATION_DELAY,
                        };
                        CloseRequestAction::HideImmediately
                    }
                }
                PendingHide::WaitingForFullscreenExit { .. } => CloseRequestAction::None,
                PendingHide::WaitingForHideVerification { .. } => CloseRequestAction::None,
            }
        }

        fn on_fullscreen_exit_succeeded(&mut self, now: Instant) -> MainEventsAction {
            match self.pending_hide {
                PendingHide::WaitingForFullscreenExit { .. } => {
                    self.pending_hide = PendingHide::WaitingForHideVerification {
                        retry_count: 0,
                        verify_after: now + HIDE_VERIFICATION_DELAY,
                    };
                    MainEventsAction::Hide
                }
                _ => MainEventsAction::None,
            }
        }

        fn on_fullscreen_exit_progress(
            &mut self,
            is_fullscreen: bool,
            now: Instant,
        ) -> MainEventsAction {
            match self.pending_hide {
                PendingHide::WaitingForFullscreenExit { deadline, .. }
                    if !is_fullscreen && now >= deadline =>
                {
                    self.pending_hide = PendingHide::WaitingForHideVerification {
                        retry_count: 0,
                        verify_after: now + HIDE_VERIFICATION_DELAY,
                    };
                    MainEventsAction::Hide
                }
                PendingHide::WaitingForFullscreenExit { .. } if !is_fullscreen => {
                    MainEventsAction::None
                }
                PendingHide::WaitingForFullscreenExit { deadline, .. } if now < deadline => {
                    MainEventsAction::None
                }
                PendingHide::WaitingForFullscreenExit { retry_count: 0, .. } => {
                    self.pending_hide = PendingHide::WaitingForFullscreenExit {
                        retry_count: 1,
                        deadline: now + FULLSCREEN_EXIT_TIMEOUT,
                    };
                    MainEventsAction::RetryExitFullscreen
                }
                PendingHide::WaitingForFullscreenExit { .. } => {
                    self.pending_hide = PendingHide::None;
                    MainEventsAction::Stop
                }
                _ => MainEventsAction::None,
            }
        }

        fn on_hide_result(&mut self, hidden: bool, now: Instant) -> MainEventsAction {
            match self.pending_hide {
                PendingHide::WaitingForHideVerification { .. } if hidden => {
                    self.pending_hide = PendingHide::None;
                    MainEventsAction::Stop
                }
                PendingHide::WaitingForHideVerification { verify_after, .. }
                    if now < verify_after =>
                {
                    MainEventsAction::None
                }
                PendingHide::WaitingForHideVerification { retry_count: 0, .. } => {
                    self.pending_hide = PendingHide::WaitingForHideVerification {
                        retry_count: 1,
                        verify_after: now + HIDE_VERIFICATION_DELAY,
                    };
                    MainEventsAction::Hide
                }
                PendingHide::WaitingForHideVerification { .. } => {
                    self.pending_hide = PendingHide::None;
                    MainEventsAction::Stop
                }
                _ => MainEventsAction::None,
            }
        }

        fn reset(&mut self) {
            self.pending_hide = PendingHide::None;
        }

        fn has_pending_main_events_work(&self) -> bool {
            !matches!(self.pending_hide, PendingHide::None)
        }

        fn is_waiting_for_fullscreen_exit(&self) -> bool {
            matches!(
                self.pending_hide,
                PendingHide::WaitingForFullscreenExit { .. }
            )
        }

        fn is_waiting_for_hide_verification(&self) -> bool {
            matches!(
                self.pending_hide,
                PendingHide::WaitingForHideVerification { .. }
            )
        }
    }

    static MAIN_WINDOW_CLOSE_STATE: LazyLock<Mutex<MainWindowCloseState>> =
        LazyLock::new(|| Mutex::new(MainWindowCloseState::new()));

    define_class!(
        #[unsafe(super = NSObject)]
        #[thread_kind = MainThreadOnly]
        struct FullscreenExitObserver;

        unsafe impl NSObjectProtocol for FullscreenExitObserver {}

        impl FullscreenExitObserver {
            #[unsafe(method(handleWindowDidExitFullScreen:))]
            fn handle_window_did_exit_fullscreen(&self, notification: &NSNotification) {
                handle_fullscreen_exit_notification(notification);
            }
        }
    );

    impl FullscreenExitObserver {
        fn new(mtm: MainThreadMarker) -> Retained<Self> {
            unsafe { msg_send![Self::alloc(mtm), init] }
        }
    }

    thread_local! {
        static FULLSCREEN_EXIT_OBSERVER: RefCell<Option<Retained<FullscreenExitObserver>>> = const { RefCell::new(None) };
    }

    fn fullscreen_exit_observer(mtm: MainThreadMarker) -> Retained<FullscreenExitObserver> {
        FULLSCREEN_EXIT_OBSERVER.with(|slot| {
            let mut slot = slot.borrow_mut();
            slot.get_or_insert_with(|| FullscreenExitObserver::new(mtm))
                .clone()
        })
    }

    fn is_native_fullscreen(ns_window: &NSWindow) -> bool {
        ns_window
            .styleMask()
            .contains(NSWindowStyleMask::FullScreen)
    }

    fn restore_main_window<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) {
        if let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) {
            if window.show().is_err() {
                return;
            }
            let _ = window.set_focus();
        }
    }

    fn reset_pending_hide() {
        MAIN_WINDOW_CLOSE_STATE.lock().reset();
    }

    fn clear_fullscreen_exit_flow(mtm: Option<MainThreadMarker>) {
        if let Some(mtm) = mtm {
            unregister_fullscreen_exit_observer(mtm);
        }
        reset_pending_hide();
    }

    fn register_fullscreen_exit_observer(mtm: MainThreadMarker, ns_window: &NSWindow) {
        let observer = fullscreen_exit_observer(mtm);
        let center = NSNotificationCenter::defaultCenter();

        unsafe {
            center.removeObserver_name_object(
                &*observer,
                Some(NSWindowDidExitFullScreenNotification),
                Some(ns_window),
            );
            center.addObserver_selector_name_object(
                &*observer,
                sel!(handleWindowDidExitFullScreen:),
                Some(NSWindowDidExitFullScreenNotification),
                Some(ns_window),
            );
        }
    }

    fn unregister_fullscreen_exit_observer(mtm: MainThreadMarker) {
        let observer = fullscreen_exit_observer(mtm);
        let center = NSNotificationCenter::defaultCenter();

        unsafe {
            center.removeObserver(&*observer);
        }
    }

    fn request_exit_fullscreen(ns_window: &NSWindow) {
        ns_window.toggleFullScreen(None);
    }

    fn hide_window_once(mtm: MainThreadMarker, ns_window: &NSWindow) {
        let app = NSApp(mtm);
        ns_window.orderOut(None);
        app.hide(None);
    }

    fn request_hide_once(ns_window: &NSWindow) {
        let Some(mtm) = MainThreadMarker::new() else {
            eprintln!("macOS window hide must run on the main thread");
            clear_fullscreen_exit_flow(None);
            return;
        };

        hide_window_once(mtm, ns_window);
    }

    fn advance_hide_verification_on_main_thread<R: tauri::Runtime>(
        app_handle: &tauri::AppHandle<R>,
    ) {
        let Some(mtm) = MainThreadMarker::new() else {
            eprintln!("macOS hide verification must run on the main thread");
            clear_fullscreen_exit_flow(None);
            return;
        };

        let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) else {
            clear_fullscreen_exit_flow(Some(mtm));
            return;
        };

        let Ok(ns_window) = window.ns_window() else {
            eprintln!("failed to access native macOS main window during hide verification");
            clear_fullscreen_exit_flow(Some(mtm));
            return;
        };

        let ns_window: &NSWindow = unsafe { &*ns_window.cast() };
        match MAIN_WINDOW_CLOSE_STATE
            .lock()
            .on_hide_result(!ns_window.isVisible(), Instant::now())
        {
            MainEventsAction::None => {}
            MainEventsAction::Hide => {
                hide_window_once(mtm, ns_window);
            }
            MainEventsAction::Stop => {}
            MainEventsAction::RetryExitFullscreen => {}
        }
    }

    fn handle_fullscreen_exit_notification(notification: &NSNotification) {
        let Some(mtm) = MainThreadMarker::new() else {
            eprintln!("macOS fullscreen exit notification must run on the main thread");
            clear_fullscreen_exit_flow(None);
            return;
        };

        let Some(object) = notification.object() else {
            eprintln!("missing window object on macOS fullscreen exit notification");
            clear_fullscreen_exit_flow(Some(mtm));
            return;
        };

        let Ok(window) = object.downcast::<NSWindow>() else {
            eprintln!("unexpected macOS fullscreen exit notification object");
            clear_fullscreen_exit_flow(Some(mtm));
            return;
        };

        unregister_fullscreen_exit_observer(mtm);

        if MAIN_WINDOW_CLOSE_STATE
            .lock()
            .on_fullscreen_exit_succeeded(Instant::now())
            == MainEventsAction::Hide
        {
            request_hide_once(&window);
        }
    }

    fn handle_close_request_on_main_thread<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) {
        let Some(mtm) = MainThreadMarker::new() else {
            eprintln!("macOS close handling must run on the main thread");
            clear_fullscreen_exit_flow(None);
            return;
        };

        let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) else {
            clear_fullscreen_exit_flow(Some(mtm));
            return;
        };

        let Ok(ns_window) = window.ns_window() else {
            eprintln!("failed to access native macOS main window");
            clear_fullscreen_exit_flow(Some(mtm));
            return;
        };

        let ns_window: &NSWindow = unsafe { &*ns_window.cast() };

        match MAIN_WINDOW_CLOSE_STATE
            .lock()
            .on_close_requested(is_native_fullscreen(ns_window), Instant::now())
        {
            CloseRequestAction::None => {}
            CloseRequestAction::HideImmediately => {
                request_hide_once(ns_window);
            }
            CloseRequestAction::ExitFullscreenThenHide => {
                register_fullscreen_exit_observer(mtm, ns_window);
                request_exit_fullscreen(ns_window);
            }
        }
    }

    fn advance_fullscreen_exit_on_main_thread<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) {
        let Some(mtm) = MainThreadMarker::new() else {
            eprintln!("macOS fullscreen progress check must run on the main thread");
            clear_fullscreen_exit_flow(None);
            return;
        };

        let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) else {
            clear_fullscreen_exit_flow(Some(mtm));
            return;
        };

        let Ok(ns_window) = window.ns_window() else {
            eprintln!("failed to access native macOS main window during fullscreen progress check");
            clear_fullscreen_exit_flow(Some(mtm));
            return;
        };

        let ns_window: &NSWindow = unsafe { &*ns_window.cast() };
        match MAIN_WINDOW_CLOSE_STATE
            .lock()
            .on_fullscreen_exit_progress(is_native_fullscreen(ns_window), Instant::now())
        {
            MainEventsAction::None => {}
            MainEventsAction::RetryExitFullscreen => {
                register_fullscreen_exit_observer(mtm, ns_window);
                request_exit_fullscreen(ns_window);
            }
            MainEventsAction::Hide => {
                unregister_fullscreen_exit_observer(mtm);
                request_hide_once(ns_window);
            }
            MainEventsAction::Stop => {
                unregister_fullscreen_exit_observer(mtm);
            }
        }
    }

    pub(crate) fn handle_window_event<R: tauri::Runtime>(
        window: &tauri::Window<R>,
        event: &tauri::WindowEvent,
    ) {
        if window.label() != MAIN_WINDOW_LABEL {
            return;
        }

        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();

            let app_handle = window.app_handle().clone();
            if let Err(error) = window.app_handle().run_on_main_thread(move || {
                handle_close_request_on_main_thread(&app_handle);
            }) {
                eprintln!("failed to dispatch macOS close handling to main thread: {error}");
                clear_fullscreen_exit_flow(None);
            }
        }
    }

    pub(crate) fn handle_run_event<R: tauri::Runtime>(
        app_handle: &tauri::AppHandle<R>,
        event: tauri::RunEvent,
    ) {
        match event {
            tauri::RunEvent::MainEventsCleared => {
                let pending_work = {
                    let state = MAIN_WINDOW_CLOSE_STATE.lock();
                    (
                        state.has_pending_main_events_work(),
                        state.is_waiting_for_fullscreen_exit(),
                        state.is_waiting_for_hide_verification(),
                    )
                };

                if pending_work.0 {
                    let app_handle = app_handle.clone();
                    let app_handle_for_closure = app_handle.clone();
                    if let Err(error) = app_handle.run_on_main_thread(move || {
                        if pending_work.1 {
                            advance_fullscreen_exit_on_main_thread(&app_handle_for_closure);
                        } else if pending_work.2 {
                            advance_hide_verification_on_main_thread(&app_handle_for_closure);
                        }
                    }) {
                        eprintln!("failed to dispatch macOS close-flow progress check to main thread: {error}");
                        clear_fullscreen_exit_flow(None);
                    }
                }
            }
            tauri::RunEvent::Reopen {
                has_visible_windows,
                ..
            } => {
                if !has_visible_windows {
                    restore_main_window(app_handle);
                }
            }
            _ => {}
        }
    }
}

#[cfg(target_os = "macos")]
pub(crate) use macos::{handle_run_event, handle_window_event};

#[cfg(not(target_os = "macos"))]
pub(crate) fn handle_window_event<R: tauri::Runtime>(
    _window: &tauri::Window<R>,
    _event: &tauri::WindowEvent,
) {
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn handle_run_event<R: tauri::Runtime>(
    _app_handle: &tauri::AppHandle<R>,
    _event: tauri::RunEvent,
) {
}
