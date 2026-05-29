use std::{
    process::{Child, Command, Stdio},
    sync::Mutex,
};

use anyhow::{Context, Result};

pub struct CloudflaredProcess {
    child: Mutex<Option<Child>>,
}

impl CloudflaredProcess {
    pub fn start(token: &str) -> Result<Self> {
        if token.trim().is_empty() {
            anyhow::bail!("Cloudflare tunnel token is required");
        }
        let child = Command::new("cloudflared")
            .args(["tunnel", "--no-autoupdate", "run", "--token", token])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .context("Failed to start cloudflared. Install cloudflared or configure Helmor's bundled binary first.")?;
        Ok(Self {
            child: Mutex::new(Some(child)),
        })
    }

    pub fn stop(&self) {
        let Ok(mut guard) = self.child.lock() else {
            return;
        };
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    pub fn is_running(&self) -> bool {
        let Ok(mut guard) = self.child.lock() else {
            return false;
        };
        let Some(child) = guard.as_mut() else {
            return false;
        };
        match child.try_wait() {
            Ok(Some(_)) => {
                *guard = None;
                false
            }
            Ok(None) => true,
            Err(_) => false,
        }
    }
}

impl Drop for CloudflaredProcess {
    fn drop(&mut self) {
        self.stop();
    }
}
