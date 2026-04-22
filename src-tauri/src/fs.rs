use base64::Engine;
use std::collections::HashSet;
use std::path::Path;
use std::process::Command;

#[derive(serde::Serialize)]
pub(crate) struct FsEntry {
    name: String,
    path: String,
    is_dir: bool,
    extension: Option<String>,
    is_gitignored: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImagePreviewData {
    data_url: String,
    mime_type: String,
    byte_length: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectFileSearchEntry {
    name: String,
    path: String,
    relative_path: String,
    extension: Option<String>,
    is_gitignored: bool,
}

const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    ".next",
    ".nuxt",
    "dist",
    "build",
    "target",
    "__pycache__",
    ".cache",
    "coverage",
    ".turbo",
    ".expo",
    "out",
    ".output",
    ".venv",
    "venv",
    ".tox",
];

const MAX_IMAGE_PREVIEW_BYTES: u64 = 10 * 1024 * 1024;

/// Validate that `target` is an absolute path within `allowed_root` (prevents directory traversal).
fn validate_path_within(target: &str, allowed_root: &str) -> Result<std::path::PathBuf, String> {
    let target = Path::new(target);
    let root = Path::new(allowed_root);

    if !target.is_absolute() {
        return Err("Path must be absolute".to_string());
    }

    let canonical_target = target
        .canonicalize()
        .map_err(|e| format!("Cannot resolve path: {}", e))?;
    let canonical_root = root
        .canonicalize()
        .map_err(|e| format!("Cannot resolve root directory: {}", e))?;

    if !canonical_target.starts_with(&canonical_root) {
        return Err("Path is outside the allowed directory".to_string());
    }

    Ok(canonical_target)
}

fn previewable_image_mime_type(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

fn collect_project_file_search_entries(
    root: &Path,
    current_dir: &Path,
    visited_dirs: &mut HashSet<std::path::PathBuf>,
    result: &mut Vec<ProjectFileSearchEntry>,
) -> Result<(), String> {
    let canonical_dir = match current_dir.canonicalize() {
        Ok(path) => path,
        Err(_) => return Ok(()),
    };
    if !canonical_dir.starts_with(root) || !visited_dirs.insert(canonical_dir.clone()) {
        return Ok(());
    }

    let entries = match std::fs::read_dir(current_dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(()),
    };

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();

        if path.is_dir() {
            if IGNORED_DIRS.contains(&name.as_str()) {
                continue;
            }
            collect_project_file_search_entries(root, &path, visited_dirs, result)?;
            continue;
        }

        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase());
        let relative_path = match path.strip_prefix(root) {
            Ok(relative_path) => relative_path.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };

        result.push(ProjectFileSearchEntry {
            name,
            path: path.to_string_lossy().into_owned(),
            relative_path,
            extension,
            is_gitignored: false,
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn open_in_system_file_manager(path: String, project_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target = validate_path_within(&path, &project_path)?;
        let is_dir = target.is_dir();

        #[cfg(target_os = "macos")]
        let status = {
            let mut command = Command::new("open");
            if is_dir {
                command.arg(&target);
            } else {
                command.arg("-R").arg(&target);
            }
            command.status()
        };

        #[cfg(target_os = "windows")]
        let status = {
            let mut command = Command::new("explorer");
            if is_dir {
                command.arg(&target);
            } else {
                command.arg(format!("/select,{}", target.display()));
            }
            command.status()
        };

        #[cfg(all(unix, not(target_os = "macos")))]
        let status = {
            let folder = if is_dir {
                target.as_path()
            } else {
                target.parent().ok_or_else(|| "Cannot resolve parent directory".to_string())?
            };
            Command::new("xdg-open").arg(folder).status()
        };

        let status = status.map_err(|e| format!("Failed to launch system file manager: {}", e))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("System file manager exited with status {}", status))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_dir_entries(path: String, project_path: String) -> Result<Vec<FsEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_path_within(&path, &project_path)?;
        let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
        let mut result: Vec<FsEntry> = entries
            .flatten()
            .filter(|entry| {
                let p = entry.path();
                if p.is_dir() {
                    let name = entry.file_name();
                    let name_str = name.to_string_lossy();
                    !IGNORED_DIRS.contains(&name_str.as_ref())
                } else {
                    true
                }
            })
            .map(|entry| {
                let p = entry.path();
                let name = entry.file_name().to_string_lossy().into_owned();
                let is_dir = p.is_dir();
                let extension =
                    p.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase());
                FsEntry { name, path: p.to_string_lossy().into_owned(), is_dir, extension, is_gitignored: false }
            })
            .collect();
        result.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        // Mark gitignored entries via `git check-ignore --stdin`
        if !result.is_empty() {
            let ignored_set: std::collections::HashSet<String> = {
                use std::io::Write;
                let mut cmd = std::process::Command::new("git");
                crate::subprocess::configure_background_command(&mut cmd);
                cmd.args(["check-ignore", "--stdin"])
                    .current_dir(&project_path)
                    .stdin(std::process::Stdio::piped())
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::null());
                match cmd.spawn() {
                    Ok(mut child) => {
                        if let Some(ref mut stdin) = child.stdin {
                            for entry in &result {
                                let _ = writeln!(stdin, "{}", entry.path);
                            }
                        }
                        match child.wait_with_output() {
                            Ok(output) => String::from_utf8_lossy(&output.stdout)
                                .lines()
                                .filter(|l| !l.is_empty())
                                .map(|l| l.to_string())
                                .collect(),
                            Err(_) => std::collections::HashSet::new(),
                        }
                    }
                    Err(_) => std::collections::HashSet::new(),
                }
            };
            for entry in &mut result {
                entry.is_gitignored = ignored_set.contains(&entry.path);
            }
        }

        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_file_content(path: String, project_path: String) -> Result<String, String> {
    validate_path_within(&path, &project_path)?;

    use std::io::Read;
    let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    if meta.len() > 2 * 1024 * 1024 {
        return Err(format!(
            "File too large ({:.1} MB)",
            meta.len() as f64 / 1024.0 / 1024.0
        ));
    }
    let mut buf = String::with_capacity(meta.len() as usize);
    std::io::BufReader::new(file)
        .read_to_string(&mut buf)
        .map_err(|e| e.to_string())?;
    Ok(buf)
}

#[tauri::command]
pub async fn read_image_preview(path: String, project_path: String) -> Result<ImagePreviewData, String> {
    let validated_path = validate_path_within(&path, &project_path)?;

    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;

        let mime_type = previewable_image_mime_type(&validated_path)
            .ok_or_else(|| "Unsupported image format".to_string())?;

        let file = std::fs::File::open(&validated_path).map_err(|e| e.to_string())?;
        let meta = file.metadata().map_err(|e| e.to_string())?;
        if meta.len() > MAX_IMAGE_PREVIEW_BYTES {
            return Err(format!(
                "Image too large ({:.1} MB)",
                meta.len() as f64 / 1024.0 / 1024.0
            ));
        }

        let mut bytes = Vec::with_capacity(meta.len() as usize);
        std::io::BufReader::new(file)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;

        Ok(ImagePreviewData {
            data_url: format!(
                "data:{};base64,{}",
                mime_type,
                base64::engine::general_purpose::STANDARD.encode(bytes)
            ),
            mime_type: mime_type.to_string(),
            byte_length: meta.len(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn write_file_content(path: String, content: String, project_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_path_within(&path, &project_path)?;
        std::fs::write(&path, content).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_project_files(project_path: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = std::process::Command::new("git");
        crate::subprocess::configure_background_command(&mut cmd);
        let output = cmd
            .args([
                "-c",
                "core.quotePath=false",
                "ls-files",
                "-c",
                "-o",
                "--exclude-standard",
            ])
            .current_dir(&project_path)
            .output()
            .map_err(|e| e.to_string())?;

        let mut files: Vec<String> = String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter(|l| !l.is_empty())
            .map(|l| l.to_string())
            .collect();

        files.sort();
        files.dedup();
        Ok(files)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_project_file_search_entries(
    project_path: String,
) -> Result<Vec<ProjectFileSearchEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = validate_path_within(&project_path, &project_path)?;
        let mut result = Vec::new();
        let mut visited_dirs = HashSet::new();
        collect_project_file_search_entries(&root, &root, &mut visited_dirs, &mut result)?;
        result.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

        if !result.is_empty() {
            let ignored_set: std::collections::HashSet<String> = {
                use std::io::Write;

                let mut cmd = std::process::Command::new("git");
                crate::subprocess::configure_background_command(&mut cmd);
                cmd.args(["check-ignore", "--stdin"])
                    .current_dir(&root)
                    .stdin(std::process::Stdio::piped())
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::null());

                match cmd.spawn() {
                    Ok(mut child) => {
                        if let Some(ref mut stdin) = child.stdin {
                            for entry in &result {
                                let _ = writeln!(stdin, "{}", entry.path);
                            }
                        }
                        match child.wait_with_output() {
                            Ok(output) => String::from_utf8_lossy(&output.stdout)
                                .lines()
                                .filter(|line| !line.is_empty())
                                .map(|line| line.to_string())
                                .collect(),
                            Err(_) => std::collections::HashSet::new(),
                        }
                    }
                    Err(_) => std::collections::HashSet::new(),
                }
            };

            for entry in &mut result {
                entry.is_gitignored = ignored_set.contains(&entry.path);
            }
        }

        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
