use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const CLAUDE_KEYCHAIN_SERVICE: &str = "Claude Code-credentials";
const CLAUDE_OAUTH_USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_OAUTH_REFRESH_URL: &str = "https://platform.claude.com/v1/oauth/token";
const CLAUDE_OAUTH_CLIENT_ID: &str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const CLAUDE_OAUTH_BETA: &str = "oauth-2025-04-20";
const CLAUDE_CODE_USER_AGENT: &str = "claude-code/2.1.0";
const CACHE_TTL_SECONDS: i64 = 5 * 60;

// Snapshot timestamps are Unix seconds; Claude credential expiry is Unix millis.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimitSnapshot {
    pub provider: String,
    pub updated_at: i64,
    pub primary: Option<RateLimitWindow>,
    pub secondary: Option<RateLimitWindow>,
    pub tertiary: Option<RateLimitWindow>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub extra_windows: Vec<NamedRateLimitWindow>,
}

impl RateLimitSnapshot {
    pub fn is_fresh(&self, now: i64) -> bool {
        now.saturating_sub(self.updated_at) < CACHE_TTL_SECONDS
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimitWindow {
    pub used_percent: f64,
    pub window_duration_mins: i64,
    pub resets_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedRateLimitWindow {
    pub id: String,
    pub title: String,
    pub window: RateLimitWindow,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimitsQueryResult {
    pub snapshot: Option<RateLimitSnapshot>,
    pub status: RateLimitsQueryStatus,
    pub error: Option<RateLimitsQueryError>,
    pub ttl_seconds: i64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RateLimitsQueryStatus {
    CacheHit,
    Fresh,
    StaleFallback,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimitsQueryError {
    pub kind: RateLimitsQueryErrorKind,
    pub message: String,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RateLimitsQueryErrorKind {
    NoCredentials,
    Unauthorized,
    Network,
    Unknown,
}

#[derive(Debug, Clone, Deserialize)]
struct ClaudeCredentialsFile {
    #[serde(rename = "claudeAiOauth")]
    claude_ai_oauth: Option<ClaudeOAuthCredentials>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeOAuthCredentials {
    access_token: String,
    refresh_token: Option<String>,
    expires_at: Option<i64>,
    #[serde(default)]
    scopes: Vec<String>,
}

impl ClaudeOAuthCredentials {
    fn is_expired(&self, now_ms: i64) -> bool {
        self.expires_at
            .is_some_and(|expires_at| expires_at <= now_ms)
    }

    fn has_required_scope(&self) -> bool {
        self.scopes.iter().any(|scope| scope == "user:profile")
    }
}

#[derive(Debug, Deserialize)]
struct RefreshResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
}

pub fn cache_ttl_seconds() -> i64 {
    CACHE_TTL_SECONDS
}

pub fn fetch_claude_rate_limits() -> Result<RateLimitSnapshot> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .context("Failed to build Claude usage client")?;
    let credentials = load_best_credentials()?;
    let credentials = if credentials.is_expired(now_ms()) {
        refresh_credentials(&client, credentials)?
    } else {
        credentials
    };
    if !credentials.has_required_scope() {
        return Err(anyhow!("Claude OAuth token missing user:profile scope"));
    }

    let response = client
        .get(CLAUDE_OAUTH_USAGE_URL)
        .bearer_auth(&credentials.access_token)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("anthropic-beta", CLAUDE_OAUTH_BETA)
        .header("User-Agent", CLAUDE_CODE_USER_AGENT)
        .send()
        .context("Claude usage request failed")?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        return Err(anyhow!(
            "Claude usage request failed with HTTP {status}: {body}"
        ));
    }

    let usage: Value = response
        .json()
        .context("Failed to decode Claude usage response")?;
    Ok(map_usage_response(usage))
}

pub fn query_result(
    snapshot: Option<RateLimitSnapshot>,
    status: RateLimitsQueryStatus,
    error: Option<RateLimitsQueryError>,
) -> RateLimitsQueryResult {
    RateLimitsQueryResult {
        snapshot,
        status,
        error,
        ttl_seconds: cache_ttl_seconds(),
    }
}

pub fn classify_error(error: &anyhow::Error) -> RateLimitsQueryError {
    let message = error.to_string();
    let lower = message.to_ascii_lowercase();
    let kind = if lower.contains("no claude code oauth credentials") {
        RateLimitsQueryErrorKind::NoCredentials
    } else if lower.contains("unauthorized")
        || lower.contains("http 401")
        || lower.contains("missing user:profile")
    {
        RateLimitsQueryErrorKind::Unauthorized
    } else if lower.contains("network") || lower.contains("request failed") {
        RateLimitsQueryErrorKind::Network
    } else {
        RateLimitsQueryErrorKind::Unknown
    };
    RateLimitsQueryError { kind, message }
}

fn map_usage_response(usage: Value) -> RateLimitSnapshot {
    let weekly_mins = 7 * 24 * 60;

    RateLimitSnapshot {
        provider: "claude".to_string(),
        updated_at: now_seconds(),
        primary: map_window(usage_window(&usage, "five_hour"), 5 * 60),
        secondary: map_window(usage_window(&usage, "seven_day"), weekly_mins),
        tertiary: map_window(
            usage_window(&usage, "seven_day_sonnet")
                .or_else(|| usage_window(&usage, "seven_day_opus")),
            weekly_mins,
        ),
        extra_windows: extra_windows(&usage, weekly_mins),
    }
}

fn usage_window<'a>(usage: &'a Value, snake_key: &str) -> Option<&'a Value> {
    if let Some(value) = usage.get(snake_key) {
        return Some(value);
    }
    let camel_key = snake_to_camel(snake_key);
    usage.get(camel_key.as_str())
}

fn map_window(raw: Option<&Value>, window_duration_mins: i64) -> Option<RateLimitWindow> {
    let raw = raw?;
    let used_percent = raw.get("utilization").and_then(value_as_f64)?;
    Some(RateLimitWindow {
        used_percent: used_percent.clamp(0.0, 100.0),
        window_duration_mins,
        resets_at: raw
            .get("resets_at")
            .or_else(|| raw.get("resetsAt"))
            .and_then(Value::as_str)
            .and_then(parse_iso_to_unix),
    })
}

fn extra_windows(usage: &Value, weekly_mins: i64) -> Vec<NamedRateLimitWindow> {
    let Some(obj) = usage.as_object() else {
        return Vec::new();
    };
    let mut windows = Vec::new();
    for (key, value) in obj {
        let Some(suffix) = extra_window_suffix(key) else {
            continue;
        };
        let Some(window) = map_window(Some(value), weekly_mins) else {
            continue;
        };
        windows.push(NamedRateLimitWindow {
            id: format!("claude-{}", suffix.replace('_', "-")),
            title: extra_window_title(suffix),
            window,
        });
    }
    windows.sort_by(|a, b| a.id.cmp(&b.id));
    windows
}

fn extra_window_suffix(key: &str) -> Option<&str> {
    let suffix = key.strip_prefix("seven_day_")?;
    match suffix {
        "opus" | "sonnet" => None,
        _ => Some(suffix),
    }
}

fn extra_window_title(suffix: &str) -> String {
    match suffix {
        "omelette" => "Designs".to_string(),
        "cowork" => "Daily Routines".to_string(),
        _ => suffix
            .split('_')
            .map(|word| {
                let mut chars = word.chars();
                match chars.next() {
                    Some(first) => first.to_uppercase().chain(chars).collect::<String>(),
                    None => String::new(),
                }
            })
            .collect::<Vec<_>>()
            .join(" "),
    }
}

fn value_as_f64(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_str()?.trim().parse::<f64>().ok())
}

fn snake_to_camel(key: &str) -> String {
    let mut out = String::new();
    let mut uppercase_next = false;
    for ch in key.chars() {
        if ch == '_' {
            uppercase_next = true;
        } else if uppercase_next {
            out.extend(ch.to_uppercase());
            uppercase_next = false;
        } else {
            out.push(ch);
        }
    }
    out
}

fn parse_iso_to_unix(raw: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|date| date.timestamp())
}

fn load_best_credentials() -> Result<ClaudeOAuthCredentials> {
    let mut credentials = load_keychain_credentials()?;
    let now = now_ms();
    sort_credentials(&mut credentials, now);
    credentials
        .into_iter()
        .rev()
        .find(|credential| !credential.access_token.trim().is_empty())
        .ok_or_else(|| anyhow!("No Claude Code OAuth credentials found in Keychain"))
}

fn sort_credentials(credentials: &mut [ClaudeOAuthCredentials], now: i64) {
    credentials.sort_by_key(|credential| {
        let scope_score = if credential.has_required_scope() {
            2
        } else {
            0
        };
        let valid_score = if credential.is_expired(now) { 0 } else { 1 };
        let expires_at = credential.expires_at.unwrap_or(0) / 1000;
        (scope_score, valid_score, expires_at)
    });
}

#[cfg(target_os = "macos")]
fn load_keychain_credentials() -> Result<Vec<ClaudeOAuthCredentials>> {
    let mut credentials = Vec::new();
    for account in keychain_account_candidates().into_iter().take(3) {
        let Ok(data) =
            security_framework::passwords::get_generic_password(CLAUDE_KEYCHAIN_SERVICE, &account)
        else {
            continue;
        };
        if let Some(credential) = parse_credentials(&data) {
            credentials.push(credential);
        }
    }
    Ok(credentials)
}

#[cfg(not(target_os = "macos"))]
fn load_keychain_credentials() -> Result<Vec<ClaudeOAuthCredentials>> {
    Ok(Vec::new())
}

fn keychain_account_candidates() -> Vec<String> {
    let mut accounts = Vec::new();
    for key in ["USER", "LOGNAME"] {
        if let Ok(value) = std::env::var(key) {
            push_unique_account(&mut accounts, value);
        }
    }
    for account in keychain_accounts_without_prompt() {
        push_unique_account(&mut accounts, account);
    }
    push_unique_account(&mut accounts, "Claude Code".to_string());
    accounts
}

#[cfg(target_os = "macos")]
fn keychain_accounts_without_prompt() -> Vec<String> {
    use core_foundation::base::{CFTypeRef, TCFType};
    use core_foundation::string::CFString;
    use security_framework::item::{ItemClass, ItemSearchOptions, Limit, SearchResult};
    use security_framework_sys::item::kSecAttrAccount;

    let results = match ItemSearchOptions::new()
        .class(ItemClass::generic_password())
        .service(CLAUDE_KEYCHAIN_SERVICE)
        .load_attributes(true)
        .skip_authenticated_items(true)
        .limit(Limit::All)
        .search()
    {
        Ok(results) => results,
        Err(error) => {
            tracing::debug!("Claude Keychain account probe failed: {error}");
            return Vec::new();
        }
    };

    let account_key = unsafe { kSecAttrAccount as CFTypeRef };
    results
        .into_iter()
        .filter_map(|result| {
            let SearchResult::Dict(attrs) = result else {
                return None;
            };
            let account = attrs.find(account_key)?;
            let account = unsafe { CFString::wrap_under_get_rule(*account as _) };
            let account = account.to_string();
            (!account.trim().is_empty()).then_some(account)
        })
        .collect()
}

#[cfg(not(target_os = "macos"))]
fn keychain_accounts_without_prompt() -> Vec<String> {
    Vec::new()
}

fn push_unique_account(accounts: &mut Vec<String>, account: String) {
    let trimmed = account.trim();
    if trimmed.is_empty() || accounts.iter().any(|existing| existing == trimmed) {
        return;
    }
    accounts.push(trimmed.to_string());
}

fn parse_credentials(data: &[u8]) -> Option<ClaudeOAuthCredentials> {
    serde_json::from_slice::<ClaudeCredentialsFile>(data)
        .ok()
        .and_then(|file| file.claude_ai_oauth)
        .or_else(|| serde_json::from_slice::<ClaudeOAuthCredentials>(data).ok())
}

fn refresh_credentials(
    client: &Client,
    credentials: ClaudeOAuthCredentials,
) -> Result<ClaudeOAuthCredentials> {
    let refresh_token = credentials
        .refresh_token
        .as_deref()
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .ok_or_else(|| anyhow!("Claude OAuth token expired and no refresh token is available"))?;

    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", CLAUDE_OAUTH_CLIENT_ID),
    ];
    let response = client
        .post(CLAUDE_OAUTH_REFRESH_URL)
        .header("Accept", "application/json")
        .form(&params)
        .send()
        .context("Claude OAuth refresh request failed")?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        return Err(anyhow!(
            "Claude OAuth refresh failed with HTTP {status}: {body}"
        ));
    }

    let refreshed: RefreshResponse = response
        .json()
        .context("Failed to decode Claude OAuth refresh response")?;
    Ok(ClaudeOAuthCredentials {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token.or(credentials.refresh_token),
        expires_at: refreshed
            .expires_in
            .map(|seconds| now_ms() + seconds.saturating_mul(1000)),
        scopes: credentials.scopes,
    })
}

