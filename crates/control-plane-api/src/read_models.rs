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
        summary.as_ref().ok(),
        flags.as_ref().ok(),
        autopilot.as_ref().ok(),
        growth.as_ref().ok(),
        opportunities.as_ref().ok(),
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
        overview.as_ref().ok(),
        amplification.as_ref().ok(),
        fanbases.as_ref().ok(),
        settings.as_ref().ok(),
    )?))
}

fn project_portfolio(
    slug: &str,
    overview: Option<&Value>,
    amplification: Option<&Value>,
    fanbases: Option<&Value>,
    settings: Option<&Value>,
) -> Result<Value, ApiError> {
    let sections = [
        ("overview", overview, Shape::Object),
        ("amplification", amplification, Shape::Object),
        ("fanbases", fanbases, Shape::Object),
        ("settings", settings, Shape::Object),
    ];

    let mut projected = serde_json::Map::new();
    let mut degraded = Vec::new();
    for (name, value, shape) in sections {
        match value {
            Some(value) if shape.accepts(value) => {
                projected.insert(name.to_owned(), value.clone());
            }
            _ => {
                projected.insert(name.to_owned(), Value::Null);
                degraded.push(Value::String(name.to_owned()));
            }
        }
    }

    if degraded.len() == sections.len() {
        return Err(ApiError::Unavailable(
            "tenant portfolio channel returned no usable section".to_owned(),
        ));
    }

    projected.insert("id".to_owned(), Value::String(slug.to_owned()));
    projected.insert("degraded".to_owned(), Value::Array(degraded));
    Ok(Value::Object(projected))
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
        overview.as_ref().ok(),
        fans.as_ref().ok(),
        segments.as_ref().ok(),
    )?))
}

fn project_audience(
    slug: &str,
    overview: Option<&Value>,
    fans: Option<&Value>,
    segments: Option<&Value>,
) -> Result<Value, ApiError> {
    let sections = [
        ("overview", overview, Shape::Object),
        ("fans", fans, Shape::Array),
        ("segments", segments, Shape::Array),
    ];

    let mut projected = serde_json::Map::new();
    let mut degraded = Vec::new();
    for (name, value, shape) in sections {
        match value {
            Some(value) if shape.accepts(value) => {
                projected.insert(name.to_owned(), value.clone());
            }
            _ => {
                projected.insert(name.to_owned(), Value::Null);
                degraded.push(Value::String(name.to_owned()));
            }
        }
    }

    if degraded.len() == sections.len() {
        return Err(ApiError::Unavailable(
            "tenant audience channel returned no usable section".to_owned(),
        ));
    }

    projected.insert("id".to_owned(), Value::String(slug.to_owned()));
    projected.insert("degraded".to_owned(), Value::Array(degraded));
    Ok(Value::Object(projected))
}

