use std::fs;
use std::io::Write;
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
    // 缺省=常驻；旧数据无此字段时默认 false，序列化时省略 false 以保持文件简洁。
    #[serde(
        rename = "hiddenFromRail",
        default,
        skip_serializing_if = "std::ops::Not::not"
    )]
    pub hidden_from_rail: bool,
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
    #[serde(rename = "updatedAt", default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<i64>,
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
    #[serde(rename = "worktreePath", skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
    #[serde(rename = "worktreeBranch", skip_serializing_if = "Option::is_none")]
    pub worktree_branch: Option<String>,
    #[serde(rename = "worktreeRepo", skip_serializing_if = "Option::is_none")]
    pub worktree_repo: Option<String>,
    #[serde(rename = "baseBranch", skip_serializing_if = "Option::is_none")]
    pub base_branch: Option<String>,
    #[serde(rename = "worktreeDiscarded", skip_serializing_if = "Option::is_none")]
    pub worktree_discarded: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub additions: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deletions: Option<i32>,
}

// ── Path helpers ─────────────────────────────────────────────────────────────

pub(crate) fn nezha_dir() -> Result<PathBuf, String> {
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

pub(crate) fn ensure_nezha_dirs() -> Result<(), String> {
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
    serde_json::from_str(&raw).map_err(|parse_err| {
        // 系统崩溃(掉电/蓝屏)可能留下空或截断的 tasks.json。把损坏文件挪走
        // 保留人工恢复现场,下次启动即回到正常空列表,不会永久卡死在解析报错上。
        let secs = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let backup = path.with_file_name(format!("tasks.json.corrupt-{secs}"));
        match fs::rename(&path, &backup) {
            Ok(()) => format!(
                "tasks.json is corrupted ({parse_err}); moved to {} for manual recovery",
                backup.display()
            ),
            Err(mv_err) => {
                format!("tasks.json is corrupted ({parse_err}); failed to move it aside: {mv_err}")
            }
        }
    })
}

#[tauri::command]
pub fn save_project_tasks(project_id: String, tasks: Vec<Task>) -> Result<(), String> {
    ensure_project_dir(&project_id)?;
    // 空列表也照常写 "[]",不删文件:删除路径曾放大过崩溃后的数据丢失
    // (加载失败 → 前端空 state → 空列表保存把磁盘上仅存的原始文件删掉)。
    let raw = serde_json::to_string_pretty(&tasks).map_err(|e| e.to_string())?;
    atomic_write(&tasks_path(&project_id)?, &raw)
}

// ── Atomic write (write to tmp then rename) ───────────────────────────────────

/// 原子写入：先写入唯一临时文件，fsync 落盘后再 rename 到目标路径。
/// 临时文件名包含 pid + 纳秒时间戳，避免并发写入时临时文件相互覆盖。
///
/// rename 只保证元数据原子性,不保证数据先于 rename 落盘——NTFS/APFS 都只
/// journal 元数据,掉电/系统崩溃时会留下 0 字节或截断的目标文件(Windows 用户
/// 实际踩过:突然重启后 tasks.json 清空)。rename 前必须 sync_all
/// (Windows=FlushFileBuffers,macOS=F_FULLFSYNC)强制数据先持久化。
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
    let write_and_sync = || -> std::io::Result<()> {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()
    };
    if let Err(e) = write_and_sync() {
        let _ = fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}
