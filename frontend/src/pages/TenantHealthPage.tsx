import { Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { RefreshCw } from 'lucide-solid'
import { api } from '../lib/api'
import { relativeTime } from '../lib/format'
import { cn } from '../lib/cn'
import { ChiefOfStaffPanel } from '../components/ChiefOfStaffPanel'
import { QueueInspectorPanel } from '../components/QueueInspectorPanel'
import { SystemHealthPanel } from '../components/SystemHealthPanel'
import { TenantRuntimePanel } from '../components/TenantRuntimePanel'
import { RuntimeSwitchesPanel } from '../components/RuntimeSwitchesPanel'
import { AuthorityPoliciesPanel } from '../components/AuthorityPoliciesPanel'
import { SkeletonSection } from '../components/Skeleton'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { TabBar, TabPanel, useTabPanels, PageShell, PageHeader, KpiStrip, KpiCard } from '../components/layout'
import { Button } from '../components/app/button'
import { operationalTone, operationalLabel } from '../lib/health-tone'
import type { TenantOperationsReadModel } from '../lib/types'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'

const TABS = ['overview', 'policies', 'runtime'] as const

// Is the tenant's machine well, and what may the autopilot do. Three tabs:
// status, the authority policies, and the runtime switches. This is the only
// place the autopilot's switches and sliders live; Operations links here.
export function TenantHealthPage() {
  const params = useParams({ from: '/tenants/$slug/health' })
  // The id list makes `?tab=` deep links land on the right tab.
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('overview', [...TABS])
  const model = useQuery(() => ({
    queryKey: ['tenant-operations', params().slug],
    queryFn: () => api.tenantOperations(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // A section the tenant could not answer lands here as 200 with the
    // section named in `degraded`, so nothing retries it and the panel
    // stays empty for the life of the tab. Keep asking until it fills.
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))
  const overview = useQuery(() => ({
    queryKey: ['tenant-overview', params().slug],
    queryFn: () => api.tenantOverview(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))
  const refresh = () => model.refetch()
  const refreshAll = () => { void model.refetch(); void overview.refetch() }
  const refreshing = () => model.isFetching || overview.isFetching
  const d = (): TenantOperationsReadModel | undefined => model.data
  const summary = () => d()?.summary
  const deadJobs = () => {
    const s = summary()
    return s ? s.outbox.dead + s.deliveries.dead + s.push.dead : 0
  }

  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now()
    return model.dataUpdatedAt ? relativeTime(model.dataUpdatedAt) : null
  })

  return <PageShell>
    <PageHeader
      title="Health"
      description="Whether this tenant's machine is well, and how far the autopilot may go on its own."
      actions={
        <>
          <Show when={updated()}><span class="text-sm text-muted-foreground">Updated {updated()}</span></Show>
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={refreshing()} aria-label="Refresh">
            <RefreshCw class={cn(refreshing() && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </>
      }
    />

    <Show when={model.error}>
      <SectionFailureCard error={model.error} fallback="Tenant operations channel unavailable" onRetry={() => void refresh()} />
    </Show>

    <Show when={!model.error && !model.data}>
      <SkeletonSection titleWidth="180px" lines={4} minHeight="200px" />
      <SkeletonSection titleWidth="160px" lines={3} minHeight="160px" />
    </Show>

    <Show when={model.data && !model.error}>
      {/* The answer before the tabs: is it well, is anything stuck, is the
          autopilot on. The header used to carry one badge for the first. */}
      <KpiStrip>
        <KpiCard label="Service health" value={operationalLabel(summary())} tone={operationalTone(summary()) === 'good' ? 'good' : operationalTone(summary()) === 'warn' ? 'warn' : operationalTone(summary()) === 'bad' ? 'bad' : 'default'} sub={summary() ? `p95 ${summary()!.http.p95_ms} ms` : 'no summary yet'} />
        <KpiCard label="Dead deliveries" value={deadJobs()} tone={deadJobs() > 0 ? 'bad' : 'good'} sub={deadJobs() > 0 ? 'will not retry on their own' : 'every queue is draining'} />
        <KpiCard label="Watchdog alerts" value={summary()?.watchdog.active_alerts ?? 0} tone={(summary()?.watchdog.critical_alerts ?? 0) > 0 ? 'bad' : (summary()?.watchdog.active_alerts ?? 0) > 0 ? 'warn' : 'good'} sub={`${summary()?.watchdog.critical_alerts ?? 0} critical`} />
        <KpiCard label="Autopilot" value={d()?.autopilot?.runtime_enabled ? 'on' : 'off'} tone={d()?.autopilot?.runtime_enabled ? 'good' : 'default'} sub={d()?.autopilot ? `${d()!.autopilot!.queued_actions} queued` : 'not reported'} />
      </KpiStrip>

      <TabBar
        active={activeTab()}
        onChange={switchTab}
        onPrefetch={prefetch}
        tabs={[
          { id: 'overview', label: 'Status' },
          { id: 'policies', label: 'Policies' },
          { id: 'runtime', label: 'Switches' },
        ]}
      />

      <TabPanel active={activeTab()} id="overview" visited={isVisited('overview')}>
        {/* The tenant-pushed heartbeat first, then what needs a hand, then the
            autopilot's own report, then the queues the remediation points at. */}
        <TenantRuntimePanel slug={params().slug} />
        <SystemHealthPanel
          slug={params().slug}
          summary={d()?.summary ?? undefined}
          onChanged={refresh}
        />
        <ChiefOfStaffPanel slug={params().slug} />
        <QueueInspectorPanel slug={params().slug} />
      </TabPanel>

      <TabPanel active={activeTab()} id="policies" visited={isVisited('policies')}>
        <AuthorityPoliciesPanel
          slug={params().slug}
          degraded={d()?.degraded ?? []}
          sections={d()?.sections}
          freshness={d()?.freshness}
          fetchedAt={d()?.fetchedAt}
          refresh={refresh}
        />
      </TabPanel>

      <TabPanel active={activeTab()} id="runtime" visited={isVisited('runtime')}>
        <RuntimeSwitchesPanel
          slug={params().slug}
          summary={d()?.summary ?? null}
          refresh={refresh}
          canRedeploy={overview.data?.platform?.capabilities?.canRedeploy}
        />
      </TabPanel>
    </Show>
  </PageShell>
}
