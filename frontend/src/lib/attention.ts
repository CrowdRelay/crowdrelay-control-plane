import { request } from './api'
import type { DeliveryItem, EcosystemOverview, OperationsSummary, OpsAlert, OutboxItem, PushDeliveryItem, ReconciliationFinding } from './types'

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
}

export type OperationsAttentionSnapshot = TenantAttentionReadModel

export function fetchOperationsAttention(slug: string): Promise<TenantAttentionReadModel> {
  return request<TenantAttentionReadModel>(`/tenants/${encodeURIComponent(slug)}/operations/attention`)
}
