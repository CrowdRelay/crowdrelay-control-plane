//! Hardened server-to-server transport for tenant upstream.
//!
//! The browser never receives this credential. Only bare private/loopback
//! HTTP origins are accepted, redirects are refused, and response bodies are
//! bounded before JSON parsing.

use std::{collections::HashMap, net::IpAddr, sync::Arc, time::Duration};

use serde_json::Value;
use sha2::{Digest, Sha256};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    sync::Mutex,
    time::timeout,
};
use url::Url;
use uuid::Uuid;

use crate::error::ApiError;

const AREA_NAMESPACE: &[u8] = b"crowdrelay-area-admin-v1:";
const CONTROL_PLANE_NAMESPACE: &[u8] = b"crowdrelay-control-plane-v1:";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);

/// Maximum idle connections kept per upstream target (host:port). Matches the
/// command center's concurrency semaphore — enough for the worst-case fan-out
/// without holding idle file descriptors open indefinitely.
const POOL_MAX_PER_TARGET: usize = 4;

/// A connection idle longer than this is closed when next encountered. Sweeping
/// on access avoids a background task and naturally reclaims connections after
/// a burst of traffic subsides.
const POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(30);

/// Capability classes for scoped agent-service bearer tokens.
///
/// A token intended for read-only operations cannot write credentials,
/// publish to Reddit, or dispatch paid tasks. Each capability is a separate
/// HMAC token, so a leaked `read` token exposes metadata only.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AgentCapability {
    Read,
    Dispatch,
    Credentials,
    /// Used by the CrowdRelay worker, not the control plane. Kept here so
    /// the capability vocabulary has one source of truth across services.
    #[allow(dead_code)]
    SocialPublish,
}

impl AgentCapability {
    fn as_str(self) -> &'static str {
        match self {
            Self::Read => "read",
            Self::Dispatch => "dispatch",
            Self::Credentials => "credentials",
            Self::SocialPublish => "social_publish",
        }
    }
}
/// Must exceed CrowdRelay's per-query operation_timeout (5s) so the proxy
/// does not race the upstream and return 503 while CrowdRelay is still
/// working within its own budget.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_RESPONSE_BYTES: usize = 1024 * 1024;

/// Keep-alive connection pool for upstream tenant calls. Keyed by
/// `host:port`; each entry is a stream and the instant it was last used.
/// Connections older than [`POOL_IDLE_TIMEOUT`] are dropped on access.
type ConnectionPool = Arc<Mutex<HashMap<String, Vec<(std::time::Instant, TcpStream)>>>>;

#[derive(Clone)]
pub struct TenantAreaClient {
    master_key: Option<Arc<str>>,
    management_master_key: Option<Arc<str>>,
    pool: ConnectionPool,
}

pub(crate) struct ManagementRequest<'a> {
    pub method: &'a str,
    pub path: &'a str,
    pub body: Option<&'a Value>,
    pub correlation_id: Option<&'a str>,
    pub idempotency_key: Option<&'a str>,
}

