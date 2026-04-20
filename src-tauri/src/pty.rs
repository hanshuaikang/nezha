use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::session::{spawn_resume_session_watcher, spawn_status_session_watcher};
use crate::TaskManager;

const SESSION_WAIT_POLL: Duration = Duration::from_millis(50);
const SESSION_WAIT_MAX: Duration = Duration::from_millis(500);
const PTY_READ_BUFFER_SIZE: usize = 32 * 1024;
const PTY_EMIT_FLUSH_INTERVAL: Duration = Duration::from_millis(16);
const PTY_EMIT_MAX_BATCH_BYTES: usize = 64 * 1024;
/// 有界 channel 容量：满时 reader 线程阻塞，反压传播至 OS 内核 PTY 缓冲区，
/// 最终使写入进程（Claude/Codex）的 write() 系统调用阻塞，从源头限流。
const PTY_EMIT_CHANNEL_CAPACITY: usize = 32;

fn task_attachments_dir(project_path: &str, task_id: &str) -> std::path::PathBuf {
    Path::new(project_path)
        .join(".nezha")
        .join("attachments")
        .join(task_id)
}

fn has_task_session(app: &AppHandle, task_id: &str, is_codex: bool) -> bool {
    let tm = app.state::<TaskManager>();
    if is_codex {
        tm.codex_sessions.lock().contains_key(task_id)
    } else {
        tm.claude_sessions.lock().contains_key(task_id)
    }
}

/// 任务结束后，等待会话注册完成，最长等待 500ms。
fn wait_for_session(app: &AppHandle, task_id: &str, is_codex: bool) {
    let deadline = Instant::now() + SESSION_WAIT_MAX;
    while Instant::now() < deadline {
        if has_task_session(app, task_id, is_codex) {
            return;
        }
        std::thread::sleep(SESSION_WAIT_POLL);
    }
}

fn finalize_task_exit(
    app: &AppHandle,
    task_id: &str,
    project_path: &str,
    is_codex: bool,
    exit_ok: bool,
    exit_code: Option<u32>,
) {
    let is_cancelled = {
        let tm = app.state::<TaskManager>();
        let mut cancelled = tm.cancelled_tasks.lock();
        cancelled.remove(task_id)
    };

    let had_agent_session;
    {
        let tm = app.state::<TaskManager>();
        tm.remove_pty_handles(task_id);

        let codex_info = tm.codex_sessions.lock().remove(task_id);
        let codex_path = codex_info.map(|info| info.session_path);
        let claude_info = tm.claude_sessions.lock().remove(task_id);
        let claude_path = claude_info.as_ref().map(|info| info.session_path.clone());
        had_agent_session = if is_codex {
            codex_path.is_some()
        } else {
            claude_info.is_some()
        };
        let mut claimed = tm.claimed_session_paths.lock();
        if let Some(path) = codex_path {
            claimed.remove(&path);
        }
        if let Some(path) = claude_path {
            claimed.remove(&path);
        }
    }

    if is_cancelled {
        let _ = fs::remove_dir_all(task_attachments_dir(project_path, task_id));
        return;
    }

    let status = if exit_ok || had_agent_session { "done" } else { "failed" };
    let payload = if status == "failed" {
        let reason = match exit_code {
            Some(code) => format!("Process exited with code {}", code),
            None => "Process exited with non-zero status".to_string(),
        };
        serde_json::json!({ "task_id": task_id, "status": status, "failure_reason": reason })
    } else {
        serde_json::json!({ "task_id": task_id, "status": status })
    };
    let _ = app.emit("task-status", payload);

    let _ = fs::remove_dir_all(task_attachments_dir(project_path, task_id));
}

fn save_task_images(
    project_path: &str,
    task_id: &str,
    images: &[String],
) -> Result<Vec<String>, String> {
    if images.is_empty() {
        return Ok(vec![]);
    }
    let attachments_dir = task_attachments_dir(project_path, task_id);
    fs::create_dir_all(&attachments_dir).map_err(|e| e.to_string())?;
    let mut paths = Vec::new();
    for (i, data_url) in images.iter().enumerate() {
        // 解析 "data:image/png;base64,<data>" 格式
        let comma = data_url.find(',').ok_or("invalid image data URL")?;
        let header = &data_url[..comma];
        let b64 = &data_url[comma + 1..];
        let ext = if header.contains("jpeg") || header.contains("jpg") {
            "jpg"
        } else if header.contains("gif") {
            "gif"
        } else if header.contains("webp") {
            "webp"
        } else {
            "png"
        };
        use base64::Engine;
        let data = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| e.to_string())?;
        let filename = format!("{}.{}", i, ext);
        let file_path = attachments_dir.join(&filename);
        fs::write(&file_path, &data).map_err(|e| e.to_string())?;
        paths.push(file_path.to_string_lossy().into_owned());
    }
    Ok(paths)
}

