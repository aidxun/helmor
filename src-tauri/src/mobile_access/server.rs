use std::{
    net::{Ipv4Addr, SocketAddr},
    sync::Arc,
    time::Duration,
};

use anyhow::{Context, Result};
use base64::Engine as _;
use russh::{
    keys::HashAlg,
    server::{Auth, Msg, Server as _, Session},
    Channel, ChannelId,
};
use tauri::async_runtime::Mutex;
use tokio::net::TcpListener;

use super::store::{self, AuthPrincipal};

#[derive(Default)]
struct RuntimeState {
    running: Option<RunningMobileServer>,
}

struct RunningMobileServer {
    port: u16,
    host_key_fingerprint: String,
    hosts: Vec<String>,
    handle: russh::server::RunningServerHandle,
}

pub struct MobileAccessManager {
    state: Mutex<RuntimeState>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileAccessStatus {
    pub running: bool,
    pub hosts: Vec<String>,
    pub port: Option<u16>,
    pub host_key_fingerprint: Option<String>,
    pub paired_devices: Vec<MobilePairedDevice>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobilePairedDevice {
    pub device_id: String,
    pub device_name: String,
    pub created_at: String,
    pub last_seen_at: Option<String>,
}

impl MobileAccessManager {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(RuntimeState::default()),
        }
    }

    pub async fn status(&self) -> Result<MobileAccessStatus> {
        let state = self.state.lock().await;
        let paired_devices = store::list_paired_devices()?
            .into_iter()
            .map(|device| MobilePairedDevice {
                device_id: device.device_id,
                device_name: device.device_name,
                created_at: device.created_at,
                last_seen_at: device.last_seen_at,
            })
            .collect();
        Ok(match &state.running {
            Some(server) => MobileAccessStatus {
                running: true,
                hosts: server.hosts.clone(),
                port: Some(server.port),
                host_key_fingerprint: Some(server.host_key_fingerprint.clone()),
                paired_devices,
            },
            None => MobileAccessStatus {
                running: false,
                hosts: Vec::new(),
                port: None,
                host_key_fingerprint: None,
                paired_devices,
            },
        })
    }

    pub async fn create_pairing(&self) -> Result<store::MobilePairingPayload> {
        let server = self.ensure_running().await?;
        tracing::info!(
            hosts = ?server.hosts,
            port = server.port,
            "Creating mobile access pairing"
        );
        store::create_pairing(server.hosts, server.port, server.host_key_fingerprint)
    }

    pub async fn stop(&self) {
        let mut state = self.state.lock().await;
        if let Some(server) = state.running.take() {
            server.handle.shutdown("Mobile access disabled".to_string());
        }
    }

    async fn ensure_running(&self) -> Result<RunningServerSnapshot> {
        let mut state = self.state.lock().await;
        if let Some(server) = state.running.as_mut() {
            let hosts = local_hosts();
            if hosts != server.hosts {
                tracing::info!(
                    old_hosts = ?server.hosts,
                    new_hosts = ?hosts,
                    "Mobile access host list refreshed"
                );
                server.hosts = hosts;
            }
            return Ok(server.snapshot());
        }

        let private_key = store::load_or_create_host_key()?;
        let host_key_fingerprint = private_key.fingerprint(HashAlg::Sha256).to_string();
        let config = russh::server::Config {
            inactivity_timeout: Some(Duration::from_secs(60)),
            auth_rejection_time: Duration::from_millis(250),
            auth_rejection_time_initial: Some(Duration::from_millis(0)),
            keys: vec![private_key],
            ..Default::default()
        };
        let config = Arc::new(config);
        let hosts = local_hosts();
        let (tx, rx) = tokio::sync::oneshot::channel();
        tauri::async_runtime::spawn(async move {
            let socket = match TcpListener::bind(("0.0.0.0", 0)).await {
                Ok(socket) => socket,
                Err(error) => {
                    let _ = tx.send(Err(anyhow::anyhow!(error)));
                    return;
                }
            };
            let port = match socket.local_addr() {
                Ok(addr) => addr.port(),
                Err(error) => {
                    let _ = tx.send(Err(anyhow::anyhow!(error)));
                    return;
                }
            };
            let mut server = MobileSshServer;
            let running = server.run_on_socket(config, &socket);
            let handle = running.handle();
            let _ = tx.send(Ok((port, handle)));
            if let Err(error) = running.await {
                tracing::warn!(error = %format!("{error:#?}"), "Mobile access SSH server stopped");
            }
        });
        let (port, handle) = rx
            .await
            .context("Mobile access SSH server failed to start")?
            .context("Failed to bind mobile access SSH server")?;
        tracing::info!(
            hosts = ?hosts,
            port,
            "Mobile access SSH server listening"
        );

        state.running = Some(RunningMobileServer {
            port,
            host_key_fingerprint,
            hosts,
            handle,
        });
        Ok(state
            .running
            .as_ref()
            .expect("server was just inserted")
            .snapshot())
    }
}

