import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { OperationsPanel } from '../components/OperationsPanel'
import { GrowthPanel } from '../components/GrowthPanel'
import { GrowthMetricsPanel } from '../components/GrowthMetricsPanel'
import { GrowthObjectivesPanel } from '../components/GrowthObjectivesPanel'
import { OpportunityBoardPanel } from '../components/OpportunityBoardPanel'
import { BrainDecisionPanel } from '../components/BrainDecisionPanel'
import { ScorecardPanel } from '../components/ScorecardPanel'
import { ReplyTriagePanel } from '../components/ReplyTriagePanel'
import { OutreachPipelinePanel } from '../components/OutreachPipelinePanel'
import { BeaconSignalPanel } from '../components/BeaconSignalPanel'
import { PressRoomPanel } from '../components/PressRoomPanel'
import { ReleaseCampaignsPanel } from '../components/ReleaseCampaignsPanel'
import { PlayLedgerPanel } from '../components/PlayLedgerPanel'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { SkeletonOperationsPage } from '../components/Skeleton'
import { StatusBadge } from '../components/StatusBadge'
import { refreshTick } from '../lib/refresh'
import type { TenantOperationsReadModel } from '../lib/types'

const metric = (value: number | undefined | null, suffix = '') =>
  value == null ? '—' : `${value.toLocaleString()}${suffix}`

