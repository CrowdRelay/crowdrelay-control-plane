import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link, useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { OpportunityBoardPanel } from '../components/OpportunityBoardPanel'
import { ReplyTriagePanel } from '../components/ReplyTriagePanel'
import { OutreachPipelinePanel } from '../components/OutreachPipelinePanel'
import { PressRoomPanel } from '../components/PressRoomPanel'
import { ReleaseCampaignsPanel } from '../components/ReleaseCampaignsPanel'
import { PlayLedgerPanel } from '../components/PlayLedgerPanel'
import { SkeletonKpiStrip, SkeletonSection } from '../components/Skeleton'
import { KpiCard, PageShell, PageHeader, ErrorCard, TabBar, TabPanel, useTabPanels } from '../components/layout'
import { StatusBadge } from '../components/StatusBadge'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { operationalTone, operationalLabel } from '../lib/health-tone'
import type { TenantOperationsReadModel } from '../lib/types'

const metric = (value: number | undefined | null, suffix = '') =>
  value == null ? '—' : `${value.toLocaleString()}${suffix}`

/** Format an integer with thousands separators, or dash for null/undefined. */
const fmt = (n: number | null | undefined): string => {
  if (n == null) return '—'
  return n.toLocaleString('en-US')
}

/** Map legacy tone values to the layout KpiCard's `tone` prop ('good' only). */
const kpiTone = (tone: string | undefined): 'good' | undefined =>
  tone === 'good' ? 'good' : undefined

/** Map legacy warn/bad/muted tones to Tailwind classes for the `class` prop. */
const kpiClass = (tone: string | undefined): string => {
  switch (tone) {
    case 'warn': return 'border-warning/25'
    case 'bad': return 'border-destructive/25'
    case 'muted': return 'opacity-70'
    default: return ''
  }
}

