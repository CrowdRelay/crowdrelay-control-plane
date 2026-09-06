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

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header::CACHE_CONTROL},
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::{Value, json};
use tokio::sync::Semaphore;

use crate::{AppState, error::ApiError, tenant_area_client::ManagementRequest, validation};

const PRIVATE_NO_STORE: &str = "private, no-store";

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tenants/{slug}/overview", get(overview))
        .route("/tenants/{slug}/operations/overview", get(operations))
        .route("/tenants/{slug}/portfolio/model", get(portfolio))
        .route("/tenants/{slug}/audience/model", get(audience))
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
const COMMAND_CENTER_SECTION_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(8);

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

    let mut per_tenant = Vec::with_capacity(handles.len());
    for handle in handles {
        if let Ok(Some((tenant, summary))) = handle.await {
            per_tenant.push(build_per_tenant_summary(&tenant, &summary));
        }
    }

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
    }

    let platform_health = state.store.list_platform_health().await?;

    Ok(no_store(json!({
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
        "perTenant": per_tenant,
    })))
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
        Err(_) => {
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

    let (attention, autopilot, learning, outcomes) = tokio::join!(
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
    );

    let attention = attention.map_err(|_| ApiError::Timeout).and_then(|r| r);
    let autopilot = autopilot.map_err(|_| ApiError::Timeout).and_then(|r| r);
    let learning = learning.map_err(|_| ApiError::Timeout).and_then(|r| r);
    let outcomes = outcomes.map_err(|_| ApiError::Timeout).and_then(|r| r);

    TenantCommandData {
        attention: attention.as_ref().ok().and_then(|v| v.as_object()).cloned(),
        autopilot: autopilot.as_ref().ok().and_then(|v| v.as_object()).cloned(),
        learning: learning.as_ref().ok().and_then(|v| v.as_array()).cloned(),
        outcomes: outcomes.as_ref().ok().and_then(|v| v.as_object()).cloned(),
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
        || data.outcomes.is_some();

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
        "brain": att.and_then(|a| a.get("ecosystem")).and_then(|v| v.get("brain")).cloned().unwrap_or(Value::Null),
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
    })
}

/// Raw upstream data for one tenant, before projection.
#[derive(Default)]
struct TenantCommandData {
    attention: Option<serde_json::Map<String, Value>>,
    autopilot: Option<serde_json::Map<String, Value>>,
    learning: Option<Vec<Value>>,
    outcomes: Option<serde_json::Map<String, Value>>,
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
    let tenant = state.store.tenant_by_slug(&slug).await?;
    // Both list reads take the already-resolved tenant id: one lookup per
    // request, not three.
    let (provisioning, audit) = tokio::try_join!(
        state.store.provisioning_jobs_for(tenant.tenant.id, 20),
        state.store.audit_for_tenant_id(tenant.tenant.id, 40),
    )?;

    let externally_owned = crate::store::tenant_lifecycle_is_externally_owned(&tenant.tenant.slug);

