// ── Session metrics ───────────────────────────────────────────────────────────

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

#[derive(serde::Serialize, Clone, Default)]
pub(crate) struct SessionMetrics {
    pub(crate) tool_calls: u64,
    pub(crate) duration_secs: f64,
    pub(crate) session_file_bytes: u64,
    /// 任务累计 token 消耗（包含缓存命中 / reasoning），用于 UI"总消耗"。
    pub(crate) total_tokens: u64,
    /// 当前上下文占用（最后一轮 prompt 大小）。Codex 直读，Claude / Pi 由最后一条 assistant 推导。
    pub(crate) context_tokens: u64,
    /// 模型上下文窗口大小。Codex 直读；Pi 通过 extension sidecar 补充；Claude 留 0 让前端显示单值。
    pub(crate) context_window: u64,
}

/// 缓存：session_path → (file_modified_time, SessionMetrics)
static METRICS_CACHE: Lazy<Mutex<HashMap<String, (SystemTime, SessionMetrics)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn parse_rfc3339_secs(ts: &str) -> Option<f64> {
    chrono::DateTime::parse_from_rfc3339(ts)
        .ok()
        .map(|dt| dt.timestamp() as f64 + dt.timestamp_subsec_millis() as f64 / 1000.0)
}

fn track_timestamp(val: &Value, first: &mut Option<f64>, last: &mut Option<f64>) {
    if let Some(ts_str) = val.get("timestamp").and_then(|v| v.as_str()) {
        if let Some(ts) = parse_rfc3339_secs(ts_str) {
            if first.is_none() {
                *first = Some(ts);
            }
            *last = Some(ts);
        }
    }
}

fn duration_from(first: Option<f64>, last: Option<f64>) -> f64 {
    match (first, last) {
        (Some(a), Some(b)) => (b - a).max(0.0),
        _ => 0.0,
    }
}

/// 探测格式：与 `session.rs::is_codex_format` 保持一致——前 10 行内出现
/// `type=session_meta` 或 `type=event_msg` 即视为 Codex。
/// Why: Codex 各版本 `payload.originator` 取值漂移（codex_cli_rs / codex-tui / ...），
/// 仅靠 originator 前缀判定会让部分可正常回放的 Codex session 被错走 Claude 解析，
/// token/tool_calls 全部归零；判定标准必须与会话查看器保持一致。
fn is_codex_session(content: &str) -> bool {
    for line in content.lines().take(10) {
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        match v.get("type").and_then(|t| t.as_str()) {
            Some("session_meta") | Some("event_msg") => return true,
            _ => {}
        }
    }
    false
}

fn is_pi_session(content: &str) -> bool {
    let Some(first) = content.lines().find(|line| !line.trim().is_empty()) else {
        return false;
    };
    let Ok(val) = serde_json::from_str::<Value>(first) else {
        return false;
    };
    val.get("type").and_then(|v| v.as_str()) == Some("session")
        && val.get("version").and_then(|v| v.as_u64()).is_some()
        && val.get("id").and_then(|v| v.as_str()).is_some()
        && val.get("cwd").and_then(|v| v.as_str()).is_some()
}

