mod agent_routes;
mod area_routes;
mod attention_routes;
mod auth;
mod auth_routes;
mod automation_routes;
mod config;
mod error;
mod model;
mod notifier_client;
mod notify_routes;
mod operations_routes;
mod read_models;
mod routes;
mod runtime_routes;
mod store;
mod tenant_area_client;
mod validation;

use std::{sync::Arc, time::Duration};

use axum::http::StatusCode;
use axum::{Json, Router, middleware, routing::get};
use config::Config;
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use tower_http::{
    compression::CompressionLayer,
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
pub struct AppState {
    store: store::Store,
    admin_token_hash: [u8; 32],
    telemetry_token_hash: [u8; 32],
    provisioner_token_hash: Option<[u8; 32]>,
    automation_token_hash: Option<[u8; 32]>,
    admin_actor: Arc<str>,
    telemetry_actor: Arc<str>,
    provisioner_actor: Arc<str>,
    provisioner_default_image_tag: Option<Arc<str>>,
    provisioner_api_image: Arc<str>,
    provisioner_worker_image: Arc<str>,
    provisioner_lease_seconds: i64,
    runtime_stale_after_seconds: i64,
    area_client: tenant_area_client::TenantAreaClient,
    virya_management_url: Option<Arc<str>>,
    /// Session cookies are Secure in production; local plain-HTTP dev opts out.
    cookie_secure: bool,
    notifier: notifier_client::NotifierClient,
    agent_service_url: Option<Arc<str>>,
    /// n8n base URL for retry calls (e.g. https://n8n.virya.music).
    n8n_base_url: Option<Arc<str>>,
    /// n8n REST API key for retry calls.
    n8n_api_key: Option<Arc<str>>,
    /// Discord webhook URL for forwarding real-work automation events.
    discord_automation_webhook_url: Option<Arc<str>>,
    /// Shared HTTP client for outbound calls (Discord, n8n API).
    http_client: reqwest::Client,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer().compact())
        .init();

    let config = Config::from_env()?;
    let pool = PgPoolOptions::new()
        .max_connections(8)
        .min_connections(1)
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(Some(Duration::from_secs(10 * 60)))
        .max_lifetime(Some(Duration::from_secs(30 * 60)))
        .after_connect(|connection, _meta| {
            Box::pin(async move {
                sqlx::query("SET statement_timeout = '5s'")
                    .execute(&mut *connection)
                    .await?;
                sqlx::query("SET lock_timeout = '2s'")
                    .execute(&mut *connection)
                    .await?;
                sqlx::query("SET idle_in_transaction_session_timeout = '15s'")
                    .execute(&mut *connection)
                    .await?;
                Ok(())
            })
        })
        .connect(&config.database_url)
        .await?;
    let store = store::Store::new(pool, config.runtime_stale_after_seconds);
    store.migrate().await?;
    store
        .ensure_virya(
            config.virya_workspace_id,
            &config.virya_crowdrelay_url,
            &config.virya_signal_url,
        )
        .await?;
    if let (Some(username), Some(password)) = (
        config.bootstrap_admin_username.as_deref(),
        config.bootstrap_admin_password.as_deref(),
    ) {
        // Hash at boot, outside any request path. The env stays the password's
        // source of truth: change the env, restart, and logins follow.
        let hash = auth::hash_password(password)?;
        store.ensure_bootstrap_admin(username, &hash).await?;
        tracing::info!(username, "bootstrap platform admin ensured");
    }

    let http_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()?;
    let state = AppState {
        store,
        admin_token_hash: config.admin_token_hash,
        telemetry_token_hash: config.telemetry_token_hash,
        provisioner_token_hash: config.provisioner_token_hash,
        automation_token_hash: config.automation_token_hash,
        admin_actor: Arc::from(config.admin_actor),
        telemetry_actor: Arc::from(config.telemetry_actor),
        provisioner_actor: Arc::from(config.provisioner_actor),
        provisioner_default_image_tag: config.provisioner_default_image_tag.map(Arc::from),
        provisioner_api_image: Arc::from(config.provisioner_api_image),
        provisioner_worker_image: Arc::from(config.provisioner_worker_image),
        provisioner_lease_seconds: config.provisioner_lease_seconds,
        runtime_stale_after_seconds: config.runtime_stale_after_seconds,
        area_client: tenant_area_client::TenantAreaClient::with_management(
            config.area_management_master_key,
            config.management_master_key,
        ),
        virya_management_url: config.virya_management_url.map(Arc::from),
        cookie_secure: config.cookie_secure,
        notifier: notifier_client::NotifierClient::new(
            config.notify_email_relay_url.map(Arc::from),
        ),
        agent_service_url: config.agent_service_url.map(Arc::from),
        n8n_base_url: config.n8n_base_url.map(Arc::from),
        n8n_api_key: config.n8n_api_key.map(Arc::from),
        discord_automation_webhook_url: config.discord_automation_webhook_url.map(Arc::from),
        http_client,
    };
    // Bounded best-effort notifier delivery. Nothing in the request path
    // depends on this loop; a dead channel dies in its outbox row, not here.
    {
        let worker_state = state.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(5));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                interval.tick().await;
                if let Err(error) = dispatch_pending_notifications(&worker_state).await {
                    tracing::warn!(%error, "notifier dispatch pass failed");
                }
            }
        });
    }
    // Platform health poller: probes n8n /healthz every 30s and stores
    // the result. No auth needed — /healthz is unauthenticated. The
    // operator UI reads the stored row, never blocks on a live fetch.
    {
        let worker_state = state.clone();
        tokio::spawn(async move {
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(5))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new());
            let mut interval = tokio::time::interval(Duration::from_secs(30));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                interval.tick().await;
                if let Err(error) = poll_platform_health(&worker_state, &client).await {
                    tracing::warn!(%error, "platform health poll failed");
                }
            }
        });
    }
    // Session endpoints are public by design; everything below requires an
    // identity (admin bearer or operator session).
    let auth_api = auth_routes::router();
    // Tenant-scoped proxies get their scope enforced once, path-wide.
    let scoped = |router: Router<AppState>| {
        router.route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_tenant_access,
        ))
    };
    let superadmin_area = area_routes::router()
        .route_layer(middleware::from_fn(auth::require_platform_admin))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_tenant_access,
        ));
    let admin_api = routes::admin_router()
        .merge(routes::operator_admin_router())
        .merge(runtime_routes::router())
        .merge(superadmin_area)
        .merge(scoped(attention_routes::router()))
        .merge(scoped(operations_routes::router()))
        .merge(scoped(agent_routes::router()))
        .merge(scoped(read_models::router()))
        .merge(scoped(notify_routes::router()))
        .merge(automation_routes::operator_router())
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::authenticate,
        ));
    let telemetry_api = routes::telemetry_router().route_layer(middleware::from_fn_with_state(
        state.clone(),
        auth::require_telemetry,
    ));
    let provisioner_api = routes::provisioner_router().route_layer(middleware::from_fn_with_state(
        state.clone(),
        auth::require_provisioner,
    ));
    let automation_api = automation_routes::ingestion_router().route_layer(
        middleware::from_fn_with_state(state.clone(), auth::require_automation),
    );
    let api = Router::new()
        .merge(auth_api)
        .merge(admin_api)
        .merge(telemetry_api)
        .merge(provisioner_api)
        .merge(automation_api);

    let index = config.frontend_dist.join("index.html");
    let static_files = ServeDir::new(&config.frontend_dist).fallback(ServeFile::new(index));
    // Unknown API paths must not fall through to the SPA: a typo'd API URL is
    // a JSON 404, never HTML with a misleading 200. Deep links still get the
    // index with its 200 status.
    // Unknown /api/v1 paths answer as API (JSON 404); matched routes and SPA
    // deep links are untouched. Scoping the fallback to the nested router is
    // what keeps it from swallowing every /api request.
    let api =
        api.fallback(|| async { (StatusCode::NOT_FOUND, Json(json!({"detail": "not found"}))) });
    let app = Router::new()
        .route(
            "/healthz/live",
            get(|| async { Json(json!({"status":"ok"})) }),
        )
        .route("/healthz/ready", get(ready))
        .nest("/api/v1", api)
        .fallback_service(static_files)
        .layer(CompressionLayer::new())
        .layer(middleware::from_fn(security_headers))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(config.bind).await?;
    tracing::info!(address = %config.bind, "CrowdRelay Control Plane listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

/// Defense in depth for paths that reach this binary without the edge
/// Caddyfile: the same content-security posture the edge applies, so a local,
/// tunnel or compose deployment does not serve the panel unprotected.
async fn security_headers(
    request: axum::extract::Request,
    next: middleware::Next,
) -> axum::response::Response {
    use axum::http::HeaderValue;
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    for (name, value) in [
        (
            "content-security-policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        ),
        ("x-content-type-options", "nosniff"),
        ("x-frame-options", "DENY"),
        ("referrer-policy", "no-referrer"),
        (
            "permissions-policy",
            "camera=(), microphone=(), geolocation=()",
        ),
    ] {
        if let Ok(value) = HeaderValue::from_str(value) {
            headers.insert(name, value);
        }
    }
    response
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        use tokio::signal::unix::{SignalKind, signal};
        if let Ok(mut signal) = signal(SignalKind::terminate()) {
            signal.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = terminate => {} }
}

async fn ready(
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Result<Json<serde_json::Value>, error::ApiError> {
    state.store.ping().await?;
    Ok(Json(json!({"status":"ready"})))
}

/// One bounded delivery pass: claim, send, record. Errors never propagate —
/// the outbox row's backoff is the retry policy.
async fn dispatch_pending_notifications(state: &AppState) -> anyhow::Result<()> {
    for notification in state.store.claim_due_notifications(8).await? {
        let outcome = state
            .notifier
            .deliver(
                &notification.kind,
                &notification.label,
                &notification.config,
                &notification.event,
                &notification.payload,
            )
            .await;
        match outcome {
            Ok(()) => {
                state
                    .store
                    .complete_notification(notification.id, None)
                    .await?
            }
            Err(error) => {
                tracing::warn!(id = %notification.id, %error, "notifier delivery failed");
                state
                    .store
                    .complete_notification(notification.id, Some(&error))
                    .await?;
            }
        }
    }
    Ok(())
}

/// Probe every registered platform service and persist the result. Each
/// probe is a single GET with a 5s timeout; failures are recorded as
/// unhealthy with the status text, never propagated.
async fn poll_platform_health(state: &AppState, client: &reqwest::Client) -> anyhow::Result<()> {
    let services = state.store.list_platform_health().await?;
    for service in services {
        let start = std::time::Instant::now();
        let result = client.get(&service.url).send().await;
        let latency_ms = i32::try_from(start.elapsed().as_millis()).unwrap_or(i32::MAX);
        let (healthy, status) = match result {
            Ok(response) => {
                let code = response.status().as_u16();
                if response.status().is_success() {
                    let body = response.text().await.unwrap_or_default();
                    // n8n /healthz returns {"status":"ok"}. Match the JSON
                    // field, not a bare substring — "not ok" or "broken"
                    // must not register as healthy.
                    let ok =
                        body.contains("\"status\":\"ok\"") || body.contains("\"status\": \"ok\"");
                    let status_text = if body.len() <= 120 {
                        body.clone()
                    } else {
                        // Truncate at a char boundary to avoid splitting
                        // multi-byte UTF-8.
                        let mut end = 120;
                        while end > 0 && !body.is_char_boundary(end) {
                            end -= 1;
                        }
                        body[..end].to_owned()
                    };
                    (ok, format!("200:{status_text}"))
                } else {
                    (false, format!("{code}"))
                }
            }
            Err(error) => (false, format!("error:{}", error)),
        };
        state
            .store
            .upsert_platform_health(&service.service, healthy, &status, Some(latency_ms))
            .await?;
    }
    Ok(())
}
