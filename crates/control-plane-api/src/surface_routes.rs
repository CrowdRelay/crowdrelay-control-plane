//! The operator surface: tenant capabilities proxied by one table.
//!
//! Every other proxy in this crate is a hand-written handler, an allowlist
//! entry in `tenant_area_client::valid_operations_request`, and a frontend
//! call — three places a route has to be added, and nothing fails until
//! somebody presses the button. That shape left eleven live CrowdRelay routes
//! refused by the allowlist (one of them read by the brain model on every
//! render, so its section was always `degraded`), one allowlisted route with
//! no handler, and 78 admin capabilities with no path through the console at
//! all.
//!
//! Here the table is the single place. [`SURFACE`] names each upstream route
//! once; the router answers `/tenants/{slug}/surface/{*path}` only for a path
//! that matches an entry, and the allowlist consults [`allows`] — the same
//! table — so the two cannot disagree. Parameters are typed by name: a
//! segment named `*_id` must be a UUID, any other a lowercase slug. Query
//! strings pass only the keys an entry names, re-encoded.
//!
//! CrowdRelay stays canonical for every body and every refusal. This layer
//! bounds the envelope, requires an Idempotency-Key on writes, audits them
//! with the redacted command log, and drops the tenant's cached read models so
//! the next render sees the write.

use std::sync::Arc;

use axum::{
    Extension, Json, Router,
    body::Bytes,
    extract::{DefaultBodyLimit, Path, RawQuery, State},
    http::{HeaderMap, Method, StatusCode, header::CACHE_CONTROL},
    response::{IntoResponse, Response},
    routing::any,
};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    AppState, auth::Identity, error::ApiError, store::ControlCommandAudit,
    tenant_area_client::ManagementRequest,
};

/// Matches the 16 KiB ceiling CrowdRelay serves these handlers under.
const MAX_SURFACE_BODY_BYTES: usize = 16 * 1024;
const UPSTREAM_PREFIX: &str = "/v1/control-plane/";
const PRIVATE_NO_STORE: &str = "private, no-store";

/// One proxied upstream route. `path` is the tail after `/v1/control-plane/`
/// with `{name}` parameters, exactly as CrowdRelay registers it.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Surface {
    pub method: &'static str,
    pub path: &'static str,
    /// Query keys passed through; any other key is refused.
    pub query: &'static [&'static str],
    /// Served to platform-level sessions only — operator tooling CrowdRelay
    /// documents as not part of the band's console.
    pub platform_only: bool,
}

const fn read(path: &'static str) -> Surface {
    Surface {
        method: "GET",
        path,
        query: &[],
        platform_only: false,
    }
}

