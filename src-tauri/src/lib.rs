use parking_lot::Mutex;
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use usage::CodexRpcClient;

mod agent_assist;
mod analytics;
mod app_settings;
mod config;
mod fs;
mod git;
mod notification;
mod platform;
mod pty;
mod session;
mod storage;
mod subprocess;
mod usage;

use session::{ClaudeSessionInfo, CodexSessionInfo};

pub struct TaskManager {
    pub(crate) pty_masters: Mutex<HashMap<String, Box<dyn portable_pty::MasterPty + Send>>>,
    pub(crate) pty_writers: Mutex<HashMap<String, Box<dyn Write + Send>>>,
    pub(crate) child_handles:
        Mutex<HashMap<String, Arc<std::sync::Mutex<Box<dyn portable_pty::Child + Send + Sync>>>>>,
    pub(crate) cancelled_tasks: Mutex<HashSet<String>>,
    pub(crate) manually_completed_tasks: Mutex<HashSet<String>>,
    pub(crate) codex_sessions: Mutex<HashMap<String, CodexSessionInfo>>,
    pub(crate) claude_sessions: Mutex<HashMap<String, ClaudeSessionInfo>>,
    pub(crate) claimed_session_paths: Mutex<HashSet<String>>,
    /// Persistent `codex app-server` process reused across `read_usage_snapshot` calls.
    pub(crate) codex_rpc: Arc<Mutex<Option<CodexRpcClient>>>,
}

impl TaskManager {
    /// Atomically remove a task/shell from all PTY maps (masters, writers, children).
    /// Locks are acquired in a fixed order to prevent deadlocks.
    pub(crate) fn remove_pty_handles(&self, id: &str) {
        let mut masters = self.pty_masters.lock();
        let mut writers = self.pty_writers.lock();
        let mut children = self.child_handles.lock();
        masters.remove(id);
        writers.remove(id);
        children.remove(id);
    }
}

const MIN_RESTORED_WINDOW_WIDTH: u32 = 640;
const MIN_RESTORED_WINDOW_HEIGHT: u32 = 480;
const MIN_VISIBLE_WINDOW_PIXELS: i64 = 80;

fn sanitized_saved_window_size(
    width: f64,
    height: f64,
    scale: f64,
) -> Option<tauri::PhysicalSize<u32>> {
    if !width.is_finite() || !height.is_finite() || !scale.is_finite() || scale <= 0.0 {
        return None;
    }

    let physical_width = (width * scale).round();
    let physical_height = (height * scale).round();
    if physical_width < f64::from(MIN_RESTORED_WINDOW_WIDTH)
        || physical_height < f64::from(MIN_RESTORED_WINDOW_HEIGHT)
        || physical_width > f64::from(u32::MAX)
        || physical_height > f64::from(u32::MAX)
    {
        return None;
    }

    Some(tauri::PhysicalSize {
        width: physical_width as u32,
        height: physical_height as u32,
    })
}

fn saved_position_is_visible(
    position: tauri::PhysicalPosition<i32>,
    size: tauri::PhysicalSize<u32>,
    monitors: &[tauri::Monitor],
) -> bool {
    let window_left = i64::from(position.x);
    let window_top = i64::from(position.y);
    let window_right = window_left + i64::from(size.width);
    let window_bottom = window_top + i64::from(size.height);

    monitors.iter().any(|monitor| {
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();
        let monitor_left = i64::from(monitor_position.x);
        let monitor_top = i64::from(monitor_position.y);
        let monitor_right = monitor_left + i64::from(monitor_size.width);
        let monitor_bottom = monitor_top + i64::from(monitor_size.height);

        let visible_width = window_right.min(monitor_right) - window_left.max(monitor_left);
        let visible_height = window_bottom.min(monitor_bottom) - window_top.max(monitor_top);
        visible_width >= MIN_VISIBLE_WINDOW_PIXELS && visible_height >= MIN_VISIBLE_WINDOW_PIXELS
    })
}

