use anyhow::{Context, Result};
use serde::Serialize;
use tauri::async_runtime::Mutex;
use tokio::{net::TcpListener, sync::oneshot};

use super::{
    cloudflare::{self, ByoCloudflareConfig},
    config::{self, ActiveCompanionTunnel, CompanionProvider},
    registry, routes,
    tunnel::CloudflaredProcess,
};
use crate::{
    mobile_rpc,
    models::{paired_devices, settings},
};

#[derive(Default)]
struct RuntimeState {
    server: Option<RunningServer>,
    tunnel: Option<CloudflaredProcess>,
}

struct RunningServer {
    port: u16,
    shutdown: Option<oneshot::Sender<()>>,
}

pub struct CompanionManager {
    state: Mutex<RuntimeState>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionStatus {
    pub server_running: bool,
    pub server_port: Option<u16>,
    pub tunnel_running: bool,
    pub provider: CompanionProvider,
    pub active_tunnel_provider: Option<CompanionProvider>,
    pub hostname: Option<String>,
    pub byo_cloudflare_configured: bool,
    pub paired_devices: Vec<paired_devices::PairedDevice>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionPairingPayload {
    pub v: u32,
    pub host: String,
    pub pat: String,
    pub desktop_id: String,
    pub desktop_name: String,
    pub device_id: String,
    pub stable: bool,
}

impl CompanionManager {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(RuntimeState::default()),
        }
    }

    pub async fn status(&self) -> Result<CompanionStatus> {
        let state = self.state.lock().await;
        let active_tunnel = config::load_active_tunnel()?;
        Ok(CompanionStatus {
            server_running: state.server.is_some(),
            server_port: state.server.as_ref().map(|server| server.port),
            tunnel_running: state
                .tunnel
                .as_ref()
                .map(CloudflaredProcess::is_running)
                .unwrap_or(false),
            provider: config::load_provider()?,
            active_tunnel_provider: active_tunnel.as_ref().map(|tunnel| tunnel.provider),
            hostname: active_tunnel.as_ref().map(|tunnel| tunnel.hostname.clone()),
            byo_cloudflare_configured: config::load_byo_config()?.is_some(),
            paired_devices: paired_devices::list_devices()?,
        })
    }

    pub async fn enable(&self) -> Result<CompanionStatus> {
        let port = self.ensure_server().await?;
        if let Some(tunnel) = config::load_active_tunnel()? {
            self.sync_tunnel_origin(&tunnel, port).await?;
            self.start_cloudflared(&tunnel).await?;
        }
        self.status().await
    }

    pub async fn disable(&self) {
        let mut state = self.state.lock().await;
        if let Some(tunnel) = state.tunnel.take() {
            tunnel.stop();
        }
        if let Some(mut server) = state.server.take() {
            if let Some(shutdown) = server.shutdown.take() {
                let _ = shutdown.send(());
            }
        }
    }

    pub async fn create_pairing(&self) -> Result<CompanionPairingPayload> {
        let _ = self.ensure_server().await?;
        let tunnel = config::load_active_tunnel()?
            .context("Allocate a Cloudflare hostname before pairing")?;
        let identity = mobile_rpc::initialize_result()?;
        let pairing = paired_devices::create_pairing(Some("iPhone"))?;
        Ok(CompanionPairingPayload {
            v: 1,
            host: tunnel.hostname,
            pat: pairing.pat,
            desktop_id: identity.desktop_id,
            desktop_name: identity.desktop_name,
            device_id: pairing.device.id,
            stable: true,
        })
    }

    pub async fn revoke_device(&self, device_id: &str) -> Result<()> {
        paired_devices::revoke_device(device_id)?;
        notify_paired_devices_changed();
        Ok(())
    }

    pub async fn forget_tunnel(&self) -> Result<CompanionStatus> {
        let active_tunnel = config::load_active_tunnel()?;
        {
            let mut state = self.state.lock().await;
            if let Some(tunnel) = state.tunnel.take() {
                tunnel.stop();
            }
        }
        if let Some(tunnel) = active_tunnel.as_ref() {
            if tunnel.provider == CompanionProvider::HelmorManaged {
                registry::revoke_helmor_managed(tunnel).await?;
            }
        }
        config::clear_active_tunnel()?;
        self.status().await
    }

