//! Hooks 注入与卸载。
//!
//! 设计:
//! - 共享 mjs 脚本 `~/.nezha/hooks/nezha-hook.mjs`
//! - Claude:解析 `~/.claude/settings.json`,在每个 event 的数组里追加一个
//!   带 `_nezha_managed: "1"` 字段的对象。Claude 对未知字段 ignore,我们靠
//!   这个 marker 实现幂等升级与精确卸载。
//! - Codex:在 `~/.codex/config.toml` 中用 `# >>> nezha-managed-begin >>>` /
//!   `# <<< nezha-managed-end <<<` 注释包裹的区域整体替换。区域外的用户内容
//!   按字符串切片完整保留。
//! - hook 脚本依靠 NEZHA_TASK_ID + NEZHA_EVENT_DIR 环境变量守卫;用户手动跑
//!   agent 时 hook 立即 exit 0,无任何副作用。

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::storage::atomic_write;

/// hook 链路可信所需的 agent 最低版本。
/// Codex 门槛取 0.131.0:该版本才加入 `--dangerously-bypass-hook-trust`,
/// 低于此版本注入的 hook 会被 trust 模型 skip 或拼 flag 报错,回退轮询 watcher。
const CODEX_HOOK_MIN_VERSION: &str = "0.131.0";
const CLAUDE_HOOK_MIN_VERSION: &str = "2.1.87";

const HOOK_SCRIPT: &str = include_str!("nezha-hook.mjs");

const NEZHA_MARKER_FIELD: &str = "_nezha_managed";

const CODEX_BEGIN: &str = "# >>> nezha-managed-begin (do not edit; managed by Nezha) >>>";
const CODEX_END: &str = "# <<< nezha-managed-end <<<";

const CLAUDE_EVENTS: &[&str] = &[
    "SessionStart",
    "UserPromptSubmit",
    "Notification",
    // PostToolUse:工具执行成功后触发(ask 模式下即用户审批通过后),
    // 用于把 input_required 复位回 running——UserPromptSubmit 在工具审批时不触发。
    "PostToolUse",
    "Stop",
    "SubagentStop",
];

const CODEX_EVENTS: &[&str] = &[
    "SessionStart",
    "UserPromptSubmit",
    "PermissionRequest",
    // 见 CLAUDE_EVENTS 的 PostToolUse 说明;Codex 自 0.124 起同样支持。
    "PostToolUse",
    "Stop",
    "SubagentStop",
];

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct HookInstallStatus {
    pub node_path: String,
    pub script_path: String,
    pub claude_installed: bool,
    pub codex_installed: bool,
    /// 安装期间发生的错误说明(展示给用户,可选)
    #[serde(skip_serializing_if = "String::is_empty", default)]
    pub error: String,
}

// ── 路径辅助 ────────────────────────────────────────────────────────────────

fn home_dir() -> Result<PathBuf, String> {
    crate::platform::home_dir().ok_or_else(|| "Cannot find home directory".to_string())
}

pub fn hooks_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".nezha").join("hooks"))
}

pub fn script_path() -> Result<PathBuf, String> {
    Ok(hooks_dir()?.join("nezha-hook.mjs"))
}

pub fn events_root() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".nezha").join("events"))
}

pub fn events_dir_for(task_id: &str) -> Result<PathBuf, String> {
    Ok(events_root()?.join(task_id))
}

fn claude_settings_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".claude").join("settings.json"))
}

fn codex_config_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".codex").join("config.toml"))
}

// ── Node 检测 ───────────────────────────────────────────────────────────────

