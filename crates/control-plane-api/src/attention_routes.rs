//! Aggregated, read-only operator-attention snapshot.
//!
//! The browser polls one endpoint instead of five independent Control Plane
//! routes. CrowdRelay remains canonical for every constituent read model.
//!
//! CrowdRelay assembles the snapshot itself, so this is a single tenant call
//! rather than a five-way fan-out through the private tunnel: the upstream
//! runs the sections concurrently under its own per-section timeout, and one
//! slow read can no longer stall four other tunnel requests. The response is
//! still re-projected field by field so an upstream addition cannot leak into
//! the Control Plane contract unreviewed.

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header::CACHE_CONTROL},
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::{Value, json};

use crate::{AppState, error::ApiError, tenant_area_client::ManagementRequest};

const PRIVATE_NO_STORE: &str = "private, no-store";

pub fn router() -> Router<AppState> {
    Router::new().route("/tenants/{slug}/operations/attention", get(attention))
}

fn correlation(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .or_else(|| {
            headers
                .get("x-crowdrelay-correlation-id")
                .and_then(|value| value.to_str().ok())
        })
}

fn expect_object(value: &Value, name: &str) -> Result<(), ApiError> {
    if value.is_object() {
        Ok(())
    } else {
        Err(ApiError::Unavailable(format!(
            "tenant attention {name} returned an invalid JSON shape"
        )))
    }
}

fn expect_array(value: &Value, name: &str) -> Result<(), ApiError> {
    if value.is_array() {
        Ok(())
    } else {
        Err(ApiError::Unavailable(format!(
            "tenant attention {name} returned an invalid JSON shape"
        )))
    }
}

fn section<'a>(snapshot: &'a Value, name: &str) -> Result<&'a Value, ApiError> {
    snapshot.get(name).ok_or_else(|| {
        ApiError::Unavailable(format!("tenant attention snapshot is missing {name}"))
    })
}

async fn attention(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let (tenant, target) = crate::area_routes::target(&state, &slug).await?;
    let snapshot = state
        .area_client
        .request_management(
            tenant.tenant.id,
            &target,
            ManagementRequest {
                method: "GET",
                path: "/v1/control-plane/ops/attention",
                body: None,
                correlation_id: correlation(&headers),
                idempotency_key: None,
            },
        )
        .await?;

    Ok((
        StatusCode::OK,
        [(CACHE_CONTROL, PRIVATE_NO_STORE)],
        Json(project(&slug, &snapshot)?),
    )
        .into_response())
}

