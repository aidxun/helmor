use std::{convert::Infallible, time::Duration};

use anyhow::Result;
use axum::{
    extract::{Path, Query},
    http::{HeaderMap, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tokio_stream::{self as stream, Stream};

use crate::{mobile_rpc, models::paired_devices, models::sessions};

pub fn router() -> Router {
    Router::new()
        .route("/v1/health", get(health))
        .route("/v1/workspaces", get(workspaces))
        .route("/v1/sessions", get(sessions_for_workspace))
        .route("/v1/sessions/{session_id}/thread", get(session_thread))
        .route("/v1/sessions/{session_id}/read", post(mark_session_read))
        .route("/v1/backlog", post(create_backlog))
        .route("/v1/stream", get(stream_events))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    ok: bool,
    protocol_version: u32,
    desktop_id: String,
    desktop_name: String,
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

async fn workspaces(headers: HeaderMap) -> ApiResult<Json<mobile_rpc::WorkspaceSnapshot>> {
    authenticate(&headers)?;
    Ok(Json(
        mobile_rpc::workspace_snapshot_result().map_err(ApiError::from)?,
    ))
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

async fn stream_events(
    headers: HeaderMap,
) -> ApiResult<Sse<impl Stream<Item = std::result::Result<Event, Infallible>>>> {
    authenticate(&headers)?;
    let events = stream::iter([Ok(Event::default().event("hello").data(r#"{"ok":true}"#))]);
    Ok(Sse::new(events).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text(": keep-alive"),
    ))
}

fn authenticate(headers: &HeaderMap) -> Result<paired_devices::AuthenticatedDevice> {
    paired_devices::authenticate_bearer(
        headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok()),
    )
}

type ApiResult<T> = std::result::Result<T, ApiError>;

struct ApiError(anyhow::Error);

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
