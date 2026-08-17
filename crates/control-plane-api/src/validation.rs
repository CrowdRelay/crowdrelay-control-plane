use chrono::{Duration, Utc};

use crate::{
    error::ApiError,
    model::{BrandingPalette, RuntimeReportRequest},
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
    if !(2..=120).contains(&value.chars().count()) {
        return Err(ApiError::InvalidInput(
            "displayName must be 2-120 characters".to_owned(),
        ));
    }
    Ok(value.to_owned())
}

pub fn base_url(value: Option<String>) -> Result<Option<String>, ApiError> {
    value.map(|raw| {
        let parsed = url::Url::parse(raw.trim()).map_err(|_| ApiError::InvalidInput("invalid URL".to_owned()))?;
        if parsed.scheme() != "https" || parsed.host_str().is_none() || parsed.username() != "" || parsed.password().is_some() || parsed.query().is_some() || parsed.fragment().is_some() {
            return Err(ApiError::InvalidInput("tenant URLs must be absolute HTTPS base URLs without credentials, query or fragment".to_owned()));
        }
        Ok(parsed.as_str().trim_end_matches('/').to_owned())
    }).transpose()
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
    fn normalizes_or_rejects_provisioning_versions() {
        assert_eq!(
            desired_version(Some("  0123456  ".into())).unwrap(),
            Some("0123456".into())
        );
        assert_eq!(desired_version(Some("   ".into())).unwrap(), None);
        assert!(desired_version(Some("bad version".into())).is_err());
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
