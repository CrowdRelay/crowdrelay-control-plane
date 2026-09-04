use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    AppState,
    auth::{self, Identity},
    error::ApiError,
    model::{
        CreateTenantRequest, DeployTenantRequest, InitialOperator, PlanProvisioningRequest,
        ProvisioningClaimRequest, ProvisioningFailureRequest, ProvisioningLeaseRequest,
        ProvisioningSuccessRequest, RuntimeHealth, RuntimeReportRequest, TenantDeploymentSpec,
        UpdateBrandingRequest, UpdateMobileAppsRequest, UpdateRegionalProfileRequest,
    },
    store::{self, ProvisioningCompletion},
    validation,
};

pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route("/overview", get(overview))
        .route("/tenants", get(list_tenants).post(create_tenant))
        .route("/tenants/{slug}", get(get_tenant).delete(remove_tenant))
        .route(
            "/tenants/{slug}/branding",
            axum::routing::patch(update_branding),
        )
        .route(
            "/tenants/{slug}/regional-profile",
            axum::routing::patch(update_regional_profile),
        )
        .route(
            "/tenants/{slug}/mobile-apps",
            axum::routing::patch(update_mobile_apps),
        )
        .route("/tenants/{slug}/suspend", post(suspend_tenant))
        .route("/tenants/{slug}/resume", post(resume_tenant))
        .route("/tenants/{slug}/opt-out", post(opt_out_tenant))
        .route("/tenants/{slug}/provisioning/plan", post(plan_provisioning))
        .route("/tenants/{slug}/provisioning/deploy", post(deploy_tenant))
        .route("/tenants/{slug}/provisioning", get(provisioning_jobs))
        .route(
            "/tenants/{slug}/provisioning/cancel",
            post(cancel_provisioning),
        )
        .route("/tenants/{slug}/audit", get(audit))
}

