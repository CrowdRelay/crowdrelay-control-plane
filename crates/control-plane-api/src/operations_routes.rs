//! Narrow tenant operations proxy for health, maintenance, feature controls and Autopilot.
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
use uuid::Uuid;

use crate::{
    AppState, error::ApiError, store::ControlCommandAudit, tenant_area_client::ManagementRequest,
};

const PRIVATE_NO_STORE: &str = "private, no-store";
const MAX_OPERATIONS_BODY_BYTES: usize = 8 * 1024;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tenants/{slug}/operations/summary", get(summary))
        .route(
            "/tenants/{slug}/operations/outbox/{event_id}/retry",
            post(retry_outbox),
        )
        .route(
            "/tenants/{slug}/operations/deliveries/{delivery_id}",
            get(delivery_details),
        )
        .route(
            "/tenants/{slug}/operations/deliveries/{delivery_id}/retry",
            post(retry_delivery),
        )
        .route(
            "/tenants/{slug}/operations/dead-deliveries/clear",
            post(clear_dead_deliveries),
        )
        .route(
            "/tenants/{slug}/operations/timeline/{request_id}",
            get(operation_timeline),
        )
        .route(
            "/tenants/{slug}/operations/reconcile",
            post(run_reconciliation),
        )
        .route("/tenants/{slug}/operations/flags", get(flags))
        .route("/tenants/{slug}/operations/flags/{key}", post(update_flag))
        .route(
            "/tenants/{slug}/operations/autopilot",
            get(autopilot_overview),
        )
        .route(
            "/tenants/{slug}/operations/autopilot/bulk",
            post(bulk_autopilot),
        )
        .route("/tenants/{slug}/operations/growth", get(autopilot_growth))
        // Portfolio reads live in read_models::portfolio as one consolidated
        // model; only the mutations are routed here.
        .route(
            "/tenants/{slug}/portfolio/amplification/{consent_id}/decide",
            post(decide_portfolio_amplification),
        )
        .route(
            "/tenants/{slug}/portfolio/settings/{setting_key}",
            post(update_portfolio_setting),
        )
        .route(
            "/tenants/{slug}/portfolio/fanbases",
            post(create_portfolio_fanbase),
        )
        .route(
            "/tenants/{slug}/portfolio/fanbases/{fanbase_id}/ingest",
            post(ingest_portfolio_fanbase),
        )
        .route(
            "/tenants/{slug}/operations/autopilot/{context}",
            post(update_autopilot),
        )
        .route(
            "/tenants/{slug}/operations/opportunities/actions/{action_id}/approve",
            post(approve_opportunity),
        )
        .route(
            "/tenants/{slug}/operations/opportunities/decisions/{decision_id}/handled-externally",
            post(handle_opportunity_externally),
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
    headers
        .get("idempotency-key")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| {
            (8..=128).contains(&value.len())
                && value.bytes().all(|byte| (b'!'..=b'~').contains(&byte))
        })
        .ok_or_else(|| ApiError::InvalidInput("valid Idempotency-Key is required".to_owned()))
}

fn safe_segment(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 96
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
}

fn uuid_segment(value: &str) -> Result<&str, ApiError> {
    Uuid::parse_str(value)
        .map(|_| value)
        .map_err(|_| ApiError::InvalidInput("valid UUID is required".to_owned()))
}

fn correlation_segment(value: &str) -> Result<&str, ApiError> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
    {
        return Err(ApiError::InvalidInput(
            "valid request/correlation id is required".to_owned(),
        ));
    }
    Ok(value)
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
            target_id: target_id.to_owned(),
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