impl Default for MobileAccessManager {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
struct RunningServerSnapshot {
    port: u16,
    host_key_fingerprint: String,
    hosts: Vec<String>,
}

impl RunningMobileServer {
    fn snapshot(&self) -> RunningServerSnapshot {
        RunningServerSnapshot {
            port: self.port,
            host_key_fingerprint: self.host_key_fingerprint.clone(),
            hosts: self.hosts.clone(),
        }
    }
}

#[derive(Clone)]
struct MobileSshServer;

impl russh::server::Server for MobileSshServer {
    type Handler = MobileSshSession;

    fn new_client(&mut self, peer_addr: Option<SocketAddr>) -> Self::Handler {
        tracing::info!(peer = ?peer_addr, "Mobile SSH client connected");
        MobileSshSession { principal: None }
    }

    fn handle_session_error(&mut self, error: <Self::Handler as russh::server::Handler>::Error) {
        tracing::warn!(error = %format!("{error:#}"), "Mobile SSH session failed");
    }
}

struct MobileSshSession {
    principal: Option<AuthPrincipal>,
}

impl russh::server::Handler for MobileSshSession {
    type Error = russh::Error;

    async fn auth_password(
        &mut self,
        user: &str,
        password: &str,
    ) -> std::result::Result<Auth, Self::Error> {
        match store::authenticate(user, password) {
            Ok(principal) => {
                self.principal = Some(principal);
                tracing::info!(user, "Mobile SSH authentication accepted");
                Ok(Auth::Accept)
            }
            Err(error) => {
                tracing::warn!(user, error = %format!("{error:#}"), "Mobile SSH authentication rejected");
                Ok(Auth::reject())
            }
        }
    }

    async fn channel_open_session(
        &mut self,
        _channel: Channel<Msg>,
        _session: &mut Session,
    ) -> std::result::Result<bool, Self::Error> {
        Ok(true)
    }

    async fn shell_request(
        &mut self,
        channel: ChannelId,
        session: &mut Session,
    ) -> std::result::Result<(), Self::Error> {
        session.channel_failure(channel)?;
        Ok(())
    }

    async fn subsystem_request(
        &mut self,
        channel: ChannelId,
        _name: &str,
        session: &mut Session,
    ) -> std::result::Result<(), Self::Error> {
        session.channel_failure(channel)?;
        Ok(())
    }