/// 检测可用的 node 解释器路径,失败返回 None。
pub fn detect_node() -> Option<String> {
    let raw = crate::platform::detect_path("node");
    if raw.is_empty() {
        return None;
    }
    // realpath 解析,绕开 nvm/asdf 这类 shim——仅 Unix 需要。
    // Windows 上 fs::canonicalize 会产出带 `\\?\` 前缀的 verbatim 路径,
    // 该前缀 cmd.exe 不识别(与 OS 版本无关,Win10+ 同样如此),会导致 hook
    // 命令启动失败;且 Windows 用 nvm-windows 而非 symlink shim,本就无此诉求,
    // 故直接沿用 detect_path 返回的普通路径。
    #[cfg(unix)]
    {
        if let Ok(real) = fs::canonicalize(&raw) {
            return Some(real.to_string_lossy().into_owned());
        }
    }
    Some(raw)
}

// ── 脚本写入 ────────────────────────────────────────────────────────────────

pub fn write_hook_script() -> Result<PathBuf, String> {
    let dir = hooks_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("create {}: {}", dir.display(), e))?;
    let path = script_path()?;
    atomic_write(&path, HOOK_SCRIPT)?;
    Ok(path)
}

// ── Claude (命令行 --settings) ───────────────────────────────────────────────

/// Nezha 自有的 Claude hooks 配置文件路径(~/.nezha/hooks/claude-settings.json)。
/// Claude 任务启动时通过 `--settings <此路径>` 传入,完全不修改用户的
/// ~/.claude/settings.json。配置是静态的(node + 脚本路径),写一次复用。
pub fn nezha_claude_settings_path() -> Result<PathBuf, String> {
    Ok(hooks_dir()?.join("claude-settings.json"))
}

/// 构造跨 shell 安全的 hook 调用命令字符串,Claude / Codex 共用。
///
/// 形态固定为 `node "<script>"`:**裸命令名 `node` 作为首个 token**,cmd.exe /
/// PowerShell / Git Bash / sh 都把它解析成「调用 PATH 上的 node」;脚本路径用
/// 双引号包裹以容纳空格。
///
/// **不要**改回带引号的 node 全路径(`"C:\…\node.exe" "<script>"`):那样首个
/// token 是带引号的字符串,PowerShell(Claude 无 Git Bash 时、以及部分 Codex 版本
/// 的兜底 shell)会把它当字符串字面量,在第二个路径处报 `UnexpectedToken`。
/// 裸 node 也是社区注入器(claude-code-hooks 等)与 Claude/Codex 官方示例的通行写法。
/// node 必在 PATH——`detect_node()` 本就从登录 shell 的 PATH 探测,agent 进程及其
/// 派生的 hook 子 shell 都继承同一 PATH。
fn hook_command(script: &str) -> String {
    format!("node \"{}\"", script)
}

/// 构造仅含 Nezha hooks 的 Claude settings 值。只放 `hooks`(数组型,Claude 会
/// 跨来源 merge + 按 command 去重),不含任何标量 key,因此不会覆盖用户配置。
fn build_claude_settings_value(_node_path: &str, script: &str) -> Value {
    let entry = serde_json::json!({
        "hooks": [{ "type": "command", "command": hook_command(script) }],
    });
    let mut hooks = Map::new();
    for event in CLAUDE_EVENTS {
        hooks.insert((*event).to_string(), Value::Array(vec![entry.clone()]));
    }
    serde_json::json!({ "hooks": Value::Object(hooks) })
}

/// 写入 Nezha 自有 Claude settings 文件。用 serde_json 序列化——Windows 路径里的
/// 反斜杠会被正确转义;且传给 Claude 的是纯文件路径,不经历命令行字符串转义,
/// 跨平台(含 Windows CreateProcess)安全。
fn write_claude_settings(node_path: &str, script: &str) -> Result<PathBuf, String> {
    let dir = hooks_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("create {}: {}", dir.display(), e))?;
    let path = nezha_claude_settings_path()?;
    let value = build_claude_settings_value(node_path, script);
    let raw = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    atomic_write(&path, &raw)?;
    Ok(path)
}

// ── Claude 旧版注入清理(迁移用)─────────────────────────────────────────────
// 现版本走命令行 `--settings`,不再写用户 settings.json;以下函数仅用于清理
// 旧版本曾注入用户 settings.json 的 `_nezha_managed` 条目。

