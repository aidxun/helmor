use tauri::{AppHandle, Runtime};

use crate::{
    git_watcher,
    ui_sync::{self, UiMutationEvent},
};

#[derive(Debug, Clone)]
pub enum WorkspaceProjectionChange {
    List,
    Workspace { workspace_id: String },
}

impl WorkspaceProjectionChange {
    pub fn workspace(workspace_id: impl Into<String>) -> Self {
        Self::Workspace {
            workspace_id: workspace_id.into(),
        }
    }
}

/// Publish that the workspace projection consumed by desktop and mobile UIs
/// changed. This is data-level invalidation: callers should use it after any
/// DB mutation that can alter workspace grouping, ordering, labels, unread
/// state, or archived membership.
pub fn publish<R: Runtime>(app: &AppHandle<R>, change: WorkspaceProjectionChange) {
    ui_sync::publish(app, UiMutationEvent::WorkspaceListChanged);
    if let WorkspaceProjectionChange::Workspace { workspace_id } = change {
        ui_sync::publish(app, UiMutationEvent::WorkspaceChanged { workspace_id });
    }
}

pub fn publish_after_git_sync<R: Runtime>(app: &AppHandle<R>, change: WorkspaceProjectionChange) {
    git_watcher::notify_workspace_changed(app);
    publish(app, change);
}

pub fn publish_with_git_sync_in_background<R: Runtime>(
    app: AppHandle<R>,
    change: WorkspaceProjectionChange,
) {
    tauri::async_runtime::spawn(async move {
        publish(&app, change);
        let _ = tauri::async_runtime::spawn_blocking(move || {
            git_watcher::notify_workspace_changed(&app);
        })
        .await;
    });
}
