use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use super::ShellCommand;

static LOGIN_SHELL_ENV: OnceLock<Vec<(String, String)>> = OnceLock::new();
static LOGIN_SHELL_PATH: OnceLock<String> = OnceLock::new();

pub(crate) fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .or_else(|| match (std::env::var_os("HOMEDRIVE"), std::env::var_os("HOMEPATH")) {
            (Some(drive), Some(path)) => {
                let mut full = PathBuf::from(drive);
                full.push(PathBuf::from(path));
                Some(full)
            }
            _ => None,
        })
}

pub(crate) fn login_shell_env() -> &'static [(String, String)] {
    LOGIN_SHELL_ENV
        .get_or_init(|| {
            let mut env: Vec<(String, String)> = std::env::vars().collect();
            if !env.iter().any(|(key, _)| key.eq_ignore_ascii_case("HOME")) {
                if let Some(home) = home_dir() {
                    env.push(("HOME".to_string(), home.to_string_lossy().into_owned()));
                }
            }
            env
        })
        .as_slice()
}

pub(crate) fn login_shell_path() -> &'static str {
    LOGIN_SHELL_PATH.get_or_init(|| {
        login_shell_env()
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case("PATH"))
            .map(|(_, value)| value.clone())
            .unwrap_or_default()
    })
}

pub(crate) fn default_shell_command() -> ShellCommand {
    if !detect_path("pwsh").is_empty() {
        return ShellCommand {
            program: "pwsh".to_string(),
            args: vec!["-NoLogo".to_string()],
        };
    }

    if !detect_path("powershell").is_empty() {
        return ShellCommand {
            program: "powershell".to_string(),
            args: vec!["-NoLogo".to_string()],
        };
    }

    ShellCommand {
        program: std::env::var("ComSpec")
            .unwrap_or_else(|_| "C:\\Windows\\System32\\cmd.exe".to_string()),
        args: Vec::new(),
    }
}

pub(crate) fn detect_path(binary: &str) -> String {
    if binary.contains('\\') || binary.contains('/') {
        let candidate = PathBuf::from(binary);
        return if candidate.exists() {
            candidate.to_string_lossy().into_owned()
        } else {
            String::new()
        };
    }

    let path_value = login_shell_path();
    if path_value.is_empty() {
        return String::new();
    }

    let has_extension = Path::new(binary).extension().is_some();
    find_on_path(binary, &path_value, has_extension).unwrap_or_default()
}

fn find_on_path(binary: &str, path_value: &str, has_extension: bool) -> Option<String> {
    let path_exts = if has_extension {
        vec![String::new()]
    } else {
        std::env::var("PATHEXT")
            .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string())
            .split(';')
            .filter(|ext| !ext.is_empty())
            .map(|ext| ext.to_string())
            .collect::<Vec<_>>()
    };

    for dir in path_value.split(';').filter(|segment| !segment.is_empty()) {
        if has_extension {
            let candidate = Path::new(dir).join(binary);
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().into_owned());
            }
            continue;
        }

        for ext in &path_exts {
            let candidate = Path::new(dir).join(format!("{binary}{ext}"));
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().into_owned());
            }
        }
    }

    None
}
