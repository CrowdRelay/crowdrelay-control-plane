//! Aggregated, read-only operator-attention snapshot.
//!
//! The browser polls one endpoint instead of five independent Control Plane
//! routes. CrowdRelay remains canonical for every constituent read model.
//!
//! CrowdRelay assembles the snapshot itself, so this is a single tenant call
//! rather than a five-way fan-out through the private tunnel: the upstream
//! runs the sections concurrently under its own per-section timeout, and one
//! slow read can no longer stall four other tunnel requests. The response is
//! still re-projected field by field so an upstream addition cannot leak into
//! the Control Plane contract unreviewed.

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header::CACHE_CONTROL},
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::{Value, json};

use crate::{AppState, error::ApiError, tenant_area_client::ManagementRequest};

const PRIVATE_NO_STORE: &str = "private, no-store";

pub fn router() -> Router<AppState> {
    Router::new().route("/tenants/{slug}/operations/attention", get(attention))
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

fn expect_object(value: &Value, name: &str) -> Result<(), ApiError> {
    if value.is_object() {
        Ok(())
    } else {
        Err(ApiError::Unavailable(format!(
            "tenant attention {name} returned an invalid JSON shape"
        )))
    }
}

fn expect_array(value: &Value, name: &str) -> Result<(), ApiError> {
    if value.is_array() {
        Ok(())
    } else {
        Err(ApiError::Unavailable(format!(
            "tenant attention {name} returned an invalid JSON shape"
        )))
    }
}

fn section<'a>(snapshot: &'a Value, name: &str) -> Result<&'a Value, ApiError> {
    snapshot.get(name).ok_or_else(|| {
        ApiError::Unavailable(format!("tenant attention snapshot is missing {name}"))
    })
}

async fn attention(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let snapshot = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "GET",
                path: "/v1/control-plane/ops/attention",
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: None,
            },
        )
        .await?;

    Ok((
        StatusCode::OK,
        [(CACHE_CONTROL, PRIVATE_NO_STORE)],
        Json(project(&slug, &snapshot)?),
    )
        .into_response())
}

