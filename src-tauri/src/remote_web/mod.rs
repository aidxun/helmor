mod rpc;

use std::net::SocketAddr;
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Request, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};

use crate::ui_sync::UiSyncManager;

const DEFAULT_BIND: &str = "127.0.0.1:17890";
const TOKEN_HEADER: &str = "x-helmor-remote-token";

#[derive(Clone)]
struct RemoteWebState {
    app: AppHandle,
    token: String,
    static_root: PathBuf,
    web_tx: broadcast::Sender<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteWebStatus {
    pub enabled: bool,
    pub bind_addr: String,
    pub local_url: String,
    pub token: String,
}

pub fn start(app: AppHandle) {
    let bind = std::env::var("HELMOR_WEB_BIND").unwrap_or_else(|_| DEFAULT_BIND.to_string());
    let token = load_or_create_token();
    let (web_tx, _) = broadcast::channel(512);
    maybe_spawn_vite_dev_server(&static_root());
    let state = RemoteWebState {
        app: app.clone(),
        token,
        static_root: static_root(),
        web_tx,
    };

    tauri::async_runtime::spawn(async move {
        let addr: SocketAddr = match bind.parse() {
            Ok(addr) => addr,
            Err(error) => {
                tracing::warn!(bind, error = %error, "remote web bind address is invalid");
                return;
            }
        };

        let listener = match TcpListener::bind(addr).await {
            Ok(listener) => listener,
            Err(error) => {
                tracing::warn!(bind, error = %error, "remote web service failed to bind");
                return;
            }
        };
        let actual_addr = listener.local_addr().unwrap_or(addr);
        let local_url = format!("http://{}/r/{}/", actual_addr, state.token);
        if let Err(error) = store_status(RemoteWebStatus {
            enabled: true,
            bind_addr: actual_addr.to_string(),
            local_url: local_url.clone(),
            token: state.token.clone(),
        }) {
            tracing::warn!(error = %format!("{error:#}"), "remote web status persist failed");
        }
        tracing::info!(url = %local_url, "remote web service started");

        let app = Router::new()
            .route("/api/health", get(health))
            .route("/api/rpc", post(rpc::handle_rpc))
            .route("/api/events", get(events_ws))
            .fallback(static_asset)
            .layer(middleware::from_fn_with_state(
                state.clone(),
                require_remote_token,
            ))
            .layer(
                CorsLayer::new()
                    .allow_origin(Any)
                    .allow_headers(Any)
                    .allow_methods(Any),
            )
            .with_state(state);

        if let Err(error) = axum::serve(listener, app).await {
            tracing::warn!(error = %error, "remote web service stopped");
        }
    });
}

pub fn current_status() -> RemoteWebStatus {
    load_status().unwrap_or_else(|| {
        let token = load_or_create_token();
        RemoteWebStatus {
            enabled: false,
            bind_addr: DEFAULT_BIND.to_string(),
            local_url: format!("http://{DEFAULT_BIND}/r/{token}/"),
            token,
        }
    })
}

#[tauri::command]
pub async fn get_remote_web_status() -> RemoteWebStatus {
    current_status()
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "ok": true,
        "app": "helmor",
    }))
}

async fn events_ws(State(state): State<RemoteWebState>, ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(move |socket| events_loop(state, socket))
}

async fn events_loop(state: RemoteWebState, mut socket: WebSocket) {
    let mut ui_rx = state.app.state::<UiSyncManager>().subscribe_web();
    let mut web_rx = state.web_tx.subscribe();
    loop {
        tokio::select! {
            event = web_rx.recv() => {
                let Ok(payload) = event else {
                    break;
                };
                if socket.send(Message::Text(payload.to_string())).await.is_err() {
                    break;
                }
            }
            event = ui_rx.recv() => {
                let Ok(payload) = event else {
                    break;
                };
                let message = serde_json::json!({
                    "event": "ui-mutation",
                    "payload": payload,
                });
                if socket.send(Message::Text(message.to_string())).await.is_err() {
                    break;
                }
            }
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
        }
    }
}

async fn static_asset(State(state): State<RemoteWebState>, request: Request) -> Response {
    let path = static_path(request.uri().path());
    let query = request.uri().query().map(str::to_string);
    let full_path = state.static_root.join(&path);
    let bytes = match tokio::fs::read(&full_path).await {
        Ok(bytes) => bytes,
        Err(_) => match tokio::fs::read(state.static_root.join("index.html")).await {
            Ok(bytes) => bytes,
            Err(_) => return dev_server_asset(&path, query.as_deref()).await,
        },
    };
    let content_type = content_type_for(&full_path);
    ([(header::CONTENT_TYPE, content_type)], bytes).into_response()
}

async fn dev_server_asset(path: &Path, query: Option<&str>) -> Response {
    let dev_path = if path == Path::new("index.html") {
        String::new()
    } else {
        path.display().to_string()
    };
    let dev_query = query
        .map(strip_remote_token_query)
        .filter(|query| !query.is_empty())
        .map(|query| format!("?{query}"))
        .unwrap_or_default();
    let response = 'attempts: {
        for base in dev_server_bases() {
            let url = format!("{base}/{dev_path}{dev_query}");
            if let Ok(response) = reqwest::get(&url).await {
                break 'attempts response;
            }
        }
        return (
            StatusCode::NOT_FOUND,
            "Helmor web assets are not built and the Vite dev server is not reachable.",
        )
            .into_response();
    };
    let status =
        StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE.as_str())
        .and_then(|value| value.to_str().ok())
        .and_then(|value| HeaderValue::from_str(value).ok())
        .unwrap_or_else(|| content_type_for(path));
    let mut proxied = match response.bytes().await {
        Ok(bytes) => ([(header::CONTENT_TYPE, content_type)], bytes).into_response(),
        Err(error) => (
            StatusCode::BAD_GATEWAY,
            format!("Failed to read Vite dev server response: {error}"),
        )
            .into_response(),
    };
    *proxied.status_mut() = status;
    proxied
}

