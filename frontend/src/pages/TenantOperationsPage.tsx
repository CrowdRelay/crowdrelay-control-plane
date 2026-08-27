import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { OperationsPanel } from '../components/OperationsPanel'
import { GrowthPanel } from '../components/GrowthPanel'
import { OpportunityBoardPanel } from '../components/OpportunityBoardPanel'
import { ScorecardPanel } from '../components/ScorecardPanel'
import { ReplyTriagePanel } from '../components/ReplyTriagePanel'
import { refreshTick } from '../lib/refresh'

export function TenantOperationsPage() {
  const params = useParams({ from: '/tenants/$slug/operations' })
  // One purpose-built read model, one initial request. The Control Plane fans
  // the four upstream sections out concurrently and reports the ones it could
  // not serve in `degraded`; the browser orchestrates nothing.
  const model = useQuery(() => ({
    queryKey: ['tenant-operations', params().slug, refreshTick()],
    queryFn: () => api.tenantOperations(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    refetchInterval: 15_000,
    staleTime: 10_000,
  }))
  // Mutations stay on their own routes and refresh this model afterwards.
  const refresh = () => model.refetch()

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">TENANT / {params().slug.toUpperCase()}</span>
        <h1>Operations & Autopilot</h1>
        <p>Live CrowdRelay telemetry, runtime switches, Autopilot authority, the opportunity board and growth delivery.</p>
      </div>
    </div>
    <Show when={model.error}>
      <div class="error-card" role="alert">{model.error instanceof Error ? model.error.message : 'Tenant operations channel unavailable'}</div>
    </Show>
    {/* Skeleton only before the first response. A refresh keeps the rendered
        page, and a section the channel could not serve degrades on its own. */}
    <Show when={!model.error && model.isPending}><div class="skeleton-block"/></Show>
    <Show when={model.data}>{data => <>
      <ScorecardPanel />
      <ReplyTriagePanel />
      <OpportunityBoardPanel
        slug={params().slug}
        opportunities={data().opportunities}
        degraded={data().degraded.includes('opportunities')}
        refresh={refresh}
      />
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
