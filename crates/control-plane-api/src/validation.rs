use chrono::{Duration, Utc};

use crate::{
    error::ApiError,
    model::{BrandingPalette, RegionalProfile, RuntimeReportRequest},
};

pub fn slug(value: &str) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    let valid_len = (2..=63).contains(&value.len());
    let valid_chars = value.bytes().enumerate().all(|(index, byte)| {
        byte.is_ascii_lowercase() || byte.is_ascii_digit() || (index > 0 && byte == b'-')
    });
    if !valid_len || !valid_chars || value.ends_with('-') {
        return Err(ApiError::InvalidInput(
            "slug must be 2-63 lowercase letters, digits or internal hyphens".to_owned(),
        ));
    }
    Ok(value)
}

pub fn display_name(value: &str) -> Result<String, ApiError> {
    let value = value.trim();
    if !(2..=120).contains(&value.chars().count()) || value.chars().any(char::is_control) {
        return Err(ApiError::InvalidInput(
            "displayName must be 2-120 printable characters".to_owned(),
        ));
    }
    Ok(value.to_owned())
}

/// Operator account username: lowercase, URL-safe, no leading/trailing
/// punctuation — it appears in audit rows and must never collide with the
/// platform's reserved actors.
pub fn username(value: &str) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    let valid_len = (3..=32).contains(&value.len());
    let valid_chars = value.bytes().enumerate().all(|(index, byte)| {
        byte.is_ascii_lowercase()
            || byte.is_ascii_digit()
            || (index > 0 && matches!(byte, b'-' | b'_' | b'.'))
    });
    if !valid_len || !valid_chars || value.ends_with(['-', '_', '.']) {
        return Err(ApiError::InvalidInput(
            "username must be 3-32 lowercase letters, digits or internal -_. separators".to_owned(),
        ));
    }
    Ok(value)
}

/// Operator password policy: long enough for a password manager secret,
/// short enough for every browser. Content rules stay out on purpose —
/// length is the property that matters against offline argon2id cracking.
pub fn password(value: &str) -> Result<String, ApiError> {
    if !(12..=128).contains(&value.chars().count()) || value.chars().any(char::is_control) {
        return Err(ApiError::InvalidInput(
            "password must be 12-128 characters without control characters".to_owned(),
        ));
    }
    Ok(value.to_owned())
}

/// Notification event kinds a channel can subscribe to. An empty list means
/// "all events".
pub const NOTIFIER_EVENTS: &[&str] = &[
    "provisioning.failed",
    "runtime.degraded",
    "runtime.stale",
    "runtime.recovered",
];

/// Brain growth goals. Mirrors
/// `crowdrelay_domain::growth_metrics::NorthStarMetric`; the tenant runtime
/// silently falls back to `signal_installs` for anything it cannot parse, so an
/// unknown value must be rejected here rather than stored as unreadable intent.
/// This list fell four values behind when the vocabulary widened to cover
/// metal, DJ and pop fanbases. The wizard offered seventeen goals while this
/// rejected all but four, so a tenant measured on SoundCloud or TikTok picked a
/// goal and the create call failed with "unknown northStarMetric" — the UI was
/// widened and the validator guarding it was not.
/// `scripts/test_north_star_vocabulary_parity.py` now pins all three copies
/// (the domain enum, this list, and the wizard's TypeScript union) together.
pub const NORTH_STAR_METRICS: &[&str] = &[
    "signal_installs",
    "total_audience",
    "bandcamp_supporters",
    "bandsintown_trackers",
    "bluesky_followers",
    "deezer_fans",
    "discogs_in_collection",
    "discord_members",
    "facebook_followers",
    "instagram_followers",
    "lastfm_listeners",
    "soundcloud_followers",
    "spotify_followers",
    "telegram_subscribers",
    "tiktok_followers",
    "x_followers",
    "youtube_subscribers",
];

/// Discovery platforms the onboarding wizard offers.
pub const FANBASE_SOURCES: &[&str] = &[
    "discord",
    "facebook_group",
    "youtube",
    "forum",
    "reddit",
    "x",
];

