//! 监听 hook 脚本写入的 events.jsonl,把事件投递给前端。
//!
//! 工作机制:
//! - 一个长驻线程,200ms 轮询 `~/.nezha/events/<task_id>/events.jsonl`
//! - 每个文件维护 byte offset,只读增量行
//! - 解析每行 JSON 后,按 event 字段 dispatch:
//!   * SessionStart → 注册 session 到 TaskManager + emit `task-session`
//!   * PermissionRequest(Codex) / Notification(Claude permission_prompt、elicitation_dialog)
//!     → `task-status` = input_required(agent 真正需要用户介入:工具审批、问询)
//!   * UserPromptSubmit / AgentStart / TurnStart / PostToolUse → `task-status` = running
//!     (清除 input/awaiting)
//!   * Stop(Claude / Codex / Pi)→ `task-status` = awaiting_review(交互式 REPL 一轮结束、
//!     等待用户验收;进程不退出,PTY exit monitor 不会触发)。Claude 不能靠 Notification
//!     兜底——其"空闲等待输入" Notification 约 60s 后才触发,会让角标晚一分钟才出现。
//!     语义上 Stop 表示"agent 自认为做完了",和工具审批是不同信号,前端看板要分列。
//!     PTY 真正退出后由 finalize_task_exit 覆写为 done/failed,看板就会移出该列。
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

use crate::session::{ClaudeSessionInfo, CodexSessionInfo, PiSessionInfo};
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
    #[serde(default)]
    notification_type: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum HookSessionTarget {
    Claude,
    Codex,
    Pi,
}

fn session_target_for_agent(agent: &str) -> HookSessionTarget {
    match agent {
        "codex" => HookSessionTarget::Codex,
        "pi" => HookSessionTarget::Pi,
        _ => HookSessionTarget::Claude,
    }
}

fn status_for_hook_event(event: &str) -> Option<&'static str> {
    match event {
        "PermissionRequest" => Some("input_required"),
        "UserPromptSubmit" | "AgentStart" | "TurnStart" | "PostToolUse" => Some("running"),
        "Stop" => Some("awaiting_review"),
        _ => None,
    }
}

fn should_skip_session_start(
    target: HookSessionTarget,
    existing_session_id: &str,
    existing_session_path: &str,
    existing_is_placeholder: bool,
    next_session_id: &str,
    next_session_path: &str,
) -> bool {
    if existing_session_id != next_session_id {
        return false;
    }
    if target == HookSessionTarget::Claude && existing_is_placeholder {
        return false;
    }
    if next_session_path.is_empty() {
        return true;
    }
    existing_session_path == next_session_path
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
    if ev.event == "SessionStart" {
        handle_session_start(app, ev);
        return;
    }
    if ev.event == "Notification" {
        if notification_requires_attention(ev) {
            emit_active_status(app, ev, "input_required");
        }
        return;
    }
    if let Some(status) = status_for_hook_event(&ev.event) {
        emit_active_status(app, ev, status);
    }
}

fn notification_requires_attention(ev: &HookEvent) -> bool {
    match ev.notification_type.as_str() {
        // 旧版 bridge 未记录 notification_type;保留旧行为,避免升级过程中漏掉审批。
        "" => true,
        "permission_prompt" | "elicitation_dialog" => true,
        "idle_prompt" | "auth_success" | "elicitation_complete" | "elicitation_response" => false,
        // 未知新类型宁可保守标记为需要关注,后续再按实测收敛。
        _ => true,
    }
}

