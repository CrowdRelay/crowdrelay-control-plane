import { Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link, useParams } from '@tanstack/solid-router'
import { RefreshCw } from 'lucide-solid'
import { api } from '../lib/api'
import { relativeTime } from '../lib/format'
import { cn } from '../lib/cn'
import { ReplyTriagePanel } from '../components/ReplyTriagePanel'
import { OutreachPipelinePanel } from '../components/OutreachPipelinePanel'
import { PressRoomPanel } from '../components/PressRoomPanel'
import { ReleaseCampaignsPanel } from '../components/ReleaseCampaignsPanel'
import { PlayLedgerPanel } from '../components/PlayLedgerPanel'
import { SkeletonKpiStrip, SkeletonSection } from '../components/Skeleton'
import { KpiCard, KpiStrip, PageShell, PageHeader, TabBar, TabPanel, useTabPanels } from '../components/layout'
import { Button } from '../components/app/button'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { operationalTone, operationalLabel } from '../lib/health-tone'
import type { TenantOperationsReadModel } from '../lib/types'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'

const metric = (value: number | undefined | null, suffix = '') =>
  value == null ? '—' : `${value.toLocaleString()}${suffix}`

// The machine's surfaces for one tenant: replies, outreach, press, releases
// and the play ledger, each on its own tab. Decisions live on Attention; the
// first figure here says how many are waiting and points there.
export function TenantOperationsPage() {
  const params = useParams({ from: '/tenants/$slug/operations' })
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('replies')
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
  const refresh = () => void model.refetch()

  const d = (): TenantOperationsReadModel | undefined => model.error ? undefined : model.data
  const growth = () => d()?.growth
  const autopilot = () => d()?.autopilot
  const summary = () => d()?.summary
  const deadJobs = () => {
    const s = summary()
    if (!s) return 0
    return s.outbox.dead + s.deliveries.dead + s.push.dead
  }
  const healthTone = () => operationalTone(summary())
  const healthLabel = () => operationalLabel(summary())

  // Whether the autopilot is *working*, not merely switched on. Failures
  // outnumbering successes is bad; some failures is a warning; dispatched
  // and never confirmed is bad however few failures were reported.
  const autopilotTone = (): 'good' | 'warn' | 'bad' | undefined => {
    const a = autopilot()
    if (!a) return undefined
    if (a.awaiting_executor > 0 && a.executor_confirmed_24h === 0) return 'bad'
    if (a.failed_24h === 0) return a.awaiting_executor > 0 ? 'warn' : a.succeeded_24h > 0 ? 'good' : undefined
    return a.failed_24h >= a.succeeded_24h ? 'bad' : 'warn'
  }

  const needsYouCount = () => autopilot()?.needs_you.length ?? 0
  const awaitingApproval = () => d()?.opportunities?.filter(o => o.authority === 'awaiting_approval').length ?? 0
  const waiting = () => needsYouCount() + awaitingApproval()

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
      title="Operations"
      description="What the machine is running for this tenant. Decisions that need you are on Attention."
      actions={
        <>
          <Show when={updated()}><span class="text-sm text-muted-foreground">Updated {updated()}</span></Show>
          <Button variant="outline" size="sm" onClick={refresh} disabled={model.isFetching} aria-label="Refresh">
            <RefreshCw class={cn(model.isFetching && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </>
      }
    />

    <Show when={model.error}>
      <SectionFailureCard error={model.error} fallback="Tenant operations channel unavailable" onRetry={refresh} />
    </Show>

    {/* Operations and Intelligence share the query key, so the skeleton
        shows whenever there is no data to render, not only on first fetch. */}
    <Show when={!model.error && !model.data}>
      <SkeletonKpiStrip count={4} />
    </Show>

    <Show when={model.data && !model.error}>
      {/* Four figures: is anything mine, is anything broken, is work going
          out, is the autopilot working. */}
      <KpiStrip>
        <KpiCard
          label="Waiting for you"
          tone={waiting() > 0 ? 'warn' : 'good'}
          value={metric(waiting())}
          sub={waiting() > 0
            ? <Link to="/tenants/$slug/attention" params={{ slug: params().slug }} class="text-primary underline-offset-4 hover:underline">decide on Attention</Link>
            : 'nothing to decide'}
        />
        <KpiCard
          label="Health"
          tone={deadJobs() > 0 ? 'bad' : healthTone() === 'good' ? 'good' : healthTone() === 'warn' ? 'warn' : 'default'}
          value={healthLabel()}
          sub={deadJobs() > 0 ? `${metric(deadJobs())} stuck deliveries` : 'everything is moving'}
        />
        <KpiCard
          label="Growth delivered"
          value={metric(growth()?.totals.delivered)}
          sub={`${metric(growth()?.totals.pending)} still to send`}
        />
        <KpiCard
          label="Autopilot"
          tone={autopilot()?.runtime_enabled ? autopilotTone() ?? 'good' : 'default'}
          value={autopilot()?.runtime_enabled ? 'on' : 'off'}
          sub={<>
            <Show when={(autopilot()?.failed_24h ?? 0) > 0}>
              {metric(autopilot()!.failed_24h)} failed today ·{' '}
            </Show>
            {/* `queued_actions` counts what has not been handed out yet; a
                backlog that was dispatched and never confirmed is the number
                that says the loop has stopped. */}
            <Show when={(autopilot()?.awaiting_executor ?? 0) > 0}>
              {metric(autopilot()!.awaiting_executor)} waiting on a worker ·{' '}
            </Show>
            {metric(autopilot()?.queued_actions ?? 0)} queued ·{' '}
            <Link to="/tenants/$slug/health" params={{ slug: params().slug }} class="text-primary underline-offset-4 hover:underline">
              settings
            </Link>
          </>}
        />
      </KpiStrip>
    </Show>

    {/* One tab per surface. The old Outreach tab stacked three panels with
        their own tab bars under it, so an operator saw a tab called Outreach
        containing a tab called Outreach. Each panel is a tab of its own now
        and the panels no longer draw their own titles. */}
    <TabBar
      active={activeTab()}
      onChange={switchTab}
      onPrefetch={prefetch}
      tabs={[
        { id: 'replies', label: 'Replies' },
        { id: 'outreach', label: 'Outreach' },
        { id: 'press', label: 'Press' },
        { id: 'releases', label: 'Releases' },
        { id: 'plays', label: 'Play ledger' },
      ]}
    />

    <Show when={!model.error && !model.data && isVisited(activeTab())}>
      <SkeletonSection titleWidth="160px" lines={4} minHeight="160px" />
    </Show>

    {/* Each panel runs its own queries, so it loads independently of the
        read model. TabPanel's Suspense boundary shows the first skeleton. */}
    <TabPanel active={activeTab()} id="replies" visited={isVisited('replies')}>
      <ReplyTriagePanel />
    </TabPanel>
    <TabPanel active={activeTab()} id="outreach" visited={isVisited('outreach')}>
      <OutreachPipelinePanel slug={params().slug} />
    </TabPanel>
    <TabPanel active={activeTab()} id="press" visited={isVisited('press')}>
      <PressRoomPanel slug={params().slug} />
    </TabPanel>
    <TabPanel active={activeTab()} id="releases" visited={isVisited('releases')}>
      <ReleaseCampaignsPanel slug={params().slug} />
    </TabPanel>
    <TabPanel active={activeTab()} id="plays" visited={isVisited('plays')}>
      <PlayLedgerPanel slug={params().slug} />
    </TabPanel>
  </PageShell>
}
