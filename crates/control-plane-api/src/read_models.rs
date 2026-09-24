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
//! * Today/Operations -> [`today`] (`GET /tenants/{slug}/today`)
//! * Booking -> [`booking`] (`GET /tenants/{slug}/booking`)
//! * Places  -> [`places`] (`GET /tenants/{slug}/places`)
//! * Brain   -> [`brain`] (`GET /tenants/{slug}/brain`)
//! * Delivery -> [`delivery`] (`GET /tenants/{slug}/delivery`)
//! * Proof   -> [`proof`] (`GET /tenants/{slug}/proof`)
//! * Label Portfolio -> [`portfolio`] (`GET /tenants/{slug}/portfolio/model`)
//! * Audience -> [`audience`] (`GET /tenants/{slug}/audience/model`)
//! * Press   -> [`press_overview`] (`GET /tenants/{slug}/operations/press-overview`)
//! * Show    -> [`show_model`] (`GET /tenants/{slug}/shows/{event_slug}/model`)
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
/// combines the tenant slug and the model name (e.g. `"virya:today"`).
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
        .route("/tenants/{slug}/today", get(today))
        .route("/tenants/{slug}/booking", get(booking))
        .route("/tenants/{slug}/places", get(places))
        .route("/tenants/{slug}/brain", get(brain))
        .route("/tenants/{slug}/delivery", get(delivery))
        .route("/tenants/{slug}/proof", get(proof))
        .route("/tenants/{slug}/portfolio/model", get(portfolio))
        .route("/tenants/{slug}/audience/model", get(audience))
        .route(
            "/tenants/{slug}/operations/press-overview",
            get(press_overview),
        )
        .route("/tenants/{slug}/shows/{event_slug}/model", get(show_model))
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

    // Fan out per-tenant summaries, the platform-health query and the
    // notifier outbox health concurrently — they are independent, so
    // running them in parallel shortens TTI.
    let (per_tenant, platform_health, outbox_health) = tokio::join!(
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
        state.store.notification_outbox_health(),
    );

    let platform_health = platform_health?;
    let outbox_health = outbox_health?;

    let projected =
        aggregate_command_center_totals(&per_tenant, now, &platform_health, &outbox_health);
    cache_set(
        &state.read_model_cache,
        CACHE_KEY.to_owned(),
        projected.clone(),
    )
    .await;
    Ok(no_store(projected))
}

/// Cross-tenant rollup for the command center. Pure so the totals can be
/// unit-tested without standing up tenant fan-out.
///
/// Every section sum is gated on that section's own `available` flag — the
/// same contract `fans`, `momentum` and `objectives` already follow — and
/// each block reports `reportingTenants` so the operator can see how much
/// of the fleet a total actually covers. An unavailable section contributes
/// nothing: its fields project as zero locally, and counting them again
/// here would let an unreachable tenant write a confident 0 into a fleet
/// total that then reads complete.
fn aggregate_command_center_totals(
    per_tenant: &[Value],
    now: chrono::DateTime<chrono::Utc>,
    platform_health: &[crate::model::PlatformHealthRow],
    outbox_health: &crate::store::NotificationOutboxHealth,
) -> Value {
    // Aggregate global totals from per-tenant projections.
    let mut needs_you = 0u64;
    let mut awaiting_approval = 0u64;
    let mut open_findings = 0u64;
    let mut critical_alerts = 0u64;
    let mut dead_deliveries = 0u64;
    let mut unavailable_tenants = 0u64;
    let mut attention_reporting = 0u64;
    let mut queued_actions = 0u64;
    let mut processing_actions = 0u64;
    let mut succeeded_24h = 0u64;
    let mut failed_24h = 0u64;
    let mut unknown_actions = 0u64;
    let mut autopilot_reporting = 0u64;
    let mut outcomes_resolved = 0u64;
    let mut outcomes_unknown = 0u64;
    let mut outcomes_waiting = 0u64;
    let mut outcomes_reporting = 0u64;
    let mut learning_total = 0u64;
    let mut learning_admitted = 0u64;
    let mut learning_rejected = 0u64;
    let mut learning_reporting = 0u64;
    let mut brain_needs_attention = false;

    // North Star fan KPIs — null-not-zero. A missing audience endpoint
    // means "unknown", not "0 fans". We sum only tenants that reported,
    // and track how many reported so the operator can see coverage.
    let mut fans_active: Option<u64> = None;
    let mut fans_ticket_buyers: Option<u64> = None;
    let mut fans_attendees: Option<u64> = None;
    let mut fans_paid_orders: Option<u64> = None;
    let mut fans_reporting = 0u64;

    // Momentum — direction behind the magnitudes. Conversion deltas sum
    // only downstream-tier series (see the per-tenant projection for why
    // vanity never enters). Brain state counts are the honest direction
    // signal for tenants whose north star is an aggregate: the brain
    // already knows which series its north star is, so counting its
    // improving/regressing verdicts never guesses at a metric.
    let mut conversion_delta_7d: Option<i64> = None;
    let mut conversion_delta_28d: Option<i64> = None;
    let mut momentum_reporting = 0u64;
    let mut brain_improving = 0u64;
    let mut brain_regressing = 0u64;
    let mut brain_reporting = 0u64;

    // Objective pacing — "are we on track" across the fleet.
    let mut objectives_reporting = 0u64;
    let mut objectives_total = 0u64;
    let mut objectives_on_track = 0u64;
    let mut objectives_behind = 0u64;
    let mut objectives_missed = 0u64;
    let mut objectives_met = 0u64;

    let mut total = 0u64;
    let mut active = 0u64;
    let mut healthy = 0u64;
    let mut degraded = 0u64;
    let mut stale = 0u64;
    let mut unknown = 0u64;

    for t in per_tenant {
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
        if t["attention"]["available"].as_bool() == Some(true) {
            attention_reporting += 1;
            needs_you += t["attention"]["needsYou"].as_u64().unwrap_or(0);
            awaiting_approval += t["attention"]["awaitingApproval"].as_u64().unwrap_or(0);
            open_findings += t["attention"]["openFindings"].as_u64().unwrap_or(0);
            critical_alerts += t["attention"]["criticalAlerts"].as_u64().unwrap_or(0);
            dead_deliveries += t["attention"]["deadDeliveries"].as_u64().unwrap_or(0);
        } else {
            unavailable_tenants += 1;
        }
        if t["autopilot"]["available"].as_bool() == Some(true) {
            autopilot_reporting += 1;
            queued_actions += t["autopilot"]["queuedActions"].as_u64().unwrap_or(0);
            processing_actions += t["autopilot"]["processingActions"].as_u64().unwrap_or(0);
            succeeded_24h += t["autopilot"]["succeeded24h"].as_u64().unwrap_or(0);
            failed_24h += t["autopilot"]["failed24h"].as_u64().unwrap_or(0);
            unknown_actions += t["autopilot"]["unknownActions"].as_u64().unwrap_or(0);
        }
        if t["outcomes"]["available"].as_bool() == Some(true) {
            outcomes_reporting += 1;
            outcomes_resolved += t["outcomes"]["resolved"].as_u64().unwrap_or(0);
            outcomes_unknown += t["outcomes"]["unknown"].as_u64().unwrap_or(0);
            outcomes_waiting += t["outcomes"]["waitingForObservation"].as_u64().unwrap_or(0);
        }
        if t["learning"]["available"].as_bool() == Some(true) {
            learning_reporting += 1;
            learning_total += t["learning"]["totalOutcomes"].as_u64().unwrap_or(0);
            learning_admitted += t["learning"]["admitted"].as_u64().unwrap_or(0);
            learning_rejected += t["learning"]["rejected"].as_u64().unwrap_or(0);
        }
        // The passthrough object keeps the tenant's snake_case keys —
        // `needsAttention` here read a field that does not exist, so a
        // regressing or stagnant brain never raised the flag.
        if t["brain"]["needs_attention"].as_bool() == Some(true) {
            brain_needs_attention = true;
        }
        if let Some(state) = t["brain"]["state"].as_str() {
            brain_reporting += 1;
            match state {
                "improving" => brain_improving += 1,
                "regressing" => brain_regressing += 1,
                _ => {}
            }
        }
        if t["momentum"]["available"].as_bool() == Some(true) {
            momentum_reporting += 1;
            if let Some(d) = t["momentum"]["conversionDelta7d"].as_i64() {
                conversion_delta_7d = Some(conversion_delta_7d.unwrap_or(0) + d);
            }
            if let Some(d) = t["momentum"]["conversionDelta28d"].as_i64() {
                conversion_delta_28d = Some(conversion_delta_28d.unwrap_or(0) + d);
            }
        }
        if t["objectives"]["available"].as_bool() == Some(true) {
            objectives_reporting += 1;
            objectives_total += t["objectives"]["total"].as_u64().unwrap_or(0);
            objectives_on_track += t["objectives"]["onTrack"].as_u64().unwrap_or(0);
            objectives_behind += t["objectives"]["behind"].as_u64().unwrap_or(0);
            objectives_missed += t["objectives"]["missed"].as_u64().unwrap_or(0);
            objectives_met += t["objectives"]["met"].as_u64().unwrap_or(0);
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
            "reportingTenants": attention_reporting,
            "needsYou": needs_you,
            "awaitingApproval": awaiting_approval,
            "openFindings": open_findings,
            "criticalAlerts": critical_alerts,
            "deadDeliveries": dead_deliveries,
            "unavailableTenants": unavailable_tenants,
        },
        "autopilot": {
            "reportingTenants": autopilot_reporting,
            "queuedActions": queued_actions,
            "processingActions": processing_actions,
            "succeeded24h": succeeded_24h,
            "failed24h": failed_24h,
            "unknownActions": unknown_actions,
        },
        "outcomes": {
            "reportingTenants": outcomes_reporting,
            "resolved": outcomes_resolved,
            "unknown": outcomes_unknown,
            "waitingForObservation": outcomes_waiting,
        },
        "system": system_block(platform_health, outbox_health),
        "learning": {
            "reportingTenants": learning_reporting,
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
        "momentum": {
            "reportingTenants": momentum_reporting,
            "conversionDelta7d": conversion_delta_7d,
            "conversionDelta28d": conversion_delta_28d,
            "northStarImproving": brain_improving,
            "northStarRegressing": brain_regressing,
            "northStarReporting": brain_reporting,
        },
        "objectives": {
            "reportingTenants": objectives_reporting,
            "total": objectives_total,
            "met": objectives_met,
            "onTrack": objectives_on_track,
            "behind": objectives_behind,
            "missed": objectives_missed,
        },
        "perTenant": per_tenant,
    });
    projected
}

/// The command center's `system` block.
///
/// Every key here must have an authoritative source in the running container.
/// This block previously also carried `releaseConvergence: null` and
/// `controlPlaneRevision: ""` — nothing computed either, so an operator read a
/// permanently empty field as if it were system state. The block is a named
/// function so that contract is testable and a future addition has to justify
/// itself against a test rather than being appended to an inline literal.
fn system_block(
    platform_health: &[crate::model::PlatformHealthRow],
    outbox_health: &crate::store::NotificationOutboxHealth,
) -> Value {
    json!({
        "platformServices": platform_health,
        // The control plane's own outbox — the one notifier channel that
        // cannot report its own failure. Tenant-side dead deliveries are
        // already aggregated under `attention.deadDeliveries`; these counts
        // are the fleet's own dispatch loop.
        "notificationOutbox": {
            "dead7d": outbox_health.dead_7d,
            "overduePending": outbox_health.overdue_pending,
        },
    })
}