/// Validates the growth goal and reconciles it with the Signal opt-in.
///
/// `signal_installs` is unreachable for a Signal-disabled tenant: the beacon
/// routes the Signal workers call return 404, so the brain would keep
/// dispatching `signal-inviter` into a disabled surface forever. Rejecting the
/// combination keeps the two settings consistent at the point they are chosen.
pub fn north_star_metric(value: Option<String>, signal_enabled: bool) -> Result<String, ApiError> {
    let value = value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(if signal_enabled {
            "signal_installs"
        } else {
            // `total_audience`, not `youtube_subscribers`: the fallback fires
            // before anyone knows which platforms this tenant will connect, and
            // handing a YouTube goal to a tenant with no YouTube channel means
            // the brain optimizes a number that stays at zero forever.
            "total_audience"
        });
    if !NORTH_STAR_METRICS.contains(&value) {
        return Err(ApiError::InvalidInput(format!(
            "unknown northStarMetric: {value}"
        )));
    }
    if !signal_enabled && value == "signal_installs" {
        return Err(ApiError::InvalidInput(
            "northStarMetric cannot be signal_installs when signalEnabled=false".to_owned(),
        ));
    }
    Ok(value.to_owned())
}

/// Validates the selected discovery platforms, rejecting duplicates so the
/// stored array is a set.
pub fn fanbase_sources(values: Vec<String>) -> Result<Vec<String>, ApiError> {
    let mut seen: Vec<String> = Vec::with_capacity(values.len());
    for value in values {
        let value = value.trim().to_owned();
        if !FANBASE_SOURCES.contains(&value.as_str()) {
            return Err(ApiError::InvalidInput(format!(
                "unknown fanbase source: {value}"
            )));
        }
        if seen.contains(&value) {
            return Err(ApiError::InvalidInput(format!(
                "duplicate fanbase source: {value}"
            )));
        }
        seen.push(value);
    }
    Ok(seen)
}

/// Synesthesia is now available to all tenants. The former Virya-only database
/// constraint was dropped in migration 0011. This function is kept as a no-op
/// placeholder so the call site in create_tenant does not need to change — the
/// validation layer is still the right place to add product gating if it
/// returns in the future.
pub fn synesthesia_opt_in(enabled: bool, _slug: &str) -> Result<bool, ApiError> {
    Ok(enabled)
}

/// Validate a Google Play Store URL. Must be the canonical Play Store details
/// URL, or None when the app is not yet published.
pub fn play_store_url(url: Option<String>) -> Result<Option<String>, ApiError> {
    match url {
        None => Ok(None),
        Some(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return Ok(None);
            }
            if !trimmed.starts_with("https://play.google.com/store/apps/details?id=") {
                return Err(ApiError::InvalidInput(
                    "play store URL must start with https://play.google.com/store/apps/details?id="
                        .to_owned(),
                ));
            }
            Ok(Some(trimmed.to_owned()))
        }
    }
}

pub fn notifier_events(values: Vec<String>) -> Result<Vec<String>, ApiError> {
    if values.len() > NOTIFIER_EVENTS.len() {
        return Err(ApiError::InvalidInput(
            "too many notifier events".to_owned(),
        ));
    }
    for value in &values {
        if !NOTIFIER_EVENTS.contains(&value.as_str()) {
            return Err(ApiError::InvalidInput(format!(
                "unknown notifier event: {value}"
            )));
        }
    }
    Ok(values)
}

pub fn notifier_label(value: &str) -> Result<String, ApiError> {
    let value = value.trim();
    if !(2..=64).contains(&value.chars().count()) || value.chars().any(char::is_control) {
        return Err(ApiError::InvalidInput(
            "notifier label must be 2-64 printable characters".to_owned(),
        ));
    }
    Ok(value.to_owned())
}

/// Channel target validation. Discord webhooks are pinned to the two official
/// hosts so a misconfigured tenant cannot point its channel at arbitrary
/// infrastructure; generic webhooks require HTTPS with a bounded URL.
pub fn notifier_target(kind: &str, value: Option<&str>) -> Result<serde_json::Value, ApiError> {
    match kind {
        "discord" => {
            let raw = value
                .ok_or_else(|| ApiError::InvalidInput("discord channel requires url".to_owned()))?;
            let parsed = url::Url::parse(raw.trim())
                .map_err(|_| ApiError::InvalidInput("invalid discord webhook URL".to_owned()))?;
            if parsed.scheme() != "https"
                || !matches!(
                    parsed.host_str(),
                    Some("discord.com") | Some("discordapp.com")
                )
                || !parsed.path().starts_with("/api/webhooks/")
            {
                return Err(ApiError::InvalidInput(
                    "discord channel requires an https://discord.com/api/webhooks/... URL"
                        .to_owned(),
                ));
            }
            Ok(serde_json::json!({"url": parsed.as_str()}))
        }
        "webhook" => {
            let raw = value
                .ok_or_else(|| ApiError::InvalidInput("webhook channel requires url".to_owned()))?;
            let parsed = url::Url::parse(raw.trim())
                .map_err(|_| ApiError::InvalidInput("invalid webhook URL".to_owned()))?;
            if parsed.scheme() != "https"
                || parsed.host_str().is_none()
                || parsed.as_str().len() > 512
                || parsed.username() != ""
                || parsed.password().is_some()
            {
                return Err(ApiError::InvalidInput(
                    "webhook channel requires a plain HTTPS URL without embedded credentials"
                        .to_owned(),
                ));
            }
            Ok(serde_json::json!({"url": parsed.as_str()}))
        }
        "email_relay" => {
            let to = value.ok_or_else(|| {
                ApiError::InvalidInput("email_relay channel requires recipient email".to_owned())
            })?;
            let to = to.trim();
            let valid = (3..=254).contains(&to.len())
                && to
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "@.-_+".contains(c))
                && to.matches('@').count() == 1
                && !to.starts_with(['@', '.', '-'])
                && !to.ends_with(['@', '.', '-']);
            if !valid {
                return Err(ApiError::InvalidInput(
                    "email_relay channel requires a valid recipient address".to_owned(),
                ));
            }
            Ok(serde_json::json!({"to": to}))
        }
        _ => Err(ApiError::InvalidInput(
            "kind must be one of discord, webhook, email_relay".to_owned(),
        )),
    }
}

