use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    helpers,
    mobile_access::{self, AuthPrincipal},
    models::sessions,
    pipeline,
    workspace_state::{WorkspaceBranchIntent, WorkspaceMode},
    workspace_status::WorkspaceStatus,
    workspaces,
};

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcRequest {
    #[serde(default = "default_jsonrpc")]
    pub jsonrpc: String,
    #[serde(default)]
    pub id: Option<Value>,
    pub method: String,
    #[serde(default)]
    pub params: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcResponse {
    pub jsonrpc: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcError {
    pub code: i32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeResult {
    pub protocol_version: u32,
    pub desktop_id: String,
    pub desktop_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub protocol_version: u32,
    pub desktop_id: String,
    pub synced_at: String,
    pub groups: Vec<MobileWorkspaceGroup>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileWorkspaceGroup {
    pub id: String,
    pub label: String,
    pub tone: String,
    pub rows: Vec<MobileWorkspaceRow>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileWorkspaceRow {
    pub id: String,
    pub title: String,
    pub directory_name: String,
    pub repo_id: String,
    pub repo_name: String,
    pub repo_initials: String,
    pub state: crate::workspace_state::WorkspaceState,
    pub mode: WorkspaceMode,
    pub status: WorkspaceStatus,
    pub branch: Option<String>,
    pub active_session_id: Option<String>,
    pub active_session_title: Option<String>,
    pub active_session_agent_type: Option<String>,
    pub active_session_status: Option<String>,
    pub primary_session_id: Option<String>,
    pub primary_session_title: Option<String>,
    pub primary_session_agent_type: Option<String>,
    pub pinned_at: Option<String>,
    pub session_count: i64,
    pub message_count: i64,
    pub workspace_unread: i64,
    pub unread_session_count: i64,
    pub has_unread: bool,
    pub updated_at: String,
    pub summary: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacklogCreateParams {
    pub prompt: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub repo_id: Option<String>,
    #[serde(default)]
    pub source_branch: Option<String>,
    #[serde(default)]
    pub mode: Option<WorkspaceMode>,
    #[serde(default)]
    pub branch_intent: Option<WorkspaceBranchIntent>,
    #[serde(default)]
    pub model_id: Option<String>,
    #[serde(default)]
    pub effort_level: Option<String>,
    #[serde(default)]
    pub permission_mode: Option<String>,
    #[serde(default)]
    pub fast_mode: Option<bool>,
    #[serde(default)]
    pub linked_directories: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionListParams {
    pub workspace_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionThreadPageParams {
    pub session_id: String,
    #[serde(default)]
    pub tail_limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionThreadMessagesPage {
    pub messages: Vec<pipeline::types::ThreadMessageLike>,
    pub has_more: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionReadParams {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BacklogCreateResult {
    pub workspace_id: String,
    pub session_id: String,
    pub status: WorkspaceStatus,
}

fn default_jsonrpc() -> String {
    "2.0".to_string()
}

pub fn handle_rpc_json(input: &str, principal: AuthPrincipal) -> String {
    let request_id = serde_json::from_str::<RpcRequest>(input)
        .ok()
        .and_then(|request| request.id);
    let response = match serde_json::from_str::<RpcRequest>(input) {
        Ok(request) => handle_rpc_request(request, principal),
        Err(error) => RpcResponse::error(request_id, -32700, format!("Invalid JSON: {error}")),
    };

    serde_json::to_string(&response).unwrap_or_else(|error| {
        format!(
            r#"{{"jsonrpc":"2.0","error":{{"code":-32603,"message":"Failed to serialize response: {error}"}}}}"#
        )
    })
}

pub fn handle_rpc_request(request: RpcRequest, principal: AuthPrincipal) -> RpcResponse {
    let id = request.id.clone();
    tracing::info!(method = %request.method, "Mobile RPC request");
    if request.jsonrpc != "2.0" {
        return RpcResponse::error(id, -32600, "jsonrpc must be \"2.0\"");
    }
    if matches!(&principal, AuthPrincipal::Pairing { .. })
        && !matches!(request.method.as_str(), "initialize" | "pair.complete")
    {
        return RpcResponse::error(id, -32001, "Pairing credentials can only complete pairing");
    }

    let result = match request.method.as_str() {
        "initialize" => initialize(),
        "workspace.snapshot" => workspace_snapshot().map(to_value),
        "session.list" => parse_params::<SessionListParams>(request.params)
            .and_then(|params| sessions::list_workspace_sessions(&params.workspace_id))
            .map(to_value),
        "session.thread.page" => parse_params::<SessionThreadPageParams>(request.params)
            .and_then(session_thread_page)
            .map(to_value),
        "session.markRead" => parse_params::<SessionReadParams>(request.params)
            .and_then(|params| sessions::mark_session_read(&params.session_id))
            .map(to_value),
        "backlog.create" => parse_params::<BacklogCreateParams>(request.params)
            .and_then(create_backlog_task)
            .map(to_value),
        "pair.complete" => mobile_access::complete_pairing(principal).map(to_value),
        other => Err(anyhow::anyhow!("Unknown RPC method: {other}")),
    };

    match result {
        Ok(result) => RpcResponse {
            jsonrpc: "2.0",
            id,
            result: Some(result),
            error: None,
        },
        Err(error) => RpcResponse::error(id, -32603, format!("{error:#}")),
    }
}

pub fn initialize_result() -> Result<InitializeResult> {
    let identity = mobile_access::desktop_identity()?;
    Ok(InitializeResult {
        protocol_version: PROTOCOL_VERSION,
        desktop_id: identity.desktop_id,
        desktop_name: identity.desktop_name,
    })
}

fn initialize() -> Result<Value> {
    initialize_result().map(to_value)
}

pub fn workspace_snapshot_result() -> Result<WorkspaceSnapshot> {
    let identity = mobile_access::desktop_identity()?;
    let mut groups = workspaces::list_workspace_groups()?
        .into_iter()
        .map(map_workspace_group)
        .collect::<Vec<_>>();
    groups.push(MobileWorkspaceGroup {
        id: "archived".to_string(),
        label: "Archived".to_string(),
        tone: "archived".to_string(),
        rows: workspaces::list_archived_workspaces()?
            .into_iter()
            .map(map_archived_workspace_row)
            .collect(),
    });
    Ok(WorkspaceSnapshot {
        protocol_version: PROTOCOL_VERSION,
        desktop_id: identity.desktop_id,
        synced_at: crate::models::db::current_timestamp()?,
        groups,
    })
}

fn workspace_snapshot() -> Result<WorkspaceSnapshot> {
    workspace_snapshot_result()
}

pub fn session_thread_page_result(
    params: SessionThreadPageParams,
) -> Result<SessionThreadMessagesPage> {
    let windowed =
        sessions::list_session_historical_records_windowed(&params.session_id, params.tail_limit)?;
    let messages = pipeline::MessagePipeline::convert_historical(&windowed.records);
    Ok(SessionThreadMessagesPage {
        messages,
        has_more: windowed.has_more,
    })
}

fn session_thread_page(params: SessionThreadPageParams) -> Result<SessionThreadMessagesPage> {
    session_thread_page_result(params)
}

pub fn create_backlog_task_result(params: BacklogCreateParams) -> Result<BacklogCreateResult> {
    let prompt = params.prompt.trim();
    if prompt.is_empty() {
        bail!("Prompt is required");
    }

    let mode = params.mode.unwrap_or_else(|| {
        if params.repo_id.is_some() {
            WorkspaceMode::Worktree
        } else {
            WorkspaceMode::Chat
        }
    });

    let prepared = match mode {
        WorkspaceMode::Chat => {
            workspaces::prepare_chat_workspace_impl(WorkspaceStatus::Backlog, None)?
        }
        WorkspaceMode::Worktree => {
            let repo_id = params
                .repo_id
                .as_deref()
                .context("repoId is required for worktree mode")?;
            workspaces::prepare_workspace_from_repo_impl(
                repo_id,
                params.source_branch.as_deref(),
                params.branch_intent.unwrap_or_default(),
                WorkspaceStatus::Backlog,
                None,
            )?
        }
        WorkspaceMode::Local => {
            let repo_id = params
                .repo_id
                .as_deref()
                .context("repoId is required for local mode")?;
            workspaces::prepare_local_workspace_impl(
                repo_id,
                params.source_branch.as_deref(),
                WorkspaceStatus::Backlog,
                None,
            )?
        }
    };

    if mode != WorkspaceMode::Chat {
        workspaces::finalize_workspace_from_repo_impl(&prepared.workspace_id)?;
    }

    if !params.linked_directories.is_empty() {
        workspaces::set_workspace_linked_directories(
            &prepared.workspace_id,
            params.linked_directories.clone(),
        )?;
    }

    sessions::set_session_draft(
        &prepared.initial_session_id,
        Some(&plain_text_draft(prompt)),
    )?;
    if let Some(title) = params
        .title
        .as_deref()
        .map(str::trim)
        .filter(|title| !title.is_empty())
    {
        sessions::rename_session(&prepared.initial_session_id, title)?;
    }
    persist_session_config(&prepared.initial_session_id, &params)?;

    notify_workspace_changed();

    Ok(BacklogCreateResult {
        workspace_id: prepared.workspace_id,
        session_id: prepared.initial_session_id,
        status: WorkspaceStatus::Backlog,
    })
}

fn create_backlog_task(params: BacklogCreateParams) -> Result<BacklogCreateResult> {
    create_backlog_task_result(params)
}

fn persist_session_config(session_id: &str, params: &BacklogCreateParams) -> Result<()> {
    if params.model_id.is_none()
        && params.effort_level.is_none()
        && params.permission_mode.is_none()
        && params.fast_mode.is_none()
    {
        return Ok(());
    }

    let timestamp = crate::models::db::current_timestamp()?;
    let conn = crate::models::db::write_conn()?;
    conn.execute(
        r#"
        UPDATE sessions
        SET model = COALESCE(?2, model),
            effort_level = COALESCE(?3, effort_level),
            permission_mode = COALESCE(?4, permission_mode),
            fast_mode = COALESCE(?5, fast_mode),
            updated_at = ?6
        WHERE id = ?1
        "#,
        rusqlite::params![
            session_id,
            params.model_id.as_deref(),
            params.effort_level.as_deref(),
            params.permission_mode.as_deref(),
            params
                .fast_mode
                .map(|value| if value { 1_i64 } else { 0_i64 }),
            timestamp,
        ],
    )
    .with_context(|| format!("Failed to persist session config for {session_id}"))?;
    Ok(())
}

fn notify_workspace_changed() {
    let _ =
        crate::ui_sync::notify_running_app(crate::ui_sync::UiMutationEvent::WorkspaceListChanged);
}

fn parse_params<T: for<'de> Deserialize<'de>>(params: Option<Value>) -> Result<T> {
    serde_json::from_value(params.unwrap_or(Value::Object(Default::default())))
        .context("Invalid RPC params")
}

fn map_workspace_group(group: workspaces::WorkspaceSidebarGroup) -> MobileWorkspaceGroup {
    MobileWorkspaceGroup {
        id: group.id,
        label: group.label,
        tone: group.tone,
        rows: group.rows.into_iter().map(map_workspace_row).collect(),
    }
}

fn map_workspace_row(row: workspaces::WorkspaceSidebarRow) -> MobileWorkspaceRow {
    let title = mobile_workspace_title(&row);
    let summary = if row.mode == WorkspaceMode::Chat {
        "Chat workspace".to_string()
    } else if let Some(branch) = row.branch.as_deref() {
        format!("{} / {branch}", row.repo_name)
    } else {
        row.repo_name.clone()
    };

    MobileWorkspaceRow {
        id: row.id,
        title,
        directory_name: row.directory_name,
        repo_id: row.repo_id,
        repo_name: row.repo_name,
        repo_initials: row.repo_initials,
        state: row.state,
        mode: row.mode,
        status: row.status,
        branch: row.branch,
        active_session_id: row.active_session_id,
        active_session_title: row.active_session_title,
        active_session_agent_type: row.active_session_agent_type,
        active_session_status: row.active_session_status,
        primary_session_id: row.primary_session_id,
        primary_session_title: row.primary_session_title,
        primary_session_agent_type: row.primary_session_agent_type,
        pinned_at: row.pinned_at,
        session_count: row.session_count,
        message_count: row.message_count,
        workspace_unread: row.workspace_unread,
        unread_session_count: row.unread_session_count,
        has_unread: row.has_unread,
        updated_at: row.updated_at,
        summary,
    }
}

fn map_archived_workspace_row(summary: workspaces::WorkspaceSummary) -> MobileWorkspaceRow {
    let title = summary.title.clone();
    let summary_text = if summary.mode == WorkspaceMode::Chat {
        "Archived chat workspace".to_string()
    } else if let Some(branch) = summary.branch.as_deref() {
        format!("{} / {branch}", summary.repo_name)
    } else {
        summary.repo_name.clone()
    };

    MobileWorkspaceRow {
        id: summary.id,
        title,
        directory_name: summary.directory_name,
        repo_id: summary.repo_id,
        repo_name: summary.repo_name,
        repo_initials: summary.repo_initials,
        state: summary.state,
        mode: summary.mode,
        status: summary.status,
        branch: summary.branch,
        active_session_id: summary.active_session_id,
        active_session_title: summary.active_session_title,
        active_session_agent_type: summary.active_session_agent_type,
        active_session_status: summary.active_session_status,
        primary_session_id: summary.primary_session_id,
        primary_session_title: summary.primary_session_title,
        primary_session_agent_type: summary.primary_session_agent_type,
        pinned_at: summary.pinned_at,
        session_count: summary.session_count,
        message_count: summary.message_count,
        workspace_unread: summary.workspace_unread,
        unread_session_count: summary.unread_session_count,
        has_unread: summary.has_unread,
        updated_at: summary.updated_at,
        summary: summary_text,
    }
}
fn mobile_workspace_title(row: &workspaces::WorkspaceSidebarRow) -> String {
    match row.mode {
        WorkspaceMode::Local | WorkspaceMode::Chat => row.title.clone(),
        WorkspaceMode::Worktree => row
            .branch
            .as_deref()
            .map(humanize_branch_label)
            .filter(|title| !title.trim().is_empty())
            .unwrap_or_else(|| row.title.clone()),
    }
}

fn humanize_branch_label(branch: &str) -> String {
    let slug = branch
        .split_once('/')
        .map(|(_, suffix)| suffix)
        .unwrap_or(branch);
    helpers::humanize_directory_name(slug)
}

fn plain_text_draft(text: &str) -> String {
    serde_json::json!({
        "root": {
            "type": "root",
            "version": 1,
            "format": "",
            "indent": 0,
            "direction": null,
            "children": [{
                "type": "paragraph",
                "version": 1,
                "format": "",
                "indent": 0,
                "direction": null,
                "textFormat": 0,
                "textStyle": "",
                "children": [{
                    "type": "text",
                    "version": 1,
                    "text": text,
                    "format": 0,
                    "mode": "normal",
                    "style": "",
                    "detail": 0
                }]
            }]
        }
    })
    .to_string()
}

fn to_value<T: Serialize>(value: T) -> Value {
    serde_json::to_value(value).unwrap_or(Value::Null)
}

impl RpcResponse {
    fn error(id: Option<Value>, code: i32, message: impl Into<String>) -> Self {
        Self {
            jsonrpc: "2.0",
            id,
            result: None,
            error: Some(RpcError {
                code,
                message: message.into(),
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sidebar_row(
        title: &str,
        directory_name: &str,
        mode: WorkspaceMode,
    ) -> workspaces::WorkspaceSidebarRow {
        workspaces::WorkspaceSidebarRow {
            id: "workspace-1".to_string(),
            title: title.to_string(),
            avatar: "HM".to_string(),
            directory_name: directory_name.to_string(),
            repo_id: "repo-1".to_string(),
            repo_name: "helmor".to_string(),
            repo_icon_src: None,
            repo_initials: "HM".to_string(),
            state: crate::workspace_state::WorkspaceState::Ready,
            mode,
            has_unread: false,
            workspace_unread: 0,
            unread_session_count: 0,
            status: WorkspaceStatus::InProgress,
            branch: Some("github-copilot-plan".to_string()),
            active_session_id: Some("session-1".to_string()),
            active_session_title: Some("Active session".to_string()),
            active_session_agent_type: Some("codex".to_string()),
            active_session_status: Some("idle".to_string()),
            primary_session_id: Some("session-1".to_string()),
            primary_session_title: Some("Primary session".to_string()),
            primary_session_agent_type: Some("codex".to_string()),
            pr_title: None,
            pr_sync_state: crate::workspace_pr_sync::PrSyncState::None,
            pr_url: None,
            pinned_at: None,
            display_order: 0,
            repo_sidebar_order: 0,
            session_count: 1,
            message_count: 2,
            created_at: "2026-05-25T00:00:00Z".to_string(),
            updated_at: "2026-05-25T00:00:00Z".to_string(),
            last_user_message_at: None,
            kind: "manual".to_string(),
            triage_priming_unconsumed: false,
        }
    }

    #[test]
    fn mobile_row_matches_desktop_worktree_display_title() {
        let row = map_workspace_row(sidebar_row(
            "支持 Github Copilot 计划",
            "worktree-folder-title",
            WorkspaceMode::Worktree,
        ));

        assert_eq!(row.title, "Github Copilot Plan");
        assert_eq!(row.directory_name, "worktree-folder-title");
    }

    #[test]
    fn mobile_row_preserves_desktop_sidebar_title_for_local_and_chat_rows() {
        let local = map_workspace_row(sidebar_row(
            "Local session title",
            "helmor-local",
            WorkspaceMode::Local,
        ));
        let chat = map_workspace_row(sidebar_row(
            "Chat plan",
            "2026-05-25/new-chat",
            WorkspaceMode::Chat,
        ));

        assert_eq!(local.title, "Local session title");
        assert_eq!(chat.title, "Chat plan");
    }
}
