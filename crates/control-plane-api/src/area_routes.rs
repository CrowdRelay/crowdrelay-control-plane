//! Platform-superadmin AREA Designer proxy. Tenant CrowdRelay remains canonical.

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, StatusCode, header::CACHE_CONTROL},
    response::{IntoResponse, Response},
    routing::{get, patch, post},
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{AppState, error::ApiError};

const PRIVATE_NO_STORE: &str = "private, no-store";
const MAX_AREA_BODY_BYTES: usize = 16 * 1024;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tenants/{slug}/area", get(overview))
        .route("/tenants/{slug}/area/settings", patch(settings))
        .route("/tenants/{slug}/area/cities", get(cities).post(create_city))
        .route("/tenants/{slug}/area/drops", get(drops).post(create_drop))
        .route(
            "/tenants/{slug}/area/drops/{drop_id}",
            get(drop_detail).delete(delete_drop),
        )
        .route(
            "/tenants/{slug}/area/drops/{drop_id}/draft",
            patch(save_draft).delete(discard_draft),
        )
        .route(
            "/tenants/{slug}/area/drops/{drop_id}/validate",
            post(validate_drop),
        )
        .route(
            "/tenants/{slug}/area/drops/{drop_id}/publish",
            post(publish_drop),
        )
        .route(
            "/tenants/{slug}/area/drops/{drop_id}/pause",
            post(pause_drop),
        )
        .route(
            "/tenants/{slug}/area/drops/{drop_id}/resume",
            post(resume_drop),
        )
        .route(
            "/tenants/{slug}/area/drops/{drop_id}/archive",
            post(archive_drop),
        )
        .route(
            "/tenants/{slug}/area/drops/{drop_id}/duplicate",
            post(duplicate_drop),
        )
        .layer(DefaultBodyLimit::max(MAX_AREA_BODY_BYTES))
}

async fn target(
    state: &AppState,
    slug: &str,
) -> Result<(crate::model::TenantSummary, String), ApiError> {
    let tenant = state.store.tenant_by_slug(slug).await?;
    if tenant.tenant.status == "suspended" {
        return Err(ApiError::Conflict("tenant is suspended".to_owned()));
    }
    let target = if slug == "virya" {
        state
            .virya_management_url
            .as_deref()
            .ok_or_else(|| {
                ApiError::Unavailable("VIRYA AREA management target is not configured".to_owned())
            })?
            .to_owned()
    } else {
        state
            .store
            .latest_management_url(tenant.tenant.id)
            .await?
            .ok_or_else(|| {
                ApiError::Unavailable(
                    "tenant has no successful local CrowdRelay management target".to_owned(),
                )
            })?
    };
    Ok((tenant, target))
}

fn correlation(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .or_else(|| {
            headers
                .get("x-crowdrelay-correlation-id")
                .and_then(|v| v.to_str().ok())
        })
}
fn json_no_store(value: Value) -> Response {
    (
        StatusCode::OK,
        [(CACHE_CONTROL, PRIVATE_NO_STORE)],
        Json(value),
    )
        .into_response()
}

fn valid_area_drop_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 7
        && bytes.iter().take(3).all(u8::is_ascii_lowercase)
        && bytes.get(3) == Some(&b'-')
        && bytes.iter().skip(4).all(u8::is_ascii_digit)
}

fn drop_path(drop_id: &str, suffix: &str) -> Result<String, ApiError> {
    if !valid_area_drop_id(drop_id) {
        return Err(ApiError::InvalidInput("invalid AREA drop id".to_owned()));
    }
    Ok(format!("/v1/control-plane/area/drops/{drop_id}{suffix}"))
}

async fn call(
    state: &AppState,
    slug: &str,
    method: &str,
    path: &str,
    body: Option<&Value>,
    headers: &HeaderMap,
) -> Result<(crate::model::TenantSummary, Value), ApiError> {
    let (tenant, target) = target(state, slug).await?;
    let value = state
        .area_client
        .request(
            tenant.tenant.id,
            &target,
            method,
            path,
            body,
            correlation(headers),
        )
        .await?;
    Ok((tenant, value))
}

async fn audit_outcome(
    state: &AppState,
    tenant_id: uuid::Uuid,
    action: &'static str,
    drop_id: Option<&str>,
    headers: &HeaderMap,
    outcome: &'static str,
) {
    if let Err(error) = state
        .store
        .audit_area_command(
            tenant_id,
            &state.admin_actor,
            action,
            drop_id,
            correlation(headers),
            outcome,
        )
        .await
    {
        tracing::warn!(%error, action, "failed to append redacted Control Plane AREA audit");
    }
}

