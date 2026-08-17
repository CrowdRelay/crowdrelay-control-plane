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
        CreateTenantRequest, DeployTenantRequest, PlanProvisioningRequest,
        ProvisioningClaimRequest, ProvisioningFailureRequest, ProvisioningLeaseRequest,
        ProvisioningSuccessRequest, RuntimeHealth, RuntimeReportRequest, TenantDeploymentSpec,
        UpdateBrandingRequest,
    },
    store::ProvisioningCompletion,
    validation,
};

pub fn admin_router() -> Router<AppState> {
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
        .route("/tenants/{slug}/provisioning/deploy", post(deploy_tenant))
        .route("/tenants/{slug}/provisioning", get(provisioning_jobs))
        .route(
            "/tenants/{slug}/provisioning/cancel",
            post(cancel_provisioning),
        )
        .route("/tenants/{slug}/audit", get(audit))
}

pub fn telemetry_router() -> Router<AppState> {
    Router::new().route(
        "/tenants/{slug}/runtime",
        axum::routing::put(report_runtime),
    )
}

pub fn provisioner_router() -> Router<AppState> {
    Router::new()
        .route("/provisioner/jobs/claim", post(claim_provisioning))
        .route(
            "/provisioner/jobs/{job_id}/lease",
            post(renew_provisioning_lease),
        )
        .route(
            "/provisioner/jobs/{job_id}/succeed",
            post(complete_provisioning),
        )
        .route("/provisioner/jobs/{job_id}/fail", post(fail_provisioning))
}

async fn overview(State(state): State<AppState>) -> Result<Json<serde_json::Value>, ApiError> {
    let tenants = state.store.list_tenants().await?;
    let total = tenants.len();
    let healthy = tenants
        .iter()
        .filter(|item| item.runtime_health == RuntimeHealth::Healthy)
        .count();
    let degraded = tenants
        .iter()
        .filter(|item| item.runtime_health == RuntimeHealth::Degraded)
        .count();
    let stale = tenants
        .iter()
        .filter(|item| item.runtime_health == RuntimeHealth::Stale)
        .count();
    let unknown = tenants
        .iter()
        .filter(|item| item.runtime_health == RuntimeHealth::Unknown)
        .count();
    Ok(Json(json!({
        "tenants": total,
        "healthy": healthy,
        "degraded": degraded,
        "stale": stale,
        "unknown": unknown,
        "runtimeStaleAfterSeconds": state.runtime_stale_after_seconds,
        "provisionerConfigured": state.provisioner_token_hash.is_some(),
        "provisionerDefaultImageTag": state.provisioner_default_image_tag.as_deref(),
    })))
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
    input.default_country_code = Some(validation::country_code(input.default_country_code.take())?);
    let palette = validation::palette(input.branding_palette.take())?;
    if !input.deploy_crowdrelay && input.desired_version.is_some() {
        return Err(ApiError::InvalidInput(
            "desiredVersion requires deployCrowdrelay=true".to_owned(),
        ));
    }
    let deployment = if input.deploy_crowdrelay {
        if state.provisioner_token_hash.is_none() {
            return Err(ApiError::Unavailable(
                "tenant provisioner is not configured".to_owned(),
            ));
        }
        if input.crowdrelay_base_url.is_none() || input.signal_base_url.is_none() {
            return Err(ApiError::InvalidInput(
                "crowdrelayBaseUrl and signalBaseUrl are required when deployCrowdrelay=true"
                    .to_owned(),
            ));
        }
        if input.workspace_id.is_some() {
            return Err(ApiError::InvalidInput(
                "workspaceId must be omitted when the provisioner creates a new CrowdRelay instance".to_owned(),
            ));
        }
        Some(TenantDeploymentSpec {
            desired_version: validation::deployment_version(
                input.desired_version.take(),
                state.provisioner_default_image_tag.as_deref(),
            )?,
            api_image: state.provisioner_api_image.to_string(),
            worker_image: state.provisioner_worker_image.to_string(),
        })
    } else {
        input.desired_version = None;
        None
    };
    let request_id = request_id(&headers);
    let tenant = state
        .store
        .create_tenant(
            input,
            palette,
            deployment.as_ref(),
            state.admin_actor.as_ref(),
            request_id,
        )
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
            .update_branding(
                &slug,
                palette,
                state.admin_actor.as_ref(),
                request_id(&headers)
            )
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
            .set_status(
                &slug,
                "suspended",
                state.admin_actor.as_ref(),
                request_id(&headers)
            )
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
            .set_status(
                &slug,
                "active",
                state.admin_actor.as_ref(),
                request_id(&headers)
            )
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
    let desired_version = validation::desired_version(input.desired_version)?;
    let (job, created) = state
        .store
        .plan_provisioning(
            &slug,
            desired_version,
            state.admin_actor.as_ref(),
            request_id(&headers),
        )
        .await?;
    Ok((
        if created {
            StatusCode::CREATED
        } else {
            StatusCode::OK
        },
        Json(json!(job)),
    ))
}

