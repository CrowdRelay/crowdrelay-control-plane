mod agent_routes;
mod area_routes;
mod attention_routes;
mod auth;
mod auth_routes;
mod automation_routes;
mod config;
mod error;
mod model;
mod net_guard;
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
use axum::response::IntoResponse;
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
    /// Email relay URL for the notification topology view (read-only).
    notify_email_relay_url: Option<Arc<str>>,
    /// Shared HTTP client for outbound calls (Discord, n8n API).
    http_client: reqwest::Client,
    /// Comma-separated allow-list of origins permitted as OAuth redirect_uri
    /// targets. If empty, the redirect_uri origin must match the request Host.
    allowed_redirect_origins: Arc<[String]>,
    /// GitHub PAT with actions:write on the deploy repo. Used to trigger
    /// ecosystem-deploy for externally-owned tenants (Virya).
    github_deploy_token: Option<Arc<str>>,
    /// Repository in owner/name form hosting the ecosystem-deploy workflow.
    github_deploy_repo: Option<Arc<str>>,
    /// Cooldown window (seconds) for external deploy dispatch dedup.
    github_deploy_cooldown_seconds: i64,
    /// Secret for the billing webhook endpoint. When set, payment
    /// notifications can auto-unpark a tenant.
    billing_webhook_secret: Option<Arc<str>>,
    /// Short-lived TTL cache for read model responses. Reduces upstream
    /// fan-out load when multiple operators view the same tenant or when
    /// an auto-refresh cycle re-fetches the same model.
    read_model_cache: read_models::ReadModelCache,
    /// Process start time for uptime metrics.
    start_time: std::time::Instant,
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

    if let (Some(username), Some(password)) = (
        config.bootstrap_viewer_username.as_deref(),
        config.bootstrap_viewer_password.as_deref(),
    ) {
        let hash = auth::hash_password(password)?;
        store.ensure_bootstrap_viewer(username, &hash).await?;
        tracing::info!(username, "bootstrap platform viewer ensured");
    }

    if config.allowed_redirect_origins.is_empty() && config.agent_service_url.is_some() {
        // Without an allow-list, an OAuth `redirect_uri` is checked against
        // the request's own Host header — which the caller supplies. That is
        // the weaker of the two modes and it used to be entirely silent, so a
        // deployment that never set the variable could not tell which check
        // was running.
        tracing::warn!(
            "CONTROL_PLANE_ALLOWED_REDIRECT_ORIGINS is unset; OAuth redirect_uri is validated \
             against the request Host header instead of a fixed allow-list"
        );
    }

    let http_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("crowdrelay-control-plane")
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
            config.notify_email_relay_url.clone().map(Arc::from),
        ),
        agent_service_url: config.agent_service_url.map(Arc::from),
        n8n_base_url: config.n8n_base_url.map(Arc::from),
        n8n_api_key: config.n8n_api_key.map(Arc::from),
        discord_automation_webhook_url: config.discord_automation_webhook_url.map(Arc::from),
        notify_email_relay_url: config.notify_email_relay_url.map(Arc::from),
        http_client,
        allowed_redirect_origins: Arc::from(config.allowed_redirect_origins.as_slice()),
        github_deploy_token: config.github_deploy_token.map(Arc::from),
        github_deploy_repo: config.github_deploy_repo.map(Arc::from),
        github_deploy_cooldown_seconds: config.github_deploy_cooldown_seconds,
        billing_webhook_secret: config.billing_webhook_secret.map(Arc::from),
        read_model_cache: read_models::new_read_model_cache(),
        start_time: std::time::Instant::now(),
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
                panic_safe("notifier dispatch", || async {
                    if let Err(error) = dispatch_pending_notifications(&worker_state).await {
                        tracing::warn!(%error, "notifier dispatch pass failed");
                    }
                })
                .await;
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
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .unwrap_or_else(|_| reqwest::Client::new());
            let mut interval = tokio::time::interval(Duration::from_secs(30));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                interval.tick().await;
                panic_safe("platform health poll", || async {
                    if let Err(error) = poll_platform_health(&worker_state, &client).await {
                        tracing::warn!(%error, "platform health poll failed");
                    }
                })
                .await;
            }
        });
    }
    // Hourly retention sweeps: automation events older than 30 days, and
    // expired operator sessions. Both are cheap DELETEs on indexed columns.
    {
        let worker_state = state.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(3600));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                interval.tick().await;
                panic_safe("retention sweep", || async {
                    match worker_state.store.sweep_automation_events().await {
                        Ok(deleted) if deleted > 0 => {
                            tracing::info!(deleted, "automation event retention sweep");
                        }
                        Ok(_) => {}
                        Err(error) => {
                            tracing::warn!(%error, "automation event retention sweep failed")
                        }
                    }
                    match worker_state.store.sweep_expired_sessions().await {
                        Ok(deleted) if deleted > 0 => {
                            tracing::info!(deleted, "expired session sweep");
                        }
                        Ok(_) => {}
                        Err(error) => tracing::warn!(%error, "expired session sweep failed"),
                    }
                })
                .await;
            }
        });
    }
    // Read-model cache sweeper: prunes expired entries every 60s so the
    // map does not retain stale values for tenants that are read
    // infrequently. On-access eviction handles the hot path; this handles
    // the cold tail.
    {
        let cache = state.read_model_cache.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                interval.tick().await;
                panic_safe("cache prune", || async {
                    read_models::prune_cache(&cache).await;
                })
                .await;
            }
        });
    }
    // Connection pool sweeper: drops idle connections older than the pool
    // idle timeout every 60s. On-access eviction handles the hot path;
    // this reclaims file descriptors for inactive tenants.
    {
        let area_client = state.area_client.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                interval.tick().await;
                panic_safe("pool sweep", || async {
                    area_client.sweep_pool().await;
                })
                .await;
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
        .route_layer(middleware::from_fn(auth::require_platform_level))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_tenant_access,
        ));
    let admin_api = routes::admin_router()
        .merge(scoped(routes::tenant_admin_router()))
        .merge(scoped(routes::operator_admin_router()))
        .merge(scoped(runtime_routes::router()))
        .merge(superadmin_area)
        .merge(scoped(attention_routes::router()))
        .merge(scoped(operations_routes::router()))
        .merge(scoped(agent_routes::router()))
        .merge(scoped(read_models::router()))
        .merge(
            read_models::global_router()
                .route_layer(middleware::from_fn(auth::require_platform_level)),
        )
        .merge(scoped(notify_routes::router()))
        .merge(scoped(automation_routes::operator_router()))
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
        .merge(automation_api)
        .merge(routes::billing_router());

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
        .route("/healthz/deps", get(deps_health))
        .route("/metrics", get(metrics))
        .nest("/api/v1", api)
        .nest_service(
            "/assets",
            ServeDir::new(config.frontend_dist.join("assets")),
        )
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
    use axum::http::{HeaderValue, header};
    let asset_request = request.uri().path().starts_with("/assets/");
    let mut response = next.run(request).await;
    let successful_asset = asset_request && response.status().is_success();
    let html_response = response
        .headers()
        .get(header::CONTENT_TYPE)
        .is_some_and(|value| value.as_bytes().starts_with(b"text/html"));
    let headers = response.headers_mut();
    if successful_asset {
        headers.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=31536000, immutable"),
        );
    } else if asset_request {
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    } else if html_response {
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    } else {
        // All API responses (JSON, 204, etc.) are private and never cached.
        // Without this, a browser back-navigation may serve a stale API
        // response from its bfcache, showing outdated state after a mutation.
        headers.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("private, no-store"),
        );
    }
    for (name, value) in [
        (
            "content-security-policy",
            "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
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

/// Wraps an async block in `catch_unwind` so a panic in a background sweeper
/// loop body logs an error and continues to the next iteration instead of
/// killing the task silently. Without this, a single `unwrap()` on `None`
/// in any background loop permanently disables that sweeper.
async fn panic_safe<F, Fut>(label: &'static str, f: F)
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    use futures_util::FutureExt;
    use std::panic::AssertUnwindSafe;
    if let Err(payload) = AssertUnwindSafe(f()).catch_unwind().await {
        let msg = payload
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| payload.downcast_ref::<String>().map(String::as_str))
            .unwrap_or("unknown panic");
        tracing::error!(
            task = label,
            panic = msg,
            "background task panicked, continuing next iteration"
        );
    }
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

/// Soft dependency health: checks each external dependency independently and
/// reports status without failing the whole probe. Returns 200 if all deps
/// are reachable, 503 if any are down. The body is a JSON object with per-dep
/// status and latency, so an operator can see exactly which dependency is
/// degraded without reading logs.
async fn deps_health(
    axum::extract::State(state): axum::extract::State<AppState>,
) -> axum::response::Response {
    use std::time::Instant;
    let mut deps = serde_json::Map::new();
    let mut all_ok = true;

    // Postgres — hard dependency
    let start = Instant::now();
    let pg_ok = state.store.ping().await.is_ok();
    let pg_latency = start.elapsed().as_millis();
    deps.insert(
        "postgres".to_owned(),
        json!({
            "status": if pg_ok { "ok" } else { "down" },
            "latency_ms": pg_latency,
        }),
    );
    if !pg_ok {
        all_ok = false;
    }

    // n8n — soft dependency (automation events). Not configured is not
    // "down": report "not_configured" so the operator knows it's optional.
    if let Some(base_url) = state.n8n_base_url.as_deref() {
        let start = Instant::now();
        let n8n_ok = state
            .http_client
            .get(format!("{}/healthz", base_url.trim_end_matches('/')))
            .timeout(std::time::Duration::from_secs(3))
            .send()
            .await
            .is_ok_and(|r| r.status().is_success());
        let n8n_latency = start.elapsed().as_millis();
        deps.insert(
            "n8n".to_owned(),
            json!({
                "status": if n8n_ok { "ok" } else { "down" },
                "latency_ms": n8n_latency,
            }),
        );
        if !n8n_ok {
            all_ok = false;
        }
    } else {
        deps.insert("n8n".to_owned(), json!({"status": "not_configured"}));
    }

    let status = if all_ok {
        axum::http::StatusCode::OK
    } else {
        axum::http::StatusCode::SERVICE_UNAVAILABLE
    };
    (status, Json(json!({"all_ok": all_ok, "deps": deps}))).into_response()
}

/// Prometheus-format metrics endpoint. Exposes basic process and runtime
/// metrics for scraping by Prometheus/VictoriaMetrics. No auth — the edge
/// (Caddy) controls access to this path in production.
async fn metrics(
    axum::extract::State(state): axum::extract::State<AppState>,
) -> axum::response::Response {
    let mut lines = Vec::new();

    // Process metrics
    lines.push("# HELP control_plane_uptime_seconds Time since the process started.".to_owned());
    lines.push("# TYPE control_plane_uptime_seconds counter".to_owned());
    let uptime = state.start_time.elapsed().as_secs();
    lines.push(format!("control_plane_uptime_seconds {uptime}"));

    // Tenant count
    lines.push("# HELP control_plane_tenants Total number of tenants.".to_owned());
    lines.push("# TYPE control_plane_tenants gauge".to_owned());
    let tenant_count = state.store.tenant_count().await.unwrap_or(0);
    lines.push(format!("control_plane_tenants {tenant_count}"));

    // Notification queue depth
    lines.push(
        "# HELP control_plane_notification_queue_depth Pending notifications in the outbox."
            .to_owned(),
    );
    lines.push("# TYPE control_plane_notification_queue_depth gauge".to_owned());
    let pending = state.store.pending_notification_count().await.unwrap_or(0);
    lines.push(format!("control_plane_notification_queue_depth {pending}"));

    // Platform health services
    lines.push(
        "# HELP control_plane_platform_services_total Total configured platform services."
            .to_owned(),
    );
    lines.push("# TYPE control_plane_platform_services_total gauge".to_owned());
    let services = state
        .store
        .platform_health_summary()
        .await
        .unwrap_or_default();
    let healthy = services.iter().filter(|(_, h, _)| *h).count();
    lines.push(format!(
        "control_plane_platform_services_total {}",
        services.len()
    ));
    lines.push(
        "# HELP control_plane_platform_services_healthy Healthy platform services.".to_owned(),
    );
    lines.push("# TYPE control_plane_platform_services_healthy gauge".to_owned());
    lines.push(format!("control_plane_platform_services_healthy {healthy}"));

    (
        [(
            axum::http::header::CONTENT_TYPE,
            "text/plain; version=0.0.4",
        )],
        lines.join("\n") + "\n",
    )
        .into_response()
}

/// One bounded delivery pass: claim, send, record. Errors never propagate —
/// the outbox row's backoff is the retry policy.
async fn dispatch_pending_notifications(state: &AppState) -> anyhow::Result<()> {
    let notifications = state.store.claim_due_notifications(8).await?;
    if !notifications.is_empty() {
        tracing::debug!(count = notifications.len(), "notifier dispatch pass");
    }
    for notification in notifications {
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
/// unhealthy with the status text, never propagated. Probes run concurrently
/// to avoid serial latency when one service is slow.
///
/// A 200 response is healthy only if the body is valid JSON with a
/// `"status": "ok"` field — a bare substring match would let "not ok" or
/// broken HTML register as healthy. Failures are classified so the operator
/// can tell a timeout from a transport error from a malformed response.
/// Accepts both `"status":"ok"` (n8n) and `"status":"ready"` (CrowdRelay API)
/// as healthy — they use different health endpoint vocabularies.
async fn poll_platform_health(state: &AppState, client: &reqwest::Client) -> anyhow::Result<()> {
    use futures_util::future::join_all;
    let services = state.store.list_platform_health().await?;
    let futures: Vec<_> = services
        .into_iter()
        .map(|service| {
            let client = client.clone();
            async move {
                let start = std::time::Instant::now();
                let result = client.get(&service.url).send().await;
                let latency_ms = i32::try_from(start.elapsed().as_millis()).unwrap_or(i32::MAX);
                let (healthy, status) = match result {
                    Ok(response) => {
                        let code = response.status().as_u16();
                        if response.status().is_success() {
                            // Cap the body at 64 KiB to bound memory and parse
                            // time. A health endpoint should return a small JSON
                            // object; a 64 KiB body is already a red flag.
                            // Check Content-Length first to avoid buffering a
                            // multi-megabyte response into memory.
                            const MAX_HEALTH_BODY: usize = 64 * 1024;
                            let content_length = response
                                .headers()
                                .get(reqwest::header::CONTENT_LENGTH)
                                .and_then(|v| v.to_str().ok())
                                .and_then(|s| s.parse::<usize>().ok());
                            if content_length.is_some_and(|len| len > MAX_HEALTH_BODY) {
                                (false, format!("{code}:oversized_response"))
                            } else {
                                let bytes = response.bytes().await.unwrap_or_default();
                                let body = if bytes.len() <= MAX_HEALTH_BODY {
                                    String::from_utf8_lossy(&bytes).into_owned()
                                } else {
                                    String::from_utf8_lossy(&bytes[..MAX_HEALTH_BODY]).into_owned()
                                };
                                // Parse the body as JSON and check the status field.
                                // A non-JSON body (e.g. HTML error page from a
                                // misconfigured proxy) is malformed, not healthy.
                                // Accept both "ok" (n8n) and "ready" (CrowdRelay API)
                                // as healthy — they use different health endpoint vocabularies.
                                let ok = serde_json::from_str::<serde_json::Value>(&body)
                                    .ok()
                                    .and_then(|v| {
                                        v.get("status")
                                            .and_then(|s| s.as_str())
                                            .map(|s| s == "ok" || s == "ready")
                                    })
                                    .unwrap_or(false);
                                let label = if ok { "healthy" } else { "malformed_response" };
                                let status_text = truncate_at_char_boundary(&body, 120);
                                (ok, format!("200:{label}:{status_text}"))
                            }
                        } else {
                            (false, format!("{code}:http_unhealthy"))
                        }
                    }
                    Err(error) => {
                        // Classify the transport error: timeout vs connection
                        // vs other. reqwest exposes is_timeout() and is_connect().
                        let kind = if error.is_timeout() {
                            "timeout"
                        } else if error.is_connect() {
                            "connect_failed"
                        } else {
                            "transport_error"
                        };
                        (false, format!("{kind}:{}", error))
                    }
                };
                (service.service, healthy, status, latency_ms)
            }
        })
        .collect();
    let results = join_all(futures).await;
    let healthy_count = results.iter().filter(|(_, h, _, _)| *h).count();
    let total = results.len();
    if total > 0 {
        tracing::debug!(
            healthy = healthy_count,
            total,
            "platform health poll complete"
        );
    }
    for (service, healthy, status, latency_ms) in results {
        // Each health row is persisted independently — one service's DB
        // upsert failure must not prevent later services from recording
        // their state. A failed upsert is logged, not propagated.
        if let Err(error) = state
            .store
            .upsert_platform_health(&service, healthy, &status, Some(latency_ms))
            .await
        {
            tracing::warn!(%service, error = %error, "platform health upsert failed");
        }
    }
    Ok(())
}

/// Truncate at a char boundary to avoid splitting multi-byte UTF-8.
fn truncate_at_char_boundary(s: &str, max: usize) -> &str {
    if s.len() <= max {
        return s;
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}
