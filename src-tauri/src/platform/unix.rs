use std::process::{Command, Stdio};
use std::sync::OnceLock;

use super::ShellCommand;

static LOGIN_SHELL_ENV: OnceLock<Vec<(String, String)>> = OnceLock::new();
static LOGIN_SHELL_PATH: OnceLock<String> = OnceLock::new();
const ENV_SENTINEL: &[u8] = b"__NEZHA_ENV_START__\0";

pub(crate) fn home_dir() -> Option<std::path::PathBuf> {
    std::env::var_os("HOME").map(std::path::PathBuf::from)
}

pub(crate) fn login_shell_env() -> &'static [(String, String)] {
    LOGIN_SHELL_ENV.get_or_init(resolve_login_shell_env).as_slice()
}

pub(crate) fn login_shell_path() -> &'static str {
    LOGIN_SHELL_PATH.get_or_init(|| {
        login_shell_env()
            .iter()
            .find(|(key, _)| key == "PATH")
            .map(|(_, value)| value.clone())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(build_fallback_path)
    })
}

pub(crate) fn default_shell_command() -> ShellCommand {
    ShellCommand {
        program: std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string()),
        args: Vec::new(),
    }
}

pub(crate) fn detect_path(binary: &str) -> String {
    let output = Command::new("which")
        .arg(binary)
        .env("PATH", login_shell_path())
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !path.is_empty() {
                return path;
            }
        }
    }

    String::new()
}

fn resolve_login_shell_env() -> Vec<(String, String)> {
    let shell = default_shell_command().program;

    if let Some(env) = read_shell_env(&shell, true) {
        return env;
    }

    if let Some(env) = read_shell_env(&shell, false) {
        return env;
    }

    build_fallback_env()
}

fn read_shell_env(shell: &str, interactive: bool) -> Option<Vec<(String, String)>> {
    let args: &[&str] = if interactive {
        &["-l", "-i", "-c", "printf '__NEZHA_ENV_START__\\0'; env -0"]
    } else {
        &["-l", "-c", "printf '__NEZHA_ENV_START__\\0'; env -0"]
    };

    let output = Command::new(shell)
        .args(args)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    parse_shell_env_output(&output.stdout)
}

fn parse_shell_env_output(stdout: &[u8]) -> Option<Vec<(String, String)>> {
    let start = stdout
        .windows(ENV_SENTINEL.len())
        .position(|window| window == ENV_SENTINEL)?
        + ENV_SENTINEL.len();

    let mut env = Vec::new();
    for entry in stdout[start..].split(|byte| *byte == 0) {
        if entry.is_empty() {
            continue;
        }

        let Some(eq) = entry.iter().position(|byte| *byte == b'=') else {
            continue;
        };
        let key = String::from_utf8_lossy(&entry[..eq]).into_owned();
        if key.is_empty() || matches!(key.as_str(), "PWD" | "OLDPWD" | "SHLVL" | "_") {
            continue;
        }
        let value = String::from_utf8_lossy(&entry[eq + 1..]).into_owned();
        env.push((key, value));
    }

    if env.is_empty() {
        None
    } else {
        Some(env)
    }
}

fn build_fallback_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let current = std::env::var("PATH").unwrap_or_default();
    let extras = [
        format!("{home}/.local/bin"),
        format!("{home}/.npm-global/bin"),
        "/opt/homebrew/bin".to_string(),
        "/opt/homebrew/sbin".to_string(),
        "/usr/local/bin".to_string(),
        "/usr/bin".to_string(),
        "/bin".to_string(),
        "/usr/sbin".to_string(),
        "/sbin".to_string(),
    ];
    let mut parts: Vec<String> = extras.to_vec();
    for path in current.split(':') {
        if !path.is_empty() && !parts.iter().any(|part| part == path) {
            parts.push(path.to_string());
        }
    }
    parts.join(":")
}

fn build_fallback_env() -> Vec<(String, String)> {
    let mut env: Vec<(String, String)> = std::env::vars()
        .filter(|(key, _)| !matches!(key.as_str(), "PWD" | "OLDPWD" | "SHLVL" | "_"))
        .collect();

    if let Some((_, path)) = env.iter_mut().find(|(key, _)| key == "PATH") {
        *path = build_fallback_path();
    } else {
        env.push(("PATH".to_string(), build_fallback_path()));
    }

    if !env.iter().any(|(key, _)| key == "HOME") {
        let home = std::env::var("HOME").unwrap_or_default();
        if !home.is_empty() {
            env.push(("HOME".to_string(), home));
        }
    }

    env
}
