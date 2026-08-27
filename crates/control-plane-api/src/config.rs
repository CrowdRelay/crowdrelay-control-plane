use std::{
    env::{self, VarError},
    net::SocketAddr,
    path::PathBuf,
};

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
    pub automation_token_hash: Option<[u8; 32]>,
    pub area_management_master_key: Option<String>,
    pub management_master_key: Option<String>,
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
    pub virya_management_url: Option<String>,
    /// Session cookie Secure flag. Off only for plain-HTTP local development.
    pub cookie_secure: bool,
    /// Optional webhook relay used to hand email notifications to the
    /// platform's mailer; without it email_relay channels cannot deliver.
    pub notify_email_relay_url: Option<String>,
    /// Optional agent service URL for the LLM agent panel. If not set, the
    /// agent panel is disabled.
    pub agent_service_url: Option<String>,
    /// Panel login goes through database accounts. This optional pair seeds
    /// (and keeps authoritative) one platform_admin row so operators can sign
    /// in to the styled form without manual SQL. Both or neither.
    pub bootstrap_admin_username: Option<String>,
    pub bootstrap_admin_password: Option<String>,
    /// n8n base URL for retry calls (e.g. https://n8n.virya.music). Without
    /// it the retry button is disabled in the UI.
    pub n8n_base_url: Option<String>,
    /// n8n REST API key for retry calls. Paired with n8n_base_url.
    pub n8n_api_key: Option<String>,
    /// Discord webhook URL for forwarding real-work automation events.
    /// Without it, no automation event reaches Discord — the UI is the only
    /// surface.
    pub discord_automation_webhook_url: Option<String>,
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
        let automation_token = optional_secret("CONTROL_PLANE_AUTOMATION_TOKEN")?;
        let area_management_master_key =
            optional_secret("CONTROL_PLANE_AREA_MANAGEMENT_MASTER_KEY")?;
        let management_master_key = optional_secret("CONTROL_PLANE_MANAGEMENT_MASTER_KEY")?;
        let virya_management_url = optional_env("CONTROL_PLANE_VIRYA_MANAGEMENT_URL")?;

        anyhow::ensure!(
            admin_token != telemetry_token,
            "CONTROL_PLANE_ADMIN_TOKEN and CONTROL_PLANE_TELEMETRY_TOKEN must be different"
        );
        if let Some(token) = area_management_master_key.as_deref() {
            anyhow::ensure!(
                token != admin_token && token != telemetry_token,
                "CONTROL_PLANE_AREA_MANAGEMENT_MASTER_KEY must differ from admin and telemetry tokens"
            );
            if let Some(provisioner) = provisioner_token.as_deref() {
                anyhow::ensure!(
                    token != provisioner,
                    "CONTROL_PLANE_AREA_MANAGEMENT_MASTER_KEY must differ from the provisioner token"
                );
            }
        }
        if let Some(token) = provisioner_token.as_deref() {
            anyhow::ensure!(
                token != admin_token && token != telemetry_token,
                "CONTROL_PLANE_PROVISIONER_TOKEN must differ from admin and telemetry tokens"
            );
        }
        if let Some(token) = automation_token.as_deref() {
            anyhow::ensure!(
                token != admin_token && token != telemetry_token,
                "CONTROL_PLANE_AUTOMATION_TOKEN must differ from admin and telemetry tokens"
            );
            if let Some(provisioner) = provisioner_token.as_deref() {
                anyhow::ensure!(
                    token != provisioner,
                    "CONTROL_PLANE_AUTOMATION_TOKEN must differ from the provisioner token"
                );
            }
        }
        if let Some(token) = management_master_key.as_deref() {
            anyhow::ensure!(
                token != admin_token && token != telemetry_token,
                "CONTROL_PLANE_MANAGEMENT_MASTER_KEY must differ from admin and telemetry tokens"
            );
            if let Some(provisioner) = provisioner_token.as_deref() {
                anyhow::ensure!(
                    token != provisioner,
                    "CONTROL_PLANE_MANAGEMENT_MASTER_KEY must differ from the provisioner token"
                );
            }
            if let Some(area) = area_management_master_key.as_deref() {
                anyhow::ensure!(
                    token != area,
                    "CONTROL_PLANE_MANAGEMENT_MASTER_KEY must differ from the AREA management master key"
                );
            }
        }
        if area_management_master_key.is_some() || management_master_key.is_some() {
            anyhow::ensure!(
                virya_management_url.is_some(),
                "CONTROL_PLANE_VIRYA_MANAGEMENT_URL is required when tenant management is configured"
            );
        }
        let runtime_stale_after_seconds =
            optional_env("CONTROL_PLANE_RUNTIME_STALE_AFTER_SECONDS")?
                .map(|value| value.parse::<i64>())
                .transpose()
                .context("invalid CONTROL_PLANE_RUNTIME_STALE_AFTER_SECONDS")?
                .unwrap_or(DEFAULT_RUNTIME_STALE_AFTER_SECONDS);
        anyhow::ensure!(
            (30..=86_400).contains(&runtime_stale_after_seconds),
            "CONTROL_PLANE_RUNTIME_STALE_AFTER_SECONDS must be between 30 and 86400"
        );

        let provisioner_default_image_tag =
            optional_env("CONTROL_PLANE_PROVISIONER_DEFAULT_IMAGE_TAG")?
                .map(|value| validate_image_tag(&value))
                .transpose()?;
        let provisioner_api_image = validate_image_repository(
            "CONTROL_PLANE_PROVISIONER_API_IMAGE",
            &env::var("CONTROL_PLANE_PROVISIONER_API_IMAGE")
                .unwrap_or_else(|_| "ghcr.io/crowdrelay/crowdrelay-api".to_owned()),
        )?;
        let provisioner_worker_image = validate_image_repository(
            "CONTROL_PLANE_PROVISIONER_WORKER_IMAGE",
            &env::var("CONTROL_PLANE_PROVISIONER_WORKER_IMAGE")
                .unwrap_or_else(|_| "ghcr.io/crowdrelay/crowdrelay-worker".to_owned()),
        )?;
        let provisioner_lease_seconds = optional_env("CONTROL_PLANE_PROVISIONER_LEASE_SECONDS")?
            .map(|value| value.parse::<i64>())
            .transpose()
            .context("invalid CONTROL_PLANE_PROVISIONER_LEASE_SECONDS")?
            .unwrap_or(900);
        anyhow::ensure!(
            (60..=3600).contains(&provisioner_lease_seconds),
            "CONTROL_PLANE_PROVISIONER_LEASE_SECONDS must be between 60 and 3600"
        );

        let mut config = Self {
            bind,
            database_url,
            admin_token_hash: Sha256::digest(admin_token.as_bytes()).into(),
            telemetry_token_hash: Sha256::digest(telemetry_token.as_bytes()).into(),
            provisioner_token_hash: provisioner_token
                .as_deref()
                .map(|token| Sha256::digest(token.as_bytes()).into()),
            automation_token_hash: automation_token
                .as_deref()
                .map(|token| Sha256::digest(token.as_bytes()).into()),
            area_management_master_key,
            management_master_key,
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
            virya_workspace_id: optional_env("CONTROL_PLANE_VIRYA_WORKSPACE_ID")?
                .map(|value| value.parse())
                .transpose()
                .context("invalid CONTROL_PLANE_VIRYA_WORKSPACE_ID")?,
            virya_crowdrelay_url: env::var("CONTROL_PLANE_VIRYA_CROWDRELAY_URL")
                .unwrap_or_else(|_| "https://signal-api.virya.music".to_owned()),
            virya_signal_url: env::var("CONTROL_PLANE_VIRYA_SIGNAL_URL")
                .unwrap_or_else(|_| "https://signal.virya.music".to_owned()),
            virya_management_url,
            cookie_secure: env::var("CONTROL_PLANE_COOKIE_SECURE")
                .map(|value| value != "false")
                .unwrap_or(true),
            notify_email_relay_url: match optional_env("CONTROL_PLANE_NOTIFY_EMAIL_RELAY_URL")? {
                Some(url) => {
                    let parsed = url::Url::parse(&url)
                        .context("invalid CONTROL_PLANE_NOTIFY_EMAIL_RELAY_URL")?;
                    anyhow::ensure!(
                        parsed.scheme() == "https",
                        "CONTROL_PLANE_NOTIFY_EMAIL_RELAY_URL must be HTTPS"
                    );
                    Some(url)
                }
                None => None,
            },
            bootstrap_admin_password: optional_env("CONTROL_PLANE_BOOTSTRAP_ADMIN_PASSWORD")?,
            bootstrap_admin_username: match optional_env("CONTROL_PLANE_BOOTSTRAP_ADMIN_USERNAME")?
            {
                Some(username) => {
                    anyhow::ensure!(
                        (3..=32).contains(&username.len())
                            && username.bytes().all(|byte| byte.is_ascii_lowercase()
                                || byte.is_ascii_digit()
                                || matches!(byte, b'-' | b'_' | b'.')),
                        "CONTROL_PLANE_BOOTSTRAP_ADMIN_USERNAME must be 3-32 lowercase URL-safe characters"
                    );
                    Some(username)
                }
                None => None,
            },
            agent_service_url: optional_env("CONTROL_PLANE_AGENT_SERVICE_URL")?,
            n8n_base_url: optional_env("CONTROL_PLANE_N8N_BASE_URL")?,
            n8n_api_key: optional_secret("CONTROL_PLANE_N8N_API_KEY")?,
            discord_automation_webhook_url: optional_env(
                "CONTROL_PLANE_DISCORD_AUTOMATION_WEBHOOK_URL",
            )?,
        };
        // Both or neither: half-configured bootstrap is a deployment typo,
        // not a feature.
        anyhow::ensure!(
            config.bootstrap_admin_password.is_some() == config.bootstrap_admin_username.is_some(),
            "CONTROL_PLANE_BOOTSTRAP_ADMIN_PASSWORD and CONTROL_PLANE_BOOTSTRAP_ADMIN_USERNAME must be set together"
        );
        if let Some(password) = config.bootstrap_admin_password.as_deref() {
            anyhow::ensure!(
                (12..=128).contains(&password.chars().count())
                    && !password.chars().any(char::is_control),
                "CONTROL_PLANE_BOOTSTRAP_ADMIN_PASSWORD must be 12-128 characters"
            );
        }
        if config.bootstrap_admin_username.is_none() && config.bootstrap_admin_password.is_some() {
            config.bootstrap_admin_username = Some("admin".to_owned());
        }
        Ok(config)
    }
}

