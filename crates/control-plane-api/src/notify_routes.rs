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
        .route("/tenants/{slug}/notifiers/overview", get(overview))
        .route(
            "/tenants/{slug}/notifiers/platform-config",
            get(platform_config),
        )
        .route(
            "/tenants/{slug}/notifiers/automation-routing",
            get(automation_routing),
        )
        .route(
            "/tenants/{slug}/notifiers/automation-routing/sync",
            post(sync_automation_routing),
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
    headers: HeaderMap,
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
    state
        .store
        .audit_control_command(crate::store::ControlCommandAudit {
            tenant_id: tenant.tenant.id,
            actor: &identity.audit_actor(),
            action: "tenant.notifier.updated",
            target_kind: "notifier_channel",
            target_id: channel.id.to_string(),
            request_id: headers.get("x-request-id").and_then(|v| v.to_str().ok()),
            outcome: "succeeded",
        })
        .await
        .ok();
    Ok(axum::Json(mask(&channel)).into_response())
}

async fn delete_channel(
    State(state): State<AppState>,
    Path((slug, channel_id)): Path<(String, Uuid)>,
    Extension(identity): Extension<Arc<Identity>>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&slug)?;
    let tenant = state.store.tenant_by_slug(&slug).await?;
    identity.ensure_tenant(tenant.tenant.id)?;
    state
        .store
        .audit_control_command(crate::store::ControlCommandAudit {
            tenant_id: tenant.tenant.id,
            actor: &identity.audit_actor(),
            action: "tenant.notifier.deleted",
            target_kind: "notifier_channel",
            target_id: channel_id.to_string(),
            request_id: headers.get("x-request-id").and_then(|v| v.to_str().ok()),
            outcome: "succeeded",
        })
        .await
        .ok();
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
    headers: HeaderMap,
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
            request_id: headers.get("x-request-id").and_then(|v| v.to_str().ok()),
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
/// The whole Notifications page in one request.
///
/// The page reads four independent endpoints — channels, discovered
/// endpoints, platform config, automation routing — and renders them as one
/// picture of where alerts go. Four round trips for one screen, each with its
/// own loading and error state, so the page assembles itself in front of the
/// operator and any one of them failing leaves a hole in a topology that is
/// only meaningful whole.
///
/// The individual routes stay: they are the write-and-refresh path for the
/// panels, and other callers use them.
///
/// A section that cannot be read reports its error inline instead of failing
/// the request. Three working layers and one broken one is a more useful
/// answer than nothing, and it is the honest one — the page's whole job is
/// saying which parts of the topology are healthy.
async fn overview(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let slug = validation::slug(&slug)?;
    let tenant = state.store.tenant_by_slug(&slug).await?;

    let channels = match state.store.list_notifier_channels(tenant.tenant.id).await {
        Ok(rows) => json!({ "items": rows.iter().map(mask).collect::<Vec<_>>() }),
        Err(error) => json!({ "error": error.to_string() }),
    };

    let platform = match response_body(platform_config(
        State(state.clone()),
        Path(slug.to_string()),
    ))
    .await
    {
        Ok(value) => value,
        Err(error) => json!({ "error": error.to_string() }),
    };

    let routing = match response_body(automation_routing(
        State(state.clone()),
        Path(slug.to_string()),
    ))
    .await
    {
        Ok(value) => value,
        Err(error) => json!({ "error": error.to_string() }),
    };

    let discovered = match crate::operations_routes::discovered_notifier_endpoints_value(
        &state, &slug, &headers,
    )
    .await
    {
        Ok(value) => value,
        Err(error) => json!({ "error": error.to_string() }),
    };

    Ok(axum::Json(json!({
        "channels": channels,
        "platformConfig": platform,
        "automationRouting": routing,
        "discovered": discovered,
    }))
    .into_response())
}

