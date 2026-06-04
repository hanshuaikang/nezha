//! 监听 hook 脚本写入的 events.jsonl,把事件投递给前端。
//!
//! 工作机制:
//! - 一个长驻线程,200ms 轮询 `~/.nezha/events/<task_id>/events.jsonl`
//! - 每个文件维护 byte offset,只读增量行
//! - 解析每行 JSON 后,按 event 字段 dispatch:
//!   * SessionStart → 注册 session 到 TaskManager + emit `task-session`
//!   * Notification(Claude) / PermissionRequest(Codex) → `task-status` = input_required
//!   * UserPromptSubmit / PostToolUse → `task-status` = running(清除 input_required)
//!   * Stop(Claude & Codex)→ `task-status` = input_required(交互式 REPL 一轮结束、等待
//!     用户;进程不退出,PTY exit monitor 不会触发)。Claude 不能靠 Notification 兜底——
//!     其"空闲等待输入" Notification 约 60s 后才触发,会让角标晚一分钟出现。
//!   * SubagentStop → 不主动 emit,交给 PTY exit monitor 处理终态
//!
//! 事件驱动(而非固定间隔轮询):空闲时几乎零唤醒,有写入时近乎即时响应,
//! 把过去最坏 200ms 的轮询等待砍掉。watcher 初始化失败时回退到固定间隔
//! 轮询(FALLBACK_INTERVAL),并以同一间隔作为兜底唤醒,防止漏事件导致状态卡住。

use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::OnceLock;
use std::thread;
use std::time::Duration;

use parking_lot::Mutex;
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::session::{ClaudeSessionInfo, CodexSessionInfo};
use crate::TaskManager;

/// watcher 不可用(初始化失败)时的回退轮询间隔;watcher 正常时也用作兜底唤醒
/// 间隔——即便漏掉某次文件事件,最坏也在此间隔内被重新扫描到。
const FALLBACK_INTERVAL: Duration = Duration::from_secs(1);

#[derive(Debug, Deserialize)]
struct HookEvent {
    #[serde(default)]
    task_id: String,
    #[serde(default)]
    agent: String,
    #[serde(default)]
    event: String,
    #[serde(default)]
    session_id: String,
    #[serde(default)]
    transcript_path: String,
}

pub fn start(app: AppHandle) {
    // 在独立的长驻线程上跑轮询循环。不能用 tokio::spawn_blocking——
    // setup() 闭包运行在主线程,此时尚无 Tokio runtime 上下文,会 panic。
    thread::spawn(move || run_loop(app));
}

fn run_loop(app: AppHandle) {
    use notify::{RecursiveMode, Watcher};

    let events_root = match crate::hooks::events_root() {
        Ok(p) => p,
        Err(_) => return,
    };
    // 启动清理:app 上次若被强杀,可能残留 events 目录;此刻尚无任务在跑,整目录清空
    // 是安全的。否则下次启动 offset 从 0 起会重放旧的 SessionStart,为已结束的任务
    // 重新注册 session 并 emit `task-session`。先删后建,确保从干净状态开始。
    let _ = fs::remove_dir_all(&events_root);
    let _ = fs::create_dir_all(&events_root);

    // 递归监听整个 events 根目录:新任务子目录与其 events.jsonl 的创建/追加都会
    // 触发事件,驱动一次增量扫描。初始化失败时 watcher_opt 为 None,回退固定间隔轮询。
    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher_opt = notify::RecommendedWatcher::new(tx, notify::Config::default())
        .ok()
        .and_then(|mut w| {
            w.watch(&events_root, RecursiveMode::Recursive).ok()?;
            Some(w)
        });

    let mut offsets: HashMap<PathBuf, u64> = HashMap::new();

    loop {
        // 等待文件系统事件:事件驱动 → 空闲时几乎零唤醒,有写入时近乎即时唤醒;
        // 兜底超时确保即便漏事件最坏也在 FALLBACK_INTERVAL 内重扫。watcher 不可用则轮询。
        if watcher_opt.is_some() {
            match rx.recv_timeout(FALLBACK_INTERVAL) {
                Ok(_) | Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => watcher_opt = None,
            }
            // 合并同一批写入产生的多个事件,避免一次写入触发多轮扫描
            while rx.try_recv().is_ok() {}
        } else {
            thread::sleep(FALLBACK_INTERVAL);
        }

        let Ok(entries) = fs::read_dir(&events_root) else {
            continue;
        };
        let mut seen: Vec<PathBuf> = Vec::new();
        for entry in entries.flatten() {
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            let file = dir.join("events.jsonl");
            if !file.is_file() {
                continue;
            }
            seen.push(file.clone());
            let offset = *offsets.entry(file.clone()).or_insert(0);
            if let Some(new_offset) = read_and_dispatch(&app, &file, offset) {
                offsets.insert(file, new_offset);
            }
        }
        // 清理已消失的文件 offset
        offsets.retain(|path, _| seen.iter().any(|p| p == path));
    }
}

