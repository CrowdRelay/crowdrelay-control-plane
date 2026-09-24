import { request } from './api'
import type { BrainSelfAssessment, TenantAttentionReadModel, UnpublishedDraftChannel } from './types'

// Attention subpage read model. One request, assembled by CrowdRelay and
// re-projected by the Control Plane section by section. The type itself
// lives in `./types` because the today model embeds the same snapshot as
// its `attention` section — both surfaces read one shape.
export type { TenantAttentionReadModel, BrainSelfAssessment, UnpublishedDraftChannel }

export function fetchOperationsAttention(slug: string): Promise<TenantAttentionReadModel> {
  return request<TenantAttentionReadModel>(`/tenants/${encodeURIComponent(slug)}/operations/attention`)
}
