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

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header::CACHE_CONTROL},
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::{Value, json};

use crate::{AppState, error::ApiError, tenant_area_client::ManagementRequest, validation};

const PRIVATE_NO_STORE: &str = "private, no-store";

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tenants/{slug}/overview", get(overview))
        .route("/tenants/{slug}/operations/overview", get(operations))
        .route("/tenants/{slug}/portfolio/model", get(portfolio))
        .route("/tenants/{slug}/audience/model", get(audience))
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
/// [`crate::tenant_area_client`] already distinguishes these cases and then
/// flattens most of them into `Unavailable(message)`. Reading the class back
/// out here is cheaper than restructuring that error type, and the mapping is
/// pinned by tests below so a message reword cannot silently reclassify a
/// timeout as a contract mismatch.
fn classify_section_failure(error: &ApiError) -> SectionState {
    match error {
        ApiError::NotFound => SectionState::Absent,
        ApiError::Unauthorized | ApiError::Forbidden(_) => SectionState::Unauthorized,
        ApiError::InvalidInput(_) | ApiError::Conflict(_) => SectionState::Rejected,
        ApiError::Unavailable(message) => {
            if message.contains("timeout") {
                SectionState::Timeout
            // The transport reports every non-2xx it does not translate as
            // "upstream returned HTTP {status}". 401 and 403 there mean the
            // derived per-tenant credential was refused, which is a different
            // repair from a tenant that is merely erroring.
            } else if message.starts_with("upstream returned HTTP 401")
                || message.starts_with("upstream returned HTTP 403")
            {
                SectionState::Unauthorized
            } else if message.starts_with("upstream returned HTTP") {
                SectionState::UpstreamError
            } else if message.contains("malformed")
                || message.contains("invalid upstream")
                || message.contains("truncated")
                || message.contains("framing")
                || message.contains("empty success body")
                || message.contains("body for HTTP 204")
                || message.contains("exceeded limit")
                || message.contains("transfer encoding")
                || message.contains("redirect refused")
                || message.contains("missing upstream status")
                || message.contains("duplicate upstream")
            {
                SectionState::ContractMismatch
            } else {
                SectionState::Unreachable
            }
        }
        _ => SectionState::UpstreamError,
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

/// Project named sections under this contract, carrying each failure's class.
///
/// `degraded` keeps its original shape (a list of section names) because the
/// browser filters on it; `sections` adds the per-section verdict so the panel
/// can explain the gap instead of showing a blank card. `fetchedAt` is the
/// moment this snapshot was assembled — the only freshness claim the Control
/// Plane can honestly make about a live fan-out.
fn project_sections(
    slug: &str,
    channel: &str,
    sections: &[Section<'_>],
) -> Result<Value, ApiError> {
    let mut projected = serde_json::Map::new();
    let mut degraded = Vec::new();
    let mut verdicts = serde_json::Map::new();
    for section in sections {
        let state = match section.result {
            Ok(value) if section.shape.accepts(value) => {
                projected.insert(section.name.to_owned(), value.clone());
                SectionState::Ok
            }
            Ok(_) => SectionState::ContractMismatch,
            Err(error) => classify_section_failure(error),
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
        return Err(ApiError::Unavailable(format!(
            "tenant {channel} channel returned no usable section"
        )));
    }

    projected.insert("id".to_owned(), Value::String(slug.to_owned()));
    projected.insert("degraded".to_owned(), Value::Array(degraded));
    projected.insert("sections".to_owned(), Value::Object(verdicts));
    projected.insert("fetchedAt".to_owned(), json!(chrono::Utc::now()));
    Ok(Value::Object(projected))
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
        overview.as_ref(),
        amplification.as_ref(),
        fanbases.as_ref(),
        settings.as_ref(),
    )?))
}

fn project_portfolio(
    slug: &str,
    overview: SectionResult<'_>,
    amplification: SectionResult<'_>,
    fanbases: SectionResult<'_>,
    settings: SectionResult<'_>,
) -> Result<Value, ApiError> {
    project_sections(
        slug,
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
        overview.as_ref(),
        fans.as_ref(),
        segments.as_ref(),
    )?))
}

