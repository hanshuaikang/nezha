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
mod fs_watcher;
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

    /// 退出前终止所有仍在运行的任务/Shell 子进程。
    /// 托盘「退出」走 `app.exit(0)`(即 `std::process::exit`,不跑 Drop),
    /// 没有这一步会把正在跑的 claude/codex 子进程留成孤儿,继续占用 CPU / API 额度。
    /// 先 clone 出 Arc 再逐个 kill,避免持有 `child_handles` 锁期间做阻塞调用。
    /// 唯一调用方是 Windows 托盘的「退出」菜单(setup_tray),与其保持同一 cfg,
    /// 避免非 Windows 构建报 dead_code。
    #[cfg(target_os = "windows")]
    pub(crate) fn kill_all_children(&self) {
        let children: Vec<_> = self.child_handles.lock().values().cloned().collect();
        for arc in children {
            if let Ok(mut child) = arc.lock() {
                let _ = child.kill();
            }
        }
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

/// 把主窗口重新显示并聚焦(唤回)。
/// 窗口可能同时处于 hidden + minimized,故先 unminimize 再 show + focus。
/// Windows: 托盘左键 / 托盘菜单「显示」/ 单实例第二实例唤回都走这里。
/// macOS: 点 Dock 图标(Reopen)唤回走这里。
#[cfg(any(target_os = "macos", target_os = "windows"))]
fn show_main_window(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Windows 托盘菜单构建。文案由调用方提供,翻译唯一事实源保持在前端 src/i18n.tsx:
/// 启动时用英文兜底(见 TRAY_FALLBACK_LABELS),webview 挂载后与语言切换时由
/// update_tray_menu 命令传入当前语言文案整体重建。
/// 菜单项 id("show"/"quit")固定不变,事件处理无需随语言调整。
#[cfg(target_os = "windows")]
fn build_tray_menu(
    app: &tauri::AppHandle,
    show_label: &str,
    quit_label: &str,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{Menu, MenuItem};

    let show_item = MenuItem::with_id(app, "show", show_label, true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;
    Menu::with_items(app, &[&show_item, &quit_item])
}

/// 托盘创建时的兜底文案(英文,与 i18n.tsx 词典缺失时回退 en 的约定一致)。
/// 后端无法读取 webview localStorage 中的语言偏好,启动时只能兜底;
/// I18nProvider 挂载后会立即通过 update_tray_menu 覆盖为实际语言,
/// 兜底文案仅在 webview 加载完成前的短暂窗口(或前端加载失败时)可见。
#[cfg(target_os = "windows")]
const TRAY_FALLBACK_LABELS: (&str, &str) = ("Show Nezha", "Quit");

/// 前端在语言初始化/切换时调用(见 src/i18n.tsx 的 language effect),
/// 用当前语言文案重建 Windows 托盘菜单;其他平台为 no-op。
/// 文案由前端 t() 词典生成后作为参数传入,Rust 侧不持有 zh/en 翻译。
/// 原生菜单是线程亲和对象,统一切回主线程重建,不在命令线程直接操作。
#[tauri::command]
fn update_tray_menu(app: tauri::AppHandle, show_label: String, quit_label: String) {
    #[cfg(target_os = "windows")]
    {
        let handle = app.clone();
        let dispatched = app.run_on_main_thread(move || {
            let Some(tray) = handle.tray_by_id("main") else {
                // setup_tray 构建失败时托盘不存在(setup 阶段会直接报错),此处无可更新对象。
                return;
            };
            let applied = build_tray_menu(&handle, &show_label, &quit_label)
                .and_then(|menu| tray.set_menu(Some(menu)));
            if let Err(_e) = applied {
                #[cfg(debug_assertions)]
                eprintln!("[tray] 更新托盘菜单失败: {_e}");
            }
        });
        if let Err(_e) = dispatched {
            #[cfg(debug_assertions)]
            eprintln!("[tray] 无法调度到主线程更新托盘菜单: {_e}");
        }
    }
    #[cfg(not(target_os = "windows"))]
    let _ = (app, show_label, quit_label);
}

/// Windows: 创建系统托盘图标。
/// 左键点击托盘图标唤回窗口;右键菜单提供「显示/退出」。
/// 关闭按钮(X)只隐藏窗口(见 on_window_event),真正退出走托盘菜单的「退出」。
#[cfg(target_os = "windows")]
fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    use tauri::Manager;

    let menu = build_tray_menu(app, TRAY_FALLBACK_LABELS.0, TRAY_FALLBACK_LABELS.1)?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Nezha")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => {
                // 关闭按钮只隐藏窗口,「退出」是关到托盘后的主要退出路径。
                // app.exit(0) 走 std::process::exit 不跑 Drop,先显式杀掉任务子进程,
                // 否则正在跑的 claude/codex 会变孤儿。
                app.state::<TaskManager>().kill_all_children();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    } else {
        // icon 缺失时托盘无图标 → 窗口 hide 后通知区几乎不可见、难以找回。
        // 正常 bundle 里 default_window_icon() 恒为 Some(见 tauri.conf.json icons),
        // 这里只在异常配置/加载失败时留一条 dev 日志,避免变成静默黑箱。
        #[cfg(debug_assertions)]
        eprintln!(
            "[tray] default_window_icon() 返回 None:托盘将无图标,关到托盘后窗口可能难以找回"
        );
    }

    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Windows: 单实例守卫必须作为第一个插件注册。关闭到托盘后进程仍常驻,用户从开始
    // 菜单/桌面图标再次打开会启动第二个完整后端实例——两套 fs_watcher/event_watcher/
    // hook watcher 对同一批 ~/.nezha 文件并发运行,导致通知重复、tasks.json 被
    // last-writer-wins 写坏。第二个实例通过此回调把已有窗口唤回并聚焦后自动退出。
    // macOS 由 LaunchServices 天然单实例,无需此守卫。
    #[cfg(target_os = "windows")]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        show_main_window(app);
    }));

    builder
        .setup(|app| {
            // Windows:后台线程预加载随包侧载的新版 ConPTY(读 settings + LoadLibrary
            // + 拉起 OpenConsole.exe 自检共 50-150ms,不能阻塞窗口首帧)。
            // 部分系统内置 ConPTY 不把全屏 TUI 输出送入 scrollback(滚轮无法回滚);
            // portable-pty 创建 PTY 时会优先复用预加载的 conpty.dll,缺失/失败/
            // 自检不过均自动回退系统版。pty.rs 在首次 openpty 前通过
            // wait_conpty_preload() 等待完成,保证时序。详见 platform/windows.rs 与
            // src-tauri/resources/conpty/README.md。
            #[cfg(windows)]
            {
                use tauri::Manager;
                if let Ok(resource_dir) = app.path().resource_dir() {
                    crate::platform::spawn_conpty_preload(resource_dir);
                }
            }
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
            // 文件树的 fs 事件监听(watch_dir/unwatch_dir 的托管状态与防抖线程)
            crate::fs_watcher::init(app);
            // Windows: 创建系统托盘图标(关闭窗口时收起到托盘,而非退出)
            #[cfg(target_os = "windows")]
            setup_tray(app.handle())?;
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
            // Windows: 点关闭按钮(X)时隐藏窗口到托盘而非退出;
            // 从托盘图标左键点击或右键菜单「显示 Nezha」唤回,「退出」才真正结束进程。
            #[cfg(target_os = "windows")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
            // 其他平台(Linux)没有托盘唤回入口,保持默认退出行为,避免窗口隐藏后无法找回。
            #[cfg(not(any(target_os = "macos", target_os = "windows")))]
            let _ = (window, event);
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            hide_main_window,
            update_tray_menu,
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
            fs::read_compact_dir_entries,
            fs_watcher::watch_dir,
            fs_watcher::unwatch_dir,
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
            git::discover_git_roots,
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
            app_settings::save_use_sideloaded_conpty,
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
            // 复用 show_main_window(与托盘唤回同一实现),避免两处唤回逻辑分叉。
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                show_main_window(_app_handle);
            }
        });
}
