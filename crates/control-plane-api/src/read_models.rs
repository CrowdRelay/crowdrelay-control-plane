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
    let (provisioning, audit) = tokio::try_join!(
        state.store.provisioning_jobs(&slug, 20),
        state.store.audit_for_tenant(&slug, 40),
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

    let (summary, flags, autopilot, growth) = tokio::join!(
        section("/v1/control-plane/ops/summary"),
        section("/v1/control-plane/ecosystem/flags"),
        section("/v1/control-plane/autopilot/overview"),
        section("/v1/control-plane/autopilot/growth"),
    );

    Ok(no_store(project_operations(
        &slug,
        summary.as_ref().ok(),
        flags.as_ref().ok(),
        autopilot.as_ref().ok(),
        growth.as_ref().ok(),
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
) -> Result<Value, ApiError> {
    let sections = [
        ("summary", summary, Shape::Object),
        ("flags", flags, Shape::Array),
        ("autopilot", autopilot, Shape::Object),
        ("growth", growth, Shape::Object),
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

    #[test]
    fn projects_every_section_of_a_complete_snapshot() {
        let projected = project_operations(
            "virya",
            Some(&summary()),
            Some(&flags()),
            Some(&autopilot()),
            Some(&growth()),
        )
        .expect("complete snapshot projects");

        assert_eq!(projected["id"], json!("virya"));
        assert_eq!(projected["summary"], summary());
        assert_eq!(projected["flags"], flags());
        assert_eq!(projected["autopilot"], autopilot());
        assert_eq!(projected["growth"], growth());
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
        )
        .expect("wrong-typed sections degrade");

        assert_eq!(projected["summary"], Value::Null);
        assert_eq!(projected["flags"], Value::Null);
        assert_eq!(projected["degraded"], json!(["summary", "flags"]));
    }

    #[test]
    fn a_snapshot_with_no_usable_section_is_an_error() {
        let error = project_operations("virya", None, None, None, None)
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
        )
        .expect("complete snapshot projects");

        let keys: Vec<&String> = projected.as_object().expect("object").keys().collect();
        assert_eq!(
            keys,
            vec!["autopilot", "degraded", "flags", "growth", "id", "summary"]
        );
    }
}
