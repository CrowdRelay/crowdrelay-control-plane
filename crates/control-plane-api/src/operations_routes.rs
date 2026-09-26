//! Narrow tenant operations proxy for health, maintenance, feature controls and Autopilot.
//!
//! CrowdRelay stays canonical for every read model and mutation. The Control
//! Plane only validates a deliberately small transport allowlist, derives the
//! per-tenant credential server-side, and records a redacted platform audit.

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, StatusCode, header::CACHE_CONTROL},
    response::{IntoResponse, Response},
    routing::{get, post, put},
};
use serde::Deserialize;
use serde_json::{Value, json};
use url::Url;
use uuid::Uuid;

use crate::{
    AppState, error::ApiError, store::ControlCommandAudit, tenant_area_client::ManagementRequest,
};

const PRIVATE_NO_STORE: &str = "private, no-store";
const MAX_OPERATIONS_BODY_BYTES: usize = 8 * 1024;
/// Matches CrowdRelay's `media::MAX_MEDIA_BODY_BYTES` — an image Meta will
/// fetch for a post. The proxy bounds the body before it spends the upstream
/// round trip.
const MAX_MEDIA_BODY_BYTES: usize = 8 * 1024 * 1024;
/// The sheet upload forwards up to 2 MiB of CSV inside a JSON envelope —
/// the router-wide 8 KiB would refuse every real sheet before the
/// upstream's own bounds could answer.
const MAX_UPLOAD_BODY_BYTES: usize = 2 * 1024 * 1024 + 64 * 1024;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tenants/{slug}/operations/summary", get(summary))
        .route(
            "/tenants/{slug}/operations/signal-overview",
            get(signal_overview),
        )
        .route("/tenants/{slug}/operations/intelligence", get(intelligence))
        .route("/tenants/{slug}/operations/fan-sources", get(fan_sources))
        .route("/tenants/{slug}/operations/outbox", get(list_outbox))
        .route(
            "/tenants/{slug}/operations/outbox/{event_id}/retry",
            post(retry_outbox),
        )
        .route(
            "/tenants/{slug}/operations/deliveries",
            get(list_deliveries),
        )
        .route(
            "/tenants/{slug}/operations/delivery-results",
            get(list_delivery_results),
        )
        .route(
            "/tenants/{slug}/operations/content-pipeline",
            get(content_pipeline),
        )
        .route(
            "/tenants/{slug}/operations/deliveries/{delivery_id}",
            get(delivery_details),
        )
        .route(
            "/tenants/{slug}/operations/deliveries/{delivery_id}/retry",
            post(retry_delivery),
        )
        .route(
            "/tenants/{slug}/operations/push/{delivery_id}/retry",
            post(retry_push),
        )
        .route(
            "/tenants/{slug}/operations/dead-deliveries/clear",
            post(clear_dead_deliveries),
        )
        .route(
            "/tenants/{slug}/operations/timeline/{request_id}",
            get(operation_timeline),
        )
        .route(
            "/tenants/{slug}/operations/trace/{trace_id}",
            get(trace_timeline),
        )
        .route("/tenants/{slug}/operations/actions", get(list_actions))
        .route(
            "/tenants/{slug}/operations/actions/{action_id}",
            get(get_action),
        )
        .route(
            "/tenants/{slug}/operations/processes/relays",
            get(list_process_relays),
        )
        .route(
            "/tenants/{slug}/operations/processes/relays/{source_id}",
            get(process_relay_run),
        )
        .route(
            "/tenants/{slug}/operations/community-relays/{source_id}/approve",
            post(approve_community_relay),
        )
        .route(
            "/tenants/{slug}/operations/community-relays/{source_id}/revoke",
            post(revoke_community_relay),
        )
        .route(
            "/tenants/{slug}/operations/community-posts/{post_id}/register-manual",
            post(register_manual_community_post),
        )
        .route(
            "/tenants/{slug}/operations/social-posts/{post_id}/register-manual",
            post(register_manual_social_post),
        )
        .route(
            "/tenants/{slug}/operations/actions/{action_id}/sent",
            get(action_sent_record),
        )
        .route(
            "/tenants/{slug}/operations/reconcile",
            post(run_reconciliation),
        )
        .route("/tenants/{slug}/operations/flags", get(flags))
        .route("/tenants/{slug}/operations/flags/{key}", post(update_flag))
        .route(
            "/tenants/{slug}/operations/autopilot",
            get(autopilot_overview),
        )
        .route(
            "/tenants/{slug}/operations/autopilot/bulk",
            post(bulk_autopilot),
        )
        .route("/tenants/{slug}/operations/growth", get(autopilot_growth))
        .route(
            "/tenants/{slug}/operations/autopilot/cycle/preview",
            get(autopilot_cycle_preview),
        )
        .route(
            "/tenants/{slug}/operations/autopilot/cycle/run",
            post(autopilot_cycle_run),
        )
        .route(
            "/tenants/{slug}/operations/autopilot/scorecard",
            get(autopilot_scorecard),
        )
        .route(
            "/tenants/{slug}/operations/autopilot/measurement",
            get(autopilot_measurement),
        )
        // What the approved asks produced — terminal actions with their
        // measurement verdicts. Today's "is it working" reads this.
        .route("/tenants/{slug}/operations/outcomes", get(ops_outcomes))
        .route(
            "/tenants/{slug}/operations/autopilot/reply-triage",
            get(autopilot_reply_triage),
        )
        // N.9: which executor lanes are live, held, or missing — the read
        // the dispatch gate enforces, so a gap is a line on a screen rather
        // than a refusal sentence at approve time.
        .route(
            "/tenants/{slug}/operations/autopilot/capabilities",
            get(autopilot_capabilities),
        )
        .route(
            "/tenants/{slug}/operations/autopilot/opportunity-shortlist",
            get(opportunity_shortlist),
        )
        // Portfolio reads live in read_models::portfolio as one consolidated
        // model; only the mutations are routed here.
        .route(
            "/tenants/{slug}/portfolio/amplification/{consent_id}/decide",
            post(decide_portfolio_amplification),
        )
        .route(
            "/tenants/{slug}/portfolio/north-stars",
            get(list_north_star_options),
        )
        .route(
            "/tenants/{slug}/portfolio/tenant-intents",
            get(list_tenant_intent_options),
        )
        .route(
            "/tenants/{slug}/portfolio/settings/{setting_key}",
            post(update_portfolio_setting),
        )
        // The Workspace tab's read: the editable settings alone, without the
        // audience KPIs the portfolio fan-out used to carry alongside them.
        .route("/tenants/{slug}/settings", get(tenant_settings))
        // The join-ask image goes up as the file's own bytes — the one
        // proxied call whose body is not JSON. 8 MiB is the upstream bound;
        // the router-wide JSON limit would refuse every real screenshot.
        .route(
            "/tenants/{slug}/media",
            post(upload_media).route_layer(DefaultBodyLimit::max(MAX_MEDIA_BODY_BYTES)),
        )
        // Tenant-held credentials: the masked inventory and the write-only
        // set/unset. The value goes up and never comes back — the list shows
        // only the hint upstream computed at write time.
        .route("/tenants/{slug}/secrets", get(list_tenant_secrets))
        .route(
            "/tenants/{slug}/secrets/{secret_name}",
            put(set_tenant_secret).delete(delete_tenant_secret),
        )
        .route(
            "/tenants/{slug}/portfolio/fanbases",
            post(create_portfolio_fanbase),
        )
        // Audience graph: the communities the brain scans and posts into.
        .route(
            "/tenants/{slug}/audience-graph/places",
            get(list_audience_places).post(upsert_audience_place),
        )
        .route(
            "/tenants/{slug}/audience-graph/places/import",
            post(import_audience_places),
        )
        // What the band should book next, and the yes that queues it (4G).
        .route("/tenants/{slug}/gig-plan", get(gig_plan))
        .route("/tenants/{slug}/gig-plan/approve", post(approve_gig_plan))
        .route(
            "/tenants/{slug}/portfolio/fanbases/{fanbase_id}",
            axum::routing::delete(delete_portfolio_fanbase),
        )
        .route(
            "/tenants/{slug}/portfolio/fanbases/{fanbase_id}/ingest",
            post(ingest_portfolio_fanbase),
        )
        .route(
            "/tenants/{slug}/portfolio/fanbases/connections",
            get(list_fanbase_connections),
        )
        .route(
            "/tenants/{slug}/portfolio/fanbases/connections/{connection_id}",
            axum::routing::delete(delete_fanbase_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/fanbases/connections/{connection_id}/scan-scope",
            axum::routing::patch(update_fanbase_connection_scan_scope),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/discord",
            post(create_discord_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/telegram",
            post(create_telegram_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/lastfm",
            post(create_lastfm_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/deezer",
            post(create_deezer_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/discogs",
            post(create_discogs_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/bluesky",
            post(create_bluesky_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/bandcamp",
            post(create_bandcamp_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/youtube",
            post(create_youtube_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/facebook",
            post(create_facebook_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/instagram",
            post(create_instagram_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/soundcloud",
            post(create_soundcloud_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/connections/reddit",
            post(create_reddit_connection),
        )
        .route(
            "/tenants/{slug}/portfolio/communities",
            get(list_communities),
        )
        .route(
            "/tenants/{slug}/portfolio/communities/{place_id}/observations",
            get(list_community_observations),
        )
        .route(
            "/tenants/{slug}/portfolio/communities/{place_id}/membership",
            post(set_community_membership),
        )
        .route(
            "/tenants/{slug}/portfolio/communities/{place_id}/intro-draft",
            get(community_intro_draft),
        )
        .route(
            "/tenants/{slug}/portfolio/communities/{place_id}/entities",
            get(list_community_entities),
        )
        // Consolidated community detail — observations + entities in one
        // round-trip, so selecting a community loads both panels at once
        // instead of two separate proxy calls.
        .route(
            "/tenants/{slug}/portfolio/communities/{place_id}/detail",
            get(community_detail),
        )
        .route(
            "/tenants/{slug}/notifiers/discovered",
            get(discovered_notifier_endpoints),
        )
        .route(
            "/tenants/{slug}/operations/autopilot/{context}",
            post(update_autopilot),
        )
        .route(
            "/tenants/{slug}/operations/opportunities/actions/{action_id}/approve",
            post(approve_opportunity),
        )
        .route(
            "/tenants/{slug}/operations/opportunities/actions/{action_id}/cancel",
            post(cancel_opportunity),
        )
        .route(
            "/tenants/{slug}/operations/opportunities/decisions/{decision_id}/handled-externally",
            post(handle_opportunity_externally),
        )
        // Standing grants — what may run without asking. List on the
        // policies screen; grant rides the approve body's `remember`;
        // revoke keeps the row stamped rather than deleting it.
        .route(
            "/tenants/{slug}/operations/standing-approvals",
            get(standing_approvals),
        )
        .route(
            "/tenants/{slug}/operations/standing-approvals/{action_kind}/{target_key}",
            axum::routing::delete(revoke_standing_approval),
        )
        // The booking-agent registry — the season letter and the filed reply.
        .route(
            "/tenants/{slug}/operations/booking-agents",
            get(booking_agents),
        )
        .route(
            "/tenants/{slug}/operations/booking-agents/approach",
            post(request_booking_agent_approach),
        )
        // The batch form of the same ask — one card covering the agents the
        // operator picked, each still gated and letter-composed upstream.
        .route(
            "/tenants/{slug}/operations/booking-agents/approach-wave",
            post(request_booking_agent_approach_wave),
        )
        .route(
            "/tenants/{slug}/operations/booking-agents/{agent_id}/reply",
            post(record_booking_agent_reply),
        )
        // The other half of the reply lane: the band asks to answer the
        // agent's filed reply — upstream composes the draft and queues the
        // approval card.
        .route(
            "/tenants/{slug}/operations/booking-agents/{agent_id}/reply-draft",
            post(request_booking_agent_reply_draft),
        )
        // Audience attestations — the proof cards. Issue measures the
        // tenant's own ledgers upstream; these routes are transport only.
        .route(
            "/tenants/{slug}/operations/attestations",
            get(attestations).post(issue_attestation),
        )
        .route(
            "/tenants/{slug}/operations/attestations/revoke",
            post(revoke_attestation),
        )
        .route(
            "/tenants/{slug}/operations/attestations/rotate",
            post(rotate_attestation),
        )
        // Decision evidence: structured "why this decision" data.
        // Read-only proxy to CrowdRelay's decision evidence read model.
        .route(
            "/tenants/{slug}/operations/decisions/{decision_id}/evidence",
            get(decision_evidence),
        )
        // Learning loop: last 20 decisions with actions and outcomes.
        // Read-only proxy to CrowdRelay's learning loop read model.
        .route(
            "/tenants/{slug}/operations/learning-loop",
            get(learning_loop),
        )
        // Learning proof: the belief revisions themselves — what the brain
        // changed, what changed it, and which later decisions acted on the
        // change. Read-only proxy to CrowdRelay's learning proof read model.
        .route(
            "/tenants/{slug}/operations/learning-proof",
            get(learning_proof),
        )
        // ── Audience intelligence (read-only proxies) ───────────────────
        .route("/tenants/{slug}/audience/overview", get(audience_overview))
        .route("/tenants/{slug}/audience/fans", get(audience_fans))
        .route(
            "/tenants/{slug}/audience/fans/{fan_id}",
            get(audience_fan_detail),
        )
        .route(
            "/tenants/{slug}/audience/fans/{fan_id}/journey",
            get(audience_fan_journey),
        )
        // Fan tags — the operator's own labels on a fan. Add rides the body
        // (`{tag}`), remove the path — same split upstream owns.
        .route(
            "/tenants/{slug}/audience/fans/{fan_id}/tags",
            post(add_fan_tag),
        )
        .route(
            "/tenants/{slug}/audience/fans/{fan_id}/tags/{tag}/remove",
            post(remove_fan_tag),
        )
        .route("/tenants/{slug}/audience/segments", get(audience_segments))
        .route(
            "/tenants/{slug}/audience/segments/{slug_segment}/preview",
            get(audience_segment_preview),
        )
        .route(
            "/tenants/{slug}/audience/city-funnel",
            get(audience_city_funnel),
        )
        .route(
            "/tenants/{slug}/audience/city-venues",
            get(audience_city_venues),
        )
        .route(
            "/tenants/{slug}/audience/registry-verification-brief",
            get(audience_registry_verification_brief),
        )
        // ── Growth metrics, objectives, posture (read + mutate) ────────
        .route(
            "/tenants/{slug}/operations/growth-metrics/coverage",
            get(growth_metric_coverage),
        )
        .route(
            "/tenants/{slug}/operations/growth-metrics/trends",
            get(growth_metric_trends),
        )
        .route(
            "/tenants/{slug}/operations/objectives",
            get(growth_objectives).post(declare_growth_objective),
        )
        // ── Trusted material (the real-material panel) ─────────────────
        // Stories, videos, releases the engager may write about. Typed as a
        // closed shape so a stray field cannot reach the tenant's registry.
        .route(
            "/tenants/{slug}/operations/content-sources",
            get(content_sources).post(upsert_content_source),
        )
        .route(
            "/tenants/{slug}/operations/gdrive-contacts",
            get(gdrive_contacts),
        )
        .route(
            "/tenants/{slug}/operations/gdrive-contacts/scan",
            axum::routing::post(gdrive_scan),
        )
        // P.2: the operator's own sheet is an intake source too — the body
        // passes through verbatim; upstream parses, extracts and stages.
        .route(
            "/tenants/{slug}/operations/gdrive-contacts/upload",
            axum::routing::post(gdrive_upload).layer(DefaultBodyLimit::max(MAX_UPLOAD_BODY_BYTES)),
        )
        // Segment-wide fan promotion — the panel confirms a live count,
        // upstream re-counts and refuses a stale one. This plane validates
        // the envelope; consent posture and the count check stay upstream.
        .route(
            "/tenants/{slug}/operations/gdrive-contacts/promote-batch",
            axum::routing::post(promote_drive_contacts_batch),
        )
        .route(
            "/tenants/{slug}/operations/gdrive-contacts/{contact_id}/promote",
            axum::routing::post(promote_drive_contact),
        )
        .route(
            "/tenants/{slug}/operations/gdrive-contacts/{contact_id}/dismiss",
            axum::routing::post(dismiss_drive_contact),
        )
        // §4h-12: the band's listing editor and representation contacts.
        // CrowdRelay owns every bound and refusal; this plane validates the
        // transport shape and audits the writes like any other mutation.
        .route(
            "/tenants/{slug}/operations/listing",
            get(listing_state).post(save_listing),
        )
        .route(
            "/tenants/{slug}/operations/listing/publish",
            post(publish_listing),
        )
        .route(
            "/tenants/{slug}/operations/listing/unlist",
            post(unlist_listing),
        )
        .route(
            "/tenants/{slug}/operations/listing/rotate-token",
            post(rotate_listing_token),
        )
        .route(
            "/tenants/{slug}/operations/representation/targets",
            get(representation_targets).post(upsert_representation_target),
        )
        .route(
            "/tenants/{slug}/operations/representation/approach",
            post(request_representation_approach),
        )
        .route(
            "/tenants/{slug}/operations/objectives/{objective_id}/retire",
            post(retire_growth_objective),
        )
        .route(
            "/tenants/{slug}/operations/posture",
            get(growth_posture).post(set_growth_posture),
        )
        .route(
            "/tenants/{slug}/operations/acquisition-channels",
            get(acquisition_channels),
        )
        .route(
            "/tenants/{slug}/operations/tour-economics",
            get(tour_economics),
        )
        .route(
            "/tenants/{slug}/operations/show-economics",
            get(show_economics),
        )
        // The gig page's list — the tenant's shows, next up then past — plus
        // the write that puts one there by hand when no sync source runs.
        .route(
            "/tenants/{slug}/shows",
            get(tenant_shows).post(tenant_show_create),
        )
        // One night: the T-21→T+7 ladder. The slug path segment is the
        // event's own slug, not its id — it is what the list hands down.
        .route(
            "/tenants/{slug}/shows/{event_slug}",
            get(tenant_show_timeline),
        )
        // The door view: the night's scannable URL + live tally. Separate
        // route so the phone page fetches the token-bearing payload only
        // when the door actually needs it.
        .route(
            "/tenants/{slug}/shows/{event_slug}/scan",
            get(tenant_show_scan),
        )
        // The T+7 artifact: what the counterparty's email looks like —
        // the mailed payload once issued, a live preview before.
        .route(
            "/tenants/{slug}/shows/{event_slug}/report",
            get(tenant_show_report),
        )
        // §4h-11: who could help with this show — press, rooms, communities
        // and cold rooms as candidates, never contacts handed out.
        .route(
            "/tenants/{slug}/shows/{event_slug}/who-can-help",
            get(tenant_show_helpers),
        )
        // The show's two setup writes — the bill the crossbill step reads
        // and the counterparty the T+7 report mails. Whole-resource PUTs.
        .route(
            "/tenants/{slug}/shows/{event_slug}/acts",
            put(tenant_show_acts_replace),
        )
        .route(
            "/tenants/{slug}/shows/{event_slug}/counterparty",
            put(tenant_show_counterparty),
        )
        // ── The shared night (4V.6b) ─────────────────────────────────
        // One venue's night, every tenant's event pointing at it. The read
        // answers in the caller's own lens — upstream derives it from the
        // workspace's relationship, never from a parameter. The writes are
        // the four contribution kinds, the organiser link's mint/revoke,
        // and the billed act's own confirmation.
        .route("/tenants/{slug}/nights/{place_event_id}", get(tenant_night))
        .route(
            "/tenants/{slug}/nights/{place_event_id}/contributions",
            post(tenant_night_contribution),
        )
        .route(
            "/tenants/{slug}/nights/{place_event_id}/contributions/{kind}",
            axum::routing::delete(tenant_night_contribution_revoke),
        )
        .route(
            "/tenants/{slug}/nights/{place_event_id}/organiser-link",
            post(tenant_night_organiser_link).delete(tenant_night_organiser_link_revoke),
        )
        .route(
            "/tenants/{slug}/nights/{place_event_id}/acts/{act_slug}/confirm",
            post(tenant_night_act_confirm),
        )
        .route(
            "/tenants/{slug}/operations/chief-of-staff",
            get(chief_of_staff),
        )
        // ── Outreach & booking discovery (candidate queues) ────────────
        .route(
            "/tenants/{slug}/operations/outreach/candidates",
            get(outreach_candidates),
        )
        .route(
            "/tenants/{slug}/operations/outreach/candidates/{candidate_id}/confirm",
            post(confirm_outreach_candidate),
        )
        .route(
            "/tenants/{slug}/operations/booking-discovery/candidates",
            get(booking_candidates),
        )
        .route(
            "/tenants/{slug}/operations/booking-discovery/candidates/{candidate_id}/confirm",
            post(confirm_booking_candidate),
        )
        // ── Beacon signal network (press & industry pipeline) ──────────
        .route(
            "/tenants/{slug}/operations/beacon-signal",
            get(beacon_signal_dashboard),
        )
        .route(
            "/tenants/{slug}/operations/beacon-signal/candidates",
            get(beacon_signal_candidates),
        )
        .route(
            "/tenants/{slug}/operations/beacon-press-requests",
            get(beacon_press_requests),
        )
        .route(
            "/tenants/{slug}/operations/beacon-press-requests/{press_request_id}/resolve",
            post(resolve_beacon_press_request),
        )
        .route(
            "/tenants/{slug}/operations/beacon-press-assets",
            get(beacon_press_assets).post(upsert_beacon_press_asset),
        )
        .route(
            "/tenants/{slug}/operations/beacon-signal-engagements",
            get(beacon_signal_engagements),
        )
        .route(
            "/tenants/{slug}/operations/beacon-coverage",
            get(beacon_coverage),
        )
        .route(
            "/tenants/{slug}/operations/beacon-network",
            get(beacon_network).post(beacon_network_action),
        )
        // ── Beacon management ─────────────────────────────────────────
        .route("/tenants/{slug}/operations/beacons", post(upsert_beacon))
        .route(
            "/tenants/{slug}/operations/beacons/import-submithub",
            post(import_submithub_csv),
        )
        .route(
            "/tenants/{slug}/operations/beacons/signal-invites/batch",
            post(batch_invite_beacons),
        )
        .route(
            "/tenants/{slug}/operations/beacons/{beacon_id}/signal-invites",
            post(invite_beacon),
        )
        .route(
            "/tenants/{slug}/operations/beacons/{beacon_id}/signal-state",
            post(set_beacon_state),
        )
        .route(
            "/tenants/{slug}/operations/beacons/{beacon_id}/reply",
            post(record_beacon_reply),
        )
        // P.1: the industry list seen as an audience — who already hears
        // the dates, who could be asked, and the one-person, once-ever
        // invitation itself.
        .route(
            "/tenants/{slug}/operations/contacts/dual-role",
            get(dual_role_contacts),
        )
        .route(
            "/tenants/{slug}/operations/contacts/{beacon_id}/latarnik-invite",
            post(invite_to_latarnik),
        )
        // P.4: one show's approve-once growth ladder — the state plus the
        // rungs, and the two writes (approve / revoke) that move it.
        .route(
            "/tenants/{slug}/operations/autopilot/events/{event_id}/growth-ladder",
            get(show_growth_ladder),
        )
        .route(
            "/tenants/{slug}/operations/autopilot/events/{event_id}/growth-ladder/approve",
            post(approve_show_growth_ladder),
        )
        .route(
            "/tenants/{slug}/operations/autopilot/events/{event_id}/growth-ladder/revoke",
            post(revoke_show_growth_ladder),
        )
        // P.7: the negotiation table — the ladder every live terms row was
        // argued from, plus the write that records the promoter's position.
        .route(
            "/tenants/{slug}/operations/autopilot/negotiations",
            get(negotiations),
        )
        .route(
            "/tenants/{slug}/operations/autopilot/team-opportunities/{opportunity_id}/terms",
            post(record_opportunity_terms),
        )
        // ── Release campaigns ─────────────────────────────────────────
        .route(
            "/tenants/{slug}/operations/beacon-release-campaigns",
            get(beacon_release_campaigns).post(create_beacon_release_campaign),
        )
        .route(
            "/tenants/{slug}/operations/beacon-release-campaigns/{campaign_id}/launch",
            post(launch_beacon_release_campaign),
        )
        .route(
            "/tenants/{slug}/operations/beacon-release-campaigns/{campaign_id}/close",
            post(close_beacon_release_campaign),
        )
        .route(
            "/tenants/{slug}/operations/beacon-release-campaigns/{campaign_id}/recipients",
            get(beacon_release_recipients),
        )
        // ── Play ledger ───────────────────────────────────────────────
        .route("/tenants/{slug}/operations/plays", get(play_ledger))
        .layer(DefaultBodyLimit::max(MAX_OPERATIONS_BODY_BYTES))
}

pub(crate) fn correlation(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .or_else(|| {
            headers
                .get("x-crowdrelay-correlation-id")
                .and_then(|value| value.to_str().ok())
        })
}

fn idempotency_key(headers: &HeaderMap) -> Result<&str, ApiError> {
    headers
        .get("idempotency-key")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| {
            // Mirrors upstream `validate_text_key`: visible ASCII except `"`
            // and `\`, which would break the key's JSON round-trip into the
            // stored payload.
            (8..=128).contains(&value.len())
                && value
                    .bytes()
                    .all(|byte| byte.is_ascii_graphic() && byte != b'"' && byte != b'\\')
        })
        .ok_or_else(|| ApiError::InvalidInput("valid Idempotency-Key is required".to_owned()))
}

fn safe_segment(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 96
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_' || byte == b'-'
        })
}

fn uuid_segment(value: &str) -> Result<&str, ApiError> {
    Uuid::parse_str(value)
        .map(|_| value)
        .map_err(|_| ApiError::InvalidInput("valid UUID is required".to_owned()))
}

fn correlation_segment(value: &str) -> Result<&str, ApiError> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
    {
        return Err(ApiError::InvalidInput(
            "valid request/correlation id is required".to_owned(),
        ));
    }
    Ok(value)
}

fn json_no_store(value: Value) -> Response {
    (
        StatusCode::OK,
        [(CACHE_CONTROL, PRIVATE_NO_STORE)],
        Json(value),
    )
        .into_response()
}

fn object_no_store(value: Value, endpoint: &'static str) -> Result<Response, ApiError> {
    if !value.is_object() {
        return Err(ApiError::Unavailable(format!(
            "tenant operations {endpoint} returned an invalid JSON shape"
        )));
    }
    Ok(json_no_store(value))
}

fn array_no_store(value: Value, endpoint: &'static str) -> Result<Response, ApiError> {
    if !value.is_array() {
        return Err(ApiError::Unavailable(format!(
            "tenant operations {endpoint} returned an invalid JSON shape"
        )));
    }
    Ok(json_no_store(value))
}

// Proxied mutations have no contract body to validate: CrowdRelay answers
// them with either a JSON object/array or an empty 204. The client maps that
// 204 to `Value::Null`, so a mutation handler that pushed Null through
// `object_no_store` reported a healthy mutation as a 503 "invalid shape".
fn mutation_no_store(value: Value, endpoint: &'static str) -> Result<Response, ApiError> {
    match value {
        Value::Null => Ok(StatusCode::NO_CONTENT.into_response()),
        Value::Object(_) | Value::Array(_) => Ok(json_no_store(value)),
        _ => Err(ApiError::Unavailable(format!(
            "tenant operations {endpoint} returned an invalid JSON shape"
        ))),
    }
}

async fn call(
    state: &AppState,
    slug: &str,
    method: &str,
    path: &str,
    body: Option<&Value>,
    headers: &HeaderMap,
    idempotency: Option<&str>,
) -> Result<(crate::model::TenantSummary, Value), ApiError> {
    let (tenant, target) = crate::area_routes::target(state, slug).await?;
    let value = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method,
                path,
                body,
                correlation_id: correlation(headers),
                idempotency_key: idempotency,
            },
        )
        .await?;
    Ok((tenant, value))
}

#[allow(clippy::too_many_arguments)]
async fn audit_result(
    state: &AppState,
    tenant_id: uuid::Uuid,
    action: &'static str,
    target_kind: &'static str,
    target_id: &str,
    headers: &HeaderMap,
    result: &Result<Value, ApiError>,
    expected_version: Option<u64>,
) {
    // Proxied mutations cross a process/network boundary to CrowdRelay.
    // A 200 from CrowdRelay means it *accepted* the request, not that the
    // external side effect (sending a notification, posting to Reddit, etc.)
    // has been observed. The audit outcome is "accepted" (not "succeeded")
    // so the audit trail never claims the Control Plane observed a
    // completion it did not.
    //
    // `expected_version` is the optimistic-concurrency version the caller
    // sent to CrowdRelay. When CrowdRelay returns 409, the audit row carries
    // the version that was expected so the operator can see "failed because
    // expected_version was X but current is Y" instead of just "failed".
    if let Err(error) = state
        .store
        .audit_control_command(ControlCommandAudit {
            tenant_id,
            actor: &state.admin_actor,
            action,
            target_kind,
            target_id: target_id.to_owned(),
            request_id: correlation(headers),
            outcome: if result.is_ok() { "accepted" } else { "failed" },
            expected_version,
        })
        .await
    {
        tracing::warn!(%error, action, "failed to append redacted tenant operations audit");
    }
}

async fn summary(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/ops/summary",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "summary")
}

/// The intelligence brief: one upstream read composing the brain's verdict,
/// posture, plan, findings, activity and needs into a single story. The
/// upstream assembles it; this is a passthrough.
async fn intelligence(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/ops/intelligence",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "intelligence")
}

/// The fan-source ledger: per-cycle snapshots of where fan growth came from
/// (observed / incremental / durable, per template and per strategy) plus the
/// North Star regime shifts detected over the same window. Read-only — the
/// upstream writes one row per cycle, capped hourly; this is a passthrough.
async fn fan_sources(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Query(params): Query<ListQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = build_list_path("/v1/control-plane/ops/fan-sources", &params)?;
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "fan sources")
}

async fn delivery_details(
    State(state): State<AppState>,
    Path((slug, delivery_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let delivery_id = uuid_segment(&delivery_id)?;
    let path = format!("/v1/control-plane/ops/deliveries/{delivery_id}");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "delivery details")
}

async fn operation_timeline(
    State(state): State<AppState>,
    Path((slug, request_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let request_id = correlation_segment(&request_id)?;
    let path = format!("/v1/control-plane/ops/operations/{request_id}");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "operation timeline")
}

/// Trace timeline: joins all event tables by trace_id to reconstruct the
/// full causal chain of an action lifecycle.
async fn trace_timeline(
    State(state): State<AppState>,
    Path((slug, trace_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let trace_id = uuid_segment(&trace_id)?.to_owned();
    let path = format!("/v1/control-plane/ops/trace/{trace_id}");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "trace timeline")
}

/// Action ledger list: canonical execution state for all autopilot actions.
async fn list_actions(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Query(params): Query<ActionLedgerQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = build_action_ledger_path(&params)?;
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    array_no_store(value, "action ledger")
}

/// Single action ledger entry.
async fn get_action(
    State(state): State<AppState>,
    Path((slug, action_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let action_id = uuid_segment(&action_id)?.to_owned();
    let path = format!("/v1/control-plane/ops/actions/{action_id}");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "action ledger entry")
}

/// Relay process runs: one observed post → one decision → the per-community
/// fan-out, joined upstream into the step shape the process page renders.
/// One call, one upstream read — the console never fans out per community.
async fn list_process_relays(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/processes/relays",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "relay process runs")
}

/// One run's checklist: every community the decision named, its draft, its
/// approval state, its receipt and its latest measurement.
async fn process_relay_run(
    State(state): State<AppState>,
    Path((slug, source_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let source_id = uuid_segment(&source_id)?.to_owned();
    let path = format!("/v1/control-plane/processes/relays/{source_id}");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "relay process run")
}

/// The relay spread's one answer: approve releases every parked delivery to
/// the drip, revoke cancels what has not landed. Both are per-source writes
/// upstream owns end-to-end — the proxy carries the idempotency key and the
/// audit trail, nothing else.
async fn approve_community_relay(
    State(state): State<AppState>,
    Path((slug, source_id)): Path<(String, String)>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Response, ApiError> {
    let source_id = uuid_segment(&source_id)?.to_owned();
    community_relay_mutation(
        &state,
        &slug,
        &source_id,
        "approve",
        &headers,
        body,
        "tenant.community_relay.approved",
    )
    .await
}

async fn revoke_community_relay(
    State(state): State<AppState>,
    Path((slug, source_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let source_id = uuid_segment(&source_id)?.to_owned();
    community_relay_mutation(
        &state,
        &slug,
        &source_id,
        "revoke",
        &headers,
        axum::body::Bytes::new(),
        "tenant.community_relay.revoked",
    )
    .await
}

async fn community_relay_mutation(
    state: &AppState,
    slug: &str,
    source_id: &str,
    verb: &str,
    headers: &HeaderMap,
    body: axum::body::Bytes,
    audit_action: &'static str,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(headers)?.to_owned();
    // Forward the body as opaque JSON — upstream owns the contract (cadence
    // override, per-delivery draft revisions); a typed relay here would
    // silently drop any field this struct forgot. Malformed JSON fails as a
    // bad request here rather than upstream.
    let payload: Option<Value> = if body.is_empty() {
        None
    } else {
        Some(
            serde_json::from_slice(&body)
                .map_err(|_| ApiError::InvalidInput("request body is not valid JSON".to_owned()))?,
        )
    };
    let (tenant, target) = crate::area_routes::target(state, slug).await?;
    let path = format!("/v1/control-plane/autopilot/community-relays/{source_id}/{verb}");
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &path,
                body: payload.as_ref(),
                correlation_id: correlation(headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        state,
        tenant.tenant.id,
        audit_action,
        "community_relay",
        source_id,
        headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, slug).await;
    // Upstream answers 200 with the mutation receipt — a real JSON object,
    // not the 204 the manual-registration write returns.
    object_no_store(result, "community relay mutation")
}

#[derive(Debug, Deserialize)]
struct ManualPostRegistration {
    reddit_post_url: String,
}

/// The process page's manual leg: the operator published a drafted Reddit
/// post by hand, and registering its URL turns the metrics poller on.
/// Upstream owns the real URL check — this bounds the envelope only.
async fn register_manual_community_post(
    State(state): State<AppState>,
    Path((slug, post_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(input): Json<ManualPostRegistration>,
) -> Result<Response, ApiError> {
    let post_id = uuid_segment(&post_id)?.to_owned();
    let url = input.reddit_post_url.trim();
    if url.is_empty() || url.len() > 2048 || !url.starts_with("https://") {
        return Err(ApiError::InvalidInput(
            "a manual post needs its https reddit URL".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let body = json!({ "reddit_post_url": url });
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/community-posts/{post_id}/register-manual"),
                body: Some(&body),
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.community_post.registered_manual",
        "community_post",
        &post_id,
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    // Upstream answers 204 No Content — a success shape object_no_store
    // would refuse as "invalid JSON", so this takes the mutation path.
    mutation_no_store(result, "manual post registration")
}

#[derive(Debug, Deserialize)]
struct ManualSocialPostRegistration {
    platform_post_url: String,
}

/// The manual leg for social posts — the operator published a drafted
/// Facebook/Instagram/Telegram post by hand, and registering its URL closes
/// the row and turns measurement on. Without this route an
/// `awaiting_manual_post` social post could never be closed from the
/// console: upstream and the tunnel both carried it, the proxy did not.
/// Upstream owns the real URL check — this bounds the envelope only.
async fn register_manual_social_post(
    State(state): State<AppState>,
    Path((slug, post_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(input): Json<ManualSocialPostRegistration>,
) -> Result<Response, ApiError> {
    let post_id = uuid_segment(&post_id)?.to_owned();
    let url = input.platform_post_url.trim();
    if url.is_empty() || url.len() > 2048 || !url.starts_with("https://") {
        return Err(ApiError::InvalidInput(
            "a manual post needs its https post URL".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let body = json!({ "platform_post_url": url });
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/social-posts/{post_id}/register-manual"),
                body: Some(&body),
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.social_post.registered_manual",
        "social_post",
        &post_id,
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(result, "manual social post registration")
}

/// What the action actually sent — the words and the addresses it went to.
/// The ledger answers "did it work"; this answers the two questions an
/// operator asks before approving the next send. Upstream answers 404 when
/// the action never emitted — the console renders that as "nothing left",
/// not as an error.
async fn action_sent_record(
    State(state): State<AppState>,
    Path((slug, action_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let action_id = uuid_segment(&action_id)?.to_owned();
    let path = format!("/v1/control-plane/autopilot/actions/{action_id}/sent");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "action sent record")
}

async fn retry_outbox(
    State(state): State<AppState>,
    Path((slug, event_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let event_id = uuid_segment(&event_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/ops/outbox/{event_id}/retry"),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.dead_outbox.retried",
        "outbox_event",
        &event_id,
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "outbox retry")
}

async fn retry_delivery(
    State(state): State<AppState>,
    Path((slug, delivery_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let delivery_id = uuid_segment(&delivery_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/ops/deliveries/{delivery_id}/retry"),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.dead_delivery.retried",
        "webhook_delivery",
        &delivery_id,
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "delivery retry")
}

async fn clear_dead_deliveries(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: "/v1/control-plane/ops/deliveries/dead/clear",
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.dead_deliveries.cleared",
        "delivery_queue",
        "dead",
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "dead delivery clear")
}

async fn run_reconciliation(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let body = json!({ "trigger": "manual" });
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: "/v1/control-plane/ecosystem/reconcile",
                body: Some(&body),
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.ecosystem.reconciled",
        "ecosystem",
        "manual",
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "ecosystem reconciliation")
}

async fn flags(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/ecosystem/flags",
        None,
        &headers,
        None,
    )
    .await?;
    array_no_store(value, "flags")
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct FlagMutation {
    enabled: bool,
    reason: Option<String>,
    expected_version: i64,
}

async fn update_flag(
    State(state): State<AppState>,
    Path((slug, key)): Path<(String, String)>,
    headers: HeaderMap,
    Json(input): Json<FlagMutation>,
) -> Result<Response, ApiError> {
    if !safe_segment(&key)
        || input.expected_version <= 0
        || input
            .reason
            .as_deref()
            .is_some_and(|reason| reason.trim().len() > 500)
    {
        return Err(ApiError::InvalidInput(
            "invalid feature flag mutation".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let reason = input
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|reason| !reason.is_empty())
        .map(str::to_owned);
    let body = json!({
        "enabled": input.enabled,
        "reason": reason,
        "expected_version": input.expected_version,
    });
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/ecosystem/flags/{key}"),
                body: Some(&body),
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.feature_flag.updated",
        "feature_flag",
        &key,
        &headers,
        &result,
        u64::try_from(input.expected_version).ok(),
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "flag mutation")
}

async fn autopilot_overview(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/overview",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "autopilot overview")
}

/// Delivery-side growth progress. Read-only: the Control Plane never claims or
/// completes a delivery, so no idempotency key is involved.
async fn autopilot_growth(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/growth",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "autopilot growth")
}

/// The scout shortlist: every tracked opportunity with its link, costed
/// figures, staleness and newest decision. Read-only — the review acts
/// (progress, dismiss) ride their own routes, not this one.
async fn opportunity_shortlist(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/opportunity-shortlist",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "opportunity shortlist")
}

/// The north stars this tenant may choose.
///
/// Read-only passthrough of the domain vocabulary. The operator UI used to
/// carry its own four-entry copy of this list, which stopped matching the
/// backend the moment the vocabulary widened — so a tenant measured on
/// SoundCloud could not select SoundCloud. One list, served.
async fn list_north_star_options(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/tenant-settings/north-stars",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "north star options")
}

/// The intents a band may state, served from the planner's own vocabulary so
/// the console never offers a value the planner would not recognise — the
/// same reason the north-star list is proxied rather than copied.
async fn list_tenant_intent_options(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/tenant-settings/intents",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "tenant intent options")
}

/// What a full autopilot cycle would decide right now. Read-only: nothing is
/// dispatched, so this is safe to poll while an operator decides whether to run.
async fn autopilot_cycle_preview(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/cycle/preview",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "autopilot cycle preview")
}

/// Runs a full autopilot cycle now.
///
/// This dispatches real work — outreach, posts, invites — so it is audited like
/// every other outward-facing operator action, and requires an idempotency key
/// so a double-click cannot queue two cycles.
async fn autopilot_cycle_run(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: "/v1/control-plane/autopilot/cycle/run",
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.autopilot.cycle_requested",
        "workspace",
        &slug,
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "autopilot cycle run")
}

/// Agent scorecard: is it running, what did it do, did it work.
/// Read-only proxy to CrowdRelay's scorecard read model.
async fn autopilot_scorecard(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/scorecard",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "autopilot scorecard")
}

/// The measurement ledger: the plan's fifteen claims, each with its number
/// or the reason this build cannot produce it. Read-only proxy to
/// CrowdRelay's measurement read model.
async fn autopilot_measurement(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/measurement",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "autopilot measurement")
}

/// Approved actions and what they produced — the per-action outcome lines
/// Today's "is it working" section renders. Read-only proxy to CrowdRelay's
/// outcomes read model. The proxy repairs two things upstream cannot yet
/// send: timestamp fields that arrive as `time`'s positional tuple
/// (deserialized NaN by every browser) are normalized to RFC 3339, and a
/// per-kind `groups` summary is attached so the page can say "4 pushes to
/// fans · measuring" instead of listing raw action ids.
async fn ops_outcomes(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/ops/outcomes",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(normalize_ops_outcomes(value), "ops outcomes")
}

/// `time`'s serde-without-well-known emits `OffsetDateTime` as the positional
/// tuple `[year, ordinal, hour, minute, second, nanosecond, offset_h,
/// offset_m, offset_s]`. A browser `new Date(tuple)` is NaN, so every
/// timestamp reached the page as "recently". Convert to RFC 3339; a tuple
/// that does not parse becomes `null` — a wrong timestamp is worse than a
/// missing one.
fn time_tuple_to_iso(arr: &[Value]) -> Option<String> {
    let int = |i: usize| -> Option<i64> { arr.get(i).and_then(Value::as_i64) };
    let date = chrono::NaiveDate::from_yo_opt(int(0)? as i32, int(1)? as u32)?;
    let time = chrono::NaiveTime::from_hms_nano_opt(
        int(2)? as u32,
        int(3)? as u32,
        int(4)? as u32,
        int(5)? as u32,
    )?;
    let local = date.and_time(time);
    let offset_seconds = if arr.len() >= 9 {
        int(6)? * 3600 + int(7)? * 60 + int(8)?
    } else if arr.len() == 7 {
        int(6)?
    } else {
        // Any other shape is not the OffsetDateTime tuple — relabeling it
        // as UTC would print a wrong timestamp with confidence.
        return None;
    };
    let utc = local - chrono::Duration::seconds(offset_seconds);
    Some(chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(utc, chrono::Utc).to_rfc3339())
}

fn normalize_ops_outcome_timestamps(action: &mut Value) {
    let Some(map) = action.as_object_mut() else {
        return;
    };
    for field in ["finished_at", "approved_at", "next_measurement_due"] {
        if let Some(Value::Array(arr)) = map.get(field) {
            let fixed = time_tuple_to_iso(arr).map_or(Value::Null, |iso| json!(iso));
            map.insert(field.to_owned(), fixed);
        }
    }
}

/// One row per action kind: counts by measurement state and verdict, plus the
/// freshest measured action's metric lines so the page can name a result
/// ("1 interested") without the raw action. Groups sort latest-first, so the
/// row order is stable across calls.
fn group_ops_outcome_actions(actions: &[Value]) -> Value {
    let mut order: Vec<String> = Vec::new();
    let mut by_kind: std::collections::HashMap<String, Vec<&Value>> =
        std::collections::HashMap::new();
    for action in actions {
        let kind = action
            .get("kind")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_owned();
        if !by_kind.contains_key(&kind) {
            order.push(kind.clone());
        }
        by_kind.entry(kind).or_default().push(action);
    }
    let mut groups: Vec<Value> = order
        .into_iter()
        .map(|kind| {
            let rows = &by_kind[&kind];
            let (mut pending, mut unmeasured, mut measured) = (0i64, 0i64, 0i64);
            let (mut improved, mut neutral, mut worsened, mut failed) = (0i64, 0i64, 0i64, 0i64);
            // Two separate "latest" trackers: `latest_finished` orders the
            // group and drives its recency label (any action), while
            // `latest_metrics` comes from the freshest *measured* action —
            // a newer pending one carries empty outcomes and would hide the
            // result line the group can actually show.
            let mut latest_finished: Option<&str> = None;
            let mut latest_measured: Option<(&str, &Value)> = None;
            let mut first_measured: Option<&Value> = None;
            for action in rows.iter().copied() {
                match action.get("outcome_state").and_then(Value::as_str) {
                    Some("pending") => pending += 1,
                    Some("unmeasured") => unmeasured += 1,
                    Some("measured") => {
                        measured += 1;
                        first_measured.get_or_insert(action);
                        if let Some(finished) =
                            action.get("finished_at").and_then(Value::as_str)
                        {
                            if latest_measured.is_none_or(|(current, _)| finished > current) {
                                latest_measured = Some((finished, action));
                            }
                        }
                    }
                    _ => {}
                }
                if action.get("status").and_then(Value::as_str) == Some("failed") {
                    failed += 1;
                }
                if let Some(outcomes) = action.get("outcomes").and_then(Value::as_array) {
                    for outcome in outcomes {
                        match outcome.get("verdict").and_then(Value::as_str) {
                            Some("improved") => improved += 1,
                            Some("neutral") => neutral += 1,
                            Some("worsened") => worsened += 1,
                            _ => {}
                        }
                    }
                }
                if let Some(finished) = action.get("finished_at").and_then(Value::as_str) {
                    if latest_finished.is_none_or(|current| finished > current) {
                        latest_finished = Some(finished);
                    }
                }
            }
            // A measured action with no finished_at still has metrics — it
            // just can't win the recency race, so it is the fallback.
            let latest_metrics = latest_measured
                .map(|(_, action)| action)
                .or(first_measured)
                .and_then(|action| action.get("outcomes"))
                .cloned()
                .unwrap_or(Value::Null);
            json!({
                "kind": kind,
                "context": rows.first().and_then(|a| a.get("context")).cloned().unwrap_or(Value::Null),
                "count": rows.len(),
                "pending": pending,
                "unmeasured": unmeasured,
                "measured": measured,
                "improved": improved,
                "neutral": neutral,
                "worsened": worsened,
                "failed": failed,
                "latest_finished_at": latest_finished,
                "latest_metrics": latest_metrics,
            })
        })
        .collect();
    groups.sort_by(|a, b| {
        b["latest_finished_at"]
            .as_str()
            .cmp(&a["latest_finished_at"].as_str())
    });
    Value::Array(groups)
}

fn normalize_ops_outcomes(mut value: Value) -> Value {
    let Some(map) = value.as_object_mut() else {
        return value;
    };
    let actions = match map.get_mut("actions") {
        Some(Value::Array(actions)) => {
            for action in actions.iter_mut() {
                normalize_ops_outcome_timestamps(action);
            }
            actions.clone()
        }
        // Malformed upstream payload: pass it through untouched rather than
        // fabricate an empty group list that would read as "nothing done".
        _ => return value,
    };
    map.insert("groups".to_owned(), group_ops_outcome_actions(&actions));
    value
}

/// Reply triage: which inbound replies need human review, and how recent
/// replies were classified. Read-only proxy to CrowdRelay's reply triage
/// read model.
async fn autopilot_reply_triage(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/reply-triage",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "autopilot reply triage")
}

/// N.9 — the executor-capability registry the dispatch gate consults: which
/// lanes an unexpired executor advertises, which are held (breaker or expiry),
/// and which a parked action needs while nobody advertises them. Read-only
/// like the scorecard beside it; a tenant that cannot answer fails the panel,
/// not the page.
async fn autopilot_capabilities(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/capabilities",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "executor capabilities")
}

/// Decision evidence: structured "why this decision" data from the persisted
/// decision row. Read-only proxy to CrowdRelay's decision evidence read model.
async fn decision_evidence(
    State(state): State<AppState>,
    Path((slug, decision_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        &format!("/v1/control-plane/autopilot/decisions/{decision_id}/evidence"),
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "decision evidence")
}

/// Learning loop: last 20 decisions with their actions and outcomes.
/// Read-only proxy to CrowdRelay's learning loop read model.
async fn learning_loop(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/learning-loop",
        None,
        &headers,
        None,
    )
    .await?;
    array_no_store(value, "learning loop")
}

/// Learning proof: the belief revisions, what caused each, and the decisions
/// taken afterwards while holding the changed belief. Read-only proxy to
/// CrowdRelay's learning proof read model.
///
/// Where `learning_loop` shows decision → action → outcome, this shows the
/// fourth link — outcome → belief → later decision — which is the only one
/// that says the loop closed rather than merely ran.
async fn learning_proof(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/learning-proof",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "learning proof")
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BulkAutopilotMutation {
    enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AutopilotMutation {
    enabled: bool,
    autonomy_level: String,
    minimum_confidence_basis_points: u16,
    max_actions_24h: u32,
    expected_version: i64,
}

async fn update_autopilot(
    State(state): State<AppState>,
    Path((slug, context)): Path<(String, String)>,
    headers: HeaderMap,
    Json(input): Json<AutopilotMutation>,
) -> Result<Response, ApiError> {
    if !safe_segment(&context)
        || !matches!(
            input.autonomy_level.as_str(),
            "observe" | "recommend" | "require_approval" | "bounded_auto"
        )
        || input.minimum_confidence_basis_points > 10_000
        || !(1..=1_000).contains(&input.max_actions_24h)
        || input.expected_version <= 0
    {
        return Err(ApiError::InvalidInput(
            "invalid Autopilot policy mutation".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let body = json!({
        "enabled": input.enabled,
        "autonomy_level": input.autonomy_level,
        "minimum_confidence_basis_points": input.minimum_confidence_basis_points,
        "max_actions_24h": input.max_actions_24h,
        "expected_version": input.expected_version,
    });
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/autopilot/policies/{context}"),
                body: Some(&body),
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.autopilot_policy.updated",
        "autopilot_policy",
        &context,
        &headers,
        &result,
        u64::try_from(input.expected_version).ok(),
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "autopilot mutation")
}

/// Killswitch / full-enable for every Autopilot policy at once.
///
/// CrowdRelay stays canonical: the upstream overview provides each policy's
/// current version and settings, and this proxy re-posts every policy with
/// its own fresh `expected_version`. Partial failures are reported
/// per-policy instead of failing silently or inventing a second authority.
async fn bulk_autopilot(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(input): Json<BulkAutopilotMutation>,
) -> Result<Response, ApiError> {
    let base_idempotency = idempotency_key(&headers)?.to_owned();
    let (_, overview) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/overview",
        None,
        &headers,
        None,
    )
    .await?;
    let policies = overview
        .get("policies")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    // Validate every policy up front so a missing context or version fails
    // fast without consuming an upstream slot. Invalid policies are reported
    // as failures in their original position; valid policies fan out
    // concurrently over the management tunnel.
    enum Pending {
        Skip(Value),
        Run {
            context: String,
            body: Value,
            derived_key: String,
        },
    }
    let mut pending: Vec<Pending> = Vec::with_capacity(policies.len());
    for policy in &policies {
        let context = policy
            .get("context")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                ApiError::Unavailable("autopilot policy is missing context".to_owned())
            })?;
        if !safe_segment(context) {
            pending.push(Pending::Skip(json!({
                "context": context,
                "ok": false,
                "error": "invalid context",
            })));
            continue;
        }
        let expected_version = policy.get("version").and_then(Value::as_i64);
        let Some(expected_version) = expected_version.filter(|version| *version > 0) else {
            pending.push(Pending::Skip(json!({
                "context": context,
                "ok": false,
                "error": "policy is missing version",
            })));
            continue;
        };
        let body = json!({
            "enabled": input.enabled,
            "autonomy_level": policy.get("autonomy_level"),
            "minimum_confidence_basis_points": policy.get("minimum_confidence_basis_points"),
            "max_actions_24h": policy.get("max_actions_24h"),
            "expected_version": expected_version,
        });
        // Distinct per-policy key: one operator intent fans out into several
        // upstream mutations, each of which must be individually retryable.
        let derived_key = format!("{base_idempotency}:{context}");
        pending.push(Pending::Run {
            context: context.to_owned(),
            body,
            derived_key,
        });
    }
    // Fan out the valid mutations concurrently. The connection pool supports
    // multiple in-flight requests per target, so N policies no longer pay
    // N sequential round-trips. Results land in the same order as `pending`.
    use futures_util::future::join_all;
    let futures: Vec<_> = pending
        .iter()
        .map(|item| async {
            match item {
                Pending::Skip(value) => value.clone(),
                Pending::Run {
                    context,
                    body,
                    derived_key,
                } => {
                    let result = state
                        .area_client
                        .request_management(
                            tenant.tenant.id,
                            &target,
                            ManagementRequest {
                                method: "POST",
                                path: &format!("/v1/control-plane/autopilot/policies/{context}"),
                                body: Some(body),
                                correlation_id: correlation(&headers),
                                idempotency_key: Some(derived_key.as_str()),
                            },
                        )
                        .await;
                    match result {
                        Ok(_) => json!({"context": context, "ok": true}),
                        Err(error) => json!({
                            "context": context,
                            "ok": false,
                            "error": error.to_string(),
                        }),
                    }
                }
            }
        })
        .collect();
    let results: Vec<Value> = join_all(futures).await;
    let failed_count = results.iter().filter(|r| r["ok"] == json!(false)).count();
    let outcome_label = if failed_count > 0 {
        "partial"
    } else {
        "accepted"
    };
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.autopilot_policy.bulk_updated",
        "autopilot_policy",
        "bulk",
        &headers,
        &Ok::<Value, ApiError>(json!({
            "enabled": input.enabled,
            "count": results.len(),
            "failed": failed_count,
            "outcome": outcome_label,
        })),
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(
        json!({
            "enabled": input.enabled,
            "updated": results.iter().filter(|r| r["ok"] == json!(true)).count(),
            "results": results,
        }),
        "bulk autopilot mutation",
    )
}

/// The approve body the proxy forwards — upstream's `ApproveActionRequest`
/// mirrored field for field so a mistyped key fails here instead of riding
/// through: `revision` is the staff surface's corrected-words map, `remember`
/// is the standing-approval opt-in ("approve this and stop asking about this
/// target"). Both absent is the plain approve the button has always meant.
#[derive(Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
struct ApproveOpportunityBody {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    revision: Option<std::collections::BTreeMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    remember: Option<RememberGrantBody>,
}

/// How long "stop asking" lasts and why the operator said yes — mirrors
/// upstream `RememberRequest`. Omitted `days` is the upstream default.
#[derive(Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
struct RememberGrantBody {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    days: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    note: Option<String>,
}

/// "Do it": approve the parked action of one finding through CrowdRelay's
/// canonical approval endpoint. The Control Plane adds only transport
/// validation, the derived per-tenant credential and this audit row — never a
/// second authority path. The body may carry `{"revision": {...}}` (the staff
/// surface's edit) or `{"remember": {...}}` — the standing grant opt-in.
async fn approve_opportunity(
    State(state): State<AppState>,
    Path((slug, action_id)): Path<(String, String)>,
    headers: HeaderMap,
    payload: Option<Json<ApproveOpportunityBody>>,
) -> Result<Response, ApiError> {
    let action_id = uuid_segment(&action_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let body = match payload {
        Some(Json(body)) => Some(
            serde_json::to_value(&body)
                .map_err(|_| ApiError::InvalidInput("invalid approve body".to_owned()))?,
        ),
        None => None,
    };
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/autopilot/actions/{action_id}/approve"),
                body: body.as_ref(),
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.autopilot_action.approved",
        "autopilot_action",
        &action_id,
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "opportunity approval")
}

/// What may run without asking — the standing grants written through the
/// approve flow's `remember` opt-in. Read-only like the policy list it sits
/// beside; a grant is never written from this screen.
async fn standing_approvals(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/standing-approvals",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "standing approvals")
}

/// `action_kind`/`target_key` are upstream identifiers like
/// `community.engage.request` — the same charset a correlation id carries.
fn grant_segment(value: &str) -> Result<&str, ApiError> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
    {
        return Err(ApiError::InvalidInput(
            "valid approval kind and target are required".to_owned(),
        ));
    }
    Ok(value)
}

/// Revoke one standing grant. Upstream stamps the row revoked rather than
/// deleting it — the "which of these did we turn off" question stays
/// answerable — and answers 204.
async fn revoke_standing_approval(
    State(state): State<AppState>,
    Path((slug, action_kind, target_key)): Path<(String, String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let action_kind = grant_segment(&action_kind)?;
    let target_key = grant_segment(&target_key)?;
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "DELETE",
                path: &format!(
                    "/v1/control-plane/autopilot/standing-approvals/{action_kind}/{target_key}"
                ),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: None,
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.standing_approval.revoked",
        "standing_approval",
        &format!("{action_kind}/{target_key}"),
        &headers,
        &result,
        None,
    )
    .await;
    result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    Ok(StatusCode::NO_CONTENT.into_response())
}

/// The screened booking-agent registry as the band sees it — who the agents
/// are, where each season door stands. The contact address never leaves
/// upstream, so it is not in the payload to begin with.
async fn booking_agents(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/booking-agents",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "booking agents")
}

/// The band asks to approach one screened agent — `{agent_id, note?}`.
/// Upstream runs the season gate and queues an awaiting-approval action;
/// the idempotency key makes a retried click the same ask.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BookingAgentApproachInput {
    agent_id: Uuid,
    #[serde(default)]
    note: Option<String>,
}

async fn request_booking_agent_approach(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<BookingAgentApproachInput>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let payload = json!({ "agent_id": body.agent_id, "note": body.note });
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: "/v1/control-plane/booking-agents/approach",
                body: Some(&payload),
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.booking_agent.approach_requested",
        "booking_agent",
        &body.agent_id.to_string(),
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "booking agent approach")
}

/// The batch form — `{agent_ids, note?}`. Upstream gates every selected
/// agent under the season lock, composes each letter, and queues one
/// `awaiting_approval` wave card; the response names the agents the gate
/// refused so the panel can say who the batch could not take. A wave that
/// could take nobody answers 409 with the refusals, never an empty card.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BookingAgentApproachWaveInput {
    agent_ids: Vec<Uuid>,
    #[serde(default)]
    note: Option<String>,
}

async fn request_booking_agent_approach_wave(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<BookingAgentApproachWaveInput>,
) -> Result<Response, ApiError> {
    if body.agent_ids.is_empty() || body.agent_ids.len() > 16 {
        return Err(ApiError::InvalidInput(
            "a wave names between one and sixteen agents".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let payload = json!({ "agent_ids": body.agent_ids, "note": body.note });
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: "/v1/control-plane/booking-agents/approach-wave",
                body: Some(&payload),
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.booking_agent.approach_wave_requested",
        "booking_agent_wave",
        "",
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "booking agent approach wave")
}

/// `{disposition, occurred_at}` — the operator files what the agent answered.
/// `occurred_at` is required upstream (a retried submit must read as the same
/// operation); the proxy checks shape and lets upstream own the vocabulary.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BookingAgentReplyInput {
    disposition: String,
    occurred_at: String,
}

async fn record_booking_agent_reply(
    State(state): State<AppState>,
    Path((slug, agent_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<BookingAgentReplyInput>,
) -> Result<Response, ApiError> {
    let agent_id = uuid_segment(&agent_id)?.to_owned();
    if body.disposition.trim().is_empty() || body.disposition.len() > 64 {
        return Err(ApiError::InvalidInput(
            "a reply disposition is required".to_owned(),
        ));
    }
    if body.occurred_at.trim().is_empty() || body.occurred_at.len() > 64 {
        return Err(ApiError::InvalidInput(
            "when the reply arrived is required".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let payload =
        json!({ "disposition": body.disposition.trim(), "occurred_at": body.occurred_at });
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/booking-agents/{agent_id}/reply"),
                body: Some(&payload),
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.booking_agent.reply_recorded",
        "booking_agent",
        &agent_id,
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "booking agent reply")
}

/// No body — the band's ask to answer the agent's filed reply. Upstream
/// finds the unanswered inbound interaction, composes the scaffold and
/// queues the awaiting-approval card; a retried click is the same ask.
async fn request_booking_agent_reply_draft(
    State(state): State<AppState>,
    Path((slug, agent_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let agent_id = uuid_segment(&agent_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/booking-agents/{agent_id}/reply-draft"),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.booking_agent.reply_draft_requested",
        "booking_agent",
        &agent_id,
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "booking agent reply draft")
}

/// The tenant's issued audience attestations, newest first — the list an
/// operator posts a card link from.
async fn attestations(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/attestations",
        None,
        &headers,
        None,
    )
    .await?;
    array_no_store(value, "attestations")
}

/// Issue a proof card from measured figures. The body is optional
/// (`{ "cities": [...] }`); the figures themselves are always measured
/// upstream — nothing in the request can write a number.
async fn issue_attestation(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: Option<Json<Value>>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let payload = body.map(|Json(value)| value);
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: "/v1/control-plane/attestations",
                body: payload.as_ref(),
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.attestation.issued",
        "attestation",
        "workspace",
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "attestation issue")
}

/// Withdraw a card — every link stops verifying, the row stays. Upstream
/// addresses the document by digest in the path; the operator's body keeps
/// carrying it because the panel never sees the URL shape.
async fn revoke_attestation(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let digest = attestation_digest(&body)?;
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/attestations/{digest}/revoke"),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.attestation.revoked",
        "attestation",
        &digest,
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "attestation revoke")
}

/// Mint a fresh share token, killing every link already sent.
async fn rotate_attestation(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let digest = attestation_digest(&body)?;
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/attestations/{digest}/rotate"),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.attestation.rotated",
        "attestation",
        &digest,
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "attestation rotate")
}

/// The digest the operator's body names, checked before it becomes a path
/// segment — a malformed one is a validation error here, not a 404 upstream.
fn attestation_digest(body: &Value) -> Result<String, ApiError> {
    let digest = body
        .get("digest")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_lowercase();
    if digest.len() != 64 || !digest.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(ApiError::InvalidInput(
            "attestation digest must be 64 lowercase hex characters".into(),
        ));
    }
    Ok(digest)
}

/// Reject / cancel a pending autopilot action so it stops appearing in the
/// approval queue. The brain treats this as a first-class "no" outcome.
async fn cancel_opportunity(
    State(state): State<AppState>,
    Path((slug, action_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let action_id = uuid_segment(&action_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/autopilot/actions/{action_id}/cancel"),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.autopilot_action.cancelled",
        "autopilot_action",
        &action_id,
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "opportunity cancellation")
}

/// "Done ourselves": record that a human handled the finding outside the
/// system — a first-class outcome, not a dismissal.
async fn handle_opportunity_externally(
    State(state): State<AppState>,
    Path((slug, decision_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let decision_id = uuid_segment(&decision_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!(
                    "/v1/control-plane/autopilot/decisions/{decision_id}/handled-externally"
                ),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.autopilot_decision.handled_externally",
        "autopilot_decision",
        &decision_id,
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "opportunity handled externally")
}

/// Approve / pause / resume / revoke one edge. The upstream handler owns the
/// transition policy; this proxy only carries the operator's decision.
async fn decide_portfolio_amplification(
    State(state): State<AppState>,
    Path((slug, consent_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let consent_id = uuid_segment(&consent_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    if !body.is_object() || body.get("action").and_then(Value::as_str).is_none() {
        return Err(ApiError::InvalidInput("action is required".to_owned()));
    }
    let path = format!("/v1/control-plane/portfolio/amplification/{consent_id}/decide");
    // Transport errors propagate unaudited, mirroring the other proxies;
    // the decision outcome itself always lands in the platform audit.
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.portfolio_edge.decided",
        "amplification_consent",
        &consent_id,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "portfolio edge decision")
}

/// Upserts one brand override; upstream validates the key allowlist and
/// invalidates its read cache.
async fn update_portfolio_setting(
    State(state): State<AppState>,
    Path((slug, setting_key)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let trimmed = setting_key.trim();
    let key_ok = !trimmed.is_empty()
        && trimmed.len() <= 96
        && trimmed
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte == b'_');
    if !key_ok {
        return Err(ApiError::InvalidInput(
            "valid setting key is required".to_owned(),
        ));
    }
    if !body.is_object() || body.get("value").and_then(Value::as_str).is_none() {
        return Err(ApiError::InvalidInput("value is required".to_owned()));
    }
    // Empty is a real statement only where upstream's grammar says so —
    // `join_ask_image_url` clears the fixed image by writing "". Every other
    // key keeps the non-empty guard here rather than round-tripping a refusal.
    let empty_value = body
        .get("value")
        .and_then(Value::as_str)
        .is_none_or(|v| v.trim().is_empty());
    if empty_value && trimmed != "join_ask_image_url" {
        return Err(ApiError::InvalidInput("value is required".to_owned()));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path = format!("/v1/control-plane/tenant-settings/{trimmed}");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    // The tenant accepted the write, so its copy is authoritative. Mirror the
    // effective value it returned — not the raw request body, which the
    // tenant may have normalised — so the read models stop quoting the value
    // the tenant row no longer holds. Best-effort: a mirror failure must not
    // 500 a mutation that already landed (the audit below would be skipped
    // too, leaving an accepted write with no audit row), and the next read
    // model refresh re-mirrors from the authoritative copy anyway.
    if trimmed == "north_star_metric" {
        let effective = value
            .get("value")
            .and_then(Value::as_str)
            .or_else(|| body.get("value").and_then(Value::as_str));
        if let Some(metric) = effective {
            if let Err(error) = state
                .store
                .mirror_north_star_metric(tenant.tenant.id, metric.trim())
                .await
            {
                tracing::warn!(
                    tenant = %slug,
                    %error,
                    "north-star mirror failed after the tenant accepted; the tenant copy stays authoritative",
                );
            }
        }
    }
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.portfolio_setting.updated",
        "tenant_setting",
        trimmed,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "portfolio setting update")
}

/// The tenant's editable settings — the Workspace tab's whole read. One
/// upstream call, no audience KPIs carried along; the portfolio fan-out that
/// used to serve this surface dropped its settings section when the editors
/// moved here.
async fn tenant_settings(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/tenant-settings",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "tenant settings")
}

/// `POST /tenants/{slug}/media` — the operator's file goes upstream as its
/// own bytes. This proxy checks only that a body exists; CrowdRelay sniffs
/// the image kind and applies its own bound, so what this surface promises
/// is transport, not validation.
async fn upload_media(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Response, ApiError> {
    if body.is_empty() {
        return Err(ApiError::InvalidInput("the media body is empty".to_owned()));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let file_name = headers
        .get("x-media-name")
        .and_then(|value| value.to_str().ok());
    let content_type = headers
        .get(axum::http::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream");
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management_binary(
            tenant.tenant.id,
            &target,
            crate::tenant_area_client::BinaryManagementRequest {
                path: "/v1/control-plane/media",
                bytes: &body,
                content_type,
                file_name,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.media.uploaded",
        "media",
        file_name.unwrap_or(""),
        &headers,
        &result,
        None,
    )
    .await;
    let value = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(value, "media upload")
}

// ─── Tenant-held secrets ────────────────────────────────────────────────────
// The value crosses this surface once, inbound on the write. It is never
// logged, never echoed into an audit row, and never readable back — the list
// returns only the hint upstream computed when it stored the ciphertext.

/// Secret names the tenant may manage, with the value grammar each accepts.
/// Mirrors the upstream allowlist and its `valid_secret_value` prefixes —
/// keeping both here means a bad paste is refused before it crosses the
/// wire, and a restricted `rk_` key is not rejected on the way to a store
/// that accepts it.
const TENANT_SECRET_NAMES: &[(&str, &[&str])] = &[
    (
        "stripe_secret_key",
        &["sk_live_", "sk_test_", "rk_live_", "rk_test_"],
    ),
    ("stripe_webhook_secret", &["whsec_"]),
];

fn tenant_secret_path(name: &str) -> Result<String, ApiError> {
    TENANT_SECRET_NAMES
        .iter()
        .any(|(allowed, _)| *allowed == name)
        .then(|| format!("/v1/control-plane/secrets/{name}"))
        .ok_or_else(|| ApiError::InvalidInput("unknown secret name".to_owned()))
}

/// Same bounds and prefixes as upstream `valid_secret_value` — the wire copy
/// so a malformed paste never leaves this plane.
fn valid_tenant_secret(name: &str, value: &str) -> bool {
    let Some((_, prefixes)) = TENANT_SECRET_NAMES
        .iter()
        .find(|(allowed, _)| *allowed == name)
    else {
        return false;
    };
    (8..=200).contains(&value.len())
        && value.bytes().all(|b| b.is_ascii_graphic())
        && prefixes.iter().any(|prefix| value.starts_with(prefix))
}

fn invalid_secret_error(name: &str) -> ApiError {
    let (_, prefixes) = TENANT_SECRET_NAMES
        .iter()
        .find(|(allowed, _)| *allowed == name)
        .expect("validated name");
    ApiError::InvalidInput(format!(
        "{name} must start with {} and be printable ASCII 8–200 chars",
        prefixes.join(" or ")
    ))
}

/// `GET /tenants/{slug}/secrets` — masked inventory only.
async fn list_tenant_secrets(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/secrets",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "tenant secrets list")
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct SetTenantSecretBody {
    value: String,
}

/// `PUT /tenants/{slug}/secrets/{name}` — write-only credential set. The body
/// is validated for shape (the prefix the name requires), forwarded verbatim,
/// and the masked view upstream returns is what the client sees.
async fn set_tenant_secret(
    State(state): State<AppState>,
    Path((slug, secret_name)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<SetTenantSecretBody>,
) -> Result<Response, ApiError> {
    let path = tenant_secret_path(&secret_name)?;
    let value = body.value.trim();
    if !valid_tenant_secret(&secret_name, value) {
        return Err(invalid_secret_error(&secret_name));
    }
    let payload = json!({ "value": value });
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "PUT",
                path: &path,
                body: Some(&payload),
                correlation_id: correlation(&headers),
                idempotency_key: None,
            },
        )
        .await;
    // Audited by name — the value never enters the audit row.
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.secret.set",
        "tenant_secret",
        &secret_name,
        &headers,
        &result,
        None,
    )
    .await;
    let value = result?;
    mutation_no_store(value, "tenant secret set")
}

/// `DELETE /tenants/{slug}/secrets/{name}` — unsets the credential.
async fn delete_tenant_secret(
    State(state): State<AppState>,
    Path((slug, secret_name)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = tenant_secret_path(&secret_name)?;
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "DELETE",
                path: &path,
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: None,
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.secret.removed",
        "tenant_secret",
        &secret_name,
        &headers,
        &result,
        None,
    )
    .await;
    let value = result?;
    mutation_no_store(value, "tenant secret removed")
}

/// Registers a new audience block with its acquisition origin.
/// Filters accepted when listing communities.
///
/// Typed rather than forwarded raw. A raw query string would be pasted into the
/// proxied path, which both hands unvalidated input to the URL builder and
/// breaks the proxy allowlist — that matches on the path, so anything with a
/// query appended stops matching and the call is rejected. Rebuilding from
/// named fields keeps the forwarded query a closed set.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AudiencePlacesQuery {
    kind: Option<String>,
    stage: Option<String>,
    limit: Option<u32>,
}

/// Communities the tenant can be discovered in.
///
/// `kind` and `stage` vocabularies are validated upstream, which owns them;
/// this only bounds their shape so a malformed value cannot reach the URL.
async fn list_audience_places(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Query(query): Query<AudiencePlacesQuery>,
) -> Result<Response, ApiError> {
    let mut filters: Vec<String> = Vec::new();
    for (name, value) in [("kind", &query.kind), ("stage", &query.stage)] {
        let Some(value) = value.as_deref().map(str::trim).filter(|v| !v.is_empty()) else {
            continue;
        };
        if value.len() > 64
            || !value
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte == b'_')
        {
            return Err(ApiError::InvalidInput(format!("invalid {name}")));
        }
        filters.push(format!("{name}={value}"));
    }
    if let Some(limit) = query.limit {
        filters.push(format!("limit={}", limit.clamp(1, 200)));
    }
    let path = if filters.is_empty() {
        "/v1/control-plane/audience-graph/places".to_owned()
    } else {
        format!(
            "/v1/control-plane/audience-graph/places?{}",
            filters.join("&")
        )
    };
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "audience graph places")
}

/// Registers one community, or refreshes the mutable facts of an existing one.
async fn upsert_audience_place(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/audience-graph/places",
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.audience_place.upserted",
        "audience_place",
        body.get("url").and_then(Value::as_str).unwrap_or("unknown"),
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "audience graph place upsert")
}

/// Registers a scan of communities in one call.
///
/// The bulk path exists because the alternative is what operators were doing:
/// psql against the tenant's database, with no audit entry and no validation.
async fn import_audience_places(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let count = body
        .get("places")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/audience-graph/places/import",
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.audience_places.imported",
        "audience_place_import",
        &count.to_string(),
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "audience graph place import")
}

/// One-off intent override for the plan read.
///
/// Typed rather than forwarded raw, for the same reason as
/// [`AudiencePlacesQuery`]: the proxied path is matched against the proxy
/// allowlist, so the query is rebuilt from named fields and nothing else can
/// ride along.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GigPlanQuery {
    intent: Option<String>,
}

/// What the band should book next — proposals with their reasons, the cities
/// passed over with theirs, and the track record those reasons now carry.
/// Read-only proxy to CrowdRelay's gig-plan read model.
async fn gig_plan(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Query(query): Query<GigPlanQuery>,
) -> Result<Response, ApiError> {
    let path = match query.intent.as_deref().map(str::trim) {
        Some(intent) if !intent.is_empty() => {
            if intent.len() > 32
                || !intent
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte == b'_')
            {
                return Err(ApiError::InvalidInput("invalid intent".to_owned()));
            }
            format!("/v1/control-plane/gig-plan?intent={intent}")
        }
        _ => "/v1/control-plane/gig-plan".to_owned(),
    };
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "gig plan")
}

/// The band's yes to a proposal. The body names the city by catalogue id —
/// a slug is only unique per country and an approval is the one place a
/// wrong-city resolution cannot be afforded. The proposal itself is
/// recomputed upstream so evidence that moved since the read wins.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApproveGigPlanBody {
    city_id: String,
    /// Approve-with-edit (N.10): the operator's fix to the letter's words,
    /// forwarded verbatim — upstream's draft-revision gate owns which fields
    /// are revisable, what the length bound is, and the refusal sentence.
    #[serde(default)]
    revision: Option<std::collections::BTreeMap<String, String>>,
}

async fn approve_gig_plan(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<ApproveGigPlanBody>,
) -> Result<Response, ApiError> {
    let city_id = body.city_id.trim();
    if uuid::Uuid::parse_str(city_id).is_err() {
        return Err(ApiError::InvalidInput("invalid city_id".to_owned()));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let mut payload = serde_json::json!({ "city_id": city_id });
    if let Some(revision) = body.revision {
        payload["revision"] = serde_json::to_value(revision)
            .map_err(|_| ApiError::InvalidInput("revision is not encodable".to_owned()))?;
    }
    // Audit the result, not just the send: upstream answers a refused approval
    // as 200 `{"refused": "…"}`, and a row that says "approved" for a letter
    // that never queued is the audit lying.
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: "/v1/control-plane/gig-plan/approve",
                body: Some(&payload),
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    let outcome = match &result {
        Ok(value) if value.get("refused").is_some() => "refused",
        Ok(_) => "accepted",
        Err(_) => "failed",
    };
    if let Err(error) = state
        .store
        .audit_control_command(crate::store::ControlCommandAudit {
            tenant_id: tenant.tenant.id,
            actor: &state.admin_actor,
            action: "tenant.gig_proposal.approved",
            target_kind: "gig_proposal",
            target_id: city_id.to_owned(),
            request_id: correlation(&headers),
            outcome,
            expected_version: None,
        })
        .await
    {
        tracing::warn!(%error, "failed to append gig-proposal approval audit");
    }
    let value = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(value, "gig plan approval")
}

async fn create_portfolio_fanbase(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/fanbases",
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.fanbase.created",
        "fanbase",
        value
            .get("fanbaseId")
            .and_then(Value::as_str)
            .unwrap_or("unknown"),
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "portfolio fanbase create")
}

/// Pushes one provider batch through admission on the upstream tenant.
async fn ingest_portfolio_fanbase(
    State(state): State<AppState>,
    Path((slug, fanbase_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let fanbase_id = uuid_segment(&fanbase_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    if !body.is_object()
        || !body
            .get("entries")
            .and_then(Value::as_array)
            .is_some_and(|e| !e.is_empty())
    {
        return Err(ApiError::InvalidInput("entries are required".to_owned()));
    }
    let path = format!("/v1/control-plane/fanbases/{fanbase_id}/ingest");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.fanbase.ingested",
        "fanbase",
        &fanbase_id,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "portfolio fanbase ingest")
}

/// Read-only discovery of webhook endpoints already configured in the
/// tenant's CrowdRelay instance. Surfaces them in the Notifiers tab so
/// operators see existing delivery targets before adding a parallel channel.
async fn discovered_notifier_endpoints(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let value = discovered_notifier_endpoints_value(&state, &slug, &headers).await?;
    mutation_no_store(value, "discovered notifier endpoints")
}

/// The same read, without the response wrapper.
///
/// The notifier overview composes four sections into one request and needs
/// the value, not an HTTP response it would have to parse back.
pub(crate) async fn discovered_notifier_endpoints_value(
    state: &AppState,
    slug: &str,
    headers: &HeaderMap,
) -> Result<Value, ApiError> {
    let (_tenant, value) = call(
        state,
        slug,
        "GET",
        "/v1/control-plane/webhook-endpoints",
        None,
        headers,
        None,
    )
    .await?;
    Ok(value)
}

/// Signal app install metrics and top cities. Read-only proxy to CrowdRelay's
/// signal overview read model.
async fn signal_overview(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/ops/signal-overview",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "signal overview")
}

/// Paginated outbox list (all statuses). Read-only proxy.
async fn list_outbox(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Query(params): Query<ListQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = build_list_path("/v1/control-plane/ops/outbox", &params)?;
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    array_no_store(value, "outbox list")
}

/// Paginated webhook delivery list (all statuses). Read-only proxy.
async fn list_deliveries(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Query(params): Query<ListQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = build_list_path("/v1/control-plane/ops/deliveries", &params)?;
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    array_no_store(value, "deliveries list")
}

/// Delivery results — what the brain actually posted, where, and what
/// engagement it got. Read-only proxy.
async fn list_delivery_results(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Query(params): Query<ListQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = build_list_path("/v1/control-plane/ops/delivery-results", &params)?;
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    // Upstream wraps the list in { "results": [...] }; the panel contract is
    // the same bare array every other operations list returns.
    array_no_store(
        value.get("results").cloned().unwrap_or(Value::Null),
        "delivery results list",
    )
}

/// Retry a dead push delivery. The upstream handler owns the feature flag
/// gate and the row-level transition.
async fn retry_push(
    State(state): State<AppState>,
    Path((slug, delivery_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let delivery_id = uuid_segment(&delivery_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: &format!("/v1/control-plane/ops/push/{delivery_id}/retry"),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.dead_push.retried",
        "push_delivery",
        &delivery_id,
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "push retry")
}

/// Delete a fanbase and its dependent rows. The upstream CASCADE handles
/// ingestions and members; fans themselves stay (they belong to the workspace).
async fn delete_portfolio_fanbase(
    State(state): State<AppState>,
    Path((slug, fanbase_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let fanbase_id = uuid_segment(&fanbase_id)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "DELETE",
                path: &format!("/v1/control-plane/fanbases/{fanbase_id}"),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: None,
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.fanbase.deleted",
        "fanbase",
        &fanbase_id,
        &headers,
        &result,
        None,
    )
    .await;
    // upstream returns 204 No Content on success
    result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    Ok(StatusCode::NO_CONTENT.into_response())
}

#[derive(Debug, Deserialize)]
struct ListQuery {
    limit: Option<u64>,
    status: Option<String>,
}

fn build_list_path(base: &str, params: &ListQuery) -> Result<String, ApiError> {
    let mut query = Vec::new();
    if let Some(limit) = params.limit {
        query.push(format!("limit={limit}"));
    }
    if let Some(status) = &params.status {
        // A non-empty but invalid filter must not silently drop — the
        // upstream call would go out unfiltered and the operator would see
        // all rows believing a filter applied.
        if !status.is_empty() {
            if !safe_segment(status) {
                return Err(ApiError::InvalidInput(format!(
                    "invalid status filter '{status}'"
                )));
            }
            query.push(format!("status={status}"));
        }
    }
    if query.is_empty() {
        Ok(base.to_owned())
    } else {
        Ok(format!("{base}?{}", query.join("&")))
    }
}

#[derive(Debug, Deserialize)]
struct ActionLedgerQuery {
    limit: Option<u64>,
    state: Option<String>,
}

fn build_action_ledger_path(params: &ActionLedgerQuery) -> Result<String, ApiError> {
    let mut query = Vec::new();
    if let Some(limit) = params.limit {
        query.push(format!("limit={limit}"));
    }
    if let Some(state) = &params.state {
        if !state.is_empty() {
            if !safe_segment(state) {
                return Err(ApiError::InvalidInput(format!(
                    "invalid state filter '{state}'"
                )));
            }
            query.push(format!("state={state}"));
        }
    }
    if query.is_empty() {
        Ok("/v1/control-plane/ops/actions".to_owned())
    } else {
        Ok(format!("/v1/control-plane/ops/actions?{}", query.join("&")))
    }
}

// ---------------------------------------------------------------------------
// Fanbase OAuth connections — proxy to crowdrelay's control-plane endpoints.
// ---------------------------------------------------------------------------

async fn list_fanbase_connections(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/fanbases/connections",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "fanbase connections")
}

async fn delete_fanbase_connection(
    State(state): State<AppState>,
    Path((slug, connection_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    uuid_segment(&connection_id)?;
    let path = format!("/v1/control-plane/fanbases/connections/{connection_id}");
    let _ = call(&state, &slug, "DELETE", &path, None, &headers, None).await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    Ok(StatusCode::NO_CONTENT.into_response())
}

/// The tenant's chosen read boundary for the scan-capable connections
/// (Drive folders, a shared drive, a Gmail label, sent mail, a date, or the
/// whole account). The body is `{"scope": {...} | null}` — null unsets,
/// which stops the scan entirely. Validation of the per-platform vocabulary
/// lives upstream; the proxy checks only that the body carries `scope`.
async fn update_fanbase_connection_scan_scope(
    State(state): State<AppState>,
    Path((slug, connection_id)): Path<(String, String)>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    uuid_segment(&connection_id)?;
    let value = body.0;
    if !value.is_object()
        || !value
            .get("scope")
            .is_some_and(|s| s.is_object() || s.is_null())
    {
        return Err(ApiError::InvalidInput(
            "scope must be an object or null".to_owned(),
        ));
    }
    let path = format!("/v1/control-plane/fanbases/connections/{connection_id}/scan-scope");
    let _ = call(&state, &slug, "PATCH", &path, Some(&value), &headers, None).await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    Ok(StatusCode::NO_CONTENT.into_response())
}

async fn create_discord_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/discord",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "discord connection")
}

async fn create_telegram_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/telegram",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "telegram connection")
}

async fn create_lastfm_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/lastfm",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "lastfm connection")
}

async fn create_deezer_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/deezer",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "deezer connection")
}

async fn create_discogs_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/discogs",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "discogs connection")
}

async fn create_bluesky_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/bluesky",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "bluesky connection")
}

async fn create_bandcamp_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/bandcamp",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "bandcamp connection")
}

async fn create_youtube_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/youtube",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "youtube connection")
}

async fn create_facebook_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/facebook",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "facebook connection")
}

async fn create_instagram_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/instagram",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "instagram connection")
}

async fn create_soundcloud_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/soundcloud",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "soundcloud connection")
}

async fn create_reddit_connection(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: axum::Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/connections/reddit",
        Some(&body.0),
        &headers,
        Some(&idempotency),
    )
    .await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "reddit connection")
}

// ---------------------------------------------------------------------------
// Audience intelligence — read-only proxies to CrowdRelay's control-plane
// audience endpoints. Fan list, fan detail, fan journey, audience segments.
// ---------------------------------------------------------------------------

async fn audience_overview(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/audience/overview",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "audience overview")
}

async fn audience_fans(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Query(params): Query<ListQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = build_list_path("/v1/control-plane/audience/fans", &params)?;
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    array_no_store(value, "audience fans")
}

async fn audience_fan_detail(
    State(state): State<AppState>,
    Path((slug, fan_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let fan_id = uuid_segment(&fan_id)?;
    let path = format!("/v1/control-plane/audience/fans/{fan_id}");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "fan detail")
}

async fn audience_fan_journey(
    State(state): State<AppState>,
    Path((slug, fan_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let fan_id = uuid_segment(&fan_id)?;
    let path = format!("/v1/control-plane/audience/fans/{fan_id}/journey");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "fan journey")
}

/// `valid_tag` mirrored from CrowdRelay: lowercase or digit start, then
/// lowercase / digit / `:` / `_` / `-`, max 64 chars. The proxy lowercases
/// first — an operator typing "VIP" writes `vip`, same as upstream.
fn valid_fan_tag(tag: &str) -> bool {
    let mut chars = tag.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    tag.len() <= 64
        && (first.is_ascii_lowercase() || first.is_ascii_digit())
        && chars
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, ':' | '_' | '-'))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FanTagInput {
    tag: String,
}

/// POST — adds an operator tag to a fan. Upstream stores source='operator'.
async fn add_fan_tag(
    State(state): State<AppState>,
    Path((slug, fan_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<FanTagInput>,
) -> Result<Response, ApiError> {
    let fan_id = uuid_segment(&fan_id)?;
    let tag = body.tag.trim().to_ascii_lowercase();
    if !valid_fan_tag(&tag) {
        return Err(ApiError::InvalidInput(
            "a tag is lowercase letters, digits, ':', '_' or '-' — 64 chars max".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &format!("/v1/control-plane/audience/fans/{fan_id}/tags"),
        Some(&json!({ "tag": tag })),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.fan.tag_added",
        "fan",
        fan_id,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "fan tag add")
}

/// POST — removes an operator tag from a fan.
async fn remove_fan_tag(
    State(state): State<AppState>,
    Path((slug, fan_id, tag)): Path<(String, String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let fan_id = uuid_segment(&fan_id)?;
    let tag = tag.trim().to_ascii_lowercase();
    if !valid_fan_tag(&tag) {
        return Err(ApiError::InvalidInput(
            "a tag is lowercase letters, digits, ':', '_' or '-' — 64 chars max".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &format!("/v1/control-plane/audience/fans/{fan_id}/tags/{tag}/remove"),
        None,
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.fan.tag_removed",
        "fan",
        fan_id,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "fan tag remove")
}

async fn audience_segments(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/audience/segments",
        None,
        &headers,
        None,
    )
    .await?;
    array_no_store(value, "audience segments")
}

async fn audience_segment_preview(
    State(state): State<AppState>,
    Path((slug, slug_segment)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    if !safe_segment(&slug_segment) {
        return Err(ApiError::InvalidInput(
            "valid segment slug is required".to_owned(),
        ));
    }
    let path = format!("/v1/control-plane/audience/segments/{slug_segment}/preview");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "segment preview")
}

// ---------------------------------------------------------------------------
// Growth metrics, objectives, posture — proxies to CrowdRelay's control-plane
// autopilot endpoints. Coverage and trends are read-only; objectives and
// posture support both reads and mutations.
// ---------------------------------------------------------------------------

async fn growth_metric_coverage(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/growth-metrics/coverage",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "growth metric coverage")
}

async fn growth_metric_trends(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/growth-metrics/trends",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "growth metric trends")
}

async fn growth_objectives(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/objectives",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "growth objectives")
}

async fn declare_growth_objective(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    if !body.is_object() {
        return Err(ApiError::InvalidInput(
            "objective body is required".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/autopilot/objectives",
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.growth_objective.declared",
        "growth_objective",
        value.get("id").and_then(Value::as_str).unwrap_or("unknown"),
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "growth objective declare")
}

async fn retire_growth_objective(
    State(state): State<AppState>,
    Path((slug, objective_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let objective_id = uuid_segment(&objective_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path = format!("/v1/control-plane/autopilot/objectives/{objective_id}/retire");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        None,
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.growth_objective.retired",
        "growth_objective",
        &objective_id,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "growth objective retire")
}

/// The real-material panel's list: every trusted content source the content
/// loop may draw on — videos, releases, stories, events — with the metadata
/// that carries their links.
async fn content_sources(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/content-sources",
        None,
        &headers,
        None,
    )
    .await?;
    array_no_store(value, "content sources")
}

/// What the panel sends for a new or corrected piece of real material.
/// `source_kind` is constrained to the registry's vocabulary; `metadata`
/// carries the link or story body. Everything is forwarded to the tenant's
/// versioned upsert — optimistic concurrency (`expected_version`) is the
/// tenant's call to check, not ours.
#[derive(Debug, Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
struct ContentSourceUpsert {
    source_id: Option<uuid::Uuid>,
    source_kind: String,
    source_key: String,
    title: String,
    occurred_at: String,
    expires_at: String,
    metadata: Value,
    /// Omit to leave the flag alone; send it to retire or reinstate.
    active: Option<bool>,
    expected_version: i64,
}

async fn upsert_content_source(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(input): Json<ContentSourceUpsert>,
) -> Result<Response, ApiError> {
    let valid = matches!(
        input.source_kind.as_str(),
        "event" | "release" | "show_completed" | "video" | "story" | "social_post"
    ) && !input.source_key.trim().is_empty()
        && input.source_key.len() <= 200
        && !input.title.trim().is_empty()
        && input.title.len() <= 240
        && input.expected_version >= 0
        && (input.expected_version == 0 || input.source_id.is_some())
        && input.metadata.is_object()
        && chrono::DateTime::parse_from_rfc3339(&input.occurred_at).is_ok()
        && chrono::DateTime::parse_from_rfc3339(&input.expires_at).is_ok();
    if !valid {
        return Err(ApiError::InvalidInput(
            "content source fields are incomplete or out of bounds".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let body = serde_json::to_value(&input)
        .map_err(|_| ApiError::InvalidInput("content source could not be serialised".to_owned()))?;
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/autopilot/content-sources",
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.content_source.upserted",
        "content_source",
        value
            .get("source_id")
            .and_then(Value::as_str)
            .unwrap_or("unknown"),
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "content source upsert")
}

async fn growth_posture(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/posture",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "growth posture")
}

/// Google Drive contacts: the review queue every extracted address lands
/// in. Nothing is classified upstream — the panel promotes or dismisses
/// per destination, and fan/beacon outcomes stay independent because a
/// beacon may also be a fan. `?segment=` filters to one upstream segment
/// (likely_fan / likely_org / beacon / inactive / gone); an unknown name is
/// refused upstream with a 400, which this plane passes through.
#[derive(Debug, Deserialize)]
struct GdriveContactsQuery {
    segment: Option<String>,
}

async fn gdrive_contacts(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Query(query): Query<GdriveContactsQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let mut path = "/v1/control-plane/gdrive/contacts".to_owned();
    if let Some(segment) = &query.segment {
        // The vocabulary is upstream's; safe_segment only keeps a hostile
        // string out of the forwarded URL — it never decides validity. A
        // name that fails it is malformed input, not "no filter": silently
        // widening to the whole queue would show contacts the operator did
        // not ask to see under a chip that claims a count.
        if !safe_segment(segment) {
            return Err(ApiError::InvalidInput(
                "segment must be a lowercase identifier".to_owned(),
            ));
        }
        path = format!("{path}?segment={segment}");
    }
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "gdrive contacts")
}

/// The content page's pipeline read: its approval-queue slice, live material
/// count and the titles those drafts cite — upstream owns the shape.
async fn content_pipeline(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/content/pipeline",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "content pipeline")
}

async fn gdrive_scan(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    // POSTs forward a key or never leave this plane — a scan without one
    // was refused before it could run.
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/gdrive/scan",
        None,
        &headers,
        Some(&idempotency),
    )
    .await?;
    mutation_no_store(value, "gdrive scan")
}

/// The upload body the panel sends: `{file_name, csv}`. `deny_unknown_fields`
/// keeps a stray field from travelling further than this plane; the sheet's
/// own size/row bounds and its "not a contact list" answer live upstream.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct DriveContactUpload {
    file_name: String,
    csv: String,
}

async fn gdrive_upload(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(input): Json<DriveContactUpload>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let body = serde_json::json!({
        "file_name": input.file_name,
        "csv": input.csv,
    });
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/gdrive/contacts/upload",
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.contacts.uploaded",
        "drive_contacts",
        &input.file_name,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "contacts upload")
}

/// The promote body: `destination` picks fan or beacon, `kind` names the
/// beacon target kind when the file did not say. Everything else — consent
/// posture, screening status — is the upstream's contract, not ours.
#[derive(Debug, Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
struct DriveContactOutcome {
    destination: String,
    kind: Option<String>,
    /// City slug for booking kinds — booking candidates are city-scoped.
    city: Option<String>,
}

/// The batch-promote body the confirm dialog sends. `expected_count` is the
/// number the operator saw and confirmed — upstream re-counts the segment
/// and answers 409 when a scan moved it between fetch and click, so a stale
/// count never widens a send. `reason` is the one line the executor prints
/// in the opt-in invitation.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct DriveContactsBatchPromote {
    destination: String,
    segment: String,
    expected_count: i64,
    reason: Option<String>,
}

async fn promote_drive_contacts_batch(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(input): Json<DriveContactsBatchPromote>,
) -> Result<Response, ApiError> {
    if input.destination != "fan" {
        return Err(ApiError::InvalidInput(
            "batch promote only accepts destination 'fan' — beacons stay per-row".to_owned(),
        ));
    }
    if !safe_segment(&input.segment) {
        return Err(ApiError::InvalidInput(
            "segment must be a lowercase identifier".to_owned(),
        ));
    }
    if input.expected_count < 0 {
        return Err(ApiError::InvalidInput(
            "expected_count cannot be negative".to_owned(),
        ));
    }
    let reason = input
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|r| !r.is_empty());
    if let Some(reason) = reason {
        // Matches the upstream bound: the invitation is one line, not a
        // letter — a longer one belongs in the n8n template itself.
        if reason.chars().count() > 200 {
            return Err(ApiError::InvalidInput(
                "reason is one line — 200 characters at most".to_owned(),
            ));
        }
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let body = serde_json::json!({
        "destination": "fan",
        "segment": input.segment,
        "expected_count": input.expected_count,
        "reason": reason,
    });
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/gdrive/contacts/promote-batch",
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.drive_contacts.batch_promoted",
        "drive_contacts",
        &input.segment,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "drive contacts batch promote")
}

async fn promote_drive_contact(
    State(state): State<AppState>,
    Path((slug, contact_id)): Path<(String, uuid::Uuid)>,
    headers: HeaderMap,
    Json(input): Json<DriveContactOutcome>,
) -> Result<Response, ApiError> {
    drive_contact_outcome(&state, &slug, contact_id, "promote", &input, &headers).await
}

async fn dismiss_drive_contact(
    State(state): State<AppState>,
    Path((slug, contact_id)): Path<(String, uuid::Uuid)>,
    headers: HeaderMap,
    Json(input): Json<DriveContactOutcome>,
) -> Result<Response, ApiError> {
    drive_contact_outcome(&state, &slug, contact_id, "dismiss", &input, &headers).await
}

async fn drive_contact_outcome(
    state: &AppState,
    slug: &str,
    contact_id: uuid::Uuid,
    verb: &str,
    input: &DriveContactOutcome,
    headers: &HeaderMap,
) -> Result<Response, ApiError> {
    let valid = matches!(input.destination.as_str(), "fan" | "beacon")
        && input.kind.as_deref().is_none_or(|k| {
            k.len() <= 40 && k.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
        });
    if !valid {
        return Err(ApiError::InvalidInput(
            "drive contact outcome needs destination fan or beacon".to_owned(),
        ));
    }
    // The tenant resolves a city case-insensitively, so the slug check runs
    // after normalising — "Wroclaw" and "wroclaw" name the same place, and
    // refusing the former with a destination message blamed the wrong field.
    // The bound matches `cities.slug`'s CHECK (128, must start alnum).
    let city = input
        .city
        .as_deref()
        .map(str::trim)
        .map(str::to_lowercase)
        .filter(|c| !c.is_empty());
    if let Some(c) = &city {
        let slugged = c.len() <= 128
            && c.bytes().next().is_some_and(|b| b.is_ascii_alphanumeric())
            && c.bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_');
        if !slugged {
            return Err(ApiError::InvalidInput(
                "city must be a city slug — letters, digits, '-' or '_'".to_owned(),
            ));
        }
    }
    let idempotency = idempotency_key(headers)?.to_owned();
    let body = serde_json::json!({
        "destination": input.destination,
        "kind": input.kind,
        "city": city,
    });
    let path = format!("/v1/control-plane/gdrive/contacts/{contact_id}/{verb}");
    let (tenant, value) = call(
        state,
        slug,
        "POST",
        &path,
        Some(&body),
        headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    let action = match verb {
        "promote" => "tenant.drive_contact.promoted",
        _ => "tenant.drive_contact.dismissed",
    };
    audit_result(
        state,
        tenant.tenant.id,
        action,
        "drive_contact",
        &contact_id.to_string(),
        headers,
        &result,
        None,
    )
    .await;
    mutation_no_store(value, "drive contact outcome")
}

/// §4h-12 — the Listing tab. One read returns everything it renders: the
/// draft as saved, the share token, and the month's approach allowance.
async fn listing_state(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/listing",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "listing state")
}

/// Saving a listing never publishes it — the shape check here is
/// deliberate thinness: upstream owns every bound, this plane owns the
/// audit trail.
async fn save_listing(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    listing_write(&state, &slug, "", &body, &headers, "tenant.listing.saved").await
}

async fn publish_listing(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    listing_write(
        &state,
        &slug,
        "/publish",
        &Value::Null,
        &headers,
        "tenant.listing.published",
    )
    .await
}

async fn unlist_listing(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    listing_write(
        &state,
        &slug,
        "/unlist",
        &Value::Null,
        &headers,
        "tenant.listing.unlisted",
    )
    .await
}

async fn rotate_listing_token(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    listing_write(
        &state,
        &slug,
        "/rotate-token",
        &Value::Null,
        &headers,
        "tenant.listing.token_rotated",
    )
    .await
}

async fn listing_write(
    state: &AppState,
    slug: &str,
    suffix: &str,
    body: &Value,
    headers: &HeaderMap,
    action: &'static str,
) -> Result<Response, ApiError> {
    // The transition calls carry no body; the save requires an object.
    let valid = if suffix.is_empty() {
        body.is_object()
    } else {
        body.is_null()
    };
    if !valid {
        return Err(ApiError::InvalidInput(
            "listing body must be an object".to_owned(),
        ));
    }
    let idempotency = idempotency_key(headers)?.to_owned();
    let path = format!("/v1/control-plane/listing{suffix}");
    let (tenant, value) = call(
        state,
        slug,
        "POST",
        &path,
        if body.is_null() { None } else { Some(body) },
        headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        state,
        tenant.tenant.id,
        action,
        "band_listing",
        "listing",
        headers,
        &result,
        None,
    )
    .await;
    mutation_no_store(value, "listing write")
}

async fn representation_targets(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/representation/targets",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "representation targets")
}

/// A representation contact the band enters itself — kind is pinned to
/// agent/label upstream; the idempotent write is audited here.
async fn upsert_representation_target(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    if !body.is_object() {
        return Err(ApiError::InvalidInput(
            "representation target body is required".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/representation/targets",
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.representation_target.upserted",
        "representation_target",
        body.get("target_id")
            .and_then(Value::as_str)
            .unwrap_or("new"),
        &headers,
        &result,
        None,
    )
    .await;
    mutation_no_store(value, "representation target upsert")
}

/// The approach: the band picks a consented agent or label; the request
/// queues for approval upstream and dispatch re-runs every gate.
async fn request_representation_approach(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let valid = body.is_object()
        && body
            .get("target_id")
            .and_then(Value::as_str)
            .is_some_and(|raw| Uuid::parse_str(raw).is_ok());
    if !valid {
        return Err(ApiError::InvalidInput(
            "approach needs a target_id".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/representation/approach",
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.representation.approach_requested",
        "representation_target",
        body.get("target_id")
            .and_then(Value::as_str)
            .unwrap_or("unknown"),
        &headers,
        &result,
        None,
    )
    .await;
    mutation_no_store(value, "representation approach")
}

async fn set_growth_posture(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    if !body.is_object() {
        return Err(ApiError::InvalidInput(
            "posture body is required".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/autopilot/posture",
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.growth_posture.updated",
        "growth_posture",
        "posture",
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "growth posture update")
}

async fn acquisition_channels(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/acquisition-channels",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "acquisition channels")
}

#[derive(Debug, Deserialize)]
struct CityFunnelQuery {
    order: Option<String>,
}

/// The per-city place read: fans, trend, reachable, bookable supply, show
/// gaps and the organise-now score. `?order=organise` forwards the ranked
/// sort upstream.
async fn audience_city_funnel(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Query(params): Query<CityFunnelQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let path = match params.order.as_deref() {
        Some(order) if safe_segment(order) => {
            format!("/v1/control-plane/audience/city-funnel?order={order}")
        }
        _ => "/v1/control-plane/audience/city-funnel".to_owned(),
    };
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    array_no_store(value, "city funnel")
}

/// The shared venue registry: per-room aggregates across tenants — shows
/// played, typical draw, repeat attenders. Aggregates only upstream; this
/// adds nothing of its own.
async fn audience_city_venues(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/audience/city-venues",
        None,
        &headers,
        None,
    )
    .await?;
    array_no_store(value, "city venues")
}

/// The registry-verification brief: the held venues, bands and booking
/// agents rendered into the paste-ready prompt an operator hands to their
/// AI — verify each entry's liveness, mark the dead ones, name the active
/// ones the registry misses. The answer sheets land back through the Drive
/// intake upstream.
async fn audience_registry_verification_brief(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/audience/registry-verification-brief",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "registry verification brief")
}

async fn tour_economics(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/tour-economics",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "tour economics")
}

async fn show_economics(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/show-economics",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "show economics")
}

async fn tenant_shows(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/events",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "shows")
}

/// `POST /tenants/{slug}/shows` — a night the operator types in by hand.
/// Upstream owns the write (find-or-create city, slug uniqueness, draft vs
/// announced); this surface mirrors the transport bounds so a malformed form
/// never crosses the wire, and audits the mutation like every other show
/// write.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateShowBody {
    title: String,
    starts_at: String,
    doors_at: Option<String>,
    ends_at: Option<String>,
    venue: Option<String>,
    venue_address: Option<String>,
    city_name: Option<String>,
    city_country_code: Option<String>,
    city_region: Option<String>,
    timezone: Option<String>,
    ticket_url: Option<String>,
    #[serde(default)]
    publish: bool,
}

fn valid_show_timestamp(value: &str) -> Option<chrono::DateTime<chrono::FixedOffset>> {
    chrono::DateTime::parse_from_rfc3339(value.trim()).ok()
}

// Byte bound, not chars — the upstream domain validator checks `str::len()`,
// so the mirror must too or a multibyte name would pass here and fail there.
fn valid_show_text(value: Option<&str>, max_bytes: usize) -> bool {
    value.is_none_or(|text| {
        let trimmed = text.trim();
        !trimmed.is_empty() && trimmed.len() <= max_bytes && !trimmed.chars().any(char::is_control)
    })
}

/// Validates the form against the same bounds the upstream write applies and
/// returns the JSON body forwarded to it. Pure, so the mirror is tested
/// without standing a tenant up.
fn show_create_payload(body: &CreateShowBody) -> Result<Value, ApiError> {
    let title = body.title.trim();
    let Some(starts_at) = valid_show_timestamp(&body.starts_at) else {
        return Err(ApiError::InvalidInput(
            "invalid show: starts_at must be RFC 3339".to_owned(),
        ));
    };
    let doors_at = body.doors_at.as_deref().map(valid_show_timestamp);
    let ends_at = body.ends_at.as_deref().map(valid_show_timestamp);
    // Present-but-empty is absent for the pair check — upstream trims to the
    // same conclusion, and the pair must match here before it gets there.
    let city_name = body
        .city_name
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty());
    let city_country_code = body
        .city_country_code
        .as_deref()
        .map(str::trim)
        .map(str::to_uppercase)
        .filter(|v| !v.is_empty());
    let city_ok = city_name.is_some() == city_country_code.is_some()
        && city_country_code
            .as_deref()
            .is_none_or(|code| code.len() == 2 && code.bytes().all(|b| b.is_ascii_uppercase()));
    // A present-but-unparseable time is invalid, not absent.
    let schedule_ok = match &doors_at {
        None => true,
        Some(parsed) => parsed.is_some_and(|doors| doors <= starts_at),
    } && match &ends_at {
        None => true,
        Some(parsed) => parsed.is_some_and(|ends| ends >= starts_at),
    };
    let ticket_url = body.ticket_url.as_deref().map(str::trim);
    // Same door-link rules the domain applies: a real https URL with a host,
    // no credentials-in-URL, no fragment — otherwise upstream refuses and the
    // operator sees a generic bad_request instead of a form-level error.
    let ticket_ok = ticket_url.is_none_or(|url| {
        url.len() <= 2048
            && Url::parse(url).is_ok_and(|parsed| {
                parsed.scheme() == "https"
                    && parsed.host_str().is_some()
                    && parsed.username().is_empty()
                    && parsed.password().is_none()
                    && parsed.fragment().is_none()
            })
    });
    // A region only colours a city pair that exists.
    let region_ok = body
        .city_region
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .is_none()
        || city_name.is_some();
    let fields_ok = valid_show_text(Some(title), 300)
        && valid_show_text(body.venue.as_deref(), 500)
        && valid_show_text(body.venue_address.as_deref(), 500)
        && valid_show_text(body.city_name.as_deref(), 200)
        && valid_show_text(body.city_region.as_deref(), 100)
        && valid_show_text(body.timezone.as_deref(), 128)
        && schedule_ok
        && ticket_ok
        && city_ok
        && region_ok;
    if !fields_ok {
        return Err(ApiError::InvalidInput(
            "invalid show: title required (≤300), RFC 3339 times with doors ≤ start ≤ end, \
             venue ≤500, https ticket_url, city name + country code together"
                .to_owned(),
        ));
    }
    Ok(json!({
        "title": title,
        "starts_at": starts_at.to_rfc3339(),
        "doors_at": doors_at.flatten().map(|value| value.to_rfc3339()),
        "ends_at": ends_at.flatten().map(|value| value.to_rfc3339()),
        "venue": body.venue.as_deref().map(str::trim).filter(|v| !v.is_empty()),
        "venue_address": body.venue_address.as_deref().map(str::trim).filter(|v| !v.is_empty()),
        "city_name": city_name,
        "city_country_code": city_country_code,
        "city_region": body.city_region.as_deref().map(str::trim).filter(|v| !v.is_empty()),
        "timezone": body.timezone.as_deref().map(str::trim).filter(|v| !v.is_empty()),
        "ticket_url": ticket_url.filter(|v| !v.is_empty()),
        "publish": body.publish,
    }))
}

async fn tenant_show_create(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<CreateShowBody>,
) -> Result<Response, ApiError> {
    let title = body.title.trim().to_owned();
    let payload = show_create_payload(&body)?;
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: "/v1/control-plane/events",
                body: Some(&payload),
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    // The audit record points at the slug upstream minted — the durable name
    // for the night — falling back to the title when the call failed before
    // one existed. Held as a Result so a refused create is audited too, like
    // every other proxied mutation.
    let audit_target = result
        .as_ref()
        .ok()
        .and_then(|value| value.get("slug"))
        .and_then(Value::as_str)
        .unwrap_or(&title)
        .to_owned();
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.show.created",
        "event",
        &audit_target,
        &headers,
        &result,
        None,
    )
    .await;
    let value = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "show")
}

async fn tenant_show_timeline(
    State(state): State<AppState>,
    Path((slug, event_slug)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        &format!("/v1/control-plane/events/{event_slug}/timeline"),
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "show timeline")
}

async fn tenant_show_scan(
    State(state): State<AppState>,
    Path((slug, event_slug)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        &format!("/v1/control-plane/events/{event_slug}/scan"),
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "show scan")
}

async fn tenant_show_report(
    State(state): State<AppState>,
    Path((slug, event_slug)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        &format!("/v1/control-plane/events/{event_slug}/report"),
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "show report")
}

async fn tenant_show_helpers(
    State(state): State<AppState>,
    Path((slug, event_slug)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        &format!("/v1/control-plane/events/{event_slug}/who-can-help"),
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "show helpers")
}

/// One act in a bill-replacement body — mirrors upstream `EventActInput`.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ShowActInput {
    act_slug: String,
    act_name: String,
    #[serde(default)]
    position: i32,
    #[serde(default)]
    ticket_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ReplaceShowActsBody {
    acts: Vec<ShowActInput>,
}

/// Upstream's bounds, mirrored so a malformed bill is refused before it
/// leaves the control plane: 32 acts, slug shape, name and https ticket URL.
/// Upstream remains the authority — this catches the obvious failures here.
fn valid_show_act(act: &ShowActInput) -> bool {
    let slug = act.act_slug.trim();
    let name = act.act_name.trim();
    let mut chars = slug.chars();
    let slug_ok = (1..=64).contains(&slug.len())
        && chars
            .next()
            .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    let url_ok = act
        .ticket_url
        .as_deref()
        .is_none_or(|url| url.trim().to_ascii_lowercase().starts_with("https://"));
    slug_ok
        && !name.is_empty()
        && name.chars().count() <= 160
        && !name.chars().any(char::is_control)
        && (0..=999).contains(&act.position)
        && url_ok
}

/// `PUT /tenants/{slug}/shows/{event_slug}/acts` — the night's bill, replaced
/// atomically upstream. This is the crossbill step's only write path: without
/// it the operator needs a raw API call against a credential they don't hold.
async fn tenant_show_acts_replace(
    State(state): State<AppState>,
    Path((slug, event_slug)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<ReplaceShowActsBody>,
) -> Result<Response, ApiError> {
    if body.acts.len() > 32 || body.acts.iter().any(|act| !valid_show_act(act)) {
        return Err(ApiError::InvalidInput(
            "invalid bill: up to 32 acts, each with a slug, a name and an optional https ticket_url"
                .to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let payload = serde_json::json!({ "acts": body.acts.iter().map(|act| {
        serde_json::json!({
            "act_slug": act.act_slug.trim().to_ascii_lowercase(),
            "act_name": act.act_name.trim(),
            "position": act.position,
            "ticket_url": act.ticket_url.as_deref().map(str::trim).filter(|u| !u.is_empty()),
        })
    }).collect::<Vec<_>>() });
    let (tenant, value) = call(
        &state,
        &slug,
        "PUT",
        &format!("/v1/control-plane/events/{event_slug}/acts"),
        Some(&payload),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.show_bill.replaced",
        "event",
        &event_slug,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    // Upstream replaces the bill with 204 No Content — object_no_store would
    // read the Null body as a broken contract and report a saved bill as a
    // failure. Mirror the upstream status instead.
    if value.is_null() {
        return Ok(StatusCode::NO_CONTENT.into_response());
    }
    mutation_no_store(value, "show bill")
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ShowCounterpartyBody {
    counterparty_name: Option<String>,
    counterparty_email: Option<String>,
}

/// `PUT /tenants/{slug}/shows/{event_slug}/counterparty` — who the T+7
/// post-show report goes to besides the band. Null clears, same as upstream.
async fn tenant_show_counterparty(
    State(state): State<AppState>,
    Path((slug, event_slug)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<ShowCounterpartyBody>,
) -> Result<Response, ApiError> {
    let name_ok = body
        .counterparty_name
        .as_deref()
        .is_none_or(|name| name.chars().count() <= 160 && !name.chars().any(char::is_control));
    let email_ok = body.counterparty_email.as_deref().is_none_or(|email| {
        let trimmed = email.trim();
        !trimmed.is_empty()
            && trimmed.len() <= 320
            && trimmed.chars().all(|c| c.is_ascii_graphic())
            && trimmed.split_once('@').is_some_and(|(_, domain)| {
                domain
                    .rfind('.')
                    .is_some_and(|dot| dot > 0 && dot + 1 < domain.len())
            })
    });
    if !name_ok || !email_ok {
        return Err(ApiError::InvalidInput(
            "invalid counterparty: name ≤160 chars, email name@domain.tld".to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let payload = serde_json::json!({
        "counterparty_name": body.counterparty_name.as_deref().map(str::trim).filter(|v| !v.is_empty()),
        "counterparty_email": body.counterparty_email.as_deref().map(str::trim).filter(|v| !v.is_empty()),
    });
    let (tenant, value) = call(
        &state,
        &slug,
        "PUT",
        &format!("/v1/control-plane/events/{event_slug}/counterparty"),
        Some(&payload),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.show_counterparty.set",
        "event",
        &event_slug,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "show counterparty")
}

// ── The shared night (4V.6b) ─────────────────────────────────────────
// Proxied straight through: the boundary — which lens the caller gets, what
// a workspace may publish, who may confirm — is upstream's domain work, not
// this file's. The lens is never a parameter the caller picks.

/// `GET /tenants/{slug}/nights/{place_event_id}` — the night through the
/// tenant workspace's own lens. No relationship is the same 404 as no night.
async fn tenant_night(
    State(state): State<AppState>,
    Path((slug, place_event_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let night = uuid_segment(&place_event_id)?;
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        &format!("/v1/control-plane/nights/{night}"),
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "shared night")
}

/// A contribution write's body — `{kind, value}`. The kind is pinned to the
/// schema's four here so a stray word is refused before it leaves the plane;
/// the value's shape is upstream's domain validator, which writes the
/// band-facing refusal this plane relays.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct NightContributionBody {
    kind: String,
    value: Value,
}

/// `POST /tenants/{slug}/nights/{place_event_id}/contributions` — publish or
/// replace one contributed kind for the tenant's workspace.
async fn tenant_night_contribution(
    State(state): State<AppState>,
    Path((slug, place_event_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<NightContributionBody>,
) -> Result<Response, ApiError> {
    let night = uuid_segment(&place_event_id)?;
    if !matches!(
        body.kind.as_str(),
        "draw_estimate" | "announce_status" | "asks" | "terms"
    ) || !body.value.is_object()
    {
        return Err(ApiError::InvalidInput(
            "a contribution names one of draw_estimate, announce_status, asks, terms, and a JSON object value"
                .to_owned(),
        ));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let payload = json!({ "kind": body.kind, "value": body.value });
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &format!("/v1/control-plane/nights/{night}/contributions"),
        Some(&payload),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.night.contribution",
        "place_event",
        night,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "shared night contribution")
}

/// `DELETE …/contributions/{kind}` — withdraw one kind. Upstream keeps the
/// row as `revoked`: the audit that the workspace once chose to share.
async fn tenant_night_contribution_revoke(
    State(state): State<AppState>,
    Path((slug, place_event_id, kind)): Path<(String, String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let night = uuid_segment(&place_event_id)?;
    if !matches!(
        kind.as_str(),
        "draw_estimate" | "announce_status" | "asks" | "terms"
    ) {
        return Err(ApiError::InvalidInput(
            "kind must be one of draw_estimate, announce_status, asks, terms".to_owned(),
        ));
    }
    let (tenant, value) = call(
        &state,
        &slug,
        "DELETE",
        &format!("/v1/control-plane/nights/{night}/contributions/{kind}"),
        None,
        &headers,
        None,
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.night.contribution_revoked",
        "place_event",
        night,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "shared night")
}

/// `POST …/organiser-link` — mint the night's link. Upstream revokes the
/// live one first, so every link already sent dies on this call; the token
/// returns here, once.
async fn tenant_night_organiser_link(
    State(state): State<AppState>,
    Path((slug, place_event_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let night = uuid_segment(&place_event_id)?;
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &format!("/v1/control-plane/nights/{night}/organiser-link"),
        None,
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.night.organiser_link_minted",
        "place_event",
        night,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "shared night organiser link")
}

/// `DELETE …/organiser-link` — kill the live link. Upstream restricts this
/// to the link's minter or an event owner on the night.
async fn tenant_night_organiser_link_revoke(
    State(state): State<AppState>,
    Path((slug, place_event_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let night = uuid_segment(&place_event_id)?;
    let (tenant, value) = call(
        &state,
        &slug,
        "DELETE",
        &format!("/v1/control-plane/nights/{night}/organiser-link"),
        None,
        &headers,
        None,
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.night.organiser_link_revoked",
        "place_event",
        night,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "shared night")
}

/// `POST …/acts/{act_slug}/confirm` — the billed act's own workspace
/// confirms it is really on the bill. Upstream enforces
/// `act_workspace_id = caller`; anyone else gets the same 404.
async fn tenant_night_act_confirm(
    State(state): State<AppState>,
    Path((slug, place_event_id, act_slug)): Path<(String, String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let night = uuid_segment(&place_event_id)?;
    if !safe_segment(&act_slug) {
        return Err(ApiError::InvalidInput("invalid act slug".to_owned()));
    }
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &format!("/v1/control-plane/nights/{night}/acts/{act_slug}/confirm"),
        None,
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.night.act_confirmed",
        "place_event",
        night,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "shared night")
}

/// Routes a bearer token reaches without a session — the shared night's
/// organiser lens (4V.6b). Kept out of `router()` so `main.rs` merges it
/// outside `auth::authenticate`: the link is the whole credential, and a
/// dead one relays upstream's 404 unchanged.
pub fn public_router() -> Router<AppState> {
    Router::new().route("/public/nights/{slug}/{token}", get(public_night))
}

/// `GET /public/nights/{slug}/{token}` — the organiser lens on one tenant's
/// night. The slug picks which tenant minted the token — a bare token cannot
/// name its tenant, so the link the band copies carries both.
async fn public_night(
    State(state): State<AppState>,
    Path((slug, token)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let token = uuid_segment(&token)?;
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let value = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "GET",
                path: &format!("/v1/public/nights/{token}"),
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: None,
            },
        )
        .await?;
    // Cacheable for a minute like the upstream route — a revocation reads
    // as a 404 fast, not as a copy that lives forever.
    Ok((
        StatusCode::OK,
        [(CACHE_CONTROL, "public, max-age=60")],
        Json(value),
    )
        .into_response())
}

async fn chief_of_staff(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/chief-of-staff",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "chief of staff")
}

// ---------------------------------------------------------------------------
// Outreach & booking discovery — candidate queues for the growth pipeline.
// Outreach candidates are a bare array; booking candidates are a bare array.
// Confirm mutations return objects.
// ---------------------------------------------------------------------------

async fn outreach_candidates(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Query(params): Query<ListQuery>,
) -> Result<Response, ApiError> {
    let path = build_list_path("/v1/control-plane/autopilot/outreach/candidates", &params)?;
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    array_no_store(value, "outreach candidates")
}

async fn confirm_outreach_candidate(
    State(state): State<AppState>,
    Path((slug, candidate_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let candidate_id = uuid_segment(&candidate_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path = format!("/v1/control-plane/autopilot/outreach/candidates/{candidate_id}/confirm");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        None,
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.outreach_candidate.confirmed",
        "outreach_candidate",
        &candidate_id,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "outreach candidate confirm")
}

async fn booking_candidates(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Query(params): Query<ListQuery>,
) -> Result<Response, ApiError> {
    let path = build_list_path(
        "/v1/control-plane/autopilot/booking-discovery/candidates",
        &params,
    )?;
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    array_no_store(value, "booking candidates")
}

async fn confirm_booking_candidate(
    State(state): State<AppState>,
    Path((slug, candidate_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let candidate_id = uuid_segment(&candidate_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path =
        format!("/v1/control-plane/autopilot/booking-discovery/candidates/{candidate_id}/confirm");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        None,
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.booking_candidate.confirmed",
        "booking_candidate",
        &candidate_id,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "booking candidate confirm")
}

// ---------------------------------------------------------------------------
// Beacon signal network — press & industry relationship pipeline.
// All list endpoints return objects with named arrays.
// ---------------------------------------------------------------------------

async fn beacon_signal_dashboard(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/beacon-signal",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "beacon signal dashboard")
}

async fn beacon_signal_candidates(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/beacon-signal/candidates",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "beacon signal candidates")
}

async fn beacon_press_requests(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/beacon-press-requests",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "beacon press requests")
}

async fn resolve_beacon_press_request(
    State(state): State<AppState>,
    Path((slug, press_request_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let press_request_id = uuid_segment(&press_request_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path =
        format!("/v1/control-plane/autopilot/beacon-press-requests/{press_request_id}/resolve");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.beacon_press_request.resolved",
        "beacon_press_request",
        &press_request_id,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "beacon press request resolve")
}

async fn beacon_press_assets(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/beacon-press-assets",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "beacon press assets")
}

/// Records a press asset — a photo, logo or EPK link the tenant owns.
///
/// The only writable path to `viryaos_beacon_press_assets` outside the admin
/// API. It matters beyond the press kit: the Instagram publisher picks its
/// image from the active `photo` and `logo` rows here, so a tenant with none
/// has every Instagram post held for want of something to post.
async fn upsert_beacon_press_asset(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<serde_json::Value>,
) -> Result<Response, ApiError> {
    // The upstream transport requires one for every mutation, so a missing
    // header fails here with a message about the header rather than upstream
    // with a message about the transport.
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let result = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "POST",
                path: "/v1/control-plane/autopilot/beacon-press-assets",
                body: Some(&body),
                correlation_id: correlation(&headers),
                idempotency_key: Some(&idempotency),
            },
        )
        .await;
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.press_asset.upserted",
        "workspace",
        &slug,
        &headers,
        &result,
        None,
    )
    .await;
    let result = result?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    object_no_store(result, "beacon press asset")
}

async fn beacon_signal_engagements(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/beacon-signal-engagements",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "beacon signal engagements")
}

async fn beacon_coverage(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/beacon-coverage",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "beacon coverage")
}

async fn beacon_network(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/beacon-network",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "beacon network")
}

// ---------------------------------------------------------------------------
// Release campaigns — launch/close mutations, campaign list, recipients.
// ---------------------------------------------------------------------------

async fn beacon_release_campaigns(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/beacon-release-campaigns",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "beacon release campaigns")
}

/// Creates a release campaign.
///
/// The panel could list, launch and close campaigns but not make one, so its
/// own empty state pointed at a surface that did not exist. Validation stays
/// upstream — slug, title, SKU lengths and the deadline being in the future are
/// the tenant's rules, and duplicating them here would give two answers.
/// Creates or updates a beacon.
///
/// Beacons carry a release or a show into a city we have no audience in. The
/// control plane could read the roster through six endpoints and change nothing
/// in it, so every beacon had to be created against `/v1/admin` by hand.
async fn upsert_beacon(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/autopilot/beacons",
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.beacon.upserted",
        "beacon",
        body.get("display_name")
            .and_then(Value::as_str)
            .unwrap_or("unknown"),
        &headers,
        &result,
        body.get("expected_version").and_then(Value::as_u64),
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "beacon upsert")
}

/// Import SubmitHub Activity CSV as unverified beacons.
///
/// The operator exports the CSV from `submithub.com/activity`, uploads it
/// here, and we parse it into structured rows and proxy to CrowdRelay's
/// `import_submithub` action. Only curators who approved or shared are
/// sent — the filtering happens here so CrowdRelay receives a clean set.
async fn import_submithub_csv(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: String,
) -> Result<Response, ApiError> {
    // Parse the CSV by header name, not column position — SubmitHub may
    // add or reorder columns without notice.
    let mut reader = csv::Reader::from_reader(body.as_bytes());
    let csv_headers = reader
        .headers()
        .map_err(|_| ApiError::InvalidInput("malformed CSV header".into()))?
        .iter()
        .map(|h| h.trim().to_lowercase())
        .collect::<Vec<_>>();
    let col = |name: &str| csv_headers.iter().position(|h| h == name);

    let outlet_idx = col("outlet");
    let outlet_type_idx = col("outlet type");
    let action_idx = col("action");
    let song_idx = col("song");
    let country_idx = col("outlet country");
    let feedback_idx = col("feedback");
    let timestamp_idx = col("action timestamp");

    // Outlet and action are the minimum we need. Everything else is
    // provenance — nice to have, not required for the import to work.
    if outlet_idx.is_none() || action_idx.is_none() {
        return Err(ApiError::InvalidInput(
            "CSV must have 'Outlet' and 'Action' columns".into(),
        ));
    }

    let mut csv_rows = Vec::new();
    for record in reader.records() {
        let record = record.map_err(|_| ApiError::InvalidInput("malformed CSV row".into()))?;
        let get = |idx: Option<usize>| -> String {
            idx.and_then(|i| record.get(i))
                .unwrap_or_default()
                .to_owned()
        };
        let action = get(action_idx).trim().to_lowercase();
        // Only warm contacts: approved or shared. Declined curators are
        // real people but have not signalled interest.
        if action != "approved" && action != "shared" {
            continue;
        }
        csv_rows.push(serde_json::json!({
            "outlet": get(outlet_idx),
            "outletType": get(outlet_type_idx),
            "action": action,
            "song": get(song_idx),
            "country": get(country_idx),
            "feedback": get(feedback_idx),
            "actionTimestamp": get(timestamp_idx),
        }));
    }

    if csv_rows.is_empty() {
        return Err(ApiError::InvalidInput(
            "no approved or shared curators found in CSV".into(),
        ));
    }

    let idempotency = idempotency_key(&headers)?.to_owned();
    let proxy_body = serde_json::json!({
        "action": "import_submithub",
        "csvRows": csv_rows,
    });
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/autopilot/beacon-network",
        Some(&proxy_body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.beacon_network.import_submithub",
        "beacon_network",
        "import_submithub",
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "submithub import")
}

/// Runs a beacon-network action: import researched contacts, approve a
/// candidate, queue invites.
///
/// Import is the one that mattered first. Two pools of researched contacts
/// existed — agent-proposed targets and screened candidate routes — and
/// neither had a path onto the roster, which held three beacons while the
/// research sat in tables nobody could reach from here.
async fn beacon_network_action(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let action = body
        .get("action")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_owned();
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/autopilot/beacon-network",
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.beacon_network.action",
        "beacon_network",
        &action,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "beacon network action")
}

/// Invites many beacons to Signal in one call.
///
/// The bulk path is the point: inviting a city's worth of beacons one form at a
/// time is how it does not get done.
async fn batch_invite_beacons(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let count = body
        .get("beacon_ids")
        .or_else(|| body.get("beaconIds"))
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/autopilot/beacons/signal-invites/batch",
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.beacon.invited_batch",
        "beacon_invite_batch",
        &count.to_string(),
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "beacon batch invite")
}

async fn invite_beacon(
    State(state): State<AppState>,
    Path((slug, beacon_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let beacon_id = uuid_segment(&beacon_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path = format!("/v1/control-plane/autopilot/beacons/{beacon_id}/signal-invites");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.beacon.invited",
        "beacon",
        &beacon_id,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "beacon invite")
}

/// Pauses, revokes or restores a beacon's Signal profile.
async fn set_beacon_state(
    State(state): State<AppState>,
    Path((slug, beacon_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let beacon_id = uuid_segment(&beacon_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path = format!("/v1/control-plane/autopilot/beacons/{beacon_id}/signal-state");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.beacon.state_changed",
        "beacon",
        &beacon_id,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "beacon state")
}

/// Records that a beacon answered, and how.
///
/// This is the intelligence half: a beacon who declines twice is not a beacon
/// to keep inviting, and nothing could write that down.
async fn record_beacon_reply(
    State(state): State<AppState>,
    Path((slug, beacon_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let beacon_id = uuid_segment(&beacon_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path = format!("/v1/control-plane/autopilot/beacons/{beacon_id}/reply");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.beacon.reply_recorded",
        "beacon",
        &beacon_id,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "beacon reply")
}

/// The industry list read as an audience: everybody the band works with,
/// with both roles resolved — who already hears the dates, who could be
/// asked, and the sentence saying why not for everybody else.
async fn dual_role_contacts(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/contacts/dual-role",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "dual-role contacts")
}

/// Asks one person, once. Upstream recomputes the standing, the reason and
/// the words at the click, and answers every refusal as a 200 with its
/// sentence — the panel renders the answer rather than a toast.
async fn invite_to_latarnik(
    State(state): State<AppState>,
    Path((slug, beacon_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let beacon_id = uuid_segment(&beacon_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path = format!("/v1/control-plane/contacts/{beacon_id}/latarnik-invite");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        None,
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.contact.latarnik_invited",
        "beacon",
        &beacon_id,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "latarnik invite")
}

/// One show's growth ladder (P.4): the approval row's state plus every rung
/// in due order. Read-only — the same read the panel renders.
async fn show_growth_ladder(
    State(state): State<AppState>,
    Path((slug, event_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let event_id = uuid_segment(&event_id)?.to_owned();
    let path = format!("/v1/control-plane/autopilot/events/{event_id}/growth-ladder");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "show growth ladder")
}

/// One yes over the show's whole ladder (P.4). The write is the canonical
/// upstream one; the proxy only carries it with its idempotency key.
async fn approve_show_growth_ladder(
    State(state): State<AppState>,
    Path((slug, event_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let event_id = uuid_segment(&event_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path = format!("/v1/control-plane/autopilot/events/{event_id}/growth-ladder/approve");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        None,
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.show_growth_ladder.approved",
        "event",
        &event_id,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "show growth ladder approval")
}

/// Stops the rungs the ladder approval would still release (P.4). Rungs
/// already running or finished keep their record.
async fn revoke_show_growth_ladder(
    State(state): State<AppState>,
    Path((slug, event_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let event_id = uuid_segment(&event_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path = format!("/v1/control-plane/autopilot/events/{event_id}/growth-ladder/revoke");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        None,
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.show_growth_ladder.revoked",
        "event",
        &event_id,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "show growth ladder revoke")
}

/// The negotiation table — live terms rows with their ladders and the move
/// parked in `awaiting_approval` for each (P.7).
async fn negotiations(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/negotiations",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "negotiations")
}

/// Records the promoter's position on a live negotiation — an offer with
/// its deadline, or a withdrawal. The write is the canonical upstream one;
/// the proxy only carries it with its idempotency key (P.7).
async fn record_opportunity_terms(
    State(state): State<AppState>,
    Path((slug, opportunity_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let opportunity_id = uuid_segment(&opportunity_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path = format!("/v1/control-plane/autopilot/team-opportunities/{opportunity_id}/terms");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.opportunity.terms_recorded",
        "team_opportunity",
        &opportunity_id,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "opportunity terms")
}

async fn create_beacon_release_campaign(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    let idempotency = idempotency_key(&headers)?.to_owned();
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        "/v1/control-plane/autopilot/beacon-release-campaigns",
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.release_campaign.created",
        "release_campaign",
        body.get("slug")
            .and_then(Value::as_str)
            .unwrap_or("unknown"),
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "beacon release campaign create")
}

async fn launch_beacon_release_campaign(
    State(state): State<AppState>,
    Path((slug, campaign_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let campaign_id = uuid_segment(&campaign_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path = format!("/v1/control-plane/autopilot/beacon-release-campaigns/{campaign_id}/launch");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        None,
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.beacon_release_campaign.launched",
        "beacon_release_campaign",
        &campaign_id,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "beacon release campaign launch")
}

async fn close_beacon_release_campaign(
    State(state): State<AppState>,
    Path((slug, campaign_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let campaign_id = uuid_segment(&campaign_id)?.to_owned();
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path = format!("/v1/control-plane/autopilot/beacon-release-campaigns/{campaign_id}/close");
    let (tenant, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        None,
        &headers,
        Some(&idempotency),
    )
    .await?;
    let result: Result<Value, ApiError> = Ok(value.clone());
    audit_result(
        &state,
        tenant.tenant.id,
        "tenant.beacon_release_campaign.closed",
        "beacon_release_campaign",
        &campaign_id,
        &headers,
        &result,
        None,
    )
    .await;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "beacon release campaign close")
}

async fn beacon_release_recipients(
    State(state): State<AppState>,
    Path((slug, campaign_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let campaign_id = uuid_segment(&campaign_id)?.to_owned();
    let path =
        format!("/v1/control-plane/autopilot/beacon-release-campaigns/{campaign_id}/recipients");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "beacon release recipients")
}

// ---------------------------------------------------------------------------
// Play ledger — what the agent committed to, what it did, and what each
// number is allowed to prove.
// ---------------------------------------------------------------------------

async fn play_ledger(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/autopilot/plays",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "play ledger")
}

// ---------------------------------------------------------------------------
// Community Intelligence — read-only proxy endpoints
// ---------------------------------------------------------------------------

async fn list_communities(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (_, value) = call(
        &state,
        &slug,
        "GET",
        "/v1/control-plane/community-intelligence/communities",
        None,
        &headers,
        None,
    )
    .await?;
    object_no_store(value, "community intelligence communities")
}

async fn list_community_observations(
    State(state): State<AppState>,
    Path((slug, place_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    uuid_segment(&place_id)?;
    let path =
        format!("/v1/control-plane/community-intelligence/communities/{place_id}/observations");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "community intelligence observations")
}

/// Records where we stand with a community — joined, rejected, not a fit.
///
/// Joining is a human act, so this is where the operator writes down what
/// happened. Without it the console listed 66 communities and every visit
/// started from zero, which is why joining never became a task anyone picked
/// up.
async fn set_community_membership(
    State(state): State<AppState>,
    Path((slug, place_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, ApiError> {
    uuid_segment(&place_id)?;
    let idempotency = idempotency_key(&headers)?.to_owned();
    let path =
        format!("/v1/control-plane/community-intelligence/communities/{place_id}/membership");
    let (_, value) = call(
        &state,
        &slug,
        "POST",
        &path,
        Some(&body),
        &headers,
        Some(&idempotency),
    )
    .await?;
    crate::read_models::invalidate_tenant(&state.read_model_cache, &slug).await;
    mutation_no_store(value, "community membership")
}

/// An introduction draft for a community, built from what was observed of it.
async fn community_intro_draft(
    State(state): State<AppState>,
    Path((slug, place_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    uuid_segment(&place_id)?;
    let path =
        format!("/v1/control-plane/community-intelligence/communities/{place_id}/intro-draft");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "community intro draft")
}

async fn list_community_entities(
    State(state): State<AppState>,
    Path((slug, place_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    uuid_segment(&place_id)?;
    let path = format!("/v1/control-plane/community-intelligence/communities/{place_id}/entities");
    let (_, value) = call(&state, &slug, "GET", &path, None, &headers, None).await?;
    object_no_store(value, "community intelligence entities")
}

/// Consolidated community detail — fans out to observations and entities
/// concurrently so the browser loads both panels in one round-trip. Each
/// section degrades independently: a broken entities endpoint cannot
/// blank the observations list next to it.
async fn community_detail(
    State(state): State<AppState>,
    Path((slug, place_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    uuid_segment(&place_id)?;
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let tenant_id = tenant.tenant.id;
    let correlation_id = correlation(&headers);
    let fetch = |section_path: String| {
        let state = &state;
        let target = &target;
        async move {
            state
                .area_client
                .request_management(
                    tenant_id,
                    target,
                    ManagementRequest {
                        method: "GET",
                        path: &section_path,
                        body: None,
                        correlation_id,
                        idempotency_key: None,
                    },
                )
                .await
        }
    };
    let observations_path =
        format!("/v1/control-plane/community-intelligence/communities/{place_id}/observations");
    let entities_path =
        format!("/v1/control-plane/community-intelligence/communities/{place_id}/entities");
    let (observations, entities) = tokio::join!(fetch(observations_path), fetch(entities_path));
    let section = |result: Result<Value, ApiError>| match result {
        Ok(value) => value,
        Err(error) => serde_json::json!({ "__error": error.to_string() }),
    };
    let projected = serde_json::json!({
        "observations": section(observations),
        "entities": section(entities),
    });
    object_no_store(projected, "community detail")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn show_body() -> CreateShowBody {
        CreateShowBody {
            title: "Virya live".to_owned(),
            starts_at: "2026-10-02T20:00:00+02:00".to_owned(),
            doors_at: None,
            ends_at: None,
            venue: None,
            venue_address: None,
            city_name: None,
            city_country_code: None,
            city_region: None,
            timezone: None,
            ticket_url: None,
            publish: false,
        }
    }

    #[test]
    fn show_payload_accepts_the_thinnest_honest_show() {
        let payload = show_create_payload(&show_body()).expect("minimal show");
        assert_eq!(payload["title"], "Virya live");
        assert_eq!(payload["starts_at"], "2026-10-02T20:00:00+02:00");
        assert_eq!(payload["publish"], false);
    }

    #[test]
    fn show_payload_rejects_missing_and_bad_start() {
        let mut body = show_body();
        body.starts_at = "not a date".to_owned();
        assert!(show_create_payload(&body).is_err());
        body.starts_at = " ".to_owned();
        assert!(show_create_payload(&body).is_err());
    }

    #[test]
    fn show_payload_enforces_the_city_pair() {
        let mut body = show_body();
        body.city_name = Some("Warszawa".to_owned());
        assert!(show_create_payload(&body).is_err(), "name without code");
        body.city_name = None;
        body.city_country_code = Some("PL".to_owned());
        assert!(show_create_payload(&body).is_err(), "code without name");
        body.city_region = Some("mazowieckie".to_owned());
        assert!(show_create_payload(&body).is_err(), "region without a pair");
        body.city_name = Some("Warszawa".to_owned());
        let payload = show_create_payload(&body).expect("complete city triple");
        assert_eq!(payload["city_country_code"], "PL");
        // Lowercase codes normalize rather than refuse.
        body.city_country_code = Some("de".to_owned());
        let payload = show_create_payload(&body).expect("lowercase code folds");
        assert_eq!(payload["city_country_code"], "DE");
        body.city_country_code = Some("P1".to_owned());
        assert!(show_create_payload(&body).is_err());
        body.city_country_code = Some("POL".to_owned());
        assert!(show_create_payload(&body).is_err());
    }

    #[test]
    fn show_payload_rejects_impossible_schedule_and_insecure_url() {
        let mut body = show_body();
        body.doors_at = Some("2026-10-02T21:00:00+02:00".to_owned());
        assert!(show_create_payload(&body).is_err(), "doors after start");
        body.doors_at = Some("not a date".to_owned());
        assert!(
            show_create_payload(&body).is_err(),
            "unparseable doors is invalid, not absent"
        );
        body.doors_at = None;
        body.ends_at = Some("2026-10-02T19:00:00+02:00".to_owned());
        assert!(show_create_payload(&body).is_err(), "ends before start");
        body.ends_at = None;
        body.ticket_url = Some("http://tickets.example/x".to_owned());
        assert!(show_create_payload(&body).is_err(), "http refused");
        // A space in the path parses to %20 — upstream's Url::parse accepts
        // it, so the mirror does too rather than diverging on encoding.
        body.ticket_url = Some("https://tickets.example/a b".to_owned());
        assert!(show_create_payload(&body).is_ok(), "space encodes");
        // The mirror is the upstream rule, not just the scheme prefix —
        // credentials-in-URL and fragments get the form-level error, not a
        // generic upstream bad_request.
        body.ticket_url = Some("https://u:p@tickets.example/x".to_owned());
        assert!(show_create_payload(&body).is_err(), "userinfo refused");
        body.ticket_url = Some("https://tickets.example/x#frag".to_owned());
        assert!(show_create_payload(&body).is_err(), "fragment refused");
        body.ticket_url = Some("https://tickets.example/virya".to_owned());
        assert!(show_create_payload(&body).is_ok());
    }

    #[test]
    fn show_payload_bounds_are_bytes_like_the_upstream_validator() {
        let mut body = show_body();
        body.title = "x".repeat(301);
        assert!(show_create_payload(&body).is_err(), "301 bytes");
        // 151 two-byte characters = 302 bytes — the mirror counts bytes, not
        // characters, because the domain validator checks `str::len()`.
        body.title = "ą".repeat(151);
        assert!(show_create_payload(&body).is_err(), "302 bytes of ą");
        body.title = "ą".repeat(150);
        assert!(show_create_payload(&body).is_ok(), "300 bytes of ą");
        body.title = " ".to_owned();
        assert!(show_create_payload(&body).is_err(), "blank title");
    }

    #[test]
    fn secret_paths_carry_only_allowlisted_names() {
        assert!(tenant_secret_path("stripe_secret_key").is_ok());
        assert!(tenant_secret_path("stripe_webhook_secret").is_ok());
        // An unknown name must fail before a path is built — the proxy route
        // is the only thing standing between this name and the store.
        assert!(tenant_secret_path("database_url").is_err());
        assert!(tenant_secret_path("").is_err());
        assert_eq!(
            tenant_secret_path("stripe_secret_key").expect("known"),
            "/v1/control-plane/secrets/stripe_secret_key"
        );
    }

    #[test]
    fn secret_values_are_checked_against_the_upstream_grammar() {
        // The mirror is the upstream `valid_secret_value`: the same length
        // bounds and the same prefixes, so nothing refused here would have
        // passed there — and nothing accepted here fails there.
        assert!(valid_tenant_secret(
            "stripe_secret_key",
            "sk_live_f4ke-k3y-n0t-r34l"
        ));
        assert!(valid_tenant_secret(
            "stripe_secret_key",
            "rk_test_1234567890"
        ));
        assert!(valid_tenant_secret(
            "stripe_webhook_secret",
            "whsec_f4ke-s3cret9END00"
        ));
        // A restricted key must reach the store that accepts it.
        assert!(valid_tenant_secret("stripe_secret_key", "rk_live_abc123"));
        // Wrong slot, wrong prefix, junk: all refused before the wire.
        assert!(!valid_tenant_secret("stripe_secret_key", "whsec_12345678"));
        assert!(!valid_tenant_secret(
            "stripe_webhook_secret",
            "sk_live_12345678"
        ));
        assert!(!valid_tenant_secret(
            "stripe_secret_key",
            "pk_live_12345678"
        ));
        assert!(!valid_tenant_secret("stripe_webhook_secret", "whsec_1")); // too short
        assert!(!valid_tenant_secret(
            "stripe_secret_key",
            "sk_live_with space"
        ));
        assert!(!valid_tenant_secret(
            "nonsense",
            "sk_live_123456789012345678"
        ));
        assert!(!valid_tenant_secret("stripe_secret_key", &"x".repeat(201)));
    }

    #[test]
    fn outcomes_normalize_time_tuples_to_iso() {
        // time::OffsetDateTime's positional serde: year, ordinal, h, m, s,
        // nanos, offset h/m/s. 2026 day 269 12:06:22.917996 UTC.
        let iso = time_tuple_to_iso(&[
            json!(2026),
            json!(269),
            json!(12),
            json!(6),
            json!(22),
            json!(917996000),
            json!(0),
            json!(0),
            json!(0),
        ])
        .expect("a nine-field tuple decodes");
        assert!(iso.starts_with("2026-09-26T12:06:22"), "got {iso}");
        // +02:00 shifts the instant back to UTC.
        let shifted = time_tuple_to_iso(&[
            json!(2026),
            json!(269),
            json!(12),
            json!(0),
            json!(0),
            json!(0),
            json!(2),
            json!(0),
            json!(0),
        ])
        .expect("offset tuple decodes");
        assert!(shifted.starts_with("2026-09-26T10:00:00"), "got {shifted}");
        assert!(time_tuple_to_iso(&[json!("nope")]).is_none());
    }

    #[test]
    fn outcomes_grouping_names_the_wave_and_keeps_the_result() {
        let payload = json!({
            "window_days": 7,
            "actions": [
                {"id": "1", "kind": "signal.push.request", "context": "signal",
                 "status": "succeeded", "outcome_state": "pending",
                 "finished_at": [2026, 269, 12, 6, 22, 917996000, 0, 0, 0],
                 "outcomes": []},
                {"id": "2", "kind": "signal.push.request", "context": "signal",
                 "status": "succeeded", "outcome_state": "measured",
                 "finished_at": [2026, 270, 12, 6, 22, 0, 0, 0, 0],
                 "outcomes": [{"metric": "fans_interested", "observed": 1,
                               "baseline": 0, "verdict": "improved", "at": "x"}]},
                {"id": "3", "kind": "forum.post", "context": "community",
                 "status": "failed", "outcome_state": "unmeasured",
                 "finished_at": null, "outcomes": []}
            ]
        });
        let fixed = normalize_ops_outcomes(payload);
        // The browser-visible timestamp is RFC 3339 now, not the tuple.
        assert!(
            fixed["actions"][0]["finished_at"]
                .as_str()
                .unwrap()
                .starts_with("2026-09-26")
        );
        let groups = fixed["groups"].as_array().expect("groups");
        assert_eq!(groups.len(), 2);
        // Latest finished first: signal push (Sep 27) ahead of forum.post.
        let push = &groups[0];
        assert_eq!(push["kind"], json!("signal.push.request"));
        assert_eq!(push["count"], json!(2));
        assert_eq!(push["pending"], json!(1));
        assert_eq!(push["measured"], json!(1));
        assert_eq!(push["improved"], json!(1));
        assert_eq!(
            push["latest_metrics"][0]["metric"],
            json!("fans_interested")
        );
        let forum = &groups[1];
        assert_eq!(forum["kind"], json!("forum.post"));
        assert_eq!(forum["failed"], json!(1));
    }
}