async fn audit_result(
    state: &AppState,
    tenant_id: uuid::Uuid,
    action: &'static str,
    drop_id: Option<&str>,
    headers: &HeaderMap,
    result: &Result<Value, ApiError>,
) {
    audit_outcome(
        state,
        tenant_id,
        action,
        drop_id,
        headers,
        if result.is_ok() {
            "succeeded"
        } else {
            "failed"
        },
    )
    .await;
}

async fn overview(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (tenant, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/area",
        None,
        &headers,
    )
    .await?;
    let mut value = value;
    if let Some(object) = value.as_object_mut() {
        object.insert(
            "entitled".to_owned(),
            Value::Bool(tenant.tenant.area_enabled),
        );
    }
    Ok(json_no_store(value))
}

async fn settings(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let enabled = body
        .get("enabled")
        .and_then(Value::as_bool)
        .ok_or_else(|| ApiError::InvalidInput("enabled boolean is required".to_owned()))?;
    let (tenant, target) = target(&state, &slug).await?;
    let previous = tenant.tenant.area_enabled;
    let upstream = state
        .area_client
        .request(
            tenant.tenant.id,
            &target,
            "PATCH",
            "/v1/control-plane/area/settings",
            Some(&json!({"enabled": enabled})),
            correlation(&headers),
        )
        .await;
    if let Err(error) = upstream {
        audit_outcome(
            &state,
            tenant.tenant.id,
            "tenant.area.settings.updated",
            None,
            &headers,
            "failed",
        )
        .await;
        return Err(error);
    }

    let updated = match state
        .store
        .set_area_enabled(&slug, enabled, &state.admin_actor, correlation(&headers))
        .await
    {
        Ok(updated) => updated,
        Err(error) => {
            // Cross-database atomicity is impossible. Compensate the remote
            // runtime flag if the local entitlement commit fails, and report
            // the command as failed even if compensation itself is unavailable.
            let rollback = state
                .area_client
                .request(
                    tenant.tenant.id,
                    &target,
                    "PATCH",
                    "/v1/control-plane/area/settings",
                    Some(&json!({"enabled": previous})),
                    correlation(&headers),
                )
                .await;
            if let Err(rollback_error) = rollback {
                tracing::error!(
                    %rollback_error,
                    tenant = %slug,
                    "AREA entitlement compensation failed after local Control Plane write failure"
                );
            }
            audit_outcome(
                &state,
                tenant.tenant.id,
                "tenant.area.settings.updated",
                None,
                &headers,
                "failed",
            )
            .await;
            return Err(error);
        }
    };
    audit_outcome(
        &state,
        tenant.tenant.id,
        "tenant.area.settings.updated",
        None,
        &headers,
        "succeeded",
    )
    .await;
    Ok(json_no_store(json!({
        "enabled": enabled,
        "entitled": updated
    })))
}

