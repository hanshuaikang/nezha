#[cfg(target_os = "macos")]
use std::time::Duration;
#[cfg(target_os = "macos")]
use tauri::Manager;

const MAIN_WINDOW_LABEL: &str = "main";

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
pub(crate) fn hide_main_window<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) {
    let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };

    if window.is_fullscreen().unwrap_or(false) {
        tauri::async_runtime::spawn(async move {
            let _ = window.set_fullscreen(false);

            // Phase 1: wait until macOS reports fullscreen has exited.
            for _ in 0..30 {
                tokio::time::sleep(Duration::from_millis(100)).await;
                if !window.is_fullscreen().unwrap_or(true) {
                    break;
                }
            }

            // Phase 2: the macOS space-transition animation continues well
            // after is_fullscreen() already returns false.  Give it time to
            // settle – without this delay hide() calls are silently ignored
            // by the window server.
            tokio::time::sleep(Duration::from_millis(700)).await;

            // Phase 3: hide with retries in case the first call is still too early.
            for _ in 0..5 {
                let _ = window.hide();
                tokio::time::sleep(Duration::from_millis(150)).await;
                if !window.is_visible().unwrap_or(true) {
                    return;
                }
            }
        });
        return;
    }

    let _ = window.hide();
}

#[cfg(target_os = "macos")]
pub(crate) fn handle_window_event<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    event: &tauri::WindowEvent,
) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if window.label() != MAIN_WINDOW_LABEL {
            return;
        }
        api.prevent_close();
        hide_main_window(window.app_handle());
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
    if let tauri::RunEvent::Reopen { has_visible_windows, .. } = event {
        if !has_visible_windows {
            restore_main_window(app_handle);
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn handle_run_event<R: tauri::Runtime>(
    _app_handle: &tauri::AppHandle<R>,
    _event: tauri::RunEvent,
) {
}