/// Re-project each section under its own contract name.
///
/// Passing an upstream response through verbatim would let a CrowdRelay field
/// addition enter the Control Plane contract unreviewed, and a section of the
/// wrong JSON type is treated as a failed section rather than rendered.
fn project_operations(
    slug: &str,
    summary: Option<&Value>,
    flags: Option<&Value>,
    autopilot: Option<&Value>,
    growth: Option<&Value>,
    opportunities: Option<&Value>,
) -> Result<Value, ApiError> {
    let sections = [
        ("summary", summary, Shape::Object),
        ("flags", flags, Shape::Array),
        ("autopilot", autopilot, Shape::Object),
        ("growth", growth, Shape::Object),
        ("opportunities", opportunities, Shape::Array),
    ];

    let mut projected = serde_json::Map::new();
    let mut degraded = Vec::new();
    for (name, value, shape) in sections {
        match value {
            Some(value) if shape.accepts(value) => {
                projected.insert(name.to_owned(), value.clone());
            }
            _ => {
                projected.insert(name.to_owned(), Value::Null);
                degraded.push(Value::String(name.to_owned()));
            }
        }
    }

    if degraded.len() == sections.len() {
        return Err(ApiError::Unavailable(
            "tenant operations channel returned no usable section".to_owned(),
        ));
    }

    projected.insert("id".to_owned(), Value::String(slug.to_owned()));
    projected.insert("degraded".to_owned(), Value::Array(degraded));
    Ok(Value::Object(projected))
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let projected = project_operations(
            "virya",
            Some(&summary()),
            Some(&flags()),
            Some(&autopilot()),
            Some(&growth()),
            Some(&opportunities()),
        )
        .expect("complete snapshot projects");

        assert_eq!(projected["id"], json!("virya"));
        assert_eq!(projected["summary"], summary());
        assert_eq!(projected["flags"], flags());
        assert_eq!(projected["autopilot"], autopilot());
        assert_eq!(projected["growth"], growth());
        assert_eq!(projected["opportunities"], opportunities());
        assert_eq!(projected["degraded"], json!([]));
    }

    #[test]
    fn a_failed_section_degrades_locally_instead_of_failing_the_subpage() {
        let projected = project_operations(
            "virya",
            Some(&summary()),
            None,
            Some(&autopilot()),
            Some(&growth()),
            Some(&opportunities()),
        )
        .expect("a partial snapshot is still usable");

        assert_eq!(projected["flags"], Value::Null);
        assert_eq!(projected["degraded"], json!(["flags"]));
        assert_eq!(projected["summary"], summary());
    }

    #[test]
    fn a_section_of_the_wrong_json_type_counts_as_degraded() {
        let projected = project_operations(
            "virya",
            Some(&json!([])),
            Some(&json!({"not": "an array"})),
            Some(&autopilot()),
            Some(&growth()),
            Some(&json!({"not": "an array either"})),
        )
        .expect("wrong-typed sections degrade");

        assert_eq!(projected["summary"], Value::Null);
        assert_eq!(projected["flags"], Value::Null);
        assert_eq!(projected["opportunities"], Value::Null);
        assert_eq!(
            projected["degraded"],
            json!(["summary", "flags", "opportunities"])
        );
    }

    #[test]
    fn a_snapshot_with_no_usable_section_is_an_error() {
        let error = project_operations("virya", None, None, None, None, None)
            .expect_err("a fully failed snapshot must not render as an empty page");
        assert!(matches!(error, ApiError::Unavailable(_)));
    }

    #[test]
    fn drops_fields_the_control_plane_contract_does_not_name() {
        let projected = project_operations(
            "virya",
            Some(&summary()),
            Some(&flags()),
            Some(&autopilot()),
            Some(&growth()),
            Some(&opportunities()),
        )
        .expect("complete snapshot projects");

        let keys: Vec<&String> = projected.as_object().expect("object").keys().collect();
        assert_eq!(
            keys,
            vec![
                "autopilot",
                "degraded",
                "flags",
                "growth",
                "id",
                "opportunities",
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
        let projected = project_portfolio(
            "virya",
            Some(&roster_overview()),
            Some(&amplification()),
            Some(&fanbases()),
            Some(&settings()),
        )
        .expect("complete snapshot projects");

        assert_eq!(projected["id"], json!("virya"));
        assert_eq!(projected["overview"], roster_overview());
        assert_eq!(projected["amplification"], amplification());
        assert_eq!(projected["fanbases"], fanbases());
        assert_eq!(projected["settings"], settings());
        assert_eq!(projected["degraded"], json!([]));
    }

    #[test]
    fn portfolio_degrades_one_section_without_blankning_the_rest() {
        let projected = project_portfolio(
            "virya",
            Some(&roster_overview()),
            Some(&amplification()),
            None,
            None,
        )
        .expect("a partial snapshot is still usable");

        assert_eq!(projected["overview"], roster_overview());
        assert_eq!(projected["fanbases"], Value::Null);
        assert_eq!(projected["settings"], Value::Null);
        assert_eq!(projected["degraded"], json!(["fanbases", "settings"]));
    }

    #[test]
    fn portfolio_with_no_usable_section_is_an_error() {
        let error = project_portfolio("virya", None, None, None, None)
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
        let projected = project_audience(
            "virya",
            Some(&audience_overview()),
            Some(&audience_fans()),
            Some(&audience_segments()),
        )
        .expect("complete snapshot projects");

        assert_eq!(projected["id"], json!("virya"));
        assert_eq!(projected["overview"], audience_overview());
        assert_eq!(projected["fans"], audience_fans());
        assert_eq!(projected["segments"], audience_segments());
        assert_eq!(projected["degraded"], json!([]));
    }

    #[test]
    fn audience_degrades_one_section_without_blankning_the_rest() {
        let projected = project_audience("virya", Some(&audience_overview()), None, None)
            .expect("a partial snapshot is still usable");

        assert_eq!(projected["overview"], audience_overview());
        assert_eq!(projected["fans"], Value::Null);
        assert_eq!(projected["segments"], Value::Null);
        assert_eq!(projected["degraded"], json!(["fans", "segments"]));
    }

    #[test]
    fn audience_with_no_usable_section_is_an_error() {
        let error = project_audience("virya", None, None, None)
            .expect_err("a fully failed snapshot must not render as an empty page");
        assert!(matches!(error, ApiError::Unavailable(_)));
    }
}
