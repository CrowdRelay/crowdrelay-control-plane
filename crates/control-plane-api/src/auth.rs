//! Operator authentication.
//!
//! Two authorities, deliberately separate:
//!
//! 1. **Platform admin bearer** — the edge (or a local dev proxy) injects
//!    `Authorization: Bearer $CONTROL_PLANE_ADMIN_TOKEN` after its own Basic
//!    gate. Full access, unchanged.
//! 2. **Operator sessions** — named accounts in
//!    `control_plane_operator_accounts`, hard-scoped to one tenant, issued by
//!    `POST /api/v1/auth/session` and carried in an HttpOnly cookie. Neither
//!    the platform token nor the session token is ever readable by page
//!    JavaScript.
//!
//! Session-authenticated mutations must carry `x-request-id` (the SPA always
//! sends it). A cross-site form POST cannot set custom headers, which closes
//! the CSRF gap left by SameSite=Lax.

use std::{sync::Arc, sync::OnceLock};

use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordVerifier, SaltString},
};
use axum::{
    extract::{Request, State},
    http::{HeaderMap, header::AUTHORIZATION},
    middleware::Next,
    response::Response,
};
use chrono::{Duration, Utc};
use rand_core::{OsRng, RngCore};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use uuid::Uuid;

use crate::{AppState, error::ApiError};

pub const SESSION_COOKIE: &str = "crowdrelay_cp_session";
pub const SESSION_TTL_SECONDS: i64 = 12 * 60 * 60;
pub const MOBILE_SESSION_TTL_SECONDS: i64 = 2 * 60 * 60;
const TIMING_PAD: &str = "crowdrelay-control-plane-login-timing-pad";

/// Detect mobile user agents so we can issue shorter-lived sessions on
/// devices that are more likely to be lost or stolen. False positives
/// (desktop flagged as mobile) are safe-fail: a shorter session is an
/// inconvenience, not a security hole. False negatives are the risk, but
/// modern mobile browsers send clear UA strings.
pub fn is_mobile_user_agent(headers: &HeaderMap) -> bool {
    headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|ua| {
            let ua = ua.to_ascii_lowercase();
            ua.contains("mobile")
                || ua.contains("android")
                || ua.contains("iphone")
                || ua.contains("ipad")
                || ua.contains("ipod")
        })
}

#[derive(Debug, Clone)]
pub enum Identity {
    /// Edge- or dev-proxy-injected platform admin bearer.
    PlatformAdmin,
    /// Named account from the database. `tenant_id` is always present for the
    /// tenant role and never present for platform_admin rows.
    Account {
        username: String,
        role: &'static str,
        tenant_id: Option<Uuid>,
        via_session: bool,
    },
}

impl Identity {
    pub fn is_platform_admin(&self) -> bool {
        matches!(self, Self::PlatformAdmin)
            || matches!(
                self,
                Self::Account {
                    role: "platform_admin",
                    ..
                }
            )
    }

    pub fn audit_actor(&self) -> String {
        match self {
            Self::PlatformAdmin => "platform-admin".to_owned(),
            Self::Account { username, role, .. } => format!("{role}:{username}"),
        }
    }

    pub fn tenant_scope(&self) -> Option<Uuid> {
        match self {
            Self::PlatformAdmin => None,
            Self::Account { tenant_id, .. } => *tenant_id,
        }
    }

    pub fn require_platform_admin(&self) -> Result<(), ApiError> {
        if self.is_platform_admin() {
            Ok(())
        } else {
            Err(ApiError::Forbidden(
                "this action requires the platform administrator".to_owned(),
            ))
        }
    }

    /// Tenant-scoped authorization: platform admins pass everywhere; account
    /// operators only where their row points.
    pub fn ensure_tenant(&self, tenant_id: Uuid) -> Result<(), ApiError> {
        if self.is_platform_admin() || self.tenant_scope() == Some(tenant_id) {
            Ok(())
        } else {
            Err(ApiError::Forbidden(
                "this tenant is outside your operator scope".to_owned(),
            ))
        }
    }
}

fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty())
}

fn cookie_value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get_all(axum::http::header::COOKIE)
        .iter()
        .find_map(|value| {
            let value = value.to_str().ok()?;
            value.split(';').find_map(|pair| {
                let pair = pair.trim();
                let (key, token) = pair.split_once('=')?;
                (key.trim() == name && !token.is_empty()).then_some(token)
            })
        })
}

pub(crate) fn hash_token(token: &str) -> [u8; 32] {
    Sha256::digest(token.as_bytes()).into()
}

/// Resolve who is calling: admin bearer first (edge-injected), then an
/// operator session cookie. Everything else is unauthorized.
pub async fn resolve_identity(state: &AppState, headers: &HeaderMap) -> Result<Identity, ApiError> {
    if let Some(token) = bearer(headers) {
        let supplied: [u8; 32] = Sha256::digest(token.as_bytes()).into();
        if supplied.ct_eq(&state.admin_token_hash).unwrap_u8() == 1 {
            return Ok(Identity::PlatformAdmin);
        }
        // On gated routes the edge substitutes Authorization wholesale, so a
        // wrong bearer means unauthenticated traffic carrying a stale header.
        // Never fall through to cookie auth in that state.
        return Err(ApiError::Unauthorized);
    }
    let Some(token) = cookie_value(headers, SESSION_COOKIE) else {
        return Err(ApiError::Unauthorized);
    };
    let account = state.store.resolve_session(&hash_token(token)).await?;
    Ok(Identity::Account {
        username: account.username.clone(),
        role: if account.role == "platform_admin" {
            "platform_admin"
        } else {
            "tenant_operator"
        },
        tenant_id: account.tenant_id,
        via_session: true,
    })
}

/// Replaces `require_admin` on the operator surface. Telemetry and
/// provisioner routers keep their dedicated middlewares.
pub async fn authenticate(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let identity = resolve_identity(&state, request.headers()).await?;
    // CSRF guard for session callers: state-changing requests must prove they
    // originate from the SPA, which always attaches x-request-id.
    if matches!(
        &identity,
        Identity::Account {
            via_session: true,
            ..
        }
    ) && !matches!(
        *request.method(),
        axum::http::Method::GET | axum::http::Method::HEAD | axum::http::Method::OPTIONS
    ) && request
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .is_none_or(str::is_empty)
    {
        return Err(ApiError::Forbidden("missing x-request-id".to_owned()));
    }
    request.extensions_mut().insert(Arc::new(identity));
    Ok(next.run(request).await)
}

/// Platform-admin-only surface (AREA designer proxy).
pub async fn require_platform_admin(request: Request, next: Next) -> Result<Response, ApiError> {
    request
        .extensions()
        .get::<Arc<Identity>>()
        .ok_or(ApiError::Unauthorized)?
        .require_platform_admin()?;
    Ok(next.run(request).await)
}

/// Tenant-scoped surface guard: resolves `{slug}` from the request path and
/// enforces [`Identity::ensure_tenant`], so per-tenant routers stay scoped
/// without touching every handler signature.
pub async fn require_tenant_access(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let identity = request
        .extensions()
        .get::<Arc<Identity>>()
        .ok_or(ApiError::Unauthorized)?;
    let slug = tenant_slug_from_path(request.uri().path())
        .ok_or_else(|| ApiError::InvalidInput("missing tenant scope".to_owned()))?;
    let slug = crate::validation::slug(slug)?;
    let tenant = state.store.tenant_by_slug(&slug).await?;
    identity.ensure_tenant(tenant.tenant.id)?;
    Ok(next.run(request).await)
}

fn tenant_slug_from_path(path: &str) -> Option<&str> {
    // Nested routers see the URI with `/api/v1` stripped, but be liberal and
    // accept both forms — direct callers and future nesting changes included.
    let mut segments = path.split('/').filter(|segment| !segment.is_empty());
    match segments.next()? {
        "tenants" => segments.next(),
        "api" => {
            if segments.next() != Some("v1") || segments.next() != Some("tenants") {
                return None;
            }
            segments.next()
        }
        _ => None,
    }
}

