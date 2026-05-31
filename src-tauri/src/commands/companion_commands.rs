use tauri::{AppHandle, State};

use crate::companion::{
    ByoCloudflareConfig, CompanionManager, CompanionPairingPayload, CompanionStatus,
};

use super::common::CmdResult;

#[tauri::command]
pub async fn companion_get_status(
    manager: State<'_, CompanionManager>,
) -> CmdResult<CompanionStatus> {
    Ok(manager.status().await?)
}

#[tauri::command]
pub async fn companion_enable(
    app: AppHandle,
    manager: State<'_, CompanionManager>,
) -> CmdResult<CompanionStatus> {
    Ok(manager.enable(&app).await?)
}

#[tauri::command]
pub async fn companion_disable(manager: State<'_, CompanionManager>) -> CmdResult<()> {
    manager.disable().await;
    Ok(())
}

#[tauri::command]
pub async fn companion_create_pairing(
    app: AppHandle,
    manager: State<'_, CompanionManager>,
) -> CmdResult<CompanionPairingPayload> {
    Ok(manager.create_pairing(&app).await?)
}

#[tauri::command]
pub async fn companion_revoke_device(
    manager: State<'_, CompanionManager>,
    device_id: String,
) -> CmdResult<()> {
    manager.revoke_device(&device_id).await?;
    Ok(())
}

#[tauri::command]
pub async fn companion_forget_tunnel(
    manager: State<'_, CompanionManager>,
) -> CmdResult<CompanionStatus> {
    Ok(manager.forget_tunnel().await?)
}

#[tauri::command]
pub async fn companion_save_byo_cloudflare_config(
    manager: State<'_, CompanionManager>,
    config: ByoCloudflareConfig,
) -> CmdResult<()> {
    manager.save_byo_cloudflare_config(config).await?;
    Ok(())
}

#[tauri::command]
pub async fn companion_validate_byo_cloudflare_config(
    manager: State<'_, CompanionManager>,
    config: ByoCloudflareConfig,
) -> CmdResult<()> {
    manager.validate_byo_cloudflare_config(config).await?;
    Ok(())
}

#[tauri::command]
pub async fn companion_provision_byo_cloudflare(
    app: AppHandle,
    manager: State<'_, CompanionManager>,
    config: ByoCloudflareConfig,
) -> CmdResult<CompanionStatus> {
    Ok(manager.provision_byo_cloudflare(&app, config).await?)
}

#[tauri::command]
pub async fn companion_provision_helmor_managed(
    app: AppHandle,
    manager: State<'_, CompanionManager>,
) -> CmdResult<CompanionStatus> {
    Ok(manager.provision_helmor_managed(&app).await?)
}
