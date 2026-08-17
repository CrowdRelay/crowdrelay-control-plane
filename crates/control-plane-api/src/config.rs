use std::{env, net::SocketAddr, path::PathBuf};

use anyhow::{Context, Result};
use sha2::{Digest, Sha256};

const DEFAULT_RUNTIME_STALE_AFTER_SECONDS: i64 = 180;

#[derive(Clone)]
pub struct Config {
    pub bind: SocketAddr,
    pub database_url: String,
    pub admin_token_hash: [u8; 32],
    pub telemetry_token_hash: [u8; 32],
    pub admin_actor: String,
    pub telemetry_actor: String,
    pub runtime_stale_after_seconds: i64,
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
        let admin_token = required_secret("CONTROL_PLANE_ADMIN_TOKEN")?;
        let telemetry_token = required_secret("CONTROL_PLANE_TELEMETRY_TOKEN")?;
        anyhow::ensure!(
            admin_token != telemetry_token,
            "CONTROL_PLANE_ADMIN_TOKEN and CONTROL_PLANE_TELEMETRY_TOKEN must be different"
        );
        let runtime_stale_after_seconds = env::var("CONTROL_PLANE_RUNTIME_STALE_AFTER_SECONDS")
            .ok()
            .map(|value| value.parse::<i64>())
            .transpose()
            .context("invalid CONTROL_PLANE_RUNTIME_STALE_AFTER_SECONDS")?
            .unwrap_or(DEFAULT_RUNTIME_STALE_AFTER_SECONDS);
        anyhow::ensure!(
            (30..=86_400).contains(&runtime_stale_after_seconds),
            "CONTROL_PLANE_RUNTIME_STALE_AFTER_SECONDS must be between 30 and 86400"
        );

        Ok(Self {
            bind,
            database_url,
            admin_token_hash: Sha256::digest(admin_token.as_bytes()).into(),
            telemetry_token_hash: Sha256::digest(telemetry_token.as_bytes()).into(),
            admin_actor: env::var("CONTROL_PLANE_ADMIN_ACTOR")
                .unwrap_or_else(|_| "platform-admin".to_owned()),
            telemetry_actor: env::var("CONTROL_PLANE_TELEMETRY_ACTOR")
                .unwrap_or_else(|_| "runtime-reporter".to_owned()),
            runtime_stale_after_seconds,
            frontend_dist: env::var("CONTROL_PLANE_FRONTEND_DIST")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("frontend/dist")),
            virya_workspace_id: env::var("CONTROL_PLANE_VIRYA_WORKSPACE_ID")
                .ok()
                .filter(|value| !value.trim().is_empty())
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

fn required_secret(name: &str) -> Result<String> {
    let value = env::var(name).with_context(|| format!("{name} is required"))?;
    anyhow::ensure!(value.len() >= 32, "{name} must be at least 32 characters");
    anyhow::ensure!(
        value == value.trim() && !value.chars().any(char::is_whitespace),
        "{name} must not contain whitespace"
    );
    Ok(value)
}