// ── 共享 PTY 辅助函数 ────────────────────────────────────────────────────────

/// 设置 CommandBuilder 的标准环境变量。
fn setup_env(cmd: &mut CommandBuilder) {
    let login_env = crate::app_settings::get_login_shell_env();
    for (key, value) in login_env {
        cmd.env(key, value);
    }

    // 确保 locale 为 UTF-8。
    // macOS 的 Terminal.app / iTerm2 会自动注入 LANG，但从 Dock 启动的 Tauri 应用
    // 进程环境中没有 locale 变量，导致 PTY 子进程无法正确处理中文等多字节输入。
    let has = |name: &str| login_env.iter().any(|(k, _)| k == name);
    if !has("LANG") {
        cmd.env("LANG", "en_US.UTF-8");
    }
    if !has("LC_CTYPE") {
        cmd.env("LC_CTYPE", "en_US.UTF-8");
    }

    // 设置终端类型，使 Claude Code / Codex 输出正确的转义序列
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
}

/// 将 PTY master/writer/child 注册到 TaskManager 的三个 HashMap 中。
fn register_pty_handles(
    task_manager: &TaskManager,
    id: &str,
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
) -> Result<(), String> {
    task_manager
        .pty_masters
        .lock()
        .insert(id.to_string(), master);
    task_manager
        .pty_writers
        .lock()
        .insert(id.to_string(), writer);
    task_manager
        .child_handles
        .lock()
        .insert(id.to_string(), Arc::new(std::sync::Mutex::new(child)));
    Ok(())
}

#[derive(Clone, Copy)]
enum PtyEmitMode {
    Immediate,
    Batched {
        flush_interval: Duration,
        max_batch_bytes: usize,
    },
}

fn emit_pty_event(app: &AppHandle, id: &str, event_name: &str, id_key: &str, data: String) {
    let mut payload = serde_json::Map::new();
    payload.insert(id_key.to_string(), serde_json::Value::String(id.to_string()));
    payload.insert("data".to_string(), serde_json::Value::String(data));
    let _ = app.emit(event_name, serde_json::Value::Object(payload));
}

fn flush_pty_batch(app: &AppHandle, id: &str, event_name: &str, id_key: &str, batch: &mut String) {
    if batch.is_empty() {
        return;
    }
    emit_pty_event(app, id, event_name, id_key, std::mem::take(batch));
}