    pub async fn save_byo_cloudflare_config(&self, byo_config: ByoCloudflareConfig) -> Result<()> {
        byo_config.validate()?;
        config::save_provider(CompanionProvider::BringYourOwnCloudflare)?;
        config::save_byo_config(&byo_config)
    }

    pub async fn validate_byo_cloudflare_config(
        &self,
        byo_config: ByoCloudflareConfig,
    ) -> Result<()> {
        byo_config.validate()
    }

    pub async fn provision_byo_cloudflare(
        &self,
        byo_config: ByoCloudflareConfig,
    ) -> Result<CompanionStatus> {
        let port = self.ensure_server().await?;
        let (byo_config, active_tunnel) =
            cloudflare::provision_byo_cloudflare(byo_config, port).await?;
        config::save_provider(CompanionProvider::BringYourOwnCloudflare)?;
        config::save_byo_config(&byo_config)?;
        config::save_active_tunnel(&active_tunnel)?;
        self.start_cloudflared(&active_tunnel).await?;
        self.status().await
    }

    pub async fn provision_helmor_managed(&self) -> Result<CompanionStatus> {
        let port = self.ensure_server().await?;
        let active_tunnel = registry::provision_helmor_managed(port).await?;
        config::save_provider(CompanionProvider::HelmorManaged)?;
        config::save_active_tunnel(&active_tunnel)?;
        self.start_cloudflared(&active_tunnel).await?;
        self.status().await
    }

    async fn ensure_server(&self) -> Result<u16> {
        let mut state = self.state.lock().await;
        if let Some(server) = state.server.as_ref() {
            return Ok(server.port);
        }

        let listener = TcpListener::bind(("127.0.0.1", 0))
            .await
            .context("Failed to bind companion server")?;
        let port = listener
            .local_addr()
            .context("Failed to read companion server address")?
            .port();
        let (tx, rx) = oneshot::channel::<()>();
        tauri::async_runtime::spawn(async move {
            let shutdown = async {
                let _ = rx.await;
            };
            if let Err(error) = axum::serve(listener, routes::router())
                .with_graceful_shutdown(shutdown)
                .await
            {
                tracing::warn!(error = %format!("{error:#}"), "Companion server stopped");
            }
        });
        state.server = Some(RunningServer {
            port,
            shutdown: Some(tx),
        });
        Ok(port)
    }

    async fn sync_tunnel_origin(&self, tunnel: &ActiveCompanionTunnel, port: u16) -> Result<()> {
        match tunnel.provider {
            CompanionProvider::BringYourOwnCloudflare => {
                let Some(config) = config::load_byo_config()? else {
                    anyhow::bail!("BYO Cloudflare configuration is missing");
                };
                let Some(tunnel_id) = tunnel.tunnel_id.as_deref() else {
                    anyhow::bail!("BYO Cloudflare tunnel ID is missing");
                };
                cloudflare::update_byo_cloudflare_origin(&config, tunnel_id, port).await?;
            }
            CompanionProvider::HelmorManaged => {}
        }
        Ok(())
    }

    async fn start_cloudflared(&self, tunnel: &ActiveCompanionTunnel) -> Result<()> {
        let Some(token) = tunnel.tunnel_token.as_deref() else {
            return Ok(());
        };
        let mut state = self.state.lock().await;
        if state
            .tunnel
            .as_ref()
            .map(CloudflaredProcess::is_running)
            .unwrap_or(false)
        {
            return Ok(());
        }
        state.tunnel = Some(CloudflaredProcess::start(token)?);
        Ok(())
    }
}

impl Default for CompanionManager {
    fn default() -> Self {
        Self::new()
    }
}

fn notify_paired_devices_changed() {
    let _ =
        crate::ui_sync::notify_running_app(crate::ui_sync::UiMutationEvent::PairedDevicesChanged);
}

#[allow(dead_code)]
fn load_setting_value(key: &str) -> Result<Option<String>> {
    settings::load_setting_value(key)
}