fn is_nezha_managed(value: &Value) -> bool {
    value
        .as_object()
        .and_then(|obj| obj.get(NEZHA_MARKER_FIELD))
        .and_then(|v| v.as_str())
        .is_some()
}

/// 从 settings JSON 对象上移除 Nezha hooks。
fn uninject_claude_value(mut root: Value) -> Value {
    let Some(root_obj) = root.as_object_mut() else {
        return root;
    };
    let Some(hooks) = root_obj.get_mut("hooks").and_then(|v| v.as_object_mut()) else {
        return root;
    };
    // 收集要清空的 event 数组名
    let event_keys: Vec<String> = hooks
        .iter()
        .filter_map(|(k, v)| v.as_array().map(|_| k.clone()))
        .collect();
    for key in event_keys {
        if let Some(arr) = hooks.get_mut(&key).and_then(|v| v.as_array_mut()) {
            arr.retain(|entry| !is_nezha_managed(entry));
        }
    }
    // 不删除空数组也不删除 hooks 对象本身,保留用户既有结构
    root
}

fn uninject_claude_settings_at(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    if raw.trim().is_empty() {
        return Ok(());
    }
    let root = serde_json::from_str::<Value>(&raw)
        .map_err(|e| format!("parse {}: {}", path.display(), e))?;
    let updated = uninject_claude_value(root);
    let raw = serde_json::to_string_pretty(&updated).map_err(|e| e.to_string())?;
    atomic_write(path, &raw)
}

// ── Codex (TOML) 注入与卸载 ──────────────────────────────────────────────────

fn build_codex_block(_node_path: &str, script: &str) -> String {
    let mut out = String::new();
    out.push_str(CODEX_BEGIN);
    out.push('\n');
    for event in CODEX_EVENTS {
        out.push_str(&format!("[[hooks.{}]]\n", event));
        out.push_str(&format!("[[hooks.{}.hooks]]\n", event));
        out.push_str("type = \"command\"\n");
        // Codex 的 `command` 只能是字符串(无 args 数组),在 Windows 上经
        // `cmd.exe /C` 执行、Unix 经 `/bin/sh -lc` 执行;裸 `node "<script>"`
        // 两边都成立。toml_quote 负责把内层的 `"` 与路径反斜杠转义成合法 TOML。
        out.push_str(&format!("command = {}\n", toml_quote(&hook_command(script))));
        out.push('\n');
    }
    out.push_str(CODEX_END);
    out.push('\n');
    out
}

/// 安全地把字符串转成 TOML basic string 字面量。
fn toml_quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04X}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// 将 Nezha 块写入(或更新)指定 TOML 内容。
fn inject_codex_text(existing: &str, node_path: &str, script: &str) -> String {
    let block = build_codex_block(node_path, script);
    if let (Some(begin), Some(end)) = (existing.find(CODEX_BEGIN), existing.find(CODEX_END)) {
        if begin < end {
            let end_line_end = existing[end..]
                .find('\n')
                .map(|n| end + n + 1)
                .unwrap_or(existing.len());
            // 计算 begin 之前需要保留的部分(剔除紧邻的换行让结果整洁)
            let before = &existing[..begin];
            let after = &existing[end_line_end..];
            let mut out = String::with_capacity(before.len() + block.len() + after.len());
            out.push_str(before);
            if !before.is_empty() && !before.ends_with('\n') {
                out.push('\n');
            }
            out.push_str(&block);
            if !after.is_empty() && !after.starts_with('\n') {
                out.push('\n');
            }
            out.push_str(after);
            return out;
        }
    }

    // 没有 marker,追加在文件末尾
    let mut out = String::with_capacity(existing.len() + block.len() + 2);
    out.push_str(existing);
    if !existing.is_empty() && !existing.ends_with('\n') {
        out.push('\n');
    }
    if !existing.is_empty() {
        out.push('\n');
    }
    out.push_str(&block);
    out
}

