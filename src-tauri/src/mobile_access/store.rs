use anyhow::{bail, Context, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use russh::keys::{ssh_key::LineEnding, Algorithm, PrivateKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::models::{db, settings};

const IDENTITY_KEY: &str = "mobile_access.identity";
const HOST_KEY_KEY: &str = "mobile_access.host_key";
const PAIRING_KEY: &str = "mobile_access.current_pairing";
const DEVICES_KEY: &str = "mobile_access.devices";
const PAIRING_TTL_SECONDS: i64 = 300;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopIdentity {
    pub desktop_id: String,
    pub desktop_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MobilePairingPayload {
    pub protocol_version: u32,
    pub desktop_id: String,
    pub desktop_name: String,
    pub hosts: Vec<String>,
    pub port: u16,
    pub pairing_user: String,
    pub pairing_secret: String,
    pub host_key_fingerprint: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairingSession {
    id: String,
    secret_hash: String,
    expires_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    completed_device: Option<PairingCompletedDevice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairingCompletedDevice {
    device_id: String,
    device_secret: String,
    completed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedDevice {
    pub device_id: String,
    pub device_name: String,
    pub secret_hash: String,
    pub created_at: String,
    pub last_seen_at: Option<String>,
}

#[derive(Debug, Clone)]
pub enum AuthPrincipal {
    Pairing { pairing_id: String },
    Device { device_id: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairCompleteResult {
    pub desktop_id: String,
    pub desktop_name: String,
    pub device_id: String,
    pub device_secret: String,
}

pub fn desktop_identity() -> Result<DesktopIdentity> {
    if let Some(identity) = settings::load_setting_json::<DesktopIdentity>(IDENTITY_KEY)? {
        return Ok(identity);
    }

    let identity = DesktopIdentity {
        desktop_id: Uuid::new_v4().to_string(),
        desktop_name: std::env::var("HOSTNAME")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| {
                std::process::Command::new("hostname")
                    .output()
                    .ok()
                    .and_then(|output| String::from_utf8(output.stdout).ok())
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty())
            })
            .unwrap_or_else(|| "Helmor Desktop".to_string()),
    };
    settings::upsert_setting_json(IDENTITY_KEY, &identity)?;
    Ok(identity)
}

pub fn load_or_create_host_key() -> Result<PrivateKey> {
    if let Some(encoded) = settings::load_setting_value(HOST_KEY_KEY)? {
        let key = PrivateKey::from_openssh(encoded)
            .context("Failed to parse mobile access SSH host key")?;
        if matches!(key.algorithm(), Algorithm::Rsa { .. }) {
            return Ok(key);
        }
        tracing::info!(
            algorithm = %key.algorithm(),
            "Regenerating mobile access SSH host key for RSA-only mobile clients"
        );
    }

    let key = PrivateKey::random(&mut rand::rng(), Algorithm::Rsa { hash: None })
        .context("Failed to generate mobile access SSH host key")?;
    let encoded = key
        .to_openssh(LineEnding::LF)
        .context("Failed to encode mobile access SSH host key")?;
    settings::upsert_setting_value(HOST_KEY_KEY, encoded.as_str())?;
    Ok(key)
}

pub fn create_pairing(
    hosts: Vec<String>,
    port: u16,
    host_key_fingerprint: String,
) -> Result<MobilePairingPayload> {
    let identity = desktop_identity()?;
    let id = Uuid::new_v4().to_string();
    let secret = new_secret();
    let expires_at = timestamp_after(PAIRING_TTL_SECONDS)?;
    let session = PairingSession {
        id: id.clone(),
        secret_hash: hash_secret(&secret),
        expires_at: expires_at.clone(),
        completed_device: None,
    };
    settings::upsert_setting_json(PAIRING_KEY, &session)?;

    Ok(MobilePairingPayload {
        protocol_version: crate::mobile_rpc::PROTOCOL_VERSION,
        desktop_id: identity.desktop_id,
        desktop_name: identity.desktop_name,
        hosts,
        port,
        pairing_user: format!("pair:{id}"),
        pairing_secret: secret,
        host_key_fingerprint,
        expires_at,
    })
}

pub fn authenticate(user: &str, secret: &str) -> Result<AuthPrincipal> {
    if let Some(pairing_id) = user.strip_prefix("pair:") {
        let session = settings::load_setting_json::<PairingSession>(PAIRING_KEY)?
            .context("No active mobile pairing session")?;
        if session.id != pairing_id {
            bail!("Pairing session not found");
        }
        if is_expired(&session.expires_at)? {
            let _ = settings::delete_setting_value(PAIRING_KEY);
            bail!("Pairing session expired");
        }
        if !secret_matches(&session.secret_hash, secret) {
            bail!("Invalid pairing secret");
        }
        return Ok(AuthPrincipal::Pairing {
            pairing_id: pairing_id.to_string(),
        });
    }

    if let Some(device_id) = user.strip_prefix("device:") {
        let mut devices = load_devices()?;
        let Some(device) = devices
            .iter_mut()
            .find(|device| device.device_id == device_id)
        else {
            bail!("Device is not paired");
        };
        if !secret_matches(&device.secret_hash, secret) {
            bail!("Invalid device secret");
        }
        device.last_seen_at = Some(db::current_timestamp()?);
        save_devices(&devices)?;
        return Ok(AuthPrincipal::Device {
            device_id: device_id.to_string(),
        });
    }

    bail!("Unsupported mobile access user");
}

pub fn complete_pairing(principal: AuthPrincipal) -> Result<PairCompleteResult> {
    let AuthPrincipal::Pairing { pairing_id } = principal else {
        bail!("pair.complete requires a pairing session");
    };

    let mut session = settings::load_setting_json::<PairingSession>(PAIRING_KEY)?
        .context("No active mobile pairing session")?;
    if session.id != pairing_id {
        bail!("Pairing session not found");
    }
    if is_expired(&session.expires_at)? {
        let _ = settings::delete_setting_value(PAIRING_KEY);
        bail!("Pairing session expired");
    }

    let identity = desktop_identity()?;
    if let Some(completed) = reusable_completed_device(&session)? {
        return Ok(PairCompleteResult {
            desktop_id: identity.desktop_id,
            desktop_name: identity.desktop_name,
            device_id: completed.device_id,
            device_secret: completed.device_secret,
        });
    }

    let device_id = Uuid::new_v4().to_string();
    let device_secret = new_secret();
    let created_at = db::current_timestamp()?;
    let mut devices = load_devices()?;
    devices.push(PairedDevice {
        device_id: device_id.clone(),
        device_name: "iPhone".to_string(),
        secret_hash: hash_secret(&device_secret),
        created_at: created_at.clone(),
        last_seen_at: None,
    });
    save_devices(&devices)?;
    session.completed_device = Some(PairingCompletedDevice {
        device_id: device_id.clone(),
        device_secret: device_secret.clone(),
        completed_at: created_at,
    });
    settings::upsert_setting_json(PAIRING_KEY, &session)?;
    tracing::info!(device_id = %device_id, "Mobile pairing completed");

    Ok(PairCompleteResult {
        desktop_id: identity.desktop_id,
        desktop_name: identity.desktop_name,
        device_id,
        device_secret,
    })
}

fn reusable_completed_device(session: &PairingSession) -> Result<Option<PairingCompletedDevice>> {
    let Some(completed) = session.completed_device.clone() else {
        return Ok(None);
    };
    let devices = load_devices()?;
    let is_still_paired = devices.iter().any(|device| {
        device.device_id == completed.device_id
            && secret_matches(&device.secret_hash, &completed.device_secret)
    });
    Ok(is_still_paired.then_some(completed))
}

pub fn list_paired_devices() -> Result<Vec<PairedDevice>> {
    load_devices()
}

pub fn revoke_device(device_id: &str) -> Result<()> {
    let before = load_devices()?;
    let after: Vec<_> = before
        .into_iter()
        .filter(|device| device.device_id != device_id)
        .collect();
    save_devices(&after)
}

fn load_devices() -> Result<Vec<PairedDevice>> {
    Ok(settings::load_setting_json::<Vec<PairedDevice>>(DEVICES_KEY)?.unwrap_or_default())
}

fn save_devices(devices: &[PairedDevice]) -> Result<()> {
    settings::upsert_setting_json(DEVICES_KEY, &devices)
}

fn new_secret() -> String {
    URL_SAFE_NO_PAD.encode(format!("{}{}", Uuid::new_v4(), Uuid::new_v4()))
}

fn hash_secret(secret: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(secret.as_bytes()))
}

fn secret_matches(expected_hash: &str, candidate: &str) -> bool {
    let candidate_hash = hash_secret(candidate);
    if expected_hash.len() != candidate_hash.len() {
        return false;
    }
    expected_hash
        .as_bytes()
        .iter()
        .zip(candidate_hash.as_bytes())
        .fold(0u8, |acc, (left, right)| acc | (left ^ right))
        == 0
}

fn is_expired(expires_at: &str) -> Result<bool> {
    let expiry = chrono::DateTime::parse_from_rfc3339(expires_at)
        .with_context(|| format!("Invalid pairing expiry timestamp: {expires_at}"))?;
    Ok(chrono::Utc::now() > expiry.with_timezone(&chrono::Utc))
}

fn timestamp_after(seconds: i64) -> Result<String> {
    let now = chrono::Utc::now();
    Ok((now + chrono::Duration::seconds(seconds)).to_rfc3339())
}

#[cfg(test)]
mod tests {
    use super::{
        authenticate, complete_pairing, create_pairing, list_paired_devices, revoke_device,
    };
    use crate::testkit::TestEnv;

    #[test]
    fn complete_pairing_is_repeatable_for_visible_qr_until_expiry() {
        let _env = TestEnv::new("mobile-pairing-repeat");
        let payload = create_pairing(
            vec!["10.0.0.2".to_string()],
            63344,
            "SHA256:test".to_string(),
        )
        .unwrap();

        let first_principal = authenticate(&payload.pairing_user, &payload.pairing_secret).unwrap();
        let first = complete_pairing(first_principal).unwrap();
        let second_principal =
            authenticate(&payload.pairing_user, &payload.pairing_secret).unwrap();
        let second = complete_pairing(second_principal).unwrap();

        assert_eq!(first.desktop_id, second.desktop_id);
        assert_eq!(first.device_id, second.device_id);
        assert_eq!(first.device_secret, second.device_secret);
        assert_eq!(list_paired_devices().unwrap().len(), 1);
    }

    #[test]
    fn complete_pairing_recreates_device_when_previous_completion_was_revoked() {
        let _env = TestEnv::new("mobile-pairing-revoked-repeat");
        let payload = create_pairing(
            vec!["10.0.0.2".to_string()],
            63344,
            "SHA256:test".to_string(),
        )
        .unwrap();

        let first_principal = authenticate(&payload.pairing_user, &payload.pairing_secret).unwrap();
        let first = complete_pairing(first_principal).unwrap();
        revoke_device(&first.device_id).unwrap();

        let second_principal =
            authenticate(&payload.pairing_user, &payload.pairing_secret).unwrap();
        let second = complete_pairing(second_principal).unwrap();

        assert_ne!(first.device_id, second.device_id);
        assert_ne!(first.device_secret, second.device_secret);
        assert_eq!(list_paired_devices().unwrap().len(), 1);
    }
}