fn now_seconds() -> i64 {
    Utc::now().timestamp()
}

fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_oauth_usage_windows() {
        let snapshot = map_usage_response(json!({
            "five_hour": {
                "utilization": 12.5,
                "resets_at": "2026-04-25T06:30:00.754916+00:00",
            },
            "seven_day": { "utilization": 14.0 },
            "seven_day_sonnet": { "utilization": 1.0 },
            "seven_day_omelette": { "utilization": 3.0 },
            "seven_day_cowork": { "utilization": "4.5" },
        }));

        assert_eq!(snapshot.provider, "claude");
        assert_eq!(snapshot.primary.unwrap().window_duration_mins, 300);
        assert_eq!(snapshot.secondary.unwrap().used_percent, 14.0);
        assert_eq!(snapshot.tertiary.unwrap().used_percent, 1.0);
        assert_eq!(snapshot.extra_windows.len(), 2);
    }

    #[test]
    fn falls_back_to_opus_for_tertiary_window() {
        let snapshot = map_usage_response(json!({
            "seven_day_opus": { "utilization": 9.0 },
        }));

        assert_eq!(snapshot.tertiary.unwrap().used_percent, 9.0);
    }

    #[test]
    fn scans_unknown_extra_weekly_windows() {
        let snapshot = map_usage_response(json!({
            "seven_day": { "utilization": 2.0 },
            "seven_day_new_window": { "utilization": 33.0 },
            "seven_day_bad": { "utilization": null },
        }));

        assert_eq!(snapshot.extra_windows.len(), 1);
        assert_eq!(snapshot.extra_windows[0].id, "claude-new-window");
        assert_eq!(snapshot.extra_windows[0].title, "New Window");
        assert_eq!(snapshot.extra_windows[0].window.used_percent, 33.0);
    }

    #[test]
    fn snapshot_freshness_uses_cache_ttl() {
        let snapshot = RateLimitSnapshot {
            provider: "claude".to_string(),
            updated_at: 100,
            primary: None,
            secondary: None,
            tertiary: None,
            extra_windows: Vec::new(),
        };

        assert!(snapshot.is_fresh(100 + CACHE_TTL_SECONDS - 1));
        assert!(!snapshot.is_fresh(100 + CACHE_TTL_SECONDS));
    }

    #[test]
    fn parses_nested_claude_code_credentials() {
        let data = br#"{"claudeAiOauth":{"accessToken":"a","refreshToken":"r","expiresAt":1777109771360,"scopes":["user:profile"],"rateLimitTier":"default"}}"#;
        let credentials = parse_credentials(data).unwrap();
        assert_eq!(credentials.access_token, "a");
        assert!(credentials.has_required_scope());
    }

    #[test]
    fn parses_flat_claude_code_credentials() {
        let data =
            br#"{"accessToken":"a","refreshToken":"r","expiresAt":1777109771360,"scopes":["user:profile"]}"#;
        let credentials = parse_credentials(data).unwrap();
        assert_eq!(credentials.access_token, "a");
        assert_eq!(credentials.refresh_token.as_deref(), Some("r"));
    }

    #[test]
    fn returns_none_for_invalid_credentials_bytes() {
        assert!(parse_credentials(b"not json").is_none());
    }

    #[test]
    fn credential_sort_prioritizes_required_scope() {
        let now = 1_000_000;
        let mut credentials = vec![
            ClaudeOAuthCredentials {
                access_token: "valid-no-scope".to_string(),
                refresh_token: None,
                expires_at: Some(now + 10_000),
                scopes: Vec::new(),
            },
            ClaudeOAuthCredentials {
                access_token: "expired-with-scope".to_string(),
                refresh_token: Some("refresh".to_string()),
                expires_at: Some(now - 1),
                scopes: vec!["user:profile".to_string()],
            },
        ];

        sort_credentials(&mut credentials, now);
        assert_eq!(
            credentials
                .last()
                .map(|credential| credential.access_token.as_str()),
            Some("expired-with-scope")
        );
    }
}
