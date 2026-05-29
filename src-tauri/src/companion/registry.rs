use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};

use super::config::{ActiveCompanionTunnel, CompanionProvider};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProvisionRequest {
    local_port: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProvisionResponse {
    id: String,
    hostname: String,
    tunnel_id: String,
    tunnel_token: String,
    secret: String,
}

pub async fn provision_helmor_managed(local_port: u16) -> Result<ActiveCompanionTunnel> {
    let base_url = std::env::var("HELMOR_COMPANION_API_URL")
        .unwrap_or_else(|_| "https://app.helmor.ai".to_string());
    let url = format!("{}/api/companion/tunnels", base_url.trim_end_matches('/'));
    let response = Client::new()
        .post(url)
        .json(&ProvisionRequest { local_port })
        .send()
        .await
        .context("Failed to request Helmor-managed companion tunnel")?;
    if !response.status().is_success() {
        anyhow::bail!(
            "Helmor-managed companion tunnel request failed with {}",
            response.status()
        );
    }
    let provisioned = response
        .json::<ProvisionResponse>()
        .await
        .context("Failed to parse Helmor-managed companion tunnel response")?;
    Ok(ActiveCompanionTunnel {
        provider: CompanionProvider::HelmorManaged,
        hostname: provisioned.hostname,
        tunnel_id: Some(provisioned.tunnel_id),
        tunnel_token: Some(provisioned.tunnel_token),
        registration_id: Some(provisioned.id),
        registration_secret: Some(provisioned.secret),
    })
}

pub async fn revoke_helmor_managed(tunnel: &ActiveCompanionTunnel) -> Result<()> {
    let (Some(id), Some(secret)) = (
        tunnel.registration_id.as_deref(),
        tunnel.registration_secret.as_deref(),
    ) else {
        return Ok(());
    };
    let base_url = std::env::var("HELMOR_COMPANION_API_URL")
        .unwrap_or_else(|_| "https://app.helmor.ai".to_string());
    let url = format!(
        "{}/api/companion/tunnels/{id}",
        base_url.trim_end_matches('/')
    );
    let response = Client::new()
        .delete(url)
        .bearer_auth(secret)
        .send()
        .await
        .context("Failed to revoke Helmor-managed companion tunnel")?;
    if !response.status().is_success() {
        anyhow::bail!(
            "Helmor-managed companion tunnel revoke failed with {}",
            response.status()
        );
    }
    Ok(())
}