/// Runs one of the section handlers and returns its JSON body.
///
/// The sections already exist as handlers and their shapes are what the page
/// expects; re-deriving them here would be a second definition to keep in
/// step with the first.
async fn response_body<F>(handler: F) -> Result<serde_json::Value, ApiError>
where
    F: std::future::Future<Output = Result<Response, ApiError>>,
{
    use axum::body::to_bytes;
    let response = handler.await?;
    let bytes = to_bytes(response.into_body(), 1024 * 1024)
        .await
        .map_err(|error| ApiError::Unavailable(format!("section body unreadable: {error}")))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| ApiError::Unavailable(format!("section body is not JSON: {error}")))
}

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
/// Categorises an n8n workflow by what it does, from its name.
///
/// The three categories the config table accepts mean: `real_work` changes
/// something outside the system (mail, posts, submissions), `status` reports
/// on it, `system` keeps the machinery running. An operator muting "status"
/// wants to stop being told things, not to stop the band's outreach — so
/// putting a mail executor in the wrong bucket would silence real work.
///
/// Defaults to `real_work` on an unrecognised name. That errs toward showing
/// a workflow as consequential, which is the safe direction: a status job
/// mislabelled as real work is noise, while real work mislabelled as status
/// invites someone to mute it.
fn categorise_workflow(name: &str) -> &'static str {
    let lowered = name.to_lowercase();
    const SYSTEM: [&str; 6] = [
        "heartbeat",
        "error handler",
        "health check",
        "watchdog",
        "receipt spooler",
        "rebuilder",
    ];
    const STATUS: [&str; 5] = ["digest", "brief", "radar", "monitor", "report"];
    if SYSTEM.iter().any(|needle| lowered.contains(needle)) {
        return "system";
    }
    if STATUS.iter().any(|needle| lowered.contains(needle)) {
        return "status";
    }
    "real_work"
}

/// Pulls the live workflow list from n8n into the routing table.
///
/// The Notifications page renders three panels and production had every one
/// of them empty — zero notifier channels, zero platform config, zero
/// automation routing — while n8n ran 69 active workflows that send the
/// band's mail, post its content and report to Discord. The page was
/// structurally right and factually blank, which reads as broken.
///
/// n8n owns the workflows; this mirrors them so the control plane can show
/// and mute them. Existing rows keep their `discord_enabled` and `muted`
/// settings — those are the operator's decisions, and a sync must not
/// silently re-enable something they turned off.
async fn sync_automation_routing(
    State(state): State<AppState>,
    Path(_slug): Path<String>,
) -> Result<Response, ApiError> {
    let (base_url, api_key) = match (state.n8n_base_url.as_deref(), state.n8n_api_key.as_deref()) {
        (Some(url), Some(key)) => (url, key),
        _ => {
            return Err(ApiError::Unavailable(
                "n8n sync is not configured (CONTROL_PLANE_N8N_BASE_URL / \
                 CONTROL_PLANE_N8N_API_KEY missing)"
                    .to_owned(),
            ));
        }
    };

    let url = format!(
        "{}/api/v1/workflows?limit=250",
        base_url.trim_end_matches('/')
    );
    let response = state
        .http_client
        .get(&url)
        .header("accept", "application/json")
        .header("X-N8N-API-KEY", api_key)
        .send()
        .await
        .map_err(|error| ApiError::Unavailable(format!("n8n workflow list failed: {error}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(ApiError::Unavailable(format!(
            "n8n workflow list returned {status}: {}",
            body.chars().take(500).collect::<String>()
        )));
    }

    #[derive(Deserialize)]
    struct WorkflowList {
        #[serde(default)]
        data: Vec<Workflow>,
    }
    #[derive(Deserialize)]
    struct Workflow {
        id: String,
        #[serde(default)]
        name: String,
        #[serde(default)]
        active: bool,
    }

    let listed: WorkflowList = response.json().await.map_err(|error| {
        ApiError::Unavailable(format!("n8n workflow list is not JSON: {error}"))
    })?;

    let existing: std::collections::HashSet<String> = state
        .store
        .list_automation_workflow_configs()
        .await?
        .into_iter()
        .map(|row| row.workflow_id)
        .collect();

    let mut synced = 0u32;
    let mut skipped = 0u32;
    for workflow in listed.data {
        // An id the config table would reject is skipped rather than failing
        // the whole sync — one odd workflow must not block the other 68.
        if existing.contains(&workflow.id) {
            // Already known: refresh only the label, so a rename shows up
            // without discarding the operator's mute or Discord choice.
            match state
                .store
                .upsert_automation_workflow_config(
                    &workflow.id,
                    Some(&workflow.name),
                    None,
                    None,
                    None,
                )
                .await
            {
                Ok(_) => synced += 1,
                Err(_) => skipped += 1,
            }
            continue;
        }
        // New workflow: an inactive one arrives muted, matching what n8n
        // already says about it.
        match state
            .store
            .upsert_automation_workflow_config(
                &workflow.id,
                Some(&workflow.name),
                Some(categorise_workflow(&workflow.name)),
                Some(false),
                Some(!workflow.active),
            )
            .await
        {
            Ok(_) => synced += 1,
            Err(_) => skipped += 1,
        }
    }

    Ok(axum::Json(json!({ "synced": synced, "skipped": skipped })).into_response())
}

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

