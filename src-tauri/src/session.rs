use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{BufReader, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant, SystemTime};
use tauri::{AppHandle, Emitter, Manager};

use crate::TaskManager;

#[derive(Clone)]
pub(crate) struct CodexSessionInfo {
    pub(crate) session_id: String,
    pub(crate) session_path: String,
}

#[derive(Clone)]
pub(crate) struct ClaudeSessionInfo {
    pub(crate) session_id: String,
    pub(crate) session_path: String,
}

// ── 公共辅助函数 ──────────────────────────────────────────────────────────────

pub(crate) fn emit_task_status(app: &AppHandle, task_id: &str, status: &str) {
    let _ = app.emit(
        "task-status",
        serde_json::json!({ "task_id": task_id, "status": status }),
    );
}

fn emit_active_task_status(app: &AppHandle, task_id: &str, status: &str) {
    if is_task_active(app, task_id) {
        emit_task_status(app, task_id, status);
    }
}

pub(crate) fn is_task_active(app: &AppHandle, task_id: &str) -> bool {
    let tm = app.state::<TaskManager>();
    if tm.child_handles.lock().contains_key(task_id) {
        return true;
    }

    let has_codex_session = tm
        .codex_sessions
        .lock()
        .get(task_id)
        .map(|info| !info.session_id.is_empty() && !info.session_path.is_empty())
        .unwrap_or(false);

    if has_codex_session {
        return true;
    }

    let has_claude_session = tm
        .claude_sessions
        .lock()
        .get(task_id)
        .map(|info| !info.session_id.is_empty() && !info.session_path.is_empty())
        .unwrap_or(false);

    has_claude_session
}

fn claim_session_path(app: &AppHandle, path: &str) -> bool {
    let tm = app.state::<TaskManager>();
    let mut claimed = tm.claimed_session_paths.lock();
    if claimed.contains(path) {
        return false;
    }
    claimed.insert(path.to_string());
    true
}

fn read_session_lines_since(
    session_path: &Path,
    offset: &mut u64,
    partial: &mut String,
) -> Result<Vec<String>, std::io::Error> {
    let mut file = File::open(session_path)?;
    file.seek(SeekFrom::Start(*offset))?;

    let mut chunk = String::new();
    file.read_to_string(&mut chunk)?;
    *offset += chunk.as_bytes().len() as u64;

    if chunk.is_empty() {
        return Ok(Vec::new());
    }

    partial.push_str(&chunk);
    let complete_len = if partial.ends_with('\n') {
        partial.len()
    } else {
        partial.rfind('\n').map(|idx| idx + 1).unwrap_or(0)
    };

    if complete_len == 0 {
        return Ok(Vec::new());
    }

    let completed = partial[..complete_len].to_string();
    let remaining = partial[complete_len..].to_string();
    *partial = remaining;

    Ok(completed.lines().map(|line| line.to_string()).collect())
}

fn session_modified_at(path: &Path) -> SystemTime {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH)
}

// ── Codex 会话监视器 ──────────────────────────────────────────────────────────

fn codex_sessions_roots(project_path: &str) -> Vec<PathBuf> {
    let mut roots = vec![PathBuf::from(project_path).join(".codex").join("sessions")];
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        let home_root = home.join(".codex").join("sessions");
        if !roots.iter().any(|root| root == &home_root) {
            roots.push(home_root);
        }
    }
    roots
}

fn collect_session_files_from_roots(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for root in roots {
        collect_session_files(root, &mut files);
    }
    files
}

fn collect_session_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_session_files(&path, out);
            continue;
        }

        let is_rollout_jsonl = path
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.starts_with("rollout-") && name.ends_with(".jsonl"))
            .unwrap_or(false);

        if is_rollout_jsonl {
            out.push(path);
        }
    }
}

fn watch_codex_session(
    app: AppHandle,
    task_id: String,
    session_path: PathBuf,
    project_path: PathBuf,
) {
    use notify::{RecursiveMode, Watcher};

    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher_opt = notify::RecommendedWatcher::new(tx, notify::Config::default())
        .ok()
        .and_then(|mut w| {
            w.watch(&session_path, RecursiveMode::NonRecursive).ok()?;
            Some(w)
        });

    let mut offset = 0u64;
    let mut partial = String::new();
    let mut waiting_for_user = false;
    let mut pending_confirmation_calls = HashSet::new();
    let mut awaiting_user_reply = false;

    while is_task_active(&app, &task_id) {
        if let Ok(lines) = read_session_lines_since(&session_path, &mut offset, &mut partial) {
            for line in lines {
                process_codex_session_line(
                    &app,
                    &task_id,
                    &line,
                    &project_path,
                    &mut waiting_for_user,
                    &mut pending_confirmation_calls,
                    &mut awaiting_user_reply,
                );
            }
        }

        if watcher_opt.is_some() {
            match rx.recv_timeout(Duration::from_secs(1)) {
                Ok(_) | Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => watcher_opt = None,
            }
        } else {
            thread::sleep(Duration::from_millis(400));
        }
    }
}

