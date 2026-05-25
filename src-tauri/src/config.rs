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

[permissions]
# Default permission mode for new tasks: "ask", "auto_edit", or "full_access"
default_mode = "ask"
# Highest permission mode allowed for tasks in this project
max_mode = "auto_edit"
# Ask for confirmation before launching full access tasks
confirm_full_access = true

[prompt_templates]
templates = []

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
pub struct PermissionConfig {
    #[serde(default = "default_permission_mode", alias = "default_permission_mode")]
    pub default_mode: String,
    #[serde(default = "default_max_permission_mode")]
    pub max_mode: String,
    #[serde(default = "default_confirm_full_access")]
    pub confirm_full_access: bool,
}

fn default_max_permission_mode() -> String {
    "auto_edit".to_string()
}

fn default_confirm_full_access() -> bool {
    true
}

impl Default for PermissionConfig {
    fn default() -> Self {
        PermissionConfig {
            default_mode: "ask".to_string(),
            max_mode: "auto_edit".to_string(),
            confirm_full_access: true,
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct PromptTemplate {
    pub id: String,
    pub name: String,
    pub content: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Default)]
pub struct PromptTemplateConfig {
    #[serde(default)]
    pub templates: Vec<PromptTemplate>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct GitConfig {
    pub commit_prompt: String,
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct ProjectConfig {
    pub agent: AgentConfig,
    pub permissions: PermissionConfig,
    pub prompt_templates: PromptTemplateConfig,
    pub git: GitConfig,
    #[serde(skip)]
    permissions_configured: bool,
    #[serde(skip)]
    permissions_default_mode_configured: bool,
    #[serde(skip)]
    prompt_templates_configured: bool,
}

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
            permissions: PermissionConfig::default(),
            prompt_templates: PromptTemplateConfig::default(),
            git: GitConfig {
                commit_prompt: "You are a git commit message generator. Based on the provided git diff, write a concise and descriptive commit message. Follow these rules:\n1. Use the imperative mood (e.g., \"Add feature\" not \"Added feature\")\n2. First line: type(scope): short summary (50 chars or less)\n   Types: feat, fix, docs, style, refactor, test, chore\n3. If needed, add a blank line then a brief body explaining what and why\n4. Output ONLY the commit message text, no explanations or markdown formatting".to_string(),
            },
            permissions_configured: true,
            permissions_default_mode_configured: true,
            prompt_templates_configured: true,
        }
    }
}

#[derive(serde::Deserialize)]
struct ProjectConfigToml {
    agent: AgentConfig,
    permissions: Option<PermissionConfigToml>,
    prompt_templates: Option<PromptTemplateConfig>,
    git: GitConfig,
}

#[derive(serde::Deserialize)]
struct PermissionConfigToml {
    #[serde(alias = "default_permission_mode")]
    default_mode: Option<String>,
    max_mode: Option<String>,
    confirm_full_access: Option<bool>,
}

impl PermissionConfigToml {
    fn into_config(self, default_mode: String) -> PermissionConfig {
        PermissionConfig {
            default_mode: self.default_mode.unwrap_or(default_mode),
            max_mode: self.max_mode.unwrap_or_else(default_max_permission_mode),
            confirm_full_access: self
                .confirm_full_access
                .unwrap_or_else(default_confirm_full_access),
        }
    }
}

impl<'de> serde::Deserialize<'de> for ProjectConfig {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let raw = ProjectConfigToml::deserialize(deserializer)?;
        let permissions_configured = raw.permissions.is_some();
        let permissions_default_mode_configured = raw
            .permissions
            .as_ref()
            .and_then(|permissions| permissions.default_mode.as_ref())
            .is_some();
        let prompt_templates_configured = raw.prompt_templates.is_some();
        let legacy_default_mode = if permission_rank(&raw.agent.default_permission_mode).is_some() {
            raw.agent.default_permission_mode.clone()
        } else {
            default_permission_mode()
        };
        let permissions = raw.permissions.map_or_else(
            || PermissionConfig {
                default_mode: legacy_default_mode.clone(),
                max_mode: max_permission_mode_at_least(&legacy_default_mode),
                ..PermissionConfig::default()
            },
            |permissions| permissions.into_config(legacy_default_mode),
        );