#[cfg(test)]
mod tests {
    use super::categorise_workflow;

    #[test]
    fn a_mail_sender_is_real_work() {
        // The category decides what an operator is muting. "Status" reads as
        // safe to silence; if a workflow that sends the band's mail lands
        // there, muting the noise stops the outreach too.
        for name in [
            "CrowdRelay — CrowdRelayOS mail executor + daily Gemini polish",
            "VIRYA 08 — Playlist Pitching Engine",
            "CrowdRelay — CrowdRelayOS beacon invite batch executor",
            "CrowdRelay — CrowdRelayOS opportunity application executor",
        ] {
            assert_eq!(categorise_workflow(name), "real_work", "{name}");
        }
    }

    #[test]
    fn a_reporter_is_status() {
        for name in [
            "VIRYA 19 — META Opportunity Router + Daily Digest",
            "VIRYA 02 — Reply monitor → CRM + Discord Bot",
            "VIRYA 18 — META Instagram Hashtag Radar",
            "CrowdRelay — CrowdRelayOS operator brief",
        ] {
            assert_eq!(categorise_workflow(name), "status", "{name}");
        }
    }

    #[test]
    fn plumbing_is_system() {
        for name in [
            "CrowdRelay — CrowdRelayOS executor heartbeat",
            "VIRYA 99 — Central Automation Error Handler",
            "VIRYA 20 — META OAuth Health Check",
            "VIRYA 98 — CrowdRelay Queue Watchdog",
            "CrowdRelay — CrowdRelayOS execution receipt spooler",
            "VIRYA 00 — Cockpit Rebuilder",
        ] {
            assert_eq!(categorise_workflow(name), "system", "{name}");
        }
    }

    #[test]
    fn an_unrecognised_name_errs_toward_real_work() {
        // Wrong in the safe direction: a status job shown as real work is
        // noise, but real work shown as status invites muting it.
        assert_eq!(categorise_workflow("VIRYA 42 — something new"), "real_work");
        assert_eq!(categorise_workflow(""), "real_work");
    }

    #[test]
    fn every_category_is_one_the_store_accepts() {
        // upsert_automation_workflow_config rejects anything outside this set
        // with InvalidInput, which would silently skip the workflow during a
        // sync and leave the panel short of rows with no error surfaced.
        for name in [
            "mail executor",
            "daily digest",
            "executor heartbeat",
            "anything at all",
        ] {
            let category = categorise_workflow(name);
            assert!(
                matches!(category, "real_work" | "status" | "system"),
                "{name} categorised as {category}, which the store rejects",
            );
        }
    }
}