/// 从 TOML 内容里移除 Nezha 块。
fn uninject_codex_text(existing: &str) -> String {
    let (Some(begin), Some(end)) = (existing.find(CODEX_BEGIN), existing.find(CODEX_END)) else {
        return existing.to_string();
    };
    if begin >= end {
        return existing.to_string();
    }
    let end_line_end = existing[end..]
        .find('\n')
        .map(|n| end + n + 1)
        .unwrap_or(existing.len());
    let before = &existing[..begin];
    let after = &existing[end_line_end..];
    let mut out = String::with_capacity(before.len() + after.len());
    out.push_str(before);
    // 跳过 before 末尾若有多余空行,保持文件整洁
    while out.ends_with("\n\n") {
        out.pop();
    }
    if !after.is_empty() {
        if !out.is_empty() && !out.ends_with('\n') {
            out.push('\n');
        }
        out.push_str(after.trim_start_matches('\n'));
        if !out.ends_with('\n') {
            out.push('\n');
        }
    } else if !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }
    out
}

fn inject_codex_config_at(path: &Path, node_path: &str, script: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create {}: {}", parent.display(), e))?;
    }
    let existing = if path.exists() {
        fs::read_to_string(path).map_err(|e| e.to_string())?
    } else {
        String::new()
    };
    let updated = inject_codex_text(&existing, node_path, script);
    // 校验合法 TOML
    toml::from_str::<toml::Value>(&updated)
        .map_err(|e| format!("Nezha-injected TOML parse error: {}", e))?;
    atomic_write(path, &updated)
}

fn uninject_codex_config_at(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let existing = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let updated = uninject_codex_text(&existing);
    if updated == existing {
        return Ok(());
    }
    atomic_write(path, &updated)
}

// ── 安装状态缓存 + 信任检查 ───────────────────────────────────────────────────

/// 缓存最近一次安装/查询得到的状态,供 `usable_for` 在任务启动时零阻塞读取
/// (避免每次启动任务都跑 `which node` 子进程)。
static CACHED_STATUS: OnceLock<Mutex<HookInstallStatus>> = OnceLock::new();

fn status_cache() -> &'static Mutex<HookInstallStatus> {
    CACHED_STATUS.get_or_init(|| Mutex::new(HookInstallStatus::default()))
}

/// 写入缓存的安装状态(启动期、install/uninstall 后调用)。
pub fn cache_status(status: HookInstallStatus) {
    *status_cache().lock() = status;
}

/// 单个 agent 的 hook 就绪状态(供前端任务创建页 / 设置页展示)。
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HookAgentReadiness {
    pub agent: String,
    pub usable: bool,
    /// "ok" | "no_node" | "not_installed" | "version_too_low"
    pub reason: String,
    pub detected_version: String,
    pub min_version: String,
}

fn readiness_for(agent: &str, status: &HookInstallStatus) -> HookAgentReadiness {
    let (installed, min_version, detected) = if agent == "codex" {
        (
            status.codex_installed,
            CODEX_HOOK_MIN_VERSION,
            crate::app_settings::detect_codex_version().unwrap_or_default(),
        )
    } else {
        (
            status.claude_installed,
            CLAUDE_HOOK_MIN_VERSION,
            crate::app_settings::detect_claude_version().unwrap_or_default(),
        )
    };

    let version_ok = !detected.is_empty()
        && if agent == "codex" {
            crate::app_settings::codex_version_gte(min_version)
        } else {
            crate::app_settings::claude_version_gte(min_version)
        };

    let reason = if status.node_path.is_empty() {
        "no_node"
    } else if !installed {
        "not_installed"
    } else if !version_ok {
        "version_too_low"
    } else {
        "ok"
    };

    HookAgentReadiness {
        agent: agent.to_string(),
        usable: reason == "ok",
        reason: reason.to_string(),
        detected_version: detected,
        min_version: min_version.to_string(),
    }
}