/// Fetch one tenant's command-center sections: attention, autopilot, learning,
/// outcomes, audience and metric trends, each with its own degradation state.
/// A single slow or dead tenant never blocks the global response.
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

    let (attention, autopilot, learning, outcomes, audience, trends, objectives) = tokio::join!(
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
        // North Star direction: per-platform metric trend deltas. The
        // audience overview is point-in-time counts, so this is the only
        // numeric "which way is it moving" the command center can show.
        tokio::time::timeout(
            per_section_timeout,
            section("/v1/control-plane/autopilot/growth-metrics/trends")
        ),
        // North Star pacing: declared objectives with their derived state
        // (met/on_track/behind/missed) — "are we on track", not just
        // "which way did we move".
        tokio::time::timeout(
            per_section_timeout,
            section("/v1/control-plane/autopilot/objectives")
        ),
    );

    let attention = attention.map_err(|_| ApiError::Timeout).and_then(|r| r);
    let autopilot = autopilot.map_err(|_| ApiError::Timeout).and_then(|r| r);
    let learning = learning.map_err(|_| ApiError::Timeout).and_then(|r| r);
    let outcomes = outcomes.map_err(|_| ApiError::Timeout).and_then(|r| r);
    let audience = audience.map_err(|_| ApiError::Timeout).and_then(|r| r);
    let trends = trends.map_err(|_| ApiError::Timeout).and_then(|r| r);
    let objectives = objectives.map_err(|_| ApiError::Timeout).and_then(|r| r);

    // A tenant that answered none of its seven sections is the shape the
    // operator reads as "no fans", so say why once, with the first reason.
    // Per-section noise is not wanted — one failed section among seven is
    // normal and the model already names it.
    if let (Err(first), Err(_), Err(_), Err(_), Err(_), Err(_), Err(_)) = (
        &attention,
        &autopilot,
        &learning,
        &outcomes,
        &audience,
        &trends,
        &objectives,
    ) {
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
        trends: trends
            .as_ref()
            .ok()
            .and_then(|v| v.get("series"))
            .and_then(|v| v.as_array())
            .cloned(),
        objectives: objectives
            .as_ref()
            .ok()
            .and_then(|v| v.get("objectives"))
            .and_then(|v| v.as_array())
            .cloned(),
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
        || data.audience.is_some()
        || data.trends.is_some()
        || data.objectives.is_some();

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
        // Drafted posts waiting for a person to publish them — the one queue
        // blocked on the operator. The upstream attention model already
        // carries the per-channel array; projecting it here saves the
        // overview page a second per-tenant fetch. Absent field (an older
        // CrowdRelay) stays null — "does not report" is not "zero drafts".
        "unpublishedDrafts": att.and_then(|a| a.get("unpublished_drafts")).and_then(|v| v.as_array()).map(|channels| {
            channels.iter().map(|c| c.get("drafts").and_then(|d| d.as_u64()).unwrap_or(0)).sum::<u64>()
        }),
        "unpublishedDraftChannels": att.and_then(|a| a.get("unpublished_drafts")).cloned().unwrap_or(Value::Null),
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
    // The tenant's self-assessment lives at the top level of the attention
    // snapshot (`state`, `needs_attention`, `days_observed`, `quiet_cycles`,
    // `latest_wait_reason`). It used to be read out of `ecosystem`, which
    // never contained it — every command-center brain counter silently read
    // Null while the tenant was reporting. Pass the object through wholesale:
    // new fields the tenant adds (the wait reason being the current one)
    // must reach the console without a matching edit here.
    let brain = att
        .and_then(|a| a.get("brain"))
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

    // ── momentum ──
    // Direction behind the magnitudes. `brain` already carries the upstream
    // verdict on the 60-day north-star series; this block adds the numbers,
    // and only where the vocabulary makes a number honest:
    //
    // * A platform-scoped north star ("spotify_followers") matches the
    //   series "{platform}_{metric_key}" — the same composite the wizard
    //   writes. First-party north stars (total_audience, signal_installs,
    //   activated_fans_30d) match nothing and stay null: no sum of platform
    //   counts is
    //   attempted here, because the platform → audience-metric vocabulary
    //   lives in crowdrelay-domain, and guessing at it is how community
    //   sizes got summed as fans once already.
    // * conversionDelta* sums non-stale downstream-tier series only —
    //   tickets, orders, attendance: counts of things that converted, so
    //   a sum of deltas stays a count of conversions. Vanity-tier
    //   community sizes never enter it.
    // * A stale series counts toward coverage, never toward a delta.
    let trends = data.trends.as_deref();
    let north_star_metric = tenant.tenant.north_star_metric.as_str();
    let north_star_series = trends.and_then(|list| {
        list.iter().find(|s| {
            let composite = format!(
                "{}_{}",
                s.get("platform")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default(),
                s.get("metric_key")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default(),
            );
            composite == north_star_metric
        })
    });
    let mut conversion_delta_7d: Option<i64> = None;
    let mut conversion_delta_28d: Option<i64> = None;
    let mut stale_series = 0u64;
    if let Some(list) = trends {
        for s in list {
            if s.get("stale").and_then(|v| v.as_bool()) == Some(true) {
                stale_series += 1;
                continue;
            }
            if s.get("value_tier").and_then(|v| v.as_str()) == Some("downstream") {
                if let Some(d) = s.get("delta_7d").and_then(|v| v.as_i64()) {
                    conversion_delta_7d = Some(conversion_delta_7d.unwrap_or(0) + d);
                }
                if let Some(d) = s.get("delta_28d").and_then(|v| v.as_i64()) {
                    conversion_delta_28d = Some(conversion_delta_28d.unwrap_or(0) + d);
                }
            }
        }
    }
    let momentum = json!({
        "available": trends.is_some(),
        "seriesCount": trends.map(|list| list.len() as u64),
        "staleSeriesCount": trends.map(|_| stale_series),
        "northStarLatest": north_star_series.and_then(|s| s.get("latest_value")).and_then(|v| v.as_i64()),
        "northStarDelta7d": north_star_series.and_then(|s| s.get("delta_7d")).and_then(|v| v.as_i64()),
        "northStarDelta28d": north_star_series.and_then(|s| s.get("delta_28d")).and_then(|v| v.as_i64()),
        "northStarStale": north_star_series.and_then(|s| s.get("stale")).and_then(|v| v.as_bool()),
        "northStarDisplayName": north_star_series.and_then(|s| s.get("display_name")).cloned().unwrap_or(Value::Null),
        "conversionDelta7d": conversion_delta_7d,
        "conversionDelta28d": conversion_delta_28d,
    });

    // ── objectives ──
    // Pacing against declared targets. `state` is a tagged union
    // ({"state": "behind", ...}) derived upstream — counting the tags here
    // keeps the dashboard's "are we on track" the same answer the
    // objectives endpoint itself gives.
    let objectives_raw = data.objectives.as_deref();
    let count_state = |name: &str| -> u64 {
        objectives_raw
            .map(|list| {
                list.iter()
                    .filter(|o| {
                        o.get("state")
                            .and_then(|s| s.get("state"))
                            .and_then(|v| v.as_str())
                            == Some(name)
                    })
                    .count() as u64
            })
            .unwrap_or(0)
    };
    // The pacing detail: the objectives actually in trouble, soonest
    // deadline first, so the card can name what is behind rather than
    // only count it.
    let behind_list: Vec<Value> = objectives_raw
        .map(|list| {
            let mut at_risk: Vec<&Value> = list
                .iter()
                .filter(|o| {
                    matches!(
                        o.get("state")
                            .and_then(|s| s.get("state"))
                            .and_then(|v| v.as_str()),
                        Some("behind") | Some("missed")
                    )
                })
                .collect();
            at_risk.sort_by_key(|o| o.get("deadline").and_then(|v| v.as_str()).unwrap_or(""));
            at_risk
                .into_iter()
                .take(3)
                .map(|o| {
                    json!({
                        "platform": o.get("platform"),
                        "metricKey": o.get("metric_key"),
                        "observedValue": o.get("observed_value"),
                        "targetValue": o.get("target_value"),
                        "deadline": o.get("deadline"),
                        "state": o.get("state").and_then(|s| s.get("state")),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let objectives = json!({
        "available": objectives_raw.is_some(),
        "total": objectives_raw.map(|list| list.len() as u64),
        "met": count_state("met"),
        "onTrack": count_state("on_track"),
        "behind": count_state("behind"),
        "missed": count_state("missed"),
        "unmeasurable": count_state("unmeasurable"),
        "atRisk": behind_list,
    });

    json!({
        "slug": slug,
        "displayName": display_name,
        "runtimeHealth": runtime_health,
        "available": available,
        // Control-plane-side config the upstream sections cannot see: with
        // no enabled notifier channel every event fans out to zero rows and
        // approvals wait with nobody told. Local fact, never null.
        "enabledNotifierChannels": tenant.enabled_notifier_channels,
        "attention": attention,
        "autopilot": autopilot,
        "learning": learning,
        "outcomes": outcomes,
        "brain": brain,
        "fans": fans,
        "momentum": momentum,
        "objectives": objectives,
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
    trends: Option<Vec<Value>>,
    objectives: Option<Vec<Value>>,
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
            // Lifecycle policy is decided here, from the same columns the
            // store guards read, so the browser renders capability instead of
            // re-deriving the rule from a slug it happens to recognise.
            "capabilities": {
                "canSuspend": tenant.tenant.can_suspend,
                "canProvision": tenant.tenant.can_provision,
                "canRemove": tenant.tenant.can_remove,
                "canOptOut": tenant.tenant.can_remove,
                "canPark": tenant.tenant.can_suspend && tenant.tenant.status == "active",
                "canUnpark": tenant.tenant.can_suspend && tenant.tenant.status == "parked",
                // Only tenants the agent does not provision may trigger a
                // redeploy from the panel — virya's ecosystem deploy is the
                // example. Provisioner-managed tenants get no operator-facing
                // deploy button: the provisioner path is internal, used at
                // tenant creation, not a runtime control.
                "canRedeploy": !tenant.tenant.can_provision,
            },
        },
    });
    cache_set(&state.read_model_cache, cache_key, projected.clone()).await;
    Ok(no_store(projected))
}

/// Operations/Autopilot subpage.
///
/// The twelve upstream sections are fetched concurrently over the private
/// tunnel and projected field by field. A section that fails is reported as
/// `null` and named in `degraded`, so a broken Autopilot read cannot blank the
/// queue metrics next to it. Only a snapshot where every section failed is an
/// error. `next_show_timeline` is the one dependent fetch: it waits on `shows`
/// for the nearest upcoming event's slug, so it only exists when the night
/// does. One browser call, one cached snapshot — the Today page.
async fn today(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let cache_key = format!("{slug}:today");
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
        acquisition_sources,
        reply_triage,
        shows,
        attention,
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
        section("/v1/control-plane/audience/acquisition-sources"),
        // The default tab's queue — the replies waiting on a person.
        section("/v1/control-plane/autopilot/reply-triage"),
        // "The next night" block — the show list, then the nearest night's
        // own timeline fetched below once its slug is known.
        section("/v1/control-plane/events"),
        // The needs-you snapshot — the human gate the page's own strip
        // renders. Re-projected below through the same contract the
        // dedicated endpoint uses so `not_reported` means the same thing in
        // both places.
        section("/v1/control-plane/ops/attention"),
    );

    // The attention snapshot enters this model through the dedicated
    // endpoint's own projection: the defaults it substitutes stay named in
    // `not_reported`, and a snapshot missing a required section degrades the
    // section here exactly as it fails the endpoint there.
    let attention = match attention {
        Ok(v) => crate::attention_routes::project(&slug, &v).map_err(|e| {
            // The tunnel answered — the contract rejected what it said, which
            // is a shape problem, not a reachability problem. The project's
            // own `Unavailable` would misreport this as "tenant unreachable".
            tracing::warn!(slug = %slug, error = %e, "attention snapshot failed projection");
            ApiError::ContractMismatch("attention snapshot failed the attention contract")
        }),
        Err(e) => Err(e),
    };

    // The dependent hop: the nearest upcoming show's timeline can only be
    // fetched once `shows` names it. No upcoming night means no section at
    // all — absent is a fact, not a degradation.
    let next_show_timeline = match next_upcoming_show_slug(shows.as_ref().ok()) {
        Some(event_slug) => Some(
            state
                .area_client
                .request_management(
                    tenant.tenant.id,
                    &target,
                    ManagementRequest {
                        method: "GET",
                        path: &format!("/v1/control-plane/events/{event_slug}/timeline"),
                        body: None,
                        correlation_id: correlation(&headers),
                        idempotency_key: None,
                    },
                )
                .await,
        ),
        None => None,
    };

    let projected = project_today(
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
        acquisition_sources.as_ref(),
        reply_triage.as_ref(),
        shows.as_ref(),
        attention.as_ref(),
        next_show_timeline.as_ref().map(Result::as_ref),
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
/// The three upstream sections (roster KPIs, consent edges and fan sources)
/// are fetched concurrently over the private tunnel and projected like
/// [`project_today`]. A section that fails is reported as `null` and named
/// in `degraded`. Only a snapshot where every section failed is an error.
/// The settings section this model used to carry moved to the Workspace
/// tab's own lean GET (`/tenants/{slug}/settings`).
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

    let (overview, amplification, fanbases) = tokio::join!(
        section("/v1/control-plane/portfolio/overview"),
        section("/v1/control-plane/portfolio/amplification"),
        section("/v1/control-plane/fanbases"),
    );

    let projected = project_portfolio(
        &slug,
        state.runtime_stale_after_seconds,
        overview.as_ref(),
        amplification.as_ref(),
        fanbases.as_ref(),
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
) -> Result<Value, ApiError> {
    project_sections(
        slug,
        runtime_stale_after_seconds,
        "portfolio",
        &[
            section("overview", overview, Shape::Object),
            section("amplification", amplification, Shape::Object),
            section("fanbases", fanbases, Shape::Object),
        ],
    )
}

/// Audience Intelligence subpage.
///
/// The three upstream sections (overview KPIs, paginated fan list, segments)
/// are fetched concurrently over the private tunnel and projected like the
/// today read model. A section that fails is reported as `null` and named
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
        // Upstream caps list responses at MAX_LIST_LIMIT (100). A tenant with
        // more fans than that gets the first hundred only — the panel labels
        // the list as capped when it returns full, rather than looking
        // complete when it is not.
        section("/v1/control-plane/audience/fans?limit=100"),
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

/// A value the handler interpolates into an upstream path segment. The
/// allowlist is the tunnel's own `safe_segment_between` one — `[a-z0-9_-]`,
/// the shape `events.slug` carries — so a slug the upstream could never
/// route is refused here instead of travelling to the tenant and back.
fn path_segment(value: &str) -> Result<&str, ApiError> {
    let ok = !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'-' | b'_'));
    if ok {
        Ok(value)
    } else {
        Err(ApiError::InvalidInput("invalid path segment".to_owned()))
    }
}

/// Booking pipeline subpage — the "get the next night" journey.
///
/// Eight upstream sections fan out concurrently over the private tunnel and
/// project in pipeline order: what the scout found (`shortlist`), what a
/// person still has to confirm (`booking_candidates`, `outreach_candidates`,
/// `gig_plan` proposals, parked negotiation moves, `reply_triage`), who has
/// been approached (`agents`, gig-plan letters), which terms conversations
/// are live (`negotiations`), and which nights are already on the books
/// (`shows`). A section that fails is `null` plus a named entry in
/// `degraded`; only a snapshot where every section failed is an error. One
/// browser call, one cached snapshot — the Shows page's Get booked tab.
///
/// No second wave: every stage is addressable without an id, so unlike
/// [`today`] there is no dependent fetch.
async fn booking(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let cache_key = format!("{slug}:booking");
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

    let (
        gig_plan,
        shortlist,
        booking_candidates,
        outreach_candidates,
        agents,
        reply_triage,
        negotiations,
        shows,
    ) = tokio::join!(
        fetch("/v1/control-plane/gig-plan"),
        fetch("/v1/control-plane/autopilot/opportunity-shortlist"),
        // Admitted-only: the unfiltered list caps at 50 rows across every
        // status, so the rows the gate needs could page themselves out.
        fetch("/v1/control-plane/autopilot/booking-discovery/candidates?status=admitted&limit=100"),
        fetch("/v1/control-plane/autopilot/outreach/candidates?status=admitted&limit=100"),
        fetch("/v1/control-plane/booking-agents"),
        fetch("/v1/control-plane/autopilot/reply-triage"),
        fetch("/v1/control-plane/autopilot/negotiations"),
        fetch("/v1/control-plane/events"),
    );

    let projected = project_sections(
        &slug,
        state.runtime_stale_after_seconds,
        "booking",
        &[
            section("gig_plan", gig_plan.as_ref(), Shape::Object),
            section("shortlist", shortlist.as_ref(), Shape::Object),
            section(
                "booking_candidates",
                booking_candidates.as_ref(),
                Shape::Array,
            ),
            section(
                "outreach_candidates",
                outreach_candidates.as_ref(),
                Shape::Array,
            ),
            section("agents", agents.as_ref(), Shape::Object),
            section("reply_triage", reply_triage.as_ref(), Shape::Object),
            section("negotiations", negotiations.as_ref(), Shape::Object),
            section("shows", shows.as_ref(), Shape::Object),
        ],
    )?;
    cache_set(&state.read_model_cache, cache_key, projected.clone()).await;
    Ok(no_store(projected))
}

/// Places — where the fans already are, and what is worth booking there.
///
/// Five upstream sections fetched concurrently over the private tunnel and
/// projected field by field. The funnel answers "which city next" in the
/// organise ranking; the rooms and the audience-graph registry say what is
/// on the ground near those fans; the gig plan's city facet lets the page
/// mark which funnel rows the planner already wants; and the AREA cities
/// name where a drop could run. `area_cities` rides the AREA client, not
/// management — it is a different upstream surface with its own token, and
/// a tenant whose AREA side cannot answer still gets the four sections it
/// can. Per-city detail stays lazy on the existing
/// `/tenants/{slug}/cities/{city}` routes.
async fn places(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let cache_key = format!("{slug}:places");
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
    let correlation_id = correlation(&headers);
    let tenant_id = tenant.tenant.id;
    let area_fetch = async {
        state
            .area_client
            .request(
                tenant_id,
                &target,
                "GET",
                "/v1/control-plane/area/cities?limit=100",
                None,
                correlation_id,
                None,
            )
            .await
    };

    let (city_funnel, city_venues, places_registry, gig_plan, area_cities) = tokio::join!(
        // Ranked: the funnel's default ordering is by activity; the plan's
        // question is "which city next", which is the organise score.
        fetch("/v1/control-plane/audience/city-funnel?order=organise"),
        fetch("/v1/control-plane/audience/city-venues"),
        fetch("/v1/control-plane/audience-graph/places?limit=100"),
        fetch("/v1/control-plane/gig-plan"),
        area_fetch,
    );

    let projected = project_sections(
        &slug,
        state.runtime_stale_after_seconds,
        "places",
        &places_sections(
            city_funnel.as_ref(),
            city_venues.as_ref(),
            places_registry.as_ref(),
            gig_plan.as_ref(),
            area_cities.as_ref(),
        ),
    )?;
    cache_set(&state.read_model_cache, cache_key, projected.clone()).await;
    Ok(no_store(projected))
}

/// The section table the places handler projects. Kept as a named function
/// so the wiring — which upstream answers which name under which shape — is
/// what the tests assert, not a copy of it.
fn places_sections<'a>(
    city_funnel: SectionResult<'a>,
    city_venues: SectionResult<'a>,
    audience_places: SectionResult<'a>,
    gig_plan: SectionResult<'a>,
    area_cities: SectionResult<'a>,
) -> [Section<'a>; 5] {
    [
        section("city_funnel", city_funnel, Shape::Array),
        section("city_venues", city_venues, Shape::Array),
        section("audience_places", audience_places, Shape::Object),
        section("gig_plan", gig_plan, Shape::Object),
        section("area_cities", area_cities, Shape::Object),
    ]
}

/// Brain — the autopilot's evidence in one call.
///
/// The brief stays its own endpoint (`operations/intelligence`) — it is the
/// page's story and keeps its own poll cadence and mutations. This model is
/// the evidence the tabs render underneath it: the posture facts the header
/// badges need, the scorecard, the two learning surfaces, the measurement
/// ledger, and the attention snapshot whose refused-outcome list the
/// learning tab renders as "the gate said no". Six sections fetched
/// concurrently; each failure degrades its own section. `attention` enters
/// through the dedicated projection so `not_reported` keeps its meaning —
/// a tenant that does not publish refused outcomes is not a tenant whose
/// gate refused nothing.
async fn brain(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let cache_key = format!("{slug}:brain");
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
    let (autopilot, scorecard, learning, learning_proof, measurement, attention) = tokio::join!(
        fetch("/v1/control-plane/autopilot/overview"),
        fetch("/v1/control-plane/autopilot/scorecard"),
        fetch("/v1/control-plane/autopilot/learning-loop"),
        fetch("/v1/control-plane/autopilot/learning-proof"),
        fetch("/v1/control-plane/autopilot/measurement"),
        fetch("/v1/control-plane/ops/attention"),
    );

    let attention = match attention {
        Ok(v) => crate::attention_routes::project(&slug, &v).map_err(|e| {
            tracing::warn!(slug = %slug, error = %e, "attention snapshot failed projection");
            ApiError::ContractMismatch("attention snapshot failed the attention contract")
        }),
        Err(e) => Err(e),
    };

    let projected = project_sections(
        &slug,
        state.runtime_stale_after_seconds,
        "brain",
        &brain_sections(
            autopilot.as_ref(),
            scorecard.as_ref(),
            learning.as_ref(),
            learning_proof.as_ref(),
            measurement.as_ref(),
            attention.as_ref(),
        ),
    )?;
    cache_set(&state.read_model_cache, cache_key, projected.clone()).await;
    Ok(no_store(projected))
}

/// The section table the brain handler projects — named so the tests assert
/// the real wiring rather than a copy of it.
fn brain_sections<'a>(
    autopilot: SectionResult<'a>,
    scorecard: SectionResult<'a>,
    learning: SectionResult<'a>,
    learning_proof: SectionResult<'a>,
    measurement: SectionResult<'a>,
    attention: SectionResult<'a>,
) -> [Section<'a>; 6] {
    [
        section("autopilot", autopilot, Shape::Object),
        section("scorecard", scorecard, Shape::Object),
        section("learning", learning, Shape::Array),
        section("learning_proof", learning_proof, Shape::Object),
        section("measurement", measurement, Shape::Object),
        section("attention", attention, Shape::Object),
    ]
}

/// Delivery — the operator's answer to "what is stuck, and why".
///
/// One read across the pipe: the queue depths the summary reports, the
/// live outbox and delivery rows still in flight, the attention snapshot's
/// dead lists and unpublished drafts (the rows that will not move on their
/// own), and the recent delivery-results ledger that says what landed.
/// Five sections concurrently; the Health page's delivery tab renders it
/// as a journey and keeps retry on the dead rows it points at.
async fn delivery(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let cache_key = format!("{slug}:delivery");
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
    let (summary, outbox, deliveries, attention, delivery_results) = tokio::join!(
        fetch("/v1/control-plane/ops/summary"),
        // The live window — 100 rows covers "in flight"; the dead rows the
        // operator acts on arrive through the attention snapshot below.
        fetch("/v1/control-plane/ops/outbox?limit=100"),
        fetch("/v1/control-plane/ops/deliveries?limit=100"),
        fetch("/v1/control-plane/ops/attention"),
        fetch("/v1/control-plane/ops/delivery-results?limit=100"),
    );

    let attention = match attention {
        Ok(v) => crate::attention_routes::project(&slug, &v).map_err(|e| {
            tracing::warn!(slug = %slug, error = %e, "attention snapshot failed projection");
            ApiError::ContractMismatch("attention snapshot failed the attention contract")
        }),
        Err(e) => Err(e),
    };
    // Upstream answers `{"results": [...]}` — the section contract is the
    // bare ledger rows the page renders, so a payload that lost the field
    // degrades this section rather than arriving as an empty ledger.
    let delivery_results = delivery_results.and_then(|value| {
        value
            .get("results")
            .cloned()
            .filter(Value::is_array)
            .ok_or_else(|| {
                tracing::warn!(slug = %slug, "delivery-results answered without results[]");
                ApiError::ContractMismatch("delivery-results answered without results[]")
            })
    });

    let projected = project_sections(
        &slug,
        state.runtime_stale_after_seconds,
        "delivery",
        &delivery_sections(
            summary.as_ref(),
            outbox.as_ref(),
            deliveries.as_ref(),
            attention.as_ref(),
            delivery_results.as_ref(),
        ),
    )?;
    cache_set(&state.read_model_cache, cache_key, projected.clone()).await;
    Ok(no_store(projected))
}

/// The section table the delivery handler projects.
fn delivery_sections<'a>(
    summary: SectionResult<'a>,
    outbox: SectionResult<'a>,
    deliveries: SectionResult<'a>,
    attention: SectionResult<'a>,
    delivery_results: SectionResult<'a>,
) -> [Section<'a>; 5] {
    [
        section("summary", summary, Shape::Object),
        section("outbox", outbox, Shape::Array),
        section("deliveries", deliveries, Shape::Array),
        section("attention", attention, Shape::Object),
        section("delivery_results", delivery_results, Shape::Array),
    ]
}

/// Proof — the "send this to a promoter" drawer in one call: the band's
/// listing and its share token, the issued attestation cards, the
/// representation contacts an agent or label may approach, and the show
/// list the page reads issued reports from. Organiser links stay per-night
/// — upstream has no nights list and a per-show fan-out is exactly the
/// unbounded join this module exists to avoid. Four sections concurrently;
/// each failure degrades its own section, never the page.
async fn proof(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let cache_key = format!("{slug}:proof");
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
    let (listing, attestations, representation, shows) = tokio::join!(
        fetch("/v1/control-plane/listing"),
        fetch("/v1/control-plane/attestations"),
        fetch("/v1/control-plane/representation/targets"),
        fetch("/v1/control-plane/events"),
    );

    let projected = project_sections(
        &slug,
        state.runtime_stale_after_seconds,
        "proof",
        &proof_sections(
            listing.as_ref(),
            attestations.as_ref(),
            representation.as_ref(),
            shows.as_ref(),
        ),
    )?;
    cache_set(&state.read_model_cache, cache_key, projected.clone()).await;
    Ok(no_store(projected))
}

/// The section table the proof handler projects.
fn proof_sections<'a>(
    listing: SectionResult<'a>,
    attestations: SectionResult<'a>,
    representation: SectionResult<'a>,
    shows: SectionResult<'a>,
) -> [Section<'a>; 4] {
    [
        section("listing", listing, Shape::Object),
        section("attestations", attestations, Shape::Array),
        section("representation", representation, Shape::Object),
        section("shows", shows, Shape::Object),
    ]
}

