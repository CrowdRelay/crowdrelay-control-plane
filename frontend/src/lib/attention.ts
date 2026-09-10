import { request } from './api'
import type { DeliveryItem, EcosystemOverview, OperationsSummary, OpsAlert, OutboxItem, PendingActionSummary, PushDeliveryItem, ReconciliationFinding } from './types'

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
  /// Sections whose value above is a placeholder the Control Plane
  /// substituted, not something the tenant measured. An empty list next to a
  /// zero means the tenant really has nothing waiting; `awaiting_approval`
  /// listed here means it does not report approvals at all, and the zero
  /// beside it must not be shown as one.
  not_reported?: string[]
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