impl TenantAreaClient {
    #[cfg(test)]
    #[must_use]
    pub fn new(master_key: Option<String>) -> Self {
        Self {
            master_key: master_key.map(Arc::from),
            management_master_key: None,
            pool: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    #[must_use]
    pub fn with_management(
        master_key: Option<String>,
        management_master_key: Option<String>,
    ) -> Self {
        Self {
            master_key: master_key.map(Arc::from),
            management_master_key: management_master_key.map(Arc::from),
            pool: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn derived_token(&self, tenant_id: Uuid) -> Result<String, ApiError> {
        derived_token(
            self.master_key.as_deref(),
            AREA_NAMESPACE,
            tenant_id,
            "upstream is not configured",
        )
    }

    pub fn derived_management_token(&self, tenant_id: Uuid) -> Result<String, ApiError> {
        derived_token(
            self.management_master_key.as_deref(),
            CONTROL_PLANE_NAMESPACE,
            tenant_id,
            "tenant operations are not configured",
        )
    }

    /// Derives a capability-scoped management token for the agent service.
    ///
    /// `token = hex(HMAC-SHA256(master_key, namespace + workspace_id + ":" + capability))`
    ///
    /// The agent service verifies the token against the required capability
    /// for each route, so a token derived for `Read` cannot authorize a
    /// `Credentials` or `SocialPublish` operation.
    pub fn derived_management_token_with_capability(
        &self,
        tenant_id: Uuid,
        capability: AgentCapability,
    ) -> Result<String, ApiError> {
        derived_token_with_capability(
            self.management_master_key.as_deref(),
            CONTROL_PLANE_NAMESPACE,
            tenant_id,
            capability,
            "tenant operations are not configured",
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn request(
        &self,
        tenant_id: Uuid,
        base_url: &str,
        method: &str,
        path_and_query: &str,
        body: Option<&Value>,
        correlation_id: Option<&str>,
        idempotency_key: Option<&str>,
    ) -> Result<Value, ApiError> {
        let area_path = path_and_query
            .split_once('?')
            .map_or(path_and_query, |(path, _)| path);
        if path_and_query.len() > 2_048
            || !(area_path == "/v1/control-plane/area"
                || area_path.starts_with("/v1/control-plane/area/"))
            || contains_request_whitespace(path_and_query)
        {
            return Err(ApiError::InvalidInput("invalid upstream path".to_owned()));
        }
        if !matches!(method, "GET" | "POST" | "PATCH" | "DELETE") {
            return Err(ApiError::InvalidInput("invalid upstream method".to_owned()));
        }
        // Idempotency keys are required for mutations, optional for GETs.
        if matches!(method, "POST" | "PATCH" | "DELETE")
            && idempotency_key.is_some_and(|k| !valid_idempotency_key(k))
        {
            return Err(ApiError::InvalidInput(
                "valid Idempotency-Key is required for AREA mutations".to_owned(),
            ));
        }
        let token = self.derived_token(tenant_id)?;
        request_authorized(
            &self.pool,
            base_url,
            method,
            path_and_query,
            body,
            correlation_id,
            idempotency_key,
            &token,
        )
        .await
    }

    pub async fn request_management(
        &self,
        tenant_id: Uuid,
        base_url: &str,
        request: ManagementRequest<'_>,
    ) -> Result<Value, ApiError> {
        if !valid_operations_request(request.method, request.path)
            || contains_request_whitespace(request.path)
        {
            return Err(ApiError::InvalidInput(
                "invalid tenant operations request".to_owned(),
            ));
        }
        if matches!(request.method, "POST")
            && !request.idempotency_key.is_some_and(valid_idempotency_key)
        {
            return Err(ApiError::InvalidInput(
                "valid Idempotency-Key is required for tenant operation mutations".to_owned(),
            ));
        }
        if request
            .idempotency_key
            .is_some_and(|value| !valid_idempotency_key(value))
        {
            return Err(ApiError::InvalidInput("invalid Idempotency-Key".to_owned()));
        }
        let token = self.derived_management_token(tenant_id)?;
        request_authorized(
            &self.pool,
            base_url,
            request.method,
            request.path,
            request.body,
            request.correlation_id,
            request.idempotency_key,
            &token,
        )
        .await
    }

    /// Drop all idle connections older than [`POOL_IDLE_TIMEOUT`] from every
    /// target bucket. Called by a background sweeper so file descriptors for
    /// inactive tenants do not linger indefinitely.
    pub async fn sweep_pool(&self) {
        let mut entries = self.pool.lock().await;
        let now = std::time::Instant::now();
        for bucket in entries.values_mut() {
            bucket.retain(|(idle_since, _)| now.duration_since(*idle_since) <= POOL_IDLE_TIMEOUT);
        }
        // Drop empty buckets so the map does not grow with one entry per
        // tenant target ever visited.
        entries.retain(|_, bucket| !bucket.is_empty());
    }
}

fn derived_token(
    master_key: Option<&str>,
    namespace: &[u8],
    tenant_id: Uuid,
    missing_message: &'static str,
) -> Result<String, ApiError> {
    let master_key = master_key.ok_or_else(|| ApiError::Unavailable(missing_message.to_owned()))?;
    let mut message = Vec::with_capacity(namespace.len() + 36);
    message.extend_from_slice(namespace);
    message.extend_from_slice(tenant_id.to_string().as_bytes());
    Ok(hex(&hmac_sha256(master_key.as_bytes(), &message)))
}

/// Same as `derived_token` but appends `":" + capability` to the HMAC
/// message, producing a capability-scoped token.
fn derived_token_with_capability(
    master_key: Option<&str>,
    namespace: &[u8],
    tenant_id: Uuid,
    capability: AgentCapability,
    missing_message: &'static str,
) -> Result<String, ApiError> {
    let master_key = master_key.ok_or_else(|| ApiError::Unavailable(missing_message.to_owned()))?;
    let cap = capability.as_str();
    let mut message = Vec::with_capacity(namespace.len() + 36 + 1 + cap.len());
    message.extend_from_slice(namespace);
    message.extend_from_slice(tenant_id.to_string().as_bytes());
    message.push(b':');
    message.extend_from_slice(cap.as_bytes());
    Ok(hex(&hmac_sha256(master_key.as_bytes(), &message)))
}

fn contains_request_whitespace(value: &str) -> bool {
    value
        .chars()
        .any(|character| matches!(character, '\r' | '\n' | ' ' | '\t'))
}

fn one_safe_segment(path: &str, prefix: &str) -> bool {
    path.strip_prefix(prefix).is_some_and(|segment| {
        !segment.is_empty()
            && segment.len() <= 96
            && segment.bytes().all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_' || byte == b'-'
            })
    })
}

/// Like `one_safe_segment` but with a suffix after the safe segment.
/// Matches paths like `{prefix}{safe_segment}{suffix}`.
fn safe_segment_between(path: &str, prefix: &str, suffix: &str) -> bool {
    path.strip_prefix(prefix)
        .and_then(|tail| tail.strip_suffix(suffix))
        .is_some_and(|segment| {
            !segment.is_empty()
                && segment.len() <= 96
                && segment.bytes().all(|byte| {
                    byte.is_ascii_lowercase()
                        || byte.is_ascii_digit()
                        || byte == b'_'
                        || byte == b'-'
                })
        })
}

fn uuid_segment_between(path: &str, prefix: &str, suffix: &str) -> bool {
    path.strip_prefix(prefix)
        .and_then(|tail| tail.strip_suffix(suffix))
        .is_some_and(|segment| !segment.is_empty() && Uuid::parse_str(segment).is_ok())
}

fn timeline_segment(path: &str) -> bool {
    path.strip_prefix("/v1/control-plane/ops/operations/")
        .is_some_and(|segment| {
            !segment.is_empty()
                && segment.len() <= 128
                && segment.bytes().all(|byte| {
                    byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':')
                })
        })
}

/// Matches trace timeline paths: /v1/control-plane/ops/trace/{uuid}
fn trace_segment(path: &str) -> bool {
    uuid_segment_between(path, "/v1/control-plane/ops/trace/", "")
}

/// Matches fan tag mutation paths:
/// `/v1/control-plane/audience/fans/{uuid}/tags/{tag}` (add)
/// `/v1/control-plane/audience/fans/{uuid}/tags/{tag}/remove` (remove)
fn fan_tag_path(path: &str) -> bool {
    let prefix = "/v1/control-plane/audience/fans/";
    let Some(tail) = path.strip_prefix(prefix) else {
        return false;
    };
    // Find the `/tags/` separator after the fan UUID.
    let Some(tags_pos) = tail.find("/tags/") else {
        return false;
    };
    let fan_id = &tail[..tags_pos];
    if !Uuid::parse_str(fan_id).is_ok() {
        return false;
    }
    let tag_part = &tail[tags_pos + 6..]; // skip "/tags/"
    // tag_part is `{tag}` or `{tag}/remove`
    let tag = tag_part.strip_suffix("/remove").unwrap_or(tag_part);
    // Mirrors CrowdRelay's `valid_tag()`: lowercase or digit start, then
    // lowercase / digit / `:` / `_` / `-`, max 64 chars, no spaces.
    let mut chars = tag.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    tag.len() <= 64
        && (first.is_ascii_lowercase() || first.is_ascii_digit())
        && chars
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, ':' | '_' | '-'))
}

fn valid_operations_request(method: &str, path: &str) -> bool {
    match method {
        "GET" => {
            matches!(
                path,
                "/v1/control-plane/ops/summary"
                    | "/v1/control-plane/ops/signal-overview"
                    | "/v1/control-plane/ops/attention"
                    | "/v1/control-plane/ops/outbox"
                    | "/v1/control-plane/ops/deliveries"
                    | "/v1/control-plane/ops/delivery-results"
                    | "/v1/control-plane/ecosystem/flags"
                    | "/v1/control-plane/autopilot/overview"
                    | "/v1/control-plane/autopilot/growth"
                    | "/v1/control-plane/autopilot/next-best-actions"
                    | "/v1/control-plane/autopilot/scorecard"
                    | "/v1/control-plane/autopilot/reply-triage"
                    | "/v1/control-plane/autopilot/growth-metrics/coverage"
                    | "/v1/control-plane/autopilot/growth-metrics/trends"
                    | "/v1/control-plane/autopilot/objectives"
                    | "/v1/control-plane/autopilot/posture"
                    | "/v1/control-plane/autopilot/growth-envelope"
                    | "/v1/control-plane/autopilot/acquisition-channels"
                    | "/v1/control-plane/autopilot/tour-economics"
                    | "/v1/control-plane/autopilot/show-economics"
                    | "/v1/control-plane/autopilot/chief-of-staff"
                    | "/v1/control-plane/autopilot/outreach/candidates"
                    | "/v1/control-plane/autopilot/booking-discovery/candidates"
                    | "/v1/control-plane/autopilot/beacon-signal"
                    | "/v1/control-plane/autopilot/beacon-signal/candidates"
                    | "/v1/control-plane/autopilot/beacon-press-requests"
                    | "/v1/control-plane/autopilot/beacon-press-assets"
                    | "/v1/control-plane/autopilot/beacon-signal-engagements"
                    | "/v1/control-plane/autopilot/beacon-coverage"
                    | "/v1/control-plane/autopilot/beacon-network"
                    | "/v1/control-plane/autopilot/beacon-release-campaigns"
                    | "/v1/control-plane/autopilot/plays"
                    | "/v1/control-plane/autopilot/learning-loop"
                    | "/v1/control-plane/portfolio/overview"
                    | "/v1/control-plane/portfolio/amplification"
                    | "/v1/control-plane/tenant-settings"
                    | "/v1/control-plane/tenant-settings/north-stars"
                    | "/v1/control-plane/fanbases"
                    | "/v1/control-plane/fanbases/connections"
                    | "/v1/control-plane/webhook-endpoints"
                    | "/v1/control-plane/audience/overview"
                    | "/v1/control-plane/audience/fans"
                    | "/v1/control-plane/audience/segments"
                    | "/v1/control-plane/ops/actions"
                    | "/v1/control-plane/community-intelligence/communities"
                    | "/v1/control-plane/audience-graph/places"
                    | "/v1/control-plane/autopilot/cycle/preview"
            ) || path.starts_with("/v1/control-plane/audience-graph/places?")
                || path.starts_with("/v1/control-plane/ops/outbox?")
                || path.starts_with("/v1/control-plane/ops/deliveries?")
                || path.starts_with("/v1/control-plane/ops/actions?")
                || path.starts_with("/v1/control-plane/audience/fans?")
                || path.starts_with("/v1/control-plane/autopilot/outreach/candidates?")
                || path.starts_with("/v1/control-plane/autopilot/booking-discovery/candidates?")
                || uuid_segment_between(path, "/v1/control-plane/ops/deliveries/", "")
                || uuid_segment_between(path, "/v1/control-plane/ops/actions/", "")
                || uuid_segment_between(path, "/v1/control-plane/audience/fans/", "")
                || uuid_segment_between(path, "/v1/control-plane/audience/fans/", "/journey")
                || safe_segment_between(path, "/v1/control-plane/audience/segments/", "/preview")
                || uuid_segment_between(
                    path,
                    "/v1/control-plane/autopilot/beacon-release-campaigns/",
                    "/recipients",
                )
                || uuid_segment_between(path, "/v1/control-plane/autopilot/decisions/", "/evidence")
                || uuid_segment_between(
                    path,
                    "/v1/control-plane/community-intelligence/communities/",
                    "/observations",
                )
                || uuid_segment_between(
                    path,
                    "/v1/control-plane/community-intelligence/communities/",
                    "/entities",
                )
                // `Draft intro` on the Communities page. The route existed on
                // both sides — `community_intro_draft` here and
                // `community_intelligence_routes.rs` upstream — but this
                // allowlist only carried the two sibling paths, so every draft
                // was refused before it left the control plane and the whole
                // page rendered its failure boundary with "invalid tenant
                // operations request". A proxy allowlist is a third place a
                // route has to be added, and nothing fails until someone
                // presses the button.
                || uuid_segment_between(
                    path,
                    "/v1/control-plane/community-intelligence/communities/",
                    "/intro-draft",
                )
                || timeline_segment(path)
                || trace_segment(path)
        }
        "POST" => {
            matches!(
                path,
                "/v1/control-plane/ops/deliveries/dead/clear"
                    | "/v1/control-plane/ecosystem/reconcile"
                    | "/v1/control-plane/autopilot/objectives"
                    | "/v1/control-plane/autopilot/posture"
                    | "/v1/control-plane/autopilot/growth-envelope"
                    | "/v1/control-plane/autopilot/beacon-network"
                    | "/v1/control-plane/autopilot/cycle/run"
            ) || uuid_segment_between(path, "/v1/control-plane/ops/outbox/", "/retry")
                || uuid_segment_between(path, "/v1/control-plane/ops/deliveries/", "/retry")
                || uuid_segment_between(path, "/v1/control-plane/ops/push/", "/retry")
                || one_safe_segment(path, "/v1/control-plane/ecosystem/flags/")
                || one_safe_segment(path, "/v1/control-plane/autopilot/policies/")
                || uuid_segment_between(path, "/v1/control-plane/autopilot/actions/", "/approve")
                || uuid_segment_between(path, "/v1/control-plane/autopilot/actions/", "/cancel")
                || uuid_segment_between(
                    path,
                    "/v1/control-plane/autopilot/decisions/",
                    "/handled-externally",
                )
                || uuid_segment_between(path, "/v1/control-plane/autopilot/objectives/", "/retire")
                || uuid_segment_between(
                    path,
                    "/v1/control-plane/autopilot/outreach/candidates/",
                    "/confirm",
                )
                || uuid_segment_between(
                    path,
                    "/v1/control-plane/autopilot/booking-discovery/candidates/",
                    "/confirm",
                )
                || uuid_segment_between(
                    path,
                    "/v1/control-plane/autopilot/beacon-press-requests/",
                    "/resolve",
                )
                // Beacon management: the roster was readable and unchangeable.
                || path == "/v1/control-plane/autopilot/beacons"
                || path == "/v1/control-plane/autopilot/beacons/signal-invites/batch"
                || uuid_segment_between(
                    path,
                    "/v1/control-plane/autopilot/beacons/",
                    "/signal-invites",
                )
                || uuid_segment_between(
                    path,
                    "/v1/control-plane/autopilot/beacons/",
                    "/signal-state",
                )
                || uuid_segment_between(path, "/v1/control-plane/autopilot/beacons/", "/reply")
                // Creating a campaign: listed, launchable and closable before
                // this, but never creatable through the proxy.
                || path == "/v1/control-plane/autopilot/beacon-release-campaigns"
                || uuid_segment_between(
                    path,
                    "/v1/control-plane/autopilot/beacon-release-campaigns/",
                    "/launch",
                )
                || uuid_segment_between(
                    path,
                    "/v1/control-plane/autopilot/beacon-release-campaigns/",
                    "/close",
                )
                || uuid_segment_between(
                    path,
                    "/v1/control-plane/portfolio/amplification/",
                    "/decide",
                )
                || one_safe_segment(path, "/v1/control-plane/tenant-settings/")
                || path == "/v1/control-plane/fanbases"
                || path == "/v1/control-plane/fanbases/connections"
                // Registering a community used to require psql against the
                // tenant database: the capability lived only under /v1/admin,
                // which this proxy deliberately cannot reach.
                || path == "/v1/control-plane/audience-graph/places"
                || path == "/v1/control-plane/audience-graph/places/import"
                || path == "/v1/control-plane/connections/discord"
                || path == "/v1/control-plane/connections/telegram"
                || path == "/v1/control-plane/connections/lastfm"
                || path == "/v1/control-plane/connections/deezer"
                || path == "/v1/control-plane/connections/discogs"
                || path == "/v1/control-plane/connections/bluesky"
                || path == "/v1/control-plane/connections/bandcamp"
                || path == "/v1/control-plane/connections/youtube"
                || path == "/v1/control-plane/connections/facebook"
                || path == "/v1/control-plane/connections/instagram"
                || path == "/v1/control-plane/connections/soundcloud"
                || path == "/v1/control-plane/connections/reddit"
                || uuid_segment_between(path, "/v1/control-plane/fanbases/", "/ingest")
                || fan_tag_path(path)
                || uuid_segment_between(path, "/v1/control-plane/audience/fans/", "/referral-code")
        }
        "DELETE" => {
            uuid_segment_between(path, "/v1/control-plane/fanbases/", "")
                || uuid_segment_between(path, "/v1/control-plane/fanbases/connections/", "")
        }
        _ => false,
    }
}

pub(crate) fn valid_idempotency_key(value: &str) -> bool {
    (8..=128).contains(&value.len()) && value.bytes().all(|byte| (b'!'..=b'~').contains(&byte))
}

#[allow(clippy::too_many_arguments)]
async fn request_authorized(
    pool: &ConnectionPool,
    base_url: &str,
    method: &str,
    path_and_query: &str,
    body: Option<&Value>,
    correlation_id: Option<&str>,
    idempotency_key: Option<&str>,
    token: &str,
) -> Result<Value, ApiError> {
    let target = validate_management_target(base_url)?;
    let host = target
        .host_str()
        .ok_or_else(|| ApiError::InvalidInput("management target has no host".to_owned()))?;
    let port = target
        .port_or_known_default()
        .ok_or_else(|| ApiError::InvalidInput("management target has no port".to_owned()))?;

    let address = format_host_port(host, port);

    // Try to reuse a pooled keep-alive connection. If none is available (or
    // all are stale), open a fresh one. A pooled stream that fails to send
    // is dropped and a new connection is attempted once.
    let mut stream = match take_pooled_stream(pool, &address).await {
        Some(s) => s,
        None => connect(&address).await?,
    };

    let body_text = body.map(Value::to_string).unwrap_or_default();
    let host_header = host_header(host, target.port(), port);
    let mut request = format!(
        "{method} {path_and_query} HTTP/1.1\r\nHost: {host_header}\r\nAuthorization: Bearer {token}\r\nAccept: application/json\r\nAccept-Encoding: gzip, deflate\r\nConnection: keep-alive\r\n"
    );
    if let Some(id) = correlation_id.filter(|id| valid_correlation_id(id)) {
        request.push_str("X-CrowdRelay-Correlation-Id: ");
        request.push_str(id);
        request.push_str("\r\n");
    }
    if let Some(key) = idempotency_key {
        request.push_str("Idempotency-Key: ");
        request.push_str(key);
        request.push_str("\r\n");
    }
    if body.is_some() {
        request.push_str("Content-Type: application/json\r\n");
    }
    if body.is_some() || matches!(method, "POST" | "PATCH") {
        request.push_str("Content-Length: ");
        request.push_str(&body_text.len().to_string());
        request.push_str("\r\n");
    }
    request.push_str("\r\n");
    request.push_str(&body_text);

    let exchange = async {
        // If the write fails the pooled stream is stale — drop it and retry
        // once with a fresh connection so a dead keep-alive socket does not
        // surface as an Unreachable to the operator.
        if stream.write_all(request.as_bytes()).await.is_err() {
            stream = connect(&address).await?;
            stream
                .write_all(request.as_bytes())
                .await
                .map_err(|_| ApiError::Unreachable)?;
        }

        let (response, can_reuse) = read_framed_response(&mut stream).await?;
        if can_reuse {
            return_pooled_stream(pool, &address, stream).await;
        }
        parse_response(&response)
    };

    timeout(REQUEST_TIMEOUT, exchange)
        .await
        .map_err(|_| ApiError::Timeout)?
}

/// Open a new TCP connection to the upstream, with the standard connect
/// timeout and error mapping.
///
/// For DNS names (not raw IP addresses), this resolves the host and verifies
/// every resolved IP is private before connecting. This closes the DNS
/// rebinding gap: a hostname that passed `is_private_target` at config time
/// could be re-pointed at a public IP between config and request. The Host
/// header continues to use the original hostname — only the TCP destination
/// is the resolved IP.
async fn connect(address: &str) -> Result<TcpStream, ApiError> {
    // Try to parse as IP:port first — if it's already an IP address, it was
    // validated by `validate_management_target` and needs no re-resolution.
    if let Ok(socket_addr) = address.parse::<std::net::SocketAddr>() {
        return timeout(CONNECT_TIMEOUT, TcpStream::connect(socket_addr))
            .await
            .map_err(|_| ApiError::Timeout)?
            .map_err(|_| ApiError::Unreachable);
    }
    // DNS name: resolve and revalidate before connecting.
    let addrs = timeout(CONNECT_TIMEOUT, tokio::net::lookup_host(address))
        .await
        .map_err(|_| ApiError::Timeout)?
        .map_err(|_| ApiError::Unreachable)?;
    let mut last_err = None;
    for socket_addr in addrs {
        if !crate::net_guard::is_private_ip(socket_addr.ip()) {
            tracing::warn!(
                address,
                ip = %socket_addr.ip(),
                "upstream DNS resolved to non-private address, refusing"
            );
            return Err(ApiError::InvalidInput(
                "upstream target resolved to non-private address".to_owned(),
            ));
        }
        match timeout(CONNECT_TIMEOUT, TcpStream::connect(&socket_addr)).await {
            Ok(Ok(stream)) => return Ok(stream),
            Ok(Err(e)) => last_err = Some(e),
            Err(_) => last_err = None,
        }
    }
    match last_err {
        Some(_) => Err(ApiError::Unreachable),
        None => Err(ApiError::Timeout),
    }
}

/// Pop an idle stream from the pool, dropping any that have been idle longer
/// than [`POOL_IDLE_TIMEOUT`]. Returns `None` if the pool is empty or all
/// entries are stale.
async fn take_pooled_stream(pool: &ConnectionPool, address: &str) -> Option<TcpStream> {
    let mut entries = pool.lock().await;
    let bucket = entries.get_mut(address)?;
    let now = std::time::Instant::now();
    // Drop stale connections from the front (oldest first).
    while let Some((idle_since, _)) = bucket.first() {
        if now.duration_since(*idle_since) > POOL_IDLE_TIMEOUT {
            bucket.remove(0);
        } else {
            break;
        }
    }
    // Pop from the back (most recently used) for cache locality.
    bucket.pop().map(|(_, stream)| stream)
}

/// Return a reusable stream to the pool. If the pool for this target is at
/// capacity, the stream is dropped — the upstream will close it on its own
/// keep-alive timeout.
async fn return_pooled_stream(pool: &ConnectionPool, address: &str, stream: TcpStream) {
    let mut entries = pool.lock().await;
    let bucket = entries.entry(address.to_owned()).or_default();
    if bucket.len() < POOL_MAX_PER_TARGET {
        bucket.push((std::time::Instant::now(), stream));
    }
    // If at capacity, the stream is dropped — the Drop closes the TCP socket.
}

/// Read a complete HTTP/1.1 response from a keep-alive stream, using
/// `Content-Length` or `Transfer-Encoding: chunked` to determine the body
/// boundary. Returns the raw response bytes and whether the stream can be
/// reused for a subsequent request.
///
/// If the upstream sends `Connection: close`, or the framing is ambiguous
/// (no Content-Length and no chunked encoding), the stream is read until
/// the peer closes it and `can_reuse` is `false`.
async fn read_framed_response(stream: &mut TcpStream) -> Result<(Vec<u8>, bool), ApiError> {
    let mut buf = Vec::with_capacity(8192);
    let mut chunk = [0_u8; 8192];

    // Phase 1: read until we have the complete header block.
    let header_end = loop {
        if let Some(pos) = find_header_terminator(&buf) {
            break pos;
        }
        let read = stream
            .read(&mut chunk)
            .await
            .map_err(|_| ApiError::Unreachable)?;
        if read == 0 {
            return Err(ApiError::ContractMismatch(
                "upstream closed before sending complete headers",
            ));
        }
        if buf.len().saturating_add(read) > MAX_RESPONSE_BYTES {
            return Err(ApiError::ContractMismatch(
                "upstream response exceeded limit",
            ));
        }
        buf.extend_from_slice(&chunk[..read]);
    };

    // Phase 2: parse the framing from the headers we have.
    let (content_length, transfer_chunked, connection_close) =
        parse_response_framing(&buf[..header_end])?;

    if connection_close {
        // The upstream will close the connection after the body — read
        // until EOF, same as the old `Connection: close` behaviour.
        loop {
            let read = stream
                .read(&mut chunk)
                .await
                .map_err(|_| ApiError::Unreachable)?;
            if read == 0 {
                break;
            }
            if buf.len().saturating_add(read) > MAX_RESPONSE_BYTES {
                return Err(ApiError::ContractMismatch(
                    "upstream response exceeded limit",
                ));
            }
            buf.extend_from_slice(&chunk[..read]);
        }
        return Ok((buf, false));
    }

    if transfer_chunked {
        // Read until we see the chunked terminator. The zero-length chunk
        // `0\r\n\r\n` must appear at a chunk boundary: either at the very
        // start of the body (first chunk is zero) or preceded by the CRLF
        // that ends the previous chunk's data (`\r\n0\r\n\r\n`). Searching
        // for `0\r\n\r\n` anywhere in the buffer would false-match the same
        // byte sequence inside chunk data (e.g. in binary or JSON content).
        let terminator = b"0\r\n\r\n";
        let body_start = header_end + 4;
        loop {
            // Check the tail for a boundary-correct terminator.
            if buf.len() >= terminator.len() && &buf[buf.len() - terminator.len()..] == terminator {
                // Accept only if it's at the body start or preceded by \r\n.
                let pos = buf.len() - terminator.len();
                if pos == body_start || (pos >= 2 && &buf[pos - 2..pos] == b"\r\n") {
                    return Ok((buf, true));
                }
            }
            // Also check if a boundary-correct terminator appeared in the
            // latest data (it might be followed by trailer headers).
            if find_chunk_terminator(&buf[body_start..]) {
                // Read a little more to capture any trailers after the
                // terminator, up to a small limit.
                let target = buf.len() + 256;
                while buf.len() < target {
                    let read = stream
                        .read(&mut chunk)
                        .await
                        .map_err(|_| ApiError::Unreachable)?;
                    if read == 0 {
                        break;
                    }
                    if buf.len().saturating_add(read) > MAX_RESPONSE_BYTES {
                        return Err(ApiError::ContractMismatch(
                            "upstream response exceeded limit",
                        ));
                    }
                    buf.extend_from_slice(&chunk[..read]);
                    // Check for the final \r\n after trailers.
                    if buf.ends_with(b"\r\n\r\n") {
                        break;
                    }
                }
                return Ok((buf, true));
            }
            let read = stream
                .read(&mut chunk)
                .await
                .map_err(|_| ApiError::Unreachable)?;
            if read == 0 {
                // Upstream closed before the chunked terminator — the
                // response is incomplete.
                return Ok((buf, false));
            }
            if buf.len().saturating_add(read) > MAX_RESPONSE_BYTES {
                return Err(ApiError::ContractMismatch(
                    "upstream response exceeded limit",
                ));
            }
            buf.extend_from_slice(&chunk[..read]);
        }
    }

    if let Some(cl) = content_length {
        // Read until we have header_end + 4 + content_length bytes.
        let needed = header_end + 4 + cl;
        while buf.len() < needed {
            let read = stream
                .read(&mut chunk)
                .await
                .map_err(|_| ApiError::Unreachable)?;
            if read == 0 {
                return Err(ApiError::ContractMismatch("truncated upstream response"));
            }
            if buf.len().saturating_add(read) > MAX_RESPONSE_BYTES {
                return Err(ApiError::ContractMismatch(
                    "upstream response exceeded limit",
                ));
            }
            buf.extend_from_slice(&chunk[..read]);
        }
        return Ok((buf, true));
    }

    // No Content-Length, no chunked, no Connection: close. This is
    // ambiguous with keep-alive — read until EOF as a fallback and do
    // not reuse the stream.
    loop {
        let read = stream
            .read(&mut chunk)
            .await
            .map_err(|_| ApiError::Unreachable)?;
        if read == 0 {
            break;
        }
        if buf.len().saturating_add(read) > MAX_RESPONSE_BYTES {
            return Err(ApiError::ContractMismatch(
                "upstream response exceeded limit",
            ));
        }
        buf.extend_from_slice(&chunk[..read]);
    }
    Ok((buf, false))
}

/// Find the position of the `\r\n\r\n` header terminator in a buffer.
fn find_header_terminator(buf: &[u8]) -> Option<usize> {
    find_subsequence(buf, b"\r\n\r\n")
}

/// Find the first occurrence of `needle` in `haystack`.
fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

/// Check if the chunked terminator `0\r\n\r\n` appears at a valid chunk
/// boundary in the body: either at the very start (first chunk is zero) or
/// preceded by the CRLF that ends the previous chunk's data.
fn find_chunk_terminator(body: &[u8]) -> bool {
    const TERM: &[u8] = b"0\r\n\r\n";
    if body.len() >= TERM.len() && &body[..TERM.len()] == TERM {
        return true;
    }
    // Search for `\r\n0\r\n\r\n` — the CRLF ending the previous chunk,
    // followed by the zero-length chunk size and the empty trailer block.
    const BOUNDARY: &[u8] = b"\r\n0\r\n\r\n";
    find_subsequence(body, BOUNDARY).is_some()
}

/// Parse `Content-Length`, `Transfer-Encoding`, and `Connection` from the
/// response header block (everything before `\r\n\r\n`).
fn parse_response_framing(header_bytes: &[u8]) -> Result<(Option<usize>, bool, bool), ApiError> {
    let head = std::str::from_utf8(header_bytes)
        .map_err(|_| ApiError::ContractMismatch("malformed upstream headers"))?;
    let mut content_length: Option<usize> = None;
    let mut transfer_chunked = false;
    let mut connection_close = false;
    // Skip the status line; iterate header lines.
    for line in head.split("\r\n").skip(1) {
        let Some((name, value)) = line.split_once(':') else {
            return Err(ApiError::ContractMismatch("malformed upstream header"));
        };
        let name = name.trim();
        let value = value.trim();
        if name.eq_ignore_ascii_case("content-length") {
            let parsed = value
                .parse::<usize>()
                .map_err(|_| ApiError::ContractMismatch("invalid upstream content length"))?;
            if content_length.replace(parsed).is_some() {
                return Err(ApiError::ContractMismatch(
                    "duplicate upstream content length",
                ));
            }
        } else if name.eq_ignore_ascii_case("transfer-encoding") {
            let encodings: Vec<&str> = value
                .split(',')
                .map(str::trim)
                .filter(|e| !e.is_empty())
                .collect();
            if encodings.len() != 1 || !encodings[0].eq_ignore_ascii_case("chunked") {
                return Err(ApiError::ContractMismatch(
                    "unsupported upstream transfer encoding",
                ));
            }
            transfer_chunked = true;
        } else if name.eq_ignore_ascii_case("connection") {
            // `Connection: close` means the stream cannot be reused.
            // Any other value (keep-alive, or absent in HTTP/1.1) allows reuse.
            if value.eq_ignore_ascii_case("close") {
                connection_close = true;
            }
        }
    }
    if transfer_chunked && content_length.is_some() {
        return Err(ApiError::ContractMismatch(
            "ambiguous upstream response framing",
        ));
    }
    Ok((content_length, transfer_chunked, connection_close))
}

fn validate_management_target(value: &str) -> Result<Url, ApiError> {
    let parsed = Url::parse(value)
        .map_err(|_| ApiError::InvalidInput("invalid upstream target".to_owned()))?;
    if parsed.scheme() != "http"
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || !matches!(parsed.path(), "" | "/")
    {
        return Err(ApiError::InvalidInput(
            "upstream target must be a bare private HTTP origin".to_owned(),
        ));
    }
    let private = crate::net_guard::is_private_target(&parsed);
    if !private {
        return Err(ApiError::InvalidInput(
            "upstream target must be loopback or private".to_owned(),
        ));
    }
    Ok(parsed)
}

fn format_host_port(host: &str, port: u16) -> String {
    match host.parse::<IpAddr>() {
        Ok(IpAddr::V6(_)) => format!("[{host}]:{port}"),
        _ => format!("{host}:{port}"),
    }
}

fn host_header(host: &str, explicit_port: Option<u16>, resolved_port: u16) -> String {
    let formatted_host = match host.parse::<IpAddr>() {
        Ok(IpAddr::V6(_)) => format!("[{host}]"),
        _ => host.to_owned(),
    };
    if explicit_port.is_some() || resolved_port != 80 {
        format!("{formatted_host}:{resolved_port}")
    } else {
        formatted_host
    }
}

fn valid_correlation_id(value: &str) -> bool {
    (8..=128).contains(&value.len()) && value.bytes().all(|byte| (b'!'..=b'~').contains(&byte))
}

fn parse_response(raw: &[u8]) -> Result<Value, ApiError> {
    let marker = b"\r\n\r\n";
    let Some(split) = raw
        .windows(marker.len())
        .position(|window| window == marker)
    else {
        return Err(ApiError::ContractMismatch("malformed upstream response"));
    };
    let head = std::str::from_utf8(&raw[..split])
        .map_err(|_| ApiError::ContractMismatch("malformed upstream headers"))?;
    let mut lines = head.split("\r\n");
    let status = lines
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|status| status.parse::<u16>().ok())
        .ok_or_else(|| ApiError::ContractMismatch("missing upstream status"))?;
    if (300..400).contains(&status) {
        return Err(ApiError::ContractMismatch("upstream redirect refused"));
    }

