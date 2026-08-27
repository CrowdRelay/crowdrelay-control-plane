//! Proxy routes for the agent service. The control plane resolves the
//! tenant slug to a workspace_id, derives an HMAC token, and forwards
//! to the agent service. No business logic here — just transport.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode, header::CACHE_CONTROL},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde_json::Value;
use std::collections::HashMap;
use uuid::Uuid;

use crate::{AppState, error::ApiError};

const PRIVATE_NO_STORE: &str = "private, no-store";
const MAX_AGENT_BODY_BYTES: usize = 16 * 1024;

/// Resolve the crowdrelay workspace_id for a tenant. Falls back to the
/// control plane tenant ID when the crowdrelay link is not set.
fn resolve_workspace_id(tenant: &crate::model::TenantSummary) -> Uuid {
    tenant.tenant.workspace_id.unwrap_or(tenant.tenant.id)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tenants/{slug}/agents/templates", get(list_templates))
        .route(
            "/tenants/{slug}/agents/templates/{template_id}",
            get(get_template),
        )
        .route(
            "/tenants/{slug}/agents/tasks",
            get(list_tasks).post(create_task),
        )
        .route("/tenants/{slug}/agents/tasks/{task_id}", get(get_task))
        .route(
            "/tenants/{slug}/agents/tasks/{task_id}/result",
            get(get_task_result),
        )
        .route("/tenants/{slug}/agents/health", get(agent_health))
        .route("/tenants/{slug}/agents/suggestions", get(agent_suggestions))
        .route("/tenants/{slug}/agents/providers", get(list_providers))
        .route(
            "/tenants/{slug}/agents/credentials",
            get(list_credentials).post(paste_credential),
        )
        .route(
            "/tenants/{slug}/agents/credentials/{provider}",
            axum::routing::delete(delete_credential),
        )
        .route(
            "/tenants/{slug}/agents/credentials/{provider}/validate",
            post(validate_credential),
        )
        .route("/tenants/{slug}/agents/models", get(list_models))
        .route(
            "/tenants/{slug}/agents/oauth/google/start",
            get(oauth_google_start),
        )
        .route(
            "/tenants/{slug}/agents/oauth/google/callback",
            get(oauth_google_callback),
        )
        .layer(axum::extract::DefaultBodyLimit::max(MAX_AGENT_BODY_BYTES))
}

fn no_store(value: Value) -> Response {
    (
        StatusCode::OK,
        [(CACHE_CONTROL.as_str(), PRIVATE_NO_STORE)],
        Json(value),
    )
        .into_response()
}

async fn proxy_get(state: &AppState, slug: &str, path: &str) -> Result<Response, ApiError> {
    let (tenant, _) = crate::area_routes::target(state, slug).await?;
    let base = state
        .agent_service_url
        .as_deref()
        .ok_or_else(|| ApiError::Unavailable("agent service is not configured".to_owned()))?;
    let workspace_id = resolve_workspace_id(&tenant);
    let token = state.area_client.derived_management_token(workspace_id)?;
    let url = format!("{base}{path}");
    let response = reqwest::Client::new()
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("X-Workspace-Id", workspace_id.to_string())
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| ApiError::Unavailable(format!("agent service unreachable: {e}")))?;
    let body: Value = response
        .json()
        .await
        .map_err(|e| ApiError::Unavailable(format!("agent service returned invalid JSON: {e}")))?;
    Ok(no_store(body))
}

async fn proxy_post(
    state: &AppState,
    slug: &str,
    path: &str,
    body: Value,
) -> Result<Response, ApiError> {
    let (tenant, _) = crate::area_routes::target(state, slug).await?;
    let base = state
        .agent_service_url
        .as_deref()
        .ok_or_else(|| ApiError::Unavailable("agent service is not configured".to_owned()))?;
    let workspace_id = resolve_workspace_id(&tenant);
    let token = state.area_client.derived_management_token(workspace_id)?;
    let url = format!("{base}{path}");
    let response = reqwest::Client::new()
        .post(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("X-Workspace-Id", workspace_id.to_string())
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| ApiError::Unavailable(format!("agent service unreachable: {e}")))?;
    let status =
        StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let response_body: Value = response
        .json()
        .await
        .map_err(|e| ApiError::Unavailable(format!("agent service returned invalid JSON: {e}")))?;
    Ok((
        status,
        [(CACHE_CONTROL.as_str(), PRIVATE_NO_STORE)],
        Json(response_body),
    )
        .into_response())
}

