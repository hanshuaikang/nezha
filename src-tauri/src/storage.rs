use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};

// ── Data types (mirror TypeScript interfaces) ────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub branch: Option<String>,
    #[serde(rename = "lastOpenedAt")]
    pub last_opened_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Task {
    pub id: String,
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub prompt: String,
    pub agent: String,
    #[serde(rename = "permissionMode")]
    pub permission_mode: String,
    pub status: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "attentionRequestedAt", skip_serializing_if = "Option::is_none")]
    pub attention_requested_at: Option<i64>,
    #[serde(rename = "claudeSessionId", skip_serializing_if = "Option::is_none")]
    pub claude_session_id: Option<String>,
    #[serde(rename = "claudeSessionPath", skip_serializing_if = "Option::is_none")]
    pub claude_session_path: Option<String>,
    #[serde(rename = "codexSessionId", skip_serializing_if = "Option::is_none")]
    pub codex_session_id: Option<String>,
    #[serde(rename = "codexSessionPath", skip_serializing_if = "Option::is_none")]
    pub codex_session_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub starred: Option<bool>,
    #[serde(rename = "failureReason", skip_serializing_if = "Option::is_none")]
    pub failure_reason: Option<String>,
}

// ── Path helpers ─────────────────────────────────────────────────────────────

fn nezha_dir() -> Result<PathBuf, String> {
    let home = crate::platform::home_dir().ok_or_else(|| "Cannot find home directory".to_string())?;
    Ok(home.join(".nezha"))
}

fn projects_path() -> Result<PathBuf, String> {
    Ok(nezha_dir()?.join("projects.json"))
}

fn tasks_path(project_id: &str) -> Result<PathBuf, String> {
    Ok(project_dir(project_id)?.join("tasks.json"))
}

fn project_dir(project_id: &str) -> Result<PathBuf, String> {
    Ok(nezha_dir()?.join("projects").join(project_id))
}

fn ensure_nezha_dirs() -> Result<(), String> {
    fs::create_dir_all(nezha_dir()?).map_err(|e| e.to_string())
}

fn ensure_project_dir(project_id: &str) -> Result<(), String> {
    fs::create_dir_all(project_dir(project_id)?).map_err(|e| e.to_string())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn load_projects() -> Result<Vec<Project>, String> {
    let path = projects_path()?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_projects(projects: Vec<Project>) -> Result<(), String> {
    ensure_nezha_dirs()?;
    let raw = serde_json::to_string_pretty(&projects).map_err(|e| e.to_string())?;
    atomic_write(&projects_path()?, &raw)
}

#[tauri::command]
pub fn load_project_tasks(project_id: String) -> Result<Vec<Task>, String> {
    let path = tasks_path(&project_id)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_project_tasks(project_id: String, tasks: Vec<Task>) -> Result<(), String> {
    ensure_project_dir(&project_id)?;
    let path = tasks_path(&project_id)?;
    if tasks.is_empty() {
        // Remove the file if no tasks left
        if path.exists() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    let raw = serde_json::to_string_pretty(&tasks).map_err(|e| e.to_string())?;
    atomic_write(&path, &raw)
}

// ── Atomic write (write to tmp then rename) ───────────────────────────────────

/// 原子写入：先写入唯一临时文件，再 rename 到目标路径。
/// 临时文件名包含 pid + 纳秒时间戳，避免并发写入时临时文件相互覆盖。
pub fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let uid = format!(
        "{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file");
    let tmp = path.with_file_name(format!(".{file_name}.{uid}.tmp"));
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}