fn normalize_optional(name: &str, value: String) -> Result<Option<String>> {
    if value.is_empty() {
        return Ok(None);
    }
    anyhow::ensure!(
        value == value.trim(),
        "{name} must not have surrounding whitespace"
    );
    anyhow::ensure!(
        !value.chars().any(char::is_control),
        "{name} must not contain control characters"
    );
    Ok(Some(value))
}

fn optional_env(name: &str) -> Result<Option<String>> {
    match env::var(name) {
        Ok(value) => normalize_optional(name, value),
        Err(VarError::NotPresent) => Ok(None),
        Err(VarError::NotUnicode(_)) => anyhow::bail!("{name} must be valid UTF-8"),
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
    validate_optional_secret(name, optional_env(name)?)
}

/// The secret rule itself, separated from the environment read so tests (and
/// future callers) can exercise it without mutating process state.
fn validate_optional_secret(name: &str, value: Option<String>) -> Result<Option<String>> {
    value
        .map(|value| {
            anyhow::ensure!(value.len() >= 32, "{name} must be at least 32 characters");
            anyhow::ensure!(
                !value.chars().any(char::is_whitespace),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn optional_values_only_treat_exact_empty_as_absent() {
        assert_eq!(normalize_optional("TEST", String::new()).unwrap(), None);
        assert_eq!(
            normalize_optional("TEST", "value".to_owned()).unwrap(),
            Some("value".to_owned())
        );
        assert!(normalize_optional("TEST", "   ".to_owned()).is_err());
        assert!(normalize_optional("TEST", " value".to_owned()).is_err());
        assert!(normalize_optional("TEST", "value ".to_owned()).is_err());
        assert!(normalize_optional("TEST", "value\nnext".to_owned()).is_err());
    }

    #[test]
    fn optional_secret_rejects_weak_or_whitespace_values() {
        // Exercises the real validation path behind `optional_secret`, so
        // weakening its checks fails here instead of only in production.
        let valid = "a".repeat(32);
        assert_eq!(
            validate_optional_secret("TEST_SECRET", Some(valid.clone())).unwrap(),
            Some(valid)
        );
        for weak in [
            "short".to_owned(),
            "a".repeat(31),
            format!(" {}", "a".repeat(32)),
        ] {
            assert!(validate_optional_secret("TEST_SECRET", Some(weak)).is_err());
        }
        assert_eq!(validate_optional_secret("TEST_SECRET", None).unwrap(), None);
    }
}