fn read_and_dispatch(app: &AppHandle, path: &PathBuf, offset: u64) -> Option<u64> {
    let mut file = fs::File::open(path).ok()?;
    let size = file.metadata().ok()?.len();
    if size <= offset {
        return Some(offset);
    }
    file.seek(SeekFrom::Start(offset)).ok()?;
    let mut buf = String::new();
    file.read_to_string(&mut buf).ok()?;

    // 仅处理整行(以 \n 结尾的),残行留待下次循环
    let mut last_complete_end = 0usize;
    for (idx, ch) in buf.char_indices() {
        if ch == '\n' {
            let line = &buf[last_complete_end..idx];
            last_complete_end = idx + 1;
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(ev) = serde_json::from_str::<HookEvent>(line) {
                dispatch(app, &ev);
            }
        }
    }
    Some(offset + last_complete_end as u64)
}

fn dispatch(app: &AppHandle, ev: &HookEvent) {
    if ev.task_id.is_empty() {
        return;
    }
    match ev.event.as_str() {
        "SessionStart" => handle_session_start(app, ev),
        // Claude 的 Notification 与 Codex 的 PermissionRequest 都表示"等待用户输入"
        // (Claude 工具审批/提问通知;Codex 工具审批/网络升级请求)。
        "Notification" | "PermissionRequest" => emit_active_status(app, ev, "input_required"),
        // 重新回到工作状态、清除 input_required 的两条信号:
        // - UserPromptSubmit:用户提交了下一条 prompt。
        // - PostToolUse:工具执行成功后触发(ask 模式下即审批通过后)。工具审批
        //   不会触发 UserPromptSubmit,必须靠 PostToolUse 才能把 input_required 复位。
        "UserPromptSubmit" | "PostToolUse" => emit_active_status(app, ev, "running"),
        // Claude 与 Codex 都以交互式 REPL 方式启动,一轮结束后进程不退出、停在等待用户
        // 下一条输入,PTY exit monitor 不会触发终态;此时 Stop 表示"本轮结束、等待用户
        // 下一步",映射为 input_required(需要关注)。
        // 注意:Claude 的 Stop 必须在此处理,不能依赖 Notification 兜底——Claude Code 的
        // "空闲等待输入" Notification 是在空闲约 60s 后才触发(实测 Stop→Notification 恰为
        // +60s),会让角标晚整整一分钟才出现。需要工具审批时的 Notification 才是即时触发的
        // (即 ask 模式很快的原因)。emit_active_status 的 child_handles 存活守卫确保进程
        // 真正退出后不会误发,真正退出仍交给 PTY exit monitor。
        "Stop" => emit_active_status(app, ev, "input_required"),
        // SubagentStop(子代理结束)主代理仍在工作,不主动 emit。
        _ => {}
    }
}

fn handle_session_start(app: &AppHandle, ev: &HookEvent) {
    if ev.session_id.is_empty() {
        return;
    }
    let tm = app.state::<TaskManager>();
    let session_path = ev.transcript_path.clone();

    // 已注册过且 session_id 一致则跳过,避免重复 emit
    let already = match ev.agent.as_str() {
        "codex" => tm
            .codex_sessions
            .lock()
            .get(&ev.task_id)
            .map(|info| info.session_id == ev.session_id)
            .unwrap_or(false),
        _ => tm
            .claude_sessions
            .lock()
            .get(&ev.task_id)
            .map(|info| info.session_id == ev.session_id && !info.is_placeholder)
            .unwrap_or(false),
    };
    if already {
        return;
    }

    if ev.agent == "codex" {
        tm.codex_sessions.lock().insert(
            ev.task_id.clone(),
            CodexSessionInfo {
                session_id: ev.session_id.clone(),
                session_path: session_path.clone(),
            },
        );
    } else {
        tm.claude_sessions.lock().insert(
            ev.task_id.clone(),
            ClaudeSessionInfo {
                session_id: ev.session_id.clone(),
                session_path: session_path.clone(),
                is_placeholder: false,
            },
        );
    }
    if !session_path.is_empty() {
        let mut claimed = tm.claimed_session_paths.lock();
        claimed.insert(session_path.clone());
    }

    let _ = app.emit(
        "task-session",
        serde_json::json!({
            "task_id": ev.task_id,
            "session_id": ev.session_id,
            "session_path": session_path,
        }),
    );
}

/// 记录每个 task 最近一次由 hook 广播的状态。PostToolUse 会按每次工具调用
/// 高频触发,若每次都 emit `running` 会导致前端无谓的 setState/重渲染,这里做去重。
static LAST_STATUS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn last_status() -> &'static Mutex<HashMap<String, String>> {
    LAST_STATUS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 仅当任务进程仍存活(本进程持有子进程句柄)且状态相比上次有变化时才广播,
/// 避免给已退出的任务发送 input_required/running,也避免高频事件刷屏。
fn emit_active_status(app: &AppHandle, ev: &HookEvent, status: &str) {
    let tm = app.state::<TaskManager>();
    if !tm.child_handles.lock().contains_key(&ev.task_id) {
        return;
    }
    {
        let mut last = last_status().lock();
        if last.get(&ev.task_id).map(String::as_str) == Some(status) {
            return;
        }
        last.insert(ev.task_id.clone(), status.to_string());
    }
    let _ = app.emit(
        "task-status",
        serde_json::json!({ "task_id": ev.task_id, "status": status }),
    );
}

/// 任务终态后清理对应目录(由 finalize_task_exit 调用)。
pub fn cleanup_task_events(task_id: &str) {
    last_status().lock().remove(task_id);
    if let Ok(dir) = crate::hooks::events_dir_for(task_id) {
        let _ = fs::remove_dir_all(dir);
    }
}
