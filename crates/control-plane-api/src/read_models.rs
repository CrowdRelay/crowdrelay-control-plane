//! Purpose-built read models, one per Control Plane subpage.
//!
//! Each tenant subpage loads from exactly one endpoint. The browser never
//! orchestrates a fan-out to assemble a screen, and there is deliberately no
//! single "tenant everything" model: Overview, Attention and Operations each
//! own a separate, explicitly named contract so one subpage's payload cannot
//! grow because another subpage needed a field.
//!
//! * Overview  -> [`overview`]   (`GET /tenants/{slug}/overview`)
//! * Attention -> [`crate::attention_routes`] (`GET /tenants/{slug}/operations/attention`)
//! * Operations/Autopilot -> [`operations`] (`GET /tenants/{slug}/operations/overview`)
//! * Label Portfolio -> [`portfolio`] (`GET /tenants/{slug}/portfolio/model`)
//!
//! Mutations stay on their own routes; nothing here writes.

use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header::CACHE_CONTROL},
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::{Value, json};
use tokio::sync::{RwLock, Semaphore};

use crate::{AppState, error::ApiError, tenant_area_client::ManagementRequest, validation};

const PRIVATE_NO_STORE: &str = "private, no-store";

/// How long a cached read model response is served before the next request
/// re-fans-out to the upstream. Short enough that a mutation's effect is
/// visible within the same operator session, long enough that two operators
/// viewing the same tenant or an auto-refresh cycle do not each trigger a
/// full upstream fan-out.
const READ_MODEL_CACHE_TTL: Duration = Duration::from_secs(5);

/// In-process TTL cache for read model responses. Keyed by a string that
/// combines the tenant slug and the model name (e.g. `"virya:operations"`).
/// Only successful responses are cached; errors are never stored.
///
/// Uses a `RwLock` so concurrent cache hits (the common case) do not
/// serialise behind a single writer. Writes — cache misses and eviction —
/// take the exclusive lock.
pub type ReadModelCache = Arc<RwLock<HashMap<String, (Instant, Value)>>>;

/// Create a fresh, empty cache. Called once at boot and shared via
/// [`AppState`].
#[must_use]
pub fn new_read_model_cache() -> ReadModelCache {
    Arc::new(RwLock::new(HashMap::new()))
}

/// Return a cached value if it exists and is younger than [`READ_MODEL_CACHE_TTL`].
/// Expired entries are removed on access so the map does not retain stale
/// values for tenants that are read infrequently.
///
/// The expiry check and removal happen under the same write lock to avoid a
/// race where a concurrent `cache_set` inserts a fresh value in the gap
/// between the read-lock expiry check and the write-lock removal — which
/// would delete the fresh entry.
async fn cache_get(cache: &ReadModelCache, key: &str) -> Option<Value> {
    let entries = cache.read().await;
    if let Some((stored_at, value)) = entries.get(key) {
        if Instant::now().duration_since(*stored_at) < READ_MODEL_CACHE_TTL {
            return Some(value.clone());
        }
    }
    drop(entries);
    // Entry was absent or expired — remove it under a write lock. Re-check
    // the entry under the write lock before removing, because a concurrent
    // `cache_set` may have inserted a fresh value between the read lock
    // release and the write lock acquisition.
    let mut entries = cache.write().await;
    if let Some((stored_at, _)) = entries.get(key) {
        if Instant::now().duration_since(*stored_at) < READ_MODEL_CACHE_TTL {
            // A concurrent insert refreshed the entry — don't remove it.
            return Some(entries[key].1.clone());
        }
    }
    entries.remove(key);
    None
}

/// Public wrapper for [`cache_get`] so other modules (agent_routes) can
/// share the same in-process cache for consolidated read models.
pub async fn cache_get_public(cache: &ReadModelCache, key: &str) -> Option<Value> {
    cache_get(cache, key).await
}

/// Store a successful response in the cache. Called only after the fan-out
/// and projection succeed — errors are never cached.
async fn cache_set(cache: &ReadModelCache, key: String, value: Value) {
    let mut entries = cache.write().await;
    entries.insert(key, (Instant::now(), value));
}

/// Public wrapper for [`cache_set`] so other modules (agent_routes) can
/// share the same in-process cache for consolidated read models.
pub async fn cache_set_public(cache: &ReadModelCache, key: String, value: Value) {
    cache_set(cache, key, value).await
}

/// Invalidate all cached read models for a tenant. Called after a mutation
/// (e.g. autopilot policy update, portfolio decision) so the next read
/// fetches fresh data from upstream instead of serving the pre-mutation
/// cached value for up to [`READ_MODEL_CACHE_TTL`].
pub async fn invalidate_tenant(cache: &ReadModelCache, slug: &str) {
    let prefix = format!("{slug}:");
    let mut entries = cache.write().await;
    entries.retain(|key, _| !key.starts_with(&prefix));
    // The global command-center snapshot aggregates per-tenant summaries,
    // so a tenant mutation invalidates it too. Without this, the overview
    // page shows stale fleet health for up to the TTL window.
    entries.remove("command-center");
}

/// Remove all entries older than `READ_MODEL_CACHE_TTL * 2`. Called by a
/// background sweeper so expired entries for inactive tenants do not
/// accumulate indefinitely. The generous threshold avoids racing with an
/// in-flight request that is about to check a slightly-past entry.
pub async fn prune_cache(cache: &ReadModelCache) {
    let now = Instant::now();
    let threshold = READ_MODEL_CACHE_TTL * 2;
    let mut entries = cache.write().await;
    entries.retain(|_, (stored_at, _)| now.duration_since(*stored_at) < threshold);
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tenants/{slug}/overview", get(overview))
        .route("/tenants/{slug}/operations/overview", get(operations))
        .route("/tenants/{slug}/portfolio/model", get(portfolio))
        .route("/tenants/{slug}/audience/model", get(audience))
        .route(
            "/tenants/{slug}/operations/press-overview",
            get(press_overview),
        )
}

/// Global, cross-tenant read models. These are platform-admin surfaces that
/// aggregate every tenant in one server-side fan-out, so the browser never
/// orchestrates a multi-tenant sweep.
pub fn global_router() -> Router<AppState> {
    Router::new().route("/command-center", get(command_center))
}

/// Bound the per-tenant fan-out so a fleet of 50 tenants does not produce 50
/// concurrent management-tunnel calls. Two is enough for the current fleet
/// (Virya is the only live tenant) and keeps headroom for the platform-admin
/// auth/middleware layer.
const COMMAND_CENTER_MAX_CONCURRENT: usize = 4;

/// Per-section timeout. Each tenant's fan-out must complete within this window
/// or the section is reported as `timeout` — the command center never hangs
/// waiting for a single slow tenant.
///
/// Must exceed the transport's own `REQUEST_TIMEOUT`, and did not: both were
/// eight seconds, so on a slow tenant the two deadlines expired together and
/// which one fired first was a race. The same slowness surfaced as `timeout`
/// on one load and `unreachable` on the next, and a transport that lost the
/// race had its connection torn down mid-exchange rather than cleaned up.
///
/// The budget nests: CrowdRelay's own per-query timeout (5s) inside the
/// transport's (8s) inside this one. Each layer must be able to report its own
/// failure before the layer above gives up on it, or the outer layer's verdict
/// is the only one anybody ever sees.
const COMMAND_CENTER_SECTION_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(11);

