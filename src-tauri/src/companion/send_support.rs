use anyhow::{Context, Result};

use crate::{
    models::{settings, workspaces as workspace_models},
    workspace::helpers as workspace_helpers,
};

pub(super) struct SessionSendDefaults {
    pub workspace_id: String,
    pub model_id: Option<String>,
    pub provider: Option<String>,
    pub permission_mode: Option<String>,
    pub effort_level: Option<String>,
    pub fast_mode: Option<bool>,
}

pub(super) fn session_send_defaults(session_id: &str) -> Result<SessionSendDefaults> {
    let conn = crate::models::db::read_conn()?;
    conn.query_row(
        r#"
        SELECT workspace_id, model, agent_type, permission_mode, effort_level, fast_mode
        FROM sessions
        WHERE id = ?1
        "#,
        [session_id],
        |row| {
            Ok(SessionSendDefaults {
                workspace_id: row.get(0)?,
                model_id: row
                    .get::<_, Option<String>>(1)?
                    .filter(|value| !value.is_empty()),
                provider: row
                    .get::<_, Option<String>>(2)?
                    .filter(|value| !value.is_empty()),
                permission_mode: row
                    .get::<_, Option<String>>(3)?
                    .filter(|value| !value.is_empty()),
                effort_level: row
                    .get::<_, Option<String>>(4)?
                    .filter(|value| !value.is_empty()),
                fast_mode: Some(row.get::<_, i64>(5)? != 0),
            })
        },
    )
    .with_context(|| format!("Session not found: {session_id}"))
}

pub(super) fn workspace_working_directory(workspace_id: &str) -> Result<String> {
    let record = workspace_models::load_workspace_record_by_id(workspace_id)?
        .with_context(|| format!("Workspace not found: {workspace_id}"))?;
    Ok(workspace_helpers::workspace_path(&record)?
        .display()
        .to_string())
}

pub(super) fn load_default_model_id() -> Option<String> {
    settings::load_setting_value("app.default_model_id")
        .ok()
        .flatten()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}