    let mut transfer_chunked = false;
    let mut content_length = None;
    let mut content_encoding: Option<&str> = None;
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            return Err(ApiError::ContractMismatch("malformed upstream header"));
        };
        let name = name.trim();
        let value = value.trim();
        if name.eq_ignore_ascii_case("transfer-encoding") {
            let encodings = value
                .split(',')
                .map(str::trim)
                .filter(|encoding| !encoding.is_empty())
                .collect::<Vec<_>>();
            if encodings.len() != 1 || !encodings[0].eq_ignore_ascii_case("chunked") {
                return Err(ApiError::ContractMismatch(
                    "unsupported upstream transfer encoding",
                ));
            }
            transfer_chunked = true;
        } else if name.eq_ignore_ascii_case("content-length") {
            let parsed = value
                .parse::<usize>()
                .map_err(|_| ApiError::ContractMismatch("invalid upstream content length"))?;
            if content_length.replace(parsed).is_some() {
                return Err(ApiError::ContractMismatch(
                    "duplicate upstream content length",
                ));
            }
        } else if name.eq_ignore_ascii_case("content-encoding")
            && content_encoding.replace(value).is_some()
        {
            return Err(ApiError::ContractMismatch(
                "duplicate upstream content encoding",
            ));
        }
    }
    if transfer_chunked && content_length.is_some() {
        return Err(ApiError::ContractMismatch(
            "ambiguous upstream response framing",
        ));
    }

    let wire_body = &raw[split + marker.len()..];
    let chunk_decoded;
    let body = if transfer_chunked {
        chunk_decoded = decode_chunked(wire_body)?;
        chunk_decoded.as_slice()
    } else {
        if let Some(expected) = content_length {
            if expected != wire_body.len() {
                return Err(ApiError::ContractMismatch("truncated upstream response"));
            }
        }
        wire_body
    };

    // Decompress if the upstream honoured our `Accept-Encoding: gzip, deflate`.
    // The limit applies to the decompressed body — a small compressed payload
    // must not bypass the 1 MiB ceiling via a decompression bomb.
    let decompressed;
    let body: &[u8] = match content_encoding {
        None => body,
        Some("gzip") => {
            decompressed = decompress_gzip(body)?;
            decompressed.as_slice()
        }
        Some("deflate") => {
            decompressed = decompress_deflate(body)?;
            decompressed.as_slice()
        }
        Some(_) => {
            return Err(ApiError::ContractMismatch(
                "unsupported upstream content encoding",
            ));
        }
    };
    if body.len() > MAX_RESPONSE_BYTES {
        return Err(ApiError::ContractMismatch(
            "upstream response exceeded limit",
        ));
    }

    if status == 204 {
        if body.is_empty() {
            return Ok(Value::Null);
        }
        return Err(ApiError::ContractMismatch(
            "upstream returned a body for HTTP 204",
        ));
    }

    if (200..300).contains(&status) && body.is_empty() {
        return Err(ApiError::ContractMismatch(
            "upstream returned an empty success body",
        ));
    }

    let value = if body.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(body)
            .map_err(|_| ApiError::ContractMismatch("invalid upstream JSON"))?
    };
    if (200..300).contains(&status) {
        Ok(value)
    } else if status == 404 {
        Err(ApiError::NotFound)
    } else if status == 409 {
        // CrowdRelay problems carry the reason in `detail`/`title` and no
        // machine code; surface the human reason instead of an invented one.
        let reason = value
            .get("detail")
            .and_then(Value::as_str)
            .or_else(|| value.get("title").and_then(Value::as_str))
            .unwrap_or("upstream rejected the change");
        Err(ApiError::Conflict(reason.to_owned()))
    } else if matches!(status, 400 | 422) {
        Err(ApiError::InvalidInput(
            error_code(&value).unwrap_or("AREA_INVALID").to_owned(),
        ))
    } else {
        Err(ApiError::UpstreamError(status))
    }
}