/// Re-project the upstream snapshot field by field.
///
/// Passing the tenant response through verbatim would let an upstream field
/// addition enter the Control Plane contract without review, so each section is
/// named and type-checked here exactly as the five-call version checked its
/// five responses.
fn project(slug: &str, snapshot: &Value) -> Result<Value, ApiError> {
    expect_object(snapshot, "snapshot")?;
    let summary = section(snapshot, "summary")?;
    // Optional on purpose: a CrowdRelay that predates the watchdog alert list
    // still serves a valid snapshot, and an operator plane must not fail closed
    // on a section the tenant simply does not publish yet.
    let alerts = snapshot.get("alerts").cloned().unwrap_or_else(|| json!([]));
    let dead_push = snapshot
        .get("dead_push")
        .cloned()
        .unwrap_or_else(|| json!([]));
    let dead_outbox = section(snapshot, "dead_outbox")?;
    let dead_deliveries = section(snapshot, "dead_deliveries")?;
    let ecosystem = section(snapshot, "ecosystem")?;
    let findings = section(snapshot, "findings")?;
    // Optional: a CrowdRelay that predates needs_you/awaiting_approval in
    // the attention snapshot still serves a valid response. An older
    // upstream simply does not publish these fields yet.
    let needs_you = snapshot
        .get("needs_you")
        .cloned()
        .unwrap_or_else(|| json!([]));
    let awaiting_approval = snapshot
        .get("awaiting_approval")
        .cloned()
        .unwrap_or_else(|| json!(0));

    expect_object(summary, "summary")?;
    expect_array(&alerts, "alerts")?;
    expect_array(&dead_push, "dead push")?;
    expect_array(dead_outbox, "dead outbox")?;
    expect_array(dead_deliveries, "dead deliveries")?;
    expect_object(ecosystem, "ecosystem")?;
    expect_array(findings, "findings")?;
    expect_array(&needs_you, "needs_you")?;

    Ok(json!({
        // Stable identity so the browser patches this model in place on a
        // refresh instead of replacing the whole subpage.
        "id": slug,
        "summary": summary,
        "alerts": alerts,
        "dead_push": dead_push,
        "dead_outbox": dead_outbox,
        "dead_deliveries": dead_deliveries,
        "ecosystem": ecosystem,
        "findings": findings,
        "needs_you": needs_you,
        "awaiting_approval": awaiting_approval,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn expected_projection() -> Value {
        let mut expected = snapshot();
        expected["id"] = json!("virya");
        expected
    }

    fn snapshot() -> Value {
        json!({
            "summary": {"outbox": {"pending": 1}},
            "alerts": [{"alert_key": "webhook.dead", "severity": "critical", "active": true}],
            "dead_push": [{"id": "p", "title": "test", "status": "failed"}],
            "dead_outbox": [{"id": "a"}],
            "dead_deliveries": [],
            "ecosystem": {"schema_version": 1, "flags": []},
            "findings": [{"id": "f"}],
        })
    }

    #[test]
    fn projects_every_section_of_a_well_formed_snapshot() {
        let projected = project("virya", &snapshot()).expect("well-formed snapshot projects");
        assert_eq!(projected, expected_projection());
    }

    #[test]
    fn drops_fields_the_control_plane_contract_does_not_name() {
        let mut extra = snapshot();
        extra["surprise_upstream_addition"] = json!({"leaked": true});
        let projected = project("virya", &extra).expect("unknown fields are ignored, not fatal");
        assert_eq!(projected, expected_projection());
        assert!(projected.get("surprise_upstream_addition").is_none());
    }

    #[test]
    fn rejects_a_snapshot_missing_a_section() {
        for name in [
            "summary",
            "dead_outbox",
            "dead_deliveries",
            "ecosystem",
            "findings",
        ] {
            let mut partial = snapshot();
            partial.as_object_mut().expect("object").remove(name);
            let error = project("virya", &partial).expect_err("missing section must fail");
            assert!(
                matches!(&error, ApiError::Unavailable(message) if message.contains(name)),
                "{name} should be named in the error"
            );
        }
    }

    #[test]
    fn defaults_alerts_to_an_empty_list_when_the_tenant_does_not_publish_them() {
        let mut older = snapshot();
        older.as_object_mut().expect("object").remove("alerts");
        let projected = project("virya", &older).expect("a snapshot without alerts still projects");
        assert_eq!(projected["alerts"], json!([]));
    }

    #[test]
    fn defaults_dead_push_to_an_empty_list_when_the_tenant_does_not_publish_them() {
        let mut older = snapshot();
        older.as_object_mut().expect("object").remove("dead_push");
        let projected =
            project("virya", &older).expect("a snapshot without dead_push still projects");
        assert_eq!(projected["dead_push"], json!([]));
    }

    #[test]
    fn rejects_alerts_that_are_not_a_list() {
        let mut wrong = snapshot();
        wrong["alerts"] = json!({"not": "an array"});
        let error = project("virya", &wrong).expect_err("a non-array alert section must fail");
        assert!(matches!(&error, ApiError::Unavailable(message) if message.contains("alerts")));
    }

    #[test]
    fn rejects_a_section_of_the_wrong_json_type() {
        let mut wrong = snapshot();
        wrong["dead_outbox"] = json!({"not": "an array"});
        assert!(project("virya", &wrong).is_err());

        let mut also_wrong = snapshot();
        also_wrong["summary"] = json!([]);
        assert!(project("virya", &also_wrong).is_err());
    }

    #[test]
    fn rejects_a_snapshot_that_is_not_an_object() {
        assert!(project("virya", &json!([])).is_err());
        assert!(project("virya", &json!("degraded")).is_err());
    }
}
