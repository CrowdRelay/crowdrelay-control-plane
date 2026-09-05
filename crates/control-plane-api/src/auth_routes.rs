//! Operator session endpoints — the only unauthenticated API surface.
//!
//! `POST /auth/session` verifies a named account and issues an HttpOnly
//! session cookie. When a valid platform-admin bearer is already present
//! (local Vite dev proxy), the endpoint reports the admin identity without
//! touching credentials; in production the edge strips Authorization on this
//! path, so that branch is unreachable there.

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::Deserialize;
use serde_json::json;
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

use crate::{
    AppState,
    auth::{self, Identity, reject_with_pad, resolve_identity},
    error::ApiError,
    validation,
};

/// Naive per-username failure throttle: 5 failures per 5 minutes. State lives
/// only in memory on purpose — nothing durable is protected by it, and a
/// database round-trip per login attempt would widen the timing signal.
fn login_throttle() -> &'static Mutex<HashMap<String, Vec<Instant>>> {
    static THROTTLE: OnceLock<Mutex<HashMap<String, Vec<Instant>>>> = OnceLock::new();
    THROTTLE.get_or_init(|| Mutex::new(HashMap::new()))
}

const MAX_FAILURES: usize = 5;
const FAILURE_WINDOW: Duration = Duration::from_secs(300);

fn prune(window: Instant, entries: &mut Vec<Instant>) {
    entries.retain(|instant| *instant > window);
}

fn record_failure(username: &str) {
    let mut guard = login_throttle()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let cutoff = Instant::now() - FAILURE_WINDOW;
    let entries = guard.entry(username.to_owned()).or_default();
    prune(cutoff, entries);
    if entries.len() < MAX_FAILURES {
        entries.push(Instant::now());
    }
    if guard.len() > 1_000 {
        // Bounded memory: evict excess entries instead of clearing all.
        // Clearing resets every user's throttle window, which an attacker
        // can trigger by flooding distinct usernames.
        let excess = guard.len() - 500;
        let to_remove: Vec<String> = guard.keys().take(excess).cloned().collect();
        for key in to_remove {
            guard.remove(&key);
        }
    }
}

fn throttled(username: &str) -> bool {
    let guard = login_throttle()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let cutoff = Instant::now() - FAILURE_WINDOW;
    guard.get(username).is_some_and(|entries| {
        entries.iter().filter(|instant| **instant > cutoff).count() >= MAX_FAILURES
    })
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/auth/session",
            get(current_session)
                .post(create_session)
                .delete(delete_session),
        )
        .route("/auth/reauth", axum::routing::post(reauth_session))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LoginRequest {
    username: String,
    password: String,
}

async fn create_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<LoginRequest>,
) -> Result<Response, ApiError> {
    let username = validation::username(&input.username)?;
    let password = input.password;

    // Local dev convenience: the Vite proxy injects the admin bearer, which
    // already proves authority without any password. No cookie is issued —
    // every proxied request carries the bearer itself.
    //
    // Only the bearer. `is_platform_admin()` is also true for a *session* held
    // by a platform_admin account, and that made this endpoint answer 201
    // "signed in as platform-admin" to any credentials at all whenever such a
    // session cookie was present — a password prompt that does not check the
    // password. Matching the variant keeps the shortcut to the authority the
    // comment above actually describes.
    if matches!(
        auth::resolve_identity(&state, &headers).await,
        Ok(Identity::PlatformAdmin)
    ) {
        return Ok((
            StatusCode::CREATED,
            Json(
                json!({"username": "platform-admin", "role": "platform_admin", "tenantSlug": null}),
            ),
        )
            .into_response());
    }

    if throttled(&username) {
        return Err(ApiError::Unavailable(
            "too many failed sign-in attempts; try again later".to_owned(),
        ));
    }

    let account = state
        .store
        .find_active_account_with_secret(&username)
        .await?;
    let verified = account
        .as_ref()
        .is_some_and(|account| auth::verify_password(&password, &account.password_hash));
    if !verified {
        reject_with_pad(&password);
        record_failure(&username);
        return Err(ApiError::Unauthorized);
    }
    let account = account.expect("verified implies present");

    let is_mobile = auth::is_mobile_user_agent(&headers);
    let ttl = if is_mobile {
        auth::MOBILE_SESSION_TTL_SECONDS
    } else {
        auth::SESSION_TTL_SECONDS
    };
    let issued = auth::new_session_token(account.id, &state.store, ttl).await?;
    let tenant_slug = match account.tenant_id {
        Some(tenant_id) => state.store.tenant_slug_by_id(tenant_id).await?,
        None => None,
    };
    let mut response = (
        StatusCode::CREATED,
        Json(json!({
            "username": account.username,
            "role": account.role,
            "tenantSlug": tenant_slug,
            "isMobile": is_mobile,
        })),
    )
        .into_response();
    response.headers_mut().append(
        header::SET_COOKIE,
        header::HeaderValue::from_str(&auth::session_cookie_with_ttl(
            &issued.token,
            state.cookie_secure,
            ttl,
        ))
        .map_err(|_| ApiError::InvalidInput("invalid cookie value".to_owned()))?,
    );
    Ok(response)
}

