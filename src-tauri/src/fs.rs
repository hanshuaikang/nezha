use base64::Engine;
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

/// Names whose stem (the substring before the first `.`) are reserved on Windows. Only consulted
/// when compiling for Windows; on Unix these are perfectly valid filenames (matching VS Code's
/// behavior of validating against the running OS, not the lowest common denominator).
#[cfg(target_os = "windows")]
const WINDOWS_RESERVED_STEMS: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM0", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
    "COM8", "COM9", "LPT0", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Validate a single path component that the user wants to create.
///
/// Cross-platform rejects (always):
/// - empty / `.` / `..`
/// - longer than 255 UTF-8 bytes
/// - contains `/`, `\\`, or NUL
///
/// Windows-only rejects (mirroring `CreateFileW` rules):
/// - extra forbidden characters (`< > : " | ? *`)
/// - ASCII control characters (< 0x20)
/// - trailing space or dot (Win32 would silently strip them)
/// - reserved DOS device names (CON/PRN/AUX/NUL/COM[0-9]/LPT[0-9]), case-insensitive
fn validate_entry_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("File name cannot be empty".to_string());
    }
    if name.len() > 255 {
        return Err("File name is too long (max 255 bytes)".to_string());
    }
    if name == "." || name == ".." {
        return Err("Invalid file name".to_string());
    }
    if name.contains('/') || name.contains('\\') || name.contains('\0') {
        return Err("File name contains forbidden characters".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        for ch in name.chars() {
            if matches!(ch, '<' | '>' | ':' | '"' | '|' | '?' | '*') {
                return Err("File name contains forbidden characters".to_string());
            }
            if (ch as u32) < 0x20 {
                return Err("File name contains control characters".to_string());
            }
        }
        if name.ends_with(' ') || name.ends_with('.') {
            return Err("File name cannot end with a space or a dot".to_string());
        }
        let stem = name.split_once('.').map(|(s, _)| s).unwrap_or(name);
        if !stem.is_empty() {
            let stem_upper = stem.to_ascii_uppercase();
            if WINDOWS_RESERVED_STEMS.iter().any(|r| *r == stem_upper) {
                return Err(format!("File name '{}' is reserved on Windows", stem));
            }
        }
    }

    Ok(())
}

/// Validate a not-yet-existing `target` path. Returns the canonicalized parent directory and the
/// raw basename. Existence is *not* checked here — the caller must use atomic create operations
/// (`OpenOptions::create_new` / `create_dir`) to avoid TOCTOU between an existence check and the
/// actual create.
fn validate_new_path_within(
    target: &str,
    allowed_root: &str,
) -> Result<(std::path::PathBuf, String), String> {
    let target_path = Path::new(target);

    if !target_path.is_absolute() {
        return Err("Path must be absolute".to_string());
    }

    let file_name = target_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid file name".to_string())?
        .to_string();

    validate_entry_name(&file_name)?;

    let parent = target_path
        .parent()
        .ok_or_else(|| "Cannot resolve parent directory".to_string())?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|e| format!("Cannot resolve parent directory: {}", e))?;
    let canonical_root = Path::new(allowed_root)
        .canonicalize()
        .map_err(|e| format!("Cannot resolve root directory: {}", e))?;

    if !canonical_parent.starts_with(&canonical_root) {
        return Err("Path is outside the allowed directory".to_string());
    }

    Ok((canonical_parent, file_name))
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
pub async fn create_file(path: String, project_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (parent, file_name) = validate_new_path_within(&path, &project_path)?;
        let target = parent.join(&file_name);
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map(|_| ())
            .map_err(|e| match e.kind() {
                std::io::ErrorKind::AlreadyExists => {
                    "A file or folder with that name already exists".to_string()
                }
                _ => e.to_string(),
            })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn create_directory(path: String, project_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (parent, file_name) = validate_new_path_within(&path, &project_path)?;
        let target = parent.join(&file_name);
        std::fs::create_dir(&target).map_err(|e| match e.kind() {
            std::io::ErrorKind::AlreadyExists => {
                "A file or folder with that name already exists".to_string()
            }
            _ => e.to_string(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// First-segment names under the project root that are never deletable through this command.
const PROTECTED_FIRST_SEGMENTS: &[&str] = &[".git", ".nezha"];

/// Validate a deletion target. Unlike `validate_path_within`, the target itself is NOT
/// canonicalized — only its parent — so symlinks are moved to trash as themselves rather than
/// following through to the link target. Also enforces a denylist on the first segment under
/// the project root.
fn validate_existing_path_for_delete(
    target: &str,
    allowed_root: &str,
) -> Result<std::path::PathBuf, String> {
    let target_path = Path::new(target);

    if !target_path.is_absolute() {
        return Err("Path must be absolute".to_string());
    }

    let file_name = target_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid file name".to_string())?;

    let parent = target_path
        .parent()
        .ok_or_else(|| "Cannot resolve parent directory".to_string())?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|e| format!("Cannot resolve parent directory: {}", e))?;
    let canonical_root = Path::new(allowed_root)
        .canonicalize()
        .map_err(|e| format!("Cannot resolve root directory: {}", e))?;

    if !canonical_parent.starts_with(&canonical_root) {
        return Err("Path is outside the allowed directory".to_string());
    }

    let resolved = canonical_parent.join(file_name);

    if resolved == canonical_root {
        return Err("Cannot delete the project root".to_string());
    }

    if resolved.symlink_metadata().is_err() {
        return Err("Path does not exist".to_string());
    }

    if let Ok(rel) = resolved.strip_prefix(&canonical_root) {
        if let Some(first) = rel.components().next() {
            if let Some(name) = first.as_os_str().to_str() {
                if PROTECTED_FIRST_SEGMENTS
                    .iter()
                    .any(|protected| protected.eq_ignore_ascii_case(name))
                {
                    return Err(format!("Cannot delete protected directory: {}", name));
                }
            }
        }
    }

    Ok(resolved)
}

#[tauri::command]
pub async fn delete_path(path: String, project_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let resolved = validate_existing_path_for_delete(&path, &project_path)?;
        trash::delete(&resolved).map_err(|e| e.to_string())
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