/// Named operator account management. Platform admins only — a tenant
/// operator can never mint accounts.
pub fn operator_admin_router() -> Router<AppState> {
    use axum::middleware;
    Router::new()
        .route(
            "/tenants/{slug}/operators",
            get(list_operators).post(create_operator),
        )
        .route(
            "/tenants/{slug}/operators/{account_id}",
            axum::routing::delete(delete_operator),
        )
        .route_layer(middleware::from_fn(auth::require_platform_admin))
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

async fn overview(
    State(state): State<AppState>,
    Extension(identity): Extension<Arc<Identity>>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tenants = state.store.list_tenants().await?;
    if let Some(scope) = identity.tenant_scope() {
        tenants.retain(|item| item.tenant.id == scope);
    }
    let total = tenants.len();
    let (mut healthy, mut degraded, mut stale, mut unknown) = (0usize, 0, 0, 0);
    for item in &tenants {
        match item.runtime_health {
            RuntimeHealth::Healthy => healthy += 1,
            RuntimeHealth::Degraded => degraded += 1,
            RuntimeHealth::Stale => stale += 1,
            RuntimeHealth::Unknown => unknown += 1,
        }
    }
    let platform_health = state.store.list_platform_health().await?;
    Ok(Json(json!({
        "tenants": total,
        "healthy": healthy,
        "degraded": degraded,
        "stale": stale,
        "unknown": unknown,
        "runtimeStaleAfterSeconds": state.runtime_stale_after_seconds,
        "provisionerConfigured": state.provisioner_token_hash.is_some(),
        "provisionerDefaultImageTag": state.provisioner_default_image_tag.as_deref(),
        "platformHealth": platform_health,
    })))
}

async fn list_tenants(
    State(state): State<AppState>,
    Extension(identity): Extension<Arc<Identity>>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tenants = state.store.list_tenants().await?;
    if let Some(scope) = identity.tenant_scope() {
        tenants.retain(|item| item.tenant.id == scope);
    }
    Ok(Json(json!({"items": tenants})))
}

async fn get_tenant(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    Extension(identity): Extension<Arc<Identity>>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let tenant = resolve_scoped_tenant(&state, &identity, &raw_slug).await?;
    Ok(Json(json!(tenant)))
}

/// Unregisters a tenant from the control plane.
///
/// Platform admins only, and explicitly not `resolve_scoped_tenant`: that guard
/// lets a tenant operator act on their own tenant, which is exactly the caller
/// who must never reach this. Removal is a platform decision about a tenant,
/// not a tenant's decision about itself.
///
/// The body has to repeat the slug. That is not ceremony — the tenant list
/// holds live production systems next to each other, so the operator names the
/// one they mean instead of confirming whatever row the click landed on.
async fn remove_tenant(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    Extension(identity): Extension<Arc<Identity>>,
    headers: HeaderMap,
    Json(body): Json<RemoveTenantRequest>,
) -> Result<StatusCode, ApiError> {
    identity.require_platform_admin()?;
    let slug = validation::slug(&raw_slug)?;
    state
        .store
        .delete_tenant(
            &slug,
            body.confirm_slug.trim(),
            state.admin_actor.as_ref(),
            request_id(&headers),
        )
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoveTenantRequest {
    confirm_slug: String,
}

/// A tenant operator can request to opt out of the platform. This does NOT
/// remove the tenant — it records the request in the audit trail so the crew
/// knows to act on it. The actual removal stays admin-only.
///
/// Virya is excluded: that tenant is externally owned and cannot opt out.
async fn opt_out_tenant(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    Extension(identity): Extension<Arc<Identity>>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let tenant = resolve_scoped_tenant(&state, &identity, &raw_slug).await?;
    if crate::store::tenant_lifecycle_is_externally_owned(&tenant.tenant.slug) {
        return Err(ApiError::Forbidden("this tenant cannot opt out".to_owned()));
    }
    state
        .store
        .audit_control_command(crate::store::ControlCommandAudit {
            tenant_id: tenant.tenant.id,
            actor: &identity.audit_actor(),
            action: "tenant.opt_out_requested",
            target_kind: "tenant",
            target_id: tenant.tenant.slug.clone(),
            request_id: request_id(&headers),
            outcome: "requested",
        })
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Shared guard for tenant-scoped reads and operator-allowed mutations:
/// resolves the slug, then enforces the caller's scope.
async fn resolve_scoped_tenant(
    state: &AppState,
    identity: &Identity,
    raw_slug: &str,
) -> Result<crate::model::TenantSummary, ApiError> {
    let slug = validation::slug(raw_slug)?;
    let tenant = state.store.tenant_by_slug(&slug).await?;
    identity.ensure_tenant(tenant.tenant.id)?;
    Ok(tenant)
}

async fn create_tenant(
    State(state): State<AppState>,
    Extension(identity): Extension<Arc<Identity>>,
    headers: HeaderMap,
    Json(mut input): Json<CreateTenantRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), ApiError> {
    identity.require_platform_admin()?;
    input.slug = validation::slug(&input.slug)?;
    input.display_name = validation::display_name(&input.display_name)?;
    input.crowdrelay_base_url = validation::base_url(input.crowdrelay_base_url)?;
    input.signal_base_url = validation::base_url(input.signal_base_url)?;
    input.regional_profile = validation::regional_profile(input.regional_profile)?;
    if let Some(raw_country) = input.default_country_code.take() {
        let compatibility_country = validation::country_code(Some(raw_country))?;
        if compatibility_country != input.regional_profile.country_code {
            return Err(ApiError::InvalidInput(
                "defaultCountryCode must match regionalProfile.countryCode".to_owned(),
            ));
        }
    }
    input.default_country_code = Some(input.regional_profile.country_code.clone());
    input.synesthesia_enabled =
        validation::synesthesia_opt_in(input.synesthesia_enabled, &input.slug)?;
    input.north_star_metric = Some(validation::north_star_metric(
        input.north_star_metric.take(),
        input.signal_enabled,
    )?);
    input.fanbase_sources =
        validation::fanbase_sources(std::mem::take(&mut input.fanbase_sources))?;
    input.signal_play_store_url = validation::play_store_url(input.signal_play_store_url.take())?;
    input.synesthesia_play_store_url =
        validation::play_store_url(input.synesthesia_play_store_url.take())?;
    if !input.signal_enabled && input.signal_base_url.is_some() {
        return Err(ApiError::InvalidInput(
            "signalBaseUrl requires signalEnabled=true".to_owned(),
        ));
    }
    let palette = validation::palette(input.branding_palette.take())?;
    // Hash before the transaction: the KDF must never run while row locks
    // are held.
    let initial_operator = match input.initial_operator.take() {
        Some(request) => Some(InitialOperator {
            username: validation::username(&request.username)?,
            password_hash: auth::hash_password(&validation::password(&request.password)?)?,
        }),
        None => None,
    };
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
        if input.crowdrelay_base_url.is_none() {
            return Err(ApiError::InvalidInput(
                "crowdrelayBaseUrl is required when deployCrowdrelay=true".to_owned(),
            ));
        }
        // Signal base URL is optional — Signal is an add-on product.
        // If absent, the provisioner deploys CrowdRelay without a public site.
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
            initial_operator.as_ref(),
            state.admin_actor.as_ref(),
            request_id,
        )
        .await?;
    Ok((StatusCode::CREATED, Json(json!(tenant))))
}

async fn update_branding(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    Extension(identity): Extension<Arc<Identity>>,
    headers: HeaderMap,
    Json(input): Json<UpdateBrandingRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    identity.require_platform_admin()?;
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

async fn update_regional_profile(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    Extension(identity): Extension<Arc<Identity>>,
    headers: HeaderMap,
    Json(input): Json<UpdateRegionalProfileRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    identity.require_platform_admin()?;
    let slug = validation::slug(&raw_slug)?;
    let profile = validation::regional_profile(input.regional_profile)?;
    Ok(Json(json!(
        state
            .store
            .update_regional_profile(
                &slug,
                profile,
                state.admin_actor.as_ref(),
                request_id(&headers),
            )
            .await?
    )))
}

async fn update_mobile_apps(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    Extension(identity): Extension<Arc<Identity>>,
    headers: HeaderMap,
    Json(input): Json<UpdateMobileAppsRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    identity.require_platform_admin()?;
    let slug = validation::slug(&raw_slug)?;
    let signal_url = validation::play_store_url(input.signal_play_store_url)?;
    let synesthesia_url = validation::play_store_url(input.synesthesia_play_store_url)?;
    Ok(Json(json!(
        state
            .store
            .update_mobile_apps(
                &slug,
                signal_url,
                synesthesia_url,
                state.admin_actor.as_ref(),
                request_id(&headers),
            )
            .await?
    )))
}

async fn suspend_tenant(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    Extension(identity): Extension<Arc<Identity>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    identity.require_platform_admin()?;
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
    Extension(identity): Extension<Arc<Identity>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    identity.require_platform_admin()?;
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
    Extension(identity): Extension<Arc<Identity>>,
    headers: HeaderMap,
    Json(input): Json<PlanProvisioningRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), ApiError> {
    let tenant = resolve_scoped_tenant(&state, &identity, &raw_slug).await?;
    let desired_version = validation::deployment_version(
        input.desired_version,
        state.provisioner_default_image_tag.as_deref(),
    )?;
    let actor = identity.audit_actor();
    let (job, created) = state
        .store
        .plan_provisioning(
            &tenant.tenant.slug,
            Some(desired_version),
            &actor,
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
    Extension(identity): Extension<Arc<Identity>>,
    headers: HeaderMap,
    Json(input): Json<DeployTenantRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), ApiError> {
    // This is the operator-facing "redeploy" primitive: a scoped tenant
    // operator may re-deploy their own app; the provisioner still owns every
    // Docker step behind its leased job.
    let tenant = resolve_scoped_tenant(&state, &identity, &raw_slug).await?;

    // Virya (and any externally-owned tenant) is not provisioned by the
    // tenant agent — it runs on the pre-existing production deployment.
    // Trigger the ecosystem-deploy GitHub Actions workflow instead of the
    // provisioner path. The workflow SSHes to the production host and runs
    // the blue-green deploy with rollback.
    if store::tenant_lifecycle_is_externally_owned(&tenant.tenant.slug) {
        return trigger_ecosystem_deploy(&state, &identity, &tenant.tenant.slug).await;
    }

    if state.provisioner_token_hash.is_none() {
        return Err(ApiError::Unavailable(
            "tenant provisioner is not configured".to_owned(),
        ));
    }
    let desired_version = validation::deployment_version(
        input.desired_version,
        state.provisioner_default_image_tag.as_deref(),
    )?;
    let actor = identity.audit_actor();
    let (job, created) = state
        .store
        .request_deployment(
            &tenant.tenant.slug,
            desired_version,
            state.provisioner_api_image.as_ref(),
            state.provisioner_worker_image.as_ref(),
            &actor,
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

/// Triggers the `ecosystem-deploy.yml` GitHub Actions workflow for
/// externally-owned tenants. Returns a synthetic job-like response so the
/// frontend's existing deploy flow (which expects a ProvisioningJob shape)
/// doesn't need a separate code path.
async fn trigger_ecosystem_deploy(
    state: &AppState,
    identity: &Identity,
    slug: &str,
) -> Result<(StatusCode, Json<serde_json::Value>), ApiError> {
    let (token, repo) = match (
        state.github_deploy_token.as_deref(),
        state.github_deploy_repo.as_deref(),
    ) {
        (Some(t), Some(r)) => (t, r),
        _ => {
            return Err(ApiError::Unavailable(
                "GitHub deploy trigger is not configured — set CONTROL_PLANE_GITHUB_DEPLOY_TOKEN and CONTROL_PLANE_GITHUB_DEPLOY_REPO".to_owned(),
            ));
        }
    };

    let url = format!(
        "https://api.github.com/repos/{repo}/actions/workflows/ecosystem-deploy.yml/dispatches"
    );
    let body = json!({
        "ref": "main",
        "inputs": {
            "target_sha": "",
        },
    });
    let response = state
        .http_client
        .post(&url)
        .header("authorization", format!("Bearer {token}"))
        .header("accept", "application/vnd.github+json")
        .header("x-github-api-version", "2022-11-28")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            tracing::error!(%e, slug, "GitHub workflow dispatch request failed");
            ApiError::Unavailable("failed to trigger ecosystem deploy".to_owned())
        })?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        tracing::error!(%status, text, slug, "GitHub workflow dispatch rejected");
        return Err(ApiError::Unavailable(format!(
            "GitHub workflow dispatch failed: {status}"
        )));
    }

    let actor = identity.audit_actor();
    tracing::info!(slug, actor = %actor, "ecosystem-deploy workflow dispatched via GitHub API");

    Ok((
        StatusCode::ACCEPTED,
        Json(json!({
            "id": format!("github-dispatch-{}", chrono::Utc::now().timestamp_millis()),
            "tenant_slug": slug,
            "status": "dispatched",
            "message": "Ecosystem deploy workflow triggered on GitHub Actions.",
            "workflow_url": format!("https://github.com/{repo}/actions/workflows/ecosystem-deploy.yml"),
            "created_at": chrono::Utc::now().to_rfc3339(),
        })),
    ))
}

async fn provisioning_jobs(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    Extension(identity): Extension<Arc<Identity>>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let tenant = resolve_scoped_tenant(&state, &identity, &raw_slug).await?;
    Ok(Json(
        json!({"items": state.store.provisioning_jobs(&tenant.tenant.slug, 20).await?}),
    ))
}

async fn cancel_provisioning(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    Extension(identity): Extension<Arc<Identity>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let tenant = resolve_scoped_tenant(&state, &identity, &raw_slug).await?;
    let actor = identity.audit_actor();
    Ok(Json(json!(
        state
            .store
            .cancel_provisioning(&tenant.tenant.slug, &actor, request_id(&headers))
            .await?
    )))
}

async fn claim_provisioning(
    State(state): State<AppState>,
    Json(input): Json<ProvisioningClaimRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let worker_id = validation::worker_id(&input.worker_id)?;
    let data_region = validation::data_region(input.data_region.as_deref())?;
    let claim = state
        .store
        .claim_provisioning(
            &worker_id,
            data_region.as_deref(),
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
    Extension(identity): Extension<Arc<Identity>>,
    Query(query): Query<AuditQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let tenant = resolve_scoped_tenant(&state, &identity, &raw_slug).await?;
    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    Ok(Json(
        json!({"items": state.store.audit_for_tenant_id(tenant.tenant.id, limit).await?}),
    ))
}

// --- Operator account management (platform admins only) ---------------------

async fn list_operators(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let tenant = state.store.tenant_by_slug(&slug).await?;
    let items = state.store.list_operator_accounts(tenant.tenant.id).await?;
    Ok(Json(json!({"items": items})))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateOperatorRequest {
    username: String,
    password: String,
}

async fn create_operator(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
    Json(input): Json<CreateOperatorRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let tenant = state.store.tenant_by_slug(&slug).await?;
    let username = validation::username(&input.username)?;
    // Hash before the transaction so the KDF never runs under row locks.
    let password_hash = auth::hash_password(&validation::password(&input.password)?)?;
    state
        .store
        .create_tenant_operator(
            tenant.tenant.id,
            &username,
            &password_hash,
            state.admin_actor.as_ref(),
            request_id(&headers),
        )
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({"username": username, "role": "tenant_operator", "active": true})),
    ))
}

async fn delete_operator(
    State(state): State<AppState>,
    Path((raw_slug, account_id)): Path<(String, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    let tenant = state.store.tenant_by_slug(&slug).await?;
    state
        .store
        .delete_operator_account(
            tenant.tenant.id,
            account_id,
            state.admin_actor.as_ref(),
            request_id(&headers),
        )
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

fn request_id(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .filter(|value| value.len() <= 128)
}
