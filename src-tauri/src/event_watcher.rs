//! 监听 hook 脚本写入的 events.jsonl,把事件投递给前端。
//!
//! 工作机制:
//! - 一个长驻线程,200ms 轮询 `~/.nezha/events/<task_id>/events.jsonl`
//! - 每个文件维护 byte offset,只读增量行
//! - 解析每行 JSON 后,按 event 字段 dispatch:
//!   * SessionStart → 注册 session 到 TaskManager + emit `task-session`
//!   * Notification(Claude) / PermissionRequest(Codex) → `task-status` = input_required
//!   * UserPromptSubmit / PostToolUse → `task-status` = running(清除 input_required)
//!   * Stop / SubagentStop → 不主动 emit,交给 PTY exit monitor 处理终态
//!
//! 轮询(而非 notify::Watcher)的取舍:实现简单、跨平台一致、200ms 间隔
//! 对响应延迟来说足够低,且 stat 调用成本可忽略。

use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::OnceLock;
use std::thread;
use std::time::Duration;

use parking_lot::Mutex;
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::session::{ClaudeSessionInfo, CodexSessionInfo};
use crate::TaskManager;

const POLL_INTERVAL: Duration = Duration::from_millis(200);

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
    let events_root = match crate::hooks::events_root() {
        Ok(p) => p,
        Err(_) => return,
    };
    let _ = fs::create_dir_all(&events_root);

    let mut offsets: HashMap<PathBuf, u64> = HashMap::new();

    loop {
        thread::sleep(POLL_INTERVAL);
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
        // Stop / SubagentStop 暂不主动 emit,Stop 让 PTY exit monitor 处理 done/failed 状态
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
