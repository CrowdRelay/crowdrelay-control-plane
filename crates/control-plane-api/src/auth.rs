use axum::{
    extract::State,
    http::{HeaderMap, Request, header::AUTHORIZATION},
    middleware::Next,
    response::Response,
};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

use crate::{AppState, error::ApiError};

pub async fn require_admin(
    State(state): State<AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, ApiError> {
    require_bearer(request.headers(), state.admin_token_hash)?;
    Ok(next.run(request).await)
}

pub async fn require_telemetry(
    State(state): State<AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, ApiError> {
    require_bearer(request.headers(), state.telemetry_token_hash)?;
    Ok(next.run(request).await)
}

fn require_bearer(headers: &HeaderMap, expected_hash: [u8; 32]) -> Result<(), ApiError> {
    verify(bearer(headers), expected_hash)
}

fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty())
}

fn verify(token: Option<&str>, expected_hash: [u8; 32]) -> Result<(), ApiError> {
    let token = token.ok_or(ApiError::Unauthorized)?;
    let supplied: [u8; 32] = Sha256::digest(token.as_bytes()).into();
    if supplied.ct_eq(&expected_hash).unwrap_u8() != 1 {
        return Err(ApiError::Unauthorized);
    }
    Ok(())
}
