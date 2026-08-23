import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { OperationsPanel } from '../components/OperationsPanel'
import { GrowthPanel } from '../components/GrowthPanel'
import { TenantSubnav } from '../components/TenantSubnav'

export function TenantOperationsPage() {
  const params = useParams({ from: '/tenants/$slug/operations' })
  // One purpose-built read model, one initial request. The Control Plane fans
  // the four upstream sections out concurrently and reports the ones it could
  // not serve in `degraded`; the browser orchestrates nothing.
  const model = useQuery(() => ({
    queryKey: ['tenant-operations', params().slug],
    queryFn: () => api.tenantOperations(params().slug),
    reconcile: 'id',
    // Live polling stays local to this subpage.
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  // Mutations stay on their own routes and refresh this model afterwards.
  const refresh = () => model.refetch()

  return <section class="page">
    <TenantSubnav slug={params().slug} />
    <div class="page-head">
      <div>
        <span class="eyebrow">TENANT / {params().slug.toUpperCase()}</span>
        <h1>Operations & Autopilot</h1>
        <p>Live CrowdRelay telemetry, runtime switches, Autopilot authority and growth delivery. One consolidated snapshot refreshes every 15 seconds.</p>
      </div>
    </div>
    <Show when={model.error}>
      <div class="error-card" role="alert">{model.error instanceof Error ? model.error.message : 'Tenant operations channel unavailable'}</div>
    </Show>
    {/* Skeleton only before the first response. A refresh keeps the rendered
        page, and a section the channel could not serve degrades on its own. */}
    <Show when={!model.error && model.isPending}><div class="skeleton-block"/></Show>
    <Show when={model.data}>{data => <>
      <OperationsPanel
        slug={params().slug}
        summary={data().summary}
        flags={data().flags}
        autopilot={data().autopilot}
        degraded={data().degraded}
        refresh={refresh}
      />
      <GrowthPanel growth={data().growth} degraded={data().degraded.includes('growth')} />
    </>}</Show>
  </section>
}