/// Show subpage — one night, T-21→T+7.
///
/// The page's whole read side in one call. The timeline is the spine: the
/// page cannot render without an event to name, so a dead or malformed
/// timeline fails the request the way the standalone route's error did.
/// Every panel's read is an independently degraded section — `helpers`,
/// `growth_ladder`, `economics`, `tour_economics` and `shared_night` each
/// come back `null` and named in `degraded` when the tenant could not
/// answer, and a page whose spine answered still renders even when every
/// panel is down.
///
/// Two waves keep it one upstream round trip deep: helpers and the
/// economics sections answer concurrently with the timeline; the growth
/// ladder and the shared night can only be asked once the timeline names
/// the event's id and any shared-night link. `shared_night` only exists as
/// a section when the venue registry linked one — an unlinked show is
/// absent, not degraded. One browser call, one cached snapshot.
async fn show_model(
    State(state): State<AppState>,
    Path((raw_slug, raw_event_slug)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let event_slug = path_segment(&raw_event_slug)?;
    let cache_key = format!("{slug}:show:{event_slug}");
    if let Some(cached) = cache_get(&state.read_model_cache, &cache_key).await {
        return Ok(no_store(cached));
    }
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let correlation_id = correlation(&headers);
    let get = |path: String| {
        let state = &state;
        let target = &target;
        let tenant_id = tenant.tenant.id;
        async move {
            state
                .area_client
                .request_management(
                    tenant_id,
                    target,
                    ManagementRequest {
                        method: "GET",
                        path: &path,
                        body: None,
                        correlation_id,
                        idempotency_key: None,
                    },
                )
                .await
        }
    };

    // Wave 1 — everything answerable from the path alone.
    let (timeline, helpers, economics, tour_economics) = tokio::join!(
        get(format!("/v1/control-plane/events/{event_slug}/timeline")),
        get(format!(
            "/v1/control-plane/events/{event_slug}/who-can-help"
        )),
        get("/v1/control-plane/autopilot/show-economics".to_owned()),
        get("/v1/control-plane/autopilot/tour-economics".to_owned()),
    );

    let timeline = timeline?;
    let (event_id, night_target) = show_fan_out_targets(&timeline)?;

    // Wave 2 — the reads only the timeline can address.
    let (growth_ladder, shared_night) = tokio::join!(
        get(format!(
            "/v1/control-plane/autopilot/events/{event_id}/growth-ladder"
        )),
        async {
            match night_target {
                NightTarget::Linked(id) => {
                    Some(get(format!("/v1/control-plane/nights/{id}")).await)
                }
                NightTarget::Malformed => Some(Err(ApiError::ContractMismatch(
                    "the timeline's shared-night link is not a uuid",
                ))),
                NightTarget::Unlinked => None,
            }
        },
    );

    let projected = project_show(
        &slug,
        state.runtime_stale_after_seconds,
        &timeline,
        helpers.as_ref(),
        growth_ladder.as_ref(),
        economics.as_ref(),
        tour_economics.as_ref(),
        shared_night.as_ref().map(Result::as_ref),
    )?;
    cache_set(&state.read_model_cache, cache_key, projected.clone()).await;
    Ok(no_store(projected))
}

/// What wave 2 of the show fan-out can do with the timeline's
/// shared-night link. Unlinked is a fact — no section at all; a link that
/// is present but unusable is drift — the section degrades as a contract
/// mismatch rather than smuggling a bad segment upstream or pretending the
/// night does not exist.
#[derive(Debug, PartialEq)]
enum NightTarget<'a> {
    Unlinked,
    Linked(&'a str),
    Malformed,
}

/// What wave 2 of the show fan-out needs from the timeline: the event id
/// the growth ladder hangs off, and the venue-registry link the shared
/// night hangs off when one was resolved. Both are interpolated into
/// upstream paths, so they carry the same uuid shape the standalone routes
/// require. An unusable event id is spine drift — the page cannot name its
/// show — so it fails the model; an absent link is a fact.
fn show_fan_out_targets(timeline: &Value) -> Result<(&str, NightTarget<'_>), ApiError> {
    let event_id = timeline
        .get("event")
        .and_then(|event| event.get("id"))
        .and_then(Value::as_str)
        .filter(|id| uuid::Uuid::parse_str(id).is_ok());
    let Some(event_id) = event_id else {
        return Err(ApiError::ContractMismatch(
            "show timeline answered without event.id",
        ));
    };
    let night = match timeline
        .get("event")
        .and_then(|event| event.get("place_event_id"))
    {
        None | Some(Value::Null) => NightTarget::Unlinked,
        Some(Value::String(id)) if id.is_empty() => NightTarget::Unlinked,
        Some(Value::String(id)) if uuid::Uuid::parse_str(id).is_ok() => NightTarget::Linked(id),
        Some(_) => NightTarget::Malformed,
    };
    Ok((event_id, night))
}

/// Project the show page's sections. The timeline reaches this projection
/// only `Ok` — its failure ended the request before this ran — so the
/// all-failed rule inside [`project_sections`] can never fire on a page that
/// still has its show: a night with every panel down renders plus named
/// gaps instead of an error card that throws the spine away with them.
#[allow(clippy::too_many_arguments)]
fn project_show(
    slug: &str,
    runtime_stale_after_seconds: i64,
    timeline: &Value,
    helpers: SectionResult<'_>,
    growth_ladder: SectionResult<'_>,
    economics: SectionResult<'_>,
    tour_economics: SectionResult<'_>,
    shared_night: Option<SectionResult<'_>>,
) -> Result<Value, ApiError> {
    // The page cannot name its show without event.id, and renders the steps
    // ladder off `steps`. A timeline that lost either is drift — a failed
    // request, not a partial page. `show_fan_out_targets` already proved the
    // object carries event.id; what remains to assert is `steps`.
    show_fan_out_targets(timeline)?;
    if !timeline.get("steps").is_some_and(Value::is_array) {
        return Err(ApiError::ContractMismatch("show timeline is missing steps"));
    }
    let mut sections = vec![
        section("timeline", Ok(timeline), Shape::Object),
        section("helpers", helpers, Shape::Object),
        section("growth_ladder", growth_ladder, Shape::Object),
        section("economics", economics, Shape::Object),
        section("tour_economics", tour_economics, Shape::Object),
    ];
    // Only projected when the venue registry linked a night — the
    // `next_show_timeline` convention: never-due is absent, not null.
    if let Some(night) = shared_night {
        sections.push(section("shared_night", night, Shape::Object));
    }
    project_sections(slug, runtime_stale_after_seconds, "show", &sections)
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

/// The nearest upcoming show's slug out of the events section — the page's
/// "next night". `upcoming` is the upstream flag; `starts_at` ISO strings
/// sort lexicographically, so the minimum is the soonest. A malformed event
/// row skips itself rather than stranding the block.
fn next_upcoming_show_slug(shows: Option<&Value>) -> Option<String> {
    let events = shows?.get("events")?.as_array()?;
    events
        .iter()
        .filter(|event| event.get("upcoming").and_then(Value::as_bool) == Some(true))
        .filter_map(|event| {
            let slug = event.get("slug")?.as_str()?;
            let starts_at = event.get("starts_at")?.as_str()?;
            Some((starts_at, slug))
        })
        .min_by(|a, b| a.0.cmp(b.0))
        .map(|(_, slug)| slug.to_owned())
}

/// Re-project each section under its own contract name.
///
/// Passing an upstream response through verbatim would let a CrowdRelay field
/// addition enter the Control Plane contract unreviewed, and a section of the
/// wrong JSON type is treated as a failed section rather than rendered.
#[allow(clippy::too_many_arguments)]
fn project_today(
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
    acquisition_sources: SectionResult<'_>,
    reply_triage: SectionResult<'_>,
    shows: SectionResult<'_>,
    attention: SectionResult<'_>,
    next_show_timeline: Option<SectionResult<'_>>,
) -> Result<Value, ApiError> {
    let mut sections = vec![
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
        section("acquisition_sources", acquisition_sources, Shape::Object),
        section("reply_triage", reply_triage, Shape::Object),
        section("shows", shows, Shape::Object),
        // The needs-you snapshot, already through the dedicated endpoint's
        // own projection — the strip on the page reads `needs_you`,
        // `unpublished_drafts` and `not_reported` straight off it.
        section("attention", attention, Shape::Object),
    ];
    // Only projected when a next night exists — the section list is also the
    // verdict list, so a never-due fetch must not read as a gap.
    if let Some(timeline) = next_show_timeline {
        sections.push(section("next_show_timeline", timeline, Shape::Object));
    }
    project_sections(slug, runtime_stale_after_seconds, "today", &sections)
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
    fn acquisition_sources() -> Value {
        json!({"active_fans": 100, "tracked_fans": 42, "sources": []})
    }
    /// The today projection with the two queue/show sections answered
    /// Ok-empty and no next night — the shape most tests here care about.
    /// Named for the nine variable sections it still takes as arguments.
    #[allow(clippy::too_many_arguments)]
    fn project_today_base(
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
        acquisition_sources: SectionResult<'_>,
    ) -> Result<Value, ApiError> {
        let rt = json!({"summary": {}, "needs_human": [], "recent_auto": []});
        let sh = json!({"events": []});
        // The needs-you snapshot as the dedicated endpoint would project it —
        // `not_reported` present so the section reads reported-empty.
        let att = json!({"needs_you": [], "awaiting_approval": 0, "unpublished_drafts": [], "not_reported": []});
        project_today(
            slug,
            runtime_stale_after_seconds,
            summary,
            flags,
            autopilot,
            growth,
            opportunities,
            signal,
            audience,
            growth_metrics,
            acquisition_sources,
            ok(&rt),
            ok(&sh),
            ok(&att),
            None,
        )
    }

    /// Build the nine variable section values for project_today_base, with
    /// all Ok. Reduces boilerplate across the test suite. Returns owned
    /// Values; callers wrap in ok() at the call site so the borrows live
    /// as long as the project_today_base call.
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
                acquisition_sources(),
            )
        };
    }

    #[test]
    fn projects_every_section_of_a_complete_snapshot() {
        let (s, f, a, g, o, sig, aud, gm, acq) = all_sections!();
        let projected = project_today_base(
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
        assert_eq!(projected["acquisition_sources"], acquisition_sources());
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
            "acquisition_sources",
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
            project_today_base("virya", 300, s, Err(&error), a, g, o, sig, aud, gm, acq)
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
        let (sig_val, aud_val, gm_val, acq_val) = (
            signal(),
            audience(),
            growth_metrics(),
            acquisition_sources(),
        );
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_today_base(
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
        let (sig_val, aud_val, gm_val, acq_val) = (
            signal(),
            audience(),
            growth_metrics(),
            acquisition_sources(),
        );
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_today_base(
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
            let (sig_val, aud_val, gm_val, acq_val) = (
                signal(),
                audience(),
                growth_metrics(),
                acquisition_sources(),
            );
            let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
            let projected = project_today_base(
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
        let (sig_val, aud_val, gm_val, acq_val) = (
            signal(),
            audience(),
            growth_metrics(),
            acquisition_sources(),
        );
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_today_base(
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
        let (rt_err, sh_err, att_err) = (timeout(), unreachable(), timeout());
        let error = project_today(
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
            Err(&rt_err),
            Err(&sh_err),
            Err(&att_err),
            None,
        )
        .expect_err("a fully failed snapshot must not render as an empty page");

        let ApiError::AllSectionsFailed { detail } = &error else {
            panic!("expected AllSectionsFailed, got {error:?}");
        };
        assert_eq!(detail.slug, "virya");
        assert_eq!(detail.channel, "today");
        assert_eq!(detail.degraded.len(), 12);
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
            "acquisition_sources",
            "reply_triage",
            "shows",
            "attention",
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
        let error = project_today(
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
            Err(&e),
            Err(&e),
            Err(&e),
            None,
        )
        .expect_err("a fully failed snapshot must not render as an empty page");
        assert!(matches!(error, ApiError::AllSectionsFailed { .. }));
    }

    #[test]
    fn drops_fields_the_control_plane_contract_does_not_name() {
        let (s, f, a, g, o, sig, aud, gm, acq) = all_sections!();
        let projected = project_today_base(
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
                "acquisition_sources",
                "attention",
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
                "reply_triage",
                "sections",
                "shows",
                "signal",
                "summary"
            ]
        );
    }

    /// The one conditional section: when a next night exists its timeline is
    /// a first-class section — value, verdict and freshness included.
    #[test]
    fn a_next_show_timeline_lands_when_the_night_exists() {
        let (s, f, a, g, o, sig, aud, gm, acq) = all_sections!();
        let (rt, sh, att, tl) = (
            json!({"summary": {}, "needs_human": [], "recent_auto": []}),
            json!({"events": [{"slug": "friday", "upcoming": true, "starts_at": "2026-10-02T20:00:00Z"}]}),
            json!({"needs_you": [], "awaiting_approval": 0, "unpublished_drafts": [], "not_reported": []}),
            json!({"event": {"slug": "friday"}, "steps": []}),
        );
        let projected = project_today(
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
            ok(&rt),
            ok(&sh),
            ok(&att),
            Some(ok(&tl)),
        )
        .expect("complete snapshot projects");
        assert_eq!(projected["next_show_timeline"], tl);
        assert_eq!(
            projected["sections"]["next_show_timeline"]["state"],
            json!("ok")
        );
        assert_eq!(projected["degraded"], json!([]));
    }

    /// A failed timeline must not blank the twelve sections around it — it
    /// degrades alone, named in `degraded`, value null.
    #[test]
    fn a_failed_next_show_timeline_degrades_alone() {
        let (s, f, a, g, o, sig, aud, gm, acq) = all_sections!();
        let (rt, sh, att) = (
            json!({"summary": {}, "needs_human": [], "recent_auto": []}),
            json!({"events": [{"slug": "friday", "upcoming": true, "starts_at": "x"}]}),
            json!({"needs_you": [], "awaiting_approval": 0, "unpublished_drafts": [], "not_reported": []}),
        );
        let e = timeout();
        let projected = project_today(
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
            ok(&rt),
            ok(&sh),
            ok(&att),
            Some(Err(&e)),
        )
        .expect("one bad section degrades, the rest still project");
        assert_eq!(projected["next_show_timeline"], Value::Null);
        assert_eq!(projected["degraded"], json!(["next_show_timeline"]));
        assert_eq!(projected["shows"], sh);
    }

    /// `next_upcoming_show_slug` picks the soonest `upcoming` event by
    /// `starts_at`; past shows, malformed rows and a failed shows section
    /// all mean no timeline fetch at all.
    #[test]
    fn next_upcoming_show_slug_picks_the_soonest_upcoming() {
        let shows = json!({"events": [
            {"slug": "later", "upcoming": true, "starts_at": "2026-10-09T20:00:00Z"},
            {"slug": "sooner", "upcoming": true, "starts_at": "2026-10-02T20:00:00Z"},
            {"slug": "past", "upcoming": false, "starts_at": "2026-01-01T20:00:00Z"},
            {"slug": "no-starts-at", "upcoming": true},
        ]});
        assert_eq!(
            next_upcoming_show_slug(Some(&shows)),
            Some("sooner".to_owned())
        );
        assert_eq!(next_upcoming_show_slug(None), None);
        assert_eq!(next_upcoming_show_slug(Some(&json!({"events": []}))), None);
        assert_eq!(
            next_upcoming_show_slug(Some(
                &json!({"events": [{"slug": "past", "upcoming": false}]})
            )),
            None
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
    #[test]
    fn portfolio_projects_a_complete_snapshot() {
        let (o, a, f) = (roster_overview(), amplification(), fanbases());
        let projected = project_portfolio("virya", 300, ok(&o), ok(&a), ok(&f))
            .expect("complete snapshot projects");

        assert_eq!(projected["id"], json!("virya"));
        assert_eq!(projected["overview"], roster_overview());
        assert_eq!(projected["amplification"], amplification());
        assert_eq!(projected["fanbases"], fanbases());
        assert_eq!(projected["degraded"], json!([]));
    }

    #[test]
    fn portfolio_degrades_one_section_without_blanking_the_rest() {
        let (o, a) = (roster_overview(), amplification());
        let e = unreachable();
        let projected = project_portfolio("virya", 300, ok(&o), ok(&a), Err(&e))
            .expect("a partial snapshot is still usable");

        assert_eq!(projected["overview"], roster_overview());
        assert_eq!(projected["fanbases"], Value::Null);
        assert_eq!(projected["degraded"], json!(["fanbases"]));
        assert_eq!(
            projected["sections"]["fanbases"]["state"],
            json!("unreachable")
        );
    }

    #[test]
    fn portfolio_with_no_usable_section_is_an_error() {
        let e = unreachable();
        let error = project_portfolio("virya", 300, Err(&e), Err(&e), Err(&e))
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
        let (sig_val, aud_val, gm_val, acq_val) = (
            signal(),
            audience(),
            growth_metrics(),
            acquisition_sources(),
        );
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_today_base(
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
        let (sig_val, aud_val, gm_val, acq_val) = (
            signal(),
            audience(),
            growth_metrics(),
            acquisition_sources(),
        );
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_today_base(
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
        let (sig_val, aud_val, gm_val, acq_val) = (
            signal(),
            audience(),
            growth_metrics(),
            acquisition_sources(),
        );
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_today_base(
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
        let (sig_val, aud_val, gm_val, acq_val) = (
            signal(),
            audience(),
            growth_metrics(),
            acquisition_sources(),
        );
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_today_base(
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
        let (sig_val, aud_val, gm_val, acq_val) = (
            signal(),
            audience(),
            growth_metrics(),
            acquisition_sources(),
        );
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_today_base(
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
        let (sig_val, aud_val, gm_val, acq_val) = (
            signal(),
            audience(),
            growth_metrics(),
            acquisition_sources(),
        );
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_today_base(
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
        let (sig_val, aud_val, gm_val, acq_val) = (
            signal(),
            audience(),
            growth_metrics(),
            acquisition_sources(),
        );
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_today_base(
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
        let (sig_val, aud_val, gm_val, acq_val) = (
            signal(),
            audience(),
            growth_metrics(),
            acquisition_sources(),
        );
        let (sig, aud, gm, acq) = (ok(&sig_val), ok(&aud_val), ok(&gm_val), ok(&acq_val));
        let projected = project_today_base(
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
                can_suspend: true,
                can_provision: false,
                can_remove: false,
                archetype: "band".to_owned(),
                placement: "dedicated".to_owned(),
                placement_cluster: None,
                placement_database: None,
                team_members: serde_json::Value::Array(vec![]),
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
            },
            runtime: None,
            runtime_health: crate::model::RuntimeHealth::Unknown,
            billing: None,
            enabled_notifier_channels: 1,
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
                "unpublished_drafts": [{"channel": "reddit", "drafts": 4}, {"channel": "telegram", "drafts": 2}],
                "brain": {"state": "improving", "needs_attention": false, "quiet_cycles": 0},
                "ecosystem": {},
            }).as_object().unwrap().clone()),
            autopilot: None,
            learning: None,
            outcomes: None,
            audience: None,
            trends: None,
            objectives: None,
        };
        let projected = build_per_tenant_summary(&mock_tenant(), &data);
        assert_eq!(projected["attention"]["needsYou"], json!(2));
        assert_eq!(projected["attention"]["awaitingApproval"], json!(3));
        assert_eq!(projected["attention"]["openFindings"], json!(1));
        assert_eq!(projected["attention"]["criticalAlerts"], json!(1));
        assert_eq!(projected["attention"]["deadDeliveries"], json!(1));
        assert_eq!(projected["attention"]["unpublishedDrafts"], json!(6));
        assert_eq!(projected["attention"]["available"], json!(true));
        // The brain block passes through wholesale — including fields added
        // after this projection was written (quiet_cycles, latest_wait_reason).
        // It lives at the top level of the tenant snapshot; reading it out of
        // `ecosystem` is how the command center silently saw Null for months.
        assert_eq!(projected["brain"]["state"], json!("improving"));
        assert_eq!(projected["brain"]["quiet_cycles"], json!(0));
    }

    #[test]
    fn command_center_unpublished_drafts_stays_null_when_unreported() {
        // An older CrowdRelay does not publish the field — the projection must
        // say "does not report" (null), not "zero drafts".
        let data = TenantCommandData {
            attention: Some(json!({"needs_you": []}).as_object().unwrap().clone()),
            autopilot: None,
            learning: None,
            outcomes: None,
            audience: None,
            trends: None,
            objectives: None,
        };
        let projected = build_per_tenant_summary(&mock_tenant(), &data);
        assert_eq!(projected["attention"]["unpublishedDrafts"], Value::Null);
        assert_eq!(
            projected["attention"]["unpublishedDraftChannels"],
            Value::Null
        );
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
            trends: None,
            objectives: None,
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
            trends: None,
            objectives: None,
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
            trends: None,
            objectives: None,
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
            trends: None,
            objectives: None,
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
    fn command_center_momentum_matches_north_star_and_sums_downstream() {
        let mut tenant = mock_tenant();
        tenant.tenant.north_star_metric = "spotify_followers".to_owned();
        let data = TenantCommandData {
            trends: Some(vec![
                // The declared north star — matched by the
                // "{platform}_{metric_key}" composite the wizard writes.
                json!({
                    "platform": "spotify", "metric_key": "followers",
                    "display_name": "Spotify followers", "value_tier": "vanity",
                    "latest_value": 1000, "delta_7d": 24, "delta_28d": 90,
                    "stale": false,
                }),
                // Downstream = banked conversions; its deltas sum.
                json!({
                    "platform": "ticketing", "metric_key": "ticket_sales",
                    "display_name": "Ticket sales", "value_tier": "downstream",
                    "latest_value": 300, "delta_7d": 12, "delta_28d": 40,
                    "stale": false,
                }),
                // A stale downstream series counts toward coverage, never
                // toward a delta.
                json!({
                    "platform": "merch", "metric_key": "orders",
                    "display_name": "Orders", "value_tier": "downstream",
                    "latest_value": 50, "delta_7d": 99, "delta_28d": 99,
                    "stale": true,
                }),
                // Vanity-tier community sizes never enter the conversion sum.
                json!({
                    "platform": "social", "metric_key": "members",
                    "display_name": "Community members", "value_tier": "vanity",
                    "latest_value": 3_900_000, "delta_7d": 50_000, "delta_28d": 100_000,
                    "stale": false,
                }),
            ]),
            ..Default::default()
        };
        let projected = build_per_tenant_summary(&tenant, &data);
        assert_eq!(projected["momentum"]["available"], json!(true));
        assert_eq!(projected["momentum"]["seriesCount"], json!(4));
        assert_eq!(projected["momentum"]["staleSeriesCount"], json!(1));
        assert_eq!(projected["momentum"]["northStarDelta7d"], json!(24));
        assert_eq!(projected["momentum"]["northStarDelta28d"], json!(90));
        assert_eq!(projected["momentum"]["northStarLatest"], json!(1000));
        assert_eq!(
            projected["momentum"]["northStarDisplayName"],
            json!("Spotify followers")
        );
        // Only the fresh downstream series contributes — the stale merch
        // series and the vanity community series are both excluded.
        assert_eq!(projected["momentum"]["conversionDelta7d"], json!(12));
        assert_eq!(projected["momentum"]["conversionDelta28d"], json!(40));
    }

    #[test]
    fn command_center_momentum_null_when_trends_absent_or_aggregate() {
        // No trends section → momentum reports unavailable, not zero deltas.
        let projected = build_per_tenant_summary(&mock_tenant(), &TenantCommandData::default());
        assert_eq!(projected["momentum"]["available"], json!(false));
        assert_eq!(projected["momentum"]["northStarDelta7d"], Value::Null);

        // An aggregate north star ("total_audience") matches no series —
        // the brain's state label is its direction signal, not a guessed
        // sum over platform counts.
        let mut tenant = mock_tenant();
        tenant.tenant.north_star_metric = "total_audience".to_owned();
        let data = TenantCommandData {
            trends: Some(vec![json!({
                "platform": "spotify", "metric_key": "followers",
                "display_name": "Spotify followers", "value_tier": "vanity",
                "latest_value": 1000, "delta_7d": 24, "delta_28d": 90,
                "stale": false,
            })]),
            ..Default::default()
        };
        let projected = build_per_tenant_summary(&tenant, &data);
        assert_eq!(projected["momentum"]["northStarDelta7d"], Value::Null);
        assert_eq!(projected["momentum"]["conversionDelta7d"], Value::Null);
    }

    #[test]
    fn command_center_objectives_counts_states_and_names_at_risk() {
        let data = TenantCommandData {
            objectives: Some(vec![
                json!({
                    "objective_id": "o1", "platform": "spotify",
                    "metric_key": "followers", "scope_kind": "workspace",
                    "baseline_value": 900, "target_value": 2000,
                    "observed_value": 1000, "deadline": "2026-08-01T00:00:00Z",
                    "state": {"state": "behind", "progress_basis_points": 1111},
                }),
                json!({
                    "objective_id": "o2", "platform": "bandsintown",
                    "metric_key": "trackers", "scope_kind": "workspace",
                    "baseline_value": 100, "target_value": 300,
                    "observed_value": 290, "deadline": "2026-06-01T00:00:00Z",
                    "state": {"state": "missed", "progress_basis_points": 9666},
                }),
                json!({
                    "objective_id": "o3", "platform": "youtube",
                    "metric_key": "subscribers", "scope_kind": "workspace",
                    "baseline_value": 5000, "target_value": 8000,
                    "observed_value": 7000, "deadline": "2026-09-01T00:00:00Z",
                    "state": {"state": "on_track", "progress_basis_points": 6666},
                }),
            ]),
            ..Default::default()
        };
        let projected = build_per_tenant_summary(&mock_tenant(), &data);
        assert_eq!(projected["objectives"]["available"], json!(true));
        assert_eq!(projected["objectives"]["total"], json!(3));
        assert_eq!(projected["objectives"]["behind"], json!(1));
        assert_eq!(projected["objectives"]["missed"], json!(1));
        assert_eq!(projected["objectives"]["onTrack"], json!(1));
        // The at-risk list names what's wrong, soonest deadline first —
        // the missed June objective sorts ahead of the behind August one.
        let at_risk = projected["objectives"]["atRisk"].as_array().unwrap();
        assert_eq!(at_risk.len(), 2);
        assert_eq!(at_risk[0]["metricKey"], json!("trackers"));
        assert_eq!(at_risk[0]["state"], json!("missed"));
        assert_eq!(at_risk[1]["metricKey"], json!("followers"));
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
    /// `platformServices` is backed by the platform health table the runtime
    /// observer writes, `notificationOutbox` by the outbox table the
    /// dispatcher writes. Any key added here must be backed by something the
    /// container can actually compute; an empty string or a null standing in
    /// for "we never implemented this" reads to an operator as authoritative
    /// system state.
    #[test]
    fn command_center_system_block_exposes_only_sourced_fields() {
        let block = system_block(
            &[],
            &crate::store::NotificationOutboxHealth {
                dead_7d: 2,
                overdue_pending: 3,
            },
        );
        let object = block.as_object().expect("system block is an object");
        let mut keys: Vec<&str> = object.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            vec!["notificationOutbox", "platformServices"],
            "system block must expose only fields with an authoritative source"
        );
        assert!(
            object["platformServices"].is_array(),
            "platformServices must be the platform health list, not a placeholder"
        );
        assert_eq!(
            object["notificationOutbox"],
            json!({ "dead7d": 2, "overduePending": 3 }),
            "notificationOutbox must project the real outbox counts"
        );
    }

    /// The rollup counts only sections that reported. An unavailable section
    /// projects zeroed fields locally — counting them again fleet-side would
    /// let an unreachable tenant write a confident 0 into a total that reads
    /// complete. `reportingTenants` is the coverage the operator reads beside
    /// every sum, matching the fans/momentum/objectives convention.
    #[test]
    fn rollup_counts_only_available_sections_and_reports_coverage() {
        let reporting = TenantCommandData {
            attention: Some(
                json!({
                    "needs_you": [{"id": "a1"}, {"id": "a2"}],
                    "awaiting_approval": 1,
                    "findings": [],
                    "alerts": [],
                    "dead_deliveries": []
                })
                .as_object()
                .unwrap()
                .clone(),
            ),
            autopilot: Some(
                json!({
                    "queued_actions": 2,
                    "processing_actions": 1,
                    "succeeded_24h": 5,
                    "failed_24h": 1,
                    "recent_actions": []
                })
                .as_object()
                .unwrap()
                .clone(),
            ),
            ..Default::default()
        };
        let dead = TenantCommandData::default();
        let mut per_tenant = vec![
            build_per_tenant_summary(&mock_tenant(), &reporting),
            build_per_tenant_summary(&mock_tenant(), &dead),
        ];
        // A malformed row — `available: false` with live fields — must not
        // contribute either: the flag is the only authority on whether the
        // section's numbers mean anything. `outcomes`/`learning` are absent
        // keys entirely, which indexes to Null and skips the same gates —
        // the two malformed shapes an upstream bug could actually emit.
        per_tenant.push(json!({
            "slug": "ghost",
            "displayName": "Ghost",
            "runtimeHealth": "unknown",
            "available": true,
            "attention": {"available": false, "needsYou": 99},
            "autopilot": {"available": false, "queuedActions": 50},
            "brain": {},
            "fans": {"available": false},
            "momentum": {"available": false},
            "objectives": {"available": false},
        }));

        let rolled = aggregate_command_center_totals(
            &per_tenant,
            chrono::Utc::now(),
            &[],
            &crate::store::NotificationOutboxHealth {
                dead_7d: 0,
                overdue_pending: 0,
            },
        );

        assert_eq!(rolled["attention"]["needsYou"], json!(2));
        assert_eq!(rolled["attention"]["awaitingApproval"], json!(1));
        assert_eq!(rolled["attention"]["reportingTenants"], json!(1));
        assert_eq!(rolled["attention"]["unavailableTenants"], json!(2));
        assert_eq!(rolled["autopilot"]["queuedActions"], json!(2));
        assert_eq!(rolled["autopilot"]["reportingTenants"], json!(1));
        assert_eq!(rolled["outcomes"]["resolved"], json!(0));
        assert_eq!(rolled["outcomes"]["reportingTenants"], json!(0));
        assert_eq!(rolled["learning"]["totalOutcomes"], json!(0));
        assert_eq!(rolled["learning"]["reportingTenants"], json!(0));
    }

    // ── The show page model ────────────────────────────────────────────
    // `project_show` receives the spine only after the handler's `?`, so a
    // transport-dead timeline is unrepresentable here; what these tests pin
    // is the rest of the contract — spine drift is an error, every panel
    // degrades on its own, and an unlinked night is absent rather than null.

    fn show_timeline() -> Value {
        json!({
            "event": {
                "id": "01933f2a-0000-7000-8000-000000000001",
                "slug": "sanity-check-gorzow-2026",
                "title": "Sanity check",
                "place_event_id": "01933f2a-0000-7000-8000-000000000002"
            },
            "steps": [{"key": "announced", "state": "done"}]
        })
    }
    fn helpers_value() -> Value {
        json!({"event": {"city": "Gorzów"}, "press": [], "degraded": []})
    }
    fn ladder_value() -> Value {
        json!({"event_id": "01933f2a-0000-7000-8000-000000000001", "ladder_state": "none", "rungs": []})
    }
    fn economics_value() -> Value {
        json!({"shows": [{"event_id": "01933f2a-0000-7000-8000-000000000001"}]})
    }
    fn tour_value() -> Value {
        json!({"policy": {"crew_size": 4}, "version": 3})
    }
    fn night_value() -> Value {
        json!({"place_event_id": "01933f2a-0000-7000-8000-000000000002", "lens": "own_band"})
    }

    /// The six-section call with every panel Ok — boilerplate shared by the
    /// show-model tests; callers override the results they care about.
    fn project_show_all(
        timeline: &Value,
        helpers: SectionResult<'_>,
        growth_ladder: SectionResult<'_>,
        economics: SectionResult<'_>,
        tour_economics: SectionResult<'_>,
        shared_night: Option<SectionResult<'_>>,
    ) -> Result<Value, ApiError> {
        project_show(
            "virya",
            300,
            timeline,
            helpers,
            growth_ladder,
            economics,
            tour_economics,
            shared_night,
        )
    }

    #[test]
    fn show_model_projects_every_section_of_a_complete_snapshot() {
        let (tl, h, l, e, t, n) = (
            show_timeline(),
            helpers_value(),
            ladder_value(),
            economics_value(),
            tour_value(),
            night_value(),
        );
        let projected = project_show_all(&tl, ok(&h), ok(&l), ok(&e), ok(&t), Some(ok(&n)))
            .expect("a complete show snapshot projects");

        assert_eq!(projected["id"], json!("virya"));
        assert_eq!(projected["timeline"], tl);
        assert_eq!(projected["helpers"], h);
        assert_eq!(projected["growth_ladder"], l);
        assert_eq!(projected["economics"], e);
        assert_eq!(projected["tour_economics"], t);
        assert_eq!(projected["shared_night"], n);
        assert_eq!(projected["degraded"], json!([]));
        for name in [
            "timeline",
            "helpers",
            "growth_ladder",
            "economics",
            "tour_economics",
            "shared_night",
        ] {
            assert_eq!(projected["sections"][name]["state"], json!("ok"), "{name}");
        }
        assert!(projected["fetchedAt"].is_string());
    }

    #[test]
    fn show_model_unlinked_night_is_absent_not_degraded() {
        let (tl, h, l, e, t) = (
            show_timeline(),
            helpers_value(),
            ladder_value(),
            economics_value(),
            tour_value(),
        );
        let projected = project_show_all(&tl, ok(&h), ok(&l), ok(&e), ok(&t), None)
            .expect("a show without a shared night projects");

        // The `next_show_timeline` convention: a section that does not apply
        // is absent entirely — no key, no verdict, no degraded entry.
        assert!(projected.get("shared_night").is_none());
        assert!(projected["sections"].get("shared_night").is_none());
        assert_eq!(projected["degraded"], json!([]));
    }

    #[test]
    fn show_model_failed_panels_degrade_locally() {
        let (tl, _h, l, e, t) = (
            show_timeline(),
            helpers_value(),
            ladder_value(),
            economics_value(),
            tour_value(),
        );
        let timed_out = timeout();
        let gone = ApiError::NotFound;
        let projected = project_show_all(
            &tl,
            Err(&timed_out),
            ok(&l),
            ok(&e),
            ok(&t),
            Some(Err(&gone)),
        )
        .expect("dead panels degrade; the spine still renders");

        assert_eq!(projected["timeline"], tl);
        assert_eq!(projected["helpers"], Value::Null);
        assert_eq!(projected["shared_night"], Value::Null);
        assert_eq!(projected["degraded"], json!(["helpers", "shared_night"]));
        assert_eq!(projected["sections"]["helpers"]["state"], json!("timeout"));
        assert_eq!(
            projected["sections"]["shared_night"]["state"],
            json!("absent")
        );
        assert!(projected["sections"]["helpers"]["remediation"].is_string());
    }

    #[test]
    fn show_model_wrong_typed_section_is_contract_mismatch() {
        let (tl, h, l, t) = (
            show_timeline(),
            helpers_value(),
            ladder_value(),
            tour_value(),
        );
        let bad = json!([]); // economics answers an array where an object is contracted
        let projected = project_show_all(&tl, ok(&h), ok(&l), ok(&bad), ok(&t), None)
            .expect("a wrong-typed panel degrades");

        assert_eq!(projected["economics"], Value::Null);
        assert_eq!(projected["degraded"], json!(["economics"]));
        assert_eq!(
            projected["sections"]["economics"]["state"],
            json!("contract_mismatch")
        );
    }

    #[test]
    fn show_model_every_panel_down_still_renders_the_night() {
        // The deliberate divergence from the other models' all-failed rule:
        // the spine is always Ok here, so every panel dead is a degraded
        // page — the show still renders — never an error card.
        let tl = show_timeline();
        let e = timeout();
        let projected = project_show_all(&tl, Err(&e), Err(&e), Err(&e), Err(&e), Some(Err(&e)))
            .expect("all panels dead is a degraded page, not a failed one");

        assert_eq!(projected["timeline"], tl);
        assert_eq!(
            projected["degraded"],
            json!([
                "helpers",
                "growth_ladder",
                "economics",
                "tour_economics",
                "shared_night"
            ])
        );
    }

    #[test]
    fn show_model_spine_drift_fails_the_model() {
        let (h, l, e, t, n) = (
            helpers_value(),
            ladder_value(),
            economics_value(),
            tour_value(),
            night_value(),
        );
        for bad in [
            json!({"steps": []}),                         // no event at all
            json!({"event": {"slug": "x"}, "steps": []}), // event without id
            json!({"event": {"id": "x"}}),                // no steps
            json!({"event": {"id": "x"}, "steps": {}}),   // steps not an array
            json!("not an object"),
        ] {
            let error = project_show_all(&bad, ok(&h), ok(&l), ok(&e), ok(&t), Some(ok(&n)))
                .expect_err("spine drift must fail the model");
            assert!(
                matches!(error, ApiError::ContractMismatch(_)),
                "{bad} must be a contract mismatch, got {error:?}"
            );
        }
    }

    #[test]
    fn show_model_wave_two_targets_come_from_the_timeline() {
        let tl = show_timeline();
        let (event_id, night) =
            show_fan_out_targets(&tl).expect("a valid timeline names its event");
        assert_eq!(event_id, "01933f2a-0000-7000-8000-000000000001");
        assert_eq!(
            night,
            NightTarget::Linked("01933f2a-0000-7000-8000-000000000002")
        );

        // Null, absent and empty place_event_id all mean unlinked — no
        // wave-2 night fetch either way.
        let unlinked_links = [json!(null), json!("")];
        for link in unlinked_links {
            let tl = json!({"event": {"id": "01933f2a-0000-7000-8000-000000000001", "place_event_id": link}, "steps": []});
            let (event_id, night) =
                show_fan_out_targets(&tl).expect("unlinked still names its event");
            assert_eq!(event_id, "01933f2a-0000-7000-8000-000000000001");
            assert_eq!(night, NightTarget::Unlinked, "place_event_id={link}");
        }
        let no_key = json!({"event": {"id": "01933f2a-0000-7000-8000-000000000001"}, "steps": []});
        assert_eq!(
            show_fan_out_targets(&no_key).unwrap().1,
            NightTarget::Unlinked
        );

        // A link that is present but not a uuid never reaches an upstream
        // path — it degrades the night section instead of vanishing.
        for bad in [
            json!("../escape"),
            json!("still-not-a-uuid"),
            json!(42),
            json!({"nested": "object"}),
        ] {
            let tl = json!({"event": {"id": "01933f2a-0000-7000-8000-000000000001", "place_event_id": bad}, "steps": []});
            assert_eq!(
                show_fan_out_targets(&tl).unwrap().1,
                NightTarget::Malformed,
                "place_event_id={bad}"
            );
        }

        // The same rule on the spine: an event id that is not a uuid is
        // drift, not a fetch — the standalone ladder route requires the
        // same shape.
        let bad_spine = json!({"event": {"id": "../events", "place_event_id": null}, "steps": []});
        assert!(matches!(
            show_fan_out_targets(&bad_spine),
            Err(ApiError::ContractMismatch(_))
        ));
    }

    #[test]
    fn path_segment_rejects_anything_that_escapes_its_segment() {
        assert_eq!(
            path_segment("sanity-check-gorzow-2026").expect("a real event slug passes"),
            "sanity-check-gorzow-2026"
        );
        for bad in [
            "",
            "a/b",
            "..",
            ".",
            "a b",
            "a%2Fb",
            "a\\b",
            "a?b=1",
            "a.b",
            "a~b",
            "Uppercase",
        ] {
            assert!(path_segment(bad).is_err(), "{bad:?} must be rejected");
        }
        let long = "a".repeat(129);
        assert!(path_segment(&long).is_err(), "over-long segments rejected");
    }

    #[test]
    fn places_projects_each_source_as_its_own_section() {
        let funnel = json!([{"city_slug": "krakow", "fans": 12}]);
        let venues = json!([{"venue_id": "v1", "display_name": "Alchemia"}]);
        let registry = json!({"places": [{"id": "p1", "name": "r/poland"}]});
        let plan = json!({"proposals": [], "passed_over": []});
        let area = json!({"items": [{"slug": "krakow"}]});

        let projected = project_sections(
            "virya",
            300,
            "places",
            &places_sections(
                ok(&funnel),
                ok(&venues),
                ok(&registry),
                ok(&plan),
                ok(&area),
            ),
        )
        .expect("all five sections answer");

        assert_eq!(projected["id"], json!("virya"));
        assert_eq!(projected["city_funnel"], funnel);
        assert_eq!(projected["city_venues"], venues);
        assert_eq!(projected["audience_places"], registry);
        assert_eq!(projected["gig_plan"], plan);
        assert_eq!(projected["area_cities"], area);
        assert_eq!(projected["degraded"], json!([]));
        for name in [
            "city_funnel",
            "city_venues",
            "audience_places",
            "gig_plan",
            "area_cities",
        ] {
            assert_eq!(projected["sections"][name]["state"], json!("ok"), "{name}");
        }
    }

    #[test]
    fn places_degrades_only_the_section_the_tenant_could_not_answer() {
        // AREA is a separate upstream surface with its own token — it is the
        // section most likely to be absent on a tenant that never onboarded
        // it. Losing it must not blank the funnel, which is the page's spine.
        let funnel = json!([{"city_slug": "krakow", "fans": 12}]);
        let venues = json!([]);
        let registry = json!({"places": []});
        let plan = json!({"proposals": []});
        let error = unreachable();

        let projected = project_sections(
            "virya",
            300,
            "places",
            &places_sections(
                ok(&funnel),
                ok(&venues),
                ok(&registry),
                ok(&plan),
                Err(&error),
            ),
        )
        .expect("one dead section still projects the rest");

        assert_eq!(projected["city_funnel"], funnel);
        assert_eq!(projected["area_cities"], Value::Null);
        assert_eq!(projected["degraded"], json!(["area_cities"]));
    }

    #[test]
    fn places_fails_closed_only_when_every_section_is_down() {
        let error = timeout();
        let failed = project_sections(
            "virya",
            300,
            "places",
            &places_sections(
                Err(&error),
                Err(&error),
                Err(&error),
                Err(&error),
                Err(&error),
            ),
        );
        assert!(
            matches!(failed, Err(ApiError::AllSectionsFailed { .. })),
            "every section dead is the read model's only hard error"
        );
    }

    #[test]
    fn places_rejects_a_misshapen_section_as_contract_drift() {
        // The funnel must be an array — an object shaped like an envelope
        // means the upstream contract moved, which is drift to name, not a
        // healthy empty city list.
        let funnel = json!({"items": []});
        let venues = json!([]);
        let registry = json!({"places": []});
        let plan = json!({"proposals": []});
        let area = json!({"items": []});

        let projected = project_sections(
            "virya",
            300,
            "places",
            &places_sections(
                ok(&funnel),
                ok(&venues),
                ok(&registry),
                ok(&plan),
                ok(&area),
            ),
        )
        .expect("a misshapen section degrades, it does not fail the model");

        assert_eq!(projected["city_funnel"], Value::Null);
        assert_eq!(projected["degraded"], json!(["city_funnel"]));
        assert_eq!(
            projected["sections"]["city_funnel"]["state"],
            json!("contract_mismatch")
        );
    }

    #[test]
    fn brain_projects_each_source_as_its_own_section() {
        let autopilot = json!({"runtime_enabled": true, "queued_actions": 3});
        let scorecard = json!({"status": "working", "agents": []});
        let learning = json!([{"decision_id": "d1"}]);
        let proof = json!({"entries": []});
        let measurement = json!({"claims": []});
        let attention = json!({"needs_you": [], "rejected_agent_outcomes": []});

        let projected = project_sections(
            "virya",
            300,
            "brain",
            &brain_sections(
                ok(&autopilot),
                ok(&scorecard),
                ok(&learning),
                ok(&proof),
                ok(&measurement),
                ok(&attention),
            ),
        )
        .expect("all six sections answer");

        assert_eq!(projected["id"], json!("virya"));
        assert_eq!(projected["autopilot"], autopilot);
        assert_eq!(projected["scorecard"], scorecard);
        assert_eq!(projected["learning"], learning);
        assert_eq!(projected["learning_proof"], proof);
        assert_eq!(projected["measurement"], measurement);
        assert_eq!(projected["attention"], attention);
        assert_eq!(projected["degraded"], json!([]));
        for name in [
            "autopilot",
            "scorecard",
            "learning",
            "learning_proof",
            "measurement",
            "attention",
        ] {
            assert_eq!(projected["sections"][name]["state"], json!("ok"), "{name}");
        }
    }

    #[test]
    fn brain_degrades_only_the_section_the_tenant_could_not_answer() {
        // The measurement ledger is the newest upstream read — the likeliest
        // absent on an older tenant. Losing it must not blank the scorecard.
        let autopilot = json!({"runtime_enabled": true});
        let scorecard = json!({"status": "working"});
        let learning = json!([]);
        let proof = json!({"entries": []});
        let error = unreachable();
        let attention = json!({"needs_you": []});

        let projected = project_sections(
            "virya",
            300,
            "brain",
            &brain_sections(
                ok(&autopilot),
                ok(&scorecard),
                ok(&learning),
                ok(&proof),
                Err(&error),
                ok(&attention),
            ),
        )
        .expect("one dead section still projects the rest");

        assert_eq!(projected["scorecard"], scorecard);
        assert_eq!(projected["measurement"], Value::Null);
        assert_eq!(projected["degraded"], json!(["measurement"]));
    }

    #[test]
    fn brain_fails_closed_only_when_every_section_is_down() {
        let error = timeout();
        let failed = project_sections(
            "virya",
            300,
            "brain",
            &brain_sections(
                Err(&error),
                Err(&error),
                Err(&error),
                Err(&error),
                Err(&error),
                Err(&error),
            ),
        );
        assert!(
            matches!(failed, Err(ApiError::AllSectionsFailed { .. })),
            "every section dead is the read model's only hard error"
        );
    }

    #[test]
    fn brain_rejects_a_misshapen_section_as_contract_drift() {
        // The learning loop must be an array — an object shaped like an
        // envelope means the upstream contract moved, which is drift to name,
        // not a healthy empty loop.
        let autopilot = json!({"runtime_enabled": true});
        let scorecard = json!({"status": "working"});
        let learning = json!({"items": []});
        let proof = json!({"entries": []});
        let measurement = json!({"claims": []});
        let attention = json!({"needs_you": []});

        let projected = project_sections(
            "virya",
            300,
            "brain",
            &brain_sections(
                ok(&autopilot),
                ok(&scorecard),
                ok(&learning),
                ok(&proof),
                ok(&measurement),
                ok(&attention),
            ),
        )
        .expect("a misshapen section degrades, it does not fail the model");

        assert_eq!(projected["learning"], Value::Null);
        assert_eq!(projected["degraded"], json!(["learning"]));
        assert_eq!(
            projected["sections"]["learning"]["state"],
            json!("contract_mismatch")
        );
    }

    #[test]
    fn delivery_projects_each_source_as_its_own_section() {
        let summary =
            json!({"outbox": {"dead": 0}, "deliveries": {"dead": 0}, "push": {"dead": 0}});
        let outbox = json!([{"id": "o1"}]);
        let deliveries = json!([{"id": "d1", "endpoint_name": "push"}]);
        let attention = json!({"dead_outbox": [], "dead_deliveries": [], "dead_push": []});
        let results = json!([{"id": "r1", "status": "delivered"}]);

        let projected = project_sections(
            "virya",
            300,
            "delivery",
            &delivery_sections(
                ok(&summary),
                ok(&outbox),
                ok(&deliveries),
                ok(&attention),
                ok(&results),
            ),
        )
        .expect("all five sections answer");

        assert_eq!(projected["id"], json!("virya"));
        assert_eq!(projected["summary"], summary);
        assert_eq!(projected["outbox"], outbox);
        assert_eq!(projected["deliveries"], deliveries);
        assert_eq!(projected["attention"], attention);
        assert_eq!(projected["delivery_results"], results);
        assert_eq!(projected["degraded"], json!([]));
        for name in [
            "summary",
            "outbox",
            "deliveries",
            "attention",
            "delivery_results",
        ] {
            assert_eq!(projected["sections"][name]["state"], json!("ok"), "{name}");
        }
    }

    #[test]
    fn delivery_degrades_only_the_section_the_tenant_could_not_answer() {
        // The results ledger is the read most likely to be absent on an
        // older tenant — losing it must not blank the dead queues the
        // operator came to clear.
        let summary = json!({"outbox": {"dead": 2}});
        let outbox = json!([]);
        let deliveries = json!([]);
        let attention = json!({"dead_outbox": [{"id": "o1"}]});
        let error = unreachable();

        let projected = project_sections(
            "virya",
            300,
            "delivery",
            &delivery_sections(
                ok(&summary),
                ok(&outbox),
                ok(&deliveries),
                ok(&attention),
                Err(&error),
            ),
        )
        .expect("one dead section still projects the rest");

        assert_eq!(projected["attention"], attention);
        assert_eq!(projected["delivery_results"], Value::Null);
        assert_eq!(projected["degraded"], json!(["delivery_results"]));
    }

    #[test]
    fn proof_projects_each_source_as_its_own_section() {
        let listing = json!({"listing": {"act_name": "Virya"}, "share_token": "tok"});
        let attestations = json!([{"digest": "d1"}]);
        let representation =
            json!({"targets": [{"name": "Agent"}], "approaches_used_this_month": 1});
        let shows = json!({"events": [{"slug": "s1", "status": "completed"}]});

        let projected = project_sections(
            "virya",
            300,
            "proof",
            &proof_sections(
                ok(&listing),
                ok(&attestations),
                ok(&representation),
                ok(&shows),
            ),
        )
        .expect("all sections answered");

        assert_eq!(projected["listing"], listing);
        assert_eq!(projected["attestations"], attestations);
        assert_eq!(projected["representation"], representation);
        assert_eq!(projected["shows"], shows);
        assert_eq!(projected["degraded"], json!([]));
    }

    #[test]
    fn proof_degrades_only_the_section_the_tenant_could_not_answer() {
        // The listing is the drawer's spine; a tenant that cannot answer
        // attestations still shows what is published and which reports
        // exist rather than erroring the page.
        let listing = json!({"listing": null, "share_token": null});
        let representation = json!({"targets": []});
        let shows = json!({"events": []});
        let error = unreachable();

        let projected = project_sections(
            "virya",
            300,
            "proof",
            &proof_sections(ok(&listing), Err(&error), ok(&representation), ok(&shows)),
        )
        .expect("one dead section still projects the rest");

        assert_eq!(projected["attestations"], Value::Null);
        assert_eq!(projected["degraded"], json!(["attestations"]));
    }

    #[test]
    fn delivery_fails_closed_only_when_every_section_is_down() {
        let error = timeout();
        let failed = project_sections(
            "virya",
            300,
            "delivery",
            &delivery_sections(
                Err(&error),
                Err(&error),
                Err(&error),
                Err(&error),
                Err(&error),
            ),
        );
        assert!(
            matches!(failed, Err(ApiError::AllSectionsFailed { .. })),
            "every section dead is the read model's only hard error"
        );
    }

    #[test]
    fn delivery_rejects_a_misshapen_section_as_contract_drift() {
        // The outbox must be an array — an object shaped like an envelope
        // means the upstream contract moved.
        let summary = json!({"outbox": {"dead": 0}});
        let outbox = json!({"items": []});
        let deliveries = json!([]);
        let attention = json!({"dead_outbox": []});
        let results = json!([]);

        let projected = project_sections(
            "virya",
            300,
            "delivery",
            &delivery_sections(
                ok(&summary),
                ok(&outbox),
                ok(&deliveries),
                ok(&attention),
                ok(&results),
            ),
        )
        .expect("a misshapen section degrades, it does not fail the model");

        assert_eq!(projected["outbox"], Value::Null);
        assert_eq!(projected["degraded"], json!(["outbox"]));
        assert_eq!(
            projected["sections"]["outbox"]["state"],
            json!("contract_mismatch")
        );
    }
}