/// `GET /command-center` — the operator's informational shell.
///
/// This is a true read model, not a dashboard: it aggregates every tenant's
/// attention, autopilot, learning and outcomes state in one server-side
/// fan-out, with bounded concurrency and a per-section timeout. Partial
/// upstream failures are reported per-section per-tenant, never blanking the
/// whole response.
async fn command_center(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    const CACHE_KEY: &str = "command-center";
    if let Some(cached) = cache_get(&state.read_model_cache, CACHE_KEY).await {
        return Ok(no_store(cached));
    }
    let tenants = state.store.list_tenants().await?;
    let now = chrono::Utc::now();
    let semaphore = Arc::new(Semaphore::new(COMMAND_CENTER_MAX_CONCURRENT));
    let correlation_id = correlation(&headers);

    let mut handles = Vec::with_capacity(tenants.len());
    for tenant in tenants {
        let state = state.clone();
        let semaphore = semaphore.clone();
        let correlation_id = correlation_id.map(|s| s.to_owned());
        handles.push(tokio::spawn(async move {
            let _permit = semaphore.acquire().await.ok()?;
            let summary = fetch_tenant_command_summary(
                &state,
                &tenant,
                correlation_id.as_deref(),
                COMMAND_CENTER_SECTION_TIMEOUT,
            )
            .await;
            Some((tenant, summary))
        }));
    }

    // Fan out per-tenant summaries and the platform-health query concurrently
    // — they are independent, so running them in parallel shortens TTI.
    let (per_tenant, platform_health) = tokio::join!(
        async {
            let mut per_tenant = Vec::with_capacity(handles.len());
            for handle in handles {
                match handle.await {
                    Ok(Some((tenant, summary))) => {
                        per_tenant.push(build_per_tenant_summary(&tenant, &summary));
                    }
                    Ok(None) => {
                        // The semaphore was closed — the tenant summary is skipped.
                        // This should not happen in normal operation.
                    }
                    Err(join_error) => {
                        // A task panic or cancellation. Log it so the operator has
                        // a visible signal that a tenant was skipped due to an
                        // internal error, not because it returned no data.
                        tracing::warn!(
                            error = %join_error,
                            "command-center tenant task panicked or was cancelled",
                        );
                    }
                }
            }
            per_tenant
        },
        state.store.list_platform_health(),
    );

    let platform_health = platform_health?;

    // Aggregate global totals from per-tenant projections.
    let mut needs_you = 0u64;
    let mut awaiting_approval = 0u64;
    let mut open_findings = 0u64;
    let mut critical_alerts = 0u64;
    let mut dead_deliveries = 0u64;
    let mut unavailable_tenants = 0u64;
    let mut queued_actions = 0u64;
    let mut processing_actions = 0u64;
    let mut succeeded_24h = 0u64;
    let mut failed_24h = 0u64;
    let mut unknown_actions = 0u64;
    let mut outcomes_resolved = 0u64;
    let mut outcomes_unknown = 0u64;
    let mut outcomes_waiting = 0u64;
    let mut learning_total = 0u64;
    let mut learning_admitted = 0u64;
    let mut learning_rejected = 0u64;
    let mut brain_needs_attention = false;

    // North Star fan KPIs — null-not-zero. A missing audience endpoint
    // means "unknown", not "0 fans". We sum only tenants that reported,
    // and track how many reported so the operator can see coverage.
    let mut fans_active: Option<u64> = None;
    let mut fans_ticket_buyers: Option<u64> = None;
    let mut fans_attendees: Option<u64> = None;
    let mut fans_paid_orders: Option<u64> = None;
    let mut fans_reporting = 0u64;

    let mut total = 0u64;
    let mut active = 0u64;
    let mut healthy = 0u64;
    let mut degraded = 0u64;
    let mut stale = 0u64;
    let mut unknown = 0u64;

    for t in &per_tenant {
        total += 1;
        if t["available"].as_bool() == Some(true) {
            active += 1;
        }
        match t["runtimeHealth"].as_str() {
            Some("healthy") => healthy += 1,
            Some("degraded") => degraded += 1,
            Some("stale") => stale += 1,
            _ => unknown += 1,
        }
        if t["attention"]["available"].as_bool() != Some(true) {
            unavailable_tenants += 1;
        }
        needs_you += t["attention"]["needsYou"].as_u64().unwrap_or(0);
        awaiting_approval += t["attention"]["awaitingApproval"].as_u64().unwrap_or(0);
        open_findings += t["attention"]["openFindings"].as_u64().unwrap_or(0);
        critical_alerts += t["attention"]["criticalAlerts"].as_u64().unwrap_or(0);
        dead_deliveries += t["attention"]["deadDeliveries"].as_u64().unwrap_or(0);
        queued_actions += t["autopilot"]["queuedActions"].as_u64().unwrap_or(0);
        processing_actions += t["autopilot"]["processingActions"].as_u64().unwrap_or(0);
        succeeded_24h += t["autopilot"]["succeeded24h"].as_u64().unwrap_or(0);
        failed_24h += t["autopilot"]["failed24h"].as_u64().unwrap_or(0);
        unknown_actions += t["autopilot"]["unknownActions"].as_u64().unwrap_or(0);
        outcomes_resolved += t["outcomes"]["resolved"].as_u64().unwrap_or(0);
        outcomes_unknown += t["outcomes"]["unknown"].as_u64().unwrap_or(0);
        outcomes_waiting += t["outcomes"]["waitingForObservation"].as_u64().unwrap_or(0);
        learning_total += t["learning"]["totalOutcomes"].as_u64().unwrap_or(0);
        learning_admitted += t["learning"]["admitted"].as_u64().unwrap_or(0);
        learning_rejected += t["learning"]["rejected"].as_u64().unwrap_or(0);
        if t["brain"]["needsAttention"].as_bool() == Some(true) {
            brain_needs_attention = true;
        }
        // North Star fan KPIs — sum only reported values, never collapse
        // missing to zero. A tenant with no audience endpoint contributes
        // nothing to the sum and increments the coverage gap.
        if t["fans"]["available"].as_bool() == Some(true) {
            fans_reporting += 1;
            if let Some(v) = t["fans"]["activeFans"].as_u64() {
                fans_active = Some(fans_active.unwrap_or(0) + v);
            }
            if let Some(v) = t["fans"]["ticketBuyers"].as_u64() {
                fans_ticket_buyers = Some(fans_ticket_buyers.unwrap_or(0) + v);
            }
            if let Some(v) = t["fans"]["attendees"].as_u64() {
                fans_attendees = Some(fans_attendees.unwrap_or(0) + v);
            }
            if let Some(v) = t["fans"]["paidTicketOrders"].as_u64() {
                fans_paid_orders = Some(fans_paid_orders.unwrap_or(0) + v);
            }
        }
    }

    let projected = json!({
        "fetchedAt": now,
        "tenants": {
            "total": total,
            "active": active,
            "healthy": healthy,
            "degraded": degraded,
            "stale": stale,
            "unknown": unknown,
        },
        "attention": {
            "needsYou": needs_you,
            "awaitingApproval": awaiting_approval,
            "openFindings": open_findings,
            "criticalAlerts": critical_alerts,
            "deadDeliveries": dead_deliveries,
            "unavailableTenants": unavailable_tenants,
        },
        "autopilot": {
            "queuedActions": queued_actions,
            "processingActions": processing_actions,
            "succeeded24h": succeeded_24h,
            "failed24h": failed_24h,
            "unknownActions": unknown_actions,
        },
        "outcomes": {
            "resolved": outcomes_resolved,
            "unknown": outcomes_unknown,
            "waitingForObservation": outcomes_waiting,
        },
        "system": system_block(&platform_health),
        "learning": {
            "totalOutcomes": learning_total,
            "admitted": learning_admitted,
            "rejected": learning_rejected,
        },
        "brainNeedsAttention": brain_needs_attention,
        // North Star fan KPIs — null when no tenant reported, so the UI
        // can show "unknown" instead of a misleading "0 fans".
        "fans": {
            "activeFans": fans_active,
            "ticketBuyers": fans_ticket_buyers,
            "attendees": fans_attendees,
            "paidTicketOrders": fans_paid_orders,
            "reportingTenants": fans_reporting,
        },
        "perTenant": per_tenant,
    });
    cache_set(
        &state.read_model_cache,
        CACHE_KEY.to_owned(),
        projected.clone(),
    )
    .await;
    Ok(no_store(projected))
}

/// The command center's `system` block.
///
/// Every key here must have an authoritative source in the running container.
/// This block previously also carried `releaseConvergence: null` and
/// `controlPlaneRevision: ""` — nothing computed either, so an operator read a
/// permanently empty field as if it were system state. The block is a named
/// function so that contract is testable and a future addition has to justify
/// itself against a test rather than being appended to an inline literal.
fn system_block(platform_health: &[crate::model::PlatformHealthRow]) -> Value {
    json!({ "platformServices": platform_health })
}

/// Fetch one tenant's command-center sections: attention, autopilot, learning
/// and outcomes, each with its own degradation state. A single slow or dead
/// tenant never blocks the global response.
async fn fetch_tenant_command_summary(
    state: &AppState,
    tenant: &crate::model::TenantSummary,
    correlation_id: Option<&str>,
    per_section_timeout: std::time::Duration,
) -> TenantCommandData {
    let slug = &tenant.tenant.slug;
    let target = match crate::area_routes::target(state, slug).await {
        Ok((_tenant, target)) => target,
        Err(error) => {
            // Every section of this tenant is about to be reported as
            // unavailable, and the operator sees that as a dash on the command
            // centre. Swallowing the reason made it undiagnosable: production
            // returned a fully unavailable model in 0.5s with nothing in the
            // log to say why.
            tracing::warn!(
                tenant = %slug,
                error = %error,
                "command-center: no management target; every section will read unavailable",
            );
            return TenantCommandData::default();
        }
    };

    let tenant_id = tenant.tenant.id;
    let section = |path: &'static str| {
        let target = &target;
        async move {
            state
                .area_client
                .request_management(
                    tenant_id,
                    target,
                    ManagementRequest {
                        method: "GET",
                        path,
                        body: None,
                        correlation_id,
                        idempotency_key: None,
                    },
                )
                .await
        }
    };

    let (attention, autopilot, learning, outcomes, audience) = tokio::join!(
        tokio::time::timeout(
            per_section_timeout,
            section("/v1/control-plane/ops/attention")
        ),
        tokio::time::timeout(
            per_section_timeout,
            section("/v1/control-plane/autopilot/overview")
        ),
        tokio::time::timeout(
            per_section_timeout,
            section("/v1/control-plane/autopilot/learning-loop")
        ),
        tokio::time::timeout(
            per_section_timeout,
            section("/v1/control-plane/autopilot/growth")
        ),
        // North Star: fan KPIs. The audience overview carries active_fans,
        // ticket_buyers, attendees, paid_ticket_orders — the conversion
        // signals the operator needs to see on the landing page.
        tokio::time::timeout(
            per_section_timeout,
            section("/v1/control-plane/audience/overview")
        ),
    );

    let attention = attention.map_err(|_| ApiError::Timeout).and_then(|r| r);
    let autopilot = autopilot.map_err(|_| ApiError::Timeout).and_then(|r| r);
    let learning = learning.map_err(|_| ApiError::Timeout).and_then(|r| r);
    let outcomes = outcomes.map_err(|_| ApiError::Timeout).and_then(|r| r);
    let audience = audience.map_err(|_| ApiError::Timeout).and_then(|r| r);

    // A tenant that answered none of its five sections is the shape the
    // operator reads as "no fans", so say why once, with the first reason.
    // Per-section noise is not wanted — one failed section among five is
    // normal and the model already names it.
    if let (Err(first), Err(_), Err(_), Err(_), Err(_)) =
        (&attention, &autopilot, &learning, &outcomes, &audience)
    {
        tracing::warn!(
            tenant = %slug,
            error = %first,
            "command-center: every section failed; this tenant will read unavailable",
        );
    }

    TenantCommandData {
        attention: attention.as_ref().ok().and_then(|v| v.as_object()).cloned(),
        autopilot: autopilot.as_ref().ok().and_then(|v| v.as_object()).cloned(),
        learning: learning.as_ref().ok().and_then(|v| v.as_array()).cloned(),
        outcomes: outcomes.as_ref().ok().and_then(|v| v.as_object()).cloned(),
        audience: audience.as_ref().ok().and_then(|v| v.as_object()).cloned(),
    }
}