fn parse_claude_metrics(content: &str) -> SessionMetrics {
    let mut input_tokens: u64 = 0;
    let mut output_tokens: u64 = 0;
    let mut cache_creation: u64 = 0;
    let mut cache_read: u64 = 0;
    let mut tool_calls: u64 = 0;
    let mut last_context: u64 = 0;
    let mut first_ts: Option<f64> = None;
    let mut last_ts: Option<f64> = None;

    for line in content.lines() {
        let Ok(val) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        track_timestamp(&val, &mut first_ts, &mut last_ts);

        if val.get("type").and_then(|v| v.as_str()) != Some("assistant") {
            continue;
        }
        let Some(message) = val.get("message") else {
            continue;
        };

        if let Some(usage) = message.get("usage") {
            let inp = usage
                .get("input_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let out = usage
                .get("output_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let cc = usage
                .get("cache_creation_input_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let cr = usage
                .get("cache_read_input_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            input_tokens += inp;
            output_tokens += out;
            cache_creation += cc;
            cache_read += cr;
            // 最后一条 assistant 的 prompt 总大小 ≈ 当前上下文占用
            last_context = inp + cc + cr;
        }

        if let Some(arr) = message.get("content").and_then(|v| v.as_array()) {
            for item in arr {
                if item.get("type").and_then(|v| v.as_str()) == Some("tool_use") {
                    tool_calls += 1;
                }
            }
        }
    }

    SessionMetrics {
        tool_calls,
        duration_secs: duration_from(first_ts, last_ts),
        session_file_bytes: 0,
        total_tokens: input_tokens + output_tokens + cache_creation + cache_read,
        context_tokens: last_context,
        context_window: 0, // Claude session 不带窗口大小
    }
}

fn pi_metrics_sidecar_path(session_path: &Path) -> PathBuf {
    PathBuf::from(format!(
        "{}.nezha-metrics.json",
        session_path.to_string_lossy()
    ))
}

fn read_pi_metrics_sidecar(session_path: &Path) -> Option<(u64, u64)> {
    let raw = std::fs::read_to_string(pi_metrics_sidecar_path(session_path)).ok()?;
    let val = serde_json::from_str::<Value>(&raw).ok()?;

    let context_window = val
        .get("context_usage")
        .and_then(|v| v.get("context_window"))
        .and_then(|v| v.as_u64())
        .or_else(|| {
            val.get("model")
                .and_then(|v| v.get("context_window"))
                .and_then(|v| v.as_u64())
        })
        .unwrap_or(0);
    let context_tokens = val
        .get("context_usage")
        .and_then(|v| v.get("tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    if context_window > 0 || context_tokens > 0 {
        Some((context_window, context_tokens))
    } else {
        None
    }
}

fn parse_pi_metrics(content: &str, session_path: Option<&Path>) -> SessionMetrics {
    let mut total_tokens: u64 = 0;
    let mut context_tokens: u64 = 0;
    let mut context_window: u64 = 0;
    let mut first_ts: Option<f64> = None;
    let mut last_ts: Option<f64> = None;

    for line in content.lines() {
        let Ok(val) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        track_timestamp(&val, &mut first_ts, &mut last_ts);

        if val.get("type").and_then(|v| v.as_str()) != Some("message") {
            continue;
        }
        let Some(message) = val.get("message") else {
            continue;
        };
        if message.get("role").and_then(|v| v.as_str()) != Some("assistant") {
            continue;
        }
        let Some(usage) = message.get("usage") else {
            continue;
        };

        let turn_total = usage
            .get("totalTokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        if turn_total > 0 {
            total_tokens += turn_total;
        }

        let inp = usage.get("input").and_then(|v| v.as_u64()).unwrap_or(0);
        let cache_read = usage.get("cacheRead").and_then(|v| v.as_u64()).unwrap_or(0);
        let cache_write = usage
            .get("cacheWrite")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let next_context = inp + cache_read + cache_write;
        if next_context > 0 {
            context_tokens = next_context;
        }
    }

    if let Some((sidecar_window, sidecar_context)) = session_path.and_then(read_pi_metrics_sidecar)
    {
        if sidecar_window > 0 {
            context_window = sidecar_window;
        }
        context_tokens = sidecar_context;
    }

    SessionMetrics {
        tool_calls: 0,
        duration_secs: duration_from(first_ts, last_ts),
        session_file_bytes: 0,
        total_tokens,
        context_tokens,
        context_window,
    }
}

fn parse_codex_metrics(content: &str) -> SessionMetrics {
    let mut tool_calls: u64 = 0;
    let mut total_tokens: u64 = 0;
    let mut context_tokens: u64 = 0;
    let mut context_window: u64 = 0;
    let mut first_ts: Option<f64> = None;
    let mut last_ts: Option<f64> = None;

    for line in content.lines() {
        let Ok(val) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        track_timestamp(&val, &mut first_ts, &mut last_ts);

        let t = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let payload = val.get("payload");
        let pt = payload
            .and_then(|p| p.get("type"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        match (t, pt) {
            ("event_msg", "token_count") => {
                if let Some(info) = payload.and_then(|p| p.get("info")) {
                    let next_total = info
                        .get("total_token_usage")
                        .and_then(|t| t.get("total_tokens"))
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    if next_total > 0 {
                        total_tokens = next_total;
                    }

                    let next_context = info
                        .get("last_token_usage")
                        .and_then(|l| l.get("total_tokens"))
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    if next_context > 0 {
                        context_tokens = next_context;
                    }

                    let next_window = info
                        .get("model_context_window")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    if next_window > 0 {
                        context_window = next_window;
                    }
                }
            }
            ("event_msg", "task_started") => {
                let next_window = payload
                    .and_then(|p| p.get("model_context_window"))
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                if next_window > 0 {
                    context_window = next_window;
                }
            }
            ("response_item", "function_call") | ("response_item", "custom_tool_call") => {
                tool_calls += 1;
            }
            _ => {}
        }
    }

    SessionMetrics {
        tool_calls,
        duration_secs: duration_from(first_ts, last_ts),
        session_file_bytes: 0,
        total_tokens,
        context_tokens,
        context_window,
    }
}

pub(crate) fn parse_session_metrics_from_path(path: &Path) -> SessionMetrics {
    let Ok(content) = std::fs::read_to_string(path) else {
        return SessionMetrics::default();
    };
    let session_file_bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let mut metrics = if is_pi_session(&content) {
        parse_pi_metrics(&content, Some(path))
    } else if is_codex_session(&content) {
        parse_codex_metrics(&content)
    } else {
        parse_claude_metrics(&content)
    };
    metrics.session_file_bytes = session_file_bytes;
    metrics
}

/// 带缓存的 session 指标解析
/// 通过文件修改时间判断缓存是否有效，避免重复解析未变更的文件
pub(crate) fn parse_session_metrics_cached(path: &std::path::Path) -> SessionMetrics {
    let path_str = path.to_string_lossy().to_string();

    // 获取文件修改时间
    let mut modified = match std::fs::metadata(path).and_then(|m| m.modified()) {
        Ok(t) => t,
        Err(_) => return SessionMetrics::default(),
    };
    if let Ok(sidecar_modified) =
        std::fs::metadata(pi_metrics_sidecar_path(path)).and_then(|m| m.modified())
    {
        if sidecar_modified > modified {
            modified = sidecar_modified;
        }
    }

    // 检查缓存
    {
        let cache = METRICS_CACHE.lock();
        if let Some((cached_time, cached_metrics)) = cache.get(&path_str) {
            if *cached_time == modified {
                return cached_metrics.clone();
            }
        }
    }

    // 缓存未命中，完整解析
    let metrics = parse_session_metrics_from_path(path);

    // 更新缓存
    {
        let mut cache = METRICS_CACHE.lock();
        cache.insert(path_str, (modified, metrics.clone()));
    }

    metrics
}

#[tauri::command]
pub async fn read_session_metrics(session_path: String) -> Result<SessionMetrics, String> {
    tokio::task::spawn_blocking(move || {
        let path = std::path::Path::new(&session_path);
        if !path.exists() {
            return Err(format!("Session file not found: {}", session_path));
        }
        Ok(parse_session_metrics_cached(path))
    })
    .await
    .map_err(|e| format!("read_session_metrics join error: {}", e))?
}
#[cfg(test)]
mod tests {
    use super::{
        is_pi_session, parse_claude_metrics, parse_codex_metrics, parse_pi_metrics,
        pi_metrics_sidecar_path,
    };

    #[test]
    fn codex_reads_total_last_usage_and_context_window() {
        let content = r#"{"timestamp":"2026-06-16T10:00:00Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"total_tokens":12345},"last_token_usage":{"total_tokens":2345},"model_context_window":200000}}}
{"timestamp":"2026-06-16T10:00:04Z","type":"response_item","payload":{"type":"function_call"}}"#;

        let metrics = parse_codex_metrics(content);

        assert_eq!(metrics.total_tokens, 12345);
        assert_eq!(metrics.context_tokens, 2345);
        assert_eq!(metrics.context_window, 200000);
        assert_eq!(metrics.tool_calls, 1);
        assert_eq!(metrics.duration_secs, 4.0);
    }

    #[test]
    fn codex_uses_task_started_context_window_before_token_count() {
        let content = r#"{"type":"event_msg","payload":{"type":"task_started","model_context_window":128000}}
{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"total_tokens":9000},"last_token_usage":{"total_tokens":3000}}}}"#;

        let metrics = parse_codex_metrics(content);

        assert_eq!(metrics.total_tokens, 9000);
        assert_eq!(metrics.context_tokens, 3000);
        assert_eq!(metrics.context_window, 128000);
    }

    #[test]
    fn codex_zero_token_events_do_not_wipe_non_zero_metrics() {
        let content = r#"{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"total_tokens":1200},"last_token_usage":{"total_tokens":400},"model_context_window":64000}}}
{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"total_tokens":0},"last_token_usage":{"total_tokens":0},"model_context_window":0}}}
{"type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"total_tokens":450}}}}"#;

        let metrics = parse_codex_metrics(content);

        assert_eq!(metrics.total_tokens, 1200);
        assert_eq!(metrics.context_tokens, 450);
        assert_eq!(metrics.context_window, 64000);
    }

    #[test]
    fn claude_usage_sets_total_and_context_without_window() {
        let content = r#"{"timestamp":"2026-06-16T10:00:00Z","type":"assistant","message":{"usage":{"input_tokens":100,"output_tokens":50,"cache_creation_input_tokens":20,"cache_read_input_tokens":30},"content":[{"type":"text","text":"hello"}]}}
{"timestamp":"2026-06-16T10:00:02Z","type":"assistant","message":{"usage":{"input_tokens":200,"output_tokens":75,"cache_creation_input_tokens":10,"cache_read_input_tokens":15},"content":[{"type":"tool_use","id":"toolu_1"}]}}"#;

        let metrics = parse_claude_metrics(content);

        assert_eq!(metrics.total_tokens, 500);
        assert_eq!(metrics.context_tokens, 225);
        assert_eq!(metrics.context_window, 0);
        assert_eq!(metrics.tool_calls, 1);
    }

    #[test]
    fn pi_usage_sets_total_and_context_without_window() {
        let content = r#"{"type":"session","version":3,"id":"sid","timestamp":"2026-06-16T10:00:00Z","cwd":"/tmp/demo"}
{"type":"message","id":"u1","timestamp":"2026-06-16T10:00:01Z","message":{"role":"user","content":[{"type":"text","text":"hi"}]}}
{"type":"message","id":"a1","timestamp":"2026-06-16T10:00:03Z","message":{"role":"assistant","content":[{"type":"text","text":"hello"}],"usage":{"input":100,"output":50,"cacheRead":20,"cacheWrite":5,"totalTokens":175}}}
{"type":"message","id":"a2","timestamp":"2026-06-16T10:00:06Z","message":{"role":"assistant","content":[{"type":"text","text":"done"}],"usage":{"input":200,"output":75,"cacheRead":30,"cacheWrite":10,"totalTokens":315}}}"#;

        assert!(is_pi_session(content));
        let metrics = parse_pi_metrics(content, None);

        assert_eq!(metrics.total_tokens, 490);
        assert_eq!(metrics.context_tokens, 240);
        assert_eq!(metrics.context_window, 0);
        assert_eq!(metrics.duration_secs, 6.0);
    }

    #[test]
    fn pi_sidecar_sets_context_window_for_percentage() {
        let content = r#"{"type":"session","version":3,"id":"sid","timestamp":"2026-06-16T10:00:00Z","cwd":"/tmp/demo"}
{"type":"message","id":"a1","timestamp":"2026-06-16T10:00:03Z","message":{"role":"assistant","content":[{"type":"text","text":"hello"}],"usage":{"input":10000,"output":50,"cacheRead":3000,"cacheWrite":700,"totalTokens":13750}}}"#;
        let session_path =
            std::env::temp_dir().join(format!("nezha-pi-metrics-{}.jsonl", uuid::Uuid::new_v4()));
        let sidecar_path = pi_metrics_sidecar_path(&session_path);
        std::fs::write(
            &sidecar_path,
            r#"{"schema":1,"agent":"pi","context_usage":{"tokens":12345,"context_window":200000,"percent":6.1725},"model":{"context_window":200000}}"#,
        )
        .unwrap();

        let metrics = parse_pi_metrics(content, Some(&session_path));

        assert_eq!(metrics.total_tokens, 13750);
        assert_eq!(metrics.context_tokens, 12345);
        assert_eq!(metrics.context_window, 200_000);

        let _ = std::fs::remove_file(sidecar_path);
    }

    #[test]
    fn pi_sidecar_clears_stale_context_when_usage_is_unknown() {
        let content = r#"{"type":"session","version":3,"id":"sid","timestamp":"2026-06-16T10:00:00Z","cwd":"/tmp/demo"}
{"type":"message","id":"a1","timestamp":"2026-06-16T10:00:03Z","message":{"role":"assistant","content":[{"type":"text","text":"hello"}],"usage":{"input":10000,"output":50,"cacheRead":3000,"cacheWrite":700,"totalTokens":13750}}}"#;
        let session_path =
            std::env::temp_dir().join(format!("nezha-pi-metrics-{}.jsonl", uuid::Uuid::new_v4()));
        let sidecar_path = pi_metrics_sidecar_path(&session_path);
        std::fs::write(
            &sidecar_path,
            r#"{"schema":1,"agent":"pi","context_usage":{"tokens":null,"context_window":200000,"percent":null},"model":{"context_window":200000}}"#,
        )
        .unwrap();

        let metrics = parse_pi_metrics(content, Some(&session_path));

        assert_eq!(metrics.total_tokens, 13750);
        assert_eq!(metrics.context_tokens, 0);
        assert_eq!(metrics.context_window, 200_000);

        let _ = std::fs::remove_file(sidecar_path);
    }
}
