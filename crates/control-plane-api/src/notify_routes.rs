//! Per-tenant end-notifier channel management.
//!
//! Channels are the tenant's own endpoints (Discord webhook, generic HTTPS
//! webhook, or a recipient on the optional platform email relay). Scoped
//! tenant operators manage their own channels; every mutation lands in the
//! platform audit log.

use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

use crate::{AppState, auth::Identity, error::ApiError, store::NotifierChannelRow, validation};

const MAX_NOTIFIER_BODY_BYTES: usize = 4 * 1024;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/tenants/{slug}/notifiers",
            get(list_channels).post(create_channel),
        )
        .route(
            "/tenants/{slug}/notifiers/{channel_id}",
            axum::routing::patch(update_channel).delete(delete_channel),
        )
        .route(
            "/tenants/{slug}/notifiers/{channel_id}/test",
            post(test_channel),
        )
        .route(
            "/tenants/{slug}/notifiers/platform-config",
            get(platform_config),
        )
        .route(
            "/tenants/{slug}/notifiers/automation-routing",
            get(automation_routing),
        )
        .layer(axum::extract::DefaultBodyLimit::max(
            MAX_NOTIFIER_BODY_BYTES,
        ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateChannelRequest {
    kind: String,
    label: String,
    url: Option<String>,
    #[serde(default)]
    events: Vec<String>,
    #[serde(default)]
    enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateChannelRequest {
    label: Option<String>,
    events: Option<Vec<String>>,
    enabled: Option<bool>,
}

fn mask(row: &NotifierChannelRow) -> serde_json::Value {
    let config = match row.kind.as_str() {
        "email_relay" => row.config.clone(),
        _ => json!({
            "urlHost": row
                .config
                .get("url")
                .and_then(serde_json::Value::as_str)
                .and_then(|url| url::Url::parse(url).ok())
                .map(|url| format!("{}://{}/…", url.scheme(), url.host_str().unwrap_or_default())),
        }),
    };
    json!({
        "id": row.id,
        "kind": row.kind,
        "label": row.label,
        "config": config,
        "events": row.events,
        "enabled": row.enabled,
    })
}

async fn list_channels(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Response, ApiError> {
    let tenant = state.store.tenant_by_slug(&slug).await?;
    let channels = state.store.list_notifier_channels(tenant.tenant.id).await?;
    Ok((axum::Json(
        json!({"items": channels.iter().map(mask).collect::<Vec<_>>()}),
    ),)
        .into_response())
}

async fn create_channel(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Extension(identity): Extension<Arc<Identity>>,
    Json(input): Json<CreateChannelRequest>,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&slug)?;
    let tenant = state.store.tenant_by_slug(&slug).await?;
    identity.ensure_tenant(tenant.tenant.id)?;
    let label = validation::notifier_label(&input.label)?;
    let kind = input.kind.as_str().to_owned();
    let config = validation::notifier_target(&kind, input.url.as_deref())?;
    let events = validation::notifier_events(input.events)?;
    let channel = state
        .store
        .create_notifier_channel(
            tenant.tenant.id,
            &kind,
            &label,
            config,
            events,
            input.enabled,
        )
        .await?;
    state
        .store
        .audit_control_command(crate::store::ControlCommandAudit {
            tenant_id: tenant.tenant.id,
            actor: &identity.audit_actor(),
            action: "tenant.notifier.created",
            target_kind: "notifier_channel",
            target_id: channel.id.to_string(),
            request_id: headers.get("x-request-id").and_then(|v| v.to_str().ok()),
            outcome: "succeeded",
        })
        .await
        .ok();
    Ok((axum::Json(mask(&channel))).into_response())
}

async fn update_channel(
    State(state): State<AppState>,
    Path((slug, channel_id)): Path<(String, Uuid)>,
    Extension(identity): Extension<Arc<Identity>>,
    Json(input): Json<UpdateChannelRequest>,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&slug)?;
    let tenant = state.store.tenant_by_slug(&slug).await?;
    identity.ensure_tenant(tenant.tenant.id)?;
    let label = input
        .label
        .as_deref()
        .map(validation::notifier_label)
        .transpose()?;
    let events = input
        .events
        .clone()
        .map(validation::notifier_events)
        .transpose()?;
    let channel = state
        .store
        .update_notifier_channel(tenant.tenant.id, channel_id, label, events, input.enabled)
        .await?;
    Ok(axum::Json(mask(&channel)).into_response())
}

async fn delete_channel(
    State(state): State<AppState>,
    Path((slug, channel_id)): Path<(String, Uuid)>,
    Extension(identity): Extension<Arc<Identity>>,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&slug)?;
    let tenant = state.store.tenant_by_slug(&slug).await?;
    identity.ensure_tenant(tenant.tenant.id)?;
    state
        .store
        .delete_notifier_channel(tenant.tenant.id, channel_id)
        .await?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

/// Synchronous round-trip so the operator sees the outcome immediately.
/// The test event is not enqueued — it is delivered (or fails) right here.
async fn test_channel(
    State(state): State<AppState>,
    Path((slug, channel_id)): Path<(String, Uuid)>,
    Extension(identity): Extension<Arc<Identity>>,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&slug)?;
    let tenant = state.store.tenant_by_slug(&slug).await?;
    identity.ensure_tenant(tenant.tenant.id)?;
    let channel = state
        .store
        .get_notifier_channel(tenant.tenant.id, channel_id)
        .await?;
    if !channel.enabled {
        return Err(ApiError::InvalidInput(
            "enable the channel before testing".to_owned(),
        ));
    }
    let payload = json!({
        "event": "test",
        "tenant": tenant.tenant.slug,
        "message": "This is a test notification from CrowdRelay Control Plane.",
    });
    let outcome = state
        .notifier
        .deliver(
            &channel.kind,
            &channel.label,
            &channel.config,
            "test",
            &payload,
        )
        .await;
    state
        .store
        .audit_control_command(crate::store::ControlCommandAudit {
            tenant_id: tenant.tenant.id,
            actor: &identity.audit_actor(),
            action: "tenant.notifier.tested",
            target_kind: "notifier_channel",
            target_id: channel.id.to_string(),
            request_id: None,
            outcome: if outcome.is_ok() {
                "succeeded"
            } else {
                "failed"
            },
        })
        .await
        .ok();
    match outcome {
        Ok(()) => Ok((axum::Json(json!({"ok": true}))).into_response()),
        Err(error) => Ok((
            axum::http::StatusCode::BAD_GATEWAY,
            axum::Json(json!({"ok": false, "error": error})),
        )
            .into_response()),
    }
}

// ---------------------------------------------------------------------------
// Notification Topology — read-only observability endpoints
//
// These endpoints show the routing topology: where each notification config
// lives (source), who owns it (owner), and how it reaches its destination
// (path). Three Discord notifications can arrive via three different paths,
// and the operator needs to see all three.
// ---------------------------------------------------------------------------

/// Extracts just the host from a URL, redacting the full URL.
fn url_host(url_str: &str) -> String {
    url::Url::parse(url_str)
        .ok()
        .map(|u| format!("{}://{}", u.scheme(), u.host_str().unwrap_or_default()))
        .unwrap_or_else(|| "(invalid)".to_owned())
}

/// Returns platform-level notification config (from environment variables).
/// Read-only — no mutation of platform-level config in this iteration.
async fn platform_config(
    State(state): State<AppState>,
    Path(_slug): Path<String>,
) -> Result<Response, ApiError> {
    let discord_webhook = &state.discord_automation_webhook_url;
    let email_relay = &state.notify_email_relay_url;
    let n8n_base = &state.n8n_base_url;
    let items = json!({
        "items": [
            {
                "source": "environment",
                "owner": "platform",
                "type": "discord_automation_webhook",
                "path": "direct",
                "configured": discord_webhook.is_some(),
                "destination": discord_webhook.as_deref().map(url_host),
                "enabled": discord_webhook.is_some(),
            },
            {
                "source": "environment",
                "owner": "platform",
                "type": "email_relay",
                "path": "relay",
                "configured": email_relay.is_some(),
                "destination": email_relay.as_deref().map(url_host),
                "enabled": email_relay.is_some(),
            },
            {
                "source": "environment",
                "owner": "platform",
                "type": "n8n_base_url",
                "path": "workflow",
                "configured": n8n_base.is_some(),
                "destination": n8n_base.as_deref().map(url_host),
                "enabled": n8n_base.is_some(),
            },
        ]
    });
    Ok(axum::Json(items).into_response())
}

/// Returns automation routing configs (from database).
/// Read-only — no mutation of automation routing in this iteration.
async fn automation_routing(
    State(state): State<AppState>,
    Path(_slug): Path<String>,
) -> Result<Response, ApiError> {
    let configs = state.store.list_automation_workflow_configs().await?;
    let items: Vec<serde_json::Value> = configs
        .iter()
        .map(|row| {
            json!({
                "source": "database",
                "owner": "automation",
                "type": "n8n_workflow",
                "path": "workflow",
                "workflowId": row.workflow_id,
                "label": row.label,
                "category": row.category,
                "discordEnabled": row.discord_enabled,
                "muted": row.muted,
                "enabled": !row.muted,
            })
        })
        .collect();
    Ok(axum::Json(json!({ "items": items })).into_response())
}
