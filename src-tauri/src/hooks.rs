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

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::storage::atomic_write;

const HOOK_SCRIPT: &str = include_str!("nezha-hook.mjs");

const NEZHA_MARKER_FIELD: &str = "_nezha_managed";
const NEZHA_MARKER_VALUE: &str = "1";

const CODEX_BEGIN: &str = "# >>> nezha-managed-begin (do not edit; managed by Nezha) >>>";
const CODEX_END: &str = "# <<< nezha-managed-end <<<";

const CLAUDE_EVENTS: &[&str] = &[
    "SessionStart",
    "UserPromptSubmit",
    "Notification",
    "Stop",
    "SubagentStop",
];

const CODEX_EVENTS: &[&str] = &["SessionStart", "UserPromptSubmit", "Stop", "SubagentStop"];

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
    // realpath 解析,绕开 nvm/asdf 这类 shim
    match fs::canonicalize(&raw) {
        Ok(real) => Some(real.to_string_lossy().into_owned()),
        Err(_) => Some(raw),
    }
}

// ── 脚本写入 ────────────────────────────────────────────────────────────────

pub fn write_hook_script() -> Result<PathBuf, String> {
    let dir = hooks_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("create {}: {}", dir.display(), e))?;
    let path = script_path()?;
    atomic_write(&path, HOOK_SCRIPT)?;
    Ok(path)
}

// ── Claude (JSON) 注入与卸载 ─────────────────────────────────────────────────

fn nezha_claude_entry(node_path: &str, script_path: &str) -> Value {
    let cmd = format!("\"{}\" \"{}\"", node_path, script_path);
    serde_json::json!({
        NEZHA_MARKER_FIELD: NEZHA_MARKER_VALUE,
        "hooks": [{ "type": "command", "command": cmd }],
    })
}

fn is_nezha_managed(value: &Value) -> bool {
    value
        .as_object()
        .and_then(|obj| obj.get(NEZHA_MARKER_FIELD))
        .and_then(|v| v.as_str())
        .is_some()
}

