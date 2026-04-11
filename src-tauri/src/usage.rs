use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use chrono::DateTime;
use once_cell::sync::Lazy;
use serde::Serialize;
use serde_json::{json, Value};

use crate::app_settings::{detect_claude_version, get_agent_bin, get_login_shell_path};

const CLAUDE_USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_BETA_HEADER: &str = "oauth-2025-04-20";
const CLAUDE_TIMEOUT_SECS: u64 = 12;
// 每次 Codex 尝试的超时上限；最多重试两次，所以总计最长 20 秒。
const CODEX_ATTEMPT_TIMEOUT_SECS: u64 = 10;

static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(CLAUDE_TIMEOUT_SECS))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
});

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum UsageSource<T> {
    Available { data: T },
    Unavailable { reason: String },
}

#[derive(Debug, Clone, Serialize)]
pub struct UsageSnapshot {
    pub claude: UsageSource<ClaudeUsageData>,
    pub codex: UsageSource<CodexUsageData>,
    #[serde(rename = "fetchedAt")]
    pub fetched_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct UsageWindow {
    #[serde(rename = "usedPercent")]
    pub used_percent: u8,
    #[serde(rename = "remainingPercent")]
    pub remaining_percent: u8,
    #[serde(rename = "resetAt")]
    pub reset_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClaudeUsageData {
    #[serde(rename = "fiveHour")]
    pub five_hour: Option<UsageWindow>,
    #[serde(rename = "sevenDay")]
    pub seven_day: Option<UsageWindow>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CodexUsageData {
    pub email: Option<String>,
    #[serde(rename = "planType")]
    pub plan_type: Option<String>,
    pub primary: Option<UsageWindow>,
    pub secondary: Option<UsageWindow>,
}

#[tauri::command]
pub async fn read_usage_snapshot() -> Result<UsageSnapshot, String> {
    let (claude, codex) = tokio::join!(read_claude_usage(), read_codex_usage());

    Ok(UsageSnapshot {
        claude,
        codex,
        fetched_at: chrono::Utc::now().timestamp(),
    })
}

async fn read_claude_usage() -> UsageSource<ClaudeUsageData> {
    if !cfg!(target_os = "macos") {
        return unavailable("Claude usage currently relies on macOS Keychain.");
    }

    let token_result =
        tokio::task::spawn_blocking(|| -> Result<(String, Option<String>), String> {
            let shell_path = get_login_shell_path();
            let output = Command::new("security")
                .args([
                    "find-generic-password",
                    "-s",
                    "Claude Code-credentials",
                    "-w",
                ])
                .env("PATH", shell_path)
                .stdin(Stdio::null())
                .stderr(Stdio::piped())
                .output()
                .map_err(|e| format!("Failed to read Claude credentials: {e}"))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                return Err(if stderr.is_empty() {
                    "Claude credentials are unavailable.".to_string()
                } else {
                    stderr
                });
            }

            let raw = String::from_utf8(output.stdout)
                .map_err(|e| format!("Claude credential output was not valid UTF-8: {e}"))?;
            let parsed: Value = serde_json::from_str(raw.trim())
                .map_err(|e| format!("Claude credentials JSON was invalid: {e}"))?;

            let token = parsed
                .pointer("/claudeAiOauth/accessToken")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "Claude access token was missing from Keychain data.".to_string())?;

            Ok((token.to_string(), detect_claude_version()))
        })
        .await;

    let (token, version) = match token_result {
        Ok(Ok(value)) => value,
        Ok(Err(reason)) => return unavailable(reason),
        Err(err) => return unavailable(format!("Failed to load Claude credentials: {err}")),
    };

    let user_agent = format!(
        "claude-code/{}",
        version.unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string())
    );

    let response = match HTTP_CLIENT
        .get(CLAUDE_USAGE_URL)
        .header("Authorization", format!("Bearer {token}"))
        .header("anthropic-beta", CLAUDE_BETA_HEADER)
        .header("User-Agent", user_agent)
        .header("Accept", "application/json")
        .send()
        .await
    {
        Ok(response) => response,
        Err(err) => return unavailable(format!("Claude usage request failed: {err}")),
    };