fn handle_session_start(app: &AppHandle, ev: &HookEvent) {
    if ev.session_id.is_empty() {
        return;
    }
    let tm = app.state::<TaskManager>();
    let session_path = ev.transcript_path.clone();

    // 已注册过且 session_id / session_path 一致则跳过,避免重复 emit。
    // 某些 agent 可能先上报 session_id、后上报 transcript_path；这种路径补全必须放行。
    let target = session_target_for_agent(&ev.agent);
    let already = match target {
        HookSessionTarget::Codex => tm
            .codex_sessions
            .lock()
            .get(&ev.task_id)
            .map(|info| {
                should_skip_session_start(
                    target,
                    &info.session_id,
                    &info.session_path,
                    false,
                    &ev.session_id,
                    &session_path,
                )
            })
            .unwrap_or(false),
        HookSessionTarget::Pi => tm
            .pi_sessions
            .lock()
            .get(&ev.task_id)
            .map(|info| {
                should_skip_session_start(
                    target,
                    &info.session_id,
                    &info.session_path,
                    false,
                    &ev.session_id,
                    &session_path,
                )
            })
            .unwrap_or(false),
        HookSessionTarget::Claude => tm
            .claude_sessions
            .lock()
            .get(&ev.task_id)
            .map(|info| {
                should_skip_session_start(
                    target,
                    &info.session_id,
                    &info.session_path,
                    info.is_placeholder,
                    &ev.session_id,
                    &session_path,
                )
            })
            .unwrap_or(false),
    };
    if already {
        return;
    }

    match target {
        HookSessionTarget::Codex => {
            tm.codex_sessions.lock().insert(
                ev.task_id.clone(),
                CodexSessionInfo {
                    session_id: ev.session_id.clone(),
                    session_path: session_path.clone(),
                },
            );
        }
        HookSessionTarget::Pi => {
            tm.pi_sessions.lock().insert(
                ev.task_id.clone(),
                PiSessionInfo {
                    session_id: ev.session_id.clone(),
                    session_path: session_path.clone(),
                },
            );
        }
        HookSessionTarget::Claude => {
            tm.claude_sessions.lock().insert(
                ev.task_id.clone(),
                ClaudeSessionInfo {
                    session_id: ev.session_id.clone(),
                    session_path: session_path.clone(),
                    is_placeholder: false,
                },
            );
        }
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
/// 避免给已退出的任务发送 input_required/awaiting_review/running,也避免高频事件刷屏。
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pi_events_map_to_expected_statuses() {
        assert_eq!(status_for_hook_event("AgentStart"), Some("running"));
        assert_eq!(status_for_hook_event("TurnStart"), Some("running"));
        assert_eq!(status_for_hook_event("PostToolUse"), Some("running"));
        assert_eq!(status_for_hook_event("Stop"), Some("awaiting_review"));
    }

    #[test]
    fn pi_session_start_targets_pi_session_store() {
        assert_eq!(session_target_for_agent("pi"), HookSessionTarget::Pi);
        assert_eq!(session_target_for_agent("codex"), HookSessionTarget::Codex);
        assert_eq!(
            session_target_for_agent("claude"),
            HookSessionTarget::Claude
        );
    }

    #[test]
    fn session_start_allows_later_path_upgrade_for_same_session() {
        assert!(!should_skip_session_start(
            HookSessionTarget::Pi,
            "sid",
            "",
            false,
            "sid",
            "/tmp/session.jsonl",
        ));
        assert!(should_skip_session_start(
            HookSessionTarget::Pi,
            "sid",
            "/tmp/session.jsonl",
            false,
            "sid",
            "/tmp/session.jsonl",
        ));
        assert!(should_skip_session_start(
            HookSessionTarget::Pi,
            "sid",
            "",
            false,
            "sid",
            "",
        ));
    }

    #[test]
    fn claude_placeholder_session_start_is_not_skipped() {
        assert!(!should_skip_session_start(
            HookSessionTarget::Claude,
            "sid",
            "/tmp/session.jsonl",
            true,
            "sid",
            "/tmp/session.jsonl",
        ));
    }

    fn hook_event(event: &str) -> HookEvent {
        HookEvent {
            task_id: "task-1".to_string(),
            agent: "claude".to_string(),
            event: event.to_string(),
            session_id: String::new(),
            transcript_path: String::new(),
            notification_type: String::new(),
        }
    }

    #[test]
    fn claude_idle_notification_does_not_request_attention() {
        let mut ev = hook_event("Notification");
        ev.notification_type = "idle_prompt".to_string();
        assert!(!notification_requires_attention(&ev));
    }

    #[test]
    fn claude_permission_notification_requests_attention() {
        let mut ev = hook_event("Notification");
        ev.notification_type = "permission_prompt".to_string();
        assert!(notification_requires_attention(&ev));
    }

    #[test]
    fn legacy_notification_without_type_keeps_old_attention_behavior() {
        let ev = hook_event("Notification");
        assert!(notification_requires_attention(&ev));
    }
}
