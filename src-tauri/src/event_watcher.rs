//! 监听 hook 脚本写入的 events.jsonl,把事件投递给前端。
//!
//! 工作机制:
//! - 一个长驻线程,200ms 轮询 `~/.nezha/events/<task_id>/events.jsonl`
//! - 每个文件维护 byte offset,只读增量行
//! - 解析每行 JSON 后,按 event 字段 dispatch:
//!   * SessionStart → 注册 session 到 TaskManager + emit `task-session`
//!   * Notification(Claude) → emit `task-status` = input_required
//!   * 其它事件保留(未来扩展用)
//!
//! 轮询(而非 notify::Watcher)的取舍:实现简单、跨平台一致、200ms 间隔
//! 对响应延迟来说足够低,且 stat 调用成本可忽略。

use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

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
    tokio::task::spawn_blocking(move || run_loop(app));
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
        "Notification" => handle_notification(app, ev),
        // UserPromptSubmit / Stop / SubagentStop 暂不主动 emit,
        // Stop 让 PTY exit monitor 处理 done/failed 状态
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

fn handle_notification(app: &AppHandle, ev: &HookEvent) {
    // Claude 的 Notification 事件 = 等待用户输入
    let tm = app.state::<TaskManager>();
    if !tm.child_handles.lock().contains_key(&ev.task_id) {
        return;
    }
    let _ = app.emit(
        "task-status",
        serde_json::json!({ "task_id": ev.task_id, "status": "input_required" }),
    );
}

/// 任务终态后清理对应目录(由 finalize_task_exit 调用)。
pub fn cleanup_task_events(task_id: &str) {
    if let Ok(dir) = crate::hooks::events_dir_for(task_id) {
        let _ = fs::remove_dir_all(dir);
    }
}