    if !response.status().is_success() {
        return unavailable(format!("Claude usage HTTP {}", response.status()));
    }

    let payload = match response.json::<Value>().await {
        Ok(value) => value,
        Err(err) => return unavailable(format!("Claude usage response was invalid JSON: {err}")),
    };

    let data = ClaudeUsageData {
        five_hour: payload.get("five_hour").and_then(parse_claude_window),
        seven_day: payload.get("seven_day").and_then(parse_claude_window),
    };

    if data.five_hour.is_none() && data.seven_day.is_none() {
        unavailable("Claude usage response did not include recognized windows.")
    } else {
        UsageSource::Available { data }
    }
}

async fn read_codex_usage() -> UsageSource<CodexUsageData> {
    match tokio::task::spawn_blocking(read_codex_usage_blocking).await {
        Ok(Ok(data)) => UsageSource::Available { data },
        Ok(Err(reason)) => unavailable(reason),
        Err(err) => unavailable(format!("Failed to read Codex usage: {err}")),
    }
}

fn read_codex_usage_blocking() -> Result<CodexUsageData, String> {
    let mut reasons = Vec::new();
    for params in [Value::Null, json!({})] {
        let deadline = Instant::now() + Duration::from_secs(CODEX_ATTEMPT_TIMEOUT_SECS);
        match read_codex_usage_blocking_once(params, deadline) {
            Ok(data) => return Ok(data),
            Err(reason) => reasons.push(reason),
        }
    }

    Err(reasons.join(" | "))
}

fn read_codex_usage_blocking_once(
    rate_limit_params: Value,
    deadline: Instant,
) -> Result<CodexUsageData, String> {
    let shell_path = get_login_shell_path();
    let binary = get_agent_bin("codex");
    let mut child = Command::new(&binary)
        .arg("app-server")
        .env("PATH", shell_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start Codex app-server: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Codex app-server stdout was unavailable.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Codex app-server stderr was unavailable.".to_string())?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Codex app-server stdin was unavailable.".to_string())?;

    let (message_tx, message_rx) = mpsc::channel::<Result<Value, String>>();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let line = match line {
                Ok(line) => line,
                Err(err) => {
                    let _ = message_tx.send(Err(format!(
                        "Failed reading Codex app-server output: {err}"
                    )));
                    break;
                }
            };

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let parsed = serde_json::from_str::<Value>(trimmed)
                .map_err(|err| format!("Invalid Codex app-server JSON: {err}"));
            if message_tx.send(parsed).is_err() {
                break;
            }
        }
    });

    // stderr 线程仅用于耗尽管道，防止子进程因 stderr 满而阻塞。
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut buf = String::new();
        let _ = reader.read_to_string(&mut buf);
    });

    let result = (|| -> Result<CodexUsageData, String> {
        write_json_line(
            &mut stdin,
            &json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "clientInfo": {
                        "name": "nezha",
                        "version": env!("CARGO_PKG_VERSION"),
                    },
                    "capabilities": {},
                }
            }),
        )?;
        wait_for_result(&message_rx, 1, deadline)?;

        write_json_line(
            &mut stdin,
            &json!({ "jsonrpc": "2.0", "method": "initialized" }),
        )?;

        write_json_line(
            &mut stdin,
            &json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "account/read",
                "params": {}
            }),
        )?;
        let account = wait_for_result(&message_rx, 2, deadline)?;

        write_json_line(
            &mut stdin,
            &json!({
                "jsonrpc": "2.0",
                "id": 3,
                "method": "account/rateLimits/read",
                "params": rate_limit_params
            }),
        )?;
        let rate_limits = wait_for_result(&message_rx, 3, deadline)?;

        Ok(parse_codex_usage(account, rate_limits))
    })();

    let _ = child.kill();
    let _ = child.wait();

    match result {
        Ok(data) => Ok(data),
        Err(reason) => Err(reason),
    }
}

fn write_json_line(stdin: &mut dyn Write, value: &Value) -> Result<(), String> {
    let payload = serde_json::to_string(value)
        .map_err(|e| format!("Failed to serialize Codex request: {e}"))?;
    stdin
        .write_all(payload.as_bytes())
        .map_err(|e| format!("Failed writing Codex request: {e}"))?;
    stdin
        .write_all(b"\n")
        .map_err(|e| format!("Failed writing Codex request terminator: {e}"))?;
    stdin
        .flush()
        .map_err(|e| format!("Failed flushing Codex request: {e}"))?;
    Ok(())
}

