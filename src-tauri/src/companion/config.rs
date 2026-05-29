use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::models::settings;

const PROVIDER_KEY: &str = "companion.provider";
const BYO_CLOUDFLARE_KEY: &str = "companion.byo_cloudflare_config";
const ACTIVE_TUNNEL_KEY: &str = "companion.active_tunnel";

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CompanionProvider {
    #[default]
    HelmorManaged,
    BringYourOwnCloudflare,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveCompanionTunnel {
    pub provider: CompanionProvider,
    pub hostname: String,
    pub tunnel_id: Option<String>,
    pub tunnel_token: Option<String>,
    #[serde(default)]
    pub registration_id: Option<String>,
    #[serde(default)]
    pub registration_secret: Option<String>,
}

pub fn load_provider() -> Result<CompanionProvider> {
    Ok(settings::load_setting_json::<CompanionProvider>(PROVIDER_KEY)?.unwrap_or_default())
}

pub fn save_provider(provider: CompanionProvider) -> Result<()> {
    settings::upsert_setting_json(PROVIDER_KEY, &provider)
}

pub fn load_byo_config() -> Result<Option<super::cloudflare::ByoCloudflareConfig>> {
    settings::load_setting_json(BYO_CLOUDFLARE_KEY)
}

pub fn save_byo_config(config: &super::cloudflare::ByoCloudflareConfig) -> Result<()> {
    settings::upsert_setting_json(BYO_CLOUDFLARE_KEY, config)
}

pub fn load_active_tunnel() -> Result<Option<ActiveCompanionTunnel>> {
    settings::load_setting_json(ACTIVE_TUNNEL_KEY)
}

pub fn save_active_tunnel(tunnel: &ActiveCompanionTunnel) -> Result<()> {
    if tunnel.hostname.trim().is_empty() {
        anyhow::bail!("Companion hostname is required");
    }
    settings::upsert_setting_json(ACTIVE_TUNNEL_KEY, tunnel)
        .context("Failed to save active companion tunnel")
}

pub fn clear_active_tunnel() -> Result<()> {
    settings::delete_setting_value(ACTIVE_TUNNEL_KEY)
}
