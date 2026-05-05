use std::fs;
use std::path::Path;

use crate::storage::atomic_write;

const DEFAULT_CONFIG: &str = r#"# Nezha project configuration
# https://github.com/hanshuaikang/nezha

[agent]
# Default agent to use for new tasks: "claude" or "codex"
default = "claude"
# Default permission mode for new tasks: "ask", "auto_edit", or "full_access"
default_permission_mode = "ask"
# Text automatically prepended (followed by a newline) to every task prompt
prompt_prefix = ""

# Detected version of Claude Code (auto-populated, can be left empty)
claude_version = ""
# Detected version of Codex (auto-populated, can be left empty)
codex_version = ""

[git]
# Prompt used when generating commit messages via the AI agent
commit_prompt = "You are a git commit message generator. Based on the provided git diff, write a concise and descriptive commit message. Follow these rules:\n1. Use the imperative mood (e.g., \"Add feature\" not \"Added feature\")\n2. First line: type(scope): short summary (50 chars or less)\n   Types: feat, fix, docs, style, refactor, test, chore\n3. If needed, add a blank line then a brief body explaining what and why\n4. Output ONLY the commit message text, no explanations or markdown formatting"
"#;

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct AgentConfig {
    pub default: String,
    #[serde(default = "default_permission_mode")]
    pub default_permission_mode: String,
    #[serde(default)]
    pub prompt_prefix: String,
    #[serde(default)]
    pub claude_version: String,
    #[serde(default)]
    pub codex_version: String,
}

