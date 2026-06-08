use std::process::Command;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ProjectRuntime {
    Local,
    Wsl {
        distro: String,
        linux_path: String,
        unc_path: Option<String>,
        shell: Option<String>,
    },
}

pub fn default_wsl_shell(shell: Option<&str>) -> &str {
    shell
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("/bin/bash")
}

pub fn wsl_agent_shell_script(agent: &str) -> &'static str {
    if agent == "codex" {
        r#"codex "$@""#
    } else {
        r#"claude "$@""#
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WslPath {
    pub distro: String,
    pub linux_path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WslDistroInfo {
    pub name: String,
    pub state: String,
    pub version: String,
    pub is_default: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WslDistroHealth {
    pub distro: String,
    pub available: bool,
    pub home: String,
    pub shell: String,
    pub git_path: String,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WslAgentVersions {
    pub claude_path: String,
    pub claude_version: String,
    pub codex_path: String,
    pub codex_version: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WslProjectValidation {
    pub exists: bool,
    pub writable: bool,
    pub git_detected: bool,
    pub canonical_path: String,
    pub error: Option<String>,
}

fn sanitize_summary(text: &str) -> String {
    let one_line = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if one_line.chars().count() > 240 {
        format!("{}...", one_line.chars().take(240).collect::<String>())
    } else {
        one_line
    }
}

fn command_error(kind: &str, stderr: &[u8], code: Option<i32>) -> String {
    let decoded = decode_wsl_output(stderr);
    let summary = sanitize_summary(&decoded);
    if summary.is_empty() {
        format!("{kind}: command failed with status {:?}", code)
    } else {
        format!("{kind}: {summary}")
    }
}

fn decode_wsl_output(bytes: &[u8]) -> String {
    if bytes.len() >= 4 {
        let odd_nuls = bytes.iter().skip(1).step_by(2).filter(|b| **b == 0).count();
        let even_nuls = bytes.iter().step_by(2).filter(|b| **b == 0).count();
        if odd_nuls > bytes.len() / 4 && odd_nuls > even_nuls.saturating_mul(2) {
            let words = bytes
                .chunks_exact(2)
                .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
                .collect::<Vec<_>>();
            return String::from_utf16_lossy(&words)
                .trim_start_matches('\u{feff}')
                .replace('\r', "");
        }
    }
    String::from_utf8_lossy(bytes)
        .trim_start_matches('\u{feff}')
        .replace('\r', "")
}

fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' && chars.peek() == Some(&'[') {
            chars.next();
            for next in chars.by_ref() {
                if ('@'..='~').contains(&next) {
                    break;
                }
            }
            continue;
        }
        out.push(ch);
    }
    out
}

fn parse_wsl_list_verbose(raw: &str) -> Result<Vec<WslDistroInfo>, String> {
    let clean = strip_ansi(raw);
    let mut lines = clean
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();

    if lines.is_empty() {
        return Ok(Vec::new());
    }
    lines.remove(0);

    let mut distros = Vec::new();
    for line in lines {
        let is_default = line.starts_with('*');
        let without_marker = line.trim_start_matches('*').trim();
        let parts = without_marker.split_whitespace().collect::<Vec<_>>();
        if parts.len() < 3 {
            return Err(format!(
                "Cannot parse WSL distro list output: {}",
                sanitize_summary(&clean)
            ));
        }
        let version = parts[parts.len() - 1].to_string();
        let state = parts[parts.len() - 2].to_string();
        let name = parts[..parts.len() - 2].join(" ");
        distros.push(WslDistroInfo {
            name,
            state,
            version,
            is_default,
        });
    }
    Ok(distros)
}

fn run_wsl_capture(args: &[String]) -> Result<Vec<u8>, String> {
    let mut command = Command::new("wsl.exe");
    crate::subprocess::configure_background_command(&mut command);
    let output = command
        .args(args)
        .output()
        .map_err(|e| format!("wsl_unavailable: {e}"))?;
    if !output.status.success() {
        return Err(command_error(
            "wsl_command_failed",
            &output.stderr,
            output.status.code(),
        ));
    }
    Ok(output.stdout)
}

fn run_wsl_sh_capture(
    distro: &str,
    script: &str,
    script_args: &[String],
) -> Result<Vec<u8>, String> {
    let mut args = vec![
        "-d".to_string(),
        distro.to_string(),
        "--exec".to_string(),
        "/bin/sh".to_string(),
        "-lc".to_string(),
        script.to_string(),
        "nezha".to_string(),
    ];
    args.extend(script_args.iter().cloned());
    run_wsl_capture(&args)
}

fn run_wsl_interactive_shell_capture(
    distro: &str,
    shell: Option<&str>,
    script: &str,
) -> Result<Vec<u8>, String> {
    let shell = default_wsl_shell(shell);
    let args = vec![
        "-d".to_string(),
        distro.to_string(),
        "--exec".to_string(),
        shell.to_string(),
        "-ic".to_string(),
        script.to_string(),
    ];
    run_wsl_capture(&args)
}

fn split_nul(decoded: &str) -> Vec<String> {
    decoded
        .split('\0')
        .map(ToString::to_string)
        .collect::<Vec<_>>()
}

pub fn linux_path_to_unc(distro: &str, linux_path: &str) -> Result<String, String> {
    let distro = distro.trim();
    let linux_path = linux_path.trim();
    if distro.is_empty() {
        return Err("wsl_distro_missing: distro cannot be empty".to_string());
    }
    if !linux_path.starts_with('/') {
        return Err("wsl_path_invalid: Linux path must be absolute".to_string());
    }
    let suffix = linux_path.trim_start_matches('/').replace('/', "\\");
    Ok(format!("\\\\wsl.localhost\\{}\\{}", distro, suffix))
}

pub fn parse_unc_wsl_path(path: &str) -> Result<Option<WslPath>, String> {
    let normalized = path.trim();
    let prefixes = ["\\\\wsl.localhost\\", "\\\\wsl$\\"];
    let Some(prefix) = prefixes.iter().find(|prefix| {
        normalized.len() >= prefix.len() && normalized[..prefix.len()].eq_ignore_ascii_case(prefix)
    }) else {
        return Ok(None);
    };
    let rest = &normalized[prefix.len()..];
    let mut parts = rest.split('\\');
    let distro = parts.next().unwrap_or_default().to_string();
    if distro.is_empty() {
        return Err("wsl_distro_missing: UNC path does not include distro".to_string());
    }
    let linux_suffix = parts.collect::<Vec<_>>().join("/");
    let linux_path = if linux_suffix.is_empty() {
        "/".to_string()
    } else {
        format!("/{}", linux_suffix)
    };
    Ok(Some(WslPath { distro, linux_path }))
}

#[tauri::command]
pub async fn wsl_to_unc_path(distro: String, linux_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || linux_path_to_unc(&distro, &linux_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn unc_to_wsl_path(path: String) -> Result<Option<WslPath>, String> {
    tokio::task::spawn_blocking(move || parse_unc_wsl_path(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn wsl_list_distros() -> Result<Vec<WslDistroInfo>, String> {
    tokio::task::spawn_blocking(move || {
        let mut command = Command::new("wsl.exe");
        crate::subprocess::configure_background_command(&mut command);
        let output = command
            .args(["-l", "-v"])
            .output()
            .map_err(|e| format!("wsl_unavailable: {e}"))?;
        if !output.status.success() {
            return Err(command_error(
                "wsl_command_failed",
                &output.stderr,
                output.status.code(),
            ));
        }
        parse_wsl_list_verbose(&decode_wsl_output(&output.stdout))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn wsl_check_distro(distro: String) -> Result<WslDistroHealth, String> {
    tokio::task::spawn_blocking(move || {
        let script =
            r#"printf '%s\0%s\0%s' "$HOME" "${SHELL:-/bin/sh}" "$(command -v git || true)""#;
        match run_wsl_sh_capture(&distro, script, &[]) {
            Ok(stdout) => {
                let decoded = decode_wsl_output(&stdout);
                let fields = split_nul(&decoded);
                Ok(WslDistroHealth {
                    distro,
                    available: true,
                    home: fields.first().cloned().unwrap_or_default(),
                    shell: fields
                        .get(1)
                        .cloned()
                        .unwrap_or_else(|| "/bin/sh".to_string()),
                    git_path: fields.get(2).cloned().unwrap_or_default(),
                    error: None,
                })
            }
            Err(error) => Ok(WslDistroHealth {
                distro,
                available: false,
                home: String::new(),
                shell: String::new(),
                git_path: String::new(),
                error: Some(error),
            }),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn wsl_detect_agent_versions(
    distro: String,
    shell: Option<String>,
) -> Result<WslAgentVersions, String> {
    tokio::task::spawn_blocking(move || {
        let marker = "__NEZHA_AGENT_VERSIONS__";
        let script = r#"claude_path="$(type -P claude || true)"
codex_path="$(type -P codex || true)"
claude_version=""
codex_version=""
if [ -n "$claude_path" ]; then claude_version="$(claude --version 2>/dev/null | head -n 1 || true)"; fi
if [ -n "$codex_path" ]; then codex_version="$(codex --version 2>/dev/null | head -n 1 || true)"; fi
printf '__NEZHA_AGENT_VERSIONS__%s\0%s\0%s\0%s' "$claude_path" "$claude_version" "$codex_path" "$codex_version""#;
        let stdout = run_wsl_interactive_shell_capture(&distro, shell.as_deref(), script)?;
        let decoded = decode_wsl_output(&stdout);
        let payload = decoded
            .rsplit_once(marker)
            .map(|(_, payload)| payload)
            .unwrap_or(decoded.as_str());
        let fields = split_nul(payload);
        Ok(WslAgentVersions {
            claude_path: fields.first().cloned().unwrap_or_default(),
            claude_version: fields.get(1).cloned().unwrap_or_default(),
            codex_path: fields.get(2).cloned().unwrap_or_default(),
            codex_version: fields.get(3).cloned().unwrap_or_default(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn wsl_validate_project_path(
    distro: String,
    linux_path: String,
) -> Result<WslProjectValidation, String> {
    tokio::task::spawn_blocking(move || {
        if !linux_path.starts_with('/') {
            return Ok(WslProjectValidation {
                exists: false,
                writable: false,
                git_detected: false,
                canonical_path: String::new(),
                error: Some("wsl_path_invalid: Linux path must be absolute".to_string()),
            });
        }

        let script = r#"p="$1"
if [ ! -e "$p" ]; then
  printf '0\00\00\0\0wsl_path_missing'
  exit 0
fi
canon="$(readlink -f -- "$p")" || {
  printf '0\00\00\0\0wsl_missing_coreutils'
  exit 0
}
if [ ! -d "$canon" ]; then
  printf '0\00\00\0%s\0wsl_path_not_directory' "$canon"
  exit 0
fi
writable=0
[ -w "$canon" ] && writable=1
git_detected=0
if command -v git >/dev/null 2>&1 && git -C "$canon" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git_detected=1
fi
printf '1\0%s\0%s\0%s\0' "$writable" "$git_detected" "$canon""#;
        let stdout = run_wsl_sh_capture(&distro, script, &[linux_path])?;
        let decoded = decode_wsl_output(&stdout);
        let fields = split_nul(&decoded);
        let exists = fields.first().is_some_and(|value| value == "1");
        Ok(WslProjectValidation {
            exists,
            writable: fields.get(1).is_some_and(|value| value == "1"),
            git_detected: fields.get(2).is_some_and(|value| value == "1"),
            canonical_path: fields.get(3).cloned().unwrap_or_default(),
            error: fields.get(4).filter(|value| !value.is_empty()).cloned(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_project_runtime_with_camel_case_fields() {
        let runtime = ProjectRuntime::Wsl {
            distro: "Ubuntu".to_string(),
            linux_path: "/home/me/project".to_string(),
            unc_path: Some("\\\\wsl.localhost\\Ubuntu\\home\\me\\project".to_string()),
            shell: Some("/bin/bash".to_string()),
        };

        let raw = serde_json::to_string(&runtime).unwrap();

        assert!(raw.contains(r#""kind":"wsl""#));
        assert!(raw.contains(r#""linuxPath":"/home/me/project""#));
        assert!(raw.contains(r#""uncPath":"\\\\wsl.localhost\\Ubuntu\\home\\me\\project""#));
        assert!(!raw.contains("linux_path"));
        assert!(!raw.contains("unc_path"));
    }

    #[test]
    fn converts_linux_path_to_unc_path() {
        let path = linux_path_to_unc("Ubuntu", "/home/me/project").unwrap();
        assert_eq!(path, "\\\\wsl.localhost\\Ubuntu\\home\\me\\project");
    }

    #[test]
    fn parses_wsl_unc_paths() {
        let parsed = parse_unc_wsl_path("\\\\wsl.localhost\\Ubuntu\\home\\me\\project")
            .unwrap()
            .unwrap();

        assert_eq!(parsed.distro, "Ubuntu");
        assert_eq!(parsed.linux_path, "/home/me/project");
    }

    #[test]
    fn decodes_utf16le_wsl_output() {
        let bytes = "NAME\nUbuntu\n"
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect::<Vec<_>>();

        assert_eq!(decode_wsl_output(&bytes), "NAME\nUbuntu\n");
    }

    #[test]
    fn parses_verbose_wsl_list() {
        let parsed = parse_wsl_list_verbose(
            "  NAME                   STATE           VERSION\n* Ubuntu                 Running         2\n  Rocky8                 Stopped         2\n",
        )
        .unwrap();

        assert_eq!(
            parsed,
            vec![
                WslDistroInfo {
                    name: "Ubuntu".to_string(),
                    state: "Running".to_string(),
                    version: "2".to_string(),
                    is_default: true,
                },
                WslDistroInfo {
                    name: "Rocky8".to_string(),
                    state: "Stopped".to_string(),
                    version: "2".to_string(),
                    is_default: false,
                },
            ]
        );
    }
}