fn process_codex_session_line(
    app: &AppHandle,
    task_id: &str,
    line: &str,
    project_path: &Path,
    waiting_for_user: &mut bool,
    pending_confirmation_calls: &mut HashSet<String>,
    awaiting_user_reply: &mut bool,
) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
        return;
    };

    let event_type = value.get("type").and_then(serde_json::Value::as_str);
    let payload = value.get("payload");

    match event_type {
        Some("response_item") => {
            let payload_type = payload
                .and_then(|item| item.get("type"))
                .and_then(serde_json::Value::as_str);

            match payload_type {
                Some("function_call") => {
                    let name = payload
                        .and_then(|item| item.get("name"))
                        .and_then(serde_json::Value::as_str);
                    let call_id = payload
                        .and_then(|item| item.get("call_id"))
                        .and_then(serde_json::Value::as_str);
                    let arguments = payload
                        .and_then(|item| item.get("arguments"))
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("");

                    if name == Some("request_user_input") {
                        *awaiting_user_reply = true;
                    } else if name
                        .map(|tool| tool_call_requires_confirmation(tool, arguments, project_path))
                        .unwrap_or(false)
                    {
                        if let Some(call_id) = call_id {
                            pending_confirmation_calls.insert(call_id.to_string());
                        } else {
                            *awaiting_user_reply = true;
                        }
                    }
                    sync_waiting_for_user(
                        app,
                        task_id,
                        waiting_for_user,
                        pending_confirmation_calls,
                        *awaiting_user_reply,
                    );
                }
                Some("function_call_output") => {
                    if let Some(call_id) = payload
                        .and_then(|item| item.get("call_id"))
                        .and_then(serde_json::Value::as_str)
                    {
                        pending_confirmation_calls.remove(call_id);
                    }

                    let output = payload
                        .and_then(|item| item.get("output"))
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("");
                    if output.starts_with("aborted by user after") {
                        *awaiting_user_reply = true;
                    }
                    sync_waiting_for_user(
                        app,
                        task_id,
                        waiting_for_user,
                        pending_confirmation_calls,
                        *awaiting_user_reply,
                    );
                }
                Some("custom_tool_call") => {
                    let status = payload
                        .and_then(|item| item.get("status"))
                        .and_then(serde_json::Value::as_str);
                    let call_id = payload
                        .and_then(|item| item.get("call_id"))
                        .and_then(serde_json::Value::as_str);

                    if matches!(status, Some("completed") | Some("failed")) {
                        if let Some(call_id) = call_id {
                            pending_confirmation_calls.remove(call_id);
                        }
                        sync_waiting_for_user(
                            app,
                            task_id,
                            waiting_for_user,
                            pending_confirmation_calls,
                            *awaiting_user_reply,
                        );
                    }
                }
                Some("message") => {
                    let role = payload
                        .and_then(|item| item.get("role"))
                        .and_then(serde_json::Value::as_str);
                    if role == Some("user") {
                        *awaiting_user_reply = false;
                    } else if role == Some("assistant")
                        && assistant_message_requests_user_input(payload)
                    {
                        *awaiting_user_reply = true;
                    }
                    sync_waiting_for_user(
                        app,
                        task_id,
                        waiting_for_user,
                        pending_confirmation_calls,
                        *awaiting_user_reply,
                    );
                }
                _ => {}
            }
        }
        Some("event_msg") => {
            let payload_type = payload
                .and_then(|item| item.get("type"))
                .and_then(serde_json::Value::as_str);
            if payload_type == Some("user_message") {
                *awaiting_user_reply = false;
                sync_waiting_for_user(
                    app,
                    task_id,
                    waiting_for_user,
                    pending_confirmation_calls,
                    *awaiting_user_reply,
                );
            }
        }
        _ => {}
    }
}

fn sync_waiting_for_user(
    app: &AppHandle,
    task_id: &str,
    waiting_for_user: &mut bool,
    pending_confirmation_calls: &HashSet<String>,
    awaiting_user_reply: bool,
) {
    let next_waiting = awaiting_user_reply || !pending_confirmation_calls.is_empty();
    if *waiting_for_user == next_waiting {
        return;
    }

    *waiting_for_user = next_waiting;
    emit_active_task_status(
        app,
        task_id,
        if next_waiting {
            "input_required"
        } else {
            "running"
        },
    );
}

// ── 权限判断 ──────────────────────────────────────────────────────────────────

fn tool_call_requires_confirmation(name: &str, arguments: &str, project_path: &Path) -> bool {
    match name {
        "exec_command" => exec_command_requires_confirmation(arguments),
        "apply_patch" => apply_patch_requires_confirmation(arguments, project_path),
        _ => false,
    }
}

fn exec_command_requires_confirmation(arguments: &str) -> bool {
    let Ok(args) = serde_json::from_str::<serde_json::Value>(arguments) else {
        return false;
    };

    if args
        .get("sandbox_permissions")
        .and_then(serde_json::Value::as_str)
        == Some("require_escalated")
    {
        return true;
    }

    let Some(cmd) = args.get("cmd").and_then(serde_json::Value::as_str) else {
        return false;
    };

    !looks_like_read_only_command(cmd)
}

fn looks_like_read_only_command(cmd: &str) -> bool {
    let trimmed = cmd.trim();
    if trimmed.is_empty() || contains_shell_redirection(trimmed) {
        return false;
    }

    trimmed
        .split(|c| matches!(c, ';' | '|' | '&' | '\n'))
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .all(is_read_only_segment)
}

