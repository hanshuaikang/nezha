use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

use chrono::Utc;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::storage::atomic_write;

// ── Security: hardcoded allowed notification source ──────────────────────────

const NOTIFICATIONS_URL: &str = "https://nezha.hanshutx.com/notifications.json";
const MAX_RESPONSE_BYTES: usize = 1024 * 1024; // 1MB limit
const FETCH_INTERVAL_SECS: i64 = 3600; // 1 hour
const REQUEST_TIMEOUT_SECS: u64 = 15;
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

static NOTIFICATION_STORE_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

// ── Remote JSON types ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RemoteNotification {
    id: String,
    #[serde(rename = "type")]
    notif_type: String,
    level: String,
    title: String,
    body: String,
    url: Option<String>,
    created_at: String,
    expires_at: Option<String>,
    popup: bool,
    min_app_version: Option<String>,
    max_app_version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RemoteResponse {
    #[allow(dead_code)]
    version: u32,
    notifications: Vec<RemoteNotification>,
}

// ── Local storage types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct NotificationStore {
    read_ids: Vec<String>,
    last_fetched_at: Option<String>,
    cached_notifications: Option<Vec<RemoteNotification>>,
}

impl Default for NotificationStore {
    fn default() -> Self {
        Self {
            read_ids: vec![],
            last_fetched_at: None,
            cached_notifications: None,
        }
    }
}

// ── Frontend-facing types ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct NotificationItem {
    pub id: String,
    #[serde(rename = "notifType")]
    pub notif_type: String,
    pub level: String,
    pub title: String,
    pub body: String,
    pub url: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    pub popup: bool,
    #[serde(rename = "isRead")]
    pub is_read: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct NotificationResult {
    pub notifications: Vec<NotificationItem>,
    #[serde(rename = "unreadCount")]
    pub unread_count: usize,
    #[serde(rename = "hasUnreadPopup")]
    pub has_unread_popup: bool,
}

// ── Path helpers ─────────────────────────────────────────────────────────────

fn nezha_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "Cannot find home directory".to_string())?;
    Ok(home.join(".nezha"))
}

fn store_path() -> Result<PathBuf, String> {
    Ok(nezha_dir()?.join("notifications.json"))
}

// ── Storage I/O ──────────────────────────────────────────────────────────────

fn load_store() -> NotificationStore {
    let Ok(path) = store_path() else {
        return NotificationStore::default();
    };
    match fs::read_to_string(&path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
        Err(_) => NotificationStore::default(),
    }
}

fn save_store(store: &NotificationStore) -> Result<(), String> {
    let path = store_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    atomic_write(&path, &json)
}

fn notification_store_mutex() -> &'static Mutex<()> {
    NOTIFICATION_STORE_MUTEX.get_or_init(|| Mutex::new(()))
}

fn update_store<T, F>(mutate: F) -> Result<T, String>
where
    F: FnOnce(&mut NotificationStore) -> Result<T, String>,
{
    let _guard = notification_store_mutex().lock();
    let mut store = load_store();
    let result = mutate(&mut store)?;
    save_store(&store)?;
    Ok(result)
}

// ── Utilities ────────────────────────────────────────────────────────────────

fn should_fetch(store: &NotificationStore) -> bool {
    if store.cached_notifications.is_none() {
        return true;
    }

    match &store.last_fetched_at {
        None => true,
        Some(ts) => match chrono::DateTime::parse_from_rfc3339(ts) {
            Ok(last) => {
                let elapsed = (Utc::now() - last.with_timezone(&Utc)).num_seconds();
                elapsed > FETCH_INTERVAL_SECS
            }
            Err(_) => true,
        },
    }
}

fn apply_fetched_notifications(store: &mut NotificationStore, remote: Vec<RemoteNotification>) {
    let remote_ids: HashSet<&str> = remote.iter().map(|n| n.id.as_str()).collect();
    store.read_ids.retain(|id| remote_ids.contains(id.as_str()));
    store.last_fetched_at = Some(Utc::now().to_rfc3339());
    store.cached_notifications = Some(remote);
}

/// Strip control characters (except newline) and limit length to prevent
/// oversized or crafted strings from reaching the UI.
fn sanitize_text(s: &str, max_len: usize) -> String {
    s.chars()
        .filter(|c| !c.is_control() || *c == '\n')
        .take(max_len)
        .collect()
}

/// Only allow http(s) URLs — reject `javascript:`, `data:`, etc.
fn sanitize_url(url: &Option<String>) -> Option<String> {
    url.as_ref().and_then(|u| {
        let trimmed = u.trim();
        if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
            Some(sanitize_text(trimmed, 2000))
        } else {
            None
        }
    })
}

/// Simple semver comparison (major.minor.patch).
fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let parse = |s: &str| -> Vec<u64> {
        s.split('.')
            .map(|part| part.parse::<u64>().unwrap_or(0))
            .collect()
    };
    let va = parse(a);
    let vb = parse(b);
    let max_len = va.len().max(vb.len());
    for i in 0..max_len {
        let a_part = va.get(i).copied().unwrap_or(0);
        let b_part = vb.get(i).copied().unwrap_or(0);
        match a_part.cmp(&b_part) {
            std::cmp::Ordering::Equal => continue,
            other => return other,
        }
    }
    std::cmp::Ordering::Equal
}

