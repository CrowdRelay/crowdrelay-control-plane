use axum::{
    Json, Router,
    extract::{Path, State},
    routing::get,
};
use serde_json::json;

use crate::{AppState, error::ApiError, validation};

pub fn router() -> Router<AppState> {
    Router::new().route("/tenants/{slug}/runtime", get(runtime_snapshot))
}

async fn runtime_snapshot(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let tenant = state.store.tenant_by_slug(&slug).await?;
    Ok(Json(json!({
        "runtime": tenant.runtime,
        "runtimeHealth": tenant.runtime_health,
    })))
}
