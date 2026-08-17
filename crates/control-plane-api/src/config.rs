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
    pub provisioner_token_hash: Option<[u8; 32]>,
    pub admin_actor: String,
    pub telemetry_actor: String,
    pub provisioner_actor: String,
    pub provisioner_default_image_tag: Option<String>,
    pub provisioner_api_image: String,
    pub provisioner_worker_image: String,
    pub provisioner_lease_seconds: i64,
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
        let provisioner_token = optional_secret("CONTROL_PLANE_PROVISIONER_TOKEN")?;
        anyhow::ensure!(
            admin_token != telemetry_token,
            "CONTROL_PLANE_ADMIN_TOKEN and CONTROL_PLANE_TELEMETRY_TOKEN must be different"
        );
        if let Some(token) = provisioner_token.as_deref() {
            anyhow::ensure!(
                token != admin_token && token != telemetry_token,
                "CONTROL_PLANE_PROVISIONER_TOKEN must differ from admin and telemetry tokens"
            );
        }
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

        let provisioner_default_image_tag = env::var("CONTROL_PLANE_PROVISIONER_DEFAULT_IMAGE_TAG")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .map(|value| validate_image_tag(&value))
            .transpose()?;
        let provisioner_api_image = validate_image_repository(
            "CONTROL_PLANE_PROVISIONER_API_IMAGE",
            &env::var("CONTROL_PLANE_PROVISIONER_API_IMAGE")
                .unwrap_or_else(|_| "ghcr.io/wojciechbator/crowdrelay-api".to_owned()),
        )?;
        let provisioner_worker_image = validate_image_repository(
            "CONTROL_PLANE_PROVISIONER_WORKER_IMAGE",
            &env::var("CONTROL_PLANE_PROVISIONER_WORKER_IMAGE")
                .unwrap_or_else(|_| "ghcr.io/wojciechbator/crowdrelay-worker".to_owned()),
        )?;
        let provisioner_lease_seconds = env::var("CONTROL_PLANE_PROVISIONER_LEASE_SECONDS")
            .ok()
            .map(|value| value.parse::<i64>())
            .transpose()
            .context("invalid CONTROL_PLANE_PROVISIONER_LEASE_SECONDS")?
            .unwrap_or(900);
        anyhow::ensure!(
            (60..=3600).contains(&provisioner_lease_seconds),
            "CONTROL_PLANE_PROVISIONER_LEASE_SECONDS must be between 60 and 3600"
        );

        Ok(Self {
            bind,
            database_url,
            admin_token_hash: Sha256::digest(admin_token.as_bytes()).into(),
            telemetry_token_hash: Sha256::digest(telemetry_token.as_bytes()).into(),
            provisioner_token_hash: provisioner_token
                .as_deref()
                .map(|token| Sha256::digest(token.as_bytes()).into()),
            admin_actor: env::var("CONTROL_PLANE_ADMIN_ACTOR")
                .unwrap_or_else(|_| "platform-admin".to_owned()),
            telemetry_actor: env::var("CONTROL_PLANE_TELEMETRY_ACTOR")
                .unwrap_or_else(|_| "runtime-reporter".to_owned()),
            provisioner_actor: env::var("CONTROL_PLANE_PROVISIONER_ACTOR")
                .unwrap_or_else(|_| "tenant-provisioner".to_owned()),
            provisioner_default_image_tag,
            provisioner_api_image,
            provisioner_worker_image,
            provisioner_lease_seconds,
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

fn optional_secret(name: &str) -> Result<Option<String>> {
    env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(|value| {
            anyhow::ensure!(value.len() >= 32, "{name} must be at least 32 characters");
            anyhow::ensure!(
                value == value.trim() && !value.chars().any(char::is_whitespace),
                "{name} must not contain whitespace"
            );
            Ok(value)
        })
        .transpose()
}

fn validate_image_tag(value: &str) -> Result<String> {
    let value = value.trim();
    let sha = value.strip_prefix("sha-").unwrap_or(value);
    anyhow::ensure!(
        sha.len() == 40
            && sha
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()),
        "CONTROL_PLANE_PROVISIONER_DEFAULT_IMAGE_TAG must be sha-<40 lowercase hex> or 40 lowercase hex"
    );
    Ok(format!("sha-{sha}"))
}

fn validate_image_repository(name: &str, value: &str) -> Result<String> {
    let value = value.trim();
    anyhow::ensure!(
        (3..=200).contains(&value.len())
            && !value.starts_with('/')
            && !value.starts_with('.')
            && !value.ends_with('/')
            && !value.contains("//")
            && value
                .split('/')
                .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
            && value.bytes().all(|byte| {
                byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'/' | b'_' | b'-')
            }),
        "{name} must be an untagged safe image repository such as ghcr.io/org/image"
    );
    Ok(value.to_owned())
}