async fn delivery_details(
    State(state): State<AppState>,
    Path((slug, delivery_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let delivery_id = uuid_segment(&delivery_id)?;
    let path = format!("/v1/control-plane/ops/deliveries/{delivery_id}");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "delivery details")
}

async fn operation_timeline(
    State(state): State<AppState>,
    Path((slug, request_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let request_id = correlation_segment(&request_id)?;
    let path = format!("/v1/control-plane/ops/operations/{request_id}");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "operation timeline")
}

async fn retry_outbox(
    State(state): State<AppState>,
    Path((slug, event_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let event_id = uuid_segment(&event_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/ops/outbox/{event_id}/retry"),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.dead_outbox.retried",
        "outbox_event",
        &event_id,
        &headers,
        &result,
    )
    .await;
    object_no_store(result?, "outbox retry")
}

async fn retry_delivery(
    State(state): State<AppState>,
    Path((slug, delivery_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let delivery_id = uuid_segment(&delivery_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/ops/deliveries/{delivery_id}/retry"),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.dead_delivery.retried",
        "webhook_delivery",
        &delivery_id,
        &headers,
        &result,
    )
    .await;
    object_no_store(result?, "delivery retry")
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

async fn run_reconciliation(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let body = json!({ "trigger": "manual" });
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: "/v1/control-plane/ecosystem/reconcile",
                body: Some(&body),
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.ecosystem.reconciled",
        "ecosystem",
        "manual",
        &headers,
        &result,
    )
    .await;
    object_no_store(result?, "ecosystem reconciliation")
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
    let reason = input
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|reason| !reason.is_empty())
        .map(str::to_owned);
    let body = json!({
        "enabled": input.enabled,
        "reason": reason,
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

/// Delivery-side growth progress. Read-only: the Control Plane never claims or
/// completes a delivery, so no idempotency key is involved.
async fn autopilot_growth(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/growth",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "autopilot growth")
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BulkAutopilotMutation {
    enabled: bool,
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

/// Killswitch / full-enable for every Autopilot policy at once.
///
/// CrowdRelay stays canonical: the upstream overview provides each policy's
/// current version and settings, and this proxy re-posts every policy with
/// its own fresh `expected_version`. Partial failures are reported
/// per-policy instead of failing silently or inventing a second authority.
async fn bulk_autopilot(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(input): Json<BulkAutopilotMutation>,
) -> Result<Response, ApiError> {
    let base_idempotency = idempotency_key(&headers)?.to_owned();
    let (_, overview) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/overview",
        None,
        &headers,
        None,
    )
    .await?;
    let policies = overview
        .get("policies")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let mut results = Vec::with_capacity(policies.len());
    for policy in &policies {
        let context = policy
            .get("context")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                ApiError::Unavailable("autopilot policy is missing context".to_owned())
            })?;
        if !safe_segment(context) {
            results.push(json!({"context": context, "ok": false, "error": "invalid context"}));
            continue;
        }
        let expected_version = policy.get("version").and_then(Value::as_i64);
        let Some(expected_version) = expected_version.filter(|version| *version > 0) else {
            results.push(
                json!({"context": context, "ok": false, "error": "policy is missing version"}),
            );
            continue;
        };
        let body = json!({
            "enabled": input.enabled,
            "autonomy_level": policy.get("autonomy_level"),
            "minimum_confidence_basis_points": policy.get("minimum_confidence_basis_points"),
            "max_actions_24h": policy.get("max_actions_24h"),
            "expected_version": expected_version,
        });
        // Distinct per-policy key: one operator intent fans out into several
        // upstream mutations, each of which must be individually retryable.
        let derived_key = format!("{base_idempotency}:{context}");
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
                    idempotency_key: Some(derived_key.as_str()),
                },
            )
            .await;
        match result {
            Ok(_) => results.push(json!({"context": context, "ok": true})),
            Err(error) => results.push(json!({
                "context": context,
                "ok": false,
                "error": error.to_string(),
            })),
        }
    }
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.autopilot_policy.bulk_updated",
        "autopilot_policy",
        "bulk",
        &headers,
        &Ok::<Value, ApiError>(json!({"enabled": input.enabled, "count": results.len()})),
    )
    .await;
    object_no_store(
        json!({
            "enabled": input.enabled,
            "updated": results.iter().filter(|r| r["ok"] == json!(true)).count(),
            "results": results,
        }),
        "bulk autopilot mutation",
    )
}

/// "Do it": approve the parked action of one finding through CrowdRelay's
/// canonical approval endpoint. The Control Plane adds only transport
/// validation, the derived per-tenant credential and this audit row — never a
/// second authority path. The upstream mutation takes no body.
async fn approve_opportunity(
    State(state): State<AppState>,
    Path((slug, action_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let action_id = uuid_segment(&action_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/autopilot/actions/{action_id}/approve"),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.autopilot_action.approved",
        "autopilot_action",
        &action_id,
        &headers,
        &result,
    )
    .await;
    object_no_store(result?, "opportunity approval")
}

/// "Done ourselves": record that a human handled the finding outside the
/// system — a first-class outcome, not a dismissal.
async fn handle_opportunity_externally(
    State(state): State<AppState>,
    Path((slug, decision_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let decision_id = uuid_segment(&decision_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!(
                    "/v1/control-plane/autopilot/decisions/{decision_id}/handled-externally"
                ),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.autopilot_decision.handled_externally",
        "autopilot_decision",
        &decision_id,
        &headers,
        &result,
    )
    .await;
    object_no_store(result?, "opportunity handled externally")
}

/// Approve / pause / resume / revoke one edge. The upstream handler owns the
/// transition policy; this proxy only carries the operator's decision.
async fn decide_portfolio_amplification(
    State(state): State<AppState>,
    Path((slug, consent_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let consent_id = uuid_segment(&consent_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    if !body.is_object() || body.get("action").and_then(Value::as_str).is_none() {
        return Err(ApiError::InvalidInput("action is required".to_owned()));
    }
    let path = format!("/v1/control-plane/portfolio/amplification/{consent_id}/decide");
    // Transport errors propagate unaudited, mirroring the other proxies;
    // the decision outcome itself always lands in the platform audit.
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.portfolio_edge.decided",
        "amplification_consent",
        &consent_id,
        &headers,
        &result,
    )
    .await;
    object_no_store(value, "portfolio edge decision")
}

/// Upserts one brand override; upstream validates the key allowlist and
/// invalidates its read cache.
async fn update_portfolio_setting(
    State(state): State<AppState>,
    Path((slug, setting_key)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let trimmed = setting_key.trim();
    let key_ok = !trimmed.is_empty()
        && trimmed.len() <= 96
        && trimmed
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte == b'_');
    if !key_ok {
        return Err(ApiError::InvalidInput(
            "valid setting key is required".to_owned(),
        ));
    }
    if !body.is_object()
        || body
            .get("value")
            .and_then(Value::as_str)
            .map(str::trim)
            .is_none_or(str::is_empty)
    {
        return Err(ApiError::InvalidInput("value is required".to_owned()));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path = format!("/v1/control-plane/tenant-settings/{trimmed}");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.portfolio_setting.updated",
        "tenant_setting",
        trimmed,
        &headers,
        &result,
    )
    .await;
    object_no_store(value, "portfolio setting update")
}

/// Registers a new audience block with its acquisition origin.
async fn create_portfolio_fanbase(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/fanbases",
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.fanbase.created",
        "fanbase",
        value
            .get("fanbaseId")
            .and_then(Value::as_str)
            .unwrap_or("unknown"),
        &headers,
        &result,
    )
    .await;
    object_no_store(value, "portfolio fanbase create")
}

/// Pushes one provider batch through admission on the upstream tenant.
async fn ingest_portfolio_fanbase(
    State(state): State<AppState>,
    Path((slug, fanbase_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let fanbase_id = uuid_segment(&fanbase_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    if !body.is_object()
        || !body
            .get("entries")
            .and_then(Value::as_array)
            .is_some_and(|e| !e.is_empty())
    {
        return Err(ApiError::InvalidInput("entries are required".to_owned()));
    }
    let path = format!("/v1/control-plane/fanbases/{fanbase_id}/ingest");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.fanbase.ingested",
        "fanbase",
        &fanbase_id,
        &headers,
        &result,
    )
    .await;
    object_no_store(value, "portfolio fanbase ingest")
}