/// 在后台线程中读取 PTY 输出，向前端发送事件。
///
/// - `event_name`：Tauri 事件名（`"agent-output"` 或 `"shell-output"`）
/// - `id_key`：JSON payload 中的 ID 字段名（`"task_id"` 或 `"shell_id"`）
/// - `session_tx`：可选 channel，用于将原始文本转发给 session watcher
/// - `on_finish`：PTY 关闭后执行的可选清理回调
fn spawn_pty_reader(
    app: AppHandle,
    id: String,
    event_name: &'static str,
    id_key: &'static str,
    emit_mode: PtyEmitMode,
    reader: Box<dyn Read + Send>,
    session_tx: Option<std::sync::mpsc::Sender<String>>,
    on_finish: Option<Box<dyn FnOnce() + Send>>,
) {
    tokio::task::spawn_blocking(move || {
        let mut reader = reader;
        let mut buf = [0u8; PTY_READ_BUFFER_SIZE];
        // 保存上次读取中不完整的 UTF-8 字节序列
        let mut leftover: Vec<u8> = Vec::new();
        let (emit_tx, emit_worker) = match emit_mode {
            PtyEmitMode::Immediate => (None, None),
            PtyEmitMode::Batched {
                flush_interval,
                max_batch_bytes,
            } => {
                let (tx, rx) = std::sync::mpsc::sync_channel::<String>(PTY_EMIT_CHANNEL_CAPACITY);
                let emit_app = app.clone();
                let emit_id = id.clone();
                let worker = std::thread::spawn(move || {
                    let mut batch = String::new();
                    loop {
                        match rx.recv_timeout(flush_interval) {
                            Ok(chunk) => {
                                batch.push_str(&chunk);
                                if batch.len() >= max_batch_bytes {
                                    flush_pty_batch(
                                        &emit_app,
                                        &emit_id,
                                        event_name,
                                        id_key,
                                        &mut batch,
                                    );
                                }
                            }
                            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                                flush_pty_batch(
                                    &emit_app,
                                    &emit_id,
                                    event_name,
                                    id_key,
                                    &mut batch,
                                );
                            }
                            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                                flush_pty_batch(
                                    &emit_app,
                                    &emit_id,
                                    event_name,
                                    id_key,
                                    &mut batch,
                                );
                                break;
                            }
                        }
                    }
                });
                (Some(tx), Some(worker))
            }
        };
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let mut combined = std::mem::take(&mut leftover);
                    combined.extend_from_slice(&buf[..n]);

                    let valid_len = match std::str::from_utf8(&combined) {
                        Ok(_) => combined.len(),
                        Err(e) => e.valid_up_to(),
                    };

                    if valid_len > 0 {
                        // SAFETY：已确认 valid_len 之前的字节为有效 UTF-8
                        let data = unsafe {
                            std::str::from_utf8_unchecked(&combined[..valid_len]).to_owned()
                        };
                        // session_tx 需要独立副本；data 本身留给 emit 路径 move，避免多余堆分配
                        if let Some(ref tx) = session_tx {
                            let _ = tx.send(data.clone());
                        }
                        if let Some(ref tx) = emit_tx {
                            match tx.send(data) {
                                Ok(()) => {}
                                Err(err) => emit_pty_event(&app, &id, event_name, id_key, err.0),
                            }
                        } else {
                            emit_pty_event(&app, &id, event_name, id_key, data);
                        }
                    }

                    if valid_len < combined.len() {
                        leftover = combined[valid_len..].to_vec();
                    }
                }
            }
        }
        drop(emit_tx);
        if let Some(worker) = emit_worker {
            let _ = worker.join();
        }
        // session_tx 在此处被 drop，watcher 端的 Receiver 将收到 Disconnected 信号
        if let Some(f) = on_finish {
            f();
        }
    });
}

/// 在后台线程中轮询子进程退出状态，退出后调用 finalize_task_exit。
fn spawn_exit_monitor(app: AppHandle, task_id: String, project_path: String, is_codex: bool) {
    tokio::task::spawn_blocking(move || loop {
        let exit_status = {
            let tm = app.state::<TaskManager>();
            let child_arc = tm.child_handles.lock().get(&task_id).cloned();
            if let Some(arc) = child_arc {
                arc.lock().unwrap().try_wait().ok().flatten()
            } else {
                return;
            }
        };

        if let Some(status) = exit_status {
            let exit_ok = status.success();
            let exit_code = if exit_ok { None } else { Some(status.exit_code()) };
            // 等待会话注册完成
            wait_for_session(&app, &task_id, is_codex);
            finalize_task_exit(&app, &task_id, &project_path, is_codex, exit_ok, exit_code);
            return;
        }

        std::thread::sleep(Duration::from_millis(100));
    });
}

/// 为 Claude 命令构建 CommandBuilder，并根据 permission_mode 添加权限标志。
fn build_claude_cmd(agent_bin: &str, permission_mode: &str) -> CommandBuilder {
    let mut c = CommandBuilder::new(agent_bin);
    match permission_mode {
        "ask" => {
            c.arg("--permission-mode");
            c.arg("default");
        }
        "auto_edit" => {
            c.arg("--permission-mode");
            c.arg("acceptEdits");
        }
        "full_access" => {
            c.arg("--dangerously-skip-permissions");
        }
        _ => {}
    }
    c
}

