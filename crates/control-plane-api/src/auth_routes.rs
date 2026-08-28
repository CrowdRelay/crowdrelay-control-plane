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
        guard.clear(); // bounded memory; resetting windows is acceptable
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
    Router::new().route(
        "/auth/session",
        get(current_session)
            .post(create_session)
            .delete(delete_session),
    )
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
    if auth::resolve_identity(&state, &headers)
        .await
        .map(|identity| identity.is_platform_admin())
        .unwrap_or_default()
    {
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

    let issued = auth::new_session_token(account.id, &state.store).await?;
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
        })),
    )
        .into_response();
    response.headers_mut().append(
        header::SET_COOKIE,
        header::HeaderValue::from_str(&auth::session_cookie(&issued.token, state.cookie_secure))
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
