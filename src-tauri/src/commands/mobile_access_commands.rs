use tauri::State;

use crate::mobile_access::{self, MobileAccessManager};

use super::common::CmdResult;

#[tauri::command]
pub async fn get_mobile_access_status(
    manager: State<'_, MobileAccessManager>,
) -> CmdResult<mobile_access::MobileAccessStatus> {
    Ok(manager.status().await?)
}

#[tauri::command]
pub async fn create_mobile_pairing(
    manager: State<'_, MobileAccessManager>,
) -> CmdResult<mobile_access::MobilePairingPayload> {
    Ok(manager.create_pairing().await?)
}

#[tauri::command]
pub async fn stop_mobile_access_server(manager: State<'_, MobileAccessManager>) -> CmdResult<()> {
    manager.stop().await;
    Ok(())
}

#[tauri::command]
pub async fn revoke_mobile_device(device_id: String) -> CmdResult<()> {
    mobile_access::revoke_device(&device_id)?;
    Ok(())
}
