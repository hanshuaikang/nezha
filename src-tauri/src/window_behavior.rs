#[cfg(target_os = "macos")]
mod macos {
    use std::{
        sync::LazyLock,
        time::{Duration, Instant},
    };

    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApp, NSWindow};
    use parking_lot::Mutex;
    use tauri::Manager;

    const MAIN_WINDOW_LABEL: &str = "main";
    const FULLSCREEN_HIDE_DELAY: Duration = Duration::from_millis(500);
    const FULLSCREEN_EXIT_TIMEOUT: Duration = Duration::from_secs(2);

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum CloseRequestAction {
        HideImmediately,
        ExitFullscreenThenHide,
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum MainEventsAction {
        None,
        RetryExitFullscreen,
        Hide,
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum PendingHide {
        None,
        WaitingForFullscreenExitUntil(Instant),
        WaitingUntil(Instant),
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

        fn on_close_requested(
            &mut self,
            is_fullscreen: Option<bool>,
            now: Instant,
        ) -> CloseRequestAction {
            match is_fullscreen {
                Some(false) => {
                    self.pending_hide = PendingHide::None;
                    CloseRequestAction::HideImmediately
                }
                Some(true) | None => {
                    self.pending_hide =
                        PendingHide::WaitingForFullscreenExitUntil(now + FULLSCREEN_EXIT_TIMEOUT);
                    CloseRequestAction::ExitFullscreenThenHide
                }
            }
        }

        fn on_main_events_cleared(
            &mut self,
            is_fullscreen: Option<bool>,
            now: Instant,
        ) -> MainEventsAction {
            match self.pending_hide {
                PendingHide::None => MainEventsAction::None,
                PendingHide::WaitingForFullscreenExitUntil(deadline) => match is_fullscreen {
                    Some(true) if now < deadline => MainEventsAction::None,
                    Some(true) => {
                        self.pending_hide =
                            PendingHide::WaitingForFullscreenExitUntil(now + FULLSCREEN_EXIT_TIMEOUT);
                        MainEventsAction::RetryExitFullscreen
                    }
                    Some(false) if now >= deadline => {
                        self.pending_hide = PendingHide::WaitingUntil(now + FULLSCREEN_HIDE_DELAY);
                        MainEventsAction::None
                    }
                    Some(false) => {
                        self.pending_hide = PendingHide::WaitingUntil(now + FULLSCREEN_HIDE_DELAY);
                        MainEventsAction::None
                    }
                    None if now >= deadline => {
                        self.pending_hide = PendingHide::WaitingUntil(now + FULLSCREEN_HIDE_DELAY);
                        MainEventsAction::None
                    }
                    None => MainEventsAction::None,
                },
                PendingHide::WaitingUntil(deadline) if now < deadline => MainEventsAction::None,
                PendingHide::WaitingUntil(_) => {
                    self.pending_hide = PendingHide::None;
                    MainEventsAction::Hide
                }
            }
        }

        fn reset(&mut self) {
            self.pending_hide = PendingHide::None;
        }

        fn has_pending_hide(&self) -> bool {
            !matches!(self.pending_hide, PendingHide::None)
        }
    }

    static MAIN_WINDOW_CLOSE_STATE: LazyLock<Mutex<MainWindowCloseState>> =
        LazyLock::new(|| Mutex::new(MainWindowCloseState::new()));

    fn read_fullscreen_state(result: tauri::Result<bool>, log_errors: bool) -> Option<bool> {
        match result {
            Ok(is_fullscreen) => Some(is_fullscreen),
            Err(error) => {
                if log_errors {
                    eprintln!("failed to query macOS main window fullscreen state: {error}");
                }
                None
            }
        }
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

    fn hide_main_window<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) {
        let app_handle_for_closure = app_handle.clone();

        if let Err(error) = app_handle.run_on_main_thread(move || {
            let mtm = MainThreadMarker::new().expect("window hide should run on main thread");
            let app = NSApp(mtm);

            if let Some(window) = app_handle_for_closure.get_webview_window(MAIN_WINDOW_LABEL) {
                if let Ok(ns_window) = window.ns_window() {
                    let ns_window: &NSWindow = unsafe { &*ns_window.cast() };
                    ns_window.orderOut(None);
                }
            }

            app.hide(None);
        }) {
            eprintln!("failed to dispatch macOS window hide to main thread: {error}");
            reset_pending_hide();
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
            let close_action =
                MAIN_WINDOW_CLOSE_STATE
                    .lock()
                    .on_close_requested(read_fullscreen_state(
                        window.is_fullscreen(),
                        true,
                    ), Instant::now());

            match close_action {
                CloseRequestAction::HideImmediately => {
                    api.prevent_close();
                    hide_main_window(&window.app_handle());
                }
                CloseRequestAction::ExitFullscreenThenHide => {
                    api.prevent_close();
                    if let Err(error) = window.set_fullscreen(false) {
                        eprintln!(
                            "failed to exit macOS fullscreen during close request: {error}"
                        );
                    }
                }
            }
        }
    }

    pub(crate) fn handle_run_event<R: tauri::Runtime>(
        app_handle: &tauri::AppHandle<R>,
        event: tauri::RunEvent,
    ) {
        match event {
            tauri::RunEvent::MainEventsCleared => {
                if let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) {
                    let now = Instant::now();
                    let needs_fullscreen_state = MAIN_WINDOW_CLOSE_STATE.lock().has_pending_hide();
                    let fullscreen_state = if needs_fullscreen_state {
                        read_fullscreen_state(window.is_fullscreen(), false)
                    } else {
                        None
                    };
                    let action = MAIN_WINDOW_CLOSE_STATE
                        .lock()
                        .on_main_events_cleared(fullscreen_state, now);
                    match action {
                        MainEventsAction::None => {}
                        MainEventsAction::RetryExitFullscreen => {
                            let _ = window.set_fullscreen(false);
                        }
                        MainEventsAction::Hide => {
                            hide_main_window(app_handle);
                        }
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
