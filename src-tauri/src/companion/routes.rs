use std::{convert::Infallible, time::Duration};

use anyhow::Result;
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Redirect, Response,
    },
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio_stream::{wrappers::UnboundedReceiverStream, Stream, StreamExt};
use uuid::Uuid;

use crate::{
    agents,
    companion::{
        mobile_web,
        send::{send_new_workspace_stream, send_session_stream},
    },
    git_ops, mobile_rpc,
    models::{paired_devices, repos, sessions},
    ui_sync::{UiMutationEnvelope, UiSyncManager},
    workspace::workspaces,
};

pub fn router(app: AppHandle) -> Router {
    Router::new()
        .route("/mobile", get(|| async { Redirect::permanent("/mobile/") }))
        .route("/mobile/", get(mobile_web::serve_index))
        .route("/mobile/{*path}", get(mobile_web::serve_asset))
        .route("/v1/health", get(health))
        .route("/v1/agent-config", get(agent_config))
        .route("/v1/repositories", get(repositories))
        .route("/v1/workspaces", get(workspaces))
        .route(
            "/v1/workspaces/send/stream",
            post(send_new_workspace_stream),
        )
        .route("/v1/sessions", get(sessions_for_workspace))
        .route("/v1/sessions/{session_id}/thread", get(session_thread))
        .route("/v1/sessions/{session_id}/read", post(mark_session_read))
        .route(
            "/v1/sessions/{session_id}/send/stream",
            post(send_session_stream),
        )
        .route("/v1/backlog", post(create_backlog))
        .route("/v1/stream", get(ui_mutation_stream))
        .with_state(app)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    ok: bool,
    protocol_version: u32,
    desktop_id: String,
    desktop_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentConfigResponse {
    model_sections: Vec<agents::AgentModelSection>,
    provider_capabilities: Vec<agents::provider_capabilities::ProviderCapabilities>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionsQuery {
    workspace_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ThreadQuery {
    tail_limit: Option<usize>,
}

async fn health(headers: HeaderMap) -> ApiResult<Json<HealthResponse>> {
    authenticate(&headers)?;
    let identity = mobile_rpc::initialize_result().map_err(ApiError::from)?;
    Ok(Json(HealthResponse {
        ok: true,
        protocol_version: identity.protocol_version,
        desktop_id: identity.desktop_id,
        desktop_name: identity.desktop_name,
    }))
}

async fn agent_config(headers: HeaderMap) -> ApiResult<Json<AgentConfigResponse>> {
    authenticate(&headers)?;
    Ok(Json(AgentConfigResponse {
        model_sections: agents::fetch_agent_model_sections(),
        provider_capabilities: agents::provider_capabilities::KNOWN_PROVIDERS
            .iter()
            .map(|provider| agents::provider_capabilities::capabilities_for_provider(provider))
            .collect(),
    }))
}

async fn workspaces(headers: HeaderMap) -> ApiResult<Json<mobile_rpc::WorkspaceSnapshot>> {
    authenticate(&headers)?;
    Ok(Json(
        mobile_rpc::workspace_snapshot_result().map_err(ApiError::from)?,
    ))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MobileRepositoryOption {
    id: String,
    name: String,
    remote: Option<String>,
    remote_url: Option<String>,
    default_branch: Option<String>,
    repo_icon_src: Option<String>,
    repo_initials: String,
    current_branch: Option<String>,
    branches: Vec<workspaces::BranchPickerEntry>,
}

async fn repositories(headers: HeaderMap) -> ApiResult<Json<Vec<MobileRepositoryOption>>> {
    authenticate(&headers)?;
    let repositories = repos::list_repositories().map_err(ApiError::from)?;
    let mut out = Vec::with_capacity(repositories.len());
    for repo in repositories {
        let record = repos::load_repository_by_id(&repo.id)
            .map_err(ApiError::from)?
            .filter(|record| std::path::Path::new(record.root_path.trim()).is_dir());
        let (current_branch, branches) = if let Some(record) = record {
            let root = std::path::PathBuf::from(record.root_path.trim());
            let remote = record.remote.unwrap_or_else(|| "origin".to_string());
            (
                git_ops::current_branch_name(&root).ok(),
                workspaces::list_branch_picker_entries(&root, &remote),
            )
        } else {
            (None, Vec::new())
        };
        out.push(MobileRepositoryOption {
            id: repo.id,
            name: repo.name,
            remote: repo.remote,
            remote_url: repo.remote_url,
            default_branch: repo.default_branch,
            repo_icon_src: repo.repo_icon_src,
            repo_initials: repo.repo_initials,
            current_branch,
            branches,
        });
    }
    Ok(Json(out))
}

async fn sessions_for_workspace(
    headers: HeaderMap,
    Query(query): Query<SessionsQuery>,
) -> ApiResult<Json<Vec<sessions::WorkspaceSessionSummary>>> {
    authenticate(&headers)?;
    Ok(Json(
        sessions::list_workspace_sessions(&query.workspace_id).map_err(ApiError::from)?,
    ))
}

async fn session_thread(
    headers: HeaderMap,
    Path(session_id): Path<String>,
    Query(query): Query<ThreadQuery>,
) -> ApiResult<Json<mobile_rpc::SessionThreadMessagesPage>> {
    authenticate(&headers)?;
    Ok(Json(
        mobile_rpc::session_thread_page_result(mobile_rpc::SessionThreadPageParams {
            session_id,
            tail_limit: query.tail_limit,
        })
        .map_err(ApiError::from)?,
    ))
}

async fn mark_session_read(headers: HeaderMap, Path(session_id): Path<String>) -> ApiResult<()> {
    authenticate(&headers)?;
    sessions::mark_session_read(&session_id).map_err(ApiError::from)?;
    Ok(())
}

async fn create_backlog(
    headers: HeaderMap,
    Json(payload): Json<mobile_rpc::BacklogCreateParams>,
) -> ApiResult<Json<mobile_rpc::BacklogCreateResult>> {
    authenticate(&headers)?;
    Ok(Json(
        mobile_rpc::create_backlog_task_result(payload).map_err(ApiError::from)?,
    ))
}

async fn ui_mutation_stream(
    State(app): State<AppHandle>,
    headers: HeaderMap,
) -> ApiResult<Sse<impl Stream<Item = std::result::Result<Event, Infallible>>>> {
    authenticate(&headers)?;
    let manager = app.state::<UiSyncManager>();
    let receiver = manager.subscribe_sse(format!("mobile-companion:{}", Uuid::new_v4()));
    let events = UnboundedReceiverStream::new(receiver).map(|event| {
        Ok(Event::default().event("mutation").data(
            serde_json::to_string(&UiMutationEnvelope::new(event)).unwrap_or_else(|error| {
                serde_json::json!({
                    "version": UiMutationEnvelope::VERSION,
                    "event": {
                        "type": "settingsChanged",
                        "key": format!("companion-stream-serialization-error:{error}")
                    }
                })
                .to_string()
            }),
        ))
    });
    Ok(Sse::new(events).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text(": keep-alive"),
    ))
}

pub(super) fn authenticate(headers: &HeaderMap) -> Result<paired_devices::AuthenticatedDevice> {
    paired_devices::authenticate_bearer(
        headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok()),
    )
}

pub(super) type ApiResult<T> = std::result::Result<T, ApiError>;

pub(super) struct ApiError(anyhow::Error);

impl From<anyhow::Error> for ApiError {
    fn from(error: anyhow::Error) -> Self {
        Self(error)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let message = format!("{:#}", self.0);
        let status = if message.contains("Authorization")
            || message.contains("paired")
            || message.contains("token")
        {
            StatusCode::UNAUTHORIZED
        } else {
            StatusCode::INTERNAL_SERVER_ERROR
        };
        (status, Json(serde_json::json!({ "error": message }))).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_config_response_serializes_camel_case() {
        let response = AgentConfigResponse {
            model_sections: vec![],
            provider_capabilities: vec![],
        };

        let value = serde_json::to_value(response).expect("serializes agent config");
        assert!(value.get("modelSections").is_some());
        assert!(value.get("providerCapabilities").is_some());
        assert!(value.get("model_sections").is_none());
    }
}