fn default_permission_mode() -> String {
    "ask".to_string()
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct GitConfig {
    pub commit_prompt: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct ProjectConfig {
    pub agent: AgentConfig,
    pub git: GitConfig,
}

const CODEX_SESSION_LINK_HOOK: &str = r#"#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path


def main():
    task_id = os.environ.get("NEZHA_TASK_ID")
    token = os.environ.get("NEZHA_HOOK_TOKEN")
    link_path = os.environ.get("NEZHA_SESSION_LINK_PATH")
    project_path = os.environ.get("NEZHA_PROJECT_PATH")
    if not task_id or not token or not link_path or not project_path:
        return

    try:
        payload = json.load(sys.stdin)
    except Exception:
        return

    if payload.get("hook_event_name") != "SessionStart":
        return
    if payload.get("cwd") != project_path:
        return

    data = {
        "task_id": task_id,
        "token": token,
        "session_id": payload.get("session_id") or "",
        "session_path": payload.get("transcript_path") or "",
        "cwd": payload.get("cwd") or "",
    }

    try:
        path = Path(link_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
    except Exception:
        return


if __name__ == "__main__":
    main()
"#;

impl Default for ProjectConfig {
    fn default() -> Self {
        ProjectConfig {
            agent: AgentConfig {
                default: "claude".to_string(),
                default_permission_mode: "ask".to_string(),
                prompt_prefix: String::new(),
                claude_version: String::new(),
                codex_version: String::new(),
            },
            git: GitConfig {
                commit_prompt: "You are a git commit message generator. Based on the provided git diff, write a concise and descriptive commit message. Follow these rules:\n1. Use the imperative mood (e.g., \"Add feature\" not \"Added feature\")\n2. First line: type(scope): short summary (50 chars or less)\n   Types: feat, fix, docs, style, refactor, test, chore\n3. If needed, add a blank line then a brief body explaining what and why\n4. Output ONLY the commit message text, no explanations or markdown formatting".to_string(),
            },
        }
    }
}

/// Creates `.nezha/config.toml` in the project directory if it doesn't already exist.
/// Also ensures `.nezha/attachments/` exists.
/// Returns the parsed config.
#[tauri::command]
pub fn init_project_config(project_path: String) -> Result<ProjectConfig, String> {
    let nezha_dir = Path::new(&project_path).join(".nezha");
    let config_path = nezha_dir.join("config.toml");
    let attachments_dir = nezha_dir.join("attachments");

    fs::create_dir_all(&attachments_dir).map_err(|e| e.to_string())?;

    if !config_path.exists() {
        fs::write(&config_path, DEFAULT_CONFIG).map_err(|e| e.to_string())?;
    }

    let raw = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let mut config: ProjectConfig = toml::from_str(&raw).unwrap_or_default();

    // 首次打开或版本字段为空时，自动检测并回写
    let mut updated = false;
    if config.agent.claude_version.is_empty() {
        if let Some(v) = crate::app_settings::detect_claude_version() {
            config.agent.claude_version = v;
            updated = true;
        }
    }
    if config.agent.codex_version.is_empty() {
        if let Some(v) = crate::app_settings::detect_codex_version() {
            config.agent.codex_version = v;
            updated = true;
        }
    }
    if updated {
        if let Ok(raw) = toml::to_string_pretty(&config) {
            let _ = atomic_write(&config_path, &raw);
        }
    }

    let _ = ensure_codex_project_hook(&project_path);

    Ok(config)
}

pub(crate) fn codex_session_link_path(project_path: &str, task_id: &str) -> std::path::PathBuf {
    Path::new(project_path)
        .join(".nezha")
        .join("session-links")
        .join(format!("{task_id}.json"))
}

pub(crate) fn ensure_codex_project_hook(project_path: &str) -> Result<(), String> {
    let project = Path::new(project_path);
    let codex_dir = project.join(".codex");
    let nezha_hooks_dir = project.join(".nezha").join("hooks");
    fs::create_dir_all(&codex_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&nezha_hooks_dir).map_err(|e| e.to_string())?;

    let script_path = nezha_hooks_dir.join("codex_session_link.py");
    // Windows 上 Python 安装位置不固定；探测不到就跳过 hook 安装（仍保留对旧 entry 的清理）。
    let command = build_codex_hook_command(&script_path);
    if command.is_some() {
        atomic_write(&script_path, CODEX_SESSION_LINK_HOOK)?;
    }
    let hooks_path = codex_dir.join("hooks.json");
    let mut root = if hooks_path.exists() {
        let raw = fs::read_to_string(&hooks_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<serde_json::Value>(&raw)
            .map_err(|e| format!("Invalid Codex hooks.json: {e}"))?
    } else {
        serde_json::json!({})
    };
    let original_root = root.clone();

    let Some(root_obj) = root.as_object_mut() else {
        return Err("Invalid Codex hooks.json: root must be an object".to_string());
    };
    let hooks = root_obj
        .entry("hooks".to_string())
        .or_insert_with(|| serde_json::json!({}));
    let Some(hooks_obj) = hooks.as_object_mut() else {
        return Err("Invalid Codex hooks.json: hooks must be an object".to_string());
    };
    let session_start = hooks_obj
        .entry("SessionStart".to_string())
        .or_insert_with(|| serde_json::json!([]));
    let Some(groups) = session_start.as_array_mut() else {
        return Err("Invalid Codex hooks.json: SessionStart must be an array".to_string());
    };

    // 先按 hook 项级别清理掉所有引用 nezha 链接脚本的旧 entry（含路径已失效或多 Nezha 安装位置
    // 写入的情况），再插入当前路径，保证 SessionStart 中只存在一份指向当前安装的 nezha hook，
    // 同时不影响用户在同一 group 内自行配置的其他 hook。
    // 同时匹配 `.nezha` 目录与脚本文件名，兼容 Unix `/` 与 Windows `\` 两种路径分隔符；
    // 用户若自定义同名脚本但不在 `.nezha/hooks/` 下，则不会被清理。
    let is_nezha_hook = |item: &serde_json::Value| -> bool {
        item.get("type").and_then(serde_json::Value::as_str) == Some("command")
            && item
                .get("command")
                .and_then(serde_json::Value::as_str)
                .map(|value| value.contains(".nezha") && value.contains("codex_session_link.py"))
                .unwrap_or(false)
    };
    for group in groups.iter_mut() {
        if let Some(items) = group.get_mut("hooks").and_then(serde_json::Value::as_array_mut) {
            items.retain(|item| !is_nezha_hook(item));
        }
    }
    groups.retain(|group| {
        group
            .get("hooks")
            .and_then(serde_json::Value::as_array)
            .map(|items| !items.is_empty())
            .unwrap_or(true)
    });
    if let Some(cmd) = command {
        groups.push(serde_json::json!({
            "matcher": "startup|resume",
            "hooks": [
                {
                    "type": "command",
                    "command": cmd,
                    "timeout": 5
                }
            ]
        }));
    }

    if root == original_root {
        return Ok(());
    }
    let raw = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
    atomic_write(&hooks_path, &raw)?;

    Ok(())
}

/// 生成 Codex `hooks.json` 中调用 nezha 链接脚本的命令字符串。
/// 平台差异：
/// - Unix：`/usr/bin/env python3 '<path>'`，单引号转义按 sh 规则处理。
/// - Windows：通过 `platform::detect_path` 探测 `python` / `python3` 的绝对路径，
///   缺失时返回 None，让上层跳过 hook 安装。命令以 `"<python>" "<script>"` 形式写入，
///   依赖 cmd.exe 双引号规则。
fn build_codex_hook_command(script_path: &Path) -> Option<String> {
    let script = script_path.to_string_lossy();

    #[cfg(not(target_os = "windows"))]
    {
        Some(format!("/usr/bin/env python3 {}", posix_single_quote(&script)))
    }

    #[cfg(target_os = "windows")]
    {
        let python = ["python", "python3"]
            .iter()
            .map(|name| crate::platform::detect_path(name))
            .find(|p| !p.is_empty())?;
        Some(format!(
            "{} {}",
            cmd_double_quote(&python),
            cmd_double_quote(&script),
        ))
    }
}

#[cfg(not(target_os = "windows"))]
fn posix_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(target_os = "windows")]
fn cmd_double_quote(value: &str) -> String {
    // cmd.exe 中双引号内反斜杠按字面量解析，无需转义；嵌入的双引号用 `\"` 形式转义。
    format!("\"{}\"", value.replace('"', "\\\""))
}

/// Reads `.nezha/config.toml` from the project directory.
/// Returns the default config if the file doesn't exist yet.
#[tauri::command]
pub fn read_project_config(project_path: String) -> Result<ProjectConfig, String> {
    let config_path = Path::new(&project_path).join(".nezha").join("config.toml");
    if !config_path.exists() {
        return Ok(ProjectConfig::default());
    }
    let raw = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let config: ProjectConfig = toml::from_str(&raw).unwrap_or_default();
    Ok(config)
}

/// Writes updated config to `.nezha/config.toml`, creating the directory if needed.
#[tauri::command]
pub fn write_project_config(project_path: String, config: ProjectConfig) -> Result<(), String> {
    let nezha_dir = Path::new(&project_path).join(".nezha");
    fs::create_dir_all(&nezha_dir).map_err(|e| e.to_string())?;
    let config_path = nezha_dir.join("config.toml");
    let raw = toml::to_string_pretty(&config).map_err(|e| e.to_string())?;
    atomic_write(&config_path, &raw)
}

fn home_dir() -> Result<std::path::PathBuf, String> {
    crate::platform::home_dir()
        .ok_or_else(|| "Cannot find home directory".to_string())
}

fn agent_config_path(agent: &str) -> Result<std::path::PathBuf, String> {
    let home = home_dir()?;
    match agent {
        "claude" => Ok(home.join(".claude").join("settings.json")),
        "codex" => Ok(home.join(".codex").join("config.toml")),
        _ => Err(format!("Unknown agent: {}", agent)),
    }
}

#[tauri::command]
pub fn get_agent_config_file_path(agent: String) -> Result<String, String> {
    Ok(agent_config_path(&agent)?.to_string_lossy().into_owned())
}

/// Reads the local settings file for the given agent ("claude" or "codex").
/// Returns None if the file doesn't exist.
#[tauri::command]
pub fn read_agent_config_file(agent: String) -> Result<Option<String>, String> {
    let path = agent_config_path(&agent)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

/// Writes raw content back to the agent's local settings file.
#[tauri::command]
pub fn write_agent_config_file(agent: String, content: String) -> Result<(), String> {
    let path = agent_config_path(&agent)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    atomic_write(&path, &content)
}