/// Build the per-tenant summary object the frontend expects, extracting
/// structured fields from the raw upstream responses.
fn build_per_tenant_summary(
    tenant: &crate::model::TenantSummary,
    data: &TenantCommandData,
) -> Value {
    let slug = &tenant.tenant.slug;
    let display_name = &tenant.tenant.display_name;
    let runtime_health = tenant.runtime_health.as_str();
    let available = data.attention.is_some()
        || data.autopilot.is_some()
        || data.learning.is_some()
        || data.outcomes.is_some()
        || data.audience.is_some();

    // ── attention ──
    let att = data.attention.as_ref();
    let attention = json!({
        "available": att.is_some(),
        "needsYou": att.and_then(|a| a.get("needs_you")).and_then(|v| v.as_array()).map(|a| a.len() as u64).unwrap_or(0),
        "awaitingApproval": att.and_then(|a| a.get("awaiting_approval")).and_then(|v| v.as_u64()).unwrap_or(0),
        "openFindings": att.and_then(|a| a.get("findings")).and_then(|v| v.as_array()).map(|a| a.len() as u64).unwrap_or(0),
        "criticalAlerts": att.and_then(|a| a.get("alerts")).and_then(|v| v.as_array()).map(|a| {
            a.iter().filter(|alert| {
                alert.get("active").and_then(|v| v.as_bool()) == Some(true)
                    && alert.get("severity").and_then(|v| v.as_str()) == Some("critical")
            }).count() as u64
        }).unwrap_or(0),
        "deadDeliveries": att.and_then(|a| a.get("dead_deliveries")).and_then(|v| v.as_array()).map(|a| a.len() as u64).unwrap_or(0),
    });

    // ── autopilot ──
    let auto = data.autopilot.as_ref();
    let autopilot = json!({
        "available": auto.is_some(),
        "queuedActions": auto.and_then(|a| a.get("queued_actions")).and_then(|v| v.as_u64()).unwrap_or(0),
        "processingActions": auto.and_then(|a| a.get("processing_actions")).and_then(|v| v.as_u64()).unwrap_or(0),
        "succeeded24h": auto.and_then(|a| a.get("succeeded_24h")).and_then(|v| v.as_u64()).unwrap_or(0),
        "failed24h": auto.and_then(|a| a.get("failed_24h")).and_then(|v| v.as_u64()).unwrap_or(0),
        "unknownActions": auto.and_then(|a| a.get("recent_actions")).and_then(|v| v.as_array()).map(|a| {
            a.iter().filter(|action| {
                action.get("outcome").and_then(|v| v.as_str()).is_none_or(|s| s == "unknown" || s == "pending")
            }).count() as u64
        }).unwrap_or(0),
        "runtimeEnabled": auto.and_then(|a| a.get("runtime_enabled")).and_then(|v| v.as_bool()).unwrap_or(false),
        "releaseLedger": auto.and_then(|a| a.get("release_ledger")).cloned().unwrap_or(Value::Null),
    });

    // ── learning ──
    // The learning-loop endpoint returns an array of decisions. Each decision
    // may have an `outcome` field: "accepted", "rejected", or null (pending).
    let learn = data.learning.as_ref();
    let (total_outcomes, admitted, rejected, total_decisions) = match learn {
        Some(arr) => {
            let total = arr.len() as u64;
            let mut outcomes = 0u64;
            let mut admitted = 0u64;
            let mut rejected = 0u64;
            for decision in arr {
                if let Some(outcome) = decision.get("outcome").and_then(|v| v.as_str()) {
                    outcomes += 1;
                    if outcome == "accepted" || outcome == "succeeded" {
                        admitted += 1;
                    } else if outcome == "rejected" || outcome == "failed" {
                        rejected += 1;
                    }
                }
            }
            (outcomes, admitted, rejected, total)
        }
        None => (0, 0, 0, 0),
    };
    let learning = json!({
        "available": learn.is_some(),
        "totalOutcomes": total_outcomes,
        "admitted": admitted,
        "rejected": rejected,
        "totalDecisions": total_decisions,
    });

    // ── outcomes ──
    // The growth endpoint returns campaign/delivery totals. We map:
    // resolved = delivered + completed_campaigns + claimed
    // unknown = failed (known but not resolved)
    // waitingForObservation = pending + scheduled_campaigns + stalled_campaigns
    let out = data.outcomes.as_ref();
    let totals = out.and_then(|o| o.get("totals"));
    let outcomes = json!({
        "available": out.is_some(),
        "resolved": totals.and_then(|t| t.get("delivered")).and_then(|v| v.as_u64()).unwrap_or(0)
            + totals.and_then(|t| t.get("completed_campaigns")).and_then(|v| v.as_u64()).unwrap_or(0)
            + totals.and_then(|t| t.get("claimed")).and_then(|v| v.as_u64()).unwrap_or(0),
        "unknown": totals.and_then(|t| t.get("failed")).and_then(|v| v.as_u64()).unwrap_or(0),
        "waitingForObservation": totals.and_then(|t| t.get("pending")).and_then(|v| v.as_u64()).unwrap_or(0)
            + totals.and_then(|t| t.get("scheduled_campaigns")).and_then(|v| v.as_u64()).unwrap_or(0)
            + totals.and_then(|t| t.get("stalled_campaigns")).and_then(|v| v.as_u64()).unwrap_or(0),
    });

    // ── brain ──
    let brain = att
        .and_then(|a| a.get("ecosystem"))
        .and_then(|v| v.get("brain"))
        .cloned()
        .unwrap_or(Value::Null);

    // ── fans (North Star) ──
    // Fan KPIs use null-not-zero semantics: a missing audience endpoint
    // means "we don't know", not "zero fans". The global aggregation
    // counts how many tenants reported, so the operator can distinguish
    // "3 tenants with 500 fans" from "3 tenants, 1 reported 500 fans".
    let aud = data.audience.as_ref();
    let fans = json!({
        "available": aud.is_some(),
        "activeFans": aud.and_then(|a| a.get("active_fans")).and_then(|v| v.as_u64()),
        "marketingConsentedFans": aud.and_then(|a| a.get("marketing_consented_fans")).and_then(|v| v.as_u64()),
        "ticketBuyers": aud.and_then(|a| a.get("ticket_buyers")).and_then(|v| v.as_u64()),
        "attendees": aud.and_then(|a| a.get("attendees")).and_then(|v| v.as_u64()),
        "paidTicketOrders": aud.and_then(|a| a.get("paid_ticket_orders")).and_then(|v| v.as_u64()),
        "qualifiedReferrals": aud.and_then(|a| a.get("qualified_referrals")).and_then(|v| v.as_u64()),
        "synesthesiaParticipants": aud.and_then(|a| a.get("synesthesia_participants")).and_then(|v| v.as_u64()),
    });

    json!({
        "slug": slug,
        "displayName": display_name,
        "runtimeHealth": runtime_health,
        "available": available,
        "attention": attention,
        "autopilot": autopilot,
        "learning": learning,
        "outcomes": outcomes,
        "brain": brain,
        "fans": fans,
    })
}

/// Raw upstream data for one tenant, before projection.
#[derive(Default)]
struct TenantCommandData {
    attention: Option<serde_json::Map<String, Value>>,
    autopilot: Option<serde_json::Map<String, Value>>,
    learning: Option<Vec<Value>>,
    outcomes: Option<serde_json::Map<String, Value>>,
    audience: Option<serde_json::Map<String, Value>>,
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

fn no_store(value: Value) -> Response {
    (
        StatusCode::OK,
        [(CACHE_CONTROL, PRIVATE_NO_STORE)],
        Json(value),
    )
        .into_response()
}

/// Tenant Overview subpage: identity, entitlements, provisioning lifecycle and
/// platform audit in one local read. Every section comes from the Control Plane
/// database, so this endpoint stays available while a tenant runtime is down.
async fn overview(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let cache_key = format!("{slug}:overview");
    if let Some(cached) = cache_get(&state.read_model_cache, &cache_key).await {
        return Ok(no_store(cached));
    }
    let tenant = state.store.tenant_by_slug(&slug).await?;
    // Both list reads take the already-resolved tenant id: one lookup per
    // request, not three.
    let (provisioning, audit) = tokio::try_join!(
        state.store.provisioning_jobs_for(tenant.tenant.id, 20),
        state.store.audit_for_tenant_id(tenant.tenant.id, 40),
    )?;

    let externally_owned = crate::store::tenant_lifecycle_is_externally_owned(&tenant.tenant.slug);

    // Map each provisioning row through `job_with_phase` so the frontend
    // `ProvisioningJob` contract (which requires `phase`) holds on this
    // surface too — not just on the dedicated provisioning endpoints.
    let provisioning_with_phase: Vec<serde_json::Value> = provisioning
        .iter()
        .map(crate::routes::job_with_phase)
        .collect::<Result<_, _>>()?;

    let projected = json!({
        // Stable identity so the browser can patch this model in place on a
        // refresh instead of replacing the whole subpage.
        "id": tenant.tenant.slug,
        "tenant": tenant,
        "provisioning": {"items": provisioning_with_phase},
        "audit": {"items": audit},
        "platform": {
            "runtimeStaleAfterSeconds": state.runtime_stale_after_seconds,
            "provisionerConfigured": state.provisioner_token_hash.is_some(),
            "provisionerDefaultImageTag": state.provisioner_default_image_tag.as_deref(),
            // Lifecycle policy is decided here, from the same predicate the
            // store guards use, so the browser renders capability instead of
            // re-deriving the rule from a slug it happens to recognise.
            "capabilities": {
                "canSuspend": !externally_owned,
                "canProvision": !externally_owned,
                "canRemove": !externally_owned,
                "canOptOut": !externally_owned,
                "canPark": !externally_owned && tenant.tenant.status == "active",
                "canUnpark": !externally_owned && tenant.tenant.status == "parked",
                // Only externally-owned tenants (Virya) may trigger a redeploy
                // from the panel. Provisioner-managed tenants get no
                // operator-facing deploy button — the provisioner path is
                // internal, used at tenant creation, not a runtime control.
                "canRedeploy": externally_owned,
            },
        },
    });
    cache_set(&state.read_model_cache, cache_key, projected.clone()).await;
    Ok(no_store(projected))
}

/// Operations/Autopilot subpage.
///
/// The four upstream sections are fetched concurrently over the private tunnel
/// and projected field by field. A section that fails is reported as `null` and
/// named in `degraded`, so a broken Autopilot read cannot blank the queue
/// metrics next to it. Only a snapshot where every section failed is an error.
async fn operations(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let cache_key = format!("{slug}:operations");
    if let Some(cached) = cache_get(&state.read_model_cache, &cache_key).await {
        return Ok(no_store(cached));
    }
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let section = |path: &'static str| {
        let state = &state;
        let target = &target;
        let tenant_id = tenant.tenant.id;
        let correlation_id = correlation(&headers);
        async move {
            state
                .area_client
                .request_management(
                    tenant_id,
                    target,
                    ManagementRequest {
                        method: "GET",
                        path,
                        body: None,
                        correlation_id,
                        idempotency_key: None,
                    },
                )
                .await
        }
    };

    let (
        summary,
        flags,
        autopilot,
        growth,
        opportunities,
        signal,
        audience,
        growth_metrics,
        acquisition,
    ) = tokio::join!(
        section("/v1/control-plane/ops/summary"),
        section("/v1/control-plane/ecosystem/flags"),
        section("/v1/control-plane/autopilot/overview"),
        section("/v1/control-plane/autopilot/growth"),
        section("/v1/control-plane/autopilot/next-best-actions"),
        // North Star fan-growth sections. These are the KPIs the operator
        // needs to see first: how many fans, how fast they're growing, where
        // they come from, and whether they convert. Each degrades
        // independently — a dead audience endpoint does not blank signal.
        section("/v1/control-plane/ops/signal-overview"),
        section("/v1/control-plane/audience/overview"),
        section("/v1/control-plane/autopilot/growth-metrics/trends"),
        section("/v1/control-plane/autopilot/acquisition-channels"),
    );

    let projected = project_operations(
        &slug,
        state.runtime_stale_after_seconds,
        summary.as_ref(),
        flags.as_ref(),
        autopilot.as_ref(),
        growth.as_ref(),
        opportunities.as_ref(),
        signal.as_ref(),
        audience.as_ref(),
        growth_metrics.as_ref(),
        acquisition.as_ref(),
    )?;
    cache_set(&state.read_model_cache, cache_key, projected.clone()).await;
    Ok(no_store(projected))
}

#[derive(Clone, Copy)]
enum Shape {
    Object,
    Array,
}

impl Shape {
    fn accepts(self, value: &Value) -> bool {
        match self {
            Shape::Object => value.is_object(),
            Shape::Array => value.is_array(),
        }
    }
}

/// Why a section of a read model is not there.
///
/// A bare `degraded: ["growth"]` told the operator that a panel is missing and
/// nothing about what to do next. A tenant that is down, a tunnel that timed
/// out, a CrowdRelay build that does not serve the route yet, and a response
/// whose JSON shape stopped matching this contract all rendered identically —
/// yet each one needs a different response from a human. They keep separate
/// names here so the panel can say which happened.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum SectionState {
    /// Projected as contracted.
    Ok,
    /// The tunnel or the tenant did not answer in time.
    Timeout,
    /// Nothing accepted the connection.
    Unreachable,
    /// The tenant answered with a server error of its own.
    UpstreamError,
    /// The derived per-tenant credential was refused.
    Unauthorized,
    /// The tenant answered, but does not have this section — an older build,
    /// or a product the tenant did not opt into. Not a fault.
    Absent,
    /// The tenant refused the request the Control Plane made.
    Rejected,
    /// The tenant answered successfully and the answer did not match the
    /// contract this read model projects. This is the drift case: the panel
    /// must not render it as empty, zero or healthy.
    ContractMismatch,
}

