//! Narrow tenant operations proxy for health, feature controls and Autopilot.
//!
//! CrowdRelay stays canonical for every read model and mutation. The Control
//! Plane only validates a deliberately small transport allowlist, derives the
//! per-tenant credential server-side, and records a redacted platform audit.

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, State},
    http::{HeaderMap, StatusCode, header::CACHE_CONTROL},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    AppState, error::ApiError, store::ControlCommandAudit, tenant_area_client::ManagementRequest,
};

const PRIVATE_NO_STORE: &str = "private, no-store";
const MAX_OPERATIONS_BODY_BYTES: usize = 8 * 1024;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tenants/{slug}/operations/summary", get(summary))
        .route(
            "/tenants/{slug}/operations/dead-deliveries/clear",
            post(clear_dead_deliveries),
        )
        .route("/tenants/{slug}/operations/flags", get(flags))
        .route("/tenants/{slug}/operations/flags/{key}", post(update_flag))
        .route(
            "/tenants/{slug}/operations/autopilot",
            get(autopilot_overview),
        )
        .route(
            "/tenants/{slug}/operations/autopilot/{context}",
            post(update_autopilot),
        )
        .layer(DefaultBodyLimit::max(MAX_OPERATIONS_BODY_BYTES))
}

fn correlation(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .or_else(|| {
            headers
                .get("x-crowdrelay-correlation-id")
                .and_then(|value| value.to_str().ok())
        })
}

fn idempotency_key(headers: &HeaderMap) -> Result<&str, ApiError> {
    let value = headers
        .get("idempotency-key")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| {
            (8..=128).contains(&value.len())
                && value.bytes().all(|byte| (b'!'..=b'~').contains(&byte))
        })
        .ok_or_else(|| ApiError::InvalidInput("valid Idempotency-Key is required".to_owned()))?;
    Ok(value)
}

fn safe_segment(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 96
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
}

fn json_no_store(value: Value) -> Response {
    (
        StatusCode::OK,
        [(CACHE_CONTROL, PRIVATE_NO_STORE)],
        Json(value),
    )
        .into_response()
}

fn object_no_store(value: Value, endpoint: &'static str) -> Result<Response, ApiError> {
    if !value.is_object() {
        return Err(ApiError::Unavailable(format!(
            "tenant operations {endpoint} returned an invalid JSON shape"
        )));
    }
    Ok(json_no_store(value))
}

fn array_no_store(value: Value, endpoint: &'static str) -> Result<Response, ApiError> {
    if !value.is_array() {
        return Err(ApiError::Unavailable(format!(
            "tenant operations {endpoint} returned an invalid JSON shape"
        )));
    }
    Ok(json_no_store(value))
}

async fn call(
    state: &AppState,
    slug: &str,
    method: &str,
    path: &str,
    body: Option<&Value>,
    headers: &HeaderMap,
    idempotency: Option<&str>,
) -> Result<(crate::model::TenantSummary, Value), ApiError> {
    let (tenant, target) = crate::area_routes::target(state, slug).await?;
    let value = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method,
                path,
                body,
                correlation_id: correlation(headers),
                idempotency_key: idempotency,
            },
        )
        .await?;
    Ok((tenant, value))
}

async fn audit_result(
    state: &AppState,
    tenant_id: uuid::Uuid,
    action: &'static str,
    target_kind: &'static str,
    target_id: &str,
    headers: &HeaderMap,
    result: &Result<Value, ApiError>,
) {
    if let Err(error) = state
        .store
        .audit_control_command(ControlCommandAudit {
            tenant_id,
            actor: &state.admin_actor,
            action,
            target_kind,
            target_id,
            request_id: correlation(headers),
            outcome: if result.is_ok() {
                "succeeded"
            } else {
                "failed"
            },
        })
        .await
    {
        tracing::warn!(%error, action, "failed to append redacted tenant operations audit");
    }
}

async fn summary(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/ops/summary",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "summary")
}

async fn clear_dead_deliveries(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: "/v1/control-plane/ops/deliveries/dead/clear",
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.dead_deliveries.cleared",
        "delivery_queue",
        "dead",
        &headers,
        &result,
    )
    .await;
    object_no_store(result?, "dead delivery clear")
}

async fn flags(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/ecosystem/flags",
        None,
        &headers,
        None,
    )
    .await?;
    array_no_store(value, "flags")
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct FlagMutation {
    enabled: bool,
    reason: Option<String>,
    expected_version: i64,
}

async fn update_flag(
    State(state): State<AppState>,
    Path((slug, key)): Path<(String, String)>,
    headers: HeaderMap,
    Json(input): Json<FlagMutation>,
) -> Result<Response, ApiError> {
    if !safe_segment(&key)
        || input.expected_version <= 0
        || input
            .reason
            .as_deref()
            .is_some_and(|reason| reason.trim().len() > 500)
    {
        return Err(ApiError::InvalidInput(
            "invalid feature flag mutation".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let body = json!({
        "enabled": input.enabled,
        "reason": input.reason,
        "expected_version": input.expected_version,
    });
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/ecosystem/flags/{key}"),
                body: Some(&body),
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.feature_flag.updated",
        "feature_flag",
        &key,
        &headers,
        &result,
    )
    .await;
    object_no_store(result?, "flag mutation")
}

async fn autopilot_overview(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/overview",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "autopilot overview")
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AutopilotMutation {
    enabled: bool,
    autonomy_level: String,
    minimum_confidence_basis_points: u16,
    max_actions_24h: u32,
    expected_version: i64,
}

async fn update_autopilot(
    State(state): State<AppState>,
    Path((slug, context)): Path<(String, String)>,
    headers: HeaderMap,
    Json(input): Json<AutopilotMutation>,
) -> Result<Response, ApiError> {
    if !safe_segment(&context)
        || !matches!(
            input.autonomy_level.as_str(),
            "observe" | "recommend" | "require_approval" | "bounded_auto"
        )
        || input.minimum_confidence_basis_points > 10_000
        || !(1..=1_000).contains(&input.max_actions_24h)
        || input.expected_version <= 0
    {
        return Err(ApiError::InvalidInput(
            "invalid Autopilot policy mutation".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let body = json!({
        "enabled": input.enabled,
        "autonomy_level": input.autonomy_level,
        "minimum_confidence_basis_points": input.minimum_confidence_basis_points,
        "max_actions_24h": input.max_actions_24h,
        "expected_version": input.expected_version,
    });
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/autopilot/policies/{context}"),
                body: Some(&body),
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.autopilot_policy.updated",
        "autopilot_policy",
        &context,
        &headers,
        &result,
    )
    .await;
    object_no_store(result?, "autopilot mutation")
}