fn restore_saved_window_geometry(
    window: &tauri::WebviewWindow,
    settings: &crate::app_settings::AppSettings,
) {
    if !settings.custom_window_size {
        return;
    }

    let (Some(saved_width), Some(saved_height)) = (settings.window_width, settings.window_height)
    else {
        return;
    };

    let scale = window.scale_factor().unwrap_or(1.0);
    let Some(size) = sanitized_saved_window_size(saved_width, saved_height, scale) else {
        return;
    };

    let _ = window.set_size(tauri::Size::Physical(size));

    if let (Some(x), Some(y)) = (settings.window_x, settings.window_y) {
        let position = tauri::PhysicalPosition { x, y };
        if window
            .available_monitors()
            .map(|monitors| saved_position_is_visible(position, size, &monitors))
            .unwrap_or(false)
        {
            let _ = window.set_position(tauri::Position::Physical(position));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 后台预热 login shell 环境，避免第一次启动任务时阻塞
            std::thread::spawn(|| {
                crate::app_settings::get_login_shell_path();
            });
            // 读取保存的自定义窗口尺寸和位置并应用
            {
                use tauri::Manager;
                let settings = crate::app_settings::load_settings_internal();
                if let Some(window) = app.get_webview_window("main") {
                    restore_saved_window_geometry(&window, &settings);
                }
            }
            // 关闭窗口时若已启用自定义尺寸，保存当前窗口大小和位置
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let win = window.clone();
                    let closing_after_save = Arc::new(AtomicBool::new(false));
                    window.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            if closing_after_save.swap(true, Ordering::SeqCst) {
                                return;
                            }
                            api.prevent_close();

                            let win_to_close = win.clone();
                            if let (Ok(inner), Ok(scale), Ok(pos)) =
                                (win.inner_size(), win.scale_factor(), win.outer_position())
                            {
                                let lw = inner.width as f64 / scale;
                                let lh = inner.height as f64 / scale;
                                tauri::async_runtime::spawn(async move {
                                    let _ = tauri::async_runtime::spawn_blocking(move || {
                                        let _ = crate::app_settings::persist_window_size_if_enabled(
                                            lw, lh, pos.x, pos.y,
                                        );
                                    })
                                    .await;
                                    let _ = win_to_close.close();
                                });
                            } else {
                                let _ = win_to_close.close();
                            }
                        }
                    });
                }
            }
            Ok(())
        })
        .manage(TaskManager {
            pty_masters: Mutex::new(HashMap::new()),
            pty_writers: Mutex::new(HashMap::new()),
            child_handles: Mutex::new(HashMap::new()),
            cancelled_tasks: Mutex::new(HashSet::new()),
            manually_completed_tasks: Mutex::new(HashSet::new()),
            codex_sessions: Mutex::new(HashMap::new()),
            claude_sessions: Mutex::new(HashMap::new()),
            claimed_session_paths: Mutex::new(HashSet::new()),
            codex_rpc: Arc::new(Mutex::new(None)),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            pty::run_task,
            pty::resume_task,
            pty::cancel_task,
            pty::complete_task,
            pty::get_active_task_ids,
            pty::reset_task_process,
            pty::send_input,
            pty::resize_pty,
            pty::open_shell,
            pty::kill_shell,
            fs::read_dir_entries,
            fs::open_in_system_file_manager,
            fs::read_file_content,
            fs::read_image_preview,
            fs::write_file_content,
            fs::create_file,
            fs::create_directory,
            fs::delete_path,
            fs::list_project_files,
            fs::search_project_files,
            git::generate_commit_message,
            agent_assist::generate_task_name,
            git::git_status,
            git::git_list_branches,
            git::git_create_branch,
            git::git_checkout_branch,
            git::git_log,
            git::git_commit_detail,
            git::git_show_diff,
            git::git_show_file_diff,
            git::git_file_diff,
            git::git_stage,
            git::git_unstage,
            git::git_stage_all,
            git::git_unstage_all,
            git::git_commit,
            git::git_discard_file,
            git::git_discard_all,
            git::git_push,
            git::git_pull,
            git::git_remote_counts,
            git::create_task_worktree,
            git::merge_task_worktree,
            git::remove_task_worktree,
            git::worktree_diff_stats,
            analytics::read_session_metrics,
            session::read_session_messages,
            session::export_session_markdown,
            config::init_project_config,
            config::read_project_config,
            config::write_project_config,
            config::get_agent_config_file_path,
            config::read_agent_config_file,
            config::write_agent_config_file,
            storage::load_projects,
            storage::save_projects,
            storage::load_project_tasks,
            storage::save_project_tasks,
            app_settings::load_app_settings,
            app_settings::save_app_settings,
            app_settings::save_agent_paths,
            app_settings::save_send_shortcut,
            app_settings::save_window_size,
            app_settings::detect_agent_paths,
            app_settings::detect_agent_versions,
            app_settings::detect_agent_versions_for_settings,
            app_settings::get_system_fonts,
            notification::get_notifications,
            notification::mark_notification_read,
            notification::mark_all_notifications_read,
            usage::read_usage_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