// ── Tauri 命令 ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn run_task(
    app: AppHandle,
    task_manager: State<'_, TaskManager>,
    task_id: String,
    project_path: String,
    prompt: String,
    agent: String,
    permission_mode: String,
    images: Option<Vec<String>>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<(), String> {
    let pair = native_pty_system()
        .openpty(PtySize {
            rows: rows.unwrap_or(50),
            cols: cols.unwrap_or(220),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // 将图片保存至 .nezha/attachments/ 并获取文件路径
    let image_paths = save_task_images(&project_path, &task_id, &images.unwrap_or_default())?;

    // 若配置了项目级 prompt_prefix，则拼接到提示词前
    let config = crate::config::read_project_config(project_path.clone()).unwrap_or_default();
    let base_prompt = if config.agent.prompt_prefix.is_empty() {
        prompt.clone()
    } else {
        format!("{}\n{}", config.agent.prompt_prefix, prompt)
    };

    // 将图片路径追加到提示词，供 Claude Code 通过文件工具读取
    let final_prompt = if image_paths.is_empty() {
        base_prompt
    } else {
        format!("{}\n\n[Attached images]\n{}", base_prompt, image_paths.join("\n"))
    };

    let launch = crate::app_settings::get_agent_launch_spec(&agent);
    let agent_bin = launch.program.clone();
    let is_codex = agent == "codex";

    // 读取项目配置中已保存的 Claude 版本，用于判断是否支持 --session-id
    let saved_claude_version = config.agent.claude_version.clone();
    let use_explicit_session =
        !is_codex && crate::app_settings::claude_version_gte(&saved_claude_version, "2.1.87");

    // 预生成 session id（仅 Claude >= 2.1.87 使用）
    let pre_session_id = if use_explicit_session {
        Some(uuid::Uuid::new_v4().to_string())
    } else {
        None
    };

    let mut cmd = if is_codex {
        let mut c = CommandBuilder::new(&agent_bin);
        c.arg("--");
        c.arg(&final_prompt);
        c
    } else {
        let mut c = build_claude_cmd(&agent_bin, &permission_mode);
        // Claude >= 2.1.87：通过 --session-id 指定会话，跳过 /status 发现
        if let Some(ref sid) = pre_session_id {
            c.arg("--session-id");
            c.arg(sid);
        }
        c.arg(&final_prompt);
        c
    };
    cmd.cwd(&project_path);
    setup_env(&mut cmd);
    for (key, value) in &launch.extra_env {
        cmd.env(key, value);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    register_pty_handles(&task_manager, &task_id, pair.master, writer, child)?;

    let _ = app.emit(
        "task-status",
        serde_json::json!({ "task_id": task_id, "status": "running" }),
    );

    // 用于将 PTY 输出转发给 session watcher 的 channel
    let (session_tx, session_rx) = std::sync::mpsc::channel::<String>();
    spawn_status_session_watcher(
        app.clone(),
        task_id.clone(),
        project_path.clone(),
        is_codex,
        session_rx,
        pre_session_id,
    );
    spawn_pty_reader(
        app.clone(),
        task_id.clone(),
        "agent-output",
        "task_id",
        PtyEmitMode::Batched {
            flush_interval: PTY_EMIT_FLUSH_INTERVAL,
            max_batch_bytes: PTY_EMIT_MAX_BATCH_BYTES,
        },
        reader,
        Some(session_tx),
        None,
    );
    spawn_exit_monitor(app, task_id, project_path, is_codex);

    Ok(())
}

#[tauri::command]
pub async fn cancel_task(
    app: AppHandle,
    task_manager: State<'_, TaskManager>,
    task_id: String,
    project_path: String,
) -> Result<(), String> {
    task_manager
        .cancelled_tasks
        .lock()
        .insert(task_id.clone());

    let child_arc = task_manager
        .child_handles
        .lock()
        .get(&task_id)
        .cloned();
    if let Some(arc) = child_arc {
        let _ = arc.lock().unwrap().kill();
    }

    // 释放已声明的会话路径，确保相同提示词的任务可以重新运行
    {
        let codex_path = task_manager
            .codex_sessions
            .lock()
            .get(&task_id)
            .map(|info| info.session_path.clone());
        let claude_path = task_manager
            .claude_sessions
            .lock()
            .get(&task_id)
            .map(|info| info.session_path.clone());
        let mut claimed = task_manager.claimed_session_paths.lock();
        if let Some(path) = codex_path {
            claimed.remove(&path);
        }
        if let Some(path) = claude_path {
            claimed.remove(&path);
        }
    }

    let _ = app.emit(
        "task-status",
        serde_json::json!({ "task_id": task_id, "status": "cancelled" }),
    );

    // 清理任务附件
    let _ = fs::remove_dir_all(task_attachments_dir(&project_path, &task_id));

    Ok(())
}

#[tauri::command]
pub async fn resume_task(
    app: AppHandle,
    task_manager: State<'_, TaskManager>,
    task_id: String,
    project_path: String,
    agent: String,
    session_id: String,
    _prompt: String,
    permission_mode: String,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<(), String> {
    let pair = native_pty_system()
        .openpty(PtySize {
            rows: rows.unwrap_or(50),
            cols: cols.unwrap_or(220),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let launch = crate::app_settings::get_agent_launch_spec(&agent);
    let agent_bin = launch.program.clone();
    let mut cmd = if agent == "codex" {
        let mut c = CommandBuilder::new(&agent_bin);
        c.arg("resume");
        c.arg(&session_id);
        c
    } else {
        // resume 时 session_id 已知，使用 --resume 标志
        let mut c = build_claude_cmd(&agent_bin, &permission_mode);
        c.arg("--resume");
        c.arg(&session_id);
        c
    };
    cmd.cwd(&project_path);
    setup_env(&mut cmd);
    for (key, value) in &launch.extra_env {
        cmd.env(key, value);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    register_pty_handles(&task_manager, &task_id, pair.master, writer, child)?;

    let _ = app.emit(
        "task-status",
        serde_json::json!({ "task_id": task_id, "status": "running" }),
    );

    let is_codex = agent == "codex";

    // resume 时 session_id 已知，直接查找文件并开始监视
    spawn_resume_session_watcher(
        app.clone(),
        task_id.clone(),
        project_path.clone(),
        session_id,
        is_codex,
    );
    spawn_pty_reader(
        app.clone(),
        task_id.clone(),
        "agent-output",
        "task_id",
        PtyEmitMode::Batched {
            flush_interval: PTY_EMIT_FLUSH_INTERVAL,
            max_batch_bytes: PTY_EMIT_MAX_BATCH_BYTES,
        },
        reader,
        None,
        None,
    );
    spawn_exit_monitor(app, task_id, project_path, is_codex);

    Ok(())
}

#[tauri::command]
pub async fn send_input(
    task_manager: State<'_, TaskManager>,
    task_id: String,
    data: String,
) -> Result<(), String> {
    let mut writers = task_manager.pty_writers.lock();
    if let Some(writer) = writers.get_mut(&task_id) {
        writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn resize_pty(
    task_manager: State<'_, TaskManager>,
    task_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let masters = task_manager.pty_masters.lock();
    if let Some(master) = masters.get(&task_id) {
        master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn open_shell(
    app: AppHandle,
    task_manager: State<'_, TaskManager>,
    shell_id: String,
    project_path: String,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<(), String> {
    // 先终止已存在的同 ID Shell
    {
        let child_arc = task_manager
            .child_handles
            .lock()
            .get(&shell_id)
            .cloned();
        if let Some(arc) = child_arc {
            let _ = arc.lock().unwrap().kill();
        }
        task_manager.remove_pty_handles(&shell_id);
    }

    let pair = native_pty_system()
        .openpty(PtySize {
            rows: rows.unwrap_or(24),
            cols: cols.unwrap_or(120),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = crate::platform::default_shell_command();
    let mut cmd = CommandBuilder::new(&shell.program);
    for arg in &shell.args {
        cmd.arg(arg);
    }
    cmd.cwd(&project_path);
    setup_env(&mut cmd);

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    register_pty_handles(&task_manager, &shell_id, pair.master, writer, child)?;

    // Shell 退出后清理 TaskManager 中的残留句柄
    let app_cleanup = app.clone();
    let sid_cleanup = shell_id.clone();
    let on_finish = Box::new(move || {
        let tm = app_cleanup.state::<TaskManager>();
        tm.remove_pty_handles(&sid_cleanup);
    });

    spawn_pty_reader(
        app,
        shell_id,
        "shell-output",
        "shell_id",
        PtyEmitMode::Immediate,
        reader,
        None,
        Some(on_finish),
    );

    Ok(())
}

#[tauri::command]
pub async fn kill_shell(
    task_manager: State<'_, TaskManager>,
    shell_id: String,
) -> Result<(), String> {
    let child_arc = task_manager
        .child_handles
        .lock()
        .get(&shell_id)
        .cloned();
    if let Some(arc) = child_arc {
        let _ = arc.lock().unwrap().kill();
    }
    task_manager.remove_pty_handles(&shell_id);
    Ok(())
}
