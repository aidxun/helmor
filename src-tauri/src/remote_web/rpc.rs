use axum::extract::State;
use axum::Json;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use tauri::Manager;

use super::{current_status, RemoteWebState};
use crate::error::CommandError;

const WEB_CHANNEL_MARKER: &str = "__helmorWebChannelId";

struct WebAgentStreamSink {
    channel_id: String,
    tx: tokio::sync::broadcast::Sender<Value>,
}

impl crate::agents::AgentStreamEventSink for WebAgentStreamSink {
    fn send_event(&self, event: crate::agents::AgentStreamEvent) -> bool {
        let payload = serde_json::json!({
            "channelId": self.channel_id,
            "payload": event,
        });
        self.tx.send(payload).is_ok()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcRequest {
    command: String,
    #[serde(default)]
    args: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcErrorPayload {
    message: String,
    code: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<RpcErrorPayload>,
}

impl RpcResponse {
    fn success(value: Value) -> Self {
        Self {
            ok: true,
            value: Some(value),
            error: None,
        }
    }

    fn failure(error: RpcErrorPayload) -> Self {
        Self {
            ok: false,
            value: None,
            error: Some(error),
        }
    }
}

macro_rules! ok_json {
    ($expr:expr) => {{
        let value = $expr.await.map_err(command_error)?;
        Ok(serde_json::to_value(value)?)
    }};
}

macro_rules! ok_json_sync {
    ($expr:expr) => {{
        let value = $expr.map_err(command_error)?;
        Ok(serde_json::to_value(value)?)
    }};
}

pub async fn handle_rpc(
    State(state): State<RemoteWebState>,
    Json(request): Json<RpcRequest>,
) -> Json<RpcResponse> {
    match dispatch(&state, &request.command, request.args).await {
        Ok(value) => Json(RpcResponse::success(value)),
        Err(error) => Json(RpcResponse::failure(RpcErrorPayload {
            message: format!("{error:#}"),
            code: "Unknown".to_string(),
        })),
    }
}

async fn dispatch(state: &RemoteWebState, command: &str, args: Value) -> anyhow::Result<Value> {
    let app = state.app.clone();
    match command {
        "get_remote_web_status" => Ok(serde_json::to_value(current_status())?),
        "enter_onboarding_window_mode" | "exit_onboarding_window_mode" => {
            Ok(serde_json::Value::Null)
        }

        // Startup, settings, and persisted query cache.
        "get_app_settings" => ok_json!(crate::commands::settings_commands::get_app_settings()),
        "update_app_settings" => ok_json!(crate::commands::settings_commands::update_app_settings(
            app.state::<crate::sidecar::ManagedSidecar>(),
            arg(&args, "settingsMap")?,
        )),
        "get_data_info" => ok_json_sync!(crate::commands::system_commands::get_data_info()),
        "get_cli_status" => ok_json_sync!(crate::commands::system_commands::get_cli_status()),
        "get_helmor_skills_status" => {
            ok_json!(crate::commands::system_commands::get_helmor_skills_status())
        }
        "get_helmor_components_update_check" => {
            ok_json!(crate::commands::system_commands::get_helmor_components_update_check())
        }
        "get_app_update_status" => {
            ok_json!(crate::commands::updater_commands::get_app_update_status(
                app
            ))
        }
        "check_for_app_update" => ok_json!(
            crate::commands::updater_commands::check_for_app_update(app, arg_opt(&args, "force")?,)
        ),
        "read_query_cache" => ok_json!(crate::commands::system_commands::read_query_cache(arg(
            &args, "key"
        )?,)),
        "write_query_cache" => ok_json!(crate::commands::system_commands::write_query_cache(
            arg(&args, "key")?,
            arg(&args, "value")?,
        )),
        "delete_query_cache" => ok_json!(crate::commands::system_commands::delete_query_cache(
            arg(&args, "key")?,
        )),
        "load_auto_close_action_kinds" => {
            ok_json!(crate::commands::settings_commands::load_auto_close_action_kinds())
        }
        "save_auto_close_action_kinds" => {
            ok_json!(
                crate::commands::settings_commands::save_auto_close_action_kinds(arg(
                    &args, "kinds"
                )?,)
            )
        }
        "load_auto_close_opt_in_asked" => {
            ok_json!(crate::commands::settings_commands::load_auto_close_opt_in_asked())
        }
        "save_auto_close_opt_in_asked" => {
            ok_json!(
                crate::commands::settings_commands::save_auto_close_opt_in_asked(arg(
                    &args, "kinds"
                )?,)
            )
        }

        // Navigation and repository/workspace CRUD.
        "list_workspace_groups" => {
            ok_json!(crate::commands::workspace_commands::list_workspace_groups())
        }
        "get_workspace" => ok_json!(crate::commands::workspace_commands::get_workspace(arg(
            &args,
            "workspaceId"
        )?,)),
        "list_archived_workspaces" => {
            ok_json!(crate::commands::workspace_commands::list_archived_workspaces())
        }
        "list_repositories" => ok_json!(crate::commands::repository_commands::list_repositories()),
        "get_add_repository_defaults" => {
            ok_json!(crate::commands::repository_commands::get_add_repository_defaults())
        }
        "list_repo_remotes" => ok_json!(crate::commands::repository_commands::list_repo_remotes(
            arg(&args, "repoId")?,
        )),
        "load_repo_scripts" => ok_json!(crate::commands::repository_commands::load_repo_scripts(
            arg(&args, "repoId")?,
            arg_opt(&args, "workspaceId")?,
        )),
        "load_repo_preferences" => {
            ok_json!(crate::commands::repository_commands::load_repo_preferences(
                arg(&args, "repoId")?,
            ))
        }
        "update_repo_preferences" => {
            ok_json!(
                crate::commands::repository_commands::update_repo_preferences(
                    arg(&args, "repoId")?,
                    arg(&args, "preferences")?,
                )
            )
        }
        "move_repository_in_sidebar" => {
            ok_json!(
                crate::commands::repository_commands::move_repository_in_sidebar(
                    arg(&args, "repoId")?,
                    arg_opt(&args, "beforeRepoId")?,
                )
            )
        }
        "list_workspace_sessions" => {
            ok_json!(crate::commands::session_commands::list_workspace_sessions(
                arg(&args, "workspaceId")?,
            ))
        }
        "list_session_thread_messages" => {
            ok_json!(
                crate::commands::session_commands::list_session_thread_messages(
                    arg(&args, "sessionId")?,
                    arg_opt(&args, "tailLimit")?,
                )
            )
        }
        "list_session_drafts" => ok_json!(crate::commands::session_commands::list_session_drafts()),
        "set_session_draft" => ok_json!(crate::commands::session_commands::set_session_draft(
            arg(&args, "sessionId")?,
            arg_opt(&args, "draftState")?,
        )),
        "create_session" => ok_json!(crate::commands::session_commands::create_session(
            arg(&args, "workspaceId")?,
            arg_opt(&args, "actionKind")?,
            arg_opt(&args, "permissionMode")?,
            arg_opt(&args, "model")?,
            arg_opt(&args, "effortLevel")?,
            arg_opt(&args, "fastMode")?,
            arg_opt(&args, "seedSessionId")?,
        )),
        "rename_session" => ok_json!(crate::commands::session_commands::rename_session(
            arg(&args, "sessionId")?,
            arg(&args, "title")?,
        )),
        "hide_session" => ok_json!(crate::commands::session_commands::hide_session(arg(
            &args,
            "sessionId"
        )?,)),
        "unhide_session" => ok_json!(crate::commands::session_commands::unhide_session(arg(
            &args,
            "sessionId"
        )?,)),
        "delete_session" => ok_json!(crate::commands::session_commands::delete_session(arg(
            &args,
            "sessionId"
        )?,)),
        "list_hidden_sessions" => {
            ok_json!(crate::commands::session_commands::list_hidden_sessions(
                arg(&args, "workspaceId")?,
            ))
        }
        "mark_session_read" => ok_json!(crate::commands::session_commands::mark_session_read(arg(
            &args,
            "sessionId"
        )?,)),
        "mark_session_unread" => ok_json!(crate::commands::session_commands::mark_session_unread(
            arg(&args, "sessionId")?,
        )),
        "pin_workspace" => ok_json!(crate::commands::workspace_commands::pin_workspace(arg(
            &args,
            "workspaceId"
        )?,)),
        "unpin_workspace" => ok_json!(crate::commands::workspace_commands::unpin_workspace(arg(
            &args,
            "workspaceId"
        )?,)),
        "set_workspace_status" => {
            ok_json!(crate::commands::workspace_commands::set_workspace_status(
                arg(&args, "workspaceId")?,
                arg(&args, "status")?,
            ))
        }
        "move_workspace_in_sidebar" => {
            ok_json!(
                crate::commands::workspace_commands::move_workspace_in_sidebar(
                    arg(&args, "workspaceId")?,
                    arg(&args, "targetGroupId")?,
                    arg_opt(&args, "beforeWorkspaceId")?,
                )
            )
        }

        // Branches and workspace materialization.
        "list_remote_branches" => {
            ok_json!(crate::commands::workspace_commands::list_remote_branches(
                arg_opt(&args, "workspaceId")?,
                arg_opt(&args, "repoId")?,
            ))
        }
        "list_branches_for_local_picker" => {
            ok_json!(
                crate::commands::workspace_commands::list_branches_for_local_picker(arg(
                    &args, "repoId"
                )?,)
            )
        }
        "list_branches_for_workspace_picker" => {
            ok_json!(
                crate::commands::workspace_commands::list_branches_for_workspace_picker(arg(
                    &args, "repoId"
                )?,)
            )
        }
        "get_repo_current_branch" => {
            ok_json!(
                crate::commands::workspace_commands::get_repo_current_branch(arg(&args, "repoId")?,)
            )
        }
        "prefetch_remote_refs" => {
            ok_json!(crate::commands::workspace_commands::prefetch_remote_refs(
                arg_opt(&args, "workspaceId")?,
                arg_opt(&args, "repoId")?,
            ))
        }
        "prepare_workspace_from_repo" => {
            ok_json!(
                crate::commands::workspace_commands::prepare_workspace_from_repo(
                    app,
                    arg(&args, "repoId")?,
                    arg_opt(&args, "sourceBranch")?,
                    arg_opt(&args, "mode")?,
                    arg_opt(&args, "branchIntent")?,
                    arg_opt(&args, "initialStatus")?,
                    arg_opt(&args, "seedSessionId")?,
                )
            )
        }
        "finalize_workspace_from_repo" => {
            ok_json!(
                crate::commands::workspace_commands::finalize_workspace_from_repo(
                    app,
                    arg(&args, "workspaceId")?,
                )
            )
        }
        "prepare_chat_workspace" => {
            ok_json!(crate::commands::workspace_commands::prepare_chat_workspace(
                app,
                arg_opt(&args, "initialStatus")?,
                arg_opt(&args, "seedSessionId")?,
            ))
        }
        "complete_workspace_setup" => {
            ok_json!(
                crate::commands::workspace_commands::complete_workspace_setup(
                    app,
                    arg(&args, "workspaceId")?,
                )
            )
        }

        // Editor/read-only git surfaces plus common mutations.
        "list_editor_files" => ok_json!(crate::commands::editor_commands::list_editor_files(arg(
            &args,
            "workspaceRootPath"
        )?,)),
        "list_workspace_files" => ok_json!(crate::commands::editor_commands::list_workspace_files(
            arg(&args, "workspaceRootPath")?,
        )),
        "list_workspace_changes" => {
            ok_json!(crate::commands::editor_commands::list_workspace_changes(
                arg(&args, "workspaceRootPath")?,
                arg_opt(&args, "workspaceId")?,
            ))
        }
        "read_editor_file" => ok_json!(crate::commands::editor_commands::read_editor_file(arg(
            &args, "path"
        )?,)),
        "read_file_at_ref" => ok_json!(crate::commands::editor_commands::read_file_at_ref(
            arg(&args, "workspaceRootPath")?,
            arg(&args, "filePath")?,
            arg(&args, "gitRef")?,
        )),
        "write_editor_file" => ok_json!(crate::commands::editor_commands::write_editor_file(
            arg(&args, "path")?,
            arg(&args, "contents")?,
        )),
        "stat_editor_file" => ok_json!(crate::commands::editor_commands::stat_editor_file(arg(
            &args, "path"
        )?,)),
        "discard_workspace_file" => {
            ok_json!(crate::commands::editor_commands::discard_workspace_file(
                arg(&args, "workspaceRootPath")?,
                arg(&args, "relativePath")?,
            ))
        }
        "stage_workspace_file" => ok_json!(crate::commands::editor_commands::stage_workspace_file(
            arg(&args, "workspaceRootPath")?,
            arg(&args, "relativePath")?,
        )),
        "unstage_workspace_file" => {
            ok_json!(crate::commands::editor_commands::unstage_workspace_file(
                arg(&args, "workspaceRootPath")?,
                arg(&args, "relativePath")?,
            ))
        }
        "get_workspace_git_action_status" => {
            ok_json!(
                crate::commands::editor_commands::get_workspace_git_action_status(arg(
                    &args,
                    "workspaceId"
                )?,)
            )
        }

        // Agent command/control.
        "send_agent_message_stream" => {
            let channel_id = web_channel_id(&args, "onEvent")?;
            ok_json!(crate::agents::send_agent_message_stream_with_sink(
                app.clone(),
                app.state::<crate::sidecar::ManagedSidecar>().inner(),
                arg(&args, "request")?,
                Box::new(WebAgentStreamSink {
                    channel_id,
                    tx: state.web_tx.clone(),
                }),
            ))
        }
        "list_agent_model_sections" => ok_json!(crate::agents::list_agent_model_sections()),
        "list_active_streams" => ok_json!(crate::agents::list_active_streams(
            app.state::<crate::agents::ActiveStreams>(),
        )),
        "stop_agent_stream" => ok_json!(crate::agents::stop_agent_stream(
            app.state::<crate::sidecar::ManagedSidecar>(),
            arg(&args, "request")?,
        )),
        "steer_agent_stream" => ok_json!(crate::agents::steer_agent_stream(
            app.clone(),
            app.state::<crate::sidecar::ManagedSidecar>(),
            arg(&args, "request")?,
        )),
        "respond_to_permission_request" => ok_json!(crate::agents::respond_to_permission_request(
            app.state::<crate::sidecar::ManagedSidecar>(),
            arg(&args, "request")?,
        )),
        "respond_to_user_input" => ok_json!(crate::agents::respond_to_user_input(
            app.state::<crate::sidecar::ManagedSidecar>(),
            arg(&args, "request")?,
        )),
        "generate_session_title" => ok_json!(crate::agents::generate_session_title(
            app.clone(),
            app.state::<crate::sidecar::ManagedSidecar>(),
            arg(&args, "request")?,
        )),
        "list_slash_commands" => ok_json!(crate::agents::list_slash_commands(
            app.clone(),
            app.state::<crate::sidecar::ManagedSidecar>(),
            app.state::<crate::agents::SlashCommandCache>(),
            arg(&args, "request")?,
        )),
        "prewarm_slash_commands_for_workspace" => {
            ok_json!(crate::agents::prewarm_slash_commands_for_workspace(
                app,
                arg(&args, "workspaceId")?,
            ))
        }
        "prewarm_slash_commands_for_repo" => {
            ok_json!(crate::agents::prewarm_slash_commands_for_repo(
                app,
                arg(&args, "repoId")?,
            ))
        }

        // Forge summary surfaces used by the inspector/sidebar.
        "get_workspace_forge" => ok_json!(crate::commands::forge_commands::get_workspace_forge(
            arg(&args, "workspaceId")?,
        )),
        "list_forge_accounts" => ok_json!(crate::commands::forge_commands::list_forge_accounts(
            arg(&args, "gitlabHosts")?,
        )),
        "list_forge_logins" => ok_json!(crate::commands::forge_commands::list_forge_logins(
            arg(&args, "provider")?,
            arg(&args, "host")?,
            arg_opt(&args, "forceRefresh")?,
        )),
        "get_workspace_account_profile" => {
            ok_json!(
                crate::commands::forge_commands::get_workspace_account_profile(arg(
                    &args,
                    "workspaceId"
                )?,)
            )
        }
        "get_workspace_forge_action_status" => {
            ok_json!(
                crate::commands::forge_commands::get_workspace_forge_action_status(
                    arg(&args, "workspaceId")?,
                    app.clone(),
                    app.state::<crate::commands::forge_commands::ForgeAuthEdgeStore>(),
                )
            )
        }
        "get_workspace_forge_check_insert_text" => {
            ok_json!(
                crate::commands::forge_commands::get_workspace_forge_check_insert_text(
                    arg(&args, "workspaceId")?,
                    arg(&args, "itemId")?,
                )
            )
        }

        _ => Err(anyhow::anyhow!(
            "Remote web RPC command is not implemented: {command}"
        )),
    }
}

fn command_error(error: CommandError) -> anyhow::Error {
    let value = serde_json::to_value(&error).unwrap_or_default();
    let message = value
        .get("message")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| "Command failed".to_string());
    let code = value
        .get("code")
        .and_then(Value::as_str)
        .unwrap_or("Unknown");
    anyhow::anyhow!("{code}: {message}")
}

fn arg<T: DeserializeOwned>(args: &Value, key: &str) -> anyhow::Result<T> {
    let value = args
        .get(key)
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("Missing RPC argument `{key}`"))?;
    Ok(serde_json::from_value(value)?)
}

fn arg_opt<T: DeserializeOwned>(args: &Value, key: &str) -> anyhow::Result<Option<T>> {
    match args.get(key) {
        Some(Value::Null) | None => Ok(None),
        Some(value) => Ok(Some(serde_json::from_value(value.clone())?)),
    }
}

fn web_channel_id(args: &Value, key: &str) -> anyhow::Result<String> {
    args.get(key)
        .and_then(|value| value.get(WEB_CHANNEL_MARKER))
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| anyhow::anyhow!("Missing web channel argument `{key}`"))
}