fn contains_shell_redirection(cmd: &str) -> bool {
    cmd.contains(" >")
        || cmd.contains(">>")
        || cmd.contains("<<")
        || cmd.contains(" 2>")
        || cmd.starts_with('>')
        || cmd.contains("| tee")
}

fn is_read_only_segment(segment: &str) -> bool {
    let tokens: Vec<&str> = segment.split_whitespace().collect();
    let Some(command) = tokens.first().copied() else {
        return true;
    };

    match command {
        "pwd" | "ls" | "rg" | "grep" | "cat" | "head" | "tail" | "wc" | "stat" | "which"
        | "type" | "uname" | "date" | "ps" | "env" | "printenv" | "echo" | "printf" => true,
        "sed" => {
            tokens.iter().any(|token| *token == "-n")
                && !tokens.iter().any(|token| token.starts_with("-i"))
        }
        "find" => !tokens
            .iter()
            .any(|token| matches!(*token, "-delete" | "-exec" | "-ok")),
        "git" => matches!(
            tokens.get(1).copied(),
            Some("status")
                | Some("diff")
                | Some("show")
                | Some("log")
                | Some("branch")
                | Some("rev-parse")
                | Some("remote")
        ),
        _ => false,
    }
}

fn apply_patch_requires_confirmation(arguments: &str, project_path: &Path) -> bool {
    arguments.lines().any(|line| {
        extract_patch_path(line)
            .map(|path| patch_target_requires_confirmation(path, project_path))
            .unwrap_or(false)
    })
}

fn extract_patch_path(line: &str) -> Option<&str> {
    line.strip_prefix("*** Add File: ")
        .or_else(|| line.strip_prefix("*** Update File: "))
        .or_else(|| line.strip_prefix("*** Delete File: "))
        .or_else(|| line.strip_prefix("*** Move to: "))
        .map(str::trim)
}

fn patch_target_requires_confirmation(path: &str, project_path: &Path) -> bool {
    let target = Path::new(path);
    if !target.is_absolute() {
        return false;
    }

    let temp_dir = std::env::temp_dir();
    !target.starts_with(project_path) && !target.starts_with(&temp_dir)
}

fn assistant_message_requests_user_input(payload: Option<&serde_json::Value>) -> bool {
    let Some(payload) = payload else {
        return false;
    };

    let phase = payload.get("phase").and_then(serde_json::Value::as_str);
    if !matches!(phase, Some("final") | Some("final_answer")) {
        return false;
    }

    let Some(content) = payload.get("content").and_then(serde_json::Value::as_array) else {
        return false;
    };

    let text = content
        .iter()
        .filter_map(|item| item.get("text").and_then(serde_json::Value::as_str))
        .collect::<String>();
    let text = text.trim();

    text.ends_with('?') || text.ends_with('？')
}

// ── Claude Code 会话监视器 ────────────────────────────────────────────────────

fn claude_sessions_dir_for_project(project_path: &str) -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    let encoded: String = project_path
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    Some(home.join(".claude").join("projects").join(encoded))
}

fn watch_claude_session(app: AppHandle, task_id: String, session_path: PathBuf) {
    use notify::{RecursiveMode, Watcher};

    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher_opt = notify::RecommendedWatcher::new(tx, notify::Config::default())
        .ok()
        .and_then(|mut w| {
            w.watch(&session_path, RecursiveMode::NonRecursive).ok()?;
            Some(w)
        });

    let mut offset = 0u64;
    let mut partial = String::new();
    let mut waiting_for_user = false;

    while is_task_active(&app, &task_id) {
        if let Ok(lines) = read_session_lines_since(&session_path, &mut offset, &mut partial) {
            for line in lines {
                process_claude_session_line(&app, &task_id, &line, &mut waiting_for_user);
            }
        }

        if watcher_opt.is_some() {
            match rx.recv_timeout(Duration::from_secs(1)) {
                Ok(_) | Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => watcher_opt = None,
            }
        } else {
            thread::sleep(Duration::from_millis(400));
        }
    }
}

fn process_claude_session_line(
    app: &AppHandle,
    task_id: &str,
    line: &str,
    waiting_for_user: &mut bool,
) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
        return;
    };

    match value.get("type").and_then(serde_json::Value::as_str) {
        Some("assistant") => {
            // stop_reason == "tool_use" 是 Claude 暂停等待用户批准或拒绝工具调用的明确信号
            let stop_reason = value
                .get("message")
                .and_then(|m| m.get("stop_reason"))
                .and_then(serde_json::Value::as_str);

            if stop_reason == Some("tool_use") && !*waiting_for_user {
                *waiting_for_user = true;
                emit_active_task_status(app, task_id, "input_required");
            }
        }
        Some("user") => {
            // tool_result 条目表示用户已执行操作（批准或拒绝）
            let has_tool_result = value
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(serde_json::Value::as_array)
                .map(|content| {
                    content.iter().any(|item| {
                        item.get("type").and_then(serde_json::Value::as_str) == Some("tool_result")
                    })
                })
                .unwrap_or(false);

            if has_tool_result && *waiting_for_user {
                *waiting_for_user = false;
                emit_active_task_status(app, task_id, "running");
            }
        }
        _ => {}
    }
}

// ── Session messages (for conversation view) ──────────────────────────────────