        Ok(ProjectConfig {
            agent: raw.agent,
            permissions,
            prompt_templates: raw.prompt_templates.unwrap_or_default(),
            git: raw.git,
            permissions_configured,
            permissions_default_mode_configured,
            prompt_templates_configured,
        })
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

fn permission_rank(mode: &str) -> Option<u8> {
    match mode {
        "ask" => Some(0),
        "auto_edit" => Some(1),
        "full_access" => Some(2),
        _ => None,
    }
}

fn max_permission_mode_at_least(mode: &str) -> String {
    let default_max = default_max_permission_mode();
    let Some(mode_rank) = permission_rank(mode) else {
        return default_max;
    };
    let default_max_rank = permission_rank(&default_max).unwrap_or(0);
    if mode_rank > default_max_rank {
        mode.to_string()
    } else {
        default_max
    }
}

pub(crate) fn effective_default_permission_mode(config: &ProjectConfig) -> String {
    if config.permissions_default_mode_configured
        && permission_rank(&config.permissions.default_mode).is_some()
    {
        return config.permissions.default_mode.clone();
    }
    if permission_rank(&config.agent.default_permission_mode).is_some() {
        return config.agent.default_permission_mode.clone();
    }
    "ask".to_string()
}

pub(crate) fn effective_max_permission_mode(config: &ProjectConfig) -> String {
    if config.permissions_configured {
        return config.permissions.max_mode.clone();
    }
    if permission_rank(&config.agent.default_permission_mode).is_some() {
        return config.agent.default_permission_mode.clone();
    }
    default_max_permission_mode()
}

pub(crate) fn validate_permission_against_max(
    requested: &str,
    max_mode: &str,
) -> Result<(), String> {
    let requested_rank = permission_rank(requested)
        .ok_or_else(|| format!("Unknown permission mode: {}", requested))?;
    let max_rank = permission_rank(max_mode)
        .ok_or_else(|| format!("Unknown max permission mode: {}", max_mode))?;

    if requested_rank > max_rank {
        return Err(format!(
            "Permission mode '{}' exceeds project maximum '{}'",
            requested, max_mode
        ));
    }

    Ok(())
}

pub(crate) fn validate_permission_mode(project_path: &str, requested: &str) -> Result<(), String> {
    let config = read_project_config(project_path.to_string())?;
    validate_permission_against_max(requested, &effective_max_permission_mode(&config))
}

fn merge_project_config_for_save(
    existing: Option<ProjectConfig>,
    mut incoming: ProjectConfig,
) -> ProjectConfig {
    if let Some(existing) = existing {
        if !incoming.permissions_configured {
            incoming.permissions = existing.permissions;
            incoming.permissions_configured = true;
            incoming.permissions_default_mode_configured = true;
        }
        if !incoming.prompt_templates_configured {
            incoming.prompt_templates = existing.prompt_templates;
            incoming.prompt_templates_configured = true;
        }
    }

    incoming
}

/// Writes updated config to `.nezha/config.toml`, creating the directory if needed.
#[tauri::command]
pub fn write_project_config(project_path: String, config: ProjectConfig) -> Result<(), String> {
    let nezha_dir = Path::new(&project_path).join(".nezha");
    fs::create_dir_all(&nezha_dir).map_err(|e| e.to_string())?;
    let config_path = nezha_dir.join("config.toml");
    let existing = if config_path.exists() {
        let raw = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        Some(toml::from_str(&raw).unwrap_or_default())
    } else {
        None
    };
    let config = merge_project_config_for_save(existing, config);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_config_without_new_sections_deserializes() {
        let raw = r#"
[agent]
default = "claude"
default_permission_mode = "auto_edit"
prompt_prefix = ""
claude_version = ""
codex_version = ""

[git]
commit_prompt = "commit"
"#;

        let config: ProjectConfig = toml::from_str(raw).expect("config should deserialize");

        assert_eq!(config.permissions.default_mode, "auto_edit");
        assert_eq!(config.permissions.max_mode, "auto_edit");
        assert!(config.permissions.confirm_full_access);
        assert!(config.prompt_templates.templates.is_empty());
        assert_eq!(effective_default_permission_mode(&config), "auto_edit");
    }

    #[test]
    fn old_config_with_full_access_default_allows_full_access_policy() {
        let raw = r#"
[agent]
default = "claude"
default_permission_mode = "full_access"
prompt_prefix = ""
claude_version = ""
codex_version = ""

[git]
commit_prompt = "commit"
"#;

        let config: ProjectConfig = toml::from_str(raw).expect("config should deserialize");

        assert_eq!(effective_default_permission_mode(&config), "full_access");
        assert_eq!(config.permissions.max_mode, "full_access");
        assert_eq!(effective_max_permission_mode(&config), "full_access");
        assert!(validate_permission_against_max(
            "full_access",
            &effective_max_permission_mode(&config)
        )
        .is_ok());

        let serialized = toml::to_string_pretty(&config).expect("config should serialize");
        let round_tripped: ProjectConfig =
            toml::from_str(&serialized).expect("serialized config should deserialize");
        assert_eq!(round_tripped.permissions.max_mode, "full_access");
        assert!(validate_permission_against_max(
            "full_access",
            &round_tripped.permissions.max_mode
        )
        .is_ok());

        let project_dir =
            std::env::temp_dir().join(format!("nezha-config-test-{}", uuid::Uuid::new_v4()));
        let config_dir = project_dir.join(".nezha");
        fs::create_dir_all(&config_dir).expect("test config dir should be created");
        fs::write(config_dir.join("config.toml"), raw).expect("test config should be written");

        let project_path = project_dir.to_string_lossy().into_owned();
        assert!(validate_permission_mode(&project_path, "full_access").is_ok());

        let _ = fs::remove_dir_all(project_dir);
    }

    #[test]
    fn permission_rank_orders_modes() {
        assert_eq!(permission_rank("ask"), Some(0));
        assert_eq!(permission_rank("auto_edit"), Some(1));
        assert_eq!(permission_rank("full_access"), Some(2));
        assert_eq!(permission_rank("unknown"), None);
    }

    #[test]
    fn validate_permission_against_max_allows_equal_or_lower() {
        assert!(validate_permission_against_max("ask", "auto_edit").is_ok());
        assert!(validate_permission_against_max("auto_edit", "auto_edit").is_ok());
    }

    #[test]
    fn validate_permission_against_max_rejects_higher() {
        let err = validate_permission_against_max("full_access", "auto_edit").unwrap_err();
        assert!(err.contains("exceeds project maximum"));
    }

    #[test]
    fn effective_default_permission_prefers_permissions_section() {
        let mut config = ProjectConfig::default();
        config.agent.default_permission_mode = "full_access".to_string();
        config.permissions.default_mode = "auto_edit".to_string();

        assert_eq!(effective_default_permission_mode(&config), "auto_edit");
    }

    #[test]
    fn merge_project_config_for_save_preserves_sections_missing_from_incoming_payload() {
        let existing_raw = r#"
[agent]
default = "claude"
default_permission_mode = "ask"
prompt_prefix = "old"
claude_version = ""
codex_version = ""

[permissions]
default_mode = "auto_edit"
max_mode = "full_access"
confirm_full_access = false

[[prompt_templates.templates]]
id = "review"
name = "Review"
content = "Review {projectName}"

[git]
commit_prompt = "old commit"
"#;
        let incoming_raw = r#"
[agent]
default = "codex"
default_permission_mode = "ask"
prompt_prefix = "new"
claude_version = "1"
codex_version = "2"

[git]
commit_prompt = "new commit"
"#;

        let existing: ProjectConfig =
            toml::from_str(existing_raw).expect("existing config should deserialize");
        let incoming: ProjectConfig =
            toml::from_str(incoming_raw).expect("incoming config should deserialize");

        let merged = merge_project_config_for_save(Some(existing), incoming);

        assert_eq!(merged.agent.default, "codex");
        assert_eq!(merged.git.commit_prompt, "new commit");
        assert_eq!(merged.permissions.default_mode, "auto_edit");
        assert_eq!(merged.permissions.max_mode, "full_access");
        assert!(!merged.permissions.confirm_full_access);
        assert_eq!(merged.prompt_templates.templates.len(), 1);
        assert_eq!(merged.prompt_templates.templates[0].id, "review");
    }
}
