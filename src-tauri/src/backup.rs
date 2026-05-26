use std::fs;
use std::path::{Component, Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::app_settings::{load_app_settings, BackupSettings};
use crate::storage::{atomic_write, Project};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BackupWarning {
    pub source: String,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum BackupResultStatus {
    Success,
    Partial,
    Failed,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BackupResult {
    pub status: BackupResultStatus,
    pub destination: String,
    #[serde(rename = "manifestPath")]
    pub manifest_path: String,
    pub warnings: Vec<BackupWarning>,
    #[serde(rename = "copiedCount")]
    pub copied_count: usize,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct BackupStatus {
    #[serde(rename = "lastResult", skip_serializing_if = "Option::is_none")]
    pub last_result: Option<BackupResult>,
}

#[derive(Serialize)]
struct BackupManifest<'a> {
    kind: &'static str,
    version: u32,
    result: &'a BackupResult,
    projects: &'a [Project],
}

pub fn expand_home(path: &str) -> Result<PathBuf, String> {
    let home = crate::platform::home_dir().ok_or_else(|| "Cannot find home directory".to_string())?;
    match path {
        "~" => Ok(home),
        _ if path.starts_with("~/") => Ok(home.join(&path[2..])),
        _ => Ok(PathBuf::from(path)),
    }
}

fn nezha_dir() -> Result<PathBuf, String> {
    expand_home("~/.nezha")
}

fn status_path() -> Result<PathBuf, String> {
    Ok(nezha_dir()?.join("backup-status.json"))
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            _ => normalized.push(component.as_os_str()),
        }
    }
    normalized
}

fn should_skip_path(path: &Path, excluded_roots: &[PathBuf]) -> bool {
    let normalized = normalize_path(path);
    excluded_roots
        .iter()
        .map(|excluded| normalize_path(excluded))
        .any(|excluded| normalized == excluded || normalized.starts_with(excluded))
}

pub fn copy_dir_recursive(source: &Path, destination: &Path) -> Result<usize, String> {
    copy_dir_recursive_excluding(source, destination, &[])
}

fn copy_dir_recursive_excluding(
    source: &Path,
    destination: &Path,
    excluded_roots: &[PathBuf],
) -> Result<usize, String> {
    let mut copied_count = 0;
    fs::create_dir_all(destination).map_err(|e| e.to_string())?;

    for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let source_path = entry.path();
        if should_skip_path(&source_path, excluded_roots) {
            continue;
        }

        let destination_path = destination.join(entry.file_name());
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            copied_count += copy_dir_recursive_excluding(
                &source_path,
                &destination_path,
                excluded_roots,
            )?;
        } else if file_type.is_file() {
            if let Some(parent) = destination_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(&source_path, &destination_path).map_err(|e| e.to_string())?;
            copied_count += 1;
        }
    }

    Ok(copied_count)
}

fn add_copy_source(
    copied_count: &mut usize,
    warnings: &mut Vec<BackupWarning>,
    source: PathBuf,
    destination: PathBuf,
    excluded_roots: &[PathBuf],
) {
    if !source.exists() {
        warnings.push(BackupWarning {
            source: source.display().to_string(),
            message: "Source directory does not exist".to_string(),
        });
        return;
    }

    if !source.is_dir() {
        warnings.push(BackupWarning {
            source: source.display().to_string(),
            message: "Source path is not a directory".to_string(),
        });
        return;
    }

    match copy_dir_recursive_excluding(&source, &destination, excluded_roots) {
        Ok(count) => *copied_count += count,
        Err(message) => warnings.push(BackupWarning {
            source: source.display().to_string(),
            message,
        }),
    }
}

fn is_nezha_backup_dir(path: &Path) -> bool {
    let manifest_path = path.join("manifest.json");
    let Ok(raw) = fs::read_to_string(manifest_path) else {
        return false;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return false;
    };
    value
        .get("kind")
        .and_then(|kind| kind.as_str())
        .is_some_and(|kind| kind == "nezha.metadata_backup")
}

