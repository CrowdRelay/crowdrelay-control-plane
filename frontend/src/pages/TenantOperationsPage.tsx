import { Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { KpiCard } from '../components/primitives'
import { OpportunityBoardPanel } from '../components/OpportunityBoardPanel'
import { BrainDecisionPanel } from '../components/BrainDecisionPanel'
import { ReplyTriagePanel } from '../components/ReplyTriagePanel'
import { OutreachPipelinePanel } from '../components/OutreachPipelinePanel'
import { BeaconSignalPanel } from '../components/BeaconSignalPanel'
import { BeaconConsolePanel } from '../components/BeaconConsolePanel'
import { PressRoomPanel } from '../components/PressRoomPanel'
import { ReleaseCampaignsPanel } from '../components/ReleaseCampaignsPanel'
import { PlayLedgerPanel } from '../components/PlayLedgerPanel'
import { SkeletonOperationsPage, SkeletonSection } from '../components/Skeleton'
import { TabBar, TabContent } from '../components/TabBar'
import { LighthouseIcon } from '../components/icons/LighthouseIcon'
import { StatusBadge } from '../components/StatusBadge'
import { refreshTick } from '../lib/refresh'
import type { TenantOperationsReadModel } from '../lib/types'

const metric = (value: number | undefined | null, suffix = '') =>
  value == null ? '—' : `${value.toLocaleString()}${suffix}`

export function TenantOperationsPage() {
  const params = useParams({ from: '/tenants/$slug/operations' })
  const [activeTab, setActiveTab] = createSignal('opportunities')
  const model = useQuery(() => ({
    queryKey: ['tenant-operations', params().slug, refreshTick()],
    queryFn: () => api.tenantOperations(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const refresh = () => model.refetch()

  const d = (): TenantOperationsReadModel | undefined => model.data
  const opCount = () => d()?.opportunities?.length ?? 0
  const growth = () => d()?.growth
  const autopilot = () => d()?.autopilot
  const summary = () => d()?.summary
  const deadJobs = () => {
    const s = summary()
    if (!s) return 0
    return s.outbox.dead + s.deliveries.dead + s.push.dead
  }
  const healthTone = (): 'good' | 'warn' | 'bad' | 'muted' => {
    const s = summary()
    if (!s) return 'muted'
    if (s.watchdog.critical_alerts > 0 || deadJobs() > 0) return 'bad'
    if (s.watchdog.active_alerts > 0 || s.http.p95_ms > 1000) return 'warn'
    return 'good'
  }
  const healthLabel = () => {
    const t = healthTone()
    return t === 'good' ? 'healthy' : t === 'warn' ? 'attention' : t === 'bad' ? 'degraded' : 'loading'
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
        <p>The opportunity board, growth delivery, outreach pipeline and release campaigns.</p>
      </div>
      <Show when={model.data}>
        <div class="page-head-status">
          <StatusBadge status={healthLabel()} tone={healthTone()} />
          <Show when={autopilot()?.runtime_enabled}>
            <StatusBadge status="autopilot on" tone="good" />
          </Show>
        </div>
      </Show>
    </div>

    <Show when={model.error}>
      <div class="error-card" role="alert">{model.error instanceof Error ? model.error.message : 'Tenant operations channel unavailable'}</div>
    </Show>

    <Show when={!model.error && model.isPending}><SkeletonOperationsPage /></Show>

    <Show when={model.data}>{<>
      {/* KPI strip — persistent across all tabs */}
      <div class="ops-kpi-strip">
        <KpiCard
          compact
          label="Autopilot"
          tone={autopilot()?.runtime_enabled ? 'good' : 'muted'}
          value={autopilot()?.runtime_enabled ? 'on' : 'off'}
          sub={`${autopilot()?.queued_actions ?? 0} queued`}
        />
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
        <KpiCard
          compact
          label="Autopilot 24h"
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

      {/* Tab bar */}
      <TabBar
        active={activeTab()}
        onChange={setActiveTab}
        tabs={[
          { id: 'opportunities', label: 'Opportunities', count: () => opCount() },
          { id: 'outreach', label: 'Outreach' },
          { id: 'beacons', label: 'Beacons', icon: LighthouseIcon },
          { id: 'releases', label: 'Releases' },
        ]}
      />

      {/* ── Opportunities tab ── */}
      <TabContent active={activeTab()} id="opportunities">
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
      </TabContent>


      {/* ── Outreach tab ── */}
      <TabContent active={activeTab()} id="outreach">
        {/* Replies are worked here, next to the pipeline that produced them.
            They used to sit under a Growth tab that duplicated the Growth
            page's panels wholesale. */}
        <ReplyTriagePanel />
        <OutreachPipelinePanel slug={params().slug} />
        <PressRoomPanel slug={params().slug} />
      </TabContent>

      {/* ── Beacons tab ──
          The roster and every action on it in one place. The Signal panel
          below is the same data seen as a funnel; it stays because it answers
          "how is the invite pipeline doing", which the roster does not. */}
      <TabContent active={activeTab()} id="beacons">
        <BeaconConsolePanel slug={params().slug} />
        <BeaconSignalPanel slug={params().slug} />
      </TabContent>

      {/* ── Releases tab ── */}
      <TabContent active={activeTab()} id="releases">
        <ReleaseCampaignsPanel slug={params().slug} />
        <PlayLedgerPanel slug={params().slug} />
      </TabContent>
    </>}</Show>
  </section>
}
