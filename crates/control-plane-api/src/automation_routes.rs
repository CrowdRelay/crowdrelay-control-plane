//! Automation event ingestion and operator surface.
//!
//! n8n pushes workflow execution outcomes (errors, status, heartbeat) to
//! the machine-authed `POST /automation/events` endpoint. The control plane
//! stores them and decides whether to also forward to Discord based on
//! per-workflow config. Operators browse, acknowledge, retry and configure
//! routing through the admin-authed endpoints below.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode, header::CACHE_CONTROL},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    AppState,
    error::ApiError,
    model::{CreateAutomationEventRequest, UpdateAutomationWorkflowConfigRequest},
};

const PRIVATE_NO_STORE: &str = "private, no-store";
const MAX_EVENT_BODY_BYTES: usize = 32 * 1024;

/// How long an identical message stays suppressed after being forwarded.
///
/// The comment on `ingest_event` already records that n8n retries when a call
/// times out, and a stuck workflow re-reports the same failure every run. Both
/// produce the same text repeatedly, which is the shape Discord spam actually
/// takes here. The event is always stored; only the duplicate *notification*
/// is dropped, so the operator surface still shows every occurrence.
const DUPLICATE_SUPPRESSION_WINDOW: Duration = Duration::from_secs(10 * 60);

/// Ceiling on forwards per rolling minute across all workflows.
///
/// Discord rate-limits webhooks and answers 429 once exceeded, which this code
/// can only log. Refusing to send past the cap keeps a runaway workflow from
/// burning the webhook's budget and drowning the messages that matter.
const MAX_FORWARDS_PER_MINUTE: usize = 20;

/// Forwarding state: last-send time per message, plus recent send timestamps.
struct DiscordThrottle {
    recent_messages: HashMap<String, Instant>,
    recent_sends: Vec<Instant>,
}

fn throttle() -> &'static Mutex<DiscordThrottle> {
    static THROTTLE: OnceLock<Mutex<DiscordThrottle>> = OnceLock::new();
    THROTTLE.get_or_init(|| {
        Mutex::new(DiscordThrottle {
            recent_messages: HashMap::new(),
            recent_sends: Vec::new(),
        })
    })
}

/// Why a forward was skipped, for the log line.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ForwardDecision {
    Send,
    DuplicateWithinWindow,
    RateLimited,
}

/// Decides whether this message may go to Discord now, recording the send when
/// it may. Pure bookkeeping over the two guards above, taking the state by
/// reference so it is testable without touching the process-wide bucket.
fn decide_forward_in(state: &mut DiscordThrottle, message: &str, now: Instant) -> ForwardDecision {
    state
        .recent_messages
        .retain(|_, seen| now.duration_since(*seen) < DUPLICATE_SUPPRESSION_WINDOW);
    state
        .recent_sends
        .retain(|sent| now.duration_since(*sent) < Duration::from_secs(60));

    if state.recent_messages.contains_key(message) {
        return ForwardDecision::DuplicateWithinWindow;
    }
    if state.recent_sends.len() >= MAX_FORWARDS_PER_MINUTE {
        return ForwardDecision::RateLimited;
    }

    state.recent_messages.insert(message.to_owned(), now);
    state.recent_sends.push(now);
    ForwardDecision::Send
}

/// `decide_forward_in` against the process-wide bucket.
fn decide_forward(message: &str, now: Instant) -> ForwardDecision {
    let Ok(mut state) = throttle().lock() else {
        // A poisoned lock must not silence alerting; send and move on.
        return ForwardDecision::Send;
    };
    decide_forward_in(&mut state, message, now)
}

/// Machine-to-machine router: n8n posts events here. Authed via
/// `require_automation` middleware (separate token from admin/telemetry).
pub fn ingestion_router() -> Router<AppState> {
    Router::new()
        .route("/automation/events", post(ingest_event))
        .layer(axum::extract::DefaultBodyLimit::max(MAX_EVENT_BODY_BYTES))
}

