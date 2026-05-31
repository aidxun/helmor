use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::config::{ActiveCompanionTunnel, CompanionProvider};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ByoCloudflareConfig {
    pub account_id: String,
    pub zone_id: String,
    pub api_token: String,
    pub hostname: String,
    #[serde(default)]
    pub tunnel_id: Option<String>,
    #[serde(default)]
    pub tunnel_name: Option<String>,
    #[serde(default)]
    pub tunnel_token: Option<String>,
}

impl ByoCloudflareConfig {
    pub fn validate(&self) -> Result<()> {
        require("Cloudflare account ID", &self.account_id)?;
        require("Cloudflare zone ID", &self.zone_id)?;
        require("Cloudflare API token", &self.api_token)?;
        require("Companion hostname", &self.hostname)?;
        if self.hostname.contains("://") || self.hostname.contains('/') {
            anyhow::bail!("Companion hostname must be a hostname, not a URL");
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
struct CloudflareEnvelope<T> {
    success: bool,
    result: Option<T>,
    #[serde(default)]
    errors: Vec<CloudflareMessage>,
}

#[derive(Debug, Deserialize)]
struct CloudflareMessage {
    #[serde(default)]
    message: String,
}

#[derive(Debug, Deserialize)]
struct CreateTunnelResult {
    id: String,
    #[serde(default)]
    name: Option<String>,
    token: String,
}

#[derive(Debug, Deserialize)]
struct DnsRecordResult {
    id: String,
}

pub async fn provision_byo_cloudflare(
    mut config: ByoCloudflareConfig,
    local_port: u16,
) -> Result<(ByoCloudflareConfig, ActiveCompanionTunnel)> {
    config.validate()?;
    let client = Client::new();
    let tunnel_name = config
        .tunnel_name
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("helmor-{}", Uuid::new_v4()));
    let tunnel = create_tunnel(&client, &config, &tunnel_name).await?;
    put_tunnel_config(&client, &config, &tunnel.id, local_port).await?;
    create_dns_record(&client, &config, &tunnel.id).await?;

    config.tunnel_id = Some(tunnel.id.clone());
    config.tunnel_name = tunnel.name.or(Some(tunnel_name));
    config.tunnel_token = Some(tunnel.token.clone());

    let active = ActiveCompanionTunnel {
        provider: CompanionProvider::BringYourOwnCloudflare,
        hostname: config.hostname.clone(),
        tunnel_id: Some(tunnel.id),
        tunnel_token: Some(tunnel.token),
        registration_id: None,
        registration_secret: None,
    };
    Ok((config, active))
}

pub async fn update_byo_cloudflare_origin(
    config: &ByoCloudflareConfig,
    tunnel_id: &str,
    local_port: u16,
) -> Result<()> {
    config.validate()?;
    put_tunnel_config(&Client::new(), config, tunnel_id, local_port).await
}

async fn create_tunnel(
    client: &Client,
    config: &ByoCloudflareConfig,
    tunnel_name: &str,
) -> Result<CreateTunnelResult> {
    let url = format!(
        "https://api.cloudflare.com/client/v4/accounts/{}/cfd_tunnel",
        config.account_id
    );
    let body = serde_json::json!({
        "name": tunnel_name,
        "config_src": "cloudflare",
    });
    let envelope = client
        .post(url)
        .bearer_auth(&config.api_token)
        .json(&body)
        .send()
        .await
        .context("Failed to create Cloudflare tunnel")?
        .json::<CloudflareEnvelope<CreateTunnelResult>>()
        .await
        .context("Failed to parse Cloudflare tunnel create response")?;
    unwrap_cloudflare(envelope, "create Cloudflare tunnel")
}

async fn put_tunnel_config(
    client: &Client,
    config: &ByoCloudflareConfig,
    tunnel_id: &str,
    local_port: u16,
) -> Result<()> {
    let url = format!(
        "https://api.cloudflare.com/client/v4/accounts/{}/cfd_tunnel/{}/configurations",
        config.account_id, tunnel_id
    );
    let service = format!("http://localhost:{local_port}");
    let body = serde_json::json!({
        "config": {
            "ingress": [
                {
                    "hostname": config.hostname,
                    "service": service,
                    "originRequest": {}
                },
                {
                    "service": "http_status:404"
                }
            ]
        }
    });
    let envelope = client
        .put(url)
        .bearer_auth(&config.api_token)
        .json(&body)
        .send()
        .await
        .context("Failed to update Cloudflare tunnel configuration")?
        .json::<CloudflareEnvelope<serde_json::Value>>()
        .await
        .context("Failed to parse Cloudflare tunnel configuration response")?;
    let _ = unwrap_cloudflare(envelope, "update Cloudflare tunnel configuration")?;
    Ok(())
}

async fn create_dns_record(
    client: &Client,
    config: &ByoCloudflareConfig,
    tunnel_id: &str,
) -> Result<()> {
    if let Some(record) = find_dns_record(client, config).await? {
        update_dns_record(client, config, &record.id, tunnel_id).await?;
        return Ok(());
    }

    let url = format!(
        "https://api.cloudflare.com/client/v4/zones/{}/dns_records",
        config.zone_id
    );
    let envelope = client
        .post(url)
        .bearer_auth(&config.api_token)
        .json(&dns_record_body(config, tunnel_id))
        .send()
        .await
        .context("Failed to create Cloudflare DNS record")?
        .json::<CloudflareEnvelope<serde_json::Value>>()
        .await
        .context("Failed to parse Cloudflare DNS response")?;
    let _ = unwrap_cloudflare(envelope, "create Cloudflare DNS record")?;
    Ok(())
}

async fn find_dns_record(
    client: &Client,
    config: &ByoCloudflareConfig,
) -> Result<Option<DnsRecordResult>> {
    let url = format!(
        "https://api.cloudflare.com/client/v4/zones/{}/dns_records",
        config.zone_id
    );
    let envelope = client
        .get(url)
        .bearer_auth(&config.api_token)
        .query(&[("name", config.hostname.as_str()), ("per_page", "1")])
        .send()
        .await
        .context("Failed to query Cloudflare DNS records")?
        .json::<CloudflareEnvelope<Vec<DnsRecordResult>>>()
        .await
        .context("Failed to parse Cloudflare DNS query response")?;
    let records = unwrap_cloudflare(envelope, "query Cloudflare DNS records")?;
    Ok(records.into_iter().next())
}

async fn update_dns_record(
    client: &Client,
    config: &ByoCloudflareConfig,
    dns_record_id: &str,
    tunnel_id: &str,
) -> Result<()> {
    let url = format!(
        "https://api.cloudflare.com/client/v4/zones/{}/dns_records/{}",
        config.zone_id, dns_record_id
    );
    let envelope = client
        .patch(url)
        .bearer_auth(&config.api_token)
        .json(&dns_record_body(config, tunnel_id))
        .send()
        .await
        .context("Failed to update Cloudflare DNS record")?
        .json::<CloudflareEnvelope<serde_json::Value>>()
        .await
        .context("Failed to parse Cloudflare DNS update response")?;
    let _ = unwrap_cloudflare(envelope, "update Cloudflare DNS record")?;
    Ok(())
}

fn dns_record_body(config: &ByoCloudflareConfig, tunnel_id: &str) -> serde_json::Value {
    serde_json::json!({
        "type": "CNAME",
        "proxied": true,
        "name": config.hostname,
        "content": format!("{tunnel_id}.cfargotunnel.com"),
    })
}

fn unwrap_cloudflare<T>(envelope: CloudflareEnvelope<T>, action: &str) -> Result<T> {
    if envelope.success {
        return envelope
            .result
            .with_context(|| format!("Cloudflare {action} response had no result"));
    }
    let message = envelope
        .errors
        .into_iter()
        .map(|error| error.message)
        .filter(|message| !message.trim().is_empty())
        .collect::<Vec<_>>()
        .join("; ");
    anyhow::bail!(
        "Cloudflare failed to {action}: {}",
        if message.is_empty() {
            "unknown error"
        } else {
            message.as_str()
        }
    )
}

fn require(label: &str, value: &str) -> Result<()> {
    if value.trim().is_empty() {
        anyhow::bail!("{label} is required");
    }
    Ok(())
}