/// 在 settings JSON 对象上注入 Nezha hooks。返回更新后的 JSON。
fn inject_claude_value(mut root: Value, node_path: &str, script: &str) -> Value {
    let obj = root.as_object_mut();
    let root_obj = if let Some(obj) = obj {
        obj
    } else {
        // 文件存在但是不是对象,直接覆盖为对象(极端兜底)
        root = Value::Object(Map::new());
        root.as_object_mut().expect("just set to object")
    };

    let hooks = root_obj
        .entry("hooks".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !hooks.is_object() {
        *hooks = Value::Object(Map::new());
    }
    let hooks_obj = hooks.as_object_mut().expect("ensured to be object");

    for event in CLAUDE_EVENTS {
        let arr = hooks_obj
            .entry((*event).to_string())
            .or_insert_with(|| Value::Array(Vec::new()));
        if !arr.is_array() {
            *arr = Value::Array(Vec::new());
        }
        let arr_vec = arr.as_array_mut().expect("ensured to be array");
        // 移除旧的 nezha 条目(幂等升级)
        arr_vec.retain(|entry| !is_nezha_managed(entry));
        // 追加最新条目
        arr_vec.push(nezha_claude_entry(node_path, script));
    }

    root
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

fn inject_claude_settings_at(path: &Path, node_path: &str, script: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create {}: {}", parent.display(), e))?;
    }
    let root = if path.exists() {
        let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
        if raw.trim().is_empty() {
            Value::Object(Map::new())
        } else {
            serde_json::from_str::<Value>(&raw)
                .map_err(|e| format!("parse {}: {}", path.display(), e))?
        }
    } else {
        Value::Object(Map::new())
    };
    let updated = inject_claude_value(root, node_path, script);
    let raw = serde_json::to_string_pretty(&updated).map_err(|e| e.to_string())?;
    atomic_write(path, &raw)
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

fn build_codex_block(node_path: &str, script: &str) -> String {
    let mut out = String::new();
    out.push_str(CODEX_BEGIN);
    out.push('\n');
    for event in CODEX_EVENTS {
        out.push_str(&format!("[[hooks.{}]]\n", event));
        out.push_str(&format!("[[hooks.{}.hooks]]\n", event));
        out.push_str("type = \"command\"\n");
        out.push_str(&format!(
            "command = {}\n",
            toml_quote(&format!("\"{}\" \"{}\"", node_path, script))
        ));
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

    match claude_settings_path().and_then(|p| inject_claude_settings_at(&p, &node, &script)) {
        Ok(_) => status.claude_installed = true,
        Err(e) => status.error = format!("claude settings: {}", e),
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
    if let Ok(p) = claude_settings_path() {
        status.claude_installed = claude_settings_has_nezha(&p);
    }
    if let Ok(p) = codex_config_path() {
        status.codex_installed = codex_config_has_nezha(&p);
    }
    status
}

fn claude_settings_has_nezha(path: &Path) -> bool {
    let Ok(raw) = fs::read_to_string(path) else {
        return false;
    };
    let Ok(root) = serde_json::from_str::<Value>(&raw) else {
        return false;
    };
    root.get("hooks")
        .and_then(|h| h.as_object())
        .map(|hooks| {
            hooks.values().any(|arr| {
                arr.as_array()
                    .map(|entries| entries.iter().any(is_nezha_managed))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
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

#[tauri::command]
pub async fn install_hooks() -> Result<HookInstallStatus, String> {
    tokio::task::spawn_blocking(ensure_installed)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn uninstall_hooks() -> Result<(), String> {
    tokio::task::spawn_blocking(uninstall)
        .await
        .map_err(|e| e.to_string())?
}

// ── 单元测试 ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Claude JSON 注入 ────────────────────────────────────────────────────

    #[test]
    fn claude_inject_into_empty() {
        let v = inject_claude_value(serde_json::json!({}), "/node", "/script.mjs");
        for event in CLAUDE_EVENTS {
            let arr = v["hooks"][event].as_array().expect("array");
            assert_eq!(arr.len(), 1);
            assert!(is_nezha_managed(&arr[0]));
        }
    }

    #[test]
    fn claude_inject_preserves_user_entries() {
        let original = serde_json::json!({
            "permissions": { "allow": ["Bash(ls)"] },
            "hooks": {
                "Stop": [{ "hooks": [{ "type": "command", "command": "user-script.sh" }] }],
                "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "policy.sh" }] }]
            }
        });
        let v = inject_claude_value(original.clone(), "/node", "/script.mjs");

        // 用户的 PreToolUse 应原封不动
        assert_eq!(v["hooks"]["PreToolUse"], original["hooks"]["PreToolUse"]);
        // 用户的 permissions 应保留
        assert_eq!(v["permissions"], original["permissions"]);
        // 用户的 Stop 应保留 + 追加 Nezha 条目
        let stop = v["hooks"]["Stop"].as_array().unwrap();
        assert_eq!(stop.len(), 2);
        assert!(!is_nezha_managed(&stop[0]));
        assert!(is_nezha_managed(&stop[1]));
    }

    #[test]
    fn claude_inject_idempotent_upgrade() {
        let v1 = inject_claude_value(serde_json::json!({}), "/oldnode", "/oldscript.mjs");
        let v2 = inject_claude_value(v1.clone(), "/newnode", "/newscript.mjs");
        // 升级后每个 event 仍然只有一个 Nezha 条目
        for event in CLAUDE_EVENTS {
            let arr = v2["hooks"][event].as_array().unwrap();
            let nezha_count = arr.iter().filter(|e| is_nezha_managed(e)).count();
            assert_eq!(nezha_count, 1, "event {} should have exactly 1 nezha entry", event);
            let cmd = arr[0]["hooks"][0]["command"].as_str().unwrap();
            assert!(cmd.contains("newnode"), "should reference new node path");
            assert!(cmd.contains("newscript"), "should reference new script path");
        }
    }

    #[test]
    fn claude_uninject_removes_nezha_only() {
        let original = serde_json::json!({
            "hooks": {
                "Stop": [{ "hooks": [{ "type": "command", "command": "user-script.sh" }] }]
            }
        });
        let injected = inject_claude_value(original.clone(), "/node", "/script.mjs");
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
        assert!(v2.contains("newnode"));
        assert!(v2.contains("newscript"));
        assert!(!v2.contains("oldnode"));
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
    fn claude_inject_file_round_trip() {
        let tmp = std::env::temp_dir().join(format!("nezha-claude-{}.json", std::process::id()));
        let _ = fs::remove_file(&tmp);

        inject_claude_settings_at(&tmp, "/node", "/script.mjs").expect("inject");
        let raw = fs::read_to_string(&tmp).unwrap();
        let v: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(v["hooks"]["Stop"].as_array().unwrap().len(), 1);

        uninject_claude_settings_at(&tmp).expect("uninject");
        let raw = fs::read_to_string(&tmp).unwrap();
        let v: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(v["hooks"]["Stop"].as_array().unwrap().len(), 0);

        let _ = fs::remove_file(&tmp);
    }

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
