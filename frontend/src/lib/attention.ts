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
  /// Sections whose value above is a placeholder the Control Plane
  /// substituted, not something the tenant measured. An empty list next to a
  /// zero means the tenant really has nothing waiting; `awaiting_approval`
  /// listed here means it does not report approvals at all, and the zero
  /// beside it must not be shown as one.
  not_reported?: string[]
}

export type OperationsAttentionSnapshot = TenantAttentionReadModel

export function fetchOperationsAttention(slug: string): Promise<TenantAttentionReadModel> {
  return request<TenantAttentionReadModel>(`/tenants/${encodeURIComponent(slug)}/operations/attention`)
}