/// 判断给定 agent 的 hook 链路是否可信、可替代轮询。
/// 三条同时满足:node 可用 + 对应 agent 已安装 hook + agent 版本 ≥ 门槛。
/// 任一不满足返回 false,调用方应回退到 `/status` 轮询路径。
///
/// 版本号统一走 `*_version_gte` 的全局带缓存探测,不再读取项目级 config 中的版本字段。
pub fn usable_for(agent: &str) -> bool {
    let status = status_cache().lock().clone();
    if status.node_path.is_empty() {
        return false;
    }
    if agent == "codex" {
        status.codex_installed && crate::app_settings::codex_version_gte(CODEX_HOOK_MIN_VERSION)
    } else {
        status.claude_installed && crate::app_settings::claude_version_gte(CLAUDE_HOOK_MIN_VERSION)
    }
}

// ── 对外入口 ────────────────────────────────────────────────────────────────

/// 启动期一次性安装。失败不阻塞,仅返回状态。
pub fn ensure_installed() -> HookInstallStatus {
    let mut status = HookInstallStatus::default();
    let Some(node) = detect_node() else {
        status.error = "node not found in PATH".into();
        return status;
    };
    status.node_path = node.clone();

    let script = match write_hook_script() {
        Ok(p) => p.to_string_lossy().into_owned(),
        Err(e) => {
            status.error = format!("write hook script: {}", e);
            return status;
        }
    };
    status.script_path = script.clone();

    // Claude:命令行 --settings 模式——把 hooks 写进 Nezha 自有文件,启动任务时通过
    // `--settings <path>` 传入,完全不修改用户的 ~/.claude/settings.json。
    match write_claude_settings(&node, &script) {
        Ok(_) => status.claude_installed = true,
        Err(e) => status.error = format!("claude settings: {}", e),
    }
    // 迁移清理:移除旧版本曾注入用户 ~/.claude/settings.json 的 nezha 条目(best-effort,
    // 失败不影响命令行模式)。
    if let Ok(p) = claude_settings_path() {
        let _ = uninject_claude_settings_at(&p);
    }

    match codex_config_path().and_then(|p| inject_codex_config_at(&p, &node, &script)) {
        Ok(_) => status.codex_installed = true,
        Err(e) => {
            if status.error.is_empty() {
                status.error = format!("codex config: {}", e);
            } else {
                status.error = format!("{}; codex config: {}", status.error, e);
            }
        }
    }

    status
}

/// 卸载 Nezha 注入的 hooks(不删除脚本本身)。
pub fn uninstall() -> Result<(), String> {
    // Claude:删除 Nezha 自有 settings 文件,并清理旧版本可能残留在用户
    // ~/.claude/settings.json 里的注入条目。
    if let Ok(p) = nezha_claude_settings_path() {
        let _ = fs::remove_file(&p);
    }
    let claude = claude_settings_path()?;
    uninject_claude_settings_at(&claude)?;
    let codex = codex_config_path()?;
    uninject_codex_config_at(&codex)?;
    Ok(())
}

/// 检查当前是否已安装(用于 UI 状态显示)。
pub fn current_status() -> HookInstallStatus {
    let mut status = HookInstallStatus {
        node_path: detect_node().unwrap_or_default(),
        script_path: script_path()
            .ok()
            .filter(|p| p.exists())
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default(),
        ..Default::default()
    };
    // Claude 命令行模式:Nezha 自有 settings 文件存在即视为就绪。
    if let Ok(p) = nezha_claude_settings_path() {
        status.claude_installed = p.exists();
    }
    if let Ok(p) = codex_config_path() {
        status.codex_installed = codex_config_has_nezha(&p);
    }
    status
}

fn codex_config_has_nezha(path: &Path) -> bool {
    let Ok(raw) = fs::read_to_string(path) else {
        return false;
    };
    raw.contains(CODEX_BEGIN) && raw.contains(CODEX_END)
}

// ── Tauri 命令 ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_hook_status() -> Result<HookInstallStatus, String> {
    tokio::task::spawn_blocking(current_status)
        .await
        .map_err(|e| e.to_string())
}