#[derive(Deserialize)]
struct CityQuery {
    q: Option<String>,
    limit: Option<i64>,
}
async fn cities(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Query(query): Query<CityQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    if query
        .q
        .as_deref()
        .is_some_and(|value| value.chars().count() > 128)
    {
        return Err(ApiError::InvalidInput(
            "AREA city search is too long".to_owned(),
        ));
    }
    // form_urlencoded::Serializer is not Send, so it must not survive into the
    // await below or the whole handler future stops being Send and axum rejects
    // it. Scope it so only the finished string escapes.
    let qs = {
        let mut serializer = url::form_urlencoded::Serializer::new(String::new());
        if let Some(q) = query.q.as_deref() {
            serializer.append_pair("q", q);
        }
        if let Some(limit) = query.limit {
            serializer.append_pair("limit", &limit.to_string());
        }
        serializer.finish()
    };
    let path = if qs.is_empty() {
        "/v1/control-plane/area/cities".to_owned()
    } else {
        format!("/v1/control-plane/area/cities?{qs}")
    };
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers).await?;
    Ok(json_no_store(value))
}
async fn create_city(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    mutation(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/area/cities",
        Some(body),
        AuditTag {
            action: "tenant.area.city.created",
            drop_id: None,
        },
        &headers,
    )
    .await
}
async fn drops(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, v) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/area/drops",
        None,
        &headers,
    )
    .await?;
    Ok(json_no_store(v))
}
async fn create_drop(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let id = body
        .get("dropId")
        .and_then(Value::as_str)
        .filter(|value| valid_area_drop_id(value))
        .map(ToOwned::to_owned);
    mutation(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/area/drops",
        Some(body),
        AuditTag {
            action: "tenant.area.drop.created",
            drop_id: id.as_deref(),
        },
        &headers,
    )
    .await
}
async fn drop_detail(
    State(state): State<AppState>,
    Path((slug, drop_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = drop_path(&drop_id, "")?;
    let (_, v) = call(&state, &slug, "GET", &path, None, &headers).await?;
    Ok(json_no_store(v))
}
async fn save_draft(
    State(state): State<AppState>,
    Path((slug, drop_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let path = drop_path(&drop_id, "/draft")?;
    mutation(
        &state,
        &slug,
        "PATCH",
        &path,
        Some(body),
        AuditTag {
            action: "tenant.area.drop.draft_saved",
            drop_id: Some(&drop_id),
        },
        &headers,
    )
    .await
}
async fn discard_draft(
    State(state): State<AppState>,
    Path((slug, drop_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = drop_path(&drop_id, "/draft")?;
    mutation(
        &state,
        &slug,
        "DELETE",
        &path,
        None,
        AuditTag {
            action: "tenant.area.drop.draft_discarded",
            drop_id: Some(&drop_id),
        },
        &headers,
    )
    .await
}
async fn validate_drop(
    State(state): State<AppState>,
    Path((slug, drop_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = drop_path(&drop_id, "/validate")?;
    let (_, v) = call(&state, &slug, "POST", &path, None, &headers).await?;
    Ok(json_no_store(v))
}
async fn publish_drop(
    State(state): State<AppState>,
    Path((slug, drop_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let path = drop_path(&drop_id, "/publish")?;
    mutation(
        &state,
        &slug,
        "POST",
        &path,
        Some(body),
        AuditTag {
            action: "tenant.area.drop.published",
            drop_id: Some(&drop_id),
        },
        &headers,
    )
    .await
}
async fn pause_drop(
    State(state): State<AppState>,
    Path((slug, drop_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = drop_path(&drop_id, "/pause")?;
    mutation(
        &state,
        &slug,
        "POST",
        &path,
        None,
        AuditTag {
            action: "tenant.area.drop.paused",
            drop_id: Some(&drop_id),
        },
        &headers,
    )
    .await
}
async fn resume_drop(
    State(state): State<AppState>,
    Path((slug, drop_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = drop_path(&drop_id, "/resume")?;
    mutation(
        &state,
        &slug,
        "POST",
        &path,
        None,
        AuditTag {
            action: "tenant.area.drop.resumed",
            drop_id: Some(&drop_id),
        },
        &headers,
    )
    .await
}
async fn archive_drop(
    State(state): State<AppState>,
    Path((slug, drop_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = drop_path(&drop_id, "/archive")?;
    mutation(
        &state,
        &slug,
        "POST",
        &path,
        None,
        AuditTag {
            action: "tenant.area.drop.archived",
            drop_id: Some(&drop_id),
        },
        &headers,
    )
    .await
}
async fn duplicate_drop(
    State(state): State<AppState>,
    Path((slug, drop_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let path = drop_path(&drop_id, "/duplicate")?;
    mutation(
        &state,
        &slug,
        "POST",
        &path,
        Some(body),
        AuditTag {
            action: "tenant.area.drop.duplicated",
            drop_id: Some(&drop_id),
        },
        &headers,
    )
    .await
}
async fn delete_drop(
    State(state): State<AppState>,
    Path((slug, drop_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = drop_path(&drop_id, "")?;
    mutation(
        &state,
        &slug,
        "DELETE",
        &path,
        None,
        AuditTag {
            action: "tenant.area.drop.deleted",
            drop_id: Some(&drop_id),
        },
        &headers,
    )
    .await
}

/// What the mutation records once it succeeds or fails. Grouped so `mutation`
/// stays within the argument budget and the two audit fields travel together
/// instead of as loose positional strings.
struct AuditTag<'a> {
    action: &'static str,
    drop_id: Option<&'a str>,
}

async fn mutation(
    state: &AppState,
    slug: &str,
    method: &str,
    path: &str,
    body: Option<Value>,
    audit: AuditTag<'_>,
    headers: &HeaderMap,
) -> Result<Response, ApiError> {
    let (tenant, target) = target(state, slug).await?;
    if !tenant.tenant.area_enabled && audit.action != "tenant.area.settings.updated" {
        return Err(ApiError::Conflict(
            "AREA entitlement is disabled for this tenant".to_owned(),
        ));
    }
    let result = state
        .area_client
        .request(
            tenant.tenant.id,
            &target,
            method,
            path,
            body.as_ref(),
            correlation(headers),
        )
        .await;
    audit_result(
        state,
        tenant.tenant.id,
        audit.action,
        audit.drop_id,
        headers,
        &result,
    )
    .await;
    let value = result?;
    if method == "DELETE" && value.is_null() {
        Ok(StatusCode::NO_CONTENT.into_response())
    } else {
        Ok(json_no_store(value))
    }
}