fn strip_remote_token_query(query: &str) -> String {
    query
        .split('&')
        .filter(|part| {
            !part
                .split_once('=')
                .is_some_and(|(key, _)| key.eq_ignore_ascii_case("token"))
        })
        .collect::<Vec<_>>()
        .join("&")
}

async fn require_remote_token(
    State(state): State<RemoteWebState>,
    request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path();
    let needs_auth = matches!(path, "/api/rpc" | "/api/events");
    if !needs_auth || authorized(request.uri(), request.headers(), &state.token) {
        return next.run(request).await;
    }
    (
        StatusCode::UNAUTHORIZED,
        "Missing or invalid Helmor remote token",
    )
        .into_response()
}

fn authorized(uri: &axum::http::Uri, headers: &axum::http::HeaderMap, token: &str) -> bool {
    if headers
        .get(TOKEN_HEADER)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value == token)
    {
        return true;
    }
    #[cfg(debug_assertions)]
    if headers
        .get(header::ORIGIN)
        .or_else(|| headers.get(header::REFERER))
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| {
            value.starts_with("http://localhost:1420") || value.starts_with("http://127.0.0.1:1420")
        })
    {
        return true;
    }
    if uri
        .query()
        .and_then(|query| {
            query.split('&').find_map(|part| {
                let (key, value) = part.split_once('=')?;
                (key == "token").then_some(value)
            })
        })
        .is_some_and(|value| value == token)
    {
        return true;
    }
    let path = uri.path();
    if path.starts_with(&format!("/r/{token}/")) || path == format!("/r/{token}") {
        return true;
    }
    false
}

fn static_path(path: &str) -> PathBuf {
    let trimmed = path.trim_start_matches('/');
    let without_token = trimmed
        .strip_prefix("r/")
        .and_then(|rest| rest.split_once('/').map(|(_, tail)| tail))
        .unwrap_or(trimmed);
    let candidate = if without_token.is_empty() {
        "index.html"
    } else {
        without_token
    };
    let mut safe = PathBuf::new();
    for component in Path::new(candidate).components() {
        if let Component::Normal(part) = component {
            safe.push(part);
        }
    }
    if safe.as_os_str().is_empty() {
        PathBuf::from("index.html")
    } else {
        safe
    }
}

fn content_type_for(path: &Path) -> HeaderValue {
    let value = match path.extension().and_then(|ext| ext.to_str()) {
        Some("css") => "text/css; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("ico") => "image/x-icon",
        Some("html") => "text/html; charset=utf-8",
        _ => "text/html; charset=utf-8",
    };
    HeaderValue::from_static(value)
}

fn static_root() -> PathBuf {
    let cwd_dist = std::env::current_dir()
        .ok()
        .map(|cwd| cwd.join("dist"))
        .filter(|path| path.is_dir());
    cwd_dist.unwrap_or_else(|| {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("dist")
    })
}

fn dev_server_bases() -> Vec<String> {
    std::env::var("HELMOR_WEB_DEV_URL")
        .ok()
        .filter(|url| !url.trim().is_empty())
        .into_iter()
        .chain([
            "http://localhost:1420".to_string(),
            "http://127.0.0.1:1420".to_string(),
        ])
        .map(|url| url.trim_end_matches('/').to_string())
        .collect()
}

fn maybe_spawn_vite_dev_server(static_root: &Path) {
    if static_root.join("index.html").is_file() {
        return;
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = static_root;
    }
    #[cfg(debug_assertions)]
    {
        let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .to_path_buf();
        match std::process::Command::new("bun")
            .args([
                "x",
                "vite",
                "--host",
                "127.0.0.1",
                "--port",
                "1420",
                "--strictPort",
            ])
            .current_dir(repo_root)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(_) => tracing::debug!("spawned Vite dev server for remote web fallback"),
            Err(error) => {
                tracing::debug!(error = %error, "failed to spawn Vite dev server for remote web fallback")
            }
        }
    }
}

fn load_or_create_token() -> String {
    const KEY: &str = "remote_web.token";
    if let Ok(Some(token)) = crate::settings::load_setting_value(KEY) {
        if !token.trim().is_empty() {
            return token;
        }
    }
    let token = uuid::Uuid::new_v4().to_string();
    if let Err(error) = crate::settings::upsert_setting_value(KEY, &token) {
        tracing::warn!(error = %format!("{error:#}"), "failed to persist remote web token");
    }
    token
}

fn store_status(status: RemoteWebStatus) -> anyhow::Result<()> {
    crate::settings::upsert_setting_value("remote_web.status", &serde_json::to_string(&status)?)?;
    Ok(())
}

fn load_status() -> Option<RemoteWebStatus> {
    crate::settings::load_setting_value("remote_web.status")
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_str(&value).ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_remote_token_query_keeps_vite_import_query() {
        assert_eq!(
            strip_remote_token_query("token=secret&import"),
            "import".to_string()
        );
        assert_eq!(
            strip_remote_token_query("import&token=secret"),
            "import".to_string()
        );
        assert_eq!(
            strip_remote_token_query("v=879fe016&token=secret"),
            "v=879fe016".to_string()
        );
    }
}
