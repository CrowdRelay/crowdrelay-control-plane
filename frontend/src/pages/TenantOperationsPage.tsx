import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link, useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { KpiCard } from '../components/primitives'
import { OpportunityBoardPanel } from '../components/OpportunityBoardPanel'
import { BrainDecisionPanel } from '../components/BrainDecisionPanel'
import { ReplyTriagePanel } from '../components/ReplyTriagePanel'
import { OutreachPipelinePanel } from '../components/OutreachPipelinePanel'
import { PressRoomPanel } from '../components/PressRoomPanel'
import { ReleaseCampaignsPanel } from '../components/ReleaseCampaignsPanel'
import { PlayLedgerPanel } from '../components/PlayLedgerPanel'
import { SkeletonKpiStrip, SkeletonSection } from '../components/Skeleton'
import { TabBar, TabPanel, useTabPanels } from '../components/layout'
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

export function TenantOperationsPage() {
  const params = useParams({ from: '/tenants/$slug/operations' })
  const { activeTab, switchTab, isVisited } = useTabPanels('opportunities')
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

  const topOpportunity = () => d()?.opportunities?.[0] ?? null
  const lastDecisionAt = () => d()?.opportunities?.[0]?.due_at ?? null

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">EXECUTION</span>
        <h1>Operations</h1>
        <p>Opportunity board, outreach pipeline and release campaigns. Autopilot authority policies live on the Autopilot page.</p>
      </div>
      <Show when={model.data && !model.error}>
        <div class="page-head-status">
          <StatusBadge status={healthLabel()} tone={healthTone()} />
          <Show when={autopilot()?.runtime_enabled}>
            <StatusBadge status="autopilot on" tone="good" />
          </Show>
        </div>
      </Show>
    </div>

    <Show when={model.error}>
      <SectionFailureCard error={model.error} fallback="Tenant operations channel unavailable" onRetry={() => void refresh()} />
    </Show>

    {/* KPI strip skeleton — shown whenever the read model is absent.
        Operations and Intelligence share the same query key, so isPending
        is false when the data is already cached from a prior visit. The
        skeleton must show whenever there is no data to render, not just on
        the very first fetch. */}
    <Show when={!model.error && !model.data}>
      <SkeletonKpiStrip count={7} />
    </Show>

    <Show when={model.data && !model.error}>
      {/* KPI strip — persistent across all tabs */}
      <div class="ops-kpi-strip">
        {/* Autopilot status is read-only here. Authority policies, switches,
            and sliders live on the Autopilot page only — this card links there. */}
        <Link to="/tenants/$slug/health" params={{ slug: params().slug }} class="ops-kpi-link">
          <KpiCard
            compact
            label="Autopilot"
            tone={autopilot()?.runtime_enabled ? 'good' : 'muted'}
            value={autopilot()?.runtime_enabled ? 'on' : 'off'}
            sub={`${autopilot()?.queued_actions ?? 0} queued · manage →`}
          />
        </Link>
        <KpiCard
          compact
          label="Needs you"
          tone={hasAttention() ? 'warn' : 'good'}
          value={needsYouCount() + awaitingApproval()}
          sub={needsYouCount() > 0 ? `${needsYouCount()} approval(s)` : awaitingApproval() > 0 ? `${awaitingApproval()} awaiting` : 'all clear'}
        />
        <KpiCard
          compact
          label="Health"
          tone={deadJobs() > 0 ? 'bad' : healthTone() === 'good' ? 'good' : healthTone() === 'warn' ? 'warn' : undefined}
          value={healthLabel()}
          sub={deadJobs() > 0 ? `${deadJobs()} dead` : `${summary()?.http.p95_ms ?? 0}ms p95`}
        />
        <KpiCard compact label="Opportunities" value={metric(opCount())} sub="awaiting decision" />
        <KpiCard
          compact
          label="Growth delivered"
          value={metric(growth()?.totals.delivered)}
          sub={`${metric(growth()?.totals.pending)} pending`}
        />
        <KpiCard
          compact
          label="Outreach"
          value={metric(growth()?.outreach.active_opportunities)}
          sub={`${metric(growth()?.outreach.awaiting_reply)} awaiting reply`}
        />
        {/* Ten failures against zero successes rendered as a neutral card with
            a red footnote. If nothing landed and the failures outnumber the
            successes, that is the state of the card, not a caption on it. */}
        <KpiCard
          compact
          label="Autopilot 24h"
          tone={autopilotTone()}
          value={metric(autopilot()?.succeeded_24h)}
          sub={autopilot() ? `${autopilot()!.failed_24h} failed` : '—'}
          subClass={autopilot() && autopilot()!.failed_24h > 0 ? 'tone-bad' : undefined}
        />
      </div>

      {/* Attention banner — persistent */}
      <Show when={hasAttention()}>
        <div class="ops-attention-banner tone-warn">
          <div class="ops-attention-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div class="ops-attention-content">
            <strong>Operator attention required</strong>
            <span>
              <Show when={needsYouCount() > 0}>{needsYouCount()} pending approval(s) · </Show>
              <Show when={awaitingApproval() > 0}>{awaitingApproval()} opportunity(ies) awaiting · </Show>
              <Show when={deadJobs() > 0}>{deadJobs()} dead delivery item(s)</Show>
            </span>
          </div>
        </div>
      </Show>
    </Show>

    {/* Tab bar — static, renders immediately. Count callbacks return 0
        while data is pending, which is the correct placeholder. */}
    <TabBar
      active={activeTab()}
      onChange={switchTab}
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
      <Show when={d()} fallback={<SkeletonSection titleWidth="160px" lines={4} minHeight="160px" />}>
        <BrainDecisionPanel
          slug={params().slug}
          opportunity={topOpportunity()}
          degraded={d()?.degraded.includes('opportunities') ?? false}
          lastDecisionAt={lastDecisionAt()}
          refresh={refresh}
        />
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
  </section>
}