fn project_audience(
    slug: &str,
    overview: SectionResult<'_>,
    fans: SectionResult<'_>,
    segments: SectionResult<'_>,
) -> Result<Value, ApiError> {
    project_sections(
        slug,
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
    summary: SectionResult<'_>,
    flags: SectionResult<'_>,
    autopilot: SectionResult<'_>,
    growth: SectionResult<'_>,
    opportunities: SectionResult<'_>,
) -> Result<Value, ApiError> {
    project_sections(
        slug,
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
        ApiError::Unavailable("upstream request timeout".to_owned())
    }
    fn unreachable() -> ApiError {
        ApiError::Unavailable("upstream target unavailable".to_owned())
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
        let projected = project_operations("virya", ok(&s), ok(&f), ok(&a), ok(&g), ok(&o))
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
        let projected = project_operations("virya", ok(&s), Err(&error), ok(&a), ok(&g), ok(&o))
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
            ApiError::Unavailable("invalid upstream JSON".to_owned()),
        );
        let projected = project_operations(
            "virya",
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
    fn transport_messages_map_to_stable_failure_classes() {
        // Pins the mapping against a reword upstream silently turning a
        // timeout into "unreachable" — or worse, a contract mismatch into a
        // transient-looking blip the operator retries forever.
        for (message, expected) in [
            ("upstream connect timeout", SectionState::Timeout),
            ("upstream request timeout", SectionState::Timeout),
            ("upstream target unavailable", SectionState::Unreachable),
            ("upstream write failed", SectionState::Unreachable),
            ("upstream returned HTTP 503", SectionState::UpstreamError),
            ("upstream returned HTTP 401", SectionState::Unauthorized),
            ("upstream returned HTTP 403", SectionState::Unauthorized),
            ("invalid upstream JSON", SectionState::ContractMismatch),
            (
                "malformed upstream response",
                SectionState::ContractMismatch,
            ),
            (
                "truncated upstream response",
                SectionState::ContractMismatch,
            ),
            (
                "upstream returned an empty success body",
                SectionState::ContractMismatch,
            ),
            ("upstream redirect refused", SectionState::ContractMismatch),
        ] {
            assert_eq!(
                classify_section_failure(&ApiError::Unavailable(message.to_owned())),
                expected,
                "{message}"
            );
        }
        assert_eq!(
            classify_section_failure(&ApiError::NotFound),
            SectionState::Absent
        );
        assert_eq!(
            classify_section_failure(&ApiError::InvalidInput("bad path".to_owned())),
            SectionState::Rejected
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

    #[test]
    fn a_snapshot_with_no_usable_section_is_an_error() {
        let e = unreachable();
        let error = project_operations("virya", Err(&e), Err(&e), Err(&e), Err(&e), Err(&e))
            .expect_err("a fully failed snapshot must not render as an empty page");
        assert!(matches!(error, ApiError::Unavailable(_)));
    }

    #[test]
    fn drops_fields_the_control_plane_contract_does_not_name() {
        let (s, f, a, g, o) = (summary(), flags(), autopilot(), growth(), opportunities());
        let projected = project_operations("virya", ok(&s), ok(&f), ok(&a), ok(&g), ok(&o))
            .expect("complete snapshot projects");

        let keys: Vec<&String> = projected.as_object().expect("object").keys().collect();
        assert_eq!(
            keys,
            vec![
                "autopilot",
                "degraded",
                "fetchedAt",
                "flags",
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
        let projected = project_portfolio("virya", ok(&o), ok(&a), ok(&f), ok(&s))
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
        let projected = project_portfolio("virya", ok(&o), ok(&a), Err(&e), Err(&e))
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
        let error = project_portfolio("virya", Err(&e), Err(&e), Err(&e), Err(&e))
            .expect_err("a fully failed snapshot must not render as an empty page");
        assert!(matches!(error, ApiError::Unavailable(_)));
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
        let projected =
            project_audience("virya", ok(&o), ok(&f), ok(&s)).expect("complete snapshot projects");

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
        let projected = project_audience("virya", ok(&o), Err(&e), Err(&e))
            .expect("a partial snapshot is still usable");

        assert_eq!(projected["overview"], audience_overview());
        assert_eq!(projected["fans"], Value::Null);
        assert_eq!(projected["segments"], Value::Null);
        assert_eq!(projected["degraded"], json!(["fans", "segments"]));
    }

    #[test]
    fn audience_with_no_usable_section_is_an_error() {
        let e = unreachable();
        let error = project_audience("virya", Err(&e), Err(&e), Err(&e))
            .expect_err("a fully failed snapshot must not render as an empty page");
        assert!(matches!(error, ApiError::Unavailable(_)));
    }
}