/// Operator-facing router: browse events, ack, retry, configure workflows.
pub fn operator_router() -> Router<AppState> {
    Router::new()
        .route("/automation/events", get(list_events))
        .route("/automation/events/{id}/ack", post(ack_event))
        .route("/automation/events/{id}/resolve", post(resolve_event))
        .route("/automation/events/{id}/retry", post(retry_event))
        .route("/automation/workflows", get(list_workflow_configs))
        .route(
            "/automation/workflows/{workflow_id}",
            axum::routing::patch(update_workflow_config),
        )
}

fn json_no_store(value: Value) -> Response {
    (
        StatusCode::OK,
        [(CACHE_CONTROL, PRIVATE_NO_STORE)],
        Json(value),
    )
        .into_response()
}

async fn ingest_event(
    State(state): State<AppState>,
    Json(input): Json<CreateAutomationEventRequest>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let (event, config) = state.store.insert_automation_event(&input).await?;

    // Forward to Discord only for real_work workflows with discord_enabled
    // and not muted. Status/system noise stays in the control plane UI.
    // Fire-and-forget: n8n's webhook timeout (10s) is shorter than our
    // reqwest timeout (15s), so blocking on Discord would cause n8n to
    // retry and duplicate events. The event is already durably stored.
    if config.category == "real_work" && config.discord_enabled && !config.muted {
        let discord_state = state.clone();
        let message = event.message.clone();
        let workflow_id = event.workflow_id.clone();
        tokio::spawn(async move {
            match decide_forward(&message, Instant::now()) {
                ForwardDecision::DuplicateWithinWindow => {
                    tracing::debug!(
                        %workflow_id,
                        "discord forward suppressed: identical message already sent"
                    );
                    return;
                }
                ForwardDecision::RateLimited => {
                    tracing::warn!(
                        %workflow_id,
                        cap = MAX_FORWARDS_PER_MINUTE,
                        "discord forward rate limited; event still stored"
                    );
                    return;
                }
                ForwardDecision::Send => {}
            }
            if let Err(error) = forward_to_discord(&discord_state, &message).await {
                tracing::warn!(
                    %error,
                    %workflow_id,
                    "discord forward failed; event still stored"
                );
            }
        });
    }
    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": event.id, "status": event.status })),
    ))
}

async fn forward_to_discord(state: &AppState, content: &str) -> Result<(), anyhow::Error> {
    let Some(webhook_url) = state.discord_automation_webhook_url.as_deref() else {
        return Ok(()); // No webhook configured — silent no-op.
    };
    let body = json!({ "content": content, "allowed_mentions": { "parse": [] } });
    let response = state
        .http_client
        .post(webhook_url)
        .header("content-type", "application/json")
        .body(serde_json::to_vec(&body)?)
        .send()
        .await?;
    if !response.status().is_success() {
        anyhow::bail!("discord webhook returned {}", response.status());
    }
    Ok(())
}

#[derive(Deserialize)]
struct ListEventsQuery {
    limit: Option<i64>,
    status: Option<String>,
    workflow_id: Option<String>,
}

async fn list_events(
    State(state): State<AppState>,
    Query(query): Query<ListEventsQuery>,
) -> Result<Response, ApiError> {
    let events = state
        .store
        .list_automation_events(
            query.limit.unwrap_or(50),
            query.status.as_deref(),
            query.workflow_id.as_deref(),
        )
        .await?;
    Ok(json_no_store(json!({ "items": events })))
}