pub fn base_url(value: Option<String>) -> Result<Option<String>, ApiError> {
    value.map(|raw| {
        let parsed = url::Url::parse(raw.trim()).map_err(|_| ApiError::InvalidInput("invalid URL".to_owned()))?;
        if parsed.scheme() != "https"
            || parsed.host_str().is_none()
            || parsed.username() != ""
            || parsed.password().is_some()
            || parsed.path() != "/"
            || parsed.query().is_some()
            || parsed.fragment().is_some()
        {
            return Err(ApiError::InvalidInput(
                "tenant URLs must be bare HTTPS origins without credentials, path, query or fragment".to_owned(),
            ));
        }
        Ok(parsed.as_str().trim_end_matches('/').to_owned())
    }).transpose()
}

pub fn country_code(value: Option<String>) -> Result<String, ApiError> {
    let value = value
        .ok_or_else(|| {
            ApiError::InvalidInput(
                "defaultCountryCode is required; new tenants must not inherit a hidden country"
                    .to_owned(),
            )
        })?
        .trim()
        .to_ascii_uppercase();
    if value.len() != 2 || !value.bytes().all(|byte| byte.is_ascii_uppercase()) {
        return Err(ApiError::InvalidInput(
            "defaultCountryCode must be a two-letter uppercase ISO-style country code".to_owned(),
        ));
    }
    Ok(value)
}

pub fn data_region(value: Option<&str>) -> Result<Option<String>, ApiError> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let value = value.to_ascii_lowercase();
    if !matches!(value.as_str(), "eu" | "us") {
        return Err(ApiError::InvalidInput(
            "dataRegion must be eu or us".to_owned(),
        ));
    }
    Ok(Some(value))
}

pub fn regional_profile(mut profile: RegionalProfile) -> Result<RegionalProfile, ApiError> {
    profile.country_code = country_code(Some(profile.country_code))?;
    profile.region = profile.region.trim().to_ascii_lowercase();
    if !matches!(profile.region.as_str(), "eu" | "us") {
        return Err(ApiError::InvalidInput("region must be eu or us".to_owned()));
    }

    profile.locale = profile.locale.trim().to_owned();
    if !(4..=35).contains(&profile.locale.len())
        || !profile.locale.contains('-')
        || !profile
            .locale
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err(ApiError::InvalidInput(
            "locale must be an explicit BCP-47 style tag such as de-DE or en-US".to_owned(),
        ));
    }

    profile.timezone = profile.timezone.trim().to_owned();
    if !(3..=64).contains(&profile.timezone.len())
        || !profile.timezone.contains('/')
        || !profile
            .timezone
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'/' | b'_' | b'-' | b'+'))
    {
        return Err(ApiError::InvalidInput(
            "timezone must be an explicit IANA-style zone such as Europe/Berlin or America/New_York".to_owned(),
        ));
    }

    profile.currency = profile.currency.trim().to_ascii_uppercase();
    if profile.currency.len() != 3 || !profile.currency.bytes().all(|b| b.is_ascii_uppercase()) {
        return Err(ApiError::InvalidInput(
            "currency must be a three-letter uppercase ISO-style code".to_owned(),
        ));
    }

    profile.date_format = profile.date_format.trim().to_ascii_lowercase();
    if !matches!(profile.date_format.as_str(), "dmy" | "mdy" | "ymd") {
        return Err(ApiError::InvalidInput(
            "dateFormat must be dmy, mdy or ymd".to_owned(),
        ));
    }
    profile.number_format = profile.number_format.trim().to_ascii_lowercase();
    if !matches!(
        profile.number_format.as_str(),
        "comma_decimal" | "dot_decimal"
    ) {
        return Err(ApiError::InvalidInput(
            "numberFormat must be comma_decimal or dot_decimal".to_owned(),
        ));
    }
    profile.data_region = data_region(Some(&profile.data_region))?
        .ok_or_else(|| ApiError::InvalidInput("dataRegion must be eu or us".to_owned()))?;
    Ok(profile)
}