async fn proxy_delete(state: &AppState, slug: &str, path: &str) -> Result<Response, ApiError> {
    let (tenant, _) = crate::area_routes::target(state, slug).await?;
    let base = state
        .agent_service_url
        .as_deref()
        .ok_or_else(|| ApiError::Unavailable("agent service is not configured".to_owned()))?;
    let workspace_id = resolve_workspace_id(&tenant);
    let token = state.area_client.derived_management_token(workspace_id)?;
    let url = format!("{base}{path}");
    let response = reqwest::Client::new()
        .delete(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("X-Workspace-Id", workspace_id.to_string())
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| ApiError::Unavailable(format!("agent service unreachable: {e}")))?;
    let status =
        StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    if status == StatusCode::NO_CONTENT {
        return Ok((status, [(CACHE_CONTROL.as_str(), PRIVATE_NO_STORE)]).into_response());
    }
    let body: Value = response
        .json()
        .await
        .map_err(|e| ApiError::Unavailable(format!("agent service returned invalid JSON: {e}")))?;
    Ok((
        status,
        [(CACHE_CONTROL.as_str(), PRIVATE_NO_STORE)],
        Json(body),
    )
        .into_response())
}

async fn list_templates(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    _headers: HeaderMap,
) -> Result<Response, ApiError> {
    proxy_get(&state, &slug, "/templates").await
}

async fn get_template(
    State(state): State<AppState>,
    Path((slug, template_id)): Path<(String, String)>,
    _headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = format!("/templates/{template_id}");
    proxy_get(&state, &slug, &path).await
}

async fn list_tasks(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    _headers: HeaderMap,
) -> Result<Response, ApiError> {
    proxy_get(&state, &slug, "/tasks").await
}

async fn create_task(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    _headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    proxy_post(&state, &slug, "/tasks", body).await
}

async fn get_task(
    State(state): State<AppState>,
    Path((slug, task_id)): Path<(String, String)>,
    _headers: HeaderMap,
) -> Result<Response, ApiError> {
    // Validate task_id is a UUID
    Uuid::parse_str(&task_id)
        .map_err(|_| ApiError::InvalidInput("valid task UUID is required".to_owned()))?;
    let path = format!("/tasks/{task_id}");
    proxy_get(&state, &slug, &path).await
}

async fn get_task_result(
    State(state): State<AppState>,
    Path((slug, task_id)): Path<(String, String)>,
    _headers: HeaderMap,
) -> Result<Response, ApiError> {
    Uuid::parse_str(&task_id)
        .map_err(|_| ApiError::InvalidInput("valid task UUID is required".to_owned()))?;
    let path = format!("/tasks/{task_id}/result");
    proxy_get(&state, &slug, &path).await
}

async fn agent_health(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    _headers: HeaderMap,
) -> Result<Response, ApiError> {
    proxy_get(&state, &slug, "/health/providers").await
}

async fn agent_suggestions(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    _headers: HeaderMap,
) -> Result<Response, ApiError> {
    proxy_get(&state, &slug, "/suggestions").await
}

async fn list_providers(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    _headers: HeaderMap,
) -> Result<Response, ApiError> {
    proxy_get(&state, &slug, "/providers").await
}

async fn list_credentials(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    _headers: HeaderMap,
) -> Result<Response, ApiError> {
    proxy_get(&state, &slug, "/credentials").await
}

async fn paste_credential(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    _headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    proxy_post(&state, &slug, "/credentials", body).await
}

async fn delete_credential(
    State(state): State<AppState>,
    Path((slug, provider)): Path<(String, String)>,
    _headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = format!("/credentials/{provider}");
    proxy_delete(&state, &slug, &path).await
}

async fn validate_credential(
    State(state): State<AppState>,
    Path((slug, provider)): Path<(String, String)>,
    _headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = format!("/credentials/{provider}/validate");
    proxy_post(&state, &slug, &path, serde_json::json!({})).await
}

async fn list_models(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    _headers: HeaderMap,
) -> Result<Response, ApiError> {
    proxy_get(&state, &slug, "/models").await
}

async fn oauth_google_start(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    _headers: HeaderMap,
) -> Result<Response, ApiError> {
    proxy_get(&state, &slug, "/oauth/google/start").await
}

async fn oauth_google_callback(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Query(query): Query<HashMap<String, String>>,
    _headers: HeaderMap,
) -> Result<Response, ApiError> {
    let qs: String = query
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("&");
    let path = format!("/oauth/google/callback?{qs}");
    proxy_get(&state, &slug, &path).await
}