const fn read_q(path: &'static str, query: &'static [&'static str]) -> Surface {
    Surface {
        method: "GET",
        path,
        query,
        platform_only: false,
    }
}

const fn write(method: &'static str, path: &'static str) -> Surface {
    Surface {
        method,
        path,
        query: &[],
        platform_only: false,
    }
}

const fn platform(surface: Surface) -> Surface {
    Surface {
        platform_only: true,
        ..surface
    }
}

/// Every upstream route this surface proxies. Grouped the way
/// `crowdrelay-api/src/control_plane_operator.rs` groups them.
pub(crate) const SURFACE: &[Surface] = &[
    // What the brain did, which connections work, where actions wait.
    read_q("ops/cycles", &["state", "limit"]),
    // The goal scoreboard: planned vs actual, learning, approvals, the
    // lanes that produced no fans, and the Reddit account's standing.
    read("ops/goal"),
    // Which of the band's own posts held attention, against its medians.
    read("content/hooks"),
    read("ops/connections"),
    read("ops/action-states"),
    read("ecosystem/overview"),
    read_q("ecosystem/findings", &["limit", "open_only"]),
    read("autopilot/reach-metrics"),
    // Conversion analytics.
    read("analytics/funnel"),
    read("analytics/revenue"),
    read("analytics/referral-conversion"),
    read("analytics/ad-conversion"),
    read("analytics/ad-conversion/breakdown"),
    // Fan communications and tracked links.
    read("communications/campaigns"),
    write("POST", "communications/campaigns"),
    write("POST", "communications/campaigns/{campaign_id}/schedule"),
    write("POST", "communications/campaigns/{campaign_id}/cancel"),
    read("smart-links"),
    write("POST", "smart-links"),
    write("POST", "audience/fans/{fan_id}/referral-code"),
    // Shows: the sale, the night's setup, costs, the checklist.
    read("events/{event_slug}/ticketing"),
    write("PUT", "events/{event_slug}/support-slots"),
    write("PUT", "events/{event_slug}/festival"),
    read("events/{event_id}/commerce-summary"),
    write("POST", "events/{event_id}/show-cost/prediction"),
    write("POST", "events/{event_id}/show-cost/settlement"),
    read("ecosystem/checklists/{event_slug}"),
    write("POST", "ecosystem/checklists/{event_slug}/{item_key}"),
    read_q("event-qr/campaigns", &["limit"]),
    write("POST", "event-qr/campaigns"),
    write("POST", "event-qr/campaigns/{campaign_id}/revoke"),
    write("POST", "event-qr/campaigns/{campaign_id}/context"),
    // Merch and the guardrails around price, stock and spend.
    read("merch/catalog"),
    write("POST", "merch/catalog"),
    read("merch/inventory/overview"),
    read("merch/inventory/activation"),
    write("POST", "merch/inventory/stocktakes"),
    write("POST", "merch/inventory/ready"),
    write("POST", "merch/inventory/adjustments"),
    read("merch/promotion-recommendations"),
    write("POST", "autopilot/merch-economics"),
    write("POST", "autopilot/ticket-allocation-guardrails"),
    write("POST", "autopilot/promotion-budget-guardrails"),
    // Fan rewards.
    read("reward-campaigns"),
    write("POST", "reward-campaigns"),
    write("POST", "reward-campaigns/{draw_id}/schedule"),
    write("POST", "reward-campaigns/{draw_id}/cancel"),
    read("reward-fulfillments"),
    write("POST", "reward-fulfillments/{winner_id}"),
    // Releases.
    read("autopilot/releases"),
    write("POST", "autopilot/releases"),
    read("autopilot/release-ledger"),
    read("autopilot/release-outcomes"),
    write("POST", "autopilot/releases/{release_id}/editorial-pitch"),
    write("POST", "autopilot/playlist-placements"),
    write(
        "POST",
        "autopilot/beacon-release-campaigns/{campaign_id}/recipients/{beacon_id}",
    ),
    // Outreach, booking and the approval queue.
    read("autopilot/outreach-waves"),
    write("POST", "autopilot/outreach-waves/{wave_id}/approve"),
    read_q("autopilot/outreach-contacts", &["state", "kind", "limit"]),
    write("POST", "autopilot/outreach-targets"),
    write("POST", "autopilot/outreach-targets/{target_id}/reply"),
    write("POST", "autopilot/outreach-targets/{target_id}/written"),
    // The conversation drawer: the contact's whole thread and what happens
    // next, plus the one control that is not "log their answer".
    read("autopilot/outreach-targets/{target_id}/conversation"),
    write("POST", "autopilot/outreach-targets/{target_id}/suppression"),
    write("POST", "autopilot/outreach/submission-channels"),
    write("POST", "autopilot/booking-targets"),
    write("POST", "autopilot/booking-targets/{target_id}/editions"),
    write("POST", "autopilot/booking-targets/{target_id}/reply"),
    write(
        "POST",
        "autopilot/booking-targets/{target_id}/venues/{venue_id}",
    ),
    write(
        "DELETE",
        "autopilot/booking-targets/{target_id}/venues/{venue_id}",
    ),
    read("autopilot/manager-config/booking-policy"),
    write("POST", "autopilot/manager-config/booking-policy"),
    write("POST", "autopilot/team-opportunities/discover"),
    write(
        "POST",
        "autopilot/team-opportunities/{opportunity_id}/progress",
    ),
    write("POST", "autopilot/actions/approve"),
    write("POST", "autopilot/actions/{action_id}/assign"),
    write(
        "POST",
        "autopilot/content-suggestions/{suggestion_id}/outcome",
    ),
    // Content spread and the manual publication legs.
    write(
        "POST",
        "autopilot/content-sources/{source_id}/relay-ladder/approve",
    ),
    write(
        "POST",
        "autopilot/content-sources/{source_id}/relay-ladder/revoke",
    ),
    // The reply lane: drafted answers to people who commented on the band's
    // posts (Reddit, Instagram, Facebook) — approve as written or edited, or
    // skip.
    read("community-replies"),
    write("POST", "community-replies/{reply_id}/approve"),
    write("POST", "community-replies/{reply_id}/skip"),
    write("POST", "telegram-posts/{telegram_post_id}/register-manual"),
    write("POST", "discord-posts/{discord_post_id}/register-manual"),
    // Places.
    read("audience-graph/places/{place_id}"),
    write("PUT", "audience-graph/places/{place_id}/rules"),
    write("POST", "audience-graph/places/{place_id}/evidence"),
    write("POST", "audience-graph/places/{place_id}/outreach/advance"),
    // Peer acts — operator tooling, not the band's console.
    platform(read_q("content-engine/peers", &["status"])),
    platform(write("POST", "content-engine/peers")),
    platform(write("POST", "content-engine/peers/{peer_id}/resolve")),
    // Portfolio.
    write("POST", "portfolio/amplification"),
    read("portfolio/amplification/{consent_id}/audience-preview"),
    write("POST", "portfolio/amplification/{consent_id}/campaign"),
    write("POST", "portfolio/import-fans"),
    read("portfolio/case-study"),
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tenants/{slug}/surface/{*path}", any(proxy))
        .layer(DefaultBodyLimit::max(MAX_SURFACE_BODY_BYTES))
}

/// Does `path` (without the upstream prefix) fit `template` segment by
/// segment? A `{*_id}` segment takes a UUID; any other parameter a slug.
fn fits(template: &str, path: &str) -> bool {
    let mut want = template.split('/');
    let mut have = path.split('/');
    loop {
        match (want.next(), have.next()) {
            (None, None) => return true,
            (Some(pattern), Some(segment)) => {
                let ok = match pattern.strip_prefix('{').and_then(|p| p.strip_suffix('}')) {
                    Some(name) if name.ends_with("_id") => Uuid::parse_str(segment).is_ok(),
                    Some(_) => slug_segment(segment),
                    None => pattern == segment,
                };
                if !ok {
                    return false;
                }
            }
            _ => return false,
        }
    }
}

fn slug_segment(segment: &str) -> bool {
    // events.slug allows 128 characters; the same cap everywhere keeps a
    // slug the upstream accepts from being refused here.
    !segment.is_empty()
        && segment.len() <= 128
        && segment.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_' || byte == b'-'
        })
}