pub fn deployment_version(
    value: Option<String>,
    fallback: Option<&str>,
) -> Result<String, ApiError> {
    let raw = value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or(fallback)
        .ok_or_else(|| ApiError::InvalidInput(
            "desiredVersion is required until CONTROL_PLANE_PROVISIONER_DEFAULT_IMAGE_TAG is configured".to_owned(),
        ))?;
    let sha = raw.strip_prefix("sha-").unwrap_or(raw);
    if sha.len() != 40
        || !sha
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(ApiError::InvalidInput(
            "desiredVersion must be an immutable sha-<40 lowercase hex> CrowdRelay image tag"
                .to_owned(),
        ));
    }
    Ok(format!("sha-{sha}"))
}

pub fn worker_id(value: &str) -> Result<String, ApiError> {
    let value = value.trim();
    if !(3..=96).contains(&value.len())
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
    {
        return Err(ApiError::InvalidInput(
            "workerId must be 3-96 safe identifier characters".to_owned(),
        ));
    }
    Ok(value.to_owned())
}

pub fn claim_token(value: &str) -> Result<&str, ApiError> {
    let value = value.trim();
    if value.len() != 32 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(ApiError::InvalidInput(
            "invalid provisioning claim token".to_owned(),
        ));
    }
    Ok(value)
}

pub fn provision_success(
    api_port: u16,
    schema_version: i32,
    deployed_sha: &str,
) -> Result<(), ApiError> {
    if api_port < 1024 {
        return Err(ApiError::InvalidInput("apiPort must be >= 1024".to_owned()));
    }
    if schema_version < 0 {
        return Err(ApiError::InvalidInput(
            "schemaVersion cannot be negative".to_owned(),
        ));
    }
    if deployed_sha.len() != 40
        || !deployed_sha
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(ApiError::InvalidInput(
            "deployedSha must be exactly 40 lowercase hexadecimal characters".to_owned(),
        ));
    }
    Ok(())
}

pub fn provision_failure(
    code: &str,
    detail: Option<&str>,
) -> Result<(String, Option<String>), ApiError> {
    let code = code.trim();
    if code.is_empty()
        || code.len() > 96
        || !code.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'_' | b'-')
        })
    {
        return Err(ApiError::InvalidInput(
            "errorCode must be 1-96 lowercase identifier characters".to_owned(),
        ));
    }
    let detail = detail
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            if value.chars().count() > 1000 || value.chars().any(char::is_control) {
                Err(ApiError::InvalidInput(
                    "errorDetail must be at most 1000 printable characters".to_owned(),
                ))
            } else {
                Ok(value.to_owned())
            }
        })
        .transpose()?;
    Ok((code.to_owned(), detail))
}

pub fn runtime_report(input: &RuntimeReportRequest) -> Result<(), ApiError> {
    if input.schema_version.is_some_and(|value| value < 0) {
        return Err(ApiError::InvalidInput(
            "schemaVersion cannot be negative".to_owned(),
        ));
    }
    if input.outbox_pending.is_some_and(|value| value < 0)
        || input.queue_lag.is_some_and(|value| value < 0)
    {
        return Err(ApiError::InvalidInput(
            "runtime counters cannot be negative".to_owned(),
        ));
    }
    if let Some(sha) = &input.deployed_sha {
        if !(7..=128).contains(&sha.len()) || !sha.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(ApiError::InvalidInput(
                "deployedSha must be a 7-128 character hexadecimal identifier".to_owned(),
            ));
        }
    }
    if let Some(observed_at) = input.last_heartbeat_at.as_ref() {
        let now = Utc::now();
        if observed_at > &(now + Duration::minutes(5)) {
            return Err(ApiError::InvalidInput(
                "lastHeartbeatAt cannot be more than 5 minutes in the future".to_owned(),
            ));
        }
        if observed_at < &(now - Duration::days(30)) {
            return Err(ApiError::InvalidInput(
                "lastHeartbeatAt cannot be more than 30 days old".to_owned(),
            ));
        }
    }
    Ok(())
}