/// Decompress a gzip-encoded response body, bounded by
/// [`MAX_RESPONSE_BYTES`] on the decompressed output.
fn decompress_gzip(input: &[u8]) -> Result<Vec<u8>, ApiError> {
    use flate2::read::GzDecoder;
    use std::io::Read;
    let mut decoder = GzDecoder::new(input);
    let mut output = Vec::with_capacity(input.len() * 2);
    let mut buf = [0u8; 8192];
    loop {
        match decoder.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                output.extend_from_slice(&buf[..n]);
                if output.len() > MAX_RESPONSE_BYTES {
                    return Err(ApiError::ContractMismatch(
                        "decompressed upstream response exceeded limit",
                    ));
                }
            }
            Err(_) => {
                return Err(ApiError::ContractMismatch(
                    "malformed gzip upstream response",
                ));
            }
        }
    }
    Ok(output)
}

/// Decompress a deflate-encoded response body, bounded by
/// [`MAX_RESPONSE_BYTES`] on the decompressed output.
fn decompress_deflate(input: &[u8]) -> Result<Vec<u8>, ApiError> {
    use flate2::read::ZlibDecoder;
    use std::io::Read;
    let mut decoder = ZlibDecoder::new(input);
    let mut output = Vec::with_capacity(input.len() * 2);
    let mut buf = [0u8; 8192];
    loop {
        match decoder.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                output.extend_from_slice(&buf[..n]);
                if output.len() > MAX_RESPONSE_BYTES {
                    return Err(ApiError::ContractMismatch(
                        "decompressed upstream response exceeded limit",
                    ));
                }
            }
            Err(_) => {
                return Err(ApiError::ContractMismatch(
                    "malformed deflate upstream response",
                ));
            }
        }
    }
    Ok(output)
}

