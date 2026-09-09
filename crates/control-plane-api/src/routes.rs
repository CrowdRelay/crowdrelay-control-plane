use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};
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
    tenant_area_client::ManagementRequest,
    validation,
};

/// Platform-wide surface: no tenant in the path, so scope is enforced inside
/// each handler by filtering the result set to the caller's tenant.
pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route("/overview", get(overview))
        .route("/tenants", get(list_tenants).post(create_tenant))
        .route("/fleet/status", get(fleet_status))
}

/// Tenant-scoped admin surface.
///
/// Split out from [`admin_router`] so it can carry
/// [`auth::require_tenant_access`] path-wide. Every handler below still states
/// its own authority — `require_platform_admin` where the action belongs to
/// the platform, `resolve_scoped_tenant` where a tenant operator may act on
/// their own tenant — but the boundary no longer depends on remembering to.
/// Before this, one new `/tenants/{slug}/…` route added here without a guard
/// was a cross-tenant read, and nothing failed until someone noticed.
pub fn tenant_admin_router() -> Router<AppState> {
    Router::new()
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
        .route("/tenants/{slug}/park", post(park_tenant))
        .route("/tenants/{slug}/unpark", post(unpark_tenant))
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

/// Named operator account management. Platform-level access — a tenant
/// operator can never mint accounts. The `authenticate` middleware
/// blocks mutations for `platform_viewer`, so a viewer can list but
/// not create or delete operators.
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
        .route_layer(middleware::from_fn(auth::require_platform_level))
}

pub fn telemetry_router() -> Router<AppState> {
    Router::new().route(
        "/tenants/{slug}/runtime",
        axum::routing::put(report_runtime),
    )
}

