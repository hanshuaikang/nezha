use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::ipc::Channel;
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
    let (is_cancelled, is_manually_completed) = {
        let tm = app.state::<TaskManager>();
        let mut cancelled = tm.cancelled_tasks.lock();
        let mut manually_completed = tm.manually_completed_tasks.lock();
        (cancelled.remove(task_id), manually_completed.remove(task_id))
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
            // lazy attach 注入的占位条目不算"曾真正建立过会话"，
            // 否则 Claude 异常退出会被误标为 done。
            claude_info
                .as_ref()
                .map(|info| !info.is_placeholder)
                .unwrap_or(false)
        };
        let mut claimed = tm.claimed_session_paths.lock();
        if let Some(path) = codex_path {
            claimed.remove(&path);
        }
        if let Some(path) = claude_path {
            claimed.remove(&path);
        }
    }

    if is_cancelled || is_manually_completed {
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
    crate::event_watcher::cleanup_task_events(task_id);
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

fn save_task_texts(
    project_path: &str,
    task_id: &str,
    texts: &[String],
) -> Result<Vec<String>, String> {
    if texts.is_empty() {
        return Ok(vec![]);
    }
    let attachments_dir = task_attachments_dir(project_path, task_id);
    fs::create_dir_all(&attachments_dir).map_err(|e| e.to_string())?;
    let mut paths = Vec::new();
    for (i, text) in texts.iter().enumerate() {
        let filename = format!("paste_{}.txt", i);
        let file_path = attachments_dir.join(&filename);
        fs::write(&file_path, text.as_bytes()).map_err(|e| e.to_string())?;
        paths.push(file_path.to_string_lossy().into_owned());
    }
    Ok(paths)
}

fn release_claimed_session_paths(task_manager: &TaskManager, task_id: &str) {
    let codex_path = task_manager
        .codex_sessions
        .lock()
        .get(task_id)
        .map(|info| info.session_path.clone());
    let claude_path = task_manager
        .claude_sessions
        .lock()
        .get(task_id)
        .map(|info| info.session_path.clone());
    let mut claimed = task_manager.claimed_session_paths.lock();
    if let Some(path) = codex_path {
        claimed.remove(&path);
    }
    if let Some(path) = claude_path {
        claimed.remove(&path);
    }
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

/// 注入 Nezha hook 守卫所需的环境变量。
/// hook 脚本依靠 NEZHA_TASK_ID + NEZHA_EVENT_DIR 同时存在才工作,
/// 用户在 Nezha 之外手动跑 agent 时这些变量缺失,脚本立即 exit 0。
fn setup_nezha_env(cmd: &mut CommandBuilder, task_id: &str, agent: &str) {
    if let Ok(dir) = crate::hooks::events_dir_for(task_id) {
        cmd.env("NEZHA_TASK_ID", task_id);
        cmd.env("NEZHA_EVENT_DIR", dir.to_string_lossy().as_ref());
        cmd.env("NEZHA_AGENT", agent);
    }
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

/// 输出归宿：agent 任务用 Channel 直投单一前端订阅者，跳过事件总线的全局广播 + JSON
/// 事件 payload；shell 终端仍走 emit 事件，多面板挂载时由前端按 shell_id 筛选。
#[derive(Clone)]
enum OutputSink {
    Event {
        event_name: &'static str,
        id_key: &'static str,
    },
    Channel(Channel<String>),
}

fn send_pty_chunk(app: &AppHandle, id: &str, sink: &OutputSink, data: String) {
    match sink {
        OutputSink::Event { event_name, id_key } => {
            let mut payload = serde_json::Map::new();
            payload.insert((*id_key).to_string(), serde_json::Value::String(id.to_string()));
            payload.insert("data".to_string(), serde_json::Value::String(data));
            let _ = app.emit(event_name, serde_json::Value::Object(payload));
        }
        OutputSink::Channel(channel) => {
            let _ = channel.send(data);
        }
    }
}

fn flush_pty_batch(app: &AppHandle, id: &str, sink: &OutputSink, batch: &mut String) {
    if batch.is_empty() {
        return;
    }
    send_pty_chunk(app, id, sink, std::mem::take(batch));
}

/// 在后台线程中读取 PTY 输出，按 sink 把数据投递给前端。
///
/// - `sink`：agent 任务传 `OutputSink::Channel`（直投单订阅者），shell 传 `OutputSink::Event`
/// - `session_tx`：可选 channel，用于将原始文本转发给 session watcher
/// - `on_finish`：PTY 关闭后执行的可选清理回调
fn spawn_pty_reader(
    app: AppHandle,
    id: String,
    sink: OutputSink,
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
                let worker_sink = sink.clone();
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
                                        &worker_sink,
                                        &mut batch,
                                    );
                                }
                            }
                            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                                flush_pty_batch(
                                    &emit_app,
                                    &emit_id,
                                    &worker_sink,
                                    &mut batch,
                                );
                            }
                            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                                flush_pty_batch(
                                    &emit_app,
                                    &emit_id,
                                    &worker_sink,
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
                                Err(err) => send_pty_chunk(&app, &id, &sink, err.0),
                            }
                        } else {
                            send_pty_chunk(&app, &id, &sink, data);
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
    // 仅 macOS 注入：Claude Code v2.1.150+ 默认开 xterm 鼠标上报（mode 1002），
    // 会吞掉 macOS 端 xterm.js 的原生拖动框选；关掉后滚轮回退到 xterm scrollback。
    // Windows 上 xterm.js + Claude 默认就能框选+滚轮（v0.4.0 已验证），加这个反而
    // 让滚轮失效（见 anthropics/claude-code#51393），所以只对 macOS 启用。
    #[cfg(target_os = "macos")]
    c.env("CLAUDE_CODE_DISABLE_MOUSE", "1");
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

/// 为 Codex 命令构建 CommandBuilder，并根据 permission_mode 添加全局执行标志。
fn build_codex_cmd(agent_bin: &str, permission_mode: &str) -> CommandBuilder {
    let mut c = CommandBuilder::new(agent_bin);
    match permission_mode {
        "auto_edit" => {
            // 等价于已弃用的 --full-auto（codex >= 0.128 已移除该别名）：
            // 工作区内自动写、越界命令才升级审批。
            c.arg("--sandbox");
            c.arg("workspace-write");
            c.arg("-a");
            c.arg("on-request");
        }
        "full_access" => {
            c.arg("--dangerously-bypass-approvals-and-sandbox");
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
    texts: Option<Vec<String>>,
    cols: Option<u16>,
    rows: Option<u16>,
    on_output: Channel<String>,
) -> Result<(), String> {
    task_manager.cancelled_tasks.lock().remove(&task_id);
    task_manager
        .manually_completed_tasks
        .lock()
        .remove(&task_id);

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

    // 将文本附件保存至 .nezha/attachments/ 并获取文件路径
    // 用 spawn_blocking 把同步文件 I/O 移出 Tokio runtime（AGENTS.md 要求）
    let text_paths = {
        let project_path = project_path.clone();
        let task_id = task_id.clone();
        let texts = texts.unwrap_or_default();
        tokio::task::spawn_blocking(move || save_task_texts(&project_path, &task_id, &texts))
            .await
            .map_err(|e| e.to_string())??
    };

    // 若配置了项目级 prompt_prefix，则拼接到提示词前
    let config = crate::config::read_project_config(project_path.clone()).unwrap_or_default();
    let base_prompt = if config.agent.prompt_prefix.is_empty() {
        prompt.clone()
    } else {
        format!("{}\n{}", config.agent.prompt_prefix, prompt)
    };

    // 将图片路径追加到提示词，供 Claude Code 通过文件工具读取
    let prompt_with_images = if image_paths.is_empty() {
        base_prompt
    } else {
        format!("{}\n\n[Attached images]\n{}", base_prompt, image_paths.join("\n"))
    };

    // 将文本附件路径追加到提示词
    let final_prompt = if text_paths.is_empty() {
        prompt_with_images
    } else {
        format!("{}\n\n[Attached text files — read these for full context]\n{}", prompt_with_images, text_paths.join("\n"))
    };

    let launch = crate::app_settings::get_agent_launch_spec(&agent);
    let agent_bin = launch.program.clone();
    let is_codex = agent == "codex";

    // 版本统一走全局探测（带缓存），判断是否支持 --session-id。
    // 缓存未命中时 *_version_gte 会启子进程探测，故放进 spawn_blocking 避免阻塞 async runtime。
    let use_explicit_session = !is_codex
        && tokio::task::spawn_blocking(|| crate::app_settings::claude_version_gte("2.1.87"))
            .await
            .unwrap_or(false);

    // 预生成 session id（仅 Claude >= 2.1.87 使用）
    let pre_session_id = if use_explicit_session {
        Some(uuid::Uuid::new_v4().to_string())
    } else {
        None
    };

    // hook 链路是否可信:可信则注入 NEZHA_* 守卫变量让 hook 脚本上报事件,会话发现
    // 与状态全部由 event_watcher 驱动、跳过 /status 轮询 watcher;不可信(无 node /
    // 未安装 / 版本过低)则不注入 env、并回退轮询路径——否则旧版但仍支持 hook 的 agent
    // 会同时触发已安装 hook 与轮询 watcher,导致 session 注册/状态重复上报。
    // 先于 cmd 构建计算,因为 Codex 的 --dangerously-bypass-hook-trust 必须加在
    // `--`/positional prompt 之前。
    let use_hooks = {
        let agent = agent.clone();
        tokio::task::spawn_blocking(move || crate::hooks::usable_for(&agent))
            .await
            .unwrap_or(false)
    };
    // Claude 是否要传 --settings:hook 可信 或 (force_default_tui 开启且 Claude
    // 版本支持 tui 字段) 任一为真即需要。判断逻辑与 hooks::nezha_claude_settings_needed
    // 保持一致,使文件状态与命令行参数同步。
    let claude_pass_settings = !is_codex
        && (use_hooks
            || tokio::task::spawn_blocking(|| {
                let s = crate::app_settings::load_settings_internal();
                s.claude_force_default_tui
                    && crate::app_settings::claude_version_gte(crate::hooks::CLAUDE_TUI_MIN_VERSION)
            })
            .await
            .unwrap_or(false));

    let mut cmd = if is_codex {
        let mut c = build_codex_cmd(&agent_bin, &permission_mode);
        // Codex 对非 managed 的 command hook 默认要求 trust,Nezha 注入的是新 hash 会被
        // skip;由 Nezha 注入、来源可信,这里免 trust 直接运行。必须在 `--`/prompt 之前。
        if use_hooks {
            c.arg("--dangerously-bypass-hook-trust");
        }
        // 空 prompt 时不传 positional arg，让 CLI 进入交互式 REPL
        if !final_prompt.is_empty() {
            c.arg("--");
            c.arg(&final_prompt);
        }
        c
    } else {
        let mut c = build_claude_cmd(&agent_bin, &permission_mode);
        // Claude >= 2.1.87：通过 --session-id 指定会话，跳过 /status 发现
        if let Some(ref sid) = pre_session_id {
            c.arg("--session-id");
            c.arg(sid);
        }
        // Claude:通过 `--settings <Nezha 自有文件>` 一并注入 hooks(可信时)与
        // tui:"default"(force_default_tui 开启时)。用户 ~/.claude/settings.json 中
        // 未提及的 key 保留;`tui` 是有意覆盖,见 build_claude_settings_value 注释。
        // 守卫文件存在性:防御上游 save_* 漏调 regenerate 导致路径过时的边角场景。
        if claude_pass_settings {
            if let Ok(p) = crate::hooks::nezha_claude_settings_path() {
                if p.exists() {
                    c.arg("--settings");
                    c.arg(p.to_string_lossy().as_ref());
                }
            }
        }
        // 空 prompt 时不传 positional arg，让 Claude 进入交互式 REPL
        if !final_prompt.is_empty() {
            c.arg(&final_prompt);
        }
        c
    };
    cmd.cwd(&project_path);
    setup_env(&mut cmd);
    if use_hooks {
        setup_nezha_env(&mut cmd, &task_id, &agent);
    }
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

    // hook 可信时不创建 session 转发通道,也不拉起轮询 watcher。
    let session_tx = if use_hooks {
        None
    } else {
        let (session_tx, session_rx) = std::sync::mpsc::channel::<String>();
        spawn_status_session_watcher(
            app.clone(),
            task_id.clone(),
            project_path.clone(),
            is_codex,
            session_rx,
            pre_session_id,
            final_prompt.is_empty(),
        );
        Some(session_tx)
    };
    spawn_pty_reader(
        app.clone(),
        task_id.clone(),
        OutputSink::Channel(on_output),
        PtyEmitMode::Batched {
            flush_interval: PTY_EMIT_FLUSH_INTERVAL,
            max_batch_bytes: PTY_EMIT_MAX_BATCH_BYTES,
        },
        reader,
        session_tx,
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
    task_manager.cancelled_tasks.lock().insert(task_id.clone());
    task_manager
        .manually_completed_tasks
        .lock()
        .remove(&task_id);

    let child_arc = task_manager.child_handles.lock().get(&task_id).cloned();
    if let Some(arc) = child_arc {
        let _ = arc.lock().unwrap().kill();
    } else {
        // Orphaned/interrupted tasks have no live child in this app process.
        // Avoid leaving a stale cancellation marker that would affect a later manual resume.
        task_manager.cancelled_tasks.lock().remove(&task_id);
    }

    // 释放已声明的会话路径，确保相同提示词的任务可以重新运行
    release_claimed_session_paths(&task_manager, &task_id);

    let _ = app.emit(
        "task-status",
        serde_json::json!({ "task_id": task_id, "status": "cancelled" }),
    );

    // 清理任务附件
    let _ = fs::remove_dir_all(task_attachments_dir(&project_path, &task_id));
    crate::event_watcher::cleanup_task_events(&task_id);

    Ok(())
}

#[tauri::command]
pub async fn complete_task(
    app: AppHandle,
    task_manager: State<'_, TaskManager>,
    task_id: String,
    project_path: String,
) -> Result<(), String> {
    task_manager
        .manually_completed_tasks
        .lock()
        .insert(task_id.clone());
    task_manager.cancelled_tasks.lock().remove(&task_id);

    let child_arc = task_manager.child_handles.lock().get(&task_id).cloned();
    if let Some(arc) = child_arc {
        if let Ok(mut child) = arc.lock() {
            let _ = child.kill();
        }
    } else {
        // No live child means no exit monitor will consume this marker.
        task_manager
            .manually_completed_tasks
            .lock()
            .remove(&task_id);
    }

    // 释放已声明的会话路径，确保相同提示词的任务可以重新运行
    release_claimed_session_paths(&task_manager, &task_id);

    let _ = app.emit(
        "task-status",
        serde_json::json!({ "task_id": task_id, "status": "done" }),
    );

    // 清理任务附件
    let _ = fs::remove_dir_all(task_attachments_dir(&project_path, &task_id));
    crate::event_watcher::cleanup_task_events(&task_id);

    Ok(())
}

#[tauri::command]
pub async fn get_active_task_ids(
    task_manager: State<'_, TaskManager>,
) -> Result<Vec<String>, String> {
    Ok(task_manager
        .child_handles
        .lock()
        .keys()
        .cloned()
        .collect())
}

#[tauri::command]
pub async fn reset_task_process(
    task_manager: State<'_, TaskManager>,
    task_id: String,
) -> Result<(), String> {
    task_manager.cancelled_tasks.lock().remove(&task_id);
    task_manager
        .manually_completed_tasks
        .lock()
        .remove(&task_id);
    let child_arc = {
        let mut masters = task_manager.pty_masters.lock();
        let mut writers = task_manager.pty_writers.lock();
        let mut children = task_manager.child_handles.lock();
        masters.remove(&task_id);
        writers.remove(&task_id);
        children.remove(&task_id)
    };

    if let Some(arc) = child_arc {
        let _ = arc.lock().unwrap().kill();
    }

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
    on_output: Channel<String>,
) -> Result<(), String> {
    task_manager.cancelled_tasks.lock().remove(&task_id);
    task_manager
        .manually_completed_tasks
        .lock()
        .remove(&task_id);

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
    // hook 可信时会话发现/状态由 event_watcher 驱动,跳过轮询 watcher;否则回退,
    // 且不注入 NEZHA_* 守卫变量,避免旧版但已安装 hook 的 agent 与轮询路径并行重复
    // 上报。版本统一走全局带缓存的探测。
    // 先于 cmd 构建计算,因 Codex 的 bypass flag 需加在 `resume` 子命令之前。
    let use_hooks = {
        let agent = agent.clone();
        tokio::task::spawn_blocking(move || crate::hooks::usable_for(&agent))
            .await
            .unwrap_or(false)
    };
    let claude_pass_settings = agent != "codex"
        && (use_hooks
            || tokio::task::spawn_blocking(|| {
                let s = crate::app_settings::load_settings_internal();
                s.claude_force_default_tui
                    && crate::app_settings::claude_version_gte(crate::hooks::CLAUDE_TUI_MIN_VERSION)
            })
            .await
            .unwrap_or(false));

    let mut cmd = if agent == "codex" {
        let mut c = build_codex_cmd(&agent_bin, &permission_mode);
        // Nezha 注入的 hook 默认未信任会被 Codex skip;来源可信,免 trust 直接运行。
        if use_hooks {
            c.arg("--dangerously-bypass-hook-trust");
        }
        c.arg("resume");
        c.arg(&session_id);
        c
    } else {
        // resume 时 session_id 已知，使用 --resume 标志
        let mut c = build_claude_cmd(&agent_bin, &permission_mode);
        c.arg("--resume");
        c.arg(&session_id);
        // 同 run_task:hooks + force_default_tui 共用 --settings 通道。
        if claude_pass_settings {
            if let Ok(p) = crate::hooks::nezha_claude_settings_path() {
                if p.exists() {
                    c.arg("--settings");
                    c.arg(p.to_string_lossy().as_ref());
                }
            }
        }
        c
    };
    cmd.cwd(&project_path);
    setup_env(&mut cmd);
    if use_hooks {
        setup_nezha_env(&mut cmd, &task_id, &agent);
    }
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

    // resume 时 session_id 已知，直接查找文件并开始监视(hook 可信时跳过)
    if !use_hooks {
        spawn_resume_session_watcher(
            app.clone(),
            task_id.clone(),
            project_path.clone(),
            session_id,
            is_codex,
        );
    }
    spawn_pty_reader(
        app.clone(),
        task_id.clone(),
        OutputSink::Channel(on_output),
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
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
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
    // 兜底：拒绝畸形尺寸。FitAddon 在容器 display:none 时可能算出 cols=2，前端
    // 三层防御漏掉的话，会把 Claude Code / Codex 这类全屏 TUI 通过 SIGWINCH
    // 排版打散到一字一行且不可恢复。前端任何路径有 bug，这里也得挡住。
    if cols < 2 || rows < 2 || cols > 10_000 || rows > 10_000 {
        return Ok(());
    }
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
        OutputSink::Event {
            event_name: "shell-output",
            id_key: "shell_id",
        },
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
