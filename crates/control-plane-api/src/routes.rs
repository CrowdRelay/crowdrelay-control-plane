use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::json;

use crate::{
    AppState,
    error::ApiError,
    model::{
        CreateTenantRequest, PlanProvisioningRequest, RuntimeReportRequest, UpdateBrandingRequest,
    },
    validation,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/overview", get(overview))
        .route("/tenants", get(list_tenants).post(create_tenant))
        .route("/tenants/{slug}", get(get_tenant))
        .route(
            "/tenants/{slug}/branding",
            axum::routing::patch(update_branding),
        )
        .route("/tenants/{slug}/suspend", post(suspend_tenant))
        .route("/tenants/{slug}/resume", post(resume_tenant))
        .route("/tenants/{slug}/provisioning/plan", post(plan_provisioning))
        .route("/tenants/{slug}/audit", get(audit))
        .route(
            "/tenants/{slug}/runtime",
            axum::routing::put(report_runtime),
        )
}

async fn overview(State(state): State<AppState>) -> Result<Json<serde_json::Value>, ApiError> {
    let tenants = state.store.list_tenants().await?;
    let total = tenants.len();
    let healthy = tenants
        .iter()
        .filter(|item| {
            item.runtime
                .as_ref()
                .is_some_and(|r| r.api_healthy == Some(true) && r.worker_healthy == Some(true))
        })
        .count();
    let degraded = tenants
        .iter()
        .filter(|item| {
            item.runtime
                .as_ref()
                .is_some_and(|r| r.api_healthy == Some(false) || r.worker_healthy == Some(false))
        })
        .count();
    Ok(Json(
        json!({"tenants": total, "healthy": healthy, "degraded": degraded}),
    ))
}

async fn list_tenants(State(state): State<AppState>) -> Result<Json<serde_json::Value>, ApiError> {
    Ok(Json(json!({"items": state.store.list_tenants().await?})))
}

async fn get_tenant(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    Ok(Json(json!(state.store.tenant_by_slug(&slug).await?)))
}

async fn create_tenant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(mut input): Json<CreateTenantRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), ApiError> {
    input.slug = validation::slug(&input.slug)?;
    input.display_name = validation::display_name(&input.display_name)?;
    input.crowdrelay_base_url = validation::base_url(input.crowdrelay_base_url)?;
    input.signal_base_url = validation::base_url(input.signal_base_url)?;
    let palette = validation::palette(input.branding_palette.take())?;
    let request_id = request_id(&headers);
    let tenant = state
        .store
        .create_tenant(input, palette, &state.admin_actor, request_id)
        .await?;
    Ok((StatusCode::CREATED, Json(json!(tenant))))
}

async fn update_branding(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
    Json(input): Json<UpdateBrandingRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let palette = validation::palette(input.branding_palette)?;
    Ok(Json(json!(
        state
            .store
            .update_branding(&slug, palette, &state.admin_actor, request_id(&headers))
            .await?
    )))
}

async fn suspend_tenant(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    Ok(Json(json!(
        state
            .store
            .set_status(&slug, "suspended", &state.admin_actor, request_id(&headers))
            .await?
    )))
}

async fn resume_tenant(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    Ok(Json(json!(
        state
            .store
            .set_status(&slug, "active", &state.admin_actor, request_id(&headers))
            .await?
    )))
}

async fn plan_provisioning(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
    Json(input): Json<PlanProvisioningRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let job = state
        .store
        .plan_provisioning(
            &slug,
            input.desired_version,
            &state.admin_actor,
            request_id(&headers),
        )
        .await?;
    Ok((StatusCode::CREATED, Json(json!(job))))
}

async fn report_runtime(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
    Json(input): Json<RuntimeReportRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    Ok(Json(json!(
        state
            .store
            .report_runtime(&slug, input, &state.admin_actor, request_id(&headers))
            .await?
    )))
}

#[derive(Deserialize)]
struct AuditQuery {
    limit: Option<i64>,
}
async fn audit(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    Query(query): Query<AuditQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    Ok(Json(
        json!({"items": state.store.audit_for_tenant(&slug, limit).await?}),
    ))
}

fn request_id(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .filter(|value| value.len() <= 128)
}
