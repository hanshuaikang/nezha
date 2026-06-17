// ── Session metrics ───────────────────────────────────────────────────────────

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde_json::Value;
use std::collections::HashMap;
use std::time::SystemTime;

#[derive(serde::Serialize, Clone, Default)]
pub(crate) struct SessionMetrics {
    pub(crate) tool_calls: u64,
    pub(crate) duration_secs: f64,
    pub(crate) session_file_bytes: u64,
    /// 任务累计 token 消耗（包含缓存命中 / reasoning），用于 UI"总消耗"。
    pub(crate) total_tokens: u64,
    /// 当前上下文占用（最后一轮 prompt 大小）。Codex 直读，Claude 由最后一条 assistant 推导。
    pub(crate) context_tokens: u64,
    /// 模型上下文窗口大小。仅 Codex 自带；Claude session 不暴露此值，留 0 让前端隐藏。
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
        let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
        match v.get("type").and_then(|t| t.as_str()) {
            Some("session_meta") | Some("event_msg") => return true,
            _ => {}
        }
    }
    false
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
        let Ok(val) = serde_json::from_str::<Value>(line) else { continue };
        track_timestamp(&val, &mut first_ts, &mut last_ts);

        if val.get("type").and_then(|v| v.as_str()) != Some("assistant") {
            continue;
        }
        let Some(message) = val.get("message") else { continue };

        if let Some(usage) = message.get("usage") {
            let inp = usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
            let out = usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
            let cc = usage.get("cache_creation_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
            let cr = usage.get("cache_read_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
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

fn parse_codex_metrics(content: &str) -> SessionMetrics {
    let mut tool_calls: u64 = 0;
    let mut last_token_info: Option<Value> = None;
    let mut first_ts: Option<f64> = None;
    let mut last_ts: Option<f64> = None;

    for line in content.lines() {
        let Ok(val) = serde_json::from_str::<Value>(line) else { continue };
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
                    if !info.is_null() {
                        last_token_info = Some(info.clone());
                    }
                }
            }
            ("response_item", "function_call") | ("response_item", "custom_tool_call") => {
                tool_calls += 1;
            }
            _ => {}
        }
    }

    let (total_tokens, context_tokens, context_window) =
        if let Some(info) = last_token_info.as_ref() {
            let total = info.get("total_token_usage");
            let last = info.get("last_token_usage");
            let tot = total
                .and_then(|t| t.get("total_tokens"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let ctx = last
                .and_then(|l| l.get("total_tokens"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let win = info
                .get("model_context_window")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            (tot, ctx, win)
        } else {
            (0, 0, 0)
        };

    SessionMetrics {
        tool_calls,
        duration_secs: duration_from(first_ts, last_ts),
        session_file_bytes: 0,
        total_tokens,
        context_tokens,
        context_window,
    }
}

pub(crate) fn parse_session_metrics_from_path(path: &std::path::Path) -> SessionMetrics {
    let Ok(content) = std::fs::read_to_string(path) else {
        return SessionMetrics::default();
    };
    let session_file_bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let mut metrics = if is_codex_session(&content) {
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
    let modified = match std::fs::metadata(path).and_then(|m| m.modified()) {
        Ok(t) => t,
        Err(_) => return SessionMetrics::default(),
    };

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
