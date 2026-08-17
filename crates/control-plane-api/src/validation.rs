use crate::{error::ApiError, model::BrandingPalette};

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
}