/// Billing webhook router — authenticated via a shared secret header, not
/// the platform admin token. This lets a payment provider (or a billing
/// script) auto-unpark a tenant without holding admin credentials.
pub fn billing_router() -> Router<AppState> {
    Router::new().route("/billing/webhook", post(billing_webhook))
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

/// Fleet-wide deploy status: one row per tenant with the SHA each is running.
///
/// Platform-admin only — this is a cross-tenant view used by the local
/// `ship-fleet` orchestrator to decide canary order and verify convergence.
/// A tenant operator has no business reading another tenant's revision.
async fn fleet_status(
    State(state): State<AppState>,
    Extension(identity): Extension<Arc<Identity>>,
) -> Result<Json<serde_json::Value>, ApiError> {
    identity.require_platform_admin()?;
    let tenants = state.store.list_tenants().await?;
    let items: Vec<Value> = tenants
        .iter()
        .map(|t| {
            json!({
                "slug": t.tenant.slug,
                "displayName": t.tenant.display_name,
                "status": t.tenant.status,
                "runtimeHealth": t.runtime_health,
                "deployedSha": t.runtime.as_ref().and_then(|r| r.deployed_sha.clone()).unwrap_or_default(),
                "lastHeartbeatAt": t.runtime.as_ref().and_then(|r| r.last_heartbeat_at),
                "externallyOwned": store::tenant_lifecycle_is_externally_owned(&t.tenant.slug),
            })
        })
        .collect();
    Ok(Json(json!({"items": items})))
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
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
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
            expected_version: None,
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
            provider_keys: input.provider_keys.take(),
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
    crate::read_models::invalidate_tenant(&state.read_model_cache, &tenant.tenant.slug).await;
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
    let result = json!(
        state
            .store
            .update_branding(
                &slug,
                palette,
                state.admin_actor.as_ref(),
                request_id(&headers)
            )
            .await?
    );
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    Ok(Json(result))
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
    let result = json!(
        state
            .store
            .update_regional_profile(
                &slug,
                profile,
                state.admin_actor.as_ref(),
                request_id(&headers),
            )
            .await?
    );
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    Ok(Json(result))
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
    let result = json!(
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
    );
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    Ok(Json(result))
}

async fn suspend_tenant(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    Extension(identity): Extension<Arc<Identity>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    identity.require_platform_admin()?;
    let slug = validation::slug(&raw_slug)?;
    let result = json!(
        state
            .store
            .set_status(
                &slug,
                "suspended",
                state.admin_actor.as_ref(),
                request_id(&headers)
            )
            .await?
    );
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    Ok(Json(result))
}

async fn resume_tenant(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    Extension(identity): Extension<Arc<Identity>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    identity.require_platform_admin()?;
    let slug = validation::slug(&raw_slug)?;
    let result = json!(
        state
            .store
            .set_status(
                &slug,
                "active",
                state.admin_actor.as_ref(),
                request_id(&headers)
            )
            .await?
    );
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    Ok(Json(result))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParkTenantRequest {
    reason: Option<String>,
}

/// Parks a tenant: stops the autopilot brain from producing new tasks while
/// preserving all data and configuration. The current envelope and posture
/// are snapshotted so resume restores the exact operating state.
///
/// Virya is exempt (externally owned). The tenant must be `active` to park.
async fn park_tenant(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    Extension(identity): Extension<Arc<Identity>>,
    headers: HeaderMap,
    Json(input): Json<ParkTenantRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    identity.require_platform_admin()?;
    let slug = validation::slug(&raw_slug)?;
    let tenant = state.store.tenant_by_slug(&slug).await?;
    if store::tenant_lifecycle_is_externally_owned(&tenant.tenant.slug) {
        return Err(ApiError::Forbidden(
            "this tenant is externally owned and cannot be parked".to_owned(),
        ));
    }
    if tenant.tenant.status != "active" {
        return Err(ApiError::Conflict(
            "tenant must be active to park".to_owned(),
        ));
    }
    // Resolve the CrowdRelay management target while the tenant is still
    // active — `target` rejects parked/suspended tenants.
    let (tenant, target_url) = crate::area_routes::target(&state, &slug).await?;
    let tenant_id = tenant.tenant.id;
    let actor = state.admin_actor.as_ref();
    let reason = input
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|r| !r.is_empty())
        .map(str::to_owned);

    // 1. Read the current envelope and posture from CrowdRelay.
    let envelope_value = state
        .area_client
        .request_management(
            tenant_id,
            &target_url,
            ManagementRequest {
                method: "GET",
                path: "/v1/control-plane/autopilot/growth-envelope",
                body: None,
                correlation_id: request_id(&headers),
                idempotency_key: None,
            },
        )
        .await
        .map_err(|e| ApiError::Unavailable(format!("failed to read growth envelope: {e}")))?;

    let posture_value = state
        .area_client
        .request_management(
            tenant_id,
            &target_url,
            ManagementRequest {
                method: "GET",
                path: "/v1/control-plane/autopilot/posture",
                body: None,
                correlation_id: request_id(&headers),
                idempotency_key: None,
            },
        )
        .await
        .map_err(|e| ApiError::Unavailable(format!("failed to read posture: {e}")))?;

    let agent_enabled = envelope_value
        .get("agentEnabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let dry_run = envelope_value
        .get("dryRun")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let envelope_version = envelope_value
        .get("version")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let weekly_owned = envelope_value
        .get("weeklyOwnedAudienceTouches")
        .and_then(Value::as_u64)
        .unwrap_or(200) as i32;
    let weekly_third_party = envelope_value
        .get("weeklyThirdPartyTouches")
        .and_then(Value::as_u64)
        .unwrap_or(10) as i32;
    let cooldown_hours = envelope_value
        .get("subjectCooldownHours")
        .and_then(Value::as_u64)
        .unwrap_or(168) as i32;
    let max_recipients = envelope_value
        .get("maxRecipientsPerStep")
        .and_then(Value::as_u64)
        .unwrap_or(250) as i32;
    let posture = posture_value
        .get("posture")
        .and_then(Value::as_str)
        .unwrap_or("grounded")
        .to_owned();
    let posture_version = posture_value
        .get("expected_version")
        .and_then(Value::as_i64)
        .unwrap_or(1);

    // 2. Save the snapshot with the full envelope state.
    state
        .store
        .save_park_snapshot(
            tenant_id,
            actor,
            agent_enabled,
            dry_run,
            &posture,
            envelope_version,
            weekly_owned,
            weekly_third_party,
            cooldown_hours,
            max_recipients,
            posture_version,
            reason.as_deref(),
        )
        .await?;

    // 3. Stop the brain: set agent_enabled=false and parked=true.
    // CrowdRelay's GrowthEnvelopeRequest uses snake_case with deny_unknown_fields.
    let park_body = json!({
        "agent_enabled": false,
        "dry_run": dry_run,
        "weekly_owned_audience_touches": weekly_owned,
        "weekly_third_party_touches": weekly_third_party,
        "subject_cooldown_hours": cooldown_hours,
        "max_recipients_per_step": max_recipients,
        "parked": true,
        "expected_version": envelope_version,
    });
    let idempotency = format!("park-{}", Uuid::new_v4());
    state
        .area_client
        .request_management(
            tenant_id,
            &target_url,
            ManagementRequest {
                method: "POST",
                path: "/v1/control-plane/autopilot/growth-envelope",
                body: Some(&park_body),
                correlation_id: request_id(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await
        .map_err(|e| ApiError::Unavailable(format!("failed to park growth envelope: {e}")))?;

    // 4. Set status to parked.
    let result = state
        .store
        .set_status(&slug, "parked", actor, request_id(&headers))
        .await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    Ok(Json(json!(result)))
}

/// Unparks a tenant: restores the autopilot envelope and posture from the
/// snapshot and sets status back to active. A single button — no
/// confirmation, no extra steps.
async fn unpark_tenant(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    Extension(identity): Extension<Arc<Identity>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    identity.require_platform_admin()?;
    let slug = validation::slug(&raw_slug)?;
    let tenant = state.store.tenant_by_slug(&slug).await?;
    if store::tenant_lifecycle_is_externally_owned(&tenant.tenant.slug) {
        return Err(ApiError::Forbidden(
            "this tenant is externally owned and cannot be unparked".to_owned(),
        ));
    }
    if tenant.tenant.status != "parked" {
        return Err(ApiError::Conflict("tenant is not parked".to_owned()));
    }
    let tenant_id = tenant.tenant.id;
    let actor = state.admin_actor.as_ref();

    // Load the snapshot before changing status.
    let snapshot = state
        .store
        .load_park_snapshot(tenant_id)
        .await?
        .ok_or_else(|| ApiError::Conflict("no park snapshot found".to_owned()))?;

    // Set status to active first so `target` resolves.
    state
        .store
        .set_status(&slug, "active", actor, request_id(&headers))
        .await?;

    // Resolve the management target (tenant is now active).
    let (_, target_url) = crate::area_routes::target(&state, &slug).await?;

    // Restore the envelope from the snapshot. CrowdRelay's
    // GrowthEnvelopeRequest uses snake_case with deny_unknown_fields.
    let restore_body = json!({
        "agent_enabled": snapshot.agent_enabled,
        "dry_run": snapshot.dry_run,
        "weekly_owned_audience_touches": snapshot.weekly_owned_audience_touches,
        "weekly_third_party_touches": snapshot.weekly_third_party_touches,
        "subject_cooldown_hours": snapshot.subject_cooldown_hours,
        "max_recipients_per_step": snapshot.max_recipients_per_step,
        "parked": false,
        "expected_version": snapshot.envelope_version + 1,
    });
    let idempotency = format!("unpark-{}", Uuid::new_v4());
    if let Err(e) = state
        .area_client
        .request_management(
            tenant_id,
            &target_url,
            ManagementRequest {
                method: "POST",
                path: "/v1/control-plane/autopilot/growth-envelope",
                body: Some(&restore_body),
                correlation_id: request_id(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await
    {
        // Restore failed — roll back the CP status to parked so the
        // snapshot is not lost and the operator can retry. Await the
        // rollback inline so the tenant is never left in an inconsistent
        // state if the rollback itself fails.
        if let Err(rb) = state.store.set_status(&slug, "parked", actor, None).await {
            tracing::error!(error = %rb, slug = %slug, "failed to roll back to parked after restore failure");
        }
        return Err(ApiError::Unavailable(format!(
            "failed to restore growth envelope: {e}"
        )));
    }

    // Restore the posture. The posture was not changed by parking, so this
    // is a belt-and-suspenders restore. Use the captured posture_version.
    let posture_body = json!({
        "posture": snapshot.posture,
        "expected_version": snapshot.posture_version,
    });
    let posture_idempotency = format!("unpark-posture-{}", Uuid::new_v4());
    let posture_result = state
        .area_client
        .request_management(
            tenant_id,
            &target_url,
            ManagementRequest {
                method: "POST",
                path: "/v1/control-plane/autopilot/posture",
                body: Some(&posture_body),
                correlation_id: request_id(&headers),
                idempotency_key: Some(&posture_idempotency),
            },
        )
        .await;
    if let Err(e) = &posture_result {
        tracing::warn!(error = %e, slug = %slug, "posture restore failed during unpark — envelope was restored");
    }

    // Consume the snapshot only after a successful envelope restore.
    state.store.consume_park_snapshot(tenant_id, actor).await?;

    let result = state.store.tenant_by_slug(&slug).await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    Ok(Json(json!(result)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BillingWebhookRequest {
    tenant_slug: String,
    event: String,
}

/// Billing webhook: a payment provider calls this to auto-unpark a tenant
/// when payment is received. Authenticated via a shared secret header
/// (`X-Billing-Webhook-Secret`), not the platform admin token.
///
/// Idempotent: if the tenant is already active, returns 204 without doing
/// anything. If the CrowdRelay restore fails, returns 503 and rolls back
/// the CP status so the snapshot is preserved for retry.
async fn billing_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<BillingWebhookRequest>,
) -> Result<StatusCode, ApiError> {
    let secret = state
        .billing_webhook_secret
        .as_deref()
        .ok_or_else(|| ApiError::Unavailable("billing webhook is not configured".to_owned()))?;
    let provided = headers
        .get("x-billing-webhook-secret")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    // Constant-time comparison to prevent timing side-channels on the
    // webhook secret. A plain `!=` short-circuits on the first differing
    // byte, leaking the secret length and prefix over many requests.
    use subtle::ConstantTimeEq;
    let provided_bytes = provided.as_bytes();
    let secret_bytes = secret.as_bytes();
    let ok =
        provided_bytes.len() == secret_bytes.len() && provided_bytes.ct_eq(secret_bytes).into();
    if !ok {
        return Err(ApiError::Unauthorized);
    }
    if input.event != "payment_succeeded" {
        return Ok(StatusCode::NO_CONTENT);
    }
    let slug = validation::slug(&input.tenant_slug)?;
    let tenant = state.store.tenant_by_slug(&slug).await?;
    // Idempotent: already active is a no-op.
    if tenant.tenant.status != "parked" {
        return Ok(StatusCode::NO_CONTENT);
    }
    let tenant_id = tenant.tenant.id;
    let actor = "billing-webhook";
    let snapshot = state
        .store
        .load_park_snapshot(tenant_id)
        .await?
        .ok_or_else(|| ApiError::Conflict("no park snapshot found".to_owned()))?;
    state
        .store
        .set_status(&slug, "active", actor, request_id(&headers))
        .await?;
    let (_, target_url) = crate::area_routes::target(&state, &slug).await?;
    let restore_body = json!({
        "agent_enabled": snapshot.agent_enabled,
        "dry_run": snapshot.dry_run,
        "weekly_owned_audience_touches": snapshot.weekly_owned_audience_touches,
        "weekly_third_party_touches": snapshot.weekly_third_party_touches,
        "subject_cooldown_hours": snapshot.subject_cooldown_hours,
        "max_recipients_per_step": snapshot.max_recipients_per_step,
        "parked": false,
        "expected_version": snapshot.envelope_version + 1,
    });
    let idempotency = format!("billing-unpark-{}", Uuid::new_v4());
    let envelope_result = state
        .area_client
        .request_management(
            tenant_id,
            &target_url,
            ManagementRequest {
                method: "POST",
                path: "/v1/control-plane/autopilot/growth-envelope",
                body: Some(&restore_body),
                correlation_id: request_id(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    if let Err(e) = envelope_result {
        // Restore failed — roll back to parked so the snapshot survives.
        // Await the rollback inline so the tenant is never left in an
        // inconsistent state if the rollback itself fails (matching the
        // unpark_tenant path's approach).
        if let Err(rb) = state
            .store
            .set_status(&slug, "parked", "billing-webhook", None)
            .await
        {
            tracing::error!(error = %rb, slug = %slug, "failed to roll back to parked after billing restore failure");
        }
        return Err(ApiError::Unavailable(format!(
            "failed to restore growth envelope: {e}"
        )));
    }
    // Restore the posture (belt-and-suspenders; parking does not change it).
    let posture_body = json!({
        "posture": snapshot.posture,
        "expected_version": snapshot.posture_version,
    });
    let posture_idempotency = format!("billing-unpark-posture-{}", Uuid::new_v4());
    let posture_result = state
        .area_client
        .request_management(
            tenant_id,
            &target_url,
            ManagementRequest {
                method: "POST",
                path: "/v1/control-plane/autopilot/posture",
                body: Some(&posture_body),
                correlation_id: request_id(&headers),
                idempotency_key: Some(&posture_idempotency),
            },
        )
        .await;
    if let Err(e) = &posture_result {
        tracing::warn!(error = %e, slug = %slug, "posture restore failed during billing unpark — envelope was restored");
    }
    // Consume the snapshot only after a successful envelope restore.
    state.store.consume_park_snapshot(tenant_id, actor).await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    Ok(StatusCode::OK)
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
            input.provider_keys.as_ref(),
            &actor,
            request_id(&headers),
        )
        .await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &tenant.tenant.slug).await;
    Ok((
        if created {
            StatusCode::CREATED
        } else {
            StatusCode::OK
        },
        Json(job_with_phase(&job)?),
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
    //
    // Rollback story:
    // - Externally-owned tenants (Virya): the ecosystem-deploy GitHub Actions
    //   workflow performs a blue-green deploy with automatic rollback on
    //   health-check failure. The Control Plane triggers the workflow; the
    //   workflow itself handles rollback. There is no separate "rollback"
    //   endpoint — the workflow is the rollback primitive.
    // - Provisioner-managed tenants: there is no explicit "rollback to
    //   previous version" endpoint. Rollback is achieved by requesting a new
    //   deployment with the previous SHA (which the operator can read from
    //   the runtime status or the audit log). The provisioner will provision
    //   the previous version as a new deployment, which is the honest
    //   semantic — the Control Plane does not pretend to "undo" a deploy.
    let tenant = resolve_scoped_tenant(&state, &identity, &raw_slug).await?;

    // Virya (and any externally-owned tenant) is not provisioned by the
    // tenant agent — it runs on the pre-existing production deployment.
    // Trigger the ecosystem-deploy GitHub Actions workflow instead of the
    // provisioner path. The workflow SSHes to the production host and runs
    // the blue-green deploy with rollback.
    if store::tenant_lifecycle_is_externally_owned(&tenant.tenant.slug) {
        return trigger_ecosystem_deploy(
            &state,
            &identity,
            &tenant,
            input.desired_version.as_deref(),
            request_id(&headers),
        )
        .await;
    }

    // The provisioner-managed redeploy path is too much operator access for
    // non-Virya tenants. Tenant creation still provisions internally via
    // store::create_tenant_with_deployment, but the operator-facing
    // "Redeploy app" button is removed. Only externally-owned tenants
    // (Virya) get a runtime deploy control in the panel.
    Err(ApiError::Forbidden(
        "redeploy is only available for externally-owned tenants".to_owned(),
    ))
}

/// The revision an external deploy targets.
///
/// `ecosystem-deploy.yml` takes a bare 40-character commit SHA and treats the
/// empty string as "whatever `main` points at now". The operator's requested
/// revision used to be dropped on the floor here: the panel let them pick a
/// version, this function sent `target_sha: ""`, and the deploy that actually
/// ran was a different commit than the one on screen. Either the request names
/// a revision this can pass through verbatim, or it says so.
fn external_deploy_target(desired_version: Option<&str>) -> Result<String, ApiError> {
    let Some(raw) = desired_version.map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(String::new());
    };
    let sha = raw.strip_prefix("sha-").unwrap_or(raw);
    if sha.len() != 40
        || !sha
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(ApiError::InvalidInput(
            "desiredVersion must be a 40 lowercase hex commit SHA for an externally-owned tenant"
                .to_owned(),
        ));
    }
    Ok(sha.to_owned())
}

/// Triggers the `ecosystem-deploy.yml` GitHub Actions workflow for
/// externally-owned tenants. Returns a synthetic job-like response so the
/// frontend's existing deploy flow (which expects a ProvisioningJob shape)
/// doesn't need a separate code path.
///
/// This mutates a production host through a third party, so both the attempt
/// and its outcome are audited against the tenant with the caller's actor and
/// request id. Without that, the single most consequential control in the
/// panel left nothing behind but a log line.
async fn trigger_ecosystem_deploy(
    state: &AppState,
    identity: &Identity,
    tenant: &crate::model::TenantSummary,
    desired_version: Option<&str>,
    request_id: Option<&str>,
) -> Result<(StatusCode, Json<serde_json::Value>), ApiError> {
    let slug = tenant.tenant.slug.as_str();
    let actor = identity.audit_actor();
    let target_sha = external_deploy_target(desired_version)?;

    // Dispatch dedup: GitHub's workflow_dispatch is not idempotent. A duplicate
    // click within the cooldown window would trigger a second workflow run for
    // the same target. Refuse with 409 so the operator sees "you just did
    // this" rather than silently double-dispatching.
    if state.github_deploy_cooldown_seconds > 0 {
        if let Some(last) = state
            .store
            .recent_external_deploy(tenant.tenant.id, state.github_deploy_cooldown_seconds)
            .await?
        {
            return Err(ApiError::Conflict(format!(
                "a deploy dispatch was accepted {}s ago — wait for it to land or check GitHub Actions before dispatching again",
                (chrono::Utc::now() - last).num_seconds()
            )));
        }
    }

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
            "target_sha": target_sha,
        },
    });
    // What the operator asked for is recorded before the call leaves, so a
    // dispatch that succeeds upstream while this process dies still has a
    // record of who asked for what. `expectedVersion` is the raw input (what
    // the operator typed), `targetSha` is the resolved commit (what will
    // actually deploy). They differ when the operator left the field blank
    // (resolve main) or used the `sha-<hex>` panel convention.
    let requested = json!({
        "repo": repo,
        "workflow": "ecosystem-deploy.yml",
        "ref": "main",
        "expectedVersion": desired_version.map(|v| Value::String(v.to_owned())).unwrap_or(Value::Null),
        // Empty means the workflow resolves `main` itself; name that
        // explicitly rather than logging a blank field.
        "targetSha": if target_sha.is_empty() { Value::Null } else { Value::String(target_sha.clone()) },
    });
    state
        .store
        .audit_external_deploy(
            tenant.tenant.id,
            slug,
            &actor,
            request_id,
            "requested",
            requested.clone(),
        )
        .await?;

    let response = state
        .http_client
        .post(&url)
        .header("authorization", format!("Bearer {token}"))
        .header("accept", "application/vnd.github+json")
        .header("x-github-api-version", "2022-11-28")
        .json(&body)
        .send()
        .await;
    let response = match response {
        Ok(response) => response,
        Err(e) => {
            // A timeout is ambiguous: GitHub may have accepted the dispatch
            // even though we did not receive the response. The honest audit
            // outcome is "unknown" (not "transport_failed"), and the error
            // variant is Timeout (not Unavailable) so the UI can distinguish
            // "we don't know if the deploy was triggered" from "the trigger
            // definitely failed". Connection failures (DNS, refused, network
            // unreachable) are deterministic — GitHub did not accept the
            // dispatch — so they stay "transport_failed" / Unreachable.
            let is_timeout = e.is_timeout();
            let outcome = if is_timeout {
                "unknown"
            } else {
                "transport_failed"
            };
            tracing::error!(%e, slug, actor = %actor, is_timeout, "GitHub workflow dispatch request failed");
            state
                .store
                .audit_external_deploy(
                    tenant.tenant.id,
                    slug,
                    &actor,
                    request_id,
                    outcome,
                    requested,
                )
                .await?;
            return Err(if is_timeout {
                ApiError::Timeout
            } else {
                ApiError::Unreachable
            });
        }
    };

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        tracing::error!(%status, text, slug, actor = %actor, "GitHub workflow dispatch rejected");
        let mut rejected = requested;
        if let Some(object) = rejected.as_object_mut() {
            object.insert("httpStatus".to_owned(), json!(status.as_u16()));
        }
        state
            .store
            .audit_external_deploy(
                tenant.tenant.id,
                slug,
                &actor,
                request_id,
                "rejected",
                rejected,
            )
            .await?;
        return Err(ApiError::UpstreamError(status.as_u16()));
    }

    tracing::info!(slug, actor = %actor, target_sha = %target_sha, "ecosystem-deploy workflow dispatched via GitHub API");
    state
        .store
        .audit_external_deploy(
            tenant.tenant.id,
            slug,
            &actor,
            request_id,
            // The audit outcome is "accepted" — GitHub accepted the workflow
            // dispatch. The deploy itself is async and at-least-once; the
            // Control Plane has not observed its completion. The runtime
            // observer will report the new SHA when the deploy lands.
            "accepted",
            requested,
        )
        .await?;

    Ok((
        StatusCode::ACCEPTED,
        Json(json!({
            // Shape matches the frontend ProvisioningJob contract so the
            // typed `request<ProvisioningJob>` call doesn't receive fields
            // it can't map. The synthetic id, status, and phase convey
            // that GitHub accepted the dispatch but the deploy has not
            // been observed as completed.
            "id": format!("github-dispatch-{}", chrono::Utc::now().timestamp_millis()),
            "tenantId": slug,
            "status": "planned",
            "phase": "accepted",
            "desiredVersion": desired_version.map(|v| Value::String(v.to_owned())).unwrap_or(Value::Null),
            "plan": {
                "kind": "ecosystem_deploy",
                "targetSha": if target_sha.is_empty() { Value::Null } else { Value::String(target_sha) },
                "message": "Ecosystem deploy workflow triggered on GitHub Actions.",
                "workflowUrl": format!("https://github.com/{repo}/actions/workflows/ecosystem-deploy.yml"),
            },
            "createdBy": actor,
            "attemptCount": 0,
            "claimedBy": Value::Null,
            "leaseExpiresAt": Value::Null,
            "startedAt": Value::Null,
            "finishedAt": Value::Null,
            "result": Value::Null,
            "errorCode": Value::Null,
            "errorDetail": Value::Null,
            "createdAt": chrono::Utc::now().to_rfc3339(),
            "updatedAt": chrono::Utc::now().to_rfc3339(),
        })),
    ))
}

#[cfg(test)]
mod tests {
    use super::external_deploy_target;

    #[test]
    fn external_deploy_passes_the_requested_revision_or_refuses_it() {
        let sha = "0123456789abcdef0123456789abcdef01234567";
        assert_eq!(external_deploy_target(Some(sha)).unwrap(), sha);
        // The panel and the provisioner both speak `sha-<40 hex>`; the
        // workflow input is the bare commit.
        assert_eq!(
            external_deploy_target(Some(&format!("sha-{sha}"))).unwrap(),
            sha
        );
        // Absent means "resolve main", which is the workflow's own default.
        assert_eq!(external_deploy_target(None).unwrap(), "");
        assert_eq!(external_deploy_target(Some("  ")).unwrap(), "");
        // Anything else is refused instead of silently deploying main under
        // the label the operator picked.
        for bad in [
            "latest",
            "main",
            "0123456789ABCDEF0123456789abcdef01234567",
            "abc",
        ] {
            assert!(external_deploy_target(Some(bad)).is_err(), "{bad}");
        }
    }

    /// An LLM worker cannot inject a non-SHA revision into the deploy path.
    /// The validator accepts only a bare 40-character lowercase hex SHA (or
    /// the `sha-` prefixed form the panel uses), or empty (resolve main).
    /// Everything an LLM might hallucinate — a branch name, a tag, a PR URL,
    /// a short SHA, a version string, a docker image reference — is refused.
    #[test]
    fn llm_supplied_revisions_are_refused_by_the_deploy_validator() {
        for bad in [
            "v1.2.3",
            "release-2024-01",
            "pull/42/head",
            "https://github.com/CrowdRelay/crowdrelay/pull/42",
            "ghcr.io/crowdrelay/crowdrelay-api:latest",
            "0123456",                                    // short SHA
            "0123456789abcdef0123456789abcdef012345678",  // 39 hex (too short)
            "0123456789abcdef0123456789abcdef0123456789", // 41 hex (too long)
            "g0123456789abcdef0123456789abcdef01234567",  // 40 chars, non-hex
            "HEAD",
            "origin/main",
            "@malicious",
        ] {
            assert!(
                external_deploy_target(Some(bad)).is_err(),
                "LLM revision {bad:?} must be refused"
            );
        }
        // Empty and whitespace-only resolve to "resolve main" — they are not
        // errors, they are the explicit default.
        for ok in ["", "  ", "\t\n  "] {
            assert_eq!(
                external_deploy_target(Some(ok)).unwrap(),
                "",
                "{ok:?} must resolve to empty (resolve main)"
            );
        }
    }
}

async fn provisioning_jobs(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    Extension(identity): Extension<Arc<Identity>>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let tenant = resolve_scoped_tenant(&state, &identity, &raw_slug).await?;
    let jobs = state
        .store
        .provisioning_jobs(&tenant.tenant.slug, 20)
        .await?;
    let items: Vec<Value> = jobs.iter().map(job_with_phase).collect::<Result<_, _>>()?;
    Ok(Json(json!({"items": items})))
}

async fn cancel_provisioning(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    Extension(identity): Extension<Arc<Identity>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let tenant = resolve_scoped_tenant(&state, &identity, &raw_slug).await?;
    let actor = identity.audit_actor();
    let job = state
        .store
        .cancel_provisioning(&tenant.tenant.slug, &actor, request_id(&headers))
        .await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &tenant.tenant.slug).await;
    Ok(Json(job_with_phase(&job)?))
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
    Ok(Json({
        // Compute the phased job value first, before `claim` is consumed by
        // `to_value`, so we can use the same `job_with_phase` helper as every
        // other provisioning endpoint. `claim` is `Option<ProvisioningClaim>`:
        // `None` means no job was available to claim.
        match claim {
            Some(claim) => {
                let job_value = job_with_phase(&claim.job)?;
                let mut value = serde_json::to_value(&claim).map_err(ApiError::Serialization)?;
                if let Some(claim_obj) = value.as_object_mut() {
                    claim_obj.insert("job".to_owned(), job_value);
                }
                value
            }
            None => serde_json::Value::Null,
        }
    }))
}

async fn renew_provisioning_lease(
    State(state): State<AppState>,
    Path(job_id): Path<uuid::Uuid>,
    Json(input): Json<ProvisioningLeaseRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let worker_id = validation::worker_id(&input.worker_id)?;
    let claim_token = validation::claim_token(&input.claim_token)?;
    let job = state
        .store
        .renew_provisioning_lease(
            job_id,
            &worker_id,
            claim_token,
            state.provisioner_lease_seconds,
        )
        .await?;
    Ok(Json(job_with_phase(&job)?))
}

async fn complete_provisioning(
    State(state): State<AppState>,
    Path(job_id): Path<uuid::Uuid>,
    Json(input): Json<ProvisioningSuccessRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let worker_id = validation::worker_id(&input.worker_id)?;
    let claim_token = validation::claim_token(&input.claim_token)?;
    validation::provision_success(input.api_port, input.schema_version, &input.deployed_sha)?;
    let job = state
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
        .await?;
    Ok(Json(job_with_phase(&job)?))
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
    let job = state
        .store
        .fail_provisioning(
            job_id,
            &worker_id,
            claim_token,
            &error_code,
            error_detail.as_deref(),
            state.provisioner_actor.as_ref(),
        )
        .await?;
    Ok(Json(job_with_phase(&job)?))
}

/// Serialize a provisioning job with the derived `phase` field injected.
/// Every endpoint that returns a `ProvisioningJobRow` — operator-facing or
/// provisioner-facing — uses this so the `phase` field is always present and
/// the frontend type contract holds. Serialization failures propagate as
/// `ApiError::Serialization` rather than silently returning `null`.
pub(crate) fn job_with_phase(
    job: &crate::model::ProvisioningJobRow,
) -> Result<serde_json::Value, ApiError> {
    let mut value = serde_json::to_value(job).map_err(ApiError::Serialization)?;
    if let Some(obj) = value.as_object_mut() {
        obj.insert(
            "phase".to_owned(),
            json!(crate::model::provisioning_phase(&job.status)),
        );
    }
    Ok(value)
}

async fn report_runtime(
    State(state): State<AppState>,
    Path(raw_slug): Path<String>,
    headers: HeaderMap,
    Json(input): Json<RuntimeReportRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let slug = validation::slug(&raw_slug)?;
    validation::runtime_report(&input)?;
    let result = json!(
        state
            .store
            .report_runtime(
                &slug,
                input,
                state.telemetry_actor.as_ref(),
                request_id(&headers)
            )
            .await?
    );
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    Ok(Json(result))
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
    let account = state
        .store
        .create_tenant_operator(
            tenant.tenant.id,
            &username,
            &password_hash,
            state.admin_actor.as_ref(),
            request_id(&headers),
        )
        .await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    Ok((StatusCode::CREATED, Json(json!(account))))
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
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    Ok(StatusCode::NO_CONTENT)
}

fn request_id(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .filter(|value| value.len() <= 128)
}
