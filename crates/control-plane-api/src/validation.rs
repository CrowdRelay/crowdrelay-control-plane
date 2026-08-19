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
        .expect("Some input must produce Some normalized data region");
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

pub fn desired_version(value: Option<String>) -> Result<Option<String>, ApiError> {
    value
        .map(|raw| {
            let value = raw.trim();
            if value.is_empty() {
                return Ok(None);
            }
            if value.len() > 128
                || value.chars().any(char::is_whitespace)
                || value.chars().any(char::is_control)
            {
                return Err(ApiError::InvalidInput(
                    "desiredVersion must be at most 128 non-whitespace characters".to_owned(),
                ));
            }
            Ok(Some(value.to_owned()))
        })
        .transpose()
        .map(Option::flatten)
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
    fn normalizes_or_rejects_provisioning_versions() {
        assert_eq!(
            desired_version(Some("  0123456  ".into())).unwrap(),
            Some("0123456".into())
        );
        assert_eq!(desired_version(Some("   ".into())).unwrap(), None);
        assert!(desired_version(Some("bad version".into())).is_err());
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