fn rgb(value: &str) -> Option<[f64; 3]> {
    let bytes = value.as_bytes();
    if bytes.len() != 7 || bytes[0] != b'#' || !bytes[1..].iter().all(u8::is_ascii_hexdigit) {
        return None;
    }
    let channel = |start: usize| {
        u8::from_str_radix(&value[start..start + 2], 16)
            .ok()
            .map(|v| f64::from(v) / 255.0)
    };
    Some([channel(1)?, channel(3)?, channel(5)?])
}

fn luminance(value: &str) -> Option<f64> {
    let [r, g, b] = rgb(value)?;
    let linear = |v: f64| {
        if v <= 0.04045 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        }
    };
    Some(0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b))
}

fn contrast(a: &str, b: &str) -> Option<f64> {
    let (a, b) = (luminance(a)?, luminance(b)?);
    let (light, dark) = if a >= b { (a, b) } else { (b, a) };
    Some((light + 0.05) / (dark + 0.05))
}

pub fn palette(value: Option<BrandingPalette>) -> Result<Option<BrandingPalette>, ApiError> {
    if let Some(palette) = &value {
        let all = [
            &palette.primary,
            &palette.primary_contrast,
            &palette.accent,
            &palette.surface,
            &palette.surface_elevated,
            &palette.text,
            &palette.text_muted,
            &palette.success,
            &palette.warning,
            &palette.danger,
        ];
        if !all.iter().all(|value| rgb(value).is_some()) {
            return Err(ApiError::InvalidInput(
                "palette colors must use #RRGGBB".to_owned(),
            ));
        }
        if contrast(&palette.primary, &palette.primary_contrast).unwrap_or_default() < 4.5 {
            return Err(ApiError::InvalidInput(
                "primary/primaryContrast must meet WCAG AA 4.5:1".to_owned(),
            ));
        }
        if contrast(&palette.surface, &palette.text).unwrap_or_default() < 4.5 {
            return Err(ApiError::InvalidInput(
                "surface/text must meet WCAG AA 4.5:1".to_owned(),
            ));
        }
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_low_contrast_palette() {
        let input = BrandingPalette {
            primary: "#777777".into(),
            primary_contrast: "#888888".into(),
            accent: "#22d3ee".into(),
            surface: "#0b0c0f".into(),
            surface_elevated: "#15171c".into(),
            text: "#f7f7f8".into(),
            text_muted: "#9ca3af".into(),
            success: "#22c55e".into(),
            warning: "#f59e0b".into(),
            danger: "#ef4444".into(),
        };
        assert!(palette(Some(input)).is_err());
    }

    #[test]
    fn rejects_control_characters_in_display_names() {
        assert!(display_name("Good Tenant").is_ok());
        assert!(display_name("Bad\nCROWDRELAY_AUTOPILOT_ENABLED=true").is_err());
    }

    #[test]
    fn normalizes_deployment_sha_and_country() {
        let sha = "0123456789abcdef0123456789abcdef01234567";
        assert_eq!(
            deployment_version(Some(sha.into()), None).unwrap(),
            format!("sha-{sha}")
        );
        assert_eq!(country_code(Some("pl".into())).unwrap(), "PL");
        assert!(country_code(None).is_err());
        assert!(deployment_version(Some("latest".into()), None).is_err());
        assert!(country_code(Some("POL".into())).is_err());
    }

    #[test]
    fn validates_provisioner_machine_inputs() {
        assert_eq!(
            worker_id("home-provisioner-1").unwrap(),
            "home-provisioner-1"
        );
        assert!(worker_id("bad worker").is_err());
        assert!(claim_token("0123456789abcdef0123456789abcdef").is_ok());
        assert!(provision_success(18100, 63, "0123456789abcdef0123456789abcdef01234567").is_ok());
        assert!(provision_success(80, 63, "0123456789abcdef0123456789abcdef01234567").is_err());
        assert!(provision_failure("docker_compose_failed", Some("exit 1")).is_ok());
    }

    #[test]
    fn rejects_impossible_runtime_values() {
        let bad = RuntimeReportRequest {
            api_healthy: Some(true),
            worker_healthy: Some(true),
            schema_version: Some(-1),
            deployed_sha: Some("abcdef0".into()),
            outbox_pending: Some(0),
            queue_lag: Some(0),
            last_heartbeat_at: Some(Utc::now()),
        };
        assert!(runtime_report(&bad).is_err());
    }
}