fn find(method: &str, path: &str) -> Option<&'static Surface> {
    SURFACE
        .iter()
        .find(|surface| surface.method == method && fits(surface.path, path))
}

/// Allowlist hook for `valid_operations_request`: a full upstream path, with
/// its query string, that some [`SURFACE`] entry admits.
pub(crate) fn allows(method: &str, full_path: &str) -> bool {
    let (path, query) = full_path.split_once('?').unwrap_or((full_path, ""));
    let Some(tail) = path.strip_prefix(UPSTREAM_PREFIX) else {
        return false;
    };
    let Some(surface) = find(method, tail) else {
        return false;
    };
    query.is_empty()
        || url::form_urlencoded::parse(query.as_bytes())
            .all(|(key, _)| surface.query.contains(&key.as_ref()))
}

/// The upstream query string for `raw`, keeping only the entry's keys.
fn upstream_query(surface: &Surface, raw: Option<&str>) -> Result<String, ApiError> {
    let Some(raw) = raw.filter(|raw| !raw.is_empty()) else {
        return Ok(String::new());
    };
    let mut out = url::form_urlencoded::Serializer::new(String::new());
    for (key, value) in url::form_urlencoded::parse(raw.as_bytes()) {
        if !surface.query.contains(&key.as_ref()) {
            return Err(ApiError::InvalidInput(format!(
                "query parameter '{key}' is not accepted here"
            )));
        }
        if value.len() > 256 {
            return Err(ApiError::InvalidInput(format!(
                "query parameter '{key}' is too long"
            )));
        }
        out.append_pair(&key, &value);
    }
    Ok(out.finish())
}