/// Probe used by the SPA on boot to hydrate its profile from the cookie.
/// Returns 200 with a null profile when no session exists — this avoids
/// surfacing a 401 as a console error in the browser, which would show up
/// as a Lighthouse best-practices failure on the login page.
async fn current_session(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<axum::Json<serde_json::Value>, ApiError> {
    match resolve_identity(&state, &headers).await {
        Ok(Identity::PlatformAdmin) => Ok(axum::Json(json!({
            "username": "platform-admin",
            "role": "platform_admin",
            "tenantSlug": null,
        }))),
        Ok(Identity::Account {
            username,
            role,
            tenant_id,
            ..
        }) => {
            let tenant_slug = match tenant_id {
                Some(tenant_id) => state.store.tenant_slug_by_id(tenant_id).await?,
                None => None,
            };
            Ok(axum::Json(json!({
                "username": username,
                "role": role,
                "tenantSlug": tenant_slug,
            })))
        }
        Err(_) => Ok(axum::Json(json!(null))),
    }
}

async fn delete_session(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    const COOKIE_PREFIX: &str = "crowdrelay_cp_session=";
    for value in headers.get_all(header::COOKIE) {
        if let Ok(value) = value.to_str() {
            for pair in value.split(';') {
                let pair = pair.trim();
                if let Some(token) = pair.strip_prefix(COOKIE_PREFIX) {
                    state
                        .store
                        .revoke_session(auth::hash_token(token).as_slice())
                        .await?;
                }
            }
        }
    }
    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().append(
        header::SET_COOKIE,
        header::HeaderValue::from_str(&auth::clear_session_cookie(state.cookie_secure))
            .map_err(|_| ApiError::InvalidInput("invalid cookie value".to_owned()))?,
    );
    Ok(response)
}

/// Re-authentication for destructive mutations from mobile sessions.
///
/// Mobile sessions get a shorter TTL, but a lost phone with a live session
/// can still approve outreach or flip flags. The frontend intercepts a
/// `403 x-reauth-required` response, prompts for the operator's password,
/// and calls this endpoint to prove the human is still the account owner.
/// On success, the session's `last_seen_at` is slid forward (the existing
/// `resolve_session` UPDATE already does this on the next request), and the
/// frontend retries the original mutation.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReauthRequest {
    password: String,
}

async fn reauth_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ReauthRequest>,
) -> Result<axum::Json<serde_json::Value>, ApiError> {
    let identity = auth::resolve_identity(&state, &headers).await?;
    let Identity::Account { username, .. } = &identity else {
        return Err(ApiError::Forbidden(
            "re-authentication requires an operator session".to_owned(),
        ));
    };
    let username = validation::username(username)?;
    // Re-auth is a password prompt like any other, so it carries the same
    // lockout. Without it a stolen phone with a live session had an
    // unthrottled oracle against the owner's password, which is the exact
    // credential this step exists to demand.
    if throttled(&username) {
        return Err(ApiError::Unavailable(
            "too many failed sign-in attempts; try again later".to_owned(),
        ));
    }
    let account = state
        .store
        .find_active_account_with_secret(&username)
        .await?;
    let verified = account
        .as_ref()
        .is_some_and(|account| auth::verify_password(&input.password, &account.password_hash));
    if !verified {
        reject_with_pad(&input.password);
        record_failure(&username);
        return Err(ApiError::Unauthorized);
    }
    Ok(axum::Json(json!({"status": "ok"})))
}
