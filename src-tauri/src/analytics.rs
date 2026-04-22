// ── Session metrics ───────────────────────────────────────────────────────────

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::time::SystemTime;

#[derive(serde::Serialize, Clone, Default)]
pub(crate) struct SessionMetrics {
    pub(crate) input_tokens: u64,
    pub(crate) output_tokens: u64,
    pub(crate) tool_calls: u64,
    pub(crate) duration_secs: f64,
}

/// 缓存：session_path → (file_modified_time, SessionMetrics)
static METRICS_CACHE: Lazy<Mutex<HashMap<String, (SystemTime, SessionMetrics)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

pub(crate) fn parse_session_metrics_from_path(path: &std::path::Path) -> SessionMetrics {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return SessionMetrics { input_tokens: 0, output_tokens: 0, tool_calls: 0, duration_secs: 0.0 },
    };

    let mut input_tokens: u64 = 0;
    let mut output_tokens: u64 = 0;
    let mut tool_calls: u64 = 0;
    let mut first_ts: Option<f64> = None;
    let mut last_ts: Option<f64> = None;

    for line in content.lines() {
        let Ok(val) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };

        if let Some(ts_str) = val.get("timestamp").and_then(|v| v.as_str()) {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                let ts =
                    dt.timestamp() as f64 + dt.timestamp_subsec_millis() as f64 / 1000.0;
                if first_ts.is_none() {
                    first_ts = Some(ts);
                }
                last_ts = Some(ts);
            }
        }

        let msg_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if msg_type != "assistant" {
            continue;
        }

        if let Some(message) = val.get("message") {
            if let Some(usage) = message.get("usage") {
                input_tokens +=
                    usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
                output_tokens +=
                    usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
            }
            if let Some(content_arr) =
                message.get("content").and_then(|v| v.as_array())
            {
                for item in content_arr {
                    if item.get("type").and_then(|v| v.as_str()) == Some("tool_use") {
                        tool_calls += 1;
                    }
                }
            }
        }
    }

    let duration_secs = match (first_ts, last_ts) {
        (Some(first), Some(last)) => (last - first).max(0.0),
        _ => 0.0,
    };

    SessionMetrics { input_tokens, output_tokens, tool_calls, duration_secs }
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
    pub failed_tasks: u32,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_tool_calls: u64,
    pub total_duration_secs: f64,
    pub claude_tasks: u32,
    pub codex_tasks: u32,
    pub projects: Vec<ProjectAnalytics>,
}

#[tauri::command]
pub async fn get_weekly_analytics() -> Result<WeeklyAnalytics, String> {
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
    let mut failed_tasks: u32 = 0;
    let mut total_input_tokens: u64 = 0;
    let mut total_output_tokens: u64 = 0;
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
            if task.status == "failed" { failed_tasks += 1; }
            if task.agent == "claude" { claude_tasks += 1; } else { codex_tasks += 1; }

            // Read session metrics if available
            let session_path = task.claude_session_path.as_deref()
                .or(task.codex_session_path.as_deref());

            let (tok_in, tok_out, tc, dur) = if let Some(sp) = session_path {
                let p = std::path::Path::new(sp);
                if p.exists() {
                    let m = parse_session_metrics_cached(p);
                    (m.input_tokens, m.output_tokens, m.tool_calls, m.duration_secs)
                } else {
                    (0, 0, 0, 0.0)
                }
            } else {
                (0, 0, 0, 0.0)
            };

            total_input_tokens += tok_in;
            total_output_tokens += tok_out;
            total_tool_calls += tc;
            total_duration_secs += dur;

            let token_count = tok_in + tok_out;

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
        failed_tasks,
        total_input_tokens,
        total_output_tokens,
        total_tool_calls,
        total_duration_secs,
        claude_tasks,
        codex_tasks,
        projects: project_list,
    })
}