async fn deploy_tenant(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
    Json(input): Json<DeployTenantRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), ApiError> {
    let slug = validation::slug(&raw_slug)?;
    if state.provisioner_token_hash.is_none() {
        return Err(ApiError::Unavailable(
            "tenant provisioner is not configured".to_owned(),
        ));
    }
    let desired_version = validation::deployment_version(
        input.desired_version,
        state.provisioner_default_image_tag.as_deref(),
    )?;
    let (job, created) = state
        .store
        .request_deployment(
            &slug,
            desired_version,
            state.provisioner_api_image.as_ref(),
            state.provisioner_worker_image.as_ref(),
            state.admin_actor.as_ref(),
            request_id(&headers),
        )
        .await?;
    Ok((
        if created {
            StatusCode::CREATED
        } else {
            StatusCode::OK
        },
        Json(json!(job)),
    ))
}

async fn provisioning_jobs(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    Ok(Json(
        json!({"items": state.store.provisioning_jobs(&slug, 20).await?}),
    ))
}

async fn cancel_provisioning(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    Ok(Json(json!(
        state
            .store
            .cancel_provisioning(&slug, state.admin_actor.as_ref(), request_id(&headers))
            .await?
    )))
}

async fn claim_provisioning(
    State(state): State<AppState>,
    Json(input): Json<ProvisioningClaimRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let worker_id = validation::worker_id(&input.worker_id)?;
    let claim = state
        .store
        .claim_provisioning(
            &worker_id,
            state.provisioner_lease_seconds,
            state.provisioner_actor.as_ref(),
        )
        .await?;
    Ok(Json(json!({"claim": claim})))
}

async fn renew_provisioning_lease(
    State(state): State<AppState>,
    Path(job_id): Path<uuid::Uuid>,
    Json(input): Json<ProvisioningLeaseRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let worker_id = validation::worker_id(&input.worker_id)?;
    let claim_token = validation::claim_token(&input.claim_token)?;
    Ok(Json(json!(
        state
            .store
            .renew_provisioning_lease(
                job_id,
                &worker_id,
                claim_token,
                state.provisioner_lease_seconds
            )
            .await?
    )))
}

async fn complete_provisioning(
    State(state): State<AppState>,
    Path(job_id): Path<uuid::Uuid>,
    Json(input): Json<ProvisioningSuccessRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let worker_id = validation::worker_id(&input.worker_id)?;
    let claim_token = validation::claim_token(&input.claim_token)?;
    validation::provision_success(input.api_port, input.schema_version, &input.deployed_sha)?;
    Ok(Json(json!(
        state
            .store
            .complete_provisioning(
                job_id,
                &worker_id,
                claim_token,
                ProvisioningCompletion {
                    api_port: input.api_port,
                    workspace_id: input.workspace_id,
                    schema_version: input.schema_version,
                    deployed_sha: &input.deployed_sha,
                },
                state.provisioner_actor.as_ref(),
            )
            .await?
    )))
}

async fn fail_provisioning(
    State(state): State<AppState>,
    Path(job_id): Path<uuid::Uuid>,
    Json(input): Json<ProvisioningFailureRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let worker_id = validation::worker_id(&input.worker_id)?;
    let claim_token = validation::claim_token(&input.claim_token)?;
    let (error_code, error_detail) =
        validation::provision_failure(&input.error_code, input.error_detail.as_deref())?;
    Ok(Json(json!(
        state
            .store
            .fail_provisioning(
                job_id,
                &worker_id,
                claim_token,
                &error_code,
                error_detail.as_deref(),
                state.provisioner_actor.as_ref(),
            )
            .await?
    )))
}

async fn report_runtime(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
    Json(input): Json<RuntimeReportRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    validation::runtime_report(&input)?;
    Ok(Json(json!(
        state
            .store
            .report_runtime(
                &slug,
                input,
                state.telemetry_actor.as_ref(),
                request_id(&headers)
            )
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
