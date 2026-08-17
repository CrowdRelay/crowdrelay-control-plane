import type { AuditEntry, Palette, ProvisioningJob, TenantSummary } from './types'

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-request-id': crypto.randomUUID(),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText })) as { detail?: string }
    throw new ApiError(response.status, body.detail ?? `HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}

export type CreateTenantInput = {
  slug: string
  displayName: string
  workspaceId?: string
  crowdrelayBaseUrl?: string
  signalBaseUrl?: string
  defaultCountryCode?: string
  brandingPalette?: Palette
  deployCrowdrelay?: boolean
  desiredVersion?: string
}

export const api = {
  overview: () => request<{
    tenants: number
    healthy: number
    degraded: number
    stale: number
    unknown: number
    runtimeStaleAfterSeconds: number
    provisionerConfigured: boolean
    provisionerDefaultImageTag: string | null
  }>('/overview'),
  tenants: () => request<{ items: TenantSummary[] }>('/tenants'),
  tenant: (slug: string) => request<TenantSummary>(`/tenants/${encodeURIComponent(slug)}`),
  createTenant: (input: CreateTenantInput) =>
    request<TenantSummary>('/tenants', { method: 'POST', body: JSON.stringify(input) }),
  branding: (slug: string, brandingPalette: Palette | null) =>
    request<TenantSummary>(`/tenants/${encodeURIComponent(slug)}/branding`, { method: 'PATCH', body: JSON.stringify({ brandingPalette }) }),
  suspend: (slug: string) => request<TenantSummary>(`/tenants/${encodeURIComponent(slug)}/suspend`, { method: 'POST', body: '{}' }),
  resume: (slug: string) => request<TenantSummary>(`/tenants/${encodeURIComponent(slug)}/resume`, { method: 'POST', body: '{}' }),
  planProvisioning: (slug: string, desiredVersion?: string) =>
    request<ProvisioningJob>(`/tenants/${encodeURIComponent(slug)}/provisioning/plan`, { method: 'POST', body: JSON.stringify({ desiredVersion: desiredVersion || undefined }) }),
  deployTenant: (slug: string, desiredVersion?: string) =>
    request<ProvisioningJob>(`/tenants/${encodeURIComponent(slug)}/provisioning/deploy`, { method: 'POST', body: JSON.stringify({ desiredVersion: desiredVersion || undefined }) }),
  provisioning: (slug: string) => request<{ items: ProvisioningJob[] }>(`/tenants/${encodeURIComponent(slug)}/provisioning`),
  cancelProvisioning: (slug: string) => request<ProvisioningJob>(`/tenants/${encodeURIComponent(slug)}/provisioning/cancel`, { method: 'POST', body: '{}' }),
  audit: (slug: string) => request<{ items: AuditEntry[] }>(`/tenants/${encodeURIComponent(slug)}/audit?limit=40`),
}