/// Re-project the upstream snapshot field by field.
///
/// Passing the tenant response through verbatim would let an upstream field
/// addition enter the Control Plane contract without review, so each section is
/// named and type-checked here exactly as the five-call version checked its
/// five responses.
/// `pub(crate)`: the `today` read model embeds the attention snapshot as one
/// section and needs the same field-by-field contract — `not_reported`
/// included — rather than a raw upstream pass-through.
pub(crate) fn project(slug: &str, snapshot: &Value) -> Result<Value, ApiError> {
    expect_object(snapshot, "snapshot")?;
    let summary = section(snapshot, "summary")?;
    // Optional on purpose: a CrowdRelay that predates the watchdog alert list
    // still serves a valid snapshot, and an operator plane must not fail closed
    // on a section the tenant simply does not publish yet.
    //
    // The defaults keep the shape stable for the browser, but a default is
    // not an observation: "this tenant reports nothing awaiting approval" and
    // "this tenant does not report approvals at all" are different facts, and
    // rendering the second as `0` is the panel telling the operator nothing
    // needs them when it does not know. Every substituted section is named in
    // `not_reported` so the page can print "not reported" instead of a zero
    // nobody measured.
    let mut not_reported: Vec<&'static str> = Vec::new();
    let alerts = snapshot.get("alerts").cloned().unwrap_or_else(|| {
        not_reported.push("alerts");
        json!([])
    });
    let dead_push = snapshot.get("dead_push").cloned().unwrap_or_else(|| {
        not_reported.push("dead_push");
        json!([])
    });
    let dead_outbox = section(snapshot, "dead_outbox")?;
    let dead_deliveries = section(snapshot, "dead_deliveries")?;
    let ecosystem = section(snapshot, "ecosystem")?;
    let findings = section(snapshot, "findings")?;
    // Optional: a CrowdRelay that predates needs_you/awaiting_approval in
    // the attention snapshot still serves a valid response. An older
    // upstream simply does not publish these fields yet.
    let needs_you = snapshot.get("needs_you").cloned().unwrap_or_else(|| {
        not_reported.push("needs_you");
        json!([])
    });
    let awaiting_approval = snapshot
        .get("awaiting_approval")
        .cloned()
        .unwrap_or_else(|| {
            not_reported.push("awaiting_approval");
            json!(0)
        });
    // The drafted posts waiting on a person to publish them. Optional for the
    // same reason as the sections above: a CrowdRelay that predates it serves
    // a valid snapshot, and an empty list here would claim the queue is clear
    // when the tenant never reported one.
    let unpublished_drafts = snapshot
        .get("unpublished_drafts")
        .cloned()
        .unwrap_or_else(|| {
            not_reported.push("unpublished_drafts");
            json!([])
        });
    // The post queue's machine half — sends the system is carrying or gave
    // up on, per channel. Optional for the same reason as the sections
    // above: a CrowdRelay that predates it serves a valid snapshot, and an
    // empty list here would claim the machine holds nothing when the tenant
    // never reported the lane.
    let automatic_queue = snapshot.get("automatic_queue").cloned().unwrap_or_else(|| {
        not_reported.push("automatic_queue");
        json!([])
    });
    // The brain's self-assessment — verdict, quiet-cycle streak, and the
    // reason the last quiet cycle stayed quiet. Optional: an older CrowdRelay
    // does not publish it, and null-not-placeholder keeps "does not report"
    // distinct from "reports a healthy brain". Passed through wholesale so a
    // field the tenant adds next does not need a matching edit here to reach
    // the console.
    let brain = snapshot.get("brain").cloned().unwrap_or_else(|| {
        not_reported.push("brain");
        Value::Null
    });
    // The approval queue's losses — asks that reached their deadline — and
    // the outward sends that failed in the window. Both are objects
    // (`{window_days, items, total, …}`), not lists: an absent one is the
    // tenant not publishing the section, which is not the same fact as a
    // window with nothing lost. Null + named, never an empty list nobody
    // counted.
    let lapsed_approvals = snapshot
        .get("lapsed_approvals")
        .cloned()
        .unwrap_or_else(|| {
            not_reported.push("lapsed_approvals");
            Value::Null
        });
    let failed_sends = snapshot.get("failed_sends").cloned().unwrap_or_else(|| {
        not_reported.push("failed_sends");
        Value::Null
    });
    // The worker outputs the admission gate refused — kind and reason, not
    // just the watchdog's aggregate. Optional for the same reason as the
    // sections above: a CrowdRelay that predates it serves a valid
    // snapshot, and an empty list here would claim the gate refused
    // nothing when the tenant never reported the section.
    let rejected_agent_outcomes = snapshot
        .get("rejected_agent_outcomes")
        .cloned()
        .unwrap_or_else(|| {
            not_reported.push("rejected_agent_outcomes");
            json!([])
        });
    // The show/release/opportunity escalations — the notices the band is
    // owed, whose record is the durable outbox event itself. Optional for
    // the same reason: an empty list here would claim nothing is owed when
    // the tenant simply never reported the section.
    let band_notices = snapshot.get("band_notices").cloned().unwrap_or_else(|| {
        not_reported.push("band_notices");
        json!([])
    });
    // The conversations waiting on the band — inbound replies nobody has
    // answered, read from the interaction log itself. Optional for the same
    // reason as the sections above: an empty list here would claim nobody
    // is waiting when the tenant simply never reported the queue — the bug
    // this section exists to kill.
    let unanswered_replies = snapshot
        .get("unanswered_replies")
        .cloned()
        .unwrap_or_else(|| {
            not_reported.push("unanswered_replies");
            json!([])
        });

    expect_object(summary, "summary")?;
    expect_array(&alerts, "alerts")?;
    expect_array(&dead_push, "dead push")?;
    expect_array(dead_outbox, "dead outbox")?;
    expect_array(dead_deliveries, "dead deliveries")?;
    expect_object(ecosystem, "ecosystem")?;
    expect_array(findings, "findings")?;
    expect_array(&needs_you, "needs_you")?;
    expect_array(&unpublished_drafts, "unpublished_drafts")?;
    expect_array(&automatic_queue, "automatic_queue")?;
    if !awaiting_approval.is_u64() {
        return Err(ApiError::Unavailable(
            "tenant attention awaiting_approval returned an invalid JSON shape".into(),
        ));
    }
    if !brain.is_null() {
        expect_object(&brain, "brain")?;
    }
    if !lapsed_approvals.is_null() {
        expect_object(&lapsed_approvals, "lapsed_approvals")?;
    }
    if !failed_sends.is_null() {
        expect_object(&failed_sends, "failed_sends")?;
    }
    expect_array(&rejected_agent_outcomes, "rejected_agent_outcomes")?;
    expect_array(&band_notices, "band_notices")?;
    expect_array(&unanswered_replies, "unanswered_replies")?;

    Ok(json!({
        // Stable identity so the browser patches this model in place on a
        // refresh instead of replacing the whole subpage.
        "id": slug,
        "summary": summary,
        "alerts": alerts,
        "dead_push": dead_push,
        "dead_outbox": dead_outbox,
        "dead_deliveries": dead_deliveries,
        "ecosystem": ecosystem,
        "findings": findings,
        "needs_you": needs_you,
        "awaiting_approval": awaiting_approval,
        "unpublished_drafts": unpublished_drafts,
        "automatic_queue": automatic_queue,
        "brain": brain,
        "lapsed_approvals": lapsed_approvals,
        "failed_sends": failed_sends,
        "rejected_agent_outcomes": rejected_agent_outcomes,
        "band_notices": band_notices,
        "unanswered_replies": unanswered_replies,
        // Sections whose value above is a placeholder, not a measurement.
        "not_reported": not_reported,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn expected_projection() -> Value {
        let mut expected = snapshot();
        expected["id"] = json!("virya");
        expected["not_reported"] = json!([]);
        expected
    }

    fn snapshot() -> Value {
        json!({
            "summary": {"outbox": {"pending": 1}},
            "alerts": [{"alert_key": "webhook.dead", "severity": "critical", "active": true}],
            "dead_push": [{"id": "p", "title": "test", "status": "failed"}],
            "dead_outbox": [{"id": "a"}],
            "dead_deliveries": [],
            "ecosystem": {"schema_version": 1, "flags": []},
            "findings": [{"id": "f"}],
            "needs_you": [],
            "awaiting_approval": 0,
            "unpublished_drafts": [
                {"channel": "reddit", "drafts": 2, "oldest_drafted_at": "2026-09-01T10:00:00Z"}
            ],
            "automatic_queue": [
                {"channel": "telegram", "in_flight": 1, "failed": 0, "oldest_queued_at": "2026-09-01T09:00:00Z"}
            ],
            "brain": {
                "state": "improving",
                "needs_attention": false,
                "days_observed": 12,
                "quiet_cycles": 3,
                "latest_wait_reason": "WAIT wins: VOI=0.85 > best_action_value=0.00"
            },
            "lapsed_approvals": {
                "window_days": 7,
                "items": [{"action_kind": "gig_proposal", "context": "c", "subject_kind": "gig", "cause": "approval_expired", "finished_at": "2026-09-01T10:00:00Z", "approval_expires_at": "2026-09-01T08:00:00Z", "reason": "worth the ask"}],
                "total": 1,
                "expiring_within_24h": 2
            },
            "failed_sends": {
                "window_days": 7,
                "items": [{"action_id": "a", "action_kind": "gig_proposal", "context": "c", "error_kind": "executor_unavailable", "finished_at": "2026-09-01T11:00:00Z", "attempt_count": 3, "recipients": ["promoter@club.example"]}],
                "total": 1
            },
            "rejected_agent_outcomes": [
                {"id": "o", "kind": "press_pitch", "rejection_reason": "confidence out of range", "task_id": "t", "created_at": "2026-09-01T12:00:00Z"}
            ],
            "band_notices": [
                {"id": "n", "kind": "show.task_attention_required", "detail": {"event_id": "e", "task": "post_show_report"}, "delivered": true, "created_at": "2026-09-01T13:00:00Z"}
            ],
            "unanswered_replies": [
                {"channel": "outreach", "target_id": "t1", "target_name": "Metal Zine", "target_kind": "press", "contact_email": "ed@zine.example", "disposition": "positive", "sheet_verdict": "POSITIVE", "replied_at": "2026-09-01T14:00:00Z", "waiting_days": 3}
            ],
        })
    }

    #[test]
    fn projects_every_section_of_a_well_formed_snapshot() {
        let projected = project("virya", &snapshot()).expect("well-formed snapshot projects");
        assert_eq!(projected, expected_projection());
    }

    #[test]
    fn drops_fields_the_control_plane_contract_does_not_name() {
        let mut extra = snapshot();
        extra["surprise_upstream_addition"] = json!({"leaked": true});
        let projected = project("virya", &extra).expect("unknown fields are ignored, not fatal");
        assert_eq!(projected, expected_projection());
        assert!(projected.get("surprise_upstream_addition").is_none());
    }

    #[test]
    fn rejects_a_snapshot_missing_a_section() {
        for name in [
            "summary",
            "dead_outbox",
            "dead_deliveries",
            "ecosystem",
            "findings",
        ] {
            let mut partial = snapshot();
            partial.as_object_mut().expect("object").remove(name);
            let error = project("virya", &partial).expect_err("missing section must fail");
            assert!(
                matches!(&error, ApiError::Unavailable(message) if message.contains(name)),
                "{name} should be named in the error"
            );
        }
    }

    #[test]
    fn defaults_alerts_to_an_empty_list_when_the_tenant_does_not_publish_them() {
        let mut older = snapshot();
        older.as_object_mut().expect("object").remove("alerts");
        let projected = project("virya", &older).expect("a snapshot without alerts still projects");
        assert_eq!(projected["alerts"], json!([]));
        assert_eq!(projected["not_reported"], json!(["alerts"]));
    }

    #[test]
    fn defaults_dead_push_to_an_empty_list_when_the_tenant_does_not_publish_them() {
        let mut older = snapshot();
        older.as_object_mut().expect("object").remove("dead_push");
        let projected =
            project("virya", &older).expect("a snapshot without dead_push still projects");
        assert_eq!(projected["dead_push"], json!([]));
        assert_eq!(projected["not_reported"], json!(["dead_push"]));
    }

    #[test]
    fn a_section_the_tenant_does_not_publish_is_named_not_measured_as_zero() {
        // `awaiting_approval` is the count the Attention page turns into
        // "what needs me". Substituting 0 for "this build does not report it"
        // is the panel answering a question it cannot answer.
        let mut older = snapshot();
        let object = older.as_object_mut().expect("object");
        object.remove("awaiting_approval");
        object.remove("needs_you");
        let projected = project("virya", &older).expect("an older snapshot still projects");
        assert_eq!(projected["awaiting_approval"], json!(0));
        assert_eq!(projected["needs_you"], json!([]));
        assert_eq!(
            projected["not_reported"],
            json!(["needs_you", "awaiting_approval"]),
            "the placeholders must be distinguishable from measurements"
        );
    }

    #[test]
    fn unreported_automatic_queue_is_named_not_measured_as_empty() {
        // A CrowdRelay that predates the two-lane post queue reports no
        // automatic_queue. Substituting an empty list is the panel claiming
        // the machine holds nothing when the tenant never reported the lane.
        let mut older = snapshot();
        older
            .as_object_mut()
            .expect("object")
            .remove("automatic_queue");
        let projected =
            project("virya", &older).expect("a snapshot without automatic_queue still projects");
        assert_eq!(projected["automatic_queue"], json!([]));
        assert_eq!(projected["not_reported"], json!(["automatic_queue"]));
    }

    #[test]
    fn rejects_automatic_queue_of_the_wrong_json_type() {
        let mut wrong = snapshot();
        wrong["automatic_queue"] = json!({"telegram": 1});
        assert!(project("virya", &wrong).is_err());
    }

    #[test]
    fn an_unpublished_brain_is_null_and_named_not_a_fake_verdict() {
        // A CrowdRelay that predates the self-assessment reports no brain
        // section. Rendering that as a healthy verdict is the panel claiming
        // the brain is fine when nobody asked it — null + not_reported is
        // the honest shape.
        let mut older = snapshot();
        older.as_object_mut().expect("object").remove("brain");
        let projected = project("virya", &older).expect("a snapshot without brain still projects");
        assert_eq!(projected["brain"], Value::Null);
        assert_eq!(projected["not_reported"], json!(["brain"]));
    }

    #[test]
    fn unreported_queue_losses_are_null_and_named_not_empty_lists() {
        // A CrowdRelay that predates lapsed_approvals/failed_sends reports
        // neither. Substituting an empty list is the panel claiming the queue
        // lost nothing when nobody counted — null + not_reported is the
        // honest shape, the same convention `brain` uses.
        let mut older = snapshot();
        let object = older.as_object_mut().expect("object");
        object.remove("lapsed_approvals");
        object.remove("failed_sends");
        let projected = project("virya", &older).expect("an older snapshot still projects");
        assert_eq!(projected["lapsed_approvals"], Value::Null);
        assert_eq!(projected["failed_sends"], Value::Null);
        assert_eq!(
            projected["not_reported"],
            json!(["lapsed_approvals", "failed_sends"]),
            "the placeholders must be distinguishable from measurements"
        );
    }

    #[test]
    fn rejects_lapsed_approvals_of_the_wrong_json_type() {
        let mut wrong = snapshot();
        wrong["lapsed_approvals"] = json!([]);
        assert!(project("virya", &wrong).is_err());
        let mut also_wrong = snapshot();
        also_wrong["failed_sends"] = json!("none");
        assert!(project("virya", &also_wrong).is_err());
    }

    #[test]
    fn rejects_alerts_that_are_not_a_list() {
        let mut wrong = snapshot();
        wrong["alerts"] = json!({"not": "an array"});
        let error = project("virya", &wrong).expect_err("a non-array alert section must fail");
        assert!(matches!(&error, ApiError::Unavailable(message) if message.contains("alerts")));
    }

    #[test]
    fn rejects_a_section_of_the_wrong_json_type() {
        let mut wrong = snapshot();
        wrong["dead_outbox"] = json!({"not": "an array"});
        assert!(project("virya", &wrong).is_err());

        let mut also_wrong = snapshot();
        also_wrong["summary"] = json!([]);
        assert!(project("virya", &also_wrong).is_err());
    }

    #[test]
    fn rejects_a_snapshot_that_is_not_an_object() {
        assert!(project("virya", &json!([])).is_err());
        assert!(project("virya", &json!("degraded")).is_err());
    }
}