/// 返回 claude / codex 两个 agent 的 hook 就绪状态(node + 安装 + 版本)。
#[tauri::command]
pub async fn get_hook_readiness() -> Result<Vec<HookAgentReadiness>, String> {
    tokio::task::spawn_blocking(|| {
        let status = current_status();
        // 顺手刷新缓存:使任务启动时 `usable_for` 读到的 node/安装状态
        // 与此处展示给用户的实时状态保持一致(覆盖启动后才装 node 等场景)。
        cache_status(status.clone());
        vec![
            readiness_for("claude", &status),
            readiness_for("codex", &status),
        ]
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_hooks() -> Result<HookInstallStatus, String> {
    tokio::task::spawn_blocking(|| {
        let status = ensure_installed();
        cache_status(status.clone());
        status
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn uninstall_hooks() -> Result<(), String> {
    tokio::task::spawn_blocking(|| {
        let result = uninstall();
        // 卸载后刷新缓存,使后续任务回退到轮询路径
        cache_status(current_status());
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── 单元测试 ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Claude settings 构造(命令行 --settings 模式)────────────────────────

    #[test]
    fn claude_settings_value_has_all_events_no_scalar_keys() {
        let v = build_claude_settings_value("/node", "/script.mjs");
        // 顶层只有 hooks,绝不含 model 等标量 key(否则会覆盖用户配置)
        let root = v.as_object().expect("object");
        assert_eq!(root.len(), 1);
        assert!(root.contains_key("hooks"));
        for event in CLAUDE_EVENTS {
            let arr = v["hooks"][event].as_array().expect("array");
            assert_eq!(arr.len(), 1);
            // 裸 node + 双引号脚本路径,跨 shell 安全(不含 node 全路径)。
            let cmd = arr[0]["hooks"][0]["command"].as_str().unwrap();
            assert_eq!(cmd, "node \"/script.mjs\"");
        }
    }

    #[test]
    fn claude_settings_value_escapes_windows_paths() {
        // 命令是裸 node + 双引号脚本路径;序列化后脚本路径的反斜杠必须被正确转义,
        // 保证 Windows 路径是合法 JSON。
        let v = build_claude_settings_value(r"C:\node.exe", r"C:\hooks\nezha-hook.mjs");
        let raw = serde_json::to_string(&v).unwrap();
        assert!(raw.contains(r"C:\\hooks\\nezha-hook.mjs"));
        // 回环解析得到原始命令
        let parsed: Value = serde_json::from_str(&raw).unwrap();
        let cmd = parsed["hooks"]["SessionStart"][0]["hooks"][0]["command"]
            .as_str()
            .unwrap();
        assert_eq!(cmd, "node \"C:\\hooks\\nezha-hook.mjs\"");
    }

    // ── Claude 旧版注入清理(迁移)────────────────────────────────────────────

    #[test]
    fn claude_uninject_removes_nezha_only() {
        // 模拟旧版本注入后的 settings:用户条目 + 带 marker 的 nezha 条目
        let injected = serde_json::json!({
            "hooks": {
                "Stop": [
                    { "hooks": [{ "type": "command", "command": "user-script.sh" }] },
                    { NEZHA_MARKER_FIELD: "1", "hooks": [{ "type": "command", "command": "nezha" }] }
                ]
            }
        });
        let restored = uninject_claude_value(injected);
        // Stop 数组里应只剩用户的条目
        let stop = restored["hooks"]["Stop"].as_array().unwrap();
        assert_eq!(stop.len(), 1);
        assert!(!is_nezha_managed(&stop[0]));
    }

    #[test]
    fn claude_uninject_leaves_other_events_alone() {
        let user_only = serde_json::json!({
            "hooks": {
                "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "policy.sh" }] }]
            }
        });
        let restored = uninject_claude_value(user_only.clone());
        assert_eq!(restored, user_only);
    }

    // ── Codex TOML 注入 ─────────────────────────────────────────────────────

    #[test]
    fn codex_inject_into_empty_creates_block() {
        let out = inject_codex_text("", "/node", "/script.mjs");
        assert!(out.contains(CODEX_BEGIN));
        assert!(out.contains(CODEX_END));
        for event in CODEX_EVENTS {
            assert!(
                out.contains(&format!("[[hooks.{}]]", event)),
                "missing event {}",
                event
            );
        }
        // 必须是合法 TOML
        toml::from_str::<toml::Value>(&out).expect("valid toml");
    }

    #[test]
    fn codex_inject_preserves_user_content() {
        let original = "model = \"o4-mini\"\n[tui]\nnotifications = [\"agent-turn-complete\"]\n";
        let out = inject_codex_text(original, "/node", "/script.mjs");
        // 用户原内容应在 marker 块前完整保留
        let begin = out.find(CODEX_BEGIN).unwrap();
        assert!(out[..begin].contains("model = \"o4-mini\""));
        assert!(out[..begin].contains("[tui]"));
        toml::from_str::<toml::Value>(&out).expect("valid toml");
    }

    #[test]
    fn codex_inject_idempotent_upgrade() {
        let v1 = inject_codex_text("", "/oldnode", "/oldscript.mjs");
        let v2 = inject_codex_text(&v1, "/newnode", "/newscript.mjs");
        // 只应该有一对 marker
        assert_eq!(v2.matches(CODEX_BEGIN).count(), 1);
        assert_eq!(v2.matches(CODEX_END).count(), 1);
        // 命令是裸 node + 脚本路径(不含 node 全路径),升级后只剩新脚本路径。
        assert!(v2.contains("newscript"));
        assert!(!v2.contains("oldscript"));
    }

    #[test]
    fn codex_inject_preserves_user_hooks_via_toml_merge() {
        // 用户在 marker 块之外定义自己的 hooks,确保保留
        let original = "\
[[hooks.Stop]]\n\
[[hooks.Stop.hooks]]\n\
type = \"command\"\n\
command = \"echo user-stop\"\n";
        let out = inject_codex_text(original, "/node", "/script.mjs");
        // 用户的 hooks.Stop 应该在文件中保留(在 marker 块前)
        let begin = out.find(CODEX_BEGIN).unwrap();
        assert!(out[..begin].contains("echo user-stop"));
        toml::from_str::<toml::Value>(&out).expect("valid toml");
    }

    #[test]
    fn codex_uninject_removes_block_only() {
        let original = "model = \"o4-mini\"\n";
        let injected = inject_codex_text(original, "/node", "/script.mjs");
        let restored = uninject_codex_text(&injected);
        assert!(!restored.contains(CODEX_BEGIN));
        assert!(!restored.contains(CODEX_END));
        assert!(restored.contains("model = \"o4-mini\""));
    }

    #[test]
    fn codex_uninject_no_marker_is_noop() {
        let original = "model = \"o4-mini\"\n[tui]\n";
        assert_eq!(uninject_codex_text(original), original);
    }

    #[test]
    fn toml_quote_escapes_special() {
        assert_eq!(toml_quote("plain"), "\"plain\"");
        assert_eq!(toml_quote("with \"quote\""), "\"with \\\"quote\\\"\"");
        assert_eq!(toml_quote("with\\back"), "\"with\\\\back\"");
    }

    // ── 文件级集成 ──────────────────────────────────────────────────────────

    #[test]
    fn codex_inject_file_round_trip() {
        let tmp = std::env::temp_dir().join(format!("nezha-codex-{}.toml", std::process::id()));
        let _ = fs::remove_file(&tmp);

        inject_codex_config_at(&tmp, "/node", "/script.mjs").expect("inject");
        let raw = fs::read_to_string(&tmp).unwrap();
        assert!(raw.contains(CODEX_BEGIN));

        uninject_codex_config_at(&tmp).expect("uninject");
        let raw = fs::read_to_string(&tmp).unwrap();
        assert!(!raw.contains(CODEX_BEGIN));

        let _ = fs::remove_file(&tmp);
    }
}
