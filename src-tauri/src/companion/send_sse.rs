use std::{convert::Infallible, sync::Arc, time::Duration};

use axum::response::sse::{Event, KeepAlive, Sse};
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc;
use tokio_stream::{self as stream, wrappers::UnboundedReceiverStream, Stream, StreamExt};

use crate::{agents, workspace_state::WorkspaceMode};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StreamStarted {
    pub workspace_id: String,
    pub session_id: String,
    pub mode: WorkspaceMode,
    pub repo_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum CompanionStreamEvent {
    Started(StreamStarted),
    Agent { event: agents::AgentStreamEvent },
}

pub(super) fn agent_sse_stream(
    app: AppHandle,
    started: StreamStarted,
    request: agents::AgentSendRequest,
) -> Sse<impl Stream<Item = std::result::Result<Event, Infallible>>> {
    let (agent_tx, agent_rx) = mpsc::unbounded_channel::<agents::AgentStreamEvent>();
    tauri::async_runtime::spawn_blocking(move || {
        let sidecar = app.state::<crate::sidecar::ManagedSidecar>();
        if let Err(error) = agents::send_agent_message_with_sink(
            app.clone(),
            &sidecar,
            request,
            Arc::new(agent_tx.clone()),
        ) {
            let _ = agent_tx.send(agents::AgentStreamEvent::Error {
                message: format!("{error:?}"),
                persisted: false,
                internal: false,
            });
        }
    });

    let started = stream::once(Ok(sse_event(CompanionStreamEvent::Started(started))));
    let agent_events = UnboundedReceiverStream::new(agent_rx)
        .map(|event| Ok(sse_event(CompanionStreamEvent::Agent { event })));
    Sse::new(started.chain(agent_events)).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text(": keep-alive"),
    )
}

fn sse_event(event: CompanionStreamEvent) -> Event {
    let name = match &event {
        CompanionStreamEvent::Started(_) => "started",
        CompanionStreamEvent::Agent { .. } => "agent",
    };
    Event::default()
        .event(name)
        .data(serde_json::to_string(&event).unwrap_or_else(|error| {
            serde_json::json!({
                "kind": "error",
                "message": format!("Failed to serialize event: {error}")
            })
            .to_string()
        }))
}
