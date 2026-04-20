use std::fs;
use std::path::Path;

use crate::storage::atomic_write;

const DEFAULT_CONFIG: &str = r#"# Nezha project configuration
# https://github.com/hanshuaikang/nezha

[agent]
# Default agent to use for new tasks: "claude" or "codex"
default = "claude"
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
    #[serde(default)]
    pub prompt_prefix: String,
    #[serde(default)]
    pub claude_version: String,
    #[serde(default)]
    pub codex_version: String,
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

impl Default for ProjectConfig {
    fn default() -> Self {
        ProjectConfig {
            agent: AgentConfig {
                default: "claude".to_string(),
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

    Ok(config)
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
