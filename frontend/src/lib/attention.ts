import { request } from './api'
import type { DeliveryItem, EcosystemOverview, FailedSends, LapsedApprovals, OperationsSummary, OpsAlert, OutboxItem, PendingActionSummary, PushDeliveryItem, ReconciliationFinding } from './types'

// Attention subpage read model. One request, assembled by CrowdRelay and
// re-projected by the Control Plane section by section.
export type TenantAttentionReadModel = {
  id: string
  summary: OperationsSummary
  alerts: OpsAlert[]
  dead_push: PushDeliveryItem[]
  dead_outbox: OutboxItem[]
  dead_deliveries: DeliveryItem[]
  ecosystem: EcosystemOverview
  findings: ReconciliationFinding[]
  /// Pending autopilot actions awaiting human approval. Optional: an older
  /// CrowdRelay may not publish this field — the control-plane projects
  /// `[]` for backward compatibility. `[]` + healthy snapshot = genuinely
  /// nothing needs approval. Absent field = degraded, not empty.
  needs_you?: PendingActionSummary[]
  /// Count of opportunities awaiting approval. Optional for the same reason.
  awaiting_approval?: number
  /// Drafted posts waiting for a person to publish them, per channel.
  ///
  /// The one queue where the system is blocked on the operator rather than the
  /// reverse: every outbound channel drafts and waits. Optional for the same
  /// reason as the fields above — absent means the tenant does not report the
  /// queue, which is not the same as reporting an empty one.
  unpublished_drafts?: UnpublishedDraftChannel[]
  /// What the brain makes of its own recent performance, and — when it has
  /// been doing nothing — why. `null` (or absent on an older tenant) means
  /// the tenant does not report a self-assessment; the page prints
  /// "not reported", never a healthy-looking verdict nobody measured.
  brain?: BrainSelfAssessment | null
  /// The approval queue's losses — asks that reached their deadline, and
  /// what is about to. `null` (or absent on an older tenant) means the
  /// tenant does not report the queue's losses; `not_reported` names it.
  lapsed_approvals?: LapsedApprovals | null
  /// Outward sends that failed in the window, named — the recipients the
  /// counts cannot identify. Same null/not_reported convention as above.
  failed_sends?: FailedSends | null
  /// Sections whose value above is a placeholder the Control Plane
  /// substituted, not something the tenant measured. An empty list next to a
  /// zero means the tenant really has nothing waiting; `awaiting_approval`
  /// listed here means it does not report approvals at all, and the zero
  /// beside it must not be shown as one.
  not_reported?: string[]
}

/// The brain's own verdict, and — when it chose to do nothing — its reason.
///
/// Field names are snake_case because the tenant emits them that way and the
/// Control Plane passes the object through wholesale: a field the tenant adds
/// reaches this page without a matching Control Plane deploy.
export type BrainSelfAssessment = {
  /// `improving`, `learning`, `stagnant`, `regressing`, or `initializing`.
  state: string
  /// True only for `regressing` and `stagnant` — the verdicts that ask for a
  /// person. A flat young system is `learning`, not a fault.
  needs_attention?: boolean
  /// Distinct days of North Star readings behind the verdict.
  days_observed?: number
  /// Consecutive finished cycles that produced no actions, counting back from
  /// the latest. The count is what makes a silent brain legible: quiet since
  /// the last check and quiet for three days straight are different things.
  quiet_cycles?: number
  /// Why the most recent quiet cycle stayed quiet, in the brain's own words
  /// ("WAIT wins: VOI=0.85 > best_action_value=0.00"). The system may do
  /// nothing — this is where it says so. Absent when no quiet cycle has a
  /// recorded reason — the cycle is acting, or it predates the field.
  latest_wait_reason?: string | null
}

/// One channel's backlog of drafted-but-unpublished posts.
export type UnpublishedDraftChannel = {
  channel: string
  drafts: number
  oldest_drafted_at: string | null
}

export type OperationsAttentionSnapshot = TenantAttentionReadModel

export function fetchOperationsAttention(slug: string): Promise<TenantAttentionReadModel> {
  return request<TenantAttentionReadModel>(`/tenants/${encodeURIComponent(slug)}/operations/attention`)
}