// --- Passwords and session issuance ----------------------------------------

pub fn hash_password(password: &str) -> Result<String, ApiError> {
    use argon2::PasswordHasher;
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| ApiError::Unavailable("password hashing unavailable".to_owned()))
}

/// Constant-ish-time rejection: unknown usernames pay the same KDF cost as
/// wrong passwords against this pre-baked throwaway hash.
fn timing_pad() -> &'static str {
    static PAD: OnceLock<String> = OnceLock::new();
    PAD.get_or_init(|| {
        hash_password(TIMING_PAD).unwrap_or_else(|_| "$argon2id$invalid$".to_owned())
    })
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .is_ok()
        })
        .unwrap_or_default()
}

pub fn reject_with_pad(password: &str) {
    let _ = verify_password(password, timing_pad());
}

#[derive(Debug)]
pub struct IssuedSession {
    pub token: String,
}

/// Generate the opaque session token and persist only its sha256.
/// The TTL is caller-controlled so mobile sessions can get a shorter
/// lifetime than desktop ones.
pub async fn new_session_token(
    account_id: Uuid,
    store: &crate::store::Store,
    ttl_seconds: i64,
) -> Result<IssuedSession, ApiError> {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let mut token = String::with_capacity(64);
    for byte in &bytes {
        token.push_str(&format!("{byte:02x}"));
    }
    let expires_at = Utc::now() + Duration::seconds(ttl_seconds);
    store
        .create_session(account_id, hash_token(&token).as_slice(), expires_at)
        .await?;
    Ok(IssuedSession { token })
}

pub fn session_cookie_with_ttl(token: &str, secure: bool, max_age: i64) -> String {
    format!(
        "{SESSION_COOKIE}={token}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax{}",
        if secure {
            "; Secure"
        } else {
            Default::default()
        }
    )
}

pub fn clear_session_cookie(secure: bool) -> String {
    format!(
        "{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax{}",
        if secure {
            "; Secure"
        } else {
            Default::default()
        }
    )
}

// Dedicated machine authorities keep their own middlewares, unchanged.
fn require_bearer(headers: &HeaderMap, expected_hash: [u8; 32]) -> Result<(), ApiError> {
    let token = bearer(headers).ok_or(ApiError::Unauthorized)?;
    let supplied: [u8; 32] = Sha256::digest(token.as_bytes()).into();
    if supplied.ct_eq(&expected_hash).unwrap_u8() != 1 {
        return Err(ApiError::Unauthorized);
    }
    Ok(())
}

pub async fn require_telemetry(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    require_bearer(request.headers(), state.telemetry_token_hash)?;
    Ok(next.run(request).await)
}

pub async fn require_provisioner(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let expected = state.provisioner_token_hash.ok_or(ApiError::Unauthorized)?;
    require_bearer(request.headers(), expected)?;
    Ok(next.run(request).await)
}

/// Machine-to-machine auth for n8n event ingestion. Separate token from
/// admin/telemetry/provisioner so a leaked n8n env cannot touch tenant or
/// provisioning state.
pub async fn require_automation(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let expected = state.automation_token_hash.ok_or(ApiError::Unauthorized)?;
    require_bearer(request.headers(), expected)?;
    Ok(next.run(request).await)
}

#[cfg(test)]
mod tests {
    use super::tenant_slug_from_path;

    #[test]
    fn slug_is_found_with_and_without_the_nested_api_prefix() {
        // Nested routers see the stripped path; the deploy incident proved the
        // prefixed form must not be assumed.
        assert_eq!(
            tenant_slug_from_path("/tenants/virya/operations/summary"),
            Some("virya")
        );
        assert_eq!(
            tenant_slug_from_path("/api/v1/tenants/virya/operations/summary"),
            Some("virya")
        );
        assert_eq!(tenant_slug_from_path("/tenants/virya"), Some("virya"));
        assert_eq!(tenant_slug_from_path("/overview"), None);
        assert_eq!(tenant_slug_from_path("/api/v1/tenants"), None);
    }
}