fn idempotency_key(headers: &HeaderMap) -> Result<String, ApiError> {
    headers
        .get("idempotency-key")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| crate::tenant_area_client::valid_idempotency_key(value))
        .map(str::to_owned)
        .ok_or_else(|| ApiError::InvalidInput("valid Idempotency-Key is required".to_owned()))
}

async fn proxy(
    State(state): State<AppState>,
    Extension(identity): Extension<Arc<Identity>>,
    Path((slug, path)): Path<(String, String)>,
    RawQuery(raw_query): RawQuery,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, ApiError> {
    let method = method.as_str();
    let Some(surface) = find(method, &path) else {
        return Err(ApiError::NotFound);
    };
    if surface.platform_only && !identity.is_platform_level() {
        return Err(ApiError::Forbidden(
            "this surface requires platform-level access".to_owned(),
        ));
    }
    let query = upstream_query(surface, raw_query.as_deref())?;
    let upstream = if query.is_empty() {
        format!("{UPSTREAM_PREFIX}{path}")
    } else {
        format!("{UPSTREAM_PREFIX}{path}?{query}")
    };
    let is_write = method != "GET";
    let body: Option<Value> = if body.is_empty() {
        None
    } else {
        let value: Value = serde_json::from_slice(&body)
            .map_err(|_| ApiError::InvalidInput("the body must be JSON".to_owned()))?;
        if !value.is_object() {
            return Err(ApiError::InvalidInput(
                "the body must be a JSON object".to_owned(),
            ));
        }
        Some(value)
    };
    if !is_write && body.is_some() {
        return Err(ApiError::InvalidInput("a read carries no body".to_owned()));
    }
    let idempotency = if is_write {
        Some(idempotency_key(&headers)?)
    } else {
        None
    };
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method,
                path: &upstream,
                body: body.as_ref(),
                correlation_id: crate::operations_routes::correlation(&headers),
                idempotency_key: idempotency.as_deref(),
            },
        )
        .await;
    if is_write {
        // Accepted, not succeeded: a 200 from CrowdRelay means it took the
        // write, not that any external effect has been observed.
        if let Err(error) = state
            .store
            .audit_control_command(ControlCommandAudit {
                tenant_id: tenant.tenant.id,
                actor: &state.admin_actor,
                action: "tenant.surface.write",
                target_kind: "surface",
                target_id: format!("{method} {}", surface.path),
                request_id: crate::operations_routes::correlation(&headers),
                outcome: if result.is_ok() { "accepted" } else { "failed" },
                expected_version: None,
            })
            .await
        {
            tracing::warn!(%error, "failed to append redacted surface audit");
        }
    }
    let value = result?;
    if is_write {
        crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    }
    match value {
        // CrowdRelay answers some writes 204; the client maps that to Null.
        Value::Null => Ok(StatusCode::NO_CONTENT.into_response()),
        Value::Object(_) | Value::Array(_) => {
            Ok(([(CACHE_CONTROL, PRIVATE_NO_STORE)], Json(value)).into_response())
        }
        _ => Err(ApiError::Unavailable(
            "tenant surface returned an invalid JSON shape".to_owned(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "0190a0b0-0000-7000-8000-000000000001";

    #[test]
    fn every_entry_is_well_formed_and_unique() {
        let mut seen = std::collections::HashSet::new();
        for surface in SURFACE {
            assert!(
                matches!(surface.method, "GET" | "POST" | "PUT" | "DELETE"),
                "{surface:?}"
            );
            assert!(!surface.path.starts_with('/'), "{surface:?}");
            assert!(
                surface.method == "GET" || surface.query.is_empty(),
                "writes carry no query: {surface:?}"
            );
            assert!(
                seen.insert((surface.method, surface.path)),
                "duplicate {surface:?}"
            );
        }
    }

    #[test]
    fn parameters_are_typed_by_name() {
        assert!(fits(
            "reward-fulfillments/{winner_id}",
            &format!("reward-fulfillments/{ID}")
        ));
        assert!(!fits(
            "reward-fulfillments/{winner_id}",
            "reward-fulfillments/not-a-uuid"
        ));
        assert!(fits(
            "events/{event_slug}/ticketing",
            "events/summer-2026/ticketing"
        ));
        assert!(!fits(
            "events/{event_slug}/ticketing",
            "events/Summer/ticketing"
        ));
        assert!(!fits(
            "events/{event_slug}/ticketing",
            "events/../ticketing"
        ));
        assert!(!fits("smart-links", "smart-links/extra"));
        assert!(!fits("smart-links", ""));
    }

    #[test]
    fn the_allowlist_hook_reads_the_same_table() {
        assert!(allows("GET", "/v1/control-plane/ops/action-states"));
        assert!(allows(
            "GET",
            "/v1/control-plane/ops/cycles?state=degraded&limit=5"
        ));
        assert!(!allows(
            "GET",
            "/v1/control-plane/ops/cycles?workspace=other"
        ));
        assert!(!allows("POST", "/v1/control-plane/ops/action-states"));
        assert!(!allows("GET", "/v1/admin/ops/cycles"));
        assert!(allows(
            "DELETE",
            &format!("/v1/control-plane/autopilot/booking-targets/{ID}/venues/{ID}")
        ));
        // The allowlist rejects what the table does not name, so a surface
        // entry cannot widen anything beyond itself.
        assert!(!allows("GET", "/v1/control-plane/roster-plan"));
    }

    #[test]
    fn query_keys_outside_the_entry_are_refused() {
        let cycles = find("GET", "ops/cycles").expect("entry");
        assert_eq!(
            upstream_query(cycles, Some("state=degraded&limit=5")).expect("ok"),
            "state=degraded&limit=5"
        );
        assert!(upstream_query(cycles, Some("state=x&admin=1")).is_err());
        let funnel = find("GET", "analytics/funnel").expect("entry");
        assert!(upstream_query(funnel, Some("limit=1")).is_err());
        assert_eq!(upstream_query(funnel, None).expect("ok"), "");
    }

    #[test]
    fn peers_are_platform_only_and_nothing_else_is() {
        let platform_only: Vec<_> = SURFACE
            .iter()
            .filter(|surface| surface.platform_only)
            .map(|surface| surface.path)
            .collect();
        assert!(
            platform_only
                .iter()
                .all(|path| path.starts_with("content-engine/"))
        );
        assert_eq!(platform_only.len(), 3);
    }

    /// CrowdRelay routes the console deliberately cannot call, with the
    /// reason. Everything else under `/v1/control-plane/` must pass the
    /// allowlist, or the route is live upstream and dead here — the defect
    /// that left eleven routes, and the brain model's action-states section,
    /// refused before they left this process.
    const DELIBERATELY_UNPROXIED: &[(&str, &str, &str)] = &[
        (
            "POST",
            "/v1/control-plane/autopilot/standing-approvals",
            "a grant is written by the approve flow's remember opt-in, never from a form",
        ),
        (
            "GET",
            "/v1/control-plane/event-qr/overview",
            "the shows list carries scan counts and the gig page reads the campaigns list",
        ),
        (
            "GET",
            "/v1/control-plane/reward-draws",
            "a campaign row carries its winner and fulfilment counts; prizes to send list the winners",
        ),
        (
            "GET",
            "/v1/control-plane/autopilot/community-relays",
            "In motion reads relay runs through processes/relays, which is the process view of the same rows",
        ),
    ];

    fn crowdrelay_root() -> Option<std::path::PathBuf> {
        let root = std::env::var_os("CROWDRELAY_ROOT")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| {
                std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../crowdrelay")
            });
        root.join("crates/crowdrelay-api/src")
            .is_dir()
            .then_some(root)
    }

    /// `(METHOD, path)` for every `/v1/control-plane/` route CrowdRelay
    /// registers, from every router file under its API crate.
    fn upstream_control_plane_routes(root: &std::path::Path) -> Vec<(String, String)> {
        let mut routes = Vec::new();
        let mut stack = vec![root.join("crates/crowdrelay-api/src")];
        while let Some(dir) = stack.pop() {
            for entry in std::fs::read_dir(&dir).expect("read api dir").flatten() {
                let path = entry.path();
                if path.is_dir() {
                    stack.push(path);
                    continue;
                }
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if !name.ends_with(".rs") || name.contains("test") {
                    continue;
                }
                let source = std::fs::read_to_string(&path).expect("read source");
                let source: String = source
                    .lines()
                    .map(|line| line.split("//").next().unwrap_or(""))
                    .collect::<Vec<_>>()
                    .join("\n");
                let mut rest = source.as_str();
                while let Some(start) = rest.find(".route(") {
                    rest = &rest[start + 7..];
                    let trimmed = rest.trim_start();
                    let Some(literal) = trimmed.strip_prefix('"') else {
                        continue;
                    };
                    let Some(end) = literal.find('"') else { break };
                    let route = &literal[..end];
                    if !route.starts_with("/v1/control-plane/") {
                        continue;
                    }
                    let expression = &literal[end..];
                    let expression =
                        &expression[..expression.find(".route(").unwrap_or(expression.len())];
                    for method in ["get", "post", "put", "patch", "delete"] {
                        let bare = format!("{method}(");
                        let chained = format!(".{method}(");
                        let found = expression.match_indices(&bare).any(|(at, _)| {
                            at == 0
                                || !expression.as_bytes()[at - 1].is_ascii_alphanumeric()
                                    && expression.as_bytes()[at - 1] != b'_'
                        }) || expression.contains(&chained);
                        if found {
                            routes.push((method.to_uppercase(), route.to_owned()));
                        }
                    }
                }
            }
        }
        routes.sort();
        routes.dedup();
        routes
    }

    fn concrete(route: &str, other: &str) -> String {
        route
            .split('/')
            .map(
                |segment| match segment.strip_prefix('{').and_then(|s| s.strip_suffix('}')) {
                    Some(name) if name.ends_with("_id") || name == "id" => ID.to_owned(),
                    Some(_) => other.to_owned(),
                    None => segment.to_owned(),
                },
            )
            .collect::<Vec<_>>()
            .join("/")
    }

    #[test]
    fn every_upstream_control_plane_route_is_proxied_or_decided() {
        let Some(root) = crowdrelay_root() else {
            eprintln!("skipped: no crowdrelay checkout beside this one (set CROWDRELAY_ROOT)");
            return;
        };
        let routes = upstream_control_plane_routes(&root);
        // A parser that matched nothing would make this vacuous.
        assert!(
            routes.len() > 250,
            "parsed only {} upstream routes",
            routes.len()
        );
        let mut refused = Vec::new();
        for (method, route) in &routes {
            if route == "/v1/control-plane/area" || route.starts_with("/v1/control-plane/area/") {
                continue; // The AREA channel, `TenantAreaClient::request`.
            }
            if DELIBERATELY_UNPROXIED
                .iter()
                .any(|(m, p, _)| m == method && p == route)
            {
                continue;
            }
            // Slugged segments take whichever value the upstream family uses:
            // a slug, a key, a contribution kind, a digest.
            let accepted = ["some-slug", "draw_estimate", "abc", &"a".repeat(64)]
                .iter()
                .any(|other| {
                    crate::tenant_area_client::valid_operations_request(
                        method,
                        &concrete(route, other),
                    )
                });
            if !accepted {
                refused.push(format!("{method} {route}"));
            }
        }
        assert!(
            refused.is_empty(),
            "live upstream, refused here — add a SURFACE entry or a \
             DELIBERATELY_UNPROXIED reason:\n  {}",
            refused.join("\n  ")
        );
        // The other direction: an entry naming a route upstream does not
        // serve is a promise that 404s at the button.
        let upstream: std::collections::HashSet<(String, String)> = routes
            .iter()
            .map(|(method, route)| (method.clone(), route.clone()))
            .collect();
        let unserved: Vec<String> = SURFACE
            .iter()
            .filter(|surface| {
                !upstream.contains(&(
                    surface.method.to_owned(),
                    format!("{UPSTREAM_PREFIX}{}", surface.path),
                ))
            })
            .map(|surface| format!("{} {}", surface.method, surface.path))
            .collect();
        assert!(
            unserved.is_empty(),
            "SURFACE names routes the crowdrelay checkout at {} does not serve \
             (a typo, or an older checkout):\n  {}",
            root.display(),
            unserved.join("\n  ")
        );
        for (method, route, _) in DELIBERATELY_UNPROXIED {
            assert!(
                routes.iter().any(|(m, p)| m == method && p == route),
                "DELIBERATELY_UNPROXIED names a route upstream no longer has: {method} {route}"
            );
        }
    }
}