async fn ack_event(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Response, ApiError> {
    state.store.ack_automation_event(id).await?;
    Ok(json_no_store(json!({ "id": id, "status": "acknowledged" })))
}

async fn resolve_event(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Response, ApiError> {
    state.store.resolve_automation_event(id).await?;
    Ok(json_no_store(json!({ "id": id, "status": "resolved" })))
}

async fn retry_event(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    _headers: HeaderMap,
) -> Result<Response, ApiError> {
    let event = state.store.get_automation_event(id).await?;
    let Some(ref execution_id) = event.execution_id else {
        return Err(ApiError::InvalidInput(
            "event has no executionId — cannot retry via n8n API".to_owned(),
        ));
    };
    let (base_url, api_key) = match (state.n8n_base_url.as_deref(), state.n8n_api_key.as_deref()) {
        (Some(url), Some(key)) => (url, key),
        _ => {
            return Err(ApiError::Unavailable(
                "n8n retry is not configured (N8N_BASE_URL / N8N_API_KEY missing)".to_owned(),
            ));
        }
    };
    let retry_url = format!(
        "{}/api/v1/executions/{}/retry",
        base_url.trim_end_matches('/'),
        execution_id
    );
    let response = state
        .http_client
        .post(&retry_url)
        .header("accept", "application/json")
        .header("X-N8N-API-KEY", api_key)
        .send()
        .await
        .map_err(|e| ApiError::Unavailable(format!("n8n retry request failed: {e}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(ApiError::Unavailable(format!(
            "n8n retry returned {status}: {}",
            body.chars().take(500).collect::<String>()
        )));
    }
    state.store.mark_automation_event_retried(id).await?;
    Ok(json_no_store(json!({ "id": id, "status": "retried" })))
}

async fn list_workflow_configs(State(state): State<AppState>) -> Result<Response, ApiError> {
    let configs = state.store.list_automation_workflow_configs().await?;
    Ok(json_no_store(json!({ "items": configs })))
}

async fn update_workflow_config(
    State(state): State<AppState>,
    Path(workflow_id): Path<String>,
    Json(input): Json<UpdateAutomationWorkflowConfigRequest>,
) -> Result<Response, ApiError> {
    let config = state
        .store
        .upsert_automation_workflow_config(
            &workflow_id,
            input.label.as_deref(),
            input.category.as_deref(),
            input.discord_enabled,
            input.muted,
        )
        .await?;
    Ok(json_no_store(json!(config)))
}

#[cfg(test)]
mod discord_throttle_tests {
    use super::*;

    /// A bucket per test. Sharing the process-wide one made the rate-limit
    /// test's sends count against the suppression test.
    fn bucket() -> DiscordThrottle {
        DiscordThrottle {
            recent_messages: HashMap::new(),
            recent_sends: Vec::new(),
        }
    }

    #[test]
    fn an_identical_message_is_suppressed_inside_the_window() {
        let mut state = bucket();
        let now = Instant::now();
        assert_eq!(
            decide_forward_in(&mut state, "workflow failed", now),
            ForwardDecision::Send
        );
        assert_eq!(
            decide_forward_in(&mut state, "workflow failed", now),
            ForwardDecision::DuplicateWithinWindow,
            "an n8n retry must not post the same text twice"
        );
    }

    #[test]
    fn the_same_message_sends_again_once_the_window_passes() {
        let mut state = bucket();
        let now = Instant::now();
        assert_eq!(
            decide_forward_in(&mut state, "workflow failed", now),
            ForwardDecision::Send
        );
        let later = now + DUPLICATE_SUPPRESSION_WINDOW + Duration::from_secs(1);
        assert_eq!(
            decide_forward_in(&mut state, "workflow failed", later),
            ForwardDecision::Send,
            "suppression must expire, or a recurring failure goes unreported"
        );
    }

    #[test]
    fn distinct_messages_are_not_suppressed() {
        let mut state = bucket();
        let now = Instant::now();
        assert_eq!(
            decide_forward_in(&mut state, "a", now),
            ForwardDecision::Send
        );
        assert_eq!(
            decide_forward_in(&mut state, "b", now),
            ForwardDecision::Send
        );
    }

    #[test]
    fn a_runaway_workflow_is_capped_per_minute() {
        let mut state = bucket();
        let now = Instant::now();
        // Distinct texts, so only the rate limit can stop them.
        let mut sent = 0usize;
        let mut limited = 0usize;
        for index in 0..(MAX_FORWARDS_PER_MINUTE * 2) {
            match decide_forward_in(&mut state, &format!("burst-{index}"), now) {
                ForwardDecision::Send => sent += 1,
                ForwardDecision::RateLimited => limited += 1,
                ForwardDecision::DuplicateWithinWindow => {}
            }
        }
        assert!(
            sent <= MAX_FORWARDS_PER_MINUTE,
            "sent {sent} exceeds the per-minute cap"
        );
        assert!(limited > 0, "the cap never engaged");
    }
}
