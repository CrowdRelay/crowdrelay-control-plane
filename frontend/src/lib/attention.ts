import { request } from './api'
import type { BrainSelfAssessment, DeliveryItem, EcosystemOverview, FailedSends, LapsedApprovals, OperationsSummary, OpsAlert, OutboxItem, PendingActionSummary, PushDeliveryItem, ReconciliationFinding, UnpublishedDraftChannel } from './types'

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

export type { BrainSelfAssessment, UnpublishedDraftChannel }

export type OperationsAttentionSnapshot = TenantAttentionReadModel

export function fetchOperationsAttention(slug: string): Promise<TenantAttentionReadModel> {
  return request<TenantAttentionReadModel>(`/tenants/${encodeURIComponent(slug)}/operations/attention`)
}