#[derive(serde::Serialize, Clone)]
pub(crate) struct SessionMessage {
    role: String,
    content: Vec<SessionContent>,
}

#[derive(serde::Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum SessionContent {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: String,
    },
    Thinking {
        thinking: String,
    },
}

#[tauri::command]
pub async fn read_session_messages(session_path: String) -> Result<Vec<SessionMessage>, String> {
    let content = std::fs::read_to_string(&session_path).map_err(|e| e.to_string())?;
    let lines: Vec<&str> = content.lines().filter(|l| !l.trim().is_empty()).collect();
    if is_codex_format(&lines) {
        Ok(parse_codex_session(&lines))
    } else {
        Ok(parse_claude_session(&lines))
    }
}

fn is_codex_format(lines: &[&str]) -> bool {
    for line in lines.iter().take(10) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
            match val.get("type").and_then(|v| v.as_str()) {
                Some("session_meta") | Some("event_msg") => return true,
                _ => {}
            }
        }
    }
    false
}

fn parse_claude_session(lines: &[&str]) -> Vec<SessionMessage> {
    let mut messages = Vec::new();

    for line in lines {
        let Ok(val) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let msg_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let Some(message) = val.get("message") else {
            continue;
        };

        match msg_type {
            "user" => {
                let parts = claude_user_content(message.get("content"));
                if !parts.is_empty() {
                    messages.push(SessionMessage {
                        role: "user".to_string(),
                        content: parts,
                    });
                }
            }
            "assistant" => {
                let parts = message
                    .get("content")
                    .and_then(|c| c.as_array())
                    .map(|arr| claude_assistant_blocks(arr))
                    .unwrap_or_default();
                if !parts.is_empty() {
                    messages.push(SessionMessage {
                        role: "assistant".to_string(),
                        content: parts,
                    });
                }
            }
            _ => {}
        }
    }

    messages
}

