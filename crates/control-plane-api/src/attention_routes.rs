//! Aggregated, read-only operator-attention snapshot.
//!
//! The browser polls one endpoint instead of five independent Control Plane
//! routes. CrowdRelay remains canonical for every constituent read model.

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

async fn attention(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let tenant_id = tenant.tenant.id;
    let correlation_id = correlation(&headers);
    let client = &state.area_client;

    let (summary, dead_outbox, dead_deliveries, ecosystem, findings) = tokio::try_join!(
        client.request_management(
            tenant_id,
            &target,
            ManagementRequest {
                method: "GET",
                path: "/v1/control-plane/ops/summary",
                body: None,
                correlation_id,
                idempotency_key: None,
            },
        ),
        client.request_management(
            tenant_id,
            &target,
            ManagementRequest {
                method: "GET",
                path: "/v1/control-plane/ops/outbox?status=dead&limit=50",
                body: None,
                correlation_id,
                idempotency_key: None,
            },
        ),
        client.request_management(
            tenant_id,
            &target,
            ManagementRequest {
                method: "GET",
                path: "/v1/control-plane/ops/deliveries?status=dead&limit=50",
                body: None,
                correlation_id,
                idempotency_key: None,
            },
        ),
        client.request_management(
            tenant_id,
            &target,
            ManagementRequest {
                method: "GET",
                path: "/v1/control-plane/ecosystem/overview",
                body: None,
                correlation_id,
                idempotency_key: None,
            },
        ),
        client.request_management(
            tenant_id,
            &target,
            ManagementRequest {
                method: "GET",
                path: "/v1/control-plane/ecosystem/findings?limit=50&open_only=true",
                body: None,
                correlation_id,
                idempotency_key: None,
            },
        ),
    )?;

    expect_object(&summary, "summary")?;
    expect_array(&dead_outbox, "dead outbox")?;
    expect_array(&dead_deliveries, "dead deliveries")?;
    expect_object(&ecosystem, "ecosystem")?;
    expect_array(&findings, "findings")?;

    Ok((
        StatusCode::OK,
        [(CACHE_CONTROL, PRIVATE_NO_STORE)],
        Json(json!({
            "summary": summary,
            "dead_outbox": dead_outbox,
            "dead_deliveries": dead_deliveries,
            "ecosystem": ecosystem,
            "findings": findings,
        })),
    )
        .into_response())
}
