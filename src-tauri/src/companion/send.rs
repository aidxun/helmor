use std::convert::Infallible;

use anyhow::{Context, Result};
use axum::{
    extract::{Path, State},
    http::HeaderMap,
    response::sse::{Event, Sse},
    Json,
};
use serde::Deserialize;
use tauri::AppHandle;
use tokio_stream::Stream;

use crate::{
    agents,
    companion::routes::{authenticate, ApiResult},
    companion::send_sse::{agent_sse_stream, StreamStarted},
    companion::send_support::{
        load_default_model_id, session_send_defaults, workspace_working_directory,
    },
    models::{repos, workspaces as workspace_models},
    workspace::workspaces as workspace_ops,
    workspace_state::{WorkspaceBranchIntent, WorkspaceMode},
    workspace_status::WorkspaceStatus,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SendMessageParams {
    prompt: String,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    model_id: Option<String>,
    #[serde(default)]
    effort_level: Option<String>,
    #[serde(default)]
    permission_mode: Option<String>,
    #[serde(default)]
    fast_mode: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SendNewWorkspaceParams {
    prompt: String,
    target: SendWorkspaceTarget,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    model_id: Option<String>,
    #[serde(default)]
    effort_level: Option<String>,
    #[serde(default)]
    permission_mode: Option<String>,
    #[serde(default)]
    fast_mode: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub(super) enum SendWorkspaceTarget {
    Chat,
    Repo {
        repo_id: String,
        mode: WorkspaceMode,
    },
}

pub(super) async fn send_session_stream(
    State(app): State<AppHandle>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
    Json(payload): Json<SendMessageParams>,
) -> ApiResult<Sse<impl Stream<Item = std::result::Result<Event, Infallible>>>> {
    authenticate(&headers)?;
    let prompt = require_prompt(&payload.prompt)?;
    let prepared = prepare_existing_session_send(&session_id, payload, prompt)?;
    Ok(agent_sse_stream(app, prepared.started, prepared.request))
}

pub(super) async fn send_new_workspace_stream(
    State(app): State<AppHandle>,
    headers: HeaderMap,
    Json(payload): Json<SendNewWorkspaceParams>,
) -> ApiResult<Sse<impl Stream<Item = std::result::Result<Event, Infallible>>>> {
    authenticate(&headers)?;
    let prompt = require_prompt(&payload.prompt)?;
    let prepared = prepare_new_workspace_send(payload, prompt).await?;
    Ok(agent_sse_stream(app, prepared.started, prepared.request))
}

struct PreparedSend {
    started: StreamStarted,
    request: agents::AgentSendRequest,
}

fn require_prompt(prompt: &str) -> Result<String> {
    let trimmed = prompt.trim();
    if trimmed.is_empty() {
        anyhow::bail!("Prompt is required");
    }
    Ok(trimmed.to_string())
}

fn prepare_existing_session_send(
    session_id: &str,
    payload: SendMessageParams,
    prompt: String,
) -> Result<PreparedSend> {
    let defaults = session_send_defaults(session_id)?;
    let working_directory = workspace_working_directory(&defaults.workspace_id)?;
    let model_id = payload
        .model_id
        .or(defaults.model_id)
        .or_else(load_default_model_id)
        .unwrap_or_else(|| "default".to_string());
    let resolved = agents::resolve_model(
        &model_id,
        payload.provider.as_deref().or(defaults.provider.as_deref()),
    );
    let record = workspace_models::load_workspace_record_by_id(&defaults.workspace_id)?
        .with_context(|| format!("Workspace not found: {}", defaults.workspace_id))?;
    Ok(PreparedSend {
        started: StreamStarted {
            workspace_id: defaults.workspace_id,
            session_id: session_id.to_string(),
            mode: record.mode,
            repo_id: (!record.mode.is_chat()).then_some(record.repo_id),
        },
        request: agents::AgentSendRequest {
            provider: payload.provider.unwrap_or(resolved.provider),
            model_id,
            prompt,
            prompt_prefix: None,
            session_id: None,
            helmor_session_id: Some(session_id.to_string()),
            working_directory: Some(working_directory),
            effort_level: payload.effort_level.or(defaults.effort_level),
            permission_mode: payload
                .permission_mode
                .or(defaults.permission_mode)
                .or_else(|| Some("bypassPermissions".to_string())),
            fast_mode: payload.fast_mode.or(defaults.fast_mode),
            user_message_id: None,
            files: None,
            images: None,
        },
    })
}

async fn prepare_new_workspace_send(
    payload: SendNewWorkspaceParams,
    prompt: String,
) -> Result<PreparedSend> {
    let target = payload.target;
    let prepared = {
        let _lock = crate::models::db::WORKSPACE_FS_MUTATION_LOCK.lock().await;
        tauri::async_runtime::spawn_blocking(move || match target {
            SendWorkspaceTarget::Chat => {
                workspace_ops::prepare_chat_workspace_impl(WorkspaceStatus::InProgress, None).map(
                    |prepared| {
                        (
                            prepared,
                            WorkspaceMode::Chat,
                            None::<String>,
                            None::<workspace_ops::FinalizeWorkspaceResponse>,
                        )
                    },
                )
            }
            SendWorkspaceTarget::Repo { repo_id, mode } => match mode {
                WorkspaceMode::Worktree => {
                    let repo = repos::load_repository_by_id(&repo_id)?
                        .with_context(|| format!("Repository not found: {repo_id}"))?;
                    let prepared = workspace_ops::prepare_workspace_from_repo_impl(
                        &repo_id,
                        repo.default_branch.as_deref(),
                        WorkspaceBranchIntent::FromBranch,
                        WorkspaceStatus::InProgress,
                        None,
                    )?;
                    let finalized =
                        workspace_ops::finalize_workspace_from_repo_impl(&prepared.workspace_id)?;
                    Ok((prepared, mode, Some(repo_id), Some(finalized)))
                }
                WorkspaceMode::Local => {
                    let repo = repos::load_repository_by_id(&repo_id)?
                        .with_context(|| format!("Repository not found: {repo_id}"))?;
                    let prepared = workspace_ops::prepare_local_workspace_impl(
                        &repo_id,
                        repo.default_branch.as_deref(),
                        WorkspaceStatus::InProgress,
                        None,
                    )?;
                    Ok((prepared, mode, Some(repo_id), None))
                }
                WorkspaceMode::Chat => anyhow::bail!("Use target.kind=chat for chat workspaces"),
            },
        })
        .await
        .context("Failed to create mobile workspace")??
    };

    let (prepared, mode, repo_id, finalized) = prepared;
    let working_directory = finalized
        .map(|response| response.working_directory)
        .or(prepared.working_directory)
        .with_context(|| {
            format!(
                "Workspace {} did not produce a working directory",
                prepared.workspace_id
            )
        })?;
    let _ =
        crate::ui_sync::notify_running_app(crate::ui_sync::UiMutationEvent::WorkspaceListChanged);
    let model_id = payload
        .model_id
        .or_else(load_default_model_id)
        .unwrap_or_else(|| "default".to_string());
    let resolved = agents::resolve_model(&model_id, payload.provider.as_deref());
    Ok(PreparedSend {
        started: StreamStarted {
            workspace_id: prepared.workspace_id,
            session_id: prepared.initial_session_id.clone(),
            mode,
            repo_id,
        },
        request: agents::AgentSendRequest {
            provider: payload.provider.unwrap_or(resolved.provider),
            model_id,
            prompt,
            prompt_prefix: None,
            session_id: None,
            helmor_session_id: Some(prepared.initial_session_id),
            working_directory: Some(working_directory),
            effort_level: payload.effort_level.or_else(|| Some("high".to_string())),
            permission_mode: payload
                .permission_mode
                .or_else(|| Some("bypassPermissions".to_string())),
            fast_mode: Some(payload.fast_mode.unwrap_or(false)),
            user_message_id: None,
            files: None,
            images: None,
        },
    })
}
