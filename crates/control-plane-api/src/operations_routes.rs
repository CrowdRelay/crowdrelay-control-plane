//! Narrow tenant operations proxy for health, maintenance, feature controls and Autopilot.
//!
//! CrowdRelay stays canonical for every read model and mutation. The Control
//! Plane only validates a deliberately small transport allowlist, derives the
//! per-tenant credential server-side, and records a redacted platform audit.

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, Query, State},
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
            "/tenants/{slug}/operations/signal-overview",
            get(signal_overview),
        )
        .route("/tenants/{slug}/operations/outbox", get(list_outbox))
        .route(
            "/tenants/{slug}/operations/outbox/{event_id}/retry",
            post(retry_outbox),
        )
        .route(
            "/tenants/{slug}/operations/deliveries",
            get(list_deliveries),
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
            "/tenants/{slug}/operations/push/{delivery_id}/retry",
            post(retry_push),
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
            "/tenants/{slug}/operations/trace/{trace_id}",
            get(trace_timeline),
        )
        .route("/tenants/{slug}/operations/actions", get(list_actions))
        .route(
            "/tenants/{slug}/operations/actions/{action_id}",
            get(get_action),
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
        .route(
            "/tenants/{slug}/operations/autopilot/cycle/preview",
            get(autopilot_cycle_preview),
        )
        .route(
            "/tenants/{slug}/operations/autopilot/cycle/run",
            post(autopilot_cycle_run),
        )
        .route(
            "/tenants/{slug}/operations/autopilot/scorecard",
            get(autopilot_scorecard),
        )
        .route(
            "/tenants/{slug}/operations/autopilot/reply-triage",
            get(autopilot_reply_triage),
        )
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
            "/tenants/{slug}/portfolio/fanbases/{fanbase_id}",
            axum::routing::delete(delete_portfolio_fanbase),
        )
        .route(
            "/tenants/{slug}/portfolio/fanbases/{fanbase_id}/ingest",
            post(ingest_portfolio_fanbase),
        )
        .route(
            "/tenants/{slug}/portfolio/fanbases/connections",
            get(list_fanbase_connections),
        )
        .route(
            "/tenants/{slug}/portfolio/fanbases/connections/{connection_id}",
            axum::routing::delete(delete_fanbase_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/discord",
            post(create_discord_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/telegram",
            post(create_telegram_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/lastfm",
            post(create_lastfm_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/deezer",
            post(create_deezer_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/discogs",
            post(create_discogs_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/bluesky",
            post(create_bluesky_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/bandcamp",
            post(create_bandcamp_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/youtube",
            post(create_youtube_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/facebook",
            post(create_facebook_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/instagram",
            post(create_instagram_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/soundcloud",
            post(create_soundcloud_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/reddit",
            post(create_reddit_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/communities",
            get(list_communities),
        )
        .route(
            "/tenants/{slug}/portfolio/communities/{place_id}/observations",
            get(list_community_observations),
        )
        .route(
            "/tenants/{slug}/portfolio/communities/{place_id}/entities",
            get(list_community_entities),
        )
        .route(
            "/tenants/{slug}/notifiers/discovered",
            get(discovered_notifier_endpoints),
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
            "/tenants/{slug}/operations/opportunities/actions/{action_id}/cancel",
            post(cancel_opportunity),
        )
        .route(
            "/tenants/{slug}/operations/opportunities/decisions/{decision_id}/handled-externally",
            post(handle_opportunity_externally),
        )
        // Decision evidence: structured "why this decision" data.
        // Read-only proxy to CrowdRelay's decision evidence read model.
        .route(
            "/tenants/{slug}/operations/decisions/{decision_id}/evidence",
            get(decision_evidence),
        )
        // Learning loop: last 20 decisions with actions and outcomes.
        // Read-only proxy to CrowdRelay's learning loop read model.
        .route(
            "/tenants/{slug}/operations/learning-loop",
            get(learning_loop),
        )
        // ── Audience intelligence (read-only proxies) ───────────────────
        .route("/tenants/{slug}/audience/overview", get(audience_overview))
        .route("/tenants/{slug}/audience/fans", get(audience_fans))
        .route(
            "/tenants/{slug}/audience/fans/{fan_id}",
            get(audience_fan_detail),
        )
        .route(
            "/tenants/{slug}/audience/fans/{fan_id}/journey",
            get(audience_fan_journey),
        )
        .route("/tenants/{slug}/audience/segments", get(audience_segments))
        .route(
            "/tenants/{slug}/audience/segments/{slug_segment}/preview",
            get(audience_segment_preview),
        )
        // ── Growth metrics, objectives, posture (read + mutate) ────────
        .route(
            "/tenants/{slug}/operations/growth-metrics/coverage",
            get(growth_metric_coverage),
        )
        .route(
            "/tenants/{slug}/operations/growth-metrics/trends",
            get(growth_metric_trends),
        )
        .route(
            "/tenants/{slug}/operations/objectives",
            get(growth_objectives).post(declare_growth_objective),
        )
        .route(
            "/tenants/{slug}/operations/objectives/{objective_id}/retire",
            post(retire_growth_objective),
        )
        .route(
            "/tenants/{slug}/operations/posture",
            get(growth_posture).post(set_growth_posture),
        )
        .route(
            "/tenants/{slug}/operations/acquisition-channels",
            get(acquisition_channels),
        )
        .route(
            "/tenants/{slug}/operations/tour-economics",
            get(tour_economics),
        )
        .route(
            "/tenants/{slug}/operations/show-economics",
            get(show_economics),
        )
        .route(
            "/tenants/{slug}/operations/chief-of-staff",
            get(chief_of_staff),
        )
        // ── Outreach & booking discovery (candidate queues) ────────────
        .route(
            "/tenants/{slug}/operations/outreach/candidates",
            get(outreach_candidates),
        )
        .route(
            "/tenants/{slug}/operations/outreach/candidates/{candidate_id}/confirm",
            post(confirm_outreach_candidate),
        )
        .route(
            "/tenants/{slug}/operations/booking-discovery/candidates",
            get(booking_candidates),
        )
        .route(
            "/tenants/{slug}/operations/booking-discovery/candidates/{candidate_id}/confirm",
            post(confirm_booking_candidate),
        )
        // ── Beacon signal network (press & industry pipeline) ──────────
        .route(
            "/tenants/{slug}/operations/beacon-signal",
            get(beacon_signal_dashboard),
        )
        .route(
            "/tenants/{slug}/operations/beacon-signal/candidates",
            get(beacon_signal_candidates),
        )
        .route(
            "/tenants/{slug}/operations/beacon-press-requests",
            get(beacon_press_requests),
        )
        .route(
            "/tenants/{slug}/operations/beacon-press-requests/{press_request_id}/resolve",
            post(resolve_beacon_press_request),
        )
        .route(
            "/tenants/{slug}/operations/beacon-press-assets",
            get(beacon_press_assets),
        )
        .route(
            "/tenants/{slug}/operations/beacon-signal-engagements",
            get(beacon_signal_engagements),
        )
        .route(
            "/tenants/{slug}/operations/beacon-coverage",
            get(beacon_coverage),
        )
        .route(
            "/tenants/{slug}/operations/beacon-network",
            get(beacon_network),
        )
        // ── Release campaigns ─────────────────────────────────────────
        .route(
            "/tenants/{slug}/operations/beacon-release-campaigns",
            get(beacon_release_campaigns),
        )
        .route(
            "/tenants/{slug}/operations/beacon-release-campaigns/{campaign_id}/launch",
            post(launch_beacon_release_campaign),
        )
        .route(
            "/tenants/{slug}/operations/beacon-release-campaigns/{campaign_id}/close",
            post(close_beacon_release_campaign),
        )
        .route(
            "/tenants/{slug}/operations/beacon-release-campaigns/{campaign_id}/recipients",
            get(beacon_release_recipients),
        )
        // ── Play ledger ───────────────────────────────────────────────
        .route("/tenants/{slug}/operations/plays", get(play_ledger))
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
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_' || byte == b'-'
        })
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

/// Trace timeline: joins all event tables by trace_id to reconstruct the
/// full causal chain of an action lifecycle.
async fn trace_timeline(
    State(state): State<AppState>,
    Path((slug, trace_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let trace_id = uuid_segment(&trace_id)?.to_owned();
    let path = format!("/v1/control-plane/ops/trace/{trace_id}");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "trace timeline")
}

/// Action ledger list: canonical execution state for all autopilot actions.
async fn list_actions(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Query(params): Query<ActionLedgerQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = build_action_ledger_path(&params);
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    array_no_store(value, "action ledger")
}

/// Single action ledger entry.
async fn get_action(
    State(state): State<AppState>,
    Path((slug, action_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let action_id = uuid_segment(&action_id)?.to_owned();
    let path = format!("/v1/control-plane/ops/actions/{action_id}");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "action ledger entry")
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

/// Agent scorecard: is it running, what did it do, did it work.
/// Read-only proxy to CrowdRelay's scorecard read model.
/// What a full autopilot cycle would decide right now. Read-only: nothing is
/// dispatched, so this is safe to poll while an operator decides whether to run.
async fn autopilot_cycle_preview(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/cycle/preview",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "autopilot cycle preview")
}

/// Runs a full autopilot cycle now.
///
/// This dispatches real work — outreach, posts, invites — so it is audited like
/// every other outward-facing operator action, and requires an idempotency key
/// so a double-click cannot queue two cycles.
async fn autopilot_cycle_run(
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
                path: "/v1/control-plane/autopilot/cycle/run",
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.autopilot.cycle_requested",
        "workspace",
        &slug,
        &headers,
        &result,
    )
    .await;
    object_no_store(result?, "autopilot cycle run")
}

async fn autopilot_scorecard(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/scorecard",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "autopilot scorecard")
}

/// Reply triage: which inbound replies need human review, and how recent
/// replies were classified. Read-only proxy to CrowdRelay's reply triage
/// read model.
async fn autopilot_reply_triage(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/reply-triage",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "autopilot reply triage")
}

/// Decision evidence: structured "why this decision" data from the persisted
/// decision row. Read-only proxy to CrowdRelay's decision evidence read model.
async fn decision_evidence(
    State(state): State<AppState>,
    Path((slug, decision_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        &format!("/v1/control-plane/autopilot/decisions/{decision_id}/evidence"),
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "decision evidence")
}

/// Learning loop: last 20 decisions with their actions and outcomes.
/// Read-only proxy to CrowdRelay's learning loop read model.
async fn learning_loop(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/learning-loop",
        None,
        &headers,
        None,
    )
    .await?;
    array_no_store(value, "learning loop")
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

/// Reject / cancel a pending autopilot action so it stops appearing in the
/// approval queue. The brain treats this as a first-class "no" outcome.
async fn cancel_opportunity(
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
                path: &format!("/v1/control-plane/autopilot/actions/{action_id}/cancel"),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.autopilot_action.cancelled",
        "autopilot_action",
        &action_id,
        &headers,
        &result,
    )
    .await;
    object_no_store(result?, "opportunity cancellation")
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

/// Read-only discovery of webhook endpoints already configured in the
/// tenant's CrowdRelay instance. Surfaces them in the Notifiers tab so
/// operators see existing delivery targets before adding a parallel channel.
async fn discovered_notifier_endpoints(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_tenant, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/webhook-endpoints",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "discovered notifier endpoints")
}

/// Signal app install metrics and top cities. Read-only proxy to CrowdRelay's
/// signal overview read model.
async fn signal_overview(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/ops/signal-overview",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "signal overview")
}

/// Paginated outbox list (all statuses). Read-only proxy.
async fn list_outbox(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Query(params): Query<ListQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = build_list_path("/v1/control-plane/ops/outbox", &params);
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    array_no_store(value, "outbox list")
}

/// Paginated webhook delivery list (all statuses). Read-only proxy.
async fn list_deliveries(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Query(params): Query<ListQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = build_list_path("/v1/control-plane/ops/deliveries", &params);
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    array_no_store(value, "deliveries list")
}

/// Retry a dead push delivery. The upstream handler owns the feature flag
/// gate and the row-level transition.
async fn retry_push(
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
                path: &format!("/v1/control-plane/ops/push/{delivery_id}/retry"),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.dead_push.retried",
        "push_delivery",
        &delivery_id,
        &headers,
        &result,
    )
    .await;
    object_no_store(result?, "push retry")
}

/// Delete a fanbase and its dependent rows. The upstream CASCADE handles
/// ingestions and members; fans themselves stay (they belong to the workspace).
async fn delete_portfolio_fanbase(
    State(state): State<AppState>,
    Path((slug, fanbase_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let fanbase_id = uuid_segment(&fanbase_id)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "DELETE",
                path: &format!("/v1/control-plane/fanbases/{fanbase_id}"),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: None,
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.fanbase.deleted",
        "fanbase",
        &fanbase_id,
        &headers,
        &result,
    )
    .await;
    // upstream returns 204 No Content on success
    result?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

#[derive(Debug, Deserialize)]
struct ListQuery {
    limit: Option<u64>,
    status: Option<String>,
}

fn build_list_path(base: &str, params: &ListQuery) -> String {
    let mut query = Vec::new();
    if let Some(limit) = params.limit {
        query.push(format!("limit={limit}"));
    }
    if let Some(status) = &params.status {
        if !status.is_empty() && safe_segment(status) {
            query.push(format!("status={status}"));
        }
    }
    if query.is_empty() {
        base.to_owned()
    } else {
        format!("{base}?{}", query.join("&"))
    }
}

#[derive(Debug, Deserialize)]
struct ActionLedgerQuery {
    limit: Option<u64>,
    state: Option<String>,
}

fn build_action_ledger_path(params: &ActionLedgerQuery) -> String {
    let mut query = Vec::new();
    if let Some(limit) = params.limit {
        query.push(format!("limit={limit}"));
    }
    if let Some(state) = &params.state {
        if !state.is_empty() && safe_segment(state) {
            query.push(format!("state={state}"));
        }
    }
    if query.is_empty() {
        "/v1/control-plane/ops/actions".to_owned()
    } else {
        format!("/v1/control-plane/ops/actions?{}", query.join("&"))
    }
}

// ---------------------------------------------------------------------------
// Fanbase OAuth connections — proxy to crowdrelay's control-plane endpoints.
// ---------------------------------------------------------------------------

async fn list_fanbase_connections(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/fanbases/connections",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "fanbase connections")
}

async fn delete_fanbase_connection(
    State(state): State<AppState>,
    Path((slug, connection_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    uuid_segment(&connection_id)?;
    let path = format!("/v1/control-plane/fanbases/connections/{connection_id}");
    let _ = call(&state, &slug, "DELETE", &path, None, &headers, None).await?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

async fn create_discord_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/discord",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    object_no_store(value, "discord connection")
}

async fn create_telegram_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/telegram",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    object_no_store(value, "telegram connection")
}

async fn create_lastfm_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/lastfm",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    object_no_store(value, "lastfm connection")
}

async fn create_deezer_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/deezer",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    object_no_store(value, "deezer connection")
}

async fn create_discogs_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/discogs",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    object_no_store(value, "discogs connection")
}

async fn create_bluesky_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/bluesky",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    object_no_store(value, "bluesky connection")
}

async fn create_bandcamp_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/bandcamp",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    object_no_store(value, "bandcamp connection")
}

async fn create_youtube_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/youtube",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    object_no_store(value, "youtube connection")
}

async fn create_facebook_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/facebook",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    object_no_store(value, "facebook connection")
}

async fn create_instagram_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/instagram",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    object_no_store(value, "instagram connection")
}

async fn create_soundcloud_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/soundcloud",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    object_no_store(value, "soundcloud connection")
}

async fn create_reddit_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/reddit",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    object_no_store(value, "reddit connection")
}

// ---------------------------------------------------------------------------
// Audience intelligence — read-only proxies to CrowdRelay's control-plane
// audience endpoints. Fan list, fan detail, fan journey, audience segments.
// ---------------------------------------------------------------------------

async fn audience_overview(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/audience/overview",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "audience overview")
}

async fn audience_fans(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Query(params): Query<ListQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = build_list_path("/v1/control-plane/audience/fans", &params);
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    array_no_store(value, "audience fans")
}

async fn audience_fan_detail(
    State(state): State<AppState>,
    Path((slug, fan_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let fan_id = uuid_segment(&fan_id)?;
    let path = format!("/v1/control-plane/audience/fans/{fan_id}");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "fan detail")
}

async fn audience_fan_journey(
    State(state): State<AppState>,
    Path((slug, fan_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let fan_id = uuid_segment(&fan_id)?;
    let path = format!("/v1/control-plane/audience/fans/{fan_id}/journey");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "fan journey")
}

async fn audience_segments(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/audience/segments",
        None,
        &headers,
        None,
    )
    .await?;
    array_no_store(value, "audience segments")
}

async fn audience_segment_preview(
    State(state): State<AppState>,
    Path((slug, slug_segment)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    if !safe_segment(&slug_segment) {
        return Err(ApiError::InvalidInput(
            "valid segment slug is required".to_owned(),
        ));
    }
    let path = format!("/v1/control-plane/audience/segments/{slug_segment}/preview");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "segment preview")
}

// ---------------------------------------------------------------------------
// Growth metrics, objectives, posture — proxies to CrowdRelay's control-plane
// autopilot endpoints. Coverage and trends are read-only; objectives and
// posture support both reads and mutations.
// ---------------------------------------------------------------------------

async fn growth_metric_coverage(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/growth-metrics/coverage",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "growth metric coverage")
}

async fn growth_metric_trends(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/growth-metrics/trends",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "growth metric trends")
}

async fn growth_objectives(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/objectives",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "growth objectives")
}

async fn declare_growth_objective(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    if !body.is_object() {
        return Err(ApiError::InvalidInput(
            "objective body is required".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/autopilot/objectives",
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.growth_objective.declared",
        "growth_objective",
        value.get("id").and_then(Value::as_str).unwrap_or("unknown"),
        &headers,
        &result,
    )
    .await;
    object_no_store(value, "growth objective declare")
}

async fn retire_growth_objective(
    State(state): State<AppState>,
    Path((slug, objective_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let objective_id = uuid_segment(&objective_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path = format!("/v1/control-plane/autopilot/objectives/{objective_id}/retire");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        None,
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.growth_objective.retired",
        "growth_objective",
        &objective_id,
        &headers,
        &result,
    )
    .await;
    object_no_store(value, "growth objective retire")
}

async fn growth_posture(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/posture",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "growth posture")
}

async fn set_growth_posture(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    if !body.is_object() {
        return Err(ApiError::InvalidInput(
            "posture body is required".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/autopilot/posture",
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.growth_posture.updated",
        "growth_posture",
        "posture",
        &headers,
        &result,
    )
    .await;
    object_no_store(value, "growth posture update")
}

async fn acquisition_channels(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/acquisition-channels",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "acquisition channels")
}

async fn tour_economics(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/tour-economics",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "tour economics")
}

async fn show_economics(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/show-economics",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "show economics")
}

async fn chief_of_staff(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/chief-of-staff",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "chief of staff")
}

// ---------------------------------------------------------------------------
// Outreach & booking discovery — candidate queues for the growth pipeline.
// Outreach candidates are a bare array; booking candidates are a bare array.
// Confirm mutations return objects.
// ---------------------------------------------------------------------------

async fn outreach_candidates(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Query(params): Query<ListQuery>,
) -> Result<Response, ApiError> {
    let path = build_list_path("/v1/control-plane/autopilot/outreach/candidates", &params);
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    array_no_store(value, "outreach candidates")
}

async fn confirm_outreach_candidate(
    State(state): State<AppState>,
    Path((slug, candidate_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let candidate_id = uuid_segment(&candidate_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path = format!("/v1/control-plane/autopilot/outreach/candidates/{candidate_id}/confirm");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        None,
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.outreach_candidate.confirmed",
        "outreach_candidate",
        &candidate_id,
        &headers,
        &result,
    )
    .await;
    object_no_store(value, "outreach candidate confirm")
}

async fn booking_candidates(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Query(params): Query<ListQuery>,
) -> Result<Response, ApiError> {
    let path = build_list_path(
        "/v1/control-plane/autopilot/booking-discovery/candidates",
        &params,
    );
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    array_no_store(value, "booking candidates")
}

async fn confirm_booking_candidate(
    State(state): State<AppState>,
    Path((slug, candidate_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let candidate_id = uuid_segment(&candidate_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path =
        format!("/v1/control-plane/autopilot/booking-discovery/candidates/{candidate_id}/confirm");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        None,
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.booking_candidate.confirmed",
        "booking_candidate",
        &candidate_id,
        &headers,
        &result,
    )
    .await;
    object_no_store(value, "booking candidate confirm")
}

// ---------------------------------------------------------------------------
// Beacon signal network — press & industry relationship pipeline.
// All list endpoints return objects with named arrays.
// ---------------------------------------------------------------------------

async fn beacon_signal_dashboard(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/beacon-signal",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "beacon signal dashboard")
}

async fn beacon_signal_candidates(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/beacon-signal/candidates",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "beacon signal candidates")
}

async fn beacon_press_requests(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/beacon-press-requests",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "beacon press requests")
}

async fn resolve_beacon_press_request(
    State(state): State<AppState>,
    Path((slug, press_request_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let press_request_id = uuid_segment(&press_request_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path =
        format!("/v1/control-plane/autopilot/beacon-press-requests/{press_request_id}/resolve");
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
        "tenant.beacon_press_request.resolved",
        "beacon_press_request",
        &press_request_id,
        &headers,
        &result,
    )
    .await;
    object_no_store(value, "beacon press request resolve")
}

async fn beacon_press_assets(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/beacon-press-assets",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "beacon press assets")
}

async fn beacon_signal_engagements(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/beacon-signal-engagements",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "beacon signal engagements")
}

async fn beacon_coverage(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/beacon-coverage",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "beacon coverage")
}

async fn beacon_network(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/beacon-network",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "beacon network")
}

// ---------------------------------------------------------------------------
// Release campaigns — launch/close mutations, campaign list, recipients.
// ---------------------------------------------------------------------------

async fn beacon_release_campaigns(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/beacon-release-campaigns",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "beacon release campaigns")
}

async fn launch_beacon_release_campaign(
    State(state): State<AppState>,
    Path((slug, campaign_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let campaign_id = uuid_segment(&campaign_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path = format!("/v1/control-plane/autopilot/beacon-release-campaigns/{campaign_id}/launch");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        None,
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.beacon_release_campaign.launched",
        "beacon_release_campaign",
        &campaign_id,
        &headers,
        &result,
    )
    .await;
    object_no_store(value, "beacon release campaign launch")
}

async fn close_beacon_release_campaign(
    State(state): State<AppState>,
    Path((slug, campaign_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let campaign_id = uuid_segment(&campaign_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path = format!("/v1/control-plane/autopilot/beacon-release-campaigns/{campaign_id}/close");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        None,
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.beacon_release_campaign.closed",
        "beacon_release_campaign",
        &campaign_id,
        &headers,
        &result,
    )
    .await;
    object_no_store(value, "beacon release campaign close")
}

async fn beacon_release_recipients(
    State(state): State<AppState>,
    Path((slug, campaign_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let campaign_id = uuid_segment(&campaign_id)?.to_owned();
    let path =
        format!("/v1/control-plane/autopilot/beacon-release-campaigns/{campaign_id}/recipients");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "beacon release recipients")
}

// ---------------------------------------------------------------------------
// Play ledger — what the agent committed to, what it did, and what each
// number is allowed to prove.
// ---------------------------------------------------------------------------

async fn play_ledger(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/plays",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "play ledger")
}

// ---------------------------------------------------------------------------
// Community Intelligence — read-only proxy endpoints
// ---------------------------------------------------------------------------

async fn list_communities(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/admin/community-intelligence/communities",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "community intelligence communities")
}

async fn list_community_observations(
    State(state): State<AppState>,
    Path((slug, place_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    uuid_segment(&place_id)?;
    let path = format!("/v1/admin/community-intelligence/communities/{place_id}/observations");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "community intelligence observations")
}

async fn list_community_entities(
    State(state): State<AppState>,
    Path((slug, place_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    uuid_segment(&place_id)?;
    let path = format!("/v1/admin/community-intelligence/communities/{place_id}/entities");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "community intelligence entities")
}