fn decode_chunked(mut input: &[u8]) -> Result<Vec<u8>, ApiError> {
    let mut output = Vec::new();
    loop {
        let Some(line_end) = input.windows(2).position(|window| window == b"\r\n") else {
            return Err(ApiError::ContractMismatch(
                "malformed chunked upstream response",
            ));
        };
        let size_line = std::str::from_utf8(&input[..line_end])
            .map_err(|_| ApiError::ContractMismatch("malformed upstream chunk size"))?;
        let size_hex = size_line.split(';').next().unwrap_or_default().trim();
        let size = usize::from_str_radix(size_hex, 16)
            .map_err(|_| ApiError::ContractMismatch("invalid upstream chunk size"))?;
        input = &input[line_end + 2..];
        if size == 0 {
            return Ok(output);
        }
        if size > MAX_RESPONSE_BYTES.saturating_sub(output.len())
            || input.len() < size.saturating_add(2)
            || &input[size..size + 2] != b"\r\n"
        {
            return Err(ApiError::ContractMismatch("invalid upstream chunk framing"));
        }
        output.extend_from_slice(&input[..size]);
        input = &input[size + 2..];
    }
}

fn error_code(value: &Value) -> Option<&str> {
    value.get("code").and_then(Value::as_str)
}

fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    let mut block = [0_u8; 64];
    if key.len() > 64 {
        let digest = Sha256::digest(key);
        block[..32].copy_from_slice(&digest);
    } else {
        block[..key.len()].copy_from_slice(key);
    }
    let mut inner_pad = [0x36_u8; 64];
    let mut outer_pad = [0x5c_u8; 64];
    for index in 0..64 {
        inner_pad[index] ^= block[index];
        outer_pad[index] ^= block[index];
    }
    let mut inner = Sha256::new();
    inner.update(inner_pad);
    inner.update(message);
    let inner = inner.finalize();
    let mut outer = Sha256::new();
    outer.update(outer_pad);
    outer.update(inner);
    outer.finalize().into()
}

fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for &byte in bytes {
        output.push(char::from(HEX[(byte >> 4) as usize]));
        output.push(char::from(HEX[(byte & 0x0f) as usize]));
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_rejects_public_and_https() {
        assert!(validate_management_target("https://127.0.0.1:8080").is_err());
        assert!(validate_management_target("http://8.8.8.8:8080").is_err());
        assert!(validate_management_target("http://127.0.0.1:8080").is_ok());
        assert!(validate_management_target("http://10.77.0.2:8080").is_ok());
    }

    #[test]
    fn derivation_is_tenant_scoped_and_matches_provisioner() {
        let client = TenantAreaClient::new(Some("01234567890123456789012345678901".to_owned()));
        let token = client.derived_token(Uuid::nil()).expect("configured");
        assert_eq!(
            token,
            "2647b07320443f8c7c4058f9cfd781e0d3e38edb9ff5bda4c29ca2dac95893d5"
        );
        assert_ne!(
            token,
            client
                .derived_token(Uuid::from_u128(1))
                .expect("configured")
        );
    }

    #[test]
    fn missing_master_key_is_unavailable() {
        let client = TenantAreaClient::new(None);
        assert!(client.derived_token(Uuid::nil()).is_err());
    }

    #[test]
    fn operations_allowlist_is_bounded_and_shape_aware() {
        let id = "550e8400-e29b-41d4-a716-446655440000";
        for path in [
            "/v1/control-plane/ops/summary",
            "/v1/control-plane/ecosystem/flags",
            "/v1/control-plane/autopilot/overview",
            "/v1/control-plane/autopilot/reply-triage",
        ] {
            assert!(valid_operations_request("GET", path), "{path}");
        }
        assert!(valid_operations_request(
            "GET",
            &format!("/v1/control-plane/ops/deliveries/{id}")
        ));
        assert!(valid_operations_request(
            "GET",
            "/v1/control-plane/ops/operations/request-1234"
        ));
        for path in [
            "/v1/control-plane/ops/deliveries/dead/clear",
            "/v1/control-plane/ecosystem/reconcile",
        ] {
            assert!(valid_operations_request("POST", path), "{path}");
        }
        assert!(valid_operations_request(
            "POST",
            &format!("/v1/control-plane/ops/outbox/{id}/retry")
        ));
        assert!(valid_operations_request(
            "POST",
            &format!("/v1/control-plane/ops/deliveries/{id}/retry")
        ));
        // Query-string list endpoints are now valid for paginated browsing.
        assert!(valid_operations_request(
            "GET",
            "/v1/control-plane/ops/outbox?status=pending&limit=50"
        ));
        assert!(valid_operations_request(
            "GET",
            "/v1/control-plane/ops/deliveries?limit=25"
        ));
        // Phase 2: outreach, booking, beacon, release, plays.
        for path in [
            "/v1/control-plane/autopilot/outreach/candidates",
            "/v1/control-plane/autopilot/booking-discovery/candidates",
            "/v1/control-plane/autopilot/beacon-signal",
            "/v1/control-plane/autopilot/beacon-signal/candidates",
            "/v1/control-plane/autopilot/beacon-press-requests",
            "/v1/control-plane/autopilot/beacon-press-assets",
            "/v1/control-plane/autopilot/beacon-signal-engagements",
            "/v1/control-plane/autopilot/beacon-coverage",
            "/v1/control-plane/autopilot/beacon-network",
            "/v1/control-plane/autopilot/beacon-release-campaigns",
            "/v1/control-plane/autopilot/plays",
        ] {
            assert!(valid_operations_request("GET", path), "{path}");
        }
        assert!(valid_operations_request(
            "GET",
            &format!("/v1/control-plane/autopilot/beacon-release-campaigns/{id}/recipients")
        ));
        assert!(valid_operations_request(
            "GET",
            "/v1/control-plane/autopilot/outreach/candidates?status=admitted&limit=50"
        ));
        assert!(valid_operations_request(
            "GET",
            "/v1/control-plane/autopilot/booking-discovery/candidates?limit=25"
        ));
        for (prefix, suffix) in [
            (
                "/v1/control-plane/autopilot/outreach/candidates/",
                "/confirm",
            ),
            (
                "/v1/control-plane/autopilot/booking-discovery/candidates/",
                "/confirm",
            ),
            (
                "/v1/control-plane/autopilot/beacon-press-requests/",
                "/resolve",
            ),
            (
                "/v1/control-plane/autopilot/beacon-release-campaigns/",
                "/launch",
            ),
            (
                "/v1/control-plane/autopilot/beacon-release-campaigns/",
                "/close",
            ),
        ] {
            assert!(
                valid_operations_request("POST", &format!("{prefix}{id}{suffix}")),
                "{prefix}{id}{suffix}"
            );
        }
        // But arbitrary query paths on other endpoints are still rejected.
        assert!(!valid_operations_request(
            "GET",
            "/v1/control-plane/ops/summary?foo=bar"
        ));
        assert!(!valid_operations_request("GET", "/v1/admin/ops/summary"));
        assert!(!valid_operations_request(
            "POST",
            "/v1/control-plane/ops/outbox/not-a-uuid/retry"
        ));
        // The action endpoints the control plane calls through the tunnel —
        // beacon-network import and autopilot cycle run — must pass the
        // allowlist for their respective methods.
        assert!(valid_operations_request(
            "POST",
            "/v1/control-plane/autopilot/beacon-network"
        ));
        assert!(valid_operations_request(
            "POST",
            "/v1/control-plane/autopilot/cycle/run"
        ));
        assert!(valid_operations_request(
            "GET",
            "/v1/control-plane/autopilot/cycle/preview"
        ));
        // Every per-community read the Communities page makes. `intro-draft`
        // was missing here while its route existed on both sides, so the page
        // failed to render the moment anyone pressed Draft intro.
        for suffix in ["observations", "entities", "intro-draft"] {
            assert!(
                valid_operations_request(
                    "GET",
                    &format!(
                        "/v1/control-plane/community-intelligence/communities/\
                         0198c2a4-1d3b-7c2e-9f11-2b7d5e8a4c60/{suffix}"
                    ),
                ),
                "{suffix} must reach the tenant"
            );
        }
        assert!(!valid_operations_request(
            "GET",
            "/v1/control-plane/community-intelligence/communities/not-a-uuid/intro-draft"
        ));
    }

    #[test]
    fn redirect_is_refused() {
        let raw = b"HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1\r\nContent-Length: 0\r\n\r\n";
        assert!(parse_response(raw).is_err());
    }

    #[test]
    fn empty_success_body_is_refused() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n";
        assert!(matches!(
            parse_response(raw),
            Err(ApiError::ContractMismatch(_))
        ));
    }

    #[test]
    fn no_content_is_decoded_as_null() {
        let raw = b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n";
        assert_eq!(parse_response(raw).expect("decoded"), Value::Null);
    }

    #[test]
    fn no_content_with_body_is_refused() {
        let raw = b"HTTP/1.1 204 No Content\r\nContent-Length: 2\r\n\r\n{}";
        assert!(matches!(
            parse_response(raw),
            Err(ApiError::ContractMismatch(_))
        ));
    }

    #[test]
    fn content_length_json_is_decoded() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Length: 11\r\n\r\n{\"ok\":true}";
        assert_eq!(
            parse_response(raw).expect("decoded"),
            serde_json::json!({"ok": true})
        );
    }

    #[test]
    fn chunked_json_is_decoded() {
        let raw = b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n7\r\n{\"ok\":t\r\n4\r\nrue}\r\n0\r\n\r\n";
        assert_eq!(
            parse_response(raw).expect("decoded"),
            serde_json::json!({"ok": true})
        );
    }
}
