use anyhow::{bail, Context, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngExt as _;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedDevice {
    pub id: String,
    pub label: String,
    pub role: String,
    pub tool_policy: Option<String>,
    pub created_at: String,
    pub last_seen_at: Option<String>,
    pub revoked_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AuthenticatedDevice {
    pub id: String,
}

#[derive(Debug, Clone)]
pub struct CreatedPairing {
    pub device: PairedDevice,
    pub pat: String,
}

pub fn create_pairing(label: Option<&str>) -> Result<CreatedPairing> {
    let id = Uuid::new_v4().to_string();
    let pat = generate_pat();
    let pat_hash = hash_pat(&pat);
    let label = label
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("iPhone");
    let now = db::current_timestamp()?;
    let conn = db::write_conn()?;
    conn.execute(
        r#"
        INSERT INTO paired_devices (id, label, pat_hash, role, created_at)
        VALUES (?1, ?2, ?3, 'viewOnly', ?4)
        "#,
        params![id, label, pat_hash, now],
    )
    .context("Failed to create paired device")?;

    Ok(CreatedPairing {
        device: PairedDevice {
            id,
            label: label.to_string(),
            role: "viewOnly".to_string(),
            tool_policy: None,
            created_at: now,
            last_seen_at: None,
            revoked_at: None,
        },
        pat,
    })
}

pub fn list_devices() -> Result<Vec<PairedDevice>> {
    let conn = db::read_conn()?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, label, role, tool_policy, created_at, last_seen_at, revoked_at
            FROM paired_devices
            WHERE revoked_at IS NULL
            ORDER BY created_at DESC
            "#,
        )
        .context("Failed to prepare paired devices query")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(PairedDevice {
                id: row.get(0)?,
                label: row.get(1)?,
                role: row.get(2)?,
                tool_policy: row.get(3)?,
                created_at: row.get(4)?,
                last_seen_at: row.get(5)?,
                revoked_at: row.get(6)?,
            })
        })
        .context("Failed to query paired devices")?;

    rows.collect::<std::result::Result<Vec<_>, _>>()
        .context("Failed to read paired device row")
}

pub fn revoke_device(id: &str) -> Result<()> {
    let now = db::current_timestamp()?;
    let conn = db::write_conn()?;
    conn.execute(
        "UPDATE paired_devices SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL",
        params![id, now],
    )
    .with_context(|| format!("Failed to revoke paired device {id}"))?;
    Ok(())
}

pub fn authenticate_bearer(header: Option<&str>) -> Result<AuthenticatedDevice> {
    let Some(header) = header else {
        bail!("Missing Authorization header");
    };
    let Some(pat) = header.trim().strip_prefix("Bearer ") else {
        bail!("Authorization header must be a Bearer token");
    };
    authenticate_pat(pat)
}

pub fn authenticate_pat(pat: &str) -> Result<AuthenticatedDevice> {
    if !pat.starts_with("hlm_") {
        bail!("Invalid companion token");
    }
    let pat_hash = hash_pat(pat);
    let conn = db::write_conn()?;
    let row = conn
        .query_row(
            r#"
            SELECT id, pat_hash
            FROM paired_devices
            WHERE pat_hash = ?1 AND revoked_at IS NULL
            "#,
            [pat_hash.as_str()],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .context("Failed to authenticate companion token")?;
    let Some((id, expected_hash)) = row else {
        bail!("Device is not paired");
    };
    if !constant_time_eq(expected_hash.as_bytes(), pat_hash.as_bytes()) {
        bail!("Invalid companion token");
    }
    let now = db::current_timestamp()?;
    conn.execute(
        "UPDATE paired_devices SET last_seen_at = ?2 WHERE id = ?1",
        params![id, now],
    )
    .with_context(|| format!("Failed to update paired device last_seen_at for {id}"))?;
    Ok(AuthenticatedDevice { id })
}

fn generate_pat() -> String {
    let mut bytes = [0_u8; 32];
    rand::rng().fill(&mut bytes);
    format!("hlm_{}", URL_SAFE_NO_PAD.encode(bytes))
}

fn hash_pat(pat: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(pat.as_bytes()))
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right.iter())
        .fold(0_u8, |acc, (left, right)| acc | (left ^ right))
        == 0
}

#[cfg(test)]
mod tests {
    use super::{authenticate_pat, create_pairing, list_devices, revoke_device};
    use crate::testkit::TestEnv;

    #[test]
    fn created_pat_authenticates_until_revoked() {
        let _env = TestEnv::new("companion-paired-device-auth");
        let pairing = create_pairing(Some("Aidan iPhone")).unwrap();

        let principal = authenticate_pat(&pairing.pat).unwrap();
        assert_eq!(principal.id, pairing.device.id);
        assert_eq!(list_devices().unwrap().len(), 1);

        revoke_device(&pairing.device.id).unwrap();
        assert!(authenticate_pat(&pairing.pat).is_err());
        assert!(list_devices().unwrap().is_empty());
    }
}