export function TenantOperationsPage() {
  const params = useParams({ from: '/tenants/$slug/operations' })
  const model = useQuery(() => ({
    queryKey: ['tenant-operations', params().slug, refreshTick()],
    queryFn: () => api.tenantOperations(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const refresh = () => model.refetch()

  // KPI strip values — pulled from the existing read model, no extra fetch
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

  // Operator attention: needs approval, execution gaps, dead deliveries
  const needsYouCount = () => autopilot()?.needs_you.length ?? 0
  const awaitingApproval = () => d()?.opportunities?.filter(o => o.authority === 'awaiting_approval').length ?? 0
  const hasAttention = () => needsYouCount() > 0 || awaitingApproval() > 0 || deadJobs() > 0

  // The flagship decision — opportunity board position #1
  const topOpportunity = () => d()?.opportunities?.[0] ?? null
  const lastDecisionAt = () => d()?.opportunities?.[0]?.due_at ?? null

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">TENANT / {params().slug.toUpperCase()}</span>
        <h1>Operations & Autopilot</h1>
        <p>Live CrowdRelay telemetry, runtime switches, Autopilot authority, the opportunity board and growth delivery.</p>
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
      {/* ─── Tier 1 KPIs — autonomy, needs-you, decision state ─────── */}
      <div class="ops-kpi-strip">
        <div class="ops-kpi-card" classList={{ 'tone-good': autopilot()?.runtime_enabled, 'tone-muted': !autopilot()?.runtime_enabled }}>
          <span class="ops-kpi-label">Autopilot</span>
          <strong>{autopilot()?.runtime_enabled ? 'on' : 'off'}</strong>
          <small>{autopilot()?.queued_actions ?? 0} queued</small>
        </div>
        <div class="ops-kpi-card" classList={{ 'tone-warn': hasAttention(), 'tone-good': !hasAttention() }}>
          <span class="ops-kpi-label">Needs you</span>
          <strong>{needsYouCount() + awaitingApproval()}</strong>
          <small>{needsYouCount() > 0 ? `${needsYouCount()} approval(s)` : awaitingApproval() > 0 ? `${awaitingApproval()} awaiting` : 'all clear'}</small>
        </div>
        <div class="ops-kpi-card" classList={{ 'tone-bad': deadJobs() > 0, 'tone-warn': deadJobs() === 0 && healthTone() === 'warn', 'tone-good': healthTone() === 'good' }}>
          <span class="ops-kpi-label">Health</span>
          <strong>{healthLabel()}</strong>
          <small>{deadJobs() > 0 ? `${deadJobs()} dead` : `${summary()?.http.p95_ms ?? 0}ms p95`}</small>
        </div>
      </div>

      {/* ─── Tier 2 KPIs — opportunities, growth, outreach ─────────── */}
      <div class="ops-kpi-strip">
        <div class="ops-kpi-card">
          <span class="ops-kpi-label">Opportunities</span>
          <strong>{metric(opCount())}</strong>
          <small>awaiting decision</small>
        </div>
        <div class="ops-kpi-card">
          <span class="ops-kpi-label">Growth delivered</span>
          <strong>{metric(growth()?.totals.delivered)}</strong>
          <small>{metric(growth()?.totals.pending)} pending</small>
        </div>
        <div class="ops-kpi-card">
          <span class="ops-kpi-label">Outreach</span>
          <strong>{metric(growth()?.outreach.active_opportunities)}</strong>
          <small>{metric(growth()?.outreach.awaiting_reply)} awaiting reply</small>
        </div>
      </div>

      {/* ─── Tier 3 KPIs — throughput/24h supporting metrics ────────── */}
      <div class="ops-kpi-strip">
        <div class="ops-kpi-card">
          <span class="ops-kpi-label">Autopilot 24h</span>
          <strong>{metric(autopilot()?.succeeded_24h)}</strong>
          <small class={autopilot() && autopilot()!.failed_24h > 0 ? 'tone-bad' : ''}>{autopilot() ? `${autopilot()!.failed_24h} failed` : '—'}</small>
        </div>
      </div>

      {/* ─── Flagship: Brain Decision Panel ─────────────────────────── */}
      <BrainDecisionPanel
        slug={params().slug}
        opportunity={topOpportunity()}
        degraded={d()?.degraded.includes('opportunities') ?? false}
        lastDecisionAt={lastDecisionAt()}
        refresh={refresh}
      />

      {/* ─── Operator attention banner — visible when action needed ── */}
      <Show when={hasAttention()}>
        <div class="ops-attention-banner" classList={{ 'tone-bad': deadJobs() > 0, 'tone-warn': deadJobs() === 0 }}>
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

      {/* ─── Primary cockpit: opportunity board + scorecard ────────── */}
      <div class="cockpit-primary">
        <div class="cockpit-decision">
          <OpportunityBoardPanel
            slug={params().slug}
            opportunities={d()?.opportunities ?? null}
            degraded={d()?.degraded.includes('opportunities') ?? false}
            refresh={refresh}
          />
        </div>
        <div class="cockpit-aside">
          <ScorecardPanel slug={params().slug} />
          <Show when={autopilot()?.needs_you.length}>
            <div class="cockpit-needs-you">
              <div class="cockpit-needs-you-head">
                <span class="eyebrow">NEEDS YOU</span>
                <h3>Pending approvals</h3>
              </div>
              <div class="cockpit-needs-you-list">
                <For each={autopilot()!.needs_you.slice(0, 5)}>{action => (
                  <div class="cockpit-needs-you-row">
                    <div>
                      <strong>{action.action_kind.replaceAll('_', ' ')}</strong>
                      <small>{action.context.replaceAll('_', ' ')} · {action.subject_kind}</small>
                    </div>
                    <Show when={action.approval_expires_at}>
                      <small class="muted">expires {new Date(action.approval_expires_at!).toLocaleDateString()}</small>
                    </Show>
                  </div>
                )}</For>
              </div>
            </div>
          </Show>
        </div>
      </div>

      {/* ─── Objectives — visible by default ─────────────────────── */}
      <GrowthObjectivesPanel slug={params().slug} />

      {/* ─── Growth state — visible by default ───────────────────── */}
      <div class="cockpit-section">
        <div class="cockpit-section-head">
          <span class="eyebrow">GROWTH STATE</span>
          <h3>Live growth operations</h3>
        </div>
        <div class="cockpit-growth-grid">
          <GrowthPanel growth={d()?.growth ?? null} degraded={d()?.degraded.includes('growth') ?? false} />
          <GrowthMetricsPanel slug={params().slug} />
        </div>
      </div>

      {/* ─── Reply triage — visible by default ───────────────────── */}
      <ReplyTriagePanel />

      {/* ─── Operational telemetry + controls ────────────────────── */}
      <OperationsPanel
        slug={params().slug}
        summary={d()?.summary ?? null}
        flags={d()?.flags ?? null}
        autopilot={d()?.autopilot ?? null}
        degraded={d()?.degraded ?? []}
        refresh={refresh}
      />

      {/* ─── ADVANCED — diagnostics, collapsed by default ─────────── */}
      <div class="advanced-section">
        <div class="intel-header">
          <span class="eyebrow">ADVANCED</span>
          <h2>Detailed subsystem views</h2>
          <p class="muted">Raw subsystem views — not needed for normal operation.</p>
        </div>

        <div class="intel-group">
          <span class="intel-group-label">Outreach</span>
          <CollapsibleSection eyebrow="OUTREACH" title="Outreach pipeline">
            <OutreachPipelinePanel slug={params().slug} />
          </CollapsibleSection>
        </div>

        <div class="intel-group">
          <span class="intel-group-label">Signals</span>
          <CollapsibleSection eyebrow="BEACON" title="Beacon signals">
            <BeaconSignalPanel slug={params().slug} />
          </CollapsibleSection>
        </div>

        <div class="intel-group">
          <span class="intel-group-label">Communications</span>
          <CollapsibleSection eyebrow="PRESS" title="Press room">
            <PressRoomPanel slug={params().slug} />
          </CollapsibleSection>
        </div>

        <div class="intel-group">
          <span class="intel-group-label">Releases</span>
          <CollapsibleSection eyebrow="RELEASES" title="Release campaigns">
            <ReleaseCampaignsPanel slug={params().slug} />
          </CollapsibleSection>
        </div>

        <div class="intel-group">
          <span class="intel-group-label">Ledger</span>
          <CollapsibleSection eyebrow="LEDGER" title="Play ledger">
            <PlayLedgerPanel slug={params().slug} />
          </CollapsibleSection>
        </div>
      </div>
    </>}</Show>
  </section>
}
