import { api } from './api'
import { queryClient } from './queryClient'
import type { TenantOverviewReadModel } from './types'

/**
 * The tenant overview read, shared by every observer of `['tenant-overview']`.
 *
 * The overview carries the tenant's settings so the Settings page opens on
 * one call; this seeds `['tenant-settings']` from it before the overview
 * resolves, so the settings observers that mount next find fresh data and do
 * not fetch. When the settings section is missing they fetch it themselves,
 * which is also their retry.
 */
export async function fetchTenantOverview(slug: string): Promise<TenantOverviewReadModel> {
  const model = await api.tenantOverview(slug)
  if (model.settings) queryClient.setQueryData(['tenant-settings', slug], model.settings)
  return model
}
