mod area_routes;
mod attention_routes;
mod auth;
mod config;
mod error;
mod model;
mod operations_routes;
mod read_models;
mod routes;
mod runtime_routes;
mod store;
mod tenant_area_client;
mod validation;

use std::{sync::Arc, time::Duration};

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

    let state = AppState {
        store,
        admin_token_hash: config.admin_token_hash,
        telemetry_token_hash: config.telemetry_token_hash,
        provisioner_token_hash: config.provisioner_token_hash,
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
    };
    let admin_api = routes::admin_router()
        .merge(runtime_routes::router())
        .merge(area_routes::router())
        .merge(attention_routes::router())
        .merge(operations_routes::router())
        .merge(read_models::router())
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_admin,
        ));
    let telemetry_api = routes::telemetry_router().route_layer(middleware::from_fn_with_state(
        state.clone(),
        auth::require_telemetry,
    ));
    let provisioner_api = routes::provisioner_router().route_layer(middleware::from_fn_with_state(
        state.clone(),
        auth::require_provisioner,
    ));
    let api = Router::new()
        .merge(admin_api)
        .merge(telemetry_api)
        .merge(provisioner_api);

    let index = config.frontend_dist.join("index.html");
    let static_files = ServeDir::new(&config.frontend_dist).fallback(ServeFile::new(index));
    let app = Router::new()
        .route(
            "/healthz/live",
            get(|| async { Json(json!({"status":"ok"})) }),
        )
        .route("/healthz/ready", get(ready))
        .nest("/api/v1", api)
        .fallback_service(static_files)
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(config.bind).await?;
    tracing::info!(address = %config.bind, "CrowdRelay Control Plane listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
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