export function TenantOperationsPage() {
  const params = useParams({ from: '/tenants/$slug/operations' })
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('opportunities')
  const model = useQuery(() => ({
    queryKey: ['tenant-operations', params().slug],
    queryFn: () => api.tenantOperations(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const refresh = () => model.refetch()

  const d = (): TenantOperationsReadModel | undefined => model.error ? undefined : model.data
  const opCount = () => d()?.opportunities?.length ?? 0
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

  const autopilotTone = (): 'good' | 'warn' | 'bad' | undefined => {
    const a = autopilot()
    if (!a) return undefined
    if (a.failed_24h === 0) return a.succeeded_24h > 0 ? 'good' : undefined
    return a.failed_24h >= a.succeeded_24h ? 'bad' : 'warn'
  }

  const needsYouCount = () => autopilot()?.needs_you.length ?? 0
  const awaitingApproval = () => d()?.opportunities?.filter(o => o.authority === 'awaiting_approval').length ?? 0
  const hasAttention = () => needsYouCount() > 0 || awaitingApproval() > 0 || deadJobs() > 0


  return <PageShell>
    <PageHeader
      eyebrow="EXECUTION"
      title="Operations"
      description="Your daily worklist. Anything the autopilot needs a decision on is here — work the list top to bottom."
      actions={
        <Show when={model.data && !model.error}>
          <StatusBadge status={healthLabel()} tone={healthTone()} />
          <Show when={autopilot()?.runtime_enabled}>
            <StatusBadge status="autopilot on" tone="good" />
          </Show>
        </Show>
      }
    />

    <Show when={model.error}>
      <SectionFailureCard error={model.error} fallback="Tenant operations channel unavailable" onRetry={() => void refresh()} />
    </Show>

    {/* KPI strip skeleton — shown whenever the read model is absent.
        Operations and Intelligence share the same query key, so isPending
        is false when the data is already cached from a prior visit. The
        skeleton must show whenever there is no data to render, not just on
        the very first fetch. */}
    <Show when={!model.error && !model.data}>
      <SkeletonKpiStrip count={4} />
    </Show>

    <Show when={model.data && !model.error}>
      {/* Four numbers, not seven. "Opportunities" repeated the tab badge and
          the worklist's own section count, "Outreach" repeated the Outreach
          tab, and "Autopilot 24h" is a report on the Autopilot page rather
          than something today's work turns on. What is left answers the two
          questions this page exists for: is anything mine, and is anything
          broken. */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Waiting for you"
          tone={kpiTone(hasAttention() ? 'warn' : 'good')}
          class={kpiClass(hasAttention() ? 'warn' : 'good')}
          value={needsYouCount() + awaitingApproval()}
          sub={needsYouCount() + awaitingApproval() > 0 ? 'decide below' : 'nothing to decide'}
        />
        <KpiCard
          label="Health"
          tone={kpiTone(deadJobs() > 0 ? 'bad' : healthTone() === 'good' ? 'good' : healthTone() === 'warn' ? 'warn' : undefined)}
          class={kpiClass(deadJobs() > 0 ? 'bad' : healthTone() === 'warn' ? 'warn' : undefined)}
          value={healthLabel()}
          sub={deadJobs() > 0 ? `${deadJobs()} stuck deliveries` : 'everything is moving'}
        />
        <KpiCard
          label="Growth delivered"
          value={metric(growth()?.totals.delivered)}
          sub={`${metric(growth()?.totals.pending)} still to send`}
        />
        {/* Autopilot is read-only here. Its switches and policies live on one
            page, and this card is the way there.

            This card was labelled "Health", which is the label on the second
            card in the same strip. Two tiles side by side under one name, one
            reporting whether deliveries are moving and the other whether the
            autopilot is running — and they disagree, because they measure
            different things. This one has always been about the autopilot. */}
        <Link to="/tenants/$slug/health" params={{ slug: params().slug }} class="block transition-opacity hover:opacity-80">
          <KpiCard
            label="Autopilot"
            tone={kpiTone(autopilot()?.runtime_enabled ? 'good' : 'muted')}
            class={kpiClass(autopilot()?.runtime_enabled ? 'good' : 'muted')}
            value={autopilot()?.runtime_enabled ? 'on' : 'off'}
            sub={`${autopilot()?.queued_actions ?? 0} queued · change settings`}
          />
        </Link>
      </div>

      {/* The attention banner used to sit here restating the card directly
          above it — same counts, same page, twice. The card carries the count
          and its tone; the worklist below carries the work. */}
    </Show>

    {/* Tab bar — static, renders immediately. Count callbacks return 0
        while data is pending, which is the correct placeholder. */}
    <TabBar
      active={activeTab()}
      onChange={switchTab}
      onPrefetch={prefetch}
      tabs={[
        { id: 'opportunities', label: 'Opportunities', count: () => opCount() },
        { id: 'outreach', label: 'Outreach' },
        { id: 'releases', label: 'Releases' },
      ]}
    />

    {/* Tab content skeleton — shows whenever the read model is absent
        and the tab has been visited. Each tab also has its own Suspense
        boundary inside TabPanel for lazy-mounted children. */}
    <Show when={!model.error && !model.data && isVisited(activeTab())}>
      <SkeletonSection titleWidth="160px" lines={4} minHeight="160px" />
      <SkeletonSection titleWidth="200px" lines={3} minHeight="140px" />
    </Show>

    {/* ── Opportunities tab ── */}
    <TabPanel active={activeTab()} id="opportunities" visited={isVisited('opportunities')}>
      {/* `BrainDecisionPanel` used to sit here, rendering the top opportunity
          in full above a board that listed the same entry again — two panels of
          identical width and fill, saying the same thing, and disagreeing about
          whether the operator had anything to do. The board is now one ranked
          worklist grouped by that question, and it carries Reject, which only
          the decision panel used to offer. */}
      <Show when={d()} fallback={<SkeletonSection titleWidth="160px" lines={4} minHeight="160px" />}>
        <OpportunityBoardPanel
          slug={params().slug}
          opportunities={d()?.opportunities ?? null}
          degraded={d()?.degraded.includes('opportunities') ?? false}
          refresh={refresh}
        />
      </Show>
    </TabPanel>

    {/* ── Outreach tab ── */}
    {/* These panels have their own useQuery calls, so they load
        independently of the overview read model. The Suspense
        boundary in TabPanel handles their initial load skeleton. */}
    <TabPanel active={activeTab()} id="outreach" visited={isVisited('outreach')}>
      {/* Replies are worked here, next to the pipeline that produced them.
          They used to sit under a Growth tab that duplicated the Growth
          page's panels wholesale. */}
      <ReplyTriagePanel />
      <OutreachPipelinePanel slug={params().slug} />
      <PressRoomPanel slug={params().slug} />
    </TabPanel>

    {/* Beacons moved to Audience in the left nav — a beacon is part of who
        the audience is, not an operation you run. See pages/BeaconsPage.tsx. */}

    {/* ── Releases tab ── */}
    {/* ReleaseCampaignsPanel and PlayLedgerPanel have their own useQuery
        calls, so they load independently of the overview read model. */}
    <TabPanel active={activeTab()} id="releases" visited={isVisited('releases')}>
      <ReleaseCampaignsPanel slug={params().slug} />
      <PlayLedgerPanel slug={params().slug} />
    </TabPanel>
  </PageShell>
}