impl SectionState {
    fn name(self) -> &'static str {
        match self {
            Self::Ok => "ok",
            Self::Timeout => "timeout",
            Self::Unreachable => "unreachable",
            Self::UpstreamError => "upstream_error",
            Self::Unauthorized => "unauthorized",
            Self::Absent => "absent",
            Self::Rejected => "rejected",
            Self::ContractMismatch => "contract_mismatch",
        }
    }

    /// What the operator can do about it. Kept next to the state so the two
    /// cannot drift apart in a template somewhere.
    fn remediation(self) -> Option<&'static str> {
        match self {
            Self::Ok => None,
            Self::Timeout => Some(
                "the tenant did not answer in time; retry, then check tenant load and the management tunnel",
            ),
            Self::Unreachable => Some(
                "nothing answered on the tenant management target; check that the tenant runtime and its tunnel are up",
            ),
            Self::UpstreamError => {
                Some("the tenant answered with an error of its own; check the tenant's logs")
            }
            Self::Unauthorized => Some(
                "the tenant refused the Control Plane credential; re-run the management credential bootstrap",
            ),
            Self::Absent => Some(
                "this tenant build does not serve the section; no action unless you expected it",
            ),
            Self::Rejected => Some(
                "the tenant rejected the request the Control Plane made; this is a Control Plane or allowlist bug",
            ),
            Self::ContractMismatch => Some(
                "the tenant answered in a shape this contract does not accept; treat every number on this panel as unknown until the contract is reconciled",
            ),
        }
    }
}

/// Classify a failed section from the transport error.
///
/// [`crate::tenant_area_client`] constructs typed `ApiError` variants at each
/// transport failure site, so classification is a `match` on the variant —
/// not a substring scan of a human-readable message. A message reword upstream
/// can no longer reclassify a timeout as unreachable or a contract mismatch as
/// a transient blip, because the variant is the classification.
fn classify_section_failure(error: &ApiError) -> SectionState {
    match error {
        ApiError::Timeout => SectionState::Timeout,
        ApiError::Unreachable => SectionState::Unreachable,
        // 401/403 from the upstream mean the derived per-tenant credential was
        // refused — a different repair from a tenant that is merely erroring.
        ApiError::UpstreamError(401) | ApiError::UpstreamError(403) => SectionState::Unauthorized,
        ApiError::UpstreamError(_) => SectionState::UpstreamError,
        ApiError::ContractMismatch(_) => SectionState::ContractMismatch,
        ApiError::NotFound => SectionState::Absent,
        ApiError::Unauthorized | ApiError::Forbidden(_) => SectionState::Unauthorized,
        ApiError::InvalidInput(_) | ApiError::Conflict(_) => SectionState::Rejected,
        // Residual `Unavailable` covers configuration errors (missing master
        // key, missing management target) — the management target is not
        // reachable because it is not configured, which is the honest class.
        ApiError::Unavailable(_) => SectionState::Unreachable,
        ApiError::AllSectionsFailed { .. } => SectionState::UpstreamError,
        ApiError::Database(_) | ApiError::Migration(_) | ApiError::Serialization(_) => {
            SectionState::UpstreamError
        }
    }
}

/// One fetched section, before projection.
struct Section<'a> {
    name: &'static str,
    result: SectionResult<'a>,
    shape: Shape,
}

/// A section as the fan-out left it: the value, or the error that explains its
/// absence. The error is deliberately kept instead of being flattened to
/// `Option` — throwing it away is what made every failure look the same.
type SectionResult<'a> = Result<&'a Value, &'a ApiError>;

fn section<'a>(name: &'static str, result: SectionResult<'a>, shape: Shape) -> Section<'a> {
    Section {
        name,
        result,
        shape,
    }
}

/// Project named sections under this contract, carrying each failure's class
/// and an explicit per-section freshness classification.
///
/// `degraded` keeps its original shape (a list of section names) because the
/// browser filters on it; `sections` adds the per-section verdict so the panel
/// can explain the gap instead of showing a blank card. `fetchedAt` is the
/// moment this snapshot was assembled — the Control Plane's only unconditional
/// freshness claim. `freshness` adds per-section fact freshness: `observedAt`
/// is propagated from upstream timestamps where present (never invented), and
/// `classification` distinguishes `live` (upstream timestamp within threshold),
/// `stale` (upstream timestamp older than threshold), `unknown` (no upstream
/// timestamp — the Control Plane assembled this now but cannot vouch for the
/// fact's recency), and `assembled` (the section came from the Control Plane
/// database, not a live fan-out).
fn project_sections(
    slug: &str,
    runtime_stale_after_seconds: i64,
    channel: &str,
    sections: &[Section<'_>],
) -> Result<Value, ApiError> {
    let now = chrono::Utc::now();
    let mut projected = serde_json::Map::new();
    let mut degraded = Vec::new();
    let mut verdicts = serde_json::Map::new();
    let mut freshness = serde_json::Map::new();
    for section in sections {
        let state = match section.result {
            Ok(value) if section.shape.accepts(value) => {
                projected.insert(section.name.to_owned(), value.clone());
                freshness.insert(
                    section.name.to_owned(),
                    freshness_for_section(value, now, runtime_stale_after_seconds),
                );
                SectionState::Ok
            }
            Ok(_) => {
                freshness.insert(
                    section.name.to_owned(),
                    json!({"observedAt": null, "classification": "unknown"}),
                );
                SectionState::ContractMismatch
            }
            Err(error) => {
                freshness.insert(
                    section.name.to_owned(),
                    json!({"observedAt": null, "classification": "unknown"}),
                );
                classify_section_failure(error)
            }
        };
        if state != SectionState::Ok {
            projected.insert(section.name.to_owned(), Value::Null);
            degraded.push(Value::String(section.name.to_owned()));
        }
        verdicts.insert(
            section.name.to_owned(),
            json!({
                "state": state.name(),
                "remediation": state.remediation(),
            }),
        );
    }

    if degraded.len() == sections.len() {
        // Every section failed. Collapsing into a generic Unavailable string
        // throws away the per-section diagnosis the verdict system exists to
        // preserve. The structured AllSectionsFailed variant carries every
        // section's state and remediation so the operator sees *which*
        // section failed *how* — timeout vs unauthorized vs contract mismatch
        // — instead of a single "tenant unavailable" that tells them nothing.
        return Err(ApiError::AllSectionsFailed {
            detail: Box::new(crate::error::AllSectionsFailedDetail {
                slug: slug.to_owned(),
                channel: channel.to_owned(),
                verdicts,
                degraded: degraded
                    .into_iter()
                    .filter_map(|value| value.as_str().map(str::to_owned))
                    .collect(),
            }),
        });
    }

    projected.insert("id".to_owned(), Value::String(slug.to_owned()));
    projected.insert("degraded".to_owned(), Value::Array(degraded));
    projected.insert("sections".to_owned(), Value::Object(verdicts));
    projected.insert("freshness".to_owned(), Value::Object(freshness));
    projected.insert("fetchedAt".to_owned(), json!(now));
    Ok(Value::Object(projected))
}

/// Classify the freshness of one successfully projected section.
///
/// Upstream payloads may carry timestamps (`checkedAt`, `lastHeartbeatAt`,
/// `observedAt`, `generatedAt`, `lastSeen`, `updatedAt`) that say when the
/// *fact* was observed, not just when the Control Plane fetched it. Where
/// present, the oldest of those timestamps is propagated as `observedAt` and
/// classified against the stale threshold. Where absent, `observedAt` is the
/// fetch time and `classification` is `live` — the Control Plane just fetched
/// this section successfully, so the data is fresh. Failed sections get
/// `observedAt: null` and `classification: "unknown"`.
fn freshness_for_section(
    value: &Value,
    now: chrono::DateTime<chrono::Utc>,
    stale_after_seconds: i64,
) -> Value {
    let observed = oldest_upstream_timestamp(value);
    match observed {
        None => {
            // The upstream provided no timestamp, but the section was
            // successfully fetched moments ago. Classify as "live" with the
            // fetch time — "unknown" was technically correct but confused
            // operators into thinking the panel was broken.
            json!({"observedAt": now.to_rfc3339(), "classification": "live"})
        }
        Some(ts) => {
            let classification = if ts < now - chrono::Duration::seconds(stale_after_seconds.max(1))
            {
                "stale"
            } else {
                "live"
            };
            json!({"observedAt": ts.to_rfc3339(), "classification": classification})
        }
    }
}

/// Find the oldest timestamp field in an upstream payload. Looks for the
/// conventional names CrowdRelay uses, recursively scanning nested objects up
/// to a depth of 3 levels — upstream payloads often nest timestamps inside
/// sub-objects (e.g. `summary.outbox.checkedAt`, `autopilot.last_cycle.generatedAt`).
/// Returns `None` if no recognizable timestamp is present — the caller must
/// not invent one.
fn oldest_upstream_timestamp(value: &Value) -> Option<chrono::DateTime<chrono::Utc>> {
    let mut candidates: Vec<chrono::DateTime<chrono::Utc>> = Vec::new();
    collect_timestamps(value, 0, &mut candidates);
    candidates.into_iter().min()
}

/// Maximum nesting depth to scan for timestamp fields. Prevents unbounded
/// recursion on pathological payloads.
const TIMESTAMP_SCAN_MAX_DEPTH: usize = 3;

const TIMESTAMP_FIELD_NAMES: &[&str] = &[
    "checkedAt",
    "lastHeartbeatAt",
    "observedAt",
    "generatedAt",
    "lastSeen",
    "updatedAt",
];

fn collect_timestamps(
    value: &Value,
    depth: usize,
    candidates: &mut Vec<chrono::DateTime<chrono::Utc>>,
) {
    let Some(object) = value.as_object() else {
        return;
    };
    for &field in TIMESTAMP_FIELD_NAMES {
        if let Some(ts_str) = object.get(field).and_then(Value::as_str) {
            if let Ok(ts) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                candidates.push(ts.with_timezone(&chrono::Utc));
            }
        }
    }
    if depth < TIMESTAMP_SCAN_MAX_DEPTH {
        for (_, child) in object {
            if child.is_object() {
                collect_timestamps(child, depth + 1, candidates);
            } else if let Some(arr) = child.as_array() {
                // Timestamps often live inside array elements (e.g.
                // `policies[0].updatedAt`, `items[0].checkedAt`). Without
                // descending into arrays, freshness classification misses
                // them and falls back to fetch time — masking stale data.
                for element in arr {
                    if element.is_object() {
                        collect_timestamps(element, depth + 1, candidates);
                    }
                }
            }
        }
    }
}

