import { authState } from './auth'
import type { DeliveryItem, EcosystemOverview, OperationsSummary, OutboxItem, ReconciliationFinding } from './types'

export type OperationsAttentionSnapshot = {
  summary: OperationsSummary
  dead_outbox: OutboxItem[]
  dead_deliveries: DeliveryItem[]
  ecosystem: EcosystemOverview
  findings: ReconciliationFinding[]
}

export async function fetchOperationsAttention(slug: string): Promise<OperationsAttentionSnapshot> {
  const response = await fetch(`/api/v1/tenants/${encodeURIComponent(slug)}/operations/attention`, {
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-request-id': crypto.randomUUID(),
      ...(authState.authorization() ? { authorization: authState.authorization()! } : {}),
    },
  })
  if (!response.ok) {
    if (response.status === 401) authState.clear()
    const body = await response.json().catch(() => ({ detail: response.statusText })) as { detail?: string }
    throw new Error(body.detail ?? `HTTP ${response.status}`)
  }
  return response.json() as Promise<OperationsAttentionSnapshot>
}