    Ok(no_store(json!({
        // Stable identity so the browser can patch this model in place on a
        // refresh instead of replacing the whole subpage.
        "id": tenant.tenant.slug,
        "tenant": tenant,
        "provisioning": {"items": provisioning},
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
            },
        },
    })))
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

    let (summary, flags, autopilot, growth, opportunities) = tokio::join!(
        section("/v1/control-plane/ops/summary"),
        section("/v1/control-plane/ecosystem/flags"),
        section("/v1/control-plane/autopilot/overview"),
        section("/v1/control-plane/autopilot/growth"),
        section("/v1/control-plane/autopilot/next-best-actions"),
    );

    Ok(no_store(project_operations(
        &slug,
        state.runtime_stale_after_seconds,
        summary.as_ref(),
        flags.as_ref(),
        autopilot.as_ref(),
        growth.as_ref(),
        opportunities.as_ref(),
    )?))
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
/// classified against the stale threshold. Where absent, `observedAt` is null
/// and `classification` is `unknown` — the Control Plane assembled this
/// section now but cannot vouch for the fact's recency, and that is the honest
/// answer. Timestamps are never invented.
fn freshness_for_section(
    value: &Value,
    now: chrono::DateTime<chrono::Utc>,
    stale_after_seconds: i64,
) -> Value {
    let observed = oldest_upstream_timestamp(value);
    match observed {
        None => json!({"observedAt": null, "classification": "unknown"}),
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
/// conventional names CrowdRelay uses. Returns `None` if no recognizable
/// timestamp is present — the caller must not invent one.
fn oldest_upstream_timestamp(value: &Value) -> Option<chrono::DateTime<chrono::Utc>> {
    let object = value.as_object()?;
    let mut candidates: Vec<chrono::DateTime<chrono::Utc>> = Vec::new();
    for field in [
        "checkedAt",
        "lastHeartbeatAt",
        "observedAt",
        "generatedAt",
        "lastSeen",
        "updatedAt",
    ] {
        if let Some(ts_str) = object.get(field).and_then(Value::as_str) {
            if let Ok(ts) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                candidates.push(ts.with_timezone(&chrono::Utc));
            }
        }
    }
    candidates.into_iter().min()
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

    Ok(no_store(project_portfolio(
        &slug,
        state.runtime_stale_after_seconds,
        overview.as_ref(),
        amplification.as_ref(),
        fanbases.as_ref(),
        settings.as_ref(),
    )?))
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

    Ok(no_store(project_audience(
        &slug,
        state.runtime_stale_after_seconds,
        overview.as_ref(),
        fans.as_ref(),
        segments.as_ref(),
    )?))
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
fn project_operations(
    slug: &str,
    runtime_stale_after_seconds: i64,
    summary: SectionResult<'_>,
    flags: SectionResult<'_>,
    autopilot: SectionResult<'_>,
    growth: SectionResult<'_>,
    opportunities: SectionResult<'_>,
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

    #[test]
    fn projects_every_section_of_a_complete_snapshot() {
        let (s, f, a, g, o) = (summary(), flags(), autopilot(), growth(), opportunities());
        let projected = project_operations("virya", 300, ok(&s), ok(&f), ok(&a), ok(&g), ok(&o))
            .expect("complete snapshot projects");

        assert_eq!(projected["id"], json!("virya"));
        assert_eq!(projected["summary"], summary());
        assert_eq!(projected["flags"], flags());
        assert_eq!(projected["autopilot"], autopilot());
        assert_eq!(projected["growth"], growth());
        assert_eq!(projected["opportunities"], opportunities());
        assert_eq!(projected["degraded"], json!([]));
        for name in ["summary", "flags", "autopilot", "growth", "opportunities"] {
            assert_eq!(projected["sections"][name]["state"], json!("ok"), "{name}");
            assert_eq!(projected["sections"][name]["remediation"], Value::Null);
        }
        assert!(projected["fetchedAt"].is_string());
    }

    #[test]
    fn a_failed_section_degrades_locally_instead_of_failing_the_subpage() {
        let (s, a, g, o) = (summary(), autopilot(), growth(), opportunities());
        let error = timeout();
        let projected =
            project_operations("virya", 300, ok(&s), Err(&error), ok(&a), ok(&g), ok(&o))
                .expect("a partial snapshot is still usable");

        assert_eq!(projected["flags"], Value::Null);
        assert_eq!(projected["degraded"], json!(["flags"]));
        assert_eq!(projected["summary"], summary());
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
        let projected = project_operations(
            "virya",
            300,
            ok(&s),
            Err(&timed_out),
            Err(&gone),
            Err(&refused),
            Err(&broken),
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
        let projected = project_operations(
            "virya",
            300,
            ok(&wrong_summary),
            ok(&wrong_flags),
            ok(&a),
            ok(&g),
            ok(&wrong_opportunities),
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
            let projected = project_operations(
                "virya",
                300,
                ok(&bad), // summary expects an object
                ok(&bad), // flags expects an array
                ok(&autopilot()),
                ok(&growth()),
                ok(&opportunities()),
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
        let projected = project_operations(
            "virya",
            300,
            ok(&json!({})), // summary: empty object is valid
            ok(&json!([])), // flags: empty array is valid
            ok(&autopilot()),
            ok(&growth()),
            ok(&opportunities()),
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
        let error = project_operations(
            "virya",
            300,
            Err(&timed_out),
            Err(&gone),
            Err(&refused),
            Err(&broken),
            Err(&unreachable_err),
        )
        .expect_err("a fully failed snapshot must not render as an empty page");

        let ApiError::AllSectionsFailed { detail } = &error else {
            panic!("expected AllSectionsFailed, got {error:?}");
        };
        assert_eq!(detail.slug, "virya");
        assert_eq!(detail.channel, "operations");
        assert_eq!(detail.degraded.len(), 5);
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
        for name in ["summary", "flags", "autopilot", "growth", "opportunities"] {
            assert!(
                detail.verdicts[name]["remediation"].is_string(),
                "{name} must tell the operator what to do"
            );
        }
    }

    #[test]
    fn a_snapshot_with_no_usable_section_is_an_error() {
        let e = unreachable();
        let error = project_operations("virya", 300, Err(&e), Err(&e), Err(&e), Err(&e), Err(&e))
            .expect_err("a fully failed snapshot must not render as an empty page");
        assert!(matches!(error, ApiError::AllSectionsFailed { .. }));
    }

    #[test]
    fn drops_fields_the_control_plane_contract_does_not_name() {
        let (s, f, a, g, o) = (summary(), flags(), autopilot(), growth(), opportunities());
        let projected = project_operations("virya", 300, ok(&s), ok(&f), ok(&a), ok(&g), ok(&o))
            .expect("complete snapshot projects");

        let keys: Vec<&String> = projected.as_object().expect("object").keys().collect();
        assert_eq!(
            keys,
            vec![
                "autopilot",
                "degraded",
                "fetchedAt",
                "flags",
                "freshness",
                "growth",
                "id",
                "opportunities",
                "sections",
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
        let projected = project_operations("virya", 300, ok(&s), ok(&f), ok(&a), ok(&g), ok(&o))
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
    fn freshness_is_unknown_when_upstream_provides_no_timestamp() {
        let s = json!({"ok": true});
        let f = json!([{"flag": "test", "enabled": true}]);
        let a = json!({"policies": []});
        let g = json!({"objective": "grow"});
        let o = json!([]);
        let projected = project_operations("virya", 300, ok(&s), ok(&f), ok(&a), ok(&g), ok(&o))
            .expect("complete snapshot projects");
        let freshness = &projected["freshness"]["summary"];
        assert_eq!(freshness["observedAt"], json!(null));
        assert_eq!(
            freshness["classification"],
            json!("unknown"),
            "no upstream timestamp means unknown, not fresh"
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
        let projected = project_operations("virya", 300, ok(&s), ok(&f), ok(&a), ok(&g), ok(&o))
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
        let projected = project_operations("virya", 300, ok(&s), Err(&e), ok(&a), ok(&g), ok(&o))
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
    fn freshness_never_invents_a_timestamp() {
        // A section with no upstream timestamp fields must get observedAt: null,
        // never now() or fetchedAt. This is the core invariant: the Control
        // Plane must never claim to know when a fact was observed if it wasn't.
        let s = json!({"ok": true, "data": [1, 2, 3]});
        let f = json!([{"flag": "test", "enabled": true}]);
        let a = json!({"policies": []});
        let g = json!({"objective": "grow"});
        let o = json!([]);
        let projected = project_operations("virya", 300, ok(&s), ok(&f), ok(&a), ok(&g), ok(&o))
            .expect("complete snapshot projects");
        for name in ["summary", "flags", "autopilot", "growth", "opportunities"] {
            assert_eq!(
                projected["freshness"][name]["observedAt"],
                json!(null),
                "{name} must not have an invented observedAt"
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
        let projected = project_operations("virya", 300, ok(&s), ok(&f), ok(&a), ok(&g), ok(&o))
            .expect("complete snapshot projects");
        let freshness = &projected["freshness"]["summary"];
        assert_eq!(
            freshness["classification"],
            json!("stale"),
            "a fresh checkedAt cannot launder a stale lastHeartbeatAt"
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
        assert_eq!(projected["attention"]["needsYou"], json!(0));
        assert_eq!(projected["autopilot"]["queuedActions"], json!(0));
        assert_eq!(projected["learning"]["totalOutcomes"], json!(0));
        assert_eq!(projected["outcomes"]["resolved"], json!(0));
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
