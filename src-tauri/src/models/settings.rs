use anyhow::{Context, Result};
use serde::{de::DeserializeOwned, Serialize};

use super::db;

#[derive(Debug, Clone)]
pub struct BranchPrefixSettings {
    pub branch_prefix_type: Option<String>,
    pub branch_prefix_custom: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomProviderSettings {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    #[serde(default)]
    pub opus_model: String,
    #[serde(default)]
    pub sonnet_model: String,
    #[serde(default)]
    pub haiku_model: String,
    #[serde(default, rename = "models")]
    pub legacy_models: Vec<String>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool {
    true
}

pub fn load_setting_value(key: &str) -> Result<Option<String>> {
    let connection = db::read_conn()?;
    let mut statement = connection
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .with_context(|| format!("Failed to prepare settings lookup for {key}"))?;
    let mut rows = statement
        .query_map([key], |row| row.get::<_, String>(0))
        .with_context(|| format!("Failed to query settings value for {key}"))?;

    match rows.next() {
        Some(result) => result
            .map(Some)
            .with_context(|| format!("Failed to deserialize settings value for {key}")),
        None => Ok(None),
    }
}

pub fn upsert_setting_value(key: &str, value: &str) -> Result<()> {
    let connection = db::write_conn()?;
    connection
        .execute(
            r#"
            INSERT INTO settings (key, value, created_at, updated_at)
            VALUES (?1, ?2, datetime('now'), datetime('now'))
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_at = datetime('now')
            "#,
            (key, value),
        )
        .with_context(|| format!("Failed to store setting {key}"))?;

    Ok(())
}

pub fn delete_setting_value(key: &str) -> Result<()> {
    let connection = db::write_conn()?;
    connection
        .execute("DELETE FROM settings WHERE key = ?1", [key])
        .with_context(|| format!("Failed to delete setting {key}"))?;

    Ok(())
}

pub fn load_setting_json<T: DeserializeOwned>(key: &str) -> Result<Option<T>> {
    let Some(value) = load_setting_value(key)? else {
        return Ok(None);
    };

    let parsed = serde_json::from_str::<T>(&value)
        .with_context(|| format!("Failed to deserialize JSON setting {key}"))?;

    Ok(Some(parsed))
}

pub fn upsert_setting_json<T: Serialize>(key: &str, value: &T) -> Result<()> {
    let serialized = serde_json::to_string(value)
        .with_context(|| format!("Failed to serialize JSON setting {key}"))?;
    upsert_setting_value(key, &serialized)
}

const AUTO_CLOSE_ACTION_KINDS_KEY: &str = "auto_close_action_kinds";
const AUTO_CLOSE_OPT_IN_ASKED_KEY: &str = "auto_close_opt_in_asked";

/// Account-global rate-limit snapshots: the raw upstream response body
/// is stored verbatim (no shape mapping) by the corresponding
/// `get_*_rate_limits` Tauri command after a live OAuth fetch, and read
/// back by the same command as the cache-fallback when a fresh fetch
/// fails. The frontend's `parse{Codex,Claude}RateLimits` does the
/// shape work, so a schema change at the provider only needs a parser
/// tweak — not a DB migration.
pub const CODEX_RATE_LIMITS_KEY: &str = "app.codex_rate_limits";
pub const CLAUDE_RATE_LIMITS_KEY: &str = "app.claude_rate_limits";
pub const CUSTOM_PROVIDERS_KEY: &str = "app.custom_providers";

/// Action kinds the user has opted-in to auto-close. Action sessions whose
/// `action_kind` appears in this list are hidden automatically after their
/// verifier reports `Success`.
pub fn load_auto_close_action_kinds() -> Result<Vec<crate::agents::ActionKind>> {
    load_setting_json::<Vec<crate::agents::ActionKind>>(AUTO_CLOSE_ACTION_KINDS_KEY)
        .map(|opt| opt.unwrap_or_default())
}

pub fn save_auto_close_action_kinds(kinds: &[crate::agents::ActionKind]) -> Result<()> {
    upsert_setting_json(AUTO_CLOSE_ACTION_KINDS_KEY, &kinds)
}

/// Action kinds for which we've already shown the first-time opt-in prompt.
/// Separate from the opt-in list so "dismissed" and "enabled" are distinct
/// states — a dismissed kind stays in this list so we don't nag.
pub fn load_auto_close_opt_in_asked() -> Result<Vec<crate::agents::ActionKind>> {
    load_setting_json::<Vec<crate::agents::ActionKind>>(AUTO_CLOSE_OPT_IN_ASKED_KEY)
        .map(|opt| opt.unwrap_or_default())
}

pub fn save_auto_close_opt_in_asked(kinds: &[crate::agents::ActionKind]) -> Result<()> {
    upsert_setting_json(AUTO_CLOSE_OPT_IN_ASKED_KEY, &kinds)
}

pub fn load_custom_providers() -> Result<Vec<CustomProviderSettings>> {
    let providers = load_setting_json::<Vec<CustomProviderSettings>>(CUSTOM_PROVIDERS_KEY)?
        .unwrap_or_default()
        .into_iter()
        .filter(|provider| {
            provider.enabled
                && !provider.id.trim().is_empty()
                && !provider.name.trim().is_empty()
                && !provider.base_url.trim().is_empty()
                && !provider.api_key.trim().is_empty()
        })
        .map(|mut provider| {
            provider.id = provider.id.trim().to_string();
            provider.name = provider.name.trim().to_string();
            provider.base_url = provider.base_url.trim().trim_end_matches('/').to_string();
            provider.api_key = provider.api_key.trim().to_string();
            provider.legacy_models = provider
                .legacy_models
                .into_iter()
                .map(|model| model.trim().to_string())
                .filter(|model| !model.is_empty())
                .collect();
            provider.opus_model = trim_or_legacy(&provider.opus_model, &provider.legacy_models, 0);
            provider.sonnet_model =
                trim_or_legacy(&provider.sonnet_model, &provider.legacy_models, 1);
            provider.haiku_model =
                trim_or_legacy(&provider.haiku_model, &provider.legacy_models, 2);
            provider
        })
        .filter(|provider| {
            !provider.opus_model.is_empty()
                || !provider.sonnet_model.is_empty()
                || !provider.haiku_model.is_empty()
        })
        .collect();
    Ok(providers)
}

fn trim_or_legacy(value: &str, legacy_models: &[String], index: usize) -> String {
    let trimmed = value.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }
    match legacy_models.get(index) {
        Some(model) => model.to_string(),
        None => String::new(),
    }
}

pub fn load_custom_provider(provider_id: &str) -> Result<Option<CustomProviderSettings>> {
    Ok(load_custom_providers()?
        .into_iter()
        .find(|provider| provider.id == provider_id))
}

pub fn load_branch_prefix_settings() -> Result<BranchPrefixSettings> {
    let connection = db::read_conn()?;
    let mut statement = connection
        .prepare(
            "SELECT key, value FROM settings WHERE key IN ('branch_prefix_type', 'branch_prefix_custom')",
        )
        .context("Failed to prepare branch settings query")?;

    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .context("Failed to query branch settings")?;

    let mut settings = BranchPrefixSettings {
        branch_prefix_type: None,
        branch_prefix_custom: None,
    };

    for row in rows {
        let (key, value) = row.context("Failed to read branch settings row")?;
        match key.as_str() {
            "branch_prefix_type" => settings.branch_prefix_type = Some(value),
            "branch_prefix_custom" => settings.branch_prefix_custom = Some(value),
            _ => {}
        }
    }

    Ok(settings)
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    fn test_db() -> (Connection, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let conn = Connection::open(&db_path).unwrap();
        crate::schema::ensure_schema(&conn).unwrap();
        (conn, dir)
    }

    #[test]
    fn settings_crud() {
        let (conn, _dir) = test_db();

        // Missing key returns no rows
        let mut stmt = conn
            .prepare("SELECT value FROM settings WHERE key = ?1")
            .unwrap();
        let result: Option<String> = stmt
            .query_map(["nonexistent"], |row| row.get(0))
            .unwrap()
            .filter_map(Result::ok)
            .next();
        assert!(result.is_none());

        // Insert
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('test_key', 'test_value')",
            [],
        )
        .unwrap();
        let value: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'test_key'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(value, "test_value");
    }

