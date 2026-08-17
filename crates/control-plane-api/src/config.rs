use std::{env, net::SocketAddr, path::PathBuf};

use anyhow::{Context, Result};
use sha2::{Digest, Sha256};

#[derive(Clone)]
pub struct Config {
    pub bind: SocketAddr,
    pub database_url: String,
    pub admin_token_hash: [u8; 32],
    pub admin_actor: String,
    pub frontend_dist: PathBuf,
    pub virya_workspace_id: Option<uuid::Uuid>,
    pub virya_crowdrelay_url: String,
    pub virya_signal_url: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let bind = env::var("CONTROL_PLANE_BIND")
            .unwrap_or_else(|_| "127.0.0.1:8090".to_owned())
            .parse()
            .context("invalid CONTROL_PLANE_BIND")?;
        let database_url = env::var("DATABASE_URL").context("DATABASE_URL is required")?;
        let admin_token = env::var("CONTROL_PLANE_ADMIN_TOKEN")
            .context("CONTROL_PLANE_ADMIN_TOKEN is required")?;
        anyhow::ensure!(
            admin_token.len() >= 32,
            "CONTROL_PLANE_ADMIN_TOKEN must be at least 32 characters"
        );
        let admin_token_hash: [u8; 32] = Sha256::digest(admin_token.as_bytes()).into();

        Ok(Self {
            bind,
            database_url,
            admin_token_hash,
            admin_actor: env::var("CONTROL_PLANE_ADMIN_ACTOR")
                .unwrap_or_else(|_| "platform-admin".to_owned()),
            frontend_dist: env::var("CONTROL_PLANE_FRONTEND_DIST")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("frontend/dist")),
            virya_workspace_id: env::var("CONTROL_PLANE_VIRYA_WORKSPACE_ID")
                .ok()
                .map(|value| value.parse())
                .transpose()
                .context("invalid CONTROL_PLANE_VIRYA_WORKSPACE_ID")?,
            virya_crowdrelay_url: env::var("CONTROL_PLANE_VIRYA_CROWDRELAY_URL")
                .unwrap_or_else(|_| "https://signal-api.virya.music".to_owned()),
            virya_signal_url: env::var("CONTROL_PLANE_VIRYA_SIGNAL_URL")
                .unwrap_or_else(|_| "https://signal.virya.music".to_owned()),
        })
    }
}
