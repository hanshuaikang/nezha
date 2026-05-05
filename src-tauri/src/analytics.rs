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
        total_tokens,
        context_tokens,
        context_window,
    }
}

pub(crate) fn parse_session_metrics_from_path(path: &std::path::Path) -> SessionMetrics {
    let Ok(content) = std::fs::read_to_string(path) else {
        return SessionMetrics::default();
    };
    if is_codex_session(&content) {
        parse_codex_metrics(&content)
    } else {
        parse_claude_metrics(&content)
    }
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

// ── Weekly analytics ──────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct DayStats {
    pub date: String,
    pub task_count: u32,
    pub done_count: u32,
    pub token_count: u64,
}

#[derive(serde::Serialize)]
pub struct ProjectAnalytics {
    pub project_id: String,
    pub project_name: String,
    pub task_count: u32,
    pub done_count: u32,
    pub token_count: u64,
    pub tool_calls: u64,
}

#[derive(serde::Serialize)]
pub struct WeeklyAnalytics {
    pub daily: Vec<DayStats>,
    pub total_tasks: u32,
    pub done_tasks: u32,
    pub total_tokens: u64,
    pub total_tool_calls: u64,
    pub total_duration_secs: f64,
    pub claude_tasks: u32,
    pub codex_tasks: u32,
    pub projects: Vec<ProjectAnalytics>,
}

#[tauri::command]
pub async fn get_weekly_analytics() -> Result<WeeklyAnalytics, String> {
    tokio::task::spawn_blocking(compute_weekly_analytics)
        .await
        .map_err(|e| format!("get_weekly_analytics join error: {}", e))?
}

fn compute_weekly_analytics() -> Result<WeeklyAnalytics, String> {
    use chrono::{Local, Duration};

    let today = Local::now().date_naive();
    // Build a list of the last 7 dates (oldest first)
    let dates: Vec<String> = (0..7i64)
        .rev()
        .map(|i| (today - Duration::days(i)).format("%Y-%m-%d").to_string())
        .collect();

    let cutoff_ms = (Local::now() - Duration::days(7)).timestamp_millis();

    // Load all projects
    let projects = crate::storage::load_projects()?;

    let mut daily_map: HashMap<String, DayStats> = dates
        .iter()
        .map(|d| (d.clone(), DayStats { date: d.clone(), task_count: 0, done_count: 0, token_count: 0 }))
        .collect();

    let mut project_map: HashMap<String, ProjectAnalytics> = HashMap::new();
    let mut total_tasks: u32 = 0;
    let mut done_tasks: u32 = 0;
    let mut total_tokens: u64 = 0;
    let mut total_tool_calls: u64 = 0;
    let mut total_duration_secs: f64 = 0.0;
    let mut claude_tasks: u32 = 0;
    let mut codex_tasks: u32 = 0;

    for project in &projects {
        let tasks = crate::storage::load_project_tasks(project.id.clone())?;

        for task in &tasks {
            if task.created_at < cutoff_ms {
                continue;
            }

            // Determine date bucket
            let task_date = chrono::DateTime::from_timestamp_millis(task.created_at)
                .map(|dt| dt.with_timezone(&Local).format("%Y-%m-%d").to_string())
                .unwrap_or_default();

            total_tasks += 1;
            if task.status == "done" { done_tasks += 1; }
            if task.agent == "claude" { claude_tasks += 1; } else { codex_tasks += 1; }

            // Read session metrics if available
            let session_path = task.claude_session_path.as_deref()
                .or(task.codex_session_path.as_deref());

            let (token_count, tc, dur) = if let Some(sp) = session_path {
                let p = std::path::Path::new(sp);
                if p.exists() {
                    let m = parse_session_metrics_cached(p);
                    (m.total_tokens, m.tool_calls, m.duration_secs)
                } else {
                    (0, 0, 0.0)
                }
            } else {
                (0, 0, 0.0)
            };

            total_tokens += token_count;
            total_tool_calls += tc;
            total_duration_secs += dur;

            // Update daily bucket
            if let Some(day) = daily_map.get_mut(&task_date) {
                day.task_count += 1;
                if task.status == "done" { day.done_count += 1; }
                day.token_count += token_count;
            }

            // Update project bucket
            let proj_entry = project_map.entry(project.id.clone()).or_insert_with(|| ProjectAnalytics {
                project_id: project.id.clone(),
                project_name: project.name.clone(),
                task_count: 0,
                done_count: 0,
                token_count: 0,
                tool_calls: 0,
            });
            proj_entry.task_count += 1;
            if task.status == "done" { proj_entry.done_count += 1; }
            proj_entry.token_count += token_count;
            proj_entry.tool_calls += tc;
        }
    }

    let mut daily: Vec<DayStats> = dates.iter()
        .filter_map(|d| daily_map.remove(d))
        .collect();
    daily.sort_by(|a, b| a.date.cmp(&b.date));

    let mut project_list: Vec<ProjectAnalytics> = project_map.into_values().collect();
    project_list.sort_by(|a, b| b.task_count.cmp(&a.task_count));

    Ok(WeeklyAnalytics {
        daily,
        total_tasks,
        done_tasks,
        total_tokens,
        total_tool_calls,
        total_duration_secs,
        claude_tasks,
        codex_tasks,
        projects: project_list,
    })
}