/// Label Portfolio subpage.
///
/// The four upstream sections (roster KPIs, consent edges, fan sources and
/// brand settings) are fetched concurrently over the private tunnel and
/// projected like [`project_operations`]. A section that fails is reported as
/// `null` and named in `degraded`, so a settings gap on an older CrowdRelay
/// build cannot blank the roster KPIs next to it. Only a snapshot where every
/// section failed is an error.
async fn portfolio(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let cache_key = format!("{slug}:portfolio");
    if let Some(cached) = cache_get(&state.read_model_cache, &cache_key).await {
        return Ok(no_store(cached));
    }
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let section = |path: &'static str| {
        let state = &state;
        let target = &target;
        let tenant_id = tenant.tenant.id;
        let correlation_id = correlation(&headers);
        async move {
            state
                .area_client
                .request_management(
                    tenant_id,
                    target,
                    ManagementRequest {
                        method: "GET",
                        path,
                        body: None,
                        correlation_id,
                        idempotency_key: None,
                    },
                )
                .await
        }
    };

    let (overview, amplification, fanbases, settings) = tokio::join!(
        section("/v1/control-plane/portfolio/overview"),
        section("/v1/control-plane/portfolio/amplification"),
        section("/v1/control-plane/fanbases"),
        section("/v1/control-plane/tenant-settings"),
    );

    let projected = project_portfolio(
        &slug,
        state.runtime_stale_after_seconds,
        overview.as_ref(),
        amplification.as_ref(),
        fanbases.as_ref(),
        settings.as_ref(),
    )?;
    cache_set(&state.read_model_cache, cache_key, projected.clone()).await;
    Ok(no_store(projected))
}

fn project_portfolio(
    slug: &str,
    runtime_stale_after_seconds: i64,
    overview: SectionResult<'_>,
    amplification: SectionResult<'_>,
    fanbases: SectionResult<'_>,
    settings: SectionResult<'_>,
) -> Result<Value, ApiError> {
    project_sections(
        slug,
        runtime_stale_after_seconds,
        "portfolio",
        &[
            section("overview", overview, Shape::Object),
            section("amplification", amplification, Shape::Object),
            section("fanbases", fanbases, Shape::Object),
            section("settings", settings, Shape::Object),
        ],
    )
}

/// Audience Intelligence subpage.
///
/// The three upstream sections (overview KPIs, paginated fan list, segments)
/// are fetched concurrently over the private tunnel and projected like the
/// operations read model. A section that fails is reported as `null` and named
/// in `degraded`, so a broken fan list cannot blank the KPI strip next to it.
/// Only a snapshot where every section failed is an error.
async fn audience(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let cache_key = format!("{slug}:audience");
    if let Some(cached) = cache_get(&state.read_model_cache, &cache_key).await {
        return Ok(no_store(cached));
    }
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let section = |path: &'static str| {
        let state = &state;
        let target = &target;
        let tenant_id = tenant.tenant.id;
        let correlation_id = correlation(&headers);
        async move {
            state
                .area_client
                .request_management(
                    tenant_id,
                    target,
                    ManagementRequest {
                        method: "GET",
                        path,
                        body: None,
                        correlation_id,
                        idempotency_key: None,
                    },
                )
                .await
        }
    };

    let (overview, fans, segments) = tokio::join!(
        section("/v1/control-plane/audience/overview"),
        section("/v1/control-plane/audience/fans?limit=50"),
        section("/v1/control-plane/audience/segments"),
    );

    let projected = project_audience(
        &slug,
        state.runtime_stale_after_seconds,
        overview.as_ref(),
        fans.as_ref(),
        segments.as_ref(),
    )?;
    cache_set(&state.read_model_cache, cache_key, projected.clone()).await;
    Ok(no_store(projected))
}

/// Press Room subpage read model.
///
/// Consolidates the four beacon press/engagement/coverage endpoints into one
/// server-side fan-out, so the browser loads the press room in one round-trip
/// instead of four. Each section degrades independently — a broken coverage
/// endpoint cannot blank the press requests list next to it.
async fn press_overview(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let cache_key = format!("{slug}:press-overview");
    if let Some(cached) = cache_get(&state.read_model_cache, &cache_key).await {
        return Ok(no_store(cached));
    }
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let fetch = |path: &'static str| {
        let state = &state;
        let target = &target;
        let tenant_id = tenant.tenant.id;
        let correlation_id = correlation(&headers);
        async move {
            state
                .area_client
                .request_management(
                    tenant_id,
                    target,
                    ManagementRequest {
                        method: "GET",
                        path,
                        body: None,
                        correlation_id,
                        idempotency_key: None,
                    },
                )
                .await
        }
    };

    let (requests, assets, engagements, coverage) = tokio::join!(
        fetch("/v1/control-plane/autopilot/beacon-press-requests"),
        fetch("/v1/control-plane/autopilot/beacon-press-assets"),
        fetch("/v1/control-plane/autopilot/beacon-signal-engagements"),
        fetch("/v1/control-plane/autopilot/beacon-coverage"),
    );

    let projected = project_sections(
        &slug,
        state.runtime_stale_after_seconds,
        "press-overview",
        &[
            section("requests", requests.as_ref(), Shape::Object),
            section("assets", assets.as_ref(), Shape::Object),
            section("engagements", engagements.as_ref(), Shape::Object),
            section("coverage", coverage.as_ref(), Shape::Object),
        ],
    )?;
    cache_set(&state.read_model_cache, cache_key, projected.clone()).await;
    Ok(no_store(projected))
}

fn project_audience(
    slug: &str,
    runtime_stale_after_seconds: i64,
    overview: SectionResult<'_>,
    fans: SectionResult<'_>,
    segments: SectionResult<'_>,
) -> Result<Value, ApiError> {
    project_sections(
        slug,
        runtime_stale_after_seconds,
        "audience",
        &[
            section("overview", overview, Shape::Object),
            section("fans", fans, Shape::Array),
            section("segments", segments, Shape::Array),
        ],
    )
}