    #[test]
    fn settings_upsert_overwrites() {
        let (conn, _dir) = test_db();
        conn.execute("INSERT INTO settings (key, value) VALUES ('k', 'v1')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('k', 'v2') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [],
        ).unwrap();
        let value: String = conn
            .query_row("SELECT value FROM settings WHERE key = 'k'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(value, "v2");
    }

    #[test]
    fn custom_provider_legacy_models_do_not_backfill_missing_aliases() {
        assert_eq!(
            super::trim_or_legacy("", &["xiaomi/mimo-v2.5".into()], 0),
            "xiaomi/mimo-v2.5"
        );
        assert_eq!(
            super::trim_or_legacy("", &["xiaomi/mimo-v2.5".into()], 1),
            ""
        );
        assert_eq!(
            super::trim_or_legacy("", &["xiaomi/mimo-v2.5".into()], 2),
            ""
        );
    }

    #[test]
    fn branch_prefix_settings_query() {
        let (conn, _dir) = test_db();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('branch_prefix_type', 'custom')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('branch_prefix_custom', 'feat/')",
            [],
        )
        .unwrap();

        let mut stmt = conn.prepare(
            "SELECT key, value FROM settings WHERE key IN ('branch_prefix_type', 'branch_prefix_custom')"
        ).unwrap();
        let rows: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .filter_map(Result::ok)
            .collect();

        assert_eq!(rows.len(), 2);
        assert!(rows
            .iter()
            .any(|(k, v)| k == "branch_prefix_type" && v == "custom"));
        assert!(rows
            .iter()
            .any(|(k, v)| k == "branch_prefix_custom" && v == "feat/"));
    }

    #[test]
    fn app_settings_roundtrip() {
        let (conn, _dir) = test_db();

        // Insert app settings
        conn.execute(
            "INSERT INTO settings (key, value, created_at, updated_at) VALUES ('app.font_size', '16', datetime('now'), datetime('now'))",
            [],
        ).unwrap();

        // Read back
        let mut stmt = conn
            .prepare("SELECT key, value FROM settings WHERE key LIKE 'app.%'")
            .unwrap();
        let rows: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .filter_map(Result::ok)
            .collect();

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].0, "app.font_size");
        assert_eq!(rows[0].1, "16");
    }

    #[test]
    fn app_settings_upsert() {
        let (conn, _dir) = test_db();

        // Insert then update
        conn.execute(
            "INSERT INTO settings (key, value, created_at, updated_at) VALUES ('app.font_size', '14', datetime('now'), datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO settings (key, value, created_at, updated_at) VALUES ('app.font_size', '18', datetime('now'), datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [],
        ).unwrap();

        let value: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'app.font_size'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(value, "18");
    }
}