fn wait_for_result(
    rx: &mpsc::Receiver<Result<Value, String>>,
    expected_id: i64,
    deadline: Instant,
) -> Result<Value, String> {
    loop {
        let now = Instant::now();
        if now >= deadline {
            return Err(format!(
                "Timed out waiting for Codex response {expected_id}."
            ));
        }

        let remaining = deadline.saturating_duration_since(now);
        let message = rx
            .recv_timeout(remaining)
            .map_err(|_| format!("Codex app-server closed before response {expected_id}."))??;

        let matches_id = message
            .get("id")
            .and_then(Value::as_i64)
            .map_or(false, |id| id == expected_id);
        if !matches_id {
            continue;
        }

        if let Some(result) = message.get("result") {
            return Ok(result.clone());
        }

        if let Some(error) = message.get("error") {
            let msg = error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("Unknown Codex app-server error");
            return Err(msg.to_string());
        }

        return Err(format!(
            "Codex response {expected_id} did not include result or error."
        ));
    }
}

fn parse_codex_usage(account: Value, rate_limits: Value) -> CodexUsageData {
    let account_node = account.get("account").unwrap_or(&Value::Null);
    let rate_limit_source = rate_limits
        .get("rateLimitsByLimitId")
        .and_then(Value::as_object)
        .and_then(|limits| {
            limits
                .get("codex")
                .cloned()
                .or_else(|| limits.values().next().cloned())
        })
        .or_else(|| rate_limits.get("rateLimits").cloned())
        .unwrap_or(Value::Null);

    CodexUsageData {
        email: account_node
            .get("email")
            .and_then(Value::as_str)
            .map(str::to_string),
        plan_type: account_node
            .get("planType")
            .and_then(Value::as_str)
            .map(str::to_string),
        primary: rate_limit_source
            .get("primary")
            .and_then(parse_codex_window),
        secondary: rate_limit_source
            .get("secondary")
            .and_then(parse_codex_window),
    }
}

fn parse_codex_window(value: &Value) -> Option<UsageWindow> {
    // Codex returns usedPercent as an integer 0–100, not a 0.0–1.0 fraction.
    let used_percent = value.get("usedPercent").and_then(|v| {
        let raw = match v {
            Value::Number(n) => n.as_f64()?,
            Value::String(s) => s.parse::<f64>().ok()?,
            _ => return None,
        };
        Some(raw.clamp(0.0, 100.0).round() as u8)
    })?;
    Some(UsageWindow {
        used_percent,
        remaining_percent: 100_u8.saturating_sub(used_percent),
        reset_at: value.get("resetsAt").and_then(parse_reset_value),
    })
}

fn parse_claude_window(value: &Value) -> Option<UsageWindow> {
    let used_percent = value.get("utilization").and_then(parse_percent_value)?;
    Some(UsageWindow {
        used_percent,
        remaining_percent: 100_u8.saturating_sub(used_percent),
        reset_at: value.get("resets_at").and_then(parse_reset_value),
    })
}

fn parse_percent_value(value: &Value) -> Option<u8> {
    let raw = match value {
        Value::Number(number) => number.as_f64()?,
        Value::String(string) => string.parse::<f64>().ok()?,
        _ => return None,
    };

    let normalized = if raw <= 1.0 { raw * 100.0 } else { raw };
    let clamped = normalized.clamp(0.0, 100.0).round();
    Some(clamped as u8)
}

fn parse_reset_value(value: &Value) -> Option<i64> {
    match value {
        Value::Number(number) => number.as_i64(),
        Value::String(string) => {
            if let Ok(timestamp) = string.parse::<i64>() {
                Some(timestamp)
            } else {
                DateTime::parse_from_rfc3339(string)
                    .ok()
                    .map(|dt| dt.timestamp())
            }
        }
        _ => None,
    }
}

fn unavailable<T>(reason: impl Into<String>) -> UsageSource<T> {
    UsageSource::Unavailable {
        reason: reason.into(),
    }
}