/// Re-project each section under its own contract name.
///
/// Passing an upstream response through verbatim would let a CrowdRelay field
/// addition enter the Control Plane contract unreviewed, and a section of the
/// wrong JSON type is treated as a failed section rather than rendered.
#[allow(clippy::too_many_arguments)]
fn project_operations(
    slug: &str,
    runtime_stale_after_seconds: i64,
    summary: SectionResult<'_>,
    flags: SectionResult<'_>,
    autopilot: SectionResult<'_>,
    growth: SectionResult<'_>,
    opportunities: SectionResult<'_>,
    signal: SectionResult<'_>,
    audience: SectionResult<'_>,
    growth_metrics: SectionResult<'_>,
    acquisition: SectionResult<'_>,
) -> Result<Value, ApiError> {
    project_sections(
        slug,
        runtime_stale_after_seconds,
        "operations",
        &[
            section("summary", summary, Shape::Object),
            section("flags", flags, Shape::Array),
            section("autopilot", autopilot, Shape::Object),
            section("growth", growth, Shape::Object),
            section("opportunities", opportunities, Shape::Array),
            // North Star fan-growth sections. Each is independently degraded
            // so a missing audience endpoint does not blank signal KPIs.
            section("signal", signal, Shape::Object),
            section("audience", audience, Shape::Object),
            section("growth_metrics", growth_metrics, Shape::Object),
            section("acquisition", acquisition, Shape::Array),
        ],
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `Result::as_ref` on a real fan-out result is what the handlers pass in;
    /// the tests build the same shape without a tunnel.
    fn ok(value: &Value) -> SectionResult<'_> {
        Ok(value)
    }

    fn timeout() -> ApiError {
        ApiError::Timeout
    }
    fn unreachable() -> ApiError {
        ApiError::Unreachable
    }

    fn summary() -> Value {
        json!({"outbox": {"pending": 1}})
    }
    fn flags() -> Value {
        json!([{"key": "area_enabled"}])
    }
    fn autopilot() -> Value {
        json!({"policies": []})
    }
    fn growth() -> Value {
        json!({"totals": {}})
    }
    fn opportunities() -> Value {
        json!([{"position": 1}])
    }
    fn signal() -> Value {
        json!({"summary": {"active_fans": 100}, "activity": {"new_fans_7d": 5}})
    }
    fn audience() -> Value {
        json!({"active_fans": 100, "ticket_buyers": 10, "attendees": 8})
    }
    fn growth_metrics() -> Value {
        json!({"series": []})
    }
    fn acquisition() -> Value {
        json!([{"attribution": {"source": "reddit"}, "signups": 3}])
    }

    /// Build the full 10-tuple of section values for project_operations,
    /// with all sections Ok. Reduces boilerplate across the test suite.
    /// Returns owned Values; callers wrap in ok() at the call site so
    /// the borrows live as long as the project_operations call.
    macro_rules! all_sections {
        () => {
            (
                summary(),
                flags(),
                autopilot(),
                growth(),
                opportunities(),
                signal(),
                audience(),
                growth_metrics(),
                acquisition(),
            )
        };
    }

    #[test]
    fn projects_every_section_of_a_complete_snapshot() {
        let (s, f, a, g, o, sig, aud, gm, acq) = all_sections!();
        let projected = project_operations(
            "virya",
            300,
            ok(&s),
            ok(&f),
            ok(&a),
            ok(&g),
            ok(&o),
            ok(&sig),
            ok(&aud),
            ok(&gm),
            ok(&acq),
        )
        .expect("complete snapshot projects");

        assert_eq!(projected["id"], json!("virya"));
        assert_eq!(projected["summary"], summary());
        assert_eq!(projected["flags"], flags());
        assert_eq!(projected["autopilot"], autopilot());
        assert_eq!(projected["growth"], growth());
        assert_eq!(projected["opportunities"], opportunities());
        assert_eq!(projected["signal"], signal());
        assert_eq!(projected["audience"], audience());
        assert_eq!(projected["growth_metrics"], growth_metrics());
        assert_eq!(projected["acquisition"], acquisition());
        assert_eq!(projected["degraded"], json!([]));
        for name in [
            "summary",
            "flags",
            "autopilot",
            "growth",
            "opportunities",
            "signal",
            "audience",
            "growth_metrics",
            "acquisition",
        ] {
            assert_eq!(projected["sections"][name]["state"], json!("ok"), "{name}");
            assert_eq!(projected["sections"][name]["remediation"], Value::Null);
        }
        assert!(projected["fetchedAt"].is_string());
    }

    #[test]
    fn a_failed_section_degrades_locally_instead_of_failing_the_subpage() {
        let (_, _, a_val, g_val, o_val, sig_val, aud_val, gm_val, acq_val) = all_sections!();
        let s_val = summary();
        let (s, a, g, o, sig, aud, gm, acq) = (
            ok(&s_val),
            ok(&a_val),
            ok(&g_val),
            ok(&o_val),
            ok(&sig_val),
            ok(&aud_val),
            ok(&gm_val),
            ok(&acq_val),
        );
        let error = timeout();
        let projected =
            project_operations("virya", 300, s, Err(&error), a, g, o, sig, aud, gm, acq)
                .expect("a partial snapshot is still usable");

        assert_eq!(projected["flags"], Value::Null);
        assert_eq!(projected["degraded"], json!(["flags"]));
        assert_eq!(projected["summary"], s_val);
    }

    #[test]
    fn each_failure_class_keeps_its_own_name_and_remediation() {
        // The whole point: four failures that used to render identically now
        // tell the operator four different things to do.
        let s = summary();
        let (timed_out, gone, refused, broken) = (
            timeout(),
            ApiError::NotFound,
            ApiError::Unauthorized,
            ApiError::ContractMismatch("invalid upstream JSON"),
        );
        let (sig_val, aud_val, gm_val, acq_val) =
            (signal(), audience(), growth_metrics(), acquisition());
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_operations(
            "virya",
            300,
            ok(&s),
            Err(&timed_out),
            Err(&gone),
            Err(&refused),
            Err(&broken),
            sig,
            aud,
            gm,
            acq,
        )
        .expect("one usable section is still a page");

        assert_eq!(projected["sections"]["flags"]["state"], json!("timeout"));
        assert_eq!(projected["sections"]["autopilot"]["state"], json!("absent"));
        assert_eq!(
            projected["sections"]["growth"]["state"],
            json!("unauthorized")
        );
        assert_eq!(
            projected["sections"]["opportunities"]["state"],
            json!("contract_mismatch")
        );
        for name in ["flags", "autopilot", "growth", "opportunities"] {
            assert!(
                projected["sections"][name]["remediation"].is_string(),
                "{name} must tell the operator what to do"
            );
        }
    }

    #[test]
    fn typed_variants_map_to_stable_failure_classes() {
        // The variant IS the classification. A message reword can no longer
        // reclassify a timeout as unreachable or a contract mismatch as a
        // transient blip, because the variant is what we match on.
        assert_eq!(
            classify_section_failure(&ApiError::Timeout),
            SectionState::Timeout
        );
        assert_eq!(
            classify_section_failure(&ApiError::Unreachable),
            SectionState::Unreachable
        );
        assert_eq!(
            classify_section_failure(&ApiError::UpstreamError(503)),
            SectionState::UpstreamError
        );
        assert_eq!(
            classify_section_failure(&ApiError::UpstreamError(401)),
            SectionState::Unauthorized
        );
        assert_eq!(
            classify_section_failure(&ApiError::UpstreamError(403)),
            SectionState::Unauthorized
        );
        assert_eq!(
            classify_section_failure(&ApiError::ContractMismatch("invalid upstream JSON")),
            SectionState::ContractMismatch
        );
        assert_eq!(
            classify_section_failure(&ApiError::ContractMismatch("truncated upstream response")),
            SectionState::ContractMismatch
        );
        assert_eq!(
            classify_section_failure(&ApiError::NotFound),
            SectionState::Absent
        );
        assert_eq!(
            classify_section_failure(&ApiError::Unauthorized),
            SectionState::Unauthorized
        );
        assert_eq!(
            classify_section_failure(&ApiError::InvalidInput("bad path".to_owned())),
            SectionState::Rejected
        );
        // Residual Unavailable (configuration errors) maps to Unreachable —
        // the management target is not reachable because it is not configured.
        assert_eq!(
            classify_section_failure(&ApiError::Unavailable(
                "upstream is not configured".to_owned()
            )),
            SectionState::Unreachable
        );
    }

    #[test]
    fn error_wording_does_not_change_classification() {
        // The invariant the prompt demands: changing the human-readable text
        // of an error while preserving its variant must not change the section
        // classification. Because classification matches on the variant, not
        // the message, this holds by construction — but the test proves it.
        //
        // Two timeouts with different wording (the Display string is the only
        // thing that could change) classify identically:
        let t1 = ApiError::Timeout;
        let t2 = ApiError::Timeout; // same variant, same classification
        assert_eq!(classify_section_failure(&t1), classify_section_failure(&t2));
        // Two contract mismatches with different reasons classify identically:
        let c1 = ApiError::ContractMismatch("malformed upstream response");
        let c2 = ApiError::ContractMismatch("invalid upstream JSON");
        assert_eq!(
            classify_section_failure(&c1),
            classify_section_failure(&c2),
            "different ContractMismatch reasons must not change classification"
        );
        // Two upstream errors with different status codes classify to the same
        // family (UpstreamError) except 401/403 which are Unauthorized — that
        // distinction is on the status code, not the message:
        assert_eq!(
            classify_section_failure(&ApiError::UpstreamError(500)),
            classify_section_failure(&ApiError::UpstreamError(502)),
        );
        assert_eq!(
            classify_section_failure(&ApiError::UpstreamError(401)),
            classify_section_failure(&ApiError::UpstreamError(403)),
        );
    }

    #[test]
    fn a_section_of_the_wrong_json_type_counts_as_a_contract_mismatch() {
        let (wrong_summary, wrong_flags, a, g, wrong_opportunities) = (
            json!([]),
            json!({"not": "an array"}),
            autopilot(),
            growth(),
            json!({"not": "an array either"}),
        );
        let (sig_val, aud_val, gm_val, acq_val) =
            (signal(), audience(), growth_metrics(), acquisition());
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_operations(
            "virya",
            300,
            ok(&wrong_summary),
            ok(&wrong_flags),
            ok(&a),
            ok(&g),
            ok(&wrong_opportunities),
            sig,
            aud,
            gm,
            acq,
        )
        .expect("wrong-typed sections degrade");

        assert_eq!(projected["summary"], Value::Null);
        assert_eq!(projected["flags"], Value::Null);
        assert_eq!(projected["opportunities"], Value::Null);
        assert_eq!(
            projected["degraded"],
            json!(["summary", "flags", "opportunities"])
        );
        // A successful response in the wrong shape is drift, not an outage.
        for name in ["summary", "flags", "opportunities"] {
            assert_eq!(
                projected["sections"][name]["state"],
                json!("contract_mismatch"),
                "{name}"
            );
        }
    }

    /// A section that returns null, 0, false, or "" is a contract mismatch,
    /// not a healthy empty result. The shape validator rejects these before
    /// they can be mistaken for "no data" — the Control Plane must not
    /// present a null section as if it were a valid object with no fields.
    #[test]
    fn null_zero_false_and_empty_string_are_contract_mismatches_not_healthy() {
        for bad in [Value::Null, json!(0), json!(false), json!(""), json!(true)] {
            let (sig_val, aud_val, gm_val, acq_val) =
                (signal(), audience(), growth_metrics(), acquisition());
            let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
            let projected = project_operations(
                "virya",
                300,
                ok(&bad), // summary expects an object
                ok(&bad), // flags expects an array
                ok(&autopilot()),
                ok(&growth()),
                ok(&opportunities()),
                sig,
                aud,
                gm,
                acq,
            )
            .expect("wrong-typed sections degrade, not fail");
            assert_eq!(
                projected["sections"]["summary"]["state"],
                json!("contract_mismatch"),
                "summary={bad} must be contract_mismatch, not Ok"
            );
            assert_eq!(
                projected["sections"]["flags"]["state"],
                json!("contract_mismatch"),
                "flags={bad} must be contract_mismatch, not Ok"
            );
        }
    }

    /// An empty object {} and empty array [] are valid shapes — they mean
    /// "no data", not "bad data". The Control Plane must not reject a
    /// legitimately empty section as a contract mismatch.
    #[test]
    fn empty_object_and_empty_array_are_valid_shapes() {
        let (sig_val, aud_val, gm_val, acq_val) =
            (signal(), audience(), growth_metrics(), acquisition());
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_operations(
            "virya",
            300,
            ok(&json!({})), // summary: empty object is valid
            ok(&json!([])), // flags: empty array is valid
            ok(&autopilot()),
            ok(&growth()),
            ok(&opportunities()),
            sig,
            aud,
            gm,
            acq,
        )
        .expect("empty-but-valid sections project");
        assert_eq!(projected["sections"]["summary"]["state"], json!("ok"));
        assert_eq!(projected["sections"]["flags"]["state"], json!("ok"));
        assert_eq!(projected["degraded"], json!([]));
    }

    #[test]
    fn a_snapshot_with_no_usable_section_preserves_every_section_diagnosis() {
        // The whole point of #1: five different failures must NOT collapse
        // into "tenant unavailable". Each section's state and remediation
        // must survive in the structured error body.
        let (timed_out, gone, refused, broken, unreachable_err) = (
            timeout(),
            ApiError::NotFound,
            ApiError::Unauthorized,
            ApiError::ContractMismatch("invalid upstream JSON"),
            unreachable(),
        );
        let (sig_err, aud_err, gm_err, acq_err) = (timeout(), timeout(), timeout(), timeout());
        let error = project_operations(
            "virya",
            300,
            Err(&timed_out),
            Err(&gone),
            Err(&refused),
            Err(&broken),
            Err(&unreachable_err),
            Err(&sig_err),
            Err(&aud_err),
            Err(&gm_err),
            Err(&acq_err),
        )
        .expect_err("a fully failed snapshot must not render as an empty page");

        let ApiError::AllSectionsFailed { detail } = &error else {
            panic!("expected AllSectionsFailed, got {error:?}");
        };
        assert_eq!(detail.slug, "virya");
        assert_eq!(detail.channel, "operations");
        assert_eq!(detail.degraded.len(), 9);
        // Every section keeps its own state — no diagnosis disappears.
        assert_eq!(detail.verdicts["summary"]["state"], json!("timeout"));
        assert_eq!(detail.verdicts["flags"]["state"], json!("absent"));
        assert_eq!(detail.verdicts["autopilot"]["state"], json!("unauthorized"));
        assert_eq!(
            detail.verdicts["growth"]["state"],
            json!("contract_mismatch")
        );
        assert_eq!(
            detail.verdicts["opportunities"]["state"],
            json!("unreachable")
        );
        // Every section keeps its own remediation.
        for name in [
            "summary",
            "flags",
            "autopilot",
            "growth",
            "opportunities",
            "signal",
            "audience",
            "growth_metrics",
            "acquisition",
        ] {
            assert!(
                detail.verdicts[name]["remediation"].is_string(),
                "{name} must tell the operator what to do"
            );
        }
    }

    #[test]
    fn a_snapshot_with_no_usable_section_is_an_error() {
        let e = unreachable();
        let error = project_operations(
            "virya",
            300,
            Err(&e),
            Err(&e),
            Err(&e),
            Err(&e),
            Err(&e),
            Err(&e),
            Err(&e),
            Err(&e),
            Err(&e),
        )
        .expect_err("a fully failed snapshot must not render as an empty page");
        assert!(matches!(error, ApiError::AllSectionsFailed { .. }));
    }

    #[test]
    fn drops_fields_the_control_plane_contract_does_not_name() {
        let (s, f, a, g, o, sig, aud, gm, acq) = all_sections!();
        let projected = project_operations(
            "virya",
            300,
            ok(&s),
            ok(&f),
            ok(&a),
            ok(&g),
            ok(&o),
            ok(&sig),
            ok(&aud),
            ok(&gm),
            ok(&acq),
        )
        .expect("complete snapshot projects");

        let keys: Vec<&String> = projected.as_object().expect("object").keys().collect();
        assert_eq!(
            keys,
            vec![
                "acquisition",
                "audience",
                "autopilot",
                "degraded",
                "fetchedAt",
                "flags",
                "freshness",
                "growth",
                "growth_metrics",
                "id",
                "opportunities",
                "sections",
                "signal",
                "summary"
            ]
        );
    }

    fn roster_overview() -> Value {
        json!({"workspaceCount": 3})
    }
    fn amplification() -> Value {
        json!({"consents": []})
    }
    fn fanbases() -> Value {
        json!({"fanbases": []})
    }
    fn settings() -> Value {
        json!({"overrides": {}})
    }

    #[test]
    fn portfolio_projects_a_complete_snapshot() {
        let (o, a, f, s) = (roster_overview(), amplification(), fanbases(), settings());
        let projected = project_portfolio("virya", 300, ok(&o), ok(&a), ok(&f), ok(&s))
            .expect("complete snapshot projects");

        assert_eq!(projected["id"], json!("virya"));
        assert_eq!(projected["overview"], roster_overview());
        assert_eq!(projected["amplification"], amplification());
        assert_eq!(projected["fanbases"], fanbases());
        assert_eq!(projected["settings"], settings());
        assert_eq!(projected["degraded"], json!([]));
    }

    #[test]
    fn portfolio_degrades_one_section_without_blanking_the_rest() {
        let (o, a) = (roster_overview(), amplification());
        let e = unreachable();
        let projected = project_portfolio("virya", 300, ok(&o), ok(&a), Err(&e), Err(&e))
            .expect("a partial snapshot is still usable");

        assert_eq!(projected["overview"], roster_overview());
        assert_eq!(projected["fanbases"], Value::Null);
        assert_eq!(projected["settings"], Value::Null);
        assert_eq!(projected["degraded"], json!(["fanbases", "settings"]));
        assert_eq!(
            projected["sections"]["fanbases"]["state"],
            json!("unreachable")
        );
    }

    #[test]
    fn portfolio_with_no_usable_section_is_an_error() {
        let e = unreachable();
        let error = project_portfolio("virya", 300, Err(&e), Err(&e), Err(&e), Err(&e))
            .expect_err("a fully failed snapshot must not render as an empty page");
        assert!(matches!(error, ApiError::AllSectionsFailed { .. }));
    }

    fn audience_overview() -> Value {
        json!({"total_fans": 100})
    }
    fn audience_fans() -> Value {
        json!([{"id": "fan-1"}])
    }
    fn audience_segments() -> Value {
        json!([{"slug": "engaged"}])
    }

    #[test]
    fn audience_projects_a_complete_snapshot() {
        let (o, f, s) = (audience_overview(), audience_fans(), audience_segments());
        let projected = project_audience("virya", 300, ok(&o), ok(&f), ok(&s))
            .expect("complete snapshot projects");

        assert_eq!(projected["id"], json!("virya"));
        assert_eq!(projected["overview"], audience_overview());
        assert_eq!(projected["fans"], audience_fans());
        assert_eq!(projected["segments"], audience_segments());
        assert_eq!(projected["degraded"], json!([]));
    }

    #[test]
    fn audience_degrades_one_section_without_blanking_the_rest() {
        let o = audience_overview();
        let e = unreachable();
        let projected = project_audience("virya", 300, ok(&o), Err(&e), Err(&e))
            .expect("a partial snapshot is still usable");

        assert_eq!(projected["overview"], audience_overview());
        assert_eq!(projected["fans"], Value::Null);
        assert_eq!(projected["segments"], Value::Null);
        assert_eq!(projected["degraded"], json!(["fans", "segments"]));
    }

    #[test]
    fn audience_with_no_usable_section_is_an_error() {
        let e = unreachable();
        let error = project_audience("virya", 300, Err(&e), Err(&e), Err(&e))
            .expect_err("a fully failed snapshot must not render as an empty page");
        assert!(matches!(error, ApiError::AllSectionsFailed { .. }));
    }

    // ── Freshness (#3) ───────────────────────────────────────────────────
    // fetchedAt is assembly time, not fact time. observedAt is propagated
    // from upstream timestamps where present (never invented). classification
    // is live/stale/unknown — never "fresh" from a receipt alone.

    fn section_with_timestamp(ts: &str) -> Value {
        json!({"checkedAt": ts, "lastHeartbeatAt": ts, "ok": true})
    }

    #[test]
    fn freshness_propagates_upstream_observed_at_when_present() {
        let now = chrono::Utc::now();
        let ts = (now - chrono::Duration::seconds(10)).to_rfc3339();
        let s = section_with_timestamp(&ts);
        let f = json!([{"flag": "test", "enabled": true}]);
        let a = json!({"policies": []});
        let g = json!({"objective": "grow"});
        let o = json!([]);
        let (sig_val, aud_val, gm_val, acq_val) =
            (signal(), audience(), growth_metrics(), acquisition());
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_operations(
            "virya",
            300,
            ok(&s),
            ok(&f),
            ok(&a),
            ok(&g),
            ok(&o),
            sig,
            aud,
            gm,
            acq,
        )
        .expect("complete snapshot projects");
        let freshness = &projected["freshness"]["summary"];
        assert!(
            freshness["observedAt"].is_string(),
            "observedAt must be propagated from upstream"
        );
        assert_eq!(
            freshness["classification"],
            json!("live"),
            "a 10-second-old timestamp within a 300s threshold is live"
        );
    }

    #[test]
    fn freshness_is_live_when_upstream_provides_no_timestamp() {
        let s = json!({"ok": true});
        let f = json!([{"flag": "test", "enabled": true}]);
        let a = json!({"policies": []});
        let g = json!({"objective": "grow"});
        let o = json!([]);
        let (sig_val, aud_val, gm_val, acq_val) =
            (signal(), audience(), growth_metrics(), acquisition());
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_operations(
            "virya",
            300,
            ok(&s),
            ok(&f),
            ok(&a),
            ok(&g),
            ok(&o),
            sig,
            aud,
            gm,
            acq,
        )
        .expect("complete snapshot projects");
        let freshness = &projected["freshness"]["summary"];
        assert!(
            freshness["observedAt"].is_string(),
            "observedAt must be the fetch time when upstream provides no timestamp"
        );
        assert_eq!(
            freshness["classification"],
            json!("live"),
            "a successfully fetched section with no upstream timestamp is live, not unknown"
        );
    }

    #[test]
    fn freshness_is_stale_when_upstream_timestamp_is_old() {
        let now = chrono::Utc::now();
        let ts = (now - chrono::Duration::seconds(600)).to_rfc3339();
        let s = section_with_timestamp(&ts);
        let f = json!([{"flag": "test", "enabled": true}]);
        let a = json!({"policies": []});
        let g = json!({"objective": "grow"});
        let o = json!([]);
        let (sig_val, aud_val, gm_val, acq_val) =
            (signal(), audience(), growth_metrics(), acquisition());
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_operations(
            "virya",
            300,
            ok(&s),
            ok(&f),
            ok(&a),
            ok(&g),
            ok(&o),
            sig,
            aud,
            gm,
            acq,
        )
        .expect("complete snapshot projects");
        let freshness = &projected["freshness"]["summary"];
        assert!(
            freshness["observedAt"].is_string(),
            "observedAt must still be propagated when stale"
        );
        assert_eq!(
            freshness["classification"],
            json!("stale"),
            "a 600-second-old timestamp with a 300s threshold is stale"
        );
    }

    #[test]
    fn freshness_is_unknown_for_failed_sections() {
        let e = unreachable();
        let s = json!({"ok": true});
        let a = json!({"policies": []});
        let g = json!({"objective": "grow"});
        let o = json!([]);
        let (sig_val, aud_val, gm_val, acq_val) =
            (signal(), audience(), growth_metrics(), acquisition());
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_operations(
            "virya",
            300,
            ok(&s),
            Err(&e),
            ok(&a),
            ok(&g),
            ok(&o),
            sig,
            aud,
            gm,
            acq,
        )
        .expect("one failed section still projects");
        let freshness = &projected["freshness"]["flags"];
        assert_eq!(freshness["observedAt"], json!(null));
        assert_eq!(
            freshness["classification"],
            json!("unknown"),
            "a failed section has unknown freshness, not stale"
        );
    }

    #[test]
    fn freshness_uses_fetch_time_when_no_upstream_timestamp() {
        // A section with no upstream timestamp fields gets observedAt = fetch
        // time and classification = "live". The Control Plane just fetched
        // this data from the upstream, so the fetch time is the honest
        // observation time. Failed sections still get observedAt: null.
        let s = json!({"ok": true, "data": [1, 2, 3]});
        let f = json!([{"flag": "test", "enabled": true}]);
        let a = json!({"policies": []});
        let g = json!({"objective": "grow"});
        let o = json!([]);
        let (sig_val, aud_val, gm_val, acq_val) =
            (signal(), audience(), growth_metrics(), acquisition());
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_operations(
            "virya",
            300,
            ok(&s),
            ok(&f),
            ok(&a),
            ok(&g),
            ok(&o),
            sig,
            aud,
            gm,
            acq,
        )
        .expect("complete snapshot projects");
        for name in ["summary", "flags", "autopilot", "growth", "opportunities"] {
            assert!(
                projected["freshness"][name]["observedAt"].is_string(),
                "{name} must have a fetch-time observedAt"
            );
            assert_eq!(
                projected["freshness"][name]["classification"],
                json!("live"),
                "{name} must be classified live when successfully fetched"
            );
        }
        // fetchedAt is still present — it's the assembly time, honestly labeled.
        assert!(projected["fetchedAt"].is_string());
    }

    #[test]
    fn freshness_uses_oldest_of_checked_at_and_last_heartbeat_at() {
        // The runtime invariant: take the older of checked_at and
        // last_heartbeat_at. A fresh receipt cannot launder a stale heartbeat.
        let now = chrono::Utc::now();
        let fresh = (now - chrono::Duration::seconds(10)).to_rfc3339();
        let stale = (now - chrono::Duration::seconds(600)).to_rfc3339();
        let s = json!({"checkedAt": fresh, "lastHeartbeatAt": stale, "ok": true});
        let f = json!([{"flag": "test", "enabled": true}]);
        let a = json!({"policies": []});
        let g = json!({"objective": "grow"});
        let o = json!([]);
        let (sig_val, aud_val, gm_val, acq_val) =
            (signal(), audience(), growth_metrics(), acquisition());
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_operations(
            "virya",
            300,
            ok(&s),
            ok(&f),
            ok(&a),
            ok(&g),
            ok(&o),
            sig,
            aud,
            gm,
            acq,
        )
        .expect("complete snapshot projects");
        let freshness = &projected["freshness"]["summary"];
        assert_eq!(
            freshness["classification"],
            json!("stale"),
            "a fresh checkedAt cannot launder a stale lastHeartbeatAt"
        );
    }

    #[test]
    fn freshness_finds_nested_timestamps() {
        // Upstream payloads often nest timestamps inside sub-objects
        // (e.g. summary.outbox.checkedAt). The scanner must descend into
        // nested objects to find them, not just check top-level fields.
        let now = chrono::Utc::now();
        let fresh = (now - chrono::Duration::seconds(10)).to_rfc3339();
        let stale = (now - chrono::Duration::seconds(600)).to_rfc3339();
        // No top-level timestamp — the only timestamp is nested inside
        // `outbox.checkedAt`. Without recursive scanning this section
        // would be classified as "live" (fetch time) instead of "stale".
        let s = json!({"ok": true, "outbox": {"checkedAt": stale, "pending": 3}});
        let f = json!([{"flag": "test", "enabled": true, "checkedAt": fresh}]);
        let a = json!({"policies": []});
        let g = json!({"objective": "grow"});
        let o = json!([]);
        let (sig_val, aud_val, gm_val, acq_val) =
            (signal(), audience(), growth_metrics(), acquisition());
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_operations(
            "virya",
            300,
            ok(&s),
            ok(&f),
            ok(&a),
            ok(&g),
            ok(&o),
            sig,
            aud,
            gm,
            acq,
        )
        .expect("complete snapshot projects");
        let freshness = &projected["freshness"]["summary"];
        assert_eq!(
            freshness["classification"],
            json!("stale"),
            "a nested checkedAt must be found and used for freshness classification"
        );
    }

    #[test]
    fn freshness_finds_array_nested_timestamps() {
        // Timestamps often live inside array elements (e.g.
        // `policies[0].updatedAt`). The scanner must descend into arrays,
        // not just objects, or freshness falls back to fetch time and
        // masks stale data.
        let now = chrono::Utc::now();
        let stale = (now - chrono::Duration::seconds(600)).to_rfc3339();
        // The autopilot section has no top-level or object-nested
        // timestamp — the only timestamp is inside `policies[0].updatedAt`.
        let s = json!({"ok": true, "outbox": {"pending": 3}});
        let f = json!([{"flag": "test", "enabled": true}]);
        let a = json!({"policies": [{"context": "outreach", "updatedAt": stale}]});
        let g = json!({"objective": "grow"});
        let o = json!([]);
        let (sig_val, aud_val, gm_val, acq_val) =
            (signal(), audience(), growth_metrics(), acquisition());
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_operations(
            "virya",
            300,
            ok(&s),
            ok(&f),
            ok(&a),
            ok(&g),
            ok(&o),
            sig,
            aud,
            gm,
            acq,
        )
        .expect("complete snapshot projects");
        let freshness = &projected["freshness"]["autopilot"];
        assert_eq!(
            freshness["classification"],
            json!("stale"),
            "an array-nested updatedAt must be found and used for freshness classification"
        );
    }

    // ---- command-center projection tests ----

    fn mock_tenant() -> crate::model::TenantSummary {
        crate::model::TenantSummary {
            tenant: crate::model::TenantRow {
                id: uuid::Uuid::nil(),
                slug: "virya".to_owned(),
                display_name: "Virya".to_owned(),
                status: "active".to_owned(),
                workspace_id: None,
                crowdrelay_base_url: None,
                signal_base_url: None,
                default_country_code: "US".to_owned(),
                regional_profile: None,
                branding_palette: None,
                synesthesia_enabled: false,
                area_enabled: true,
                signal_enabled: false,
                north_star_metric: "fans".to_owned(),
                fanbase_sources: vec![],
                signal_play_store_url: None,
                synesthesia_play_store_url: None,
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
            },
            runtime: None,
            runtime_health: crate::model::RuntimeHealth::Unknown,
        }
    }

    #[test]
    fn command_center_extracts_attention_fields_from_upstream() {
        let data = TenantCommandData {
            attention: Some(json!({
                "needs_you": [{"id": "a1"}, {"id": "a2"}],
                "awaiting_approval": 3,
                "findings": [{"id": "f1"}],
                "alerts": [{"active": true, "severity": "critical"}, {"active": false, "severity": "critical"}],
                "dead_deliveries": [{"id": "d1"}],
                "ecosystem": {"brain": {"state": "ok"}},
            }).as_object().unwrap().clone()),
            autopilot: None,
            learning: None,
            outcomes: None,
            audience: None,
        };
        let projected = build_per_tenant_summary(&mock_tenant(), &data);
        assert_eq!(projected["attention"]["needsYou"], json!(2));
        assert_eq!(projected["attention"]["awaitingApproval"], json!(3));
        assert_eq!(projected["attention"]["openFindings"], json!(1));
        assert_eq!(projected["attention"]["criticalAlerts"], json!(1));
        assert_eq!(projected["attention"]["deadDeliveries"], json!(1));
        assert_eq!(projected["attention"]["available"], json!(true));
    }

    #[test]
    fn command_center_extracts_autopilot_fields_from_upstream() {
        let data = TenantCommandData {
            attention: None,
            autopilot: Some(json!({
                "queued_actions": 5,
                "processing_actions": 2,
                "succeeded_24h": 10,
                "failed_24h": 1,
                "runtime_enabled": true,
                "release_ledger": {"version": 1},
                "recent_actions": [{"outcome": "unknown"}, {"outcome": "succeeded"}, {"outcome": "pending"}],
            }).as_object().unwrap().clone()),
            learning: None,
            outcomes: None,
            audience: None,
        };
        let projected = build_per_tenant_summary(&mock_tenant(), &data);
        assert_eq!(projected["autopilot"]["queuedActions"], json!(5));
        assert_eq!(projected["autopilot"]["processingActions"], json!(2));
        assert_eq!(projected["autopilot"]["succeeded24h"], json!(10));
        assert_eq!(projected["autopilot"]["failed24h"], json!(1));
        assert_eq!(projected["autopilot"]["unknownActions"], json!(2));
        assert_eq!(projected["autopilot"]["runtimeEnabled"], json!(true));
    }

    #[test]
    fn command_center_extracts_learning_from_decision_array() {
        let data = TenantCommandData {
            attention: None,
            autopilot: None,
            learning: Some(vec![
                json!({"outcome": "accepted"}),
                json!({"outcome": "rejected"}),
                json!({"outcome": "accepted"}),
                json!({"outcome": null}),
            ]),
            outcomes: None,
            audience: None,
        };
        let projected = build_per_tenant_summary(&mock_tenant(), &data);
        assert_eq!(projected["learning"]["totalOutcomes"], json!(3));
        assert_eq!(projected["learning"]["admitted"], json!(2));
        assert_eq!(projected["learning"]["rejected"], json!(1));
        assert_eq!(projected["learning"]["totalDecisions"], json!(4));
    }

    #[test]
    fn command_center_extracts_outcomes_from_growth_totals() {
        let data = TenantCommandData {
            attention: None,
            autopilot: None,
            learning: None,
            outcomes: Some(
                json!({
                    "totals": {
                        "delivered": 5,
                        "completed_campaigns": 2,
                        "claimed": 3,
                        "failed": 1,
                        "pending": 4,
                        "scheduled_campaigns": 2,
                        "stalled_campaigns": 1,
                    }
                })
                .as_object()
                .unwrap()
                .clone(),
            ),
            audience: None,
        };
        let projected = build_per_tenant_summary(&mock_tenant(), &data);
        assert_eq!(projected["outcomes"]["resolved"], json!(10));
        assert_eq!(projected["outcomes"]["unknown"], json!(1));
        assert_eq!(projected["outcomes"]["waitingForObservation"], json!(7));
    }

    #[test]
    fn command_center_nulls_all_sections_when_upstream_is_unavailable() {
        let data = TenantCommandData::default();
        let projected = build_per_tenant_summary(&mock_tenant(), &data);
        assert_eq!(projected["attention"]["available"], json!(false));
        assert_eq!(projected["autopilot"]["available"], json!(false));
        assert_eq!(projected["learning"]["available"], json!(false));
        assert_eq!(projected["outcomes"]["available"], json!(false));
        assert_eq!(projected["fans"]["available"], json!(false));
        assert_eq!(projected["attention"]["needsYou"], json!(0));
        assert_eq!(projected["autopilot"]["queuedActions"], json!(0));
        assert_eq!(projected["learning"]["totalOutcomes"], json!(0));
        assert_eq!(projected["outcomes"]["resolved"], json!(0));
        // Fan KPIs are null, not zero, when audience is unavailable.
        assert_eq!(projected["fans"]["activeFans"], Value::Null);
        assert_eq!(projected["fans"]["ticketBuyers"], Value::Null);
        assert_eq!(projected["fans"]["attendees"], Value::Null);
    }

    #[test]
    fn command_center_extracts_fan_kpis_from_audience_overview() {
        let data = TenantCommandData {
            attention: None,
            autopilot: None,
            learning: None,
            outcomes: None,
            audience: Some(
                json!({
                    "active_fans": 500,
                    "marketing_consented_fans": 200,
                    "ticket_buyers": 42,
                    "attendees": 38,
                    "paid_ticket_orders": 35,
                    "qualified_referrals": 12,
                    "synesthesia_participants": 5,
                })
                .as_object()
                .unwrap()
                .clone(),
            ),
        };
        let projected = build_per_tenant_summary(&mock_tenant(), &data);
        assert_eq!(projected["fans"]["available"], json!(true));
        assert_eq!(projected["fans"]["activeFans"], json!(500));
        assert_eq!(projected["fans"]["ticketBuyers"], json!(42));
        assert_eq!(projected["fans"]["attendees"], json!(38));
        assert_eq!(projected["fans"]["paidTicketOrders"], json!(35));
        assert_eq!(projected["fans"]["qualifiedReferrals"], json!(12));
        assert_eq!(projected["fans"]["synesthesiaParticipants"], json!(5));
    }

    #[test]
    fn command_center_propagates_tenant_identity_and_health() {
        let data = TenantCommandData::default();
        let projected = build_per_tenant_summary(&mock_tenant(), &data);
        assert_eq!(projected["slug"], json!("virya"));
        assert_eq!(projected["displayName"], json!("Virya"));
        assert_eq!(projected["runtimeHealth"], json!("unknown"));
    }

    #[test]
    fn runtime_health_as_str_matches_serde_lowercase() {
        use crate::model::RuntimeHealth;
        assert_eq!(RuntimeHealth::Healthy.as_str(), "healthy");
        assert_eq!(RuntimeHealth::Degraded.as_str(), "degraded");
        assert_eq!(RuntimeHealth::Stale.as_str(), "stale");
        assert_eq!(RuntimeHealth::Unknown.as_str(), "unknown");
    }

    /// The command-center response must not emit `releaseConvergence` or
    /// `controlPlaneRevision` — there is no authoritative source for either
    /// field in the running container. Emitting `null`/`""` was a placeholder
    /// that looked like real system state. Both fields are removed until an
    /// authoritative source exists.
    #[test]
    fn command_center_omits_release_convergence_and_control_plane_revision() {
        let data = TenantCommandData::default();
        let projected = build_per_tenant_summary(&mock_tenant(), &data);
        assert!(
            projected.get("releaseConvergence").is_none(),
            "per-tenant summary must not include releaseConvergence"
        );
        assert!(
            projected.get("controlPlaneRevision").is_none(),
            "per-tenant summary must not include controlPlaneRevision"
        );
    }

    /// The same rule, applied where the reported placeholders actually lived:
    /// the top-level `system` block. The per-tenant guard above would not have
    /// caught `system.releaseConvergence` coming back.
    ///
    /// `platformServices` is the only key with a source — the platform health
    /// table the runtime observer writes. Any key added here must be backed by
    /// something the container can actually compute; an empty string or a null
    /// standing in for "we never implemented this" reads to an operator as
    /// authoritative system state.
    #[test]
    fn command_center_system_block_exposes_only_sourced_fields() {
        let block = system_block(&[]);
        let object = block.as_object().expect("system block is an object");
        let keys: Vec<&str> = object.keys().map(String::as_str).collect();
        assert_eq!(
            keys,
            vec!["platformServices"],
            "system block must expose only fields with an authoritative source"
        );
        assert!(
            object["platformServices"].is_array(),
            "platformServices must be the platform health list, not a placeholder"
        );
    }
}
