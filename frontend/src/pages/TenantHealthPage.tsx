import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { RefreshCw } from 'lucide-solid'
import { api } from '../lib/api'
import { relativeTime } from '../lib/format'
import { cn } from '../lib/cn'
import { ChiefOfStaffPanel } from '../components/ChiefOfStaffPanel'
import { DeliveryJourneyPanel } from '../components/DeliveryJourneyPanel'
import { SystemHealthPanel } from '../components/SystemHealthPanel'
import { TenantRuntimePanel } from '../components/TenantRuntimePanel'
import { RuntimeSwitchesPanel } from '../components/RuntimeSwitchesPanel'
import { AuthorityPoliciesPanel } from '../components/AuthorityPoliciesPanel'
import { StandingApprovalsPanel } from '../components/StandingApprovalsPanel'
import { SkeletonSection } from '../components/Skeleton'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { Alert } from '../components/app/alert'
import { TabBar, TabPanel, useTabPanels, PageShell, PageHeader, KpiStrip, KpiCard } from '../components/layout'
import { Button } from '../components/app/button'
import { operationalTone, operationalLabel } from '../lib/health-tone'
import type { TenantDeliveryReadModel, TenantTodayReadModel } from '../lib/types'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'

const TABS = ['overview', 'delivery', 'policies', 'runtime'] as const

// The section labels the delivery tab's degraded strip prints — a section
// the tenant could not answer is named, never silently absent.
const DELIVERY_SECTION_LABEL: Record<string, string> = {
  summary: 'Queue depths',
  outbox: 'The outbox',
  deliveries: 'The deliveries',
  attention: 'The dead queues',
  delivery_results: 'The landed ledger',
}

// Is the tenant's machine well, and what may the autopilot do. Three tabs:
// status, the authority policies, and the runtime switches. This is the only
// place the autopilot's switches and sliders live; Operations links here.
export function TenantHealthPage() {
  const params = useParams({ from: '/tenants/$slug/health' })
  // The id list makes `?tab=` deep links land on the right tab.
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('overview', [...TABS])
  const model = useQuery(() => ({
    queryKey: ['tenant-today', params().slug],
    queryFn: () => api.tenantToday(params().slug),
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
  const delivery = useQuery(() => ({
    queryKey: ['tenant-delivery', params().slug],
    queryFn: () => api.deliveryModel(params().slug),
    // The delivery model is a 5-call upstream fan-out consumed only inside
    // the Delivery tab — the default Status tab must not pay for it.
    enabled: isVisited('delivery'),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // A dead section lands here as 200 with the section named in `degraded`
    // — nothing retries it, so the queue view stays empty for the life of
    // the page. Keep asking until it fills.
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))
  // The panels this feeds mutate queues and switches the delivery model
  // also reads — a today-only refetch would leave the sibling tab stale.
  const refresh = () => Promise.all([model.refetch(), delivery.refetch()])
  const refreshAll = () => { void model.refetch(); void overview.refetch(); void delivery.refetch() }
  const refreshing = () => model.isFetching || overview.isFetching || delivery.isFetching
  const d = (): TenantTodayReadModel | undefined => model.data
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
        {/* A section that did not answer is `—`, never a fabricated zero —
            "0 dead" and "queue didn't say" are different answers. */}
        <KpiCard label="Dead deliveries" value={summary() ? deadJobs() : '—'} tone={summary() ? (deadJobs() > 0 ? 'bad' : 'good') : 'default'} sub={summary() ? (deadJobs() > 0 ? 'will not retry on their own' : 'every queue is draining') : 'not reported'} />
        <KpiCard label="Watchdog alerts" value={summary() ? summary()!.watchdog.active_alerts : '—'} tone={summary() ? ((summary()!.watchdog.critical_alerts) > 0 ? 'bad' : (summary()!.watchdog.active_alerts) > 0 ? 'warn' : 'good') : 'default'} sub={summary() ? `${summary()!.watchdog.critical_alerts} critical` : 'not reported'} />
        <KpiCard label="Autopilot" value={d()?.autopilot ? (d()!.autopilot!.runtime_enabled ? 'on' : 'off') : '—'} tone={d()?.autopilot?.runtime_enabled ? 'good' : 'default'} sub={d()?.autopilot ? `${d()!.autopilot!.queued_actions} queued` : 'not reported'} />
      </KpiStrip>
    </Show>

    {/* The tabs render regardless of the today model — every tab's content
        answers from its own channel except the two panels that take today's
        summary as a prop, and those gate on it alone. A dead today read
        must not hide a working delivery view. */}
    <TabBar
        active={activeTab()}
        onChange={switchTab}
        onPrefetch={prefetch}
        tabs={[
          { id: 'overview', label: 'Status' },
          { id: 'delivery', label: 'Delivery' },
          { id: 'policies', label: 'Policies' },
          { id: 'runtime', label: 'Switches' },
        ]}
      />

      <TabPanel active={activeTab()} id="overview" visited={isVisited('overview')}>
        {/* The tenant-pushed heartbeat first, then what needs a hand, then the
            autopilot's own report. */}
        <TenantRuntimePanel slug={params().slug} />
        <Show when={model.data}>{data => (
          <SystemHealthPanel
            slug={params().slug}
            summary={data().summary ?? undefined}
            onChanged={refresh}
          />
        )}</Show>
        <ChiefOfStaffPanel slug={params().slug} />
      </TabPanel>

      {/* ── Delivery — the pipe as a journey: drafted → queued → wire →
            landed, with the dead queues leading because they are the ask.
            One read model feeds every row; retries invalidate it. ── */}
      <TabPanel active={activeTab()} id="delivery" visited={isVisited('delivery')}>
        <Show when={delivery.error}>
          <SectionFailureCard error={delivery.error} fallback="Delivery channel unavailable" onRetry={() => void delivery.refetch()} />
        </Show>
        <Show when={delivery.data}>{(data: () => TenantDeliveryReadModel) => <>
          <For each={data().degraded}>{section => (
            <Alert tone="warning" role="status" class="mb-4">
              <strong>{DELIVERY_SECTION_LABEL[section] ?? section}</strong> isn't available on the
              connected tenant right now. The rest of the page keeps working — it recovers on the next poll.
            </Alert>
          )}</For>
          <DeliveryJourneyPanel
            slug={params().slug}
            model={() => data()}
            onRefresh={() => { void delivery.refetch(); void model.refetch() }}
          />
        </>}</Show>
      </TabPanel>

      <TabPanel active={activeTab()} id="policies" visited={isVisited('policies')}>
        <AuthorityPoliciesPanel slug={params().slug} />
        {/* The policies say how much it may do; the standing grants say where
            it never has to ask — same question, so same tab. */}
        <StandingApprovalsPanel slug={params().slug} />
      </TabPanel>

      <TabPanel active={activeTab()} id="runtime" visited={isVisited('runtime')}>
        <Show when={model.data}>{data => (
          <RuntimeSwitchesPanel
            slug={params().slug}
            summary={data().summary ?? null}
            refresh={refresh}
            canRedeploy={overview.data?.platform?.capabilities?.canRedeploy}
          />
        )}</Show>
      </TabPanel>
  </PageShell>
}
