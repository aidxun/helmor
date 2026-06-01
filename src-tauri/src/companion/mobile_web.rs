use std::path::{Component, Path, PathBuf};

use anyhow::{Context, Result};
use axum::{
    extract::{Path as AxumPath, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use tauri::{AppHandle, Manager};
use tokio::fs;

pub(super) async fn serve_index(State(app): State<AppHandle>) -> Response {
    match mobile_web_root(&app).and_then(|root| safe_asset_path(&root, "index.html")) {
        Ok(path) => serve_file(path, "text/html; charset=utf-8").await,
        Err(error) => server_error(error),
    }
}

pub(super) async fn serve_asset(
    State(app): State<AppHandle>,
    AxumPath(path): AxumPath<String>,
) -> Response {
    let root = match mobile_web_root(&app) {
        Ok(root) => root,
        Err(error) => return server_error(error),
    };
    let asset_path = match safe_asset_path(&root, &path) {
        Ok(path) => path,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    if fs::metadata(&asset_path).await.is_ok() {
        return serve_file(asset_path.clone(), content_type(&asset_path)).await;
    }
    match safe_asset_path(&root, "index.html") {
        Ok(index_path) => serve_file(index_path, "text/html; charset=utf-8").await,
        Err(error) => server_error(error),
    }
}

fn mobile_web_root(app: &AppHandle) -> Result<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dev_root = manifest_dir.join("../dist/mobile");
    if cfg!(debug_assertions) && dev_root.join("index.html").exists() {
        return Ok(dev_root);
    }

    let resource_root = app
        .path()
        .resource_dir()
        .context("Failed to resolve Tauri resource directory")?
        .join("mobile");
    if resource_root.join("index.html").exists() {
        return Ok(resource_root);
    }

    if dev_root.join("index.html").exists() {
        return Ok(dev_root);
    }

    Ok(resource_root)
}

fn safe_asset_path(root: &Path, request_path: &str) -> Result<PathBuf> {
    let mut path = PathBuf::from(root);
    for component in Path::new(request_path).components() {
        match component {
            Component::Normal(value) => path.push(value),
            Component::CurDir => {}
            _ => anyhow::bail!("Invalid mobile asset path"),
        }
    }
    Ok(path)
}

async fn serve_file(path: PathBuf, content_type: &'static str) -> Response {
    match fs::read(&path).await {
        Ok(bytes) => {
            let mut response = bytes.into_response();
            response
                .headers_mut()
                .insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
            response.headers_mut().insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("no-store, max-age=0"),
            );
            response
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

fn server_error(error: anyhow::Error) -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        format!("Mobile web bundle is unavailable: {error:#}"),
    )
        .into_response()
}

fn content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
    {
        "css" => "text/css; charset=utf-8",
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_asset_path_rejects_parent_traversal() {
        let root = PathBuf::from("/tmp/mobile");
        assert!(safe_asset_path(&root, "../secret").is_err());
        assert!(safe_asset_path(&root, "/secret").is_err());
    }

    #[test]
    fn content_type_maps_mobile_assets() {
        assert_eq!(
            content_type(Path::new("assets/index.js")),
            "text/javascript; charset=utf-8"
        );
        assert_eq!(
            content_type(Path::new("assets/index.css")),
            "text/css; charset=utf-8"
        );
    }
}
