use axum::{
    extract::State,
    http::{Request, header::AUTHORIZATION},
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
    let token = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty())
        .ok_or(ApiError::Unauthorized)?;

    let supplied: [u8; 32] = Sha256::digest(token.as_bytes()).into();
    if supplied.ct_eq(&state.admin_token_hash).unwrap_u8() != 1 {
        return Err(ApiError::Unauthorized);
    }

    Ok(next.run(request).await)
}