fn cleanup_old_backups(
    destination_root: &Path,
    current_backup_dir: &Path,
    retain: u32,
) -> Result<(), String> {
    if retain == 0 || !destination_root.is_dir() {
        return Ok(());
    }

    let mut entries = fs::read_dir(destination_root)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_dir() {
                return None;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if !is_timestamped_backup_name(&name) {
                return None;
            }
            if normalize_path(&path) == normalize_path(current_backup_dir) {
                return None;
            }
            if !is_nezha_backup_dir(&path) {
                return None;
            }
            Some((name, path))
        })
        .collect::<Vec<_>>();

    entries.sort_by(|a, b| b.0.cmp(&a.0));
    let retained_old_count = retain.saturating_sub(1) as usize;
    for (_, path) in entries.into_iter().skip(retained_old_count) {
        fs::remove_dir_all(path).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn is_timestamped_backup_name(name: &str) -> bool {
    name.len() == 16
        && name.as_bytes()[8] == b'-'
        && name
            .bytes()
            .enumerate()
            .all(|(index, byte)| index == 8 || byte.is_ascii_digit())
}

fn status_from_result(copied_count: usize, warnings: &[BackupWarning]) -> BackupResultStatus {
    if copied_count == 0 {
        BackupResultStatus::Failed
    } else if warnings.is_empty() {
        BackupResultStatus::Success
    } else {
        BackupResultStatus::Partial
    }
}

fn run_backup_blocking(projects: Vec<Project>) -> Result<BackupResult, String> {
    let settings = load_app_settings()?;
    let BackupSettings {
        destination,
        retain,
        ..
    } = settings.backup;
    let destination_root = expand_home(&destination)?;
    let created_at = Utc::now();
    let backup_dir_name = created_at.format("%Y%m%d-%H%M%S").to_string();
    let backup_dir = destination_root.join(backup_dir_name);
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    let home =
        crate::platform::home_dir().ok_or_else(|| "Cannot find home directory".to_string())?;
    let nezha_source = home.join(".nezha");
    let codex_source = home.join(".codex");
    let claude_source = home.join(".claude");
    let backup_status_path = status_path()?;
    let excluded_roots = vec![destination_root.clone(), backup_dir.clone(), backup_status_path];

    let mut warnings = Vec::new();
    let mut copied_count = 0;

    add_copy_source(
        &mut copied_count,
        &mut warnings,
        nezha_source,
        backup_dir.join("home").join(".nezha"),
        &excluded_roots,
    );
    add_copy_source(
        &mut copied_count,
        &mut warnings,
        codex_source,
        backup_dir.join("home").join(".codex"),
        &excluded_roots,
    );
    add_copy_source(
        &mut copied_count,
        &mut warnings,
        claude_source,
        backup_dir.join("home").join(".claude"),
        &excluded_roots,
    );

    for project in &projects {
        let project_root = PathBuf::from(&project.path);
        let project_destination = backup_dir.join("projects").join(&project.id);
        add_copy_source(
            &mut copied_count,
            &mut warnings,
            project_root.join(".nezha"),
            project_destination.join(".nezha"),
            &excluded_roots,
        );
        add_copy_source(
            &mut copied_count,
            &mut warnings,
            project_root.join(".codex").join("sessions"),
            project_destination.join(".codex").join("sessions"),
            &excluded_roots,
        );
    }

    let manifest_path = backup_dir.join("manifest.json");
    let mut result = BackupResult {
        status: status_from_result(copied_count, &warnings),
        destination: backup_dir.display().to_string(),
        manifest_path: manifest_path.display().to_string(),
        warnings,
        copied_count,
        created_at: created_at.to_rfc3339(),
    };

    let manifest = BackupManifest {
        kind: "nezha.metadata_backup",
        version: 1,
        result: &result,
        projects: &projects,
    };
    let manifest_raw = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    atomic_write(&manifest_path, &manifest_raw)?;

    if let Err(message) = cleanup_old_backups(&destination_root, &backup_dir, retain) {
        result.warnings.push(BackupWarning {
            source: destination_root.display().to_string(),
            message: format!("Retention cleanup failed: {}", message),
        });
        result.status = status_from_result(result.copied_count, &result.warnings);
        let manifest = BackupManifest {
            kind: "nezha.metadata_backup",
            version: 1,
            result: &result,
            projects: &projects,
        };
        let manifest_raw = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
        atomic_write(&manifest_path, &manifest_raw)?;
    }

    let status = BackupStatus {
        last_result: Some(result.clone()),
    };
    let status_raw = serde_json::to_string_pretty(&status).map_err(|e| e.to_string())?;
    let status_file = status_path()?;
    if let Some(parent) = status_file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    atomic_write(&status_file, &status_raw)?;

    Ok(result)
}

#[tauri::command]
pub async fn run_backup_now(projects: Vec<Project>) -> Result<BackupResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_backup_blocking(projects))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_backup_status() -> Result<BackupStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = status_path()?;
        if !path.exists() {
            return Ok(BackupStatus::default());
        }
        let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timestamped_backup_name_requires_expected_format() {
        assert!(is_timestamped_backup_name("20260526-120102"));
        assert!(!is_timestamped_backup_name("backup"));
        assert!(!is_timestamped_backup_name("20260526120102"));
        assert!(!is_timestamped_backup_name("20260526-12010x"));
    }

    #[test]
    fn missing_sources_become_warnings() {
        let mut copied_count = 0;
        let mut warnings = Vec::new();
        add_copy_source(
            &mut copied_count,
            &mut warnings,
            PathBuf::from("/path/that/should/not/exist/nezha-backup-test"),
            PathBuf::from("/tmp/unused-nezha-backup-test"),
            &[],
        );

        assert_eq!(copied_count, 0);
        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].message, "Source directory does not exist");
    }

    #[test]
    fn status_is_failed_when_nothing_was_copied() {
        assert!(matches!(
            status_from_result(0, &[BackupWarning {
                source: "missing".to_string(),
                message: "Source directory does not exist".to_string(),
            }]),
            BackupResultStatus::Failed
        ));
    }

    #[test]
    fn status_is_partial_when_some_sources_warned() {
        assert!(matches!(
            status_from_result(2, &[BackupWarning {
                source: "missing".to_string(),
                message: "Source directory does not exist".to_string(),
            }]),
            BackupResultStatus::Partial
        ));
    }

    #[test]
    fn skipped_paths_match_descendants() {
        let excluded = vec![PathBuf::from("/home/me/.nezha/backups")];
        assert!(should_skip_path(
            Path::new("/home/me/.nezha/backups/20260526-120102"),
            &excluded
        ));
        assert!(!should_skip_path(Path::new("/home/me/.nezha/projects"), &excluded));
    }

    #[test]
    fn timestamped_dir_without_manifest_is_not_a_nezha_backup() {
        assert!(!is_nezha_backup_dir(Path::new("/path/that/does/not/exist/20260526-120102")));
    }

    #[test]
    fn timestamped_dir_requires_nezha_manifest_kind() {
        let root = std::env::temp_dir().join(format!(
            "nezha-backup-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create temp backup dir");

        fs::write(root.join("manifest.json"), r#"{"kind":"other"}"#).expect("write manifest");
        assert!(!is_nezha_backup_dir(&root));

        fs::write(
            root.join("manifest.json"),
            r#"{"kind":"nezha.metadata_backup","version":1}"#,
        )
        .expect("write manifest");
        assert!(is_nezha_backup_dir(&root));

        let _ = fs::remove_dir_all(root);
    }
}