fn claude_user_content(content: Option<&serde_json::Value>) -> Vec<SessionContent> {
    match content {
        Some(serde_json::Value::String(s)) if !s.trim().is_empty() => {
            vec![SessionContent::Text { text: s.clone() }]
        }
        Some(serde_json::Value::Array(blocks)) => blocks
            .iter()
            .filter_map(|b| {
                if b.get("type").and_then(|v| v.as_str()) == Some("text") {
                    let text = b.get("text").and_then(|v| v.as_str()).unwrap_or("");
                    if !text.trim().is_empty() {
                        return Some(SessionContent::Text {
                            text: text.to_string(),
                        });
                    }
                }
                None
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn claude_assistant_blocks(blocks: &[serde_json::Value]) -> Vec<SessionContent> {
    let mut parts = Vec::new();
    for block in blocks {
        match block.get("type").and_then(|v| v.as_str()) {
            Some("text") => {
                if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
                    if !text.trim().is_empty() {
                        parts.push(SessionContent::Text {
                            text: text.to_string(),
                        });
                    }
                }
            }
            Some("tool_use") => {
                let id = block
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let name = block
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let input = block
                    .get("input")
                    .and_then(|v| serde_json::to_string_pretty(v).ok())
                    .unwrap_or_default();
                parts.push(SessionContent::ToolUse { id, name, input });
            }
            Some("thinking") => {
                if let Some(thinking) = block.get("thinking").and_then(|v| v.as_str()) {
                    if !thinking.trim().is_empty() {
                        parts.push(SessionContent::Thinking {
                            thinking: thinking.to_string(),
                        });
                    }
                }
            }
            _ => {}
        }
    }
    parts
}

fn parse_codex_session(lines: &[&str]) -> Vec<SessionMessage> {
    let mut messages: Vec<SessionMessage> = Vec::new();

    for line in lines {
        let Ok(val) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let event_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let payload = val.get("payload");

        match event_type {
            "event_msg" => {
                let payload_type = payload
                    .and_then(|p| p.get("type"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if payload_type == "user_message" {
                    let text = payload
                        .and_then(|p| p.get("message"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    if !text.trim().is_empty() {
                        messages.push(SessionMessage {
                            role: "user".to_string(),
                            content: vec![SessionContent::Text {
                                text: text.to_string(),
                            }],
                        });
                    }
                }
            }
            "response_item" => {
                let payload_type = payload
                    .and_then(|p| p.get("type"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                match payload_type {
                    "message" => {
                        let role = payload
                            .and_then(|p| p.get("role"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        if role != "assistant" {
                            continue;
                        }
                        let parts: Vec<SessionContent> = payload
                            .and_then(|p| p.get("content"))
                            .and_then(|v| v.as_array())
                            .map(|blocks| {
                                blocks
                                    .iter()
                                    .filter_map(|b| {
                                        let t = b.get("type").and_then(|v| v.as_str())?;
                                        if matches!(t, "output_text" | "text") {
                                            let text = b.get("text").and_then(|v| v.as_str())?;
                                            if !text.trim().is_empty() {
                                                return Some(SessionContent::Text {
                                                    text: text.to_string(),
                                                });
                                            }
                                        }
                                        None
                                    })
                                    .collect()
                            })
                            .unwrap_or_default();
                        if !parts.is_empty() {
                            if messages.last().map(|m| m.role.as_str()) == Some("assistant") {
                                messages.last_mut().unwrap().content.extend(parts);
                            } else {
                                messages.push(SessionMessage {
                                    role: "assistant".to_string(),
                                    content: parts,
                                });
                            }
                        }
                    }
                    "function_call" => {
                        let call_id = payload
                            .and_then(|p| p.get("call_id"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let name = payload
                            .and_then(|p| p.get("name"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let raw = payload
                            .and_then(|p| p.get("arguments"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("{}");
                        let input = serde_json::from_str::<serde_json::Value>(raw)
                            .ok()
                            .and_then(|v| serde_json::to_string_pretty(&v).ok())
                            .unwrap_or_else(|| raw.to_string());
                        let part = SessionContent::ToolUse {
                            id: call_id,
                            name,
                            input,
                        };
                        if messages.last().map(|m| m.role.as_str()) == Some("assistant") {
                            messages.last_mut().unwrap().content.push(part);
                        } else {
                            messages.push(SessionMessage {
                                role: "assistant".to_string(),
                                content: vec![part],
                            });
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }

    messages
}

// ── 会话文件工具函数 ──────────────────────────────────────────────────────────

/// Strip ANSI escape sequences so we can do plain-text matching.
fn strip_ansi(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            match chars.peek() {
                Some(&'[') => {
                    chars.next(); // consume '['
                                  // consume until a byte that terminates a CSI sequence (ASCII letter)
                    while let Some(&c2) = chars.peek() {
                        chars.next();
                        if c2.is_ascii_alphabetic() {
                            break;
                        }
                    }
                }
                _ => {
                    chars.next(); // skip the char after bare ESC
                }
            }
        } else {
            result.push(c);
        }
    }
    result
}

fn is_uuid_like(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    parts.len() == 5
        && parts[0].len() == 8
        && parts[1].len() == 4
        && parts[2].len() == 4
        && parts[3].len() == 4
        && parts[4].len() == 12
        && parts
            .iter()
            .all(|p| p.bytes().all(|b| b.is_ascii_hexdigit()))
}

fn find_claude_session_file(session_id: &str, project_path: &str) -> Option<PathBuf> {
    let sessions_dir = claude_sessions_dir_for_project(project_path)?;

    // Fast path: UUID session IDs map directly to filenames.
    if is_uuid_like(session_id) {
        let file = sessions_dir.join(format!("{}.jsonl", session_id));
        return if file.exists() { Some(file) } else { None };
    }

    // Slow path: human-readable slug — scan file contents for a matching
    // `custom-title` or `agent-name` record written by the model.
    let entries = std::fs::read_dir(&sessions_dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        if slug_matches_session_file(&path, session_id) {
            return Some(path);
        }
    }
    None
}

/// Returns true if `path` is a Claude session JSONL that contains a
/// `custom-title` or `agent-name` record matching `slug`.
fn slug_matches_session_file(path: &Path, slug: &str) -> bool {
    use std::io::BufRead;
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return false,
    };
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        let type_str = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if matches!(type_str, "custom-title" | "agent-name") {
            let name = v
                .get("customTitle")
                .or_else(|| v.get("agentName"))
                .and_then(|n| n.as_str())
                .unwrap_or("");
            if name == slug {
                return true;
            }
        }
    }
    false
}

fn find_codex_session_file(session_id: &str, project_path: &str) -> Option<PathBuf> {
    let suffix = format!("-{}.jsonl", session_id);
    let files = collect_session_files_from_roots(&codex_sessions_roots(project_path));
    files
        .into_iter()
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.ends_with(&suffix))
                .unwrap_or(false)
        })
        .max_by_key(|p| session_modified_at(p))
}

// ── /status-based session discovery ──────────────────────────────────────────

/// 从 Claude Code 的 `/status` 输出中提取 Session ID。
/// 输出示例: "Session ID: 1aee0948-e0f2-4ad1-b710-ba236fab378a"
fn extract_claude_status_session_id(output: &str) -> Option<String> {
    let clean = strip_ansi(output);
    // Use find() instead of line-by-line matching because Claude Code renders /status
    // using cursor-positioning escape sequences, which collapse multiple lines into one
    // after ANSI stripping (no \r\n between positioned text fragments).
    let pos = clean.find("Session ID:")?;
    let after = clean[pos + "Session ID:".len()..].trim_start();
    let id: String = after
        .chars()
        .take_while(|c| c.is_ascii_hexdigit() || *c == '-')
        .collect();
    if is_uuid_like(&id) { Some(id) } else { None }
}

/// 从 Codex 的 `/status` 输出中提取 Session ID。
/// 输出示例: "│  Session:                     019d247a-2a83-76f3-b5c6-e4a59955af3f  │"
///
/// Codex renders /status using cursor-positioning escape sequences, which collapse
/// multiple lines into one after ANSI stripping (same issue as Claude Code).
/// Use find() instead of line-by-line matching to handle both cases.
fn extract_codex_status_session_id(output: &str) -> Option<String> {
    let clean = strip_ansi(output);
    // 先过滤掉盒状边框字符，再用 find() 搜索 "Session:" 关键词，
    // 避免光标定位序列导致多行塌缩成一行后 lines() 无法匹配的问题
    let stripped: String = clean
        .chars()
        .filter(|c| !matches!(*c, '│' | '╭' | '╰' | '─' | '╮' | '╯' | '├' | '┤'))
        .collect();
    let pos = stripped.find("Session:")?;
    let after = stripped[pos + "Session:".len()..].trim_start();
    let id: String = after
        .chars()
        .take_while(|c| c.is_ascii_hexdigit() || *c == '-')
        .collect();
    if is_uuid_like(&id) { Some(id) } else { None }
}

/// 轮询最多 5 秒，直到会话文件出现。
fn wait_for_session_file(session_id: &str, project_path: &str, is_codex: bool) -> Option<PathBuf> {
    for _ in 0..50 {
        let path = if is_codex {
            find_codex_session_file(session_id, project_path)
        } else {
            find_claude_session_file(session_id, project_path)
        };
        if path.is_some() {
            return path;
        }
        thread::sleep(Duration::from_millis(100));
    }
    None
}

/// 在 Session ID 确认后注册会话信息，并开始监视文件。
pub(crate) fn register_and_watch_session(
    app: &AppHandle,
    task_id: &str,
    session_id: &str,
    project_path: &str,
    is_codex: bool,
) {
    let path = match wait_for_session_file(session_id, project_path, is_codex) {
        Some(p) => p,
        None => return,
    };
    let path_string = path.to_string_lossy().into_owned();

    if !claim_session_path(app, &path_string) {
        return;
    }

    if is_codex {
        let tm = app.state::<TaskManager>();
        tm.codex_sessions.lock().insert(
            task_id.to_string(),
            CodexSessionInfo {
                session_id: session_id.to_string(),
                session_path: path_string.clone(),
            },
        );
    } else {
        let tm = app.state::<TaskManager>();
        tm.claude_sessions.lock().insert(
            task_id.to_string(),
            ClaudeSessionInfo {
                session_id: session_id.to_string(),
                session_path: path_string.clone(),
            },
        );
    }

    let _ = app.emit(
        "task-session",
        serde_json::json!({
            "task_id": task_id,
            "session_id": session_id,
            "session_path": path_string
        }),
    );

    let app_clone = app.clone();
    let tid = task_id.to_string();
    if is_codex {
        let pp = PathBuf::from(project_path);
        thread::spawn(move || watch_codex_session(app_clone, tid, path, pp));
    } else {
        thread::spawn(move || watch_claude_session(app_clone, tid, path));
    }
}

/// 监听 PTY 输出流，通过 `/status` 响应获取 Session ID。
/// Claude 启动后 1.5 秒发送 `/status`；Codex 则在收到首个输出后再等待 1 秒，
/// 避免 session 尚未创建时过早查询。
fn should_send_status_command(
    status_sent: bool,
    is_codex: bool,
    start_elapsed: Duration,
    first_output_elapsed: Option<Duration>,
) -> bool {
    if status_sent {
        return false;
    }

    if is_codex {
        first_output_elapsed
            .map(|elapsed| elapsed >= Duration::from_secs(1))
            .unwrap_or(false)
            // 兜底：若 Codex 长时间无输出，也不要无限等待
            || start_elapsed >= Duration::from_secs(8)
    } else {
        start_elapsed >= Duration::from_millis(1500)
    }
}

fn send_status_command(app: &AppHandle, task_id: &str, is_codex: bool) {
    if is_codex {
        // Codex 有自动补全菜单，需先输入 /status 触发菜单，
        // 再延迟发送 \r 选中执行；两次写入之间释放锁，避免长时间持锁
        {
            let tm = app.state::<TaskManager>();
            let mut writers = tm.pty_writers.lock();
            if let Some(writer) = writers.get_mut(task_id) {
                let _ = writer.write_all(b"/status");
                let _ = writer.flush();
            }
        }
        thread::sleep(Duration::from_millis(100));
        {
            let tm = app.state::<TaskManager>();
            let mut writers = tm.pty_writers.lock();
            if let Some(writer) = writers.get_mut(task_id) {
                let _ = writer.write_all(b"\r");
                let _ = writer.flush();
            }
        }
    } else {
        let tm = app.state::<TaskManager>();
        let mut writers = tm.pty_writers.lock();
        if let Some(writer) = writers.get_mut(task_id) {
            let _ = writer.write_all(b"/status\r");
            let _ = writer.flush();
        }
    }
}

/// 监听 PTY 输出流，通过 `/status` 响应获取 Session ID。
/// Claude 启动后 1.5 秒发送 `/status`；Codex 则在收到首个输出后再等待 1 秒，
/// 避免 session 尚未创建时过早查询。
///
/// 当 `pre_session_id` 为 `Some` 时（Claude >= 2.1.87），跳过 `/status` 发现，
/// 直接使用预置 session id 注册会话文件。若文件在超时内未出现，自动回退到 `/status` 流程。
pub(crate) fn spawn_status_session_watcher(
    app: AppHandle,
    task_id: String,
    project_path: String,
    is_codex: bool,
    rx: mpsc::Receiver<String>,
    pre_session_id: Option<String>,
) {
    // ── Claude >= 2.1.87 快速路径：预置 session id，不发 /status ──
    if let Some(ref sid) = pre_session_id {
        if !is_codex {
            let app2 = app.clone();
            let tid2 = task_id.clone();
            let pp2 = project_path.clone();
            let sid2 = sid.clone();
            thread::spawn(move || {
                // 等待 Claude 创建 session 文件，最长 10 秒
                register_and_watch_session(&app2, &tid2, &sid2, &pp2, false);

                // 如果 register_and_watch_session 无法找到文件（内部 wait_for_session_file 超时），
                // 检查是否已经成功注册；若未注册则回退到旧的 /status 流程。
                let registered = {
                    let tm = app2.state::<TaskManager>();
                    let sessions = tm.claude_sessions.lock();
                    sessions
                        .get(&tid2)
                        .map(|info| !info.session_path.is_empty())
                        .unwrap_or(false)
                };
                if registered {
                    return; // 成功，rx 仍会被 drop 但不影响 pty_reader
                }

                // 回退：启动旧的 /status 流程
                run_status_session_watcher(app2, tid2, pp2, false, rx);
            });
            return;
        }
    }

    // ── 原始路径：Codex 或 Claude < 2.1.87 ──
    thread::spawn(move || {
        run_status_session_watcher(app, task_id, project_path, is_codex, rx);
    });
}

/// 旧的 /status 轮询流程：Codex 始终走此路径，Claude < 2.1.87 也走此路径。
fn run_status_session_watcher(
    app: AppHandle,
    task_id: String,
    project_path: String,
    is_codex: bool,
    rx: mpsc::Receiver<String>,
) {
        let start_time = Instant::now();
        let mut status_sent = false;
        let mut status_sent_at: Option<Instant> = None;
        let mut status_send_count: u32 = 0;
        let mut first_output_at = None;
        let mut accumulated = String::new();
        // 发送 /status 后的独立缓冲，避免大量输出将 /status 响应挤出裁剪窗口
        let mut status_response_buf = String::new();
        let mut collecting_response = false;

        loop {
            if !is_task_active(&app, &task_id) {
                break;
            }

            let should_send_status = should_send_status_command(
                status_sent,
                is_codex,
                start_time.elapsed(),
                first_output_at.map(|instant: Instant| instant.elapsed()),
            );

            // 首次发送或重试：若已发送但 3 秒内未提取到 Session ID，则再发一次。
            // Codex 在 session 创建前 /status 不含 Session 字段，需要在任务真正开始后重试。
            // 最多重试 5 次（含首次发送），避免对长时间无法解析的任务持续干扰 PTY 输入流。
            let should_retry = status_sent
                && status_send_count < 5
                && status_sent_at
                    .map(|t| t.elapsed() >= Duration::from_secs(3))
                    .unwrap_or(false);

            if should_send_status || should_retry {
                status_sent = true;
                status_send_count += 1;
                status_sent_at = Some(Instant::now());
                collecting_response = true;
                status_response_buf.clear();
                send_status_command(&app, &task_id, is_codex);
            }

            match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(chunk) => {
                    if is_codex && first_output_at.is_none() {
                        first_output_at = Some(Instant::now());
                    }
                    accumulated.push_str(&chunk);
                    // 限制缓冲区大小，防止内存占用过大
                    if accumulated.len() > 65536 {
                        let trim = accumulated.len() - 32768;
                        accumulated.drain(..trim);
                    }

                    // /status 发送后，额外收集响应到独立缓冲（最多 8KB），
                    // 避免主缓冲裁剪把 Session ID 丢掉
                    if collecting_response {
                        status_response_buf.push_str(&chunk);
                        if status_response_buf.len() > 8192 {
                            collecting_response = false;
                        }
                    }

                    let session_id = if is_codex {
                        extract_codex_status_session_id(&status_response_buf)
                            .or_else(|| extract_codex_status_session_id(&accumulated))
                    } else {
                        extract_claude_status_session_id(&status_response_buf)
                            .or_else(|| extract_claude_status_session_id(&accumulated))
                    };

                    if let Some(sid) = session_id {
                        register_and_watch_session(&app, &task_id, &sid, &project_path, is_codex);
                        // Claude Code 的 /status 以全屏面板形式展示，需发送 ESC 关闭；
                        // Codex 无此面板，无需处理
                        if !is_codex {
                            let tm = app.state::<TaskManager>();
                            let mut writers = tm.pty_writers.lock();
                            if let Some(writer) = writers.get_mut(&task_id) {
                                let _ = writer.write_all(b"\x1b");
                                let _ = writer.flush();
                            }
                        }
                        break;
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
}

/// 供 `resume_task` 使用：根据已知的 session_id 查找会话文件并开始监视。
pub(crate) fn spawn_resume_session_watcher(
    app: AppHandle,
    task_id: String,
    project_path: String,
    session_id: String,
    is_codex: bool,
) {
    thread::spawn(move || {
        register_and_watch_session(&app, &task_id, &session_id, &project_path, is_codex);
    });
}

// ── 测试 ──────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_claude_status_session_id_from_status_output() {
        // Simple \r\n separated output
        let output = "\x1b[0m\r\n  Version: 2.1.81\r\n  Session ID: 1aee0948-e0f2-4ad1-b710-ba236fab378a\r\n  cwd: /workspace\r\n\x1b[0m";
        assert_eq!(
            extract_claude_status_session_id(output),
            Some("1aee0948-e0f2-4ad1-b710-ba236fab378a".to_string())
        );
    }

    #[test]
    fn extract_claude_status_session_id_cursor_positioned() {
        // Claude Code renders /status using cursor-positioning sequences; after ANSI
        // stripping the text collapses onto one line with no \r\n separators.
        let output = "\x1b[1;1H  Version: 2.1.83\x1b[2;1H  Session ID: 9d5533cd-af1e-48d5-99d3-a9e61b2a5250\x1b[3;1H  cwd: /workspace";
        assert_eq!(
            extract_claude_status_session_id(output),
            Some("9d5533cd-af1e-48d5-99d3-a9e61b2a5250".to_string())
        );
    }

    #[test]
    fn extract_claude_status_session_id_returns_none_when_absent() {
        assert_eq!(extract_claude_status_session_id("no session info here"), None);
    }

    #[test]
    fn extract_codex_status_session_id_from_status_output() {
        let output = "\r\n│  Session:                     019d247a-2a83-76f3-b5c6-e4a59955af3f                                │\r\n";
        assert_eq!(
            extract_codex_status_session_id(output),
            Some("019d247a-2a83-76f3-b5c6-e4a59955af3f".to_string())
        );
    }

    #[test]
    fn extract_codex_status_session_id_with_ansi() {
        let output = "\x1b[0m\r\n\u{2502}  Session:                     019d0a3e-3cf7-7513-b7de-e3e9bc6c7f4d  \u{2502}\r\n\x1b[0m";
        assert_eq!(
            extract_codex_status_session_id(output),
            Some("019d0a3e-3cf7-7513-b7de-e3e9bc6c7f4d".to_string())
        );
    }

    #[test]
    fn extract_codex_status_session_id_cursor_positioned() {
        // Codex renders /status using cursor-positioning sequences; after ANSI stripping
        // all content collapses onto one line with no \r\n separators — same as Claude Code.
        let output = "\x1b[1;1H  OpenAI Codex (v0.116.0)\x1b[3;1H  Session:                     019d28df-14c0-7d03-8209-07dd4ae22cd1\x1b[4;1H  Context window:  100% left";
        assert_eq!(
            extract_codex_status_session_id(output),
            Some("019d28df-14c0-7d03-8209-07dd4ae22cd1".to_string())
        );
    }

    #[test]
    fn extract_codex_status_session_id_returns_none_when_absent() {
        assert_eq!(extract_codex_status_session_id("no session info here"), None);
    }

    #[test]
    fn codex_status_waits_for_first_output_then_one_second() {
        assert!(!should_send_status_command(
            false,
            true,
            Duration::from_secs(2),
            None,
        ));
        assert!(!should_send_status_command(
            false,
            true,
            Duration::from_millis(2200),
            Some(Duration::from_millis(900)),
        ));
        assert!(should_send_status_command(
            false,
            true,
            Duration::from_millis(2200),
            Some(Duration::from_secs(1)),
        ));
    }

    #[test]
    fn codex_status_has_global_timeout_fallback() {
        assert!(should_send_status_command(
            false,
            true,
            Duration::from_secs(8),
            None,
        ));
    }

    #[test]
    fn claude_status_keeps_original_delay() {
        assert!(!should_send_status_command(
            false,
            false,
            Duration::from_millis(1499),
            None,
        ));
        assert!(should_send_status_command(
            false,
            false,
            Duration::from_millis(1500),
            None,
        ));
    }

    #[test]
    fn read_only_command_detection_is_conservative() {
        assert!(looks_like_read_only_command("pwd && rg -n session src"));
        assert!(looks_like_read_only_command(
            "sed -n '1,120p' src-tauri/src/lib.rs"
        ));
        assert!(!looks_like_read_only_command(
            "cargo test --manifest-path src-tauri/Cargo.toml"
        ));
        assert!(!looks_like_read_only_command("echo hello > out.txt"));
    }

    #[test]
    fn exec_command_confirmation_detection_matches_escalation_and_write_commands() {
        assert!(exec_command_requires_confirmation(
            r#"{"cmd":"rg -n session src","sandbox_permissions":"require_escalated"}"#
        ));
        assert!(exec_command_requires_confirmation(
            r#"{"cmd":"cargo test --manifest-path src-tauri/Cargo.toml --lib"}"#
        ));
        assert!(!exec_command_requires_confirmation(
            r#"{"cmd":"git status --short"}"#
        ));
    }

    #[test]
    fn apply_patch_confirmation_detection_only_flags_external_absolute_paths() {
        let project_root = Path::new("/repo");

        assert!(!apply_patch_requires_confirmation(
            "*** Begin Patch\n*** Update File: src/main.rs\n*** End Patch",
            project_root,
        ));
        assert!(!apply_patch_requires_confirmation(
            "*** Begin Patch\n*** Update File: /repo/src/main.rs\n*** End Patch",
            project_root,
        ));
        assert!(apply_patch_requires_confirmation(
            "*** Begin Patch\n*** Update File: /tmp/outside.rs\n*** End Patch",
            project_root,
        ));
    }

    #[test]
    fn final_assistant_question_is_treated_as_input_required() {
        let payload = serde_json::json!({
            "role": "assistant",
            "phase": "final_answer",
            "content": [
                { "type": "output_text", "text": "继续按这个方案改吗？" }
            ]
        });

        assert!(assistant_message_requests_user_input(Some(&payload)));
    }
}