/// Check if a notification should be shown for the current app version & date.
fn is_valid(notif: &RemoteNotification, app_version: &str) -> bool {
    // Check expiry
    if let Some(expires) = &notif.expires_at {
        let today = Utc::now().format("%Y-%m-%d").to_string();
        if expires.as_str() < today.as_str() {
            return false;
        }
    }
    // Check min version
    if let Some(min_ver) = &notif.min_app_version {
        if compare_versions(app_version, min_ver) == std::cmp::Ordering::Less {
            return false;
        }
    }
    // Check max version
    if let Some(max_ver) = &notif.max_app_version {
        if compare_versions(app_version, max_ver) == std::cmp::Ordering::Greater {
            return false;
        }
    }
    true
}

// ── HTTP fetch (async, with strict guards) ───────────────────────────────────

async fn fetch_remote() -> Result<Vec<RemoteNotification>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .redirect(reqwest::redirect::Policy::none()) // no redirects to prevent domain bypass
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let resp = client
        .get(NOTIFICATIONS_URL)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Fetch failed: {e}"))?;

    // Verify response is from the expected domain (guard against redirect tricks)
    let final_url = resp.url().as_str();
    if !final_url.starts_with("https://nezha.hanshutx.com/") {
        return Err(format!("Unexpected response URL: {final_url}"));
    }

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    // Verify content-type is JSON
    if let Some(ct) = resp.headers().get("content-type") {
        let ct_str = ct.to_str().unwrap_or("");
        if !ct_str.contains("application/json") && !ct_str.contains("text/plain") {
            return Err(format!("Unexpected content-type: {ct_str}"));
        }
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Read body failed: {e}"))?;

    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err("Response exceeds 1MB limit".to_string());
    }

    let remote: RemoteResponse =
        serde_json::from_slice(&bytes).map_err(|e| format!("Invalid JSON: {e}"))?;

    // Limit notification count to prevent memory abuse
    if remote.notifications.len() > 200 {
        return Err("Too many notifications".to_string());
    }

    Ok(remote.notifications)
}

// ── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_notifications() -> Result<NotificationResult, String> {
    let mut store =
        tokio::task::spawn_blocking(load_store)
            .await
            .map_err(|e| e.to_string())?;

    let notifications = if should_fetch(&store) {
        match fetch_remote().await {
            Ok(remote) => {
                let cached_remote = remote.clone();
                store = tokio::task::spawn_blocking(move || {
                    update_store(|store| {
                        apply_fetched_notifications(store, cached_remote);
                        Ok(store.clone())
                    })
                })
                .await
                .map_err(|e| e.to_string())??;

                remote
            }
            Err(err) => {
                if let Some(cached) = store.cached_notifications.clone() {
                    cached
                } else {
                    return Err(err);
                }
            }
        }
    } else {
        store.cached_notifications.clone().unwrap_or_default()
    };

    let read_set: HashSet<&str> = store.read_ids.iter().map(|s| s.as_str()).collect();

    let items: Vec<NotificationItem> = notifications
        .iter()
        .filter(|n| is_valid(n, APP_VERSION))
        .map(|n| NotificationItem {
            id: sanitize_text(&n.id, 100),
            notif_type: sanitize_text(&n.notif_type, 50),
            level: sanitize_text(&n.level, 20),
            title: sanitize_text(&n.title, 200),
            body: sanitize_text(&n.body, 2000),
            url: sanitize_url(&n.url),
            created_at: sanitize_text(&n.created_at, 20),
            popup: n.popup,
            is_read: read_set.contains(n.id.as_str()),
        })
        .collect();

    let unread_count = items.iter().filter(|n| !n.is_read).count();
    let has_unread_popup = items.iter().any(|n| !n.is_read && n.popup);

    Ok(NotificationResult {
        notifications: items,
        unread_count,
        has_unread_popup,
    })
}

#[tauri::command]
pub async fn mark_notification_read(id: String) -> Result<(), String> {
    let sanitized_id = sanitize_text(&id, 100);
    tokio::task::spawn_blocking(move || {
        update_store(|store| {
            if !store.read_ids.contains(&sanitized_id) {
                store.read_ids.push(sanitized_id);
            }
            Ok(())
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn mark_all_notifications_read() -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        update_store(|store| {
            if let Some(cached) = store.cached_notifications.clone() {
                for n in cached {
                    if !store.read_ids.contains(&n.id) {
                        store.read_ids.push(n.id);
                    }
                }
            }
            Ok(())
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notification(id: &str) -> RemoteNotification {
        RemoteNotification {
            id: id.to_string(),
            notif_type: "info".to_string(),
            level: "info".to_string(),
            title: format!("title-{id}"),
            body: format!("body-{id}"),
            url: None,
            created_at: "2026-01-01".to_string(),
            expires_at: None,
            popup: false,
            min_app_version: None,
            max_app_version: None,
        }
    }

    #[test]
    fn apply_fetched_notifications_keeps_only_existing_read_ids_in_remote() {
        let mut store = NotificationStore {
            read_ids: vec!["keep".to_string(), "drop".to_string()],
            last_fetched_at: None,
            cached_notifications: None,
        };

        apply_fetched_notifications(&mut store, vec![notification("keep"), notification("new")]);

        assert_eq!(store.read_ids, vec!["keep".to_string()]);
        assert_eq!(store.cached_notifications.unwrap().len(), 2);
        assert!(store.last_fetched_at.is_some());
    }
}
