use parking_lot::Mutex;
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::sync::Arc;

use usage::CodexRpcClient;

mod agent_assist;
mod analytics;
mod app_settings;
mod config;
mod event_watcher;
mod fs;
mod git;
mod hooks;
mod notification;
mod platform;
mod pty;
mod session;
mod skills;
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

/// macOS: 把主窗口收起到 Dock(hide 而非退出)。
///
/// 原生全屏窗口独占一个 Space,直接 hide 会留下空 Space(黑屏),必须先退出全屏。
/// 但退出全屏是带动画的异步过渡:动画结束前 `is_fullscreen()` 仍为 true,且刚结束
/// 的一小段时间内 `hide()` 仍会被系统忽略。故先轮询等退出完成,再间隔多次 hide,
/// 让稍晚的调用落在 Space 收起之后生效(对已隐藏窗口为无操作)。
/// 见 tauri-apps/tauri#12056、electron/electron#20263。
#[cfg(target_os = "macos")]
fn hide_window_to_dock(window: tauri::Window) {
    use std::time::Duration;
    if !window.is_fullscreen().unwrap_or(false) {
        let _ = window.hide();
        return;
    }
    let _ = window.set_fullscreen(false);
    std::thread::spawn(move || {
        // 轮询等退出全屏完成(~5s 兜底)。
        let mut exited = false;
        for _ in 0..100 {
            std::thread::sleep(Duration::from_millis(50));
            if !window.is_fullscreen().unwrap_or(false) {
                exited = true;
                break;
            }
        }
        // 仍处于全屏(退出失败/超时)时绝不 hide,否则会重新留下黑屏的空 Space。
        if !exited {
            return;
        }
        // 退出后仍可能短暂忽略 hide,间隔多次覆盖 Space 收起的残余时间。
        for _ in 0..8 {
            std::thread::sleep(Duration::from_millis(120));
            let _ = window.hide();
        }
    });
}

/// 前端 Cmd+W 走此命令收起窗口,复用与关闭按钮一致的全屏感知隐藏逻辑。
/// 仅 macOS 有实际行为(其他平台前端不会触发,见 App.tsx)。
#[tauri::command]
fn hide_main_window(window: tauri::Window) {
    #[cfg(target_os = "macos")]
    hide_window_to_dock(window);
    #[cfg(not(target_os = "macos"))]
    let _ = window;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 后台预热 login shell 环境，避免第一次启动任务时阻塞
            std::thread::spawn(|| {
                crate::app_settings::get_login_shell_path();
            });
            // 安装 hook 脚本与用户级配置注入(失败不阻塞启动,前端可查询状态)。
            // 结果写入缓存,供 run_task/resume_task 的 hook 信任检查零阻塞读取。
            // 之后再跑一次 regenerate:即使 hooks 不可用(如未装 node),只要用户开启
            // force_default_tui 也能保证 Nezha settings 文件按 AppSettings 状态落盘,
            // 避免 pty.rs 把 --settings 指向不存在的路径。
            std::thread::spawn(|| {
                crate::hooks::cache_status(crate::hooks::ensure_installed());
                let _ = crate::hooks::regenerate_claude_settings();
            });
            // 启动 hook 事件文件 watcher
            crate::event_watcher::start(app.handle().clone());
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
        .on_window_event(|window, event| {
            // macOS: 点关闭按钮(红灯)时隐藏窗口而非退出,与 Cmd+W 行为一致;
            // 点 Dock 图标可唤回(见下方 Reopen 处理)。
            // 其他平台没有托盘/Dock 唤回入口,保持默认退出行为,避免窗口隐藏后无法找回。
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                hide_window_to_dock(window.clone());
                api.prevent_close();
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (window, event);
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            hide_main_window,
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
            git::git_stage_files,
            git::git_unstage_files,
            git::git_stage_all,
            git::git_unstage_all,
            git::git_commit,
            git::git_discard_file,
            git::git_discard_files,
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
            app_settings::save_shift_enter_newline,
            app_settings::save_claude_force_default_tui,
            app_settings::save_terminal_scrollback,
            app_settings::detect_agent_paths,
            app_settings::detect_agent_versions_for_settings,
            app_settings::get_system_fonts,
            notification::get_notifications,
            notification::mark_notification_read,
            notification::mark_all_notifications_read,
            usage::read_usage_snapshot,
            hooks::get_hook_status,
            hooks::get_hook_readiness,
            hooks::install_hooks,
            hooks::uninstall_hooks,
            skills::get_skill_hub_config,
            skills::set_skill_hub_path,
            skills::clear_skill_hub,
            skills::list_skills,
            skills::list_skill_installations,
            skills::install_skill,
            skills::uninstall_skill,
            skills::cleanup_installations_for_project,
            skills::delete_skill,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, _event| {
            // macOS: 当窗口被 Cmd+W 隐藏（hide）后，点击 Dock 图标会触发 Reopen，
            // 此时没有可见窗口，需要手动把主窗口重新显示并聚焦。
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let tauri::RunEvent::Reopen { .. } = _event {
                    if let Some(window) = _app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        });
}
