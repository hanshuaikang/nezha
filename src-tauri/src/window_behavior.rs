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
pub(crate) fn handle_window_event<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    event: &tauri::WindowEvent,
) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if window.label() != MAIN_WINDOW_LABEL {
            return;
        }
        api.prevent_close();
        let _ = window.hide();
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
