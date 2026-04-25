use anyhow::Context;

use tauri::AppHandle;

use crate::{agents::ActionKind, db, settings};

use super::common::{run_blocking, CmdResult};

#[tauri::command]
pub async fn get_app_settings() -> CmdResult<std::collections::HashMap<String, String>> {
    run_blocking(|| {
        let conn = db::read_conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT key, value FROM settings WHERE key LIKE 'app.%' OR key LIKE 'branch_prefix_%'",
            )
            .context("Failed to query app settings")?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .context("Failed to iterate app settings")?;

        let mut map = std::collections::HashMap::new();
        for row in rows.flatten() {
            map.insert(row.0, row.1);
        }
        Ok(map)
    })
    .await
}

#[tauri::command]
pub async fn update_app_settings(
    settings_map: std::collections::HashMap<String, String>,
) -> CmdResult<()> {
    run_blocking(move || {
        for (key, value) in &settings_map {
            if !key.starts_with("app.") && !key.starts_with("branch_prefix_") {
                continue;
            }
            settings::upsert_setting_value(key, value)?;
        }
        Ok(())
    })
    .await
}

/// Read the account-global Codex rate-limit snapshot. Stored under
/// `settings::CODEX_RATE_LIMITS_KEY` by `agents/streaming.rs` whenever
/// Codex emits an `account/rateLimits/updated` notification. Returns
/// `Ok(None)` when no turn has run yet (fresh DB).
#[tauri::command]
pub async fn get_codex_rate_limits() -> CmdResult<Option<String>> {
    run_blocking(|| settings::load_setting_value(settings::CODEX_RATE_LIMITS_KEY)).await
}

#[tauri::command]
pub async fn get_claude_rate_limits(
    app: AppHandle,
) -> CmdResult<crate::claude_rate_limits::RateLimitsQueryResult> {
    run_blocking(move || {
        let cached = settings::load_setting_value(settings::CLAUDE_RATE_LIMITS_KEY)?;
        let now = chrono::Utc::now().timestamp();
        let cached_snapshot = cached.as_deref().and_then(|raw| {
            serde_json::from_str::<crate::claude_rate_limits::RateLimitSnapshot>(raw).ok()
        });
        if let Some(raw) = cached.as_deref() {
            if let Ok(snapshot) =
                serde_json::from_str::<crate::claude_rate_limits::RateLimitSnapshot>(raw)
            {
                if snapshot.is_fresh(now) {
                    return Ok(crate::claude_rate_limits::query_result(
                        Some(snapshot),
                        crate::claude_rate_limits::RateLimitsQueryStatus::CacheHit,
                        None,
                    ));
                }
            }
        }

        match crate::claude_rate_limits::fetch_claude_rate_limits() {
            Ok(snapshot) => {
                let raw = serde_json::to_string(&snapshot)?;
                settings::upsert_setting_value(settings::CLAUDE_RATE_LIMITS_KEY, &raw)?;
                crate::ui_sync::publish(
                    &app,
                    crate::ui_sync::UiMutationEvent::ClaudeRateLimitsChanged,
                );
                Ok(crate::claude_rate_limits::query_result(
                    Some(snapshot),
                    crate::claude_rate_limits::RateLimitsQueryStatus::Fresh,
                    None,
                ))
            }
            Err(error) => {
                tracing::warn!("Failed to refresh Claude rate limits: {error}");
                let status = if cached_snapshot.is_some() {
                    crate::claude_rate_limits::RateLimitsQueryStatus::StaleFallback
                } else {
                    crate::claude_rate_limits::RateLimitsQueryStatus::Error
                };
                Ok(crate::claude_rate_limits::query_result(
                    cached_snapshot,
                    status,
                    Some(crate::claude_rate_limits::classify_error(&error)),
                ))
            }
        }
    })
    .await
}

#[tauri::command]
pub async fn load_auto_close_action_kinds() -> CmdResult<Vec<ActionKind>> {
    run_blocking(settings::load_auto_close_action_kinds).await
}

#[tauri::command]
pub async fn save_auto_close_action_kinds(kinds: Vec<ActionKind>) -> CmdResult<()> {
    run_blocking(move || settings::save_auto_close_action_kinds(&kinds)).await
}

#[tauri::command]
pub async fn load_auto_close_opt_in_asked() -> CmdResult<Vec<ActionKind>> {
    run_blocking(settings::load_auto_close_opt_in_asked).await
}

#[tauri::command]
pub async fn save_auto_close_opt_in_asked(kinds: Vec<ActionKind>) -> CmdResult<()> {
    run_blocking(move || settings::save_auto_close_opt_in_asked(&kinds)).await
}
