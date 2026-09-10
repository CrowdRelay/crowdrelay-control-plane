//! Public waitlist endpoints for the landing page.
//!
//! These routes are unauthenticated (no bearer token, no session) and
//! CORS-enabled for the landing origin. The landing page on
//! `crowdrelay.music` POSTs here when a visitor applies for early access.
//!
//! Flow:
//! 1. `POST /waitlist/apply` — email + optional referral code → applicant row
//! 2. `POST /waitlist/qualify` — role + roster size + fan sources → qualified
//! 3. `GET  /waitlist/status/:id` — poll applicant state
//!
//! High-fit rule: manager/label/festival with 2+ artists → book a call.
//! Everyone else → wait for their group to open, with a referral link
//! that moves them up when confirmed.

use axum::{
    Json, Router,
    extract::{Path, State},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{AppState, error::ApiError};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyRequest {
    pub email: String,
    #[serde(default)]
    pub newsletter_opt_in: bool,
    pub ref_code: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QualifyRequest {
    pub id: Uuid,
    pub role: String,
    pub roster_size: String,
    pub fan_sources: Vec<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/waitlist/apply", post(apply))
        .route("/waitlist/qualify", post(qualify))
        .route("/waitlist/status/{id}", get(status))
}

/// CORS middleware: checks the Origin header against the allowed landing
/// origins stored in AppState. Handles OPTIONS preflight with 204.
pub async fn cors_middleware(
    State(state): State<AppState>,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    use axum::http::{Method, StatusCode, header};
    use axum::response::IntoResponse;

    let origin = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_owned());
    let is_preflight = request.method() == Method::OPTIONS;

    let mut response = if is_preflight {
        StatusCode::NO_CONTENT.into_response()
    } else {
        next.run(request).await
    };

    if let Some(ref origin) = origin {
        if state
            .allowed_landing_origins
            .iter()
            .any(|allowed| allowed == origin)
        {
            let headers = response.headers_mut();
            if let Ok(val) = axum::http::HeaderValue::from_str(origin) {
                headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, val);
            }
            headers.insert(
                header::ACCESS_CONTROL_ALLOW_METHODS,
                axum::http::HeaderValue::from_static("GET, POST, OPTIONS"),
            );
            headers.insert(
                header::ACCESS_CONTROL_ALLOW_HEADERS,
                axum::http::HeaderValue::from_static("Content-Type"),
            );
            headers.insert(
                header::ACCESS_CONTROL_MAX_AGE,
                axum::http::HeaderValue::from_static("86400"),
            );
        }
    }

    response
}

async fn apply(
    State(state): State<AppState>,
    Json(req): Json<ApplyRequest>,
) -> Result<Json<Value>, ApiError> {
    let email = req.email.trim().to_lowercase();
    if !is_valid_email(&email) {
        return Err(ApiError::InvalidInput(
            "enter a valid email address".to_owned(),
        ));
    }
    if email.len() > 320 {
        return Err(ApiError::InvalidInput("email is too long".to_owned()));
    }

    let referred_by = match req.ref_code.as_deref() {
        Some(code) if !code.is_empty() => state
            .store
            .get_waitlist_applicant_by_referral(code)
            .await?
            .map(|r| r.id),
        _ => None,
    };

    let applicant = state
        .store
        .create_waitlist_applicant(&email, req.newsletter_opt_in, referred_by)
        .await?;

    let already_existed = applicant.status == "pending"
        && applicant.role.is_none()
        && applicant.created_at != applicant.updated_at;

    Ok(Json(json!({
        "id": applicant.id,
        "status": applicant.status,
        "referralCode": applicant.referral_code,
        "alreadyExists": already_existed,
    })))
}

async fn qualify(
    State(state): State<AppState>,
    Json(req): Json<QualifyRequest>,
) -> Result<Json<Value>, ApiError> {
    let valid_roles = ["artist", "manager", "festival", "other"];
    if !valid_roles.contains(&req.role.as_str()) {
        return Err(ApiError::InvalidInput(format!(
            "role must be one of: {}",
            valid_roles.join(", ")
        )));
    }
    let valid_roster = ["solo", "2-5", "6-20", "20+"];
    if !valid_roster.contains(&req.roster_size.as_str()) {
        return Err(ApiError::InvalidInput(format!(
            "rosterSize must be one of: {}",
            valid_roster.join(", ")
        )));
    }
    if req.fan_sources.is_empty() {
        return Err(ApiError::InvalidInput(
            "select at least one fan source".to_owned(),
        ));
    }

    let existing = state
        .store
        .get_waitlist_applicant_by_id(req.id)
        .await?
        .ok_or(ApiError::NotFound)?;

    if existing.status == "invited" || existing.status == "declined" {
        return Err(ApiError::Conflict("applicant already processed".to_owned()));
    }

    let applicant = state
        .store
        .qualify_waitlist_applicant(req.id, &req.role, &req.roster_size, &req.fan_sources)
        .await?;

    let high_fit = is_high_fit(&req.role, &req.roster_size);
    let referral_count = state
        .store
        .count_confirmed_referrals(applicant.id)
        .await
        .unwrap_or(0);

    Ok(Json(json!({
        "id": applicant.id,
        "status": applicant.status,
        "referralCode": applicant.referral_code,
        "highFit": high_fit,
        "confirmedReferrals": referral_count,
    })))
}

async fn status(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let applicant = state
        .store
        .get_waitlist_applicant_by_id(id)
        .await?
        .ok_or(ApiError::NotFound)?;

    let high_fit = applicant
        .role
        .as_deref()
        .zip(applicant.roster_size.as_deref())
        .map(|(role, roster)| is_high_fit(role, roster))
        .unwrap_or(false);
    let referral_count = state
        .store
        .count_confirmed_referrals(applicant.id)
        .await
        .unwrap_or(0);

    Ok(Json(json!({
        "id": applicant.id,
        "status": applicant.status,
        "referralCode": applicant.referral_code,
        "highFit": high_fit,
        "confirmedReferrals": referral_count,
        "qualified": applicant.qualified_at.is_some(),
    })))
}

/// High-fit: manager, label, or festival working with 2+ artists.
/// These applicants get routed to a booking call instead of the wait.
fn is_high_fit(role: &str, roster_size: &str) -> bool {
    matches!(role, "manager" | "festival") && matches!(roster_size, "2-5" | "6-20" | "20+")
}

fn is_valid_email(email: &str) -> bool {
    let at = email.rfind('@');
    match at {
        Some(at_idx) => {
            let local = &email[..at_idx];
            let domain = &email[at_idx + 1..];
            !local.is_empty()
                && !domain.is_empty()
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
        }
        None => false,
    }
}