    async fn exec_request(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        session: &mut Session,
    ) -> std::result::Result<(), Self::Error> {
        session.channel_success(channel)?;
        tracing::info!("Mobile SSH exec request received");
        let output = match self.principal.clone() {
            Some(principal) => dispatch_exec(data, principal),
            None => rpc_error("Session is not authenticated"),
        };
        session.data(channel, output.into_bytes())?;
        session.eof(channel)?;
        session.exit_status_request(channel, 0)?;
        session.close(channel)?;
        Ok(())
    }
}

fn dispatch_exec(data: &[u8], principal: AuthPrincipal) -> String {
    let command = String::from_utf8_lossy(data);
    let Some(encoded) = command.trim().strip_prefix("helmor-mobile-rpc ") else {
        return rpc_error("Unsupported mobile SSH command");
    };
    match base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(encoded.trim()) {
        Ok(bytes) => match String::from_utf8(bytes) {
            Ok(input) => crate::mobile_rpc::handle_rpc_json(&input, principal),
            Err(error) => rpc_error(&format!("RPC payload is not UTF-8: {error}")),
        },
        Err(error) => rpc_error(&format!("RPC payload is not base64url: {error}")),
    }
}

fn rpc_error(message: &str) -> String {
    serde_json::json!({
        "jsonrpc": "2.0",
        "error": {
            "code": -32603,
            "message": message,
        }
    })
    .to_string()
}

fn local_hosts() -> Vec<String> {
    let mut hosts = interface_ipv4_hosts();
    if hosts.is_empty() {
        hosts.extend(default_route_ipv4_host());
    }
    hosts.extend(local_hostnames());
    hosts.sort();
    hosts.dedup();
    if hosts.is_empty() {
        hosts.push("127.0.0.1".to_string());
    }
    hosts
}

#[cfg(unix)]
fn interface_ipv4_hosts() -> Vec<String> {
    let mut hosts = Vec::new();
    let mut addrs: *mut libc::ifaddrs = std::ptr::null_mut();

    // getifaddrs is the most reliable way to avoid VPN/default-route traps such as 198.18/15.
    unsafe {
        if libc::getifaddrs(&mut addrs) != 0 {
            return hosts;
        }

        let mut cursor = addrs;
        while !cursor.is_null() {
            let iface = &*cursor;
            let flags = iface.ifa_flags as libc::c_int;
            if !iface.ifa_addr.is_null()
                && flags & libc::IFF_UP != 0
                && flags & libc::IFF_LOOPBACK == 0
                && flags & libc::IFF_POINTOPOINT == 0
                && (*iface.ifa_addr).sa_family as libc::c_int == libc::AF_INET
            {
                let addr = &*(iface.ifa_addr as *const libc::sockaddr_in);
                let ip = Ipv4Addr::from(addr.sin_addr.s_addr.to_ne_bytes());
                if is_mobile_reachable_ipv4(ip) {
                    hosts.push(ip.to_string());
                }
            }
            cursor = iface.ifa_next;
        }

        libc::freeifaddrs(addrs);
        hosts
    }
}

#[cfg(not(unix))]
fn interface_ipv4_hosts() -> Vec<String> {
    Vec::new()
}

fn default_route_ipv4_host() -> Option<String> {
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                if let std::net::IpAddr::V4(ip) = addr.ip() {
                    if is_mobile_reachable_ipv4(ip) {
                        return Some(ip.to_string());
                    }
                }
            }
        }
    }
    None
}

fn local_hostnames() -> Vec<String> {
    let Some(hostname) = std::env::var("HOSTNAME")
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
    else {
        return Vec::new();
    };

    let hostname = hostname.trim_end_matches('.').to_string();
    let mut hosts = Vec::new();
    if hostname.ends_with(".local") {
        hosts.push(hostname);
    } else if !hostname.contains('.') {
        hosts.push(format!("{hostname}.local"));
    }
    hosts
}

fn is_mobile_reachable_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, c, d] = ip.octets();
    if a == 0
        || a == 127
        || a >= 224
        || (a == 169 && b == 254)
        || (a == 198 && matches!(b, 18 | 19))
        || (a == 100 && (64..=127).contains(&b))
        || (a == 192 && b == 0 && c == 2)
        || (a == 198 && b == 51 && c == 100)
        || (a == 203 && b == 0 && c == 113)
        || (a == 255 && b == 255 && c == 255 && d == 255)
    {
        return false;
    }

    ip.is_private()
}

#[cfg(test)]
mod tests {
    use super::is_mobile_reachable_ipv4;
    use std::net::Ipv4Addr;

    #[test]
    fn mobile_reachable_ipv4_accepts_private_lan_addresses() {
        assert!(is_mobile_reachable_ipv4(Ipv4Addr::new(10, 201, 184, 3)));
        assert!(is_mobile_reachable_ipv4(Ipv4Addr::new(172, 16, 0, 2)));
        assert!(is_mobile_reachable_ipv4(Ipv4Addr::new(192, 168, 1, 2)));
    }

    #[test]
    fn mobile_reachable_ipv4_rejects_loopback_and_virtual_ranges() {
        assert!(!is_mobile_reachable_ipv4(Ipv4Addr::new(127, 0, 0, 1)));
        assert!(!is_mobile_reachable_ipv4(Ipv4Addr::new(169, 254, 1, 1)));
        assert!(!is_mobile_reachable_ipv4(Ipv4Addr::new(198, 18, 0, 1)));
        assert!(!is_mobile_reachable_ipv4(Ipv4Addr::new(198, 19, 0, 1)));
    }
}
