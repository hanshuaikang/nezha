use std::{
    sync::LazyLock,
    time::{Duration, Instant},
};

#[cfg(target_os = "macos")]
use objc2::MainThreadMarker;
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSApp, NSWindow};
#[cfg(target_os = "macos")]
use parking_lot::Mutex;
#[cfg(target_os = "macos")]
use tauri::Manager;

const MAIN_WINDOW_LABEL: &str = "main";
const FULLSCREEN_HIDE_DELAY: Duration = Duration::from_millis(500);
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CloseRequestAction {
    HideImmediately,
    ExitFullscreenThenHide,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PendingHide {
    None,
    WaitingForFullscreenExit,
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

    fn on_close_requested(&mut self, is_fullscreen: bool) -> CloseRequestAction {
        if is_fullscreen {
            self.pending_hide = PendingHide::WaitingForFullscreenExit;
            CloseRequestAction::ExitFullscreenThenHide
        } else {
            self.pending_hide = PendingHide::None;
            CloseRequestAction::HideImmediately
        }
    }

    fn on_main_events_cleared(&mut self, is_fullscreen: bool, now: Instant) -> bool {
        match self.pending_hide {
            PendingHide::None => false,
            PendingHide::WaitingForFullscreenExit if is_fullscreen => false,
            PendingHide::WaitingForFullscreenExit => {
                self.pending_hide = PendingHide::WaitingUntil(now + FULLSCREEN_HIDE_DELAY);
                false
            }
            PendingHide::WaitingUntil(deadline) if now < deadline => false,
            PendingHide::WaitingUntil(_) => {
                self.pending_hide = PendingHide::None;
                true
            }
        }
    }

    fn reset(&mut self) {
        self.pending_hide = PendingHide::None;
    }
}

#[cfg(target_os = "macos")]
static MAIN_WINDOW_CLOSE_STATE: LazyLock<Mutex<MainWindowCloseState>> =
    LazyLock::new(|| Mutex::new(MainWindowCloseState::new()));

#[cfg(target_os = "macos")]
fn restore_main_window<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) {
    if let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) {
        if window.show().is_err() {
            return;
        }
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "macos")]
fn hide_main_window_natively<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) {
    let app_handle = app_handle.clone();
    let app_handle_for_closure = app_handle.clone();
    let _ = app_handle.run_on_main_thread(move || {
        let mtm = MainThreadMarker::new().expect("window hide should run on main thread");
        let app = NSApp(mtm);

        if let Some(window) = app_handle_for_closure.get_webview_window(MAIN_WINDOW_LABEL) {
            if let Ok(ns_window) = window.ns_window() {
                let ns_window: &NSWindow = unsafe { &*ns_window.cast() };
                ns_window.orderOut(None);
            }
        }

        app.hide(None);
    });
}

#[cfg(target_os = "macos")]
pub(crate) fn handle_window_event<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    event: &tauri::WindowEvent,
) {
    let is_main_window = window.label() == MAIN_WINDOW_LABEL;
    if !is_main_window {
        return;
    }

    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let close_action = MAIN_WINDOW_CLOSE_STATE
            .lock()
            .on_close_requested(window.is_fullscreen().unwrap_or(false));

        match close_action {
            CloseRequestAction::HideImmediately => {
                api.prevent_close();
                hide_main_window_natively(&window.app_handle());
            }
            CloseRequestAction::ExitFullscreenThenHide => {
                api.prevent_close();
                if window.set_fullscreen(false).is_err() {
                    MAIN_WINDOW_CLOSE_STATE.lock().reset();
                    hide_main_window_natively(&window.app_handle());
                }
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn handle_window_event<R: tauri::Runtime>(
    _window: &tauri::Window<R>,
    _event: &tauri::WindowEvent,
) {
}

#[cfg(target_os = "macos")]
pub(crate) fn handle_run_event<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    event: tauri::RunEvent,
) {
    match event {
        tauri::RunEvent::MainEventsCleared => {
            if let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) {
                let should_hide = MAIN_WINDOW_CLOSE_STATE.lock().on_main_events_cleared(
                    window.is_fullscreen().unwrap_or(false),
                    Instant::now(),
                );
                if should_hide {
                    hide_main_window_natively(app_handle);
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

#[cfg(not(target_os = "macos"))]
pub(crate) fn handle_run_event<R: tauri::Runtime>(
    _app_handle: &tauri::AppHandle<R>,
    _event: tauri::RunEvent,
) {
}
