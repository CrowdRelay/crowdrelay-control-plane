import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { OperationsPanel } from '../components/OperationsPanel'
import { GrowthPanel } from '../components/GrowthPanel'
import { GrowthMetricsPanel } from '../components/GrowthMetricsPanel'
import { GrowthObjectivesPanel } from '../components/GrowthObjectivesPanel'
import { OpportunityBoardPanel } from '../components/OpportunityBoardPanel'
import { ScorecardPanel } from '../components/ScorecardPanel'
import { ReplyTriagePanel } from '../components/ReplyTriagePanel'
import { OutreachPipelinePanel } from '../components/OutreachPipelinePanel'
import { BeaconSignalPanel } from '../components/BeaconSignalPanel'
import { PressRoomPanel } from '../components/PressRoomPanel'
import { ReleaseCampaignsPanel } from '../components/ReleaseCampaignsPanel'
import { PlayLedgerPanel } from '../components/PlayLedgerPanel'
import { CollapsibleSection } from '../components/CollapsibleSection'
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
    refetchInterval: 15_000,
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

    <Show when={!model.error && model.isPending}><div class="skeleton-block"/></Show>

    <Show when={model.data}>{<>
      {/* ─── Zone 1: KPI summary strip ─────────────────────────── */}
      <div class="ops-kpi-strip">
        <div class="ops-kpi-card" classList={{ 'tone-good': autopilot()?.runtime_enabled, 'tone-muted': !autopilot()?.runtime_enabled }}>
          <span class="ops-kpi-label">Autopilot</span>
          <strong>{autopilot()?.runtime_enabled ? 'on' : 'off'}</strong>
          <small>{autopilot()?.queued_actions ?? 0} queued</small>
        </div>
        <div class="ops-kpi-card">
          <span class="ops-kpi-label">Opportunities</span>
          <strong>{metric(opCount())}</strong>
          <small>awaiting decision</small>
        </div>
        <div class="ops-kpi-card" classList={{ 'tone-warn': deadJobs() > 0 }}>
          <span class="ops-kpi-label">Health</span>
          <strong>{healthLabel()}</strong>
          <small>{deadJobs() > 0 ? `${deadJobs()} dead` : `${summary()?.http.p95_ms ?? 0}ms p95`}</small>
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
        <div class="ops-kpi-card">
          <span class="ops-kpi-label">Autopilot 24h</span>
          <strong>{metric(autopilot()?.succeeded_24h)}</strong>
          <small class={autopilot() && autopilot()!.failed_24h > 0 ? 'tone-bad' : ''}>{autopilot() ? `${autopilot()!.failed_24h} failed` : '—'}</small>
        </div>
      </div>

      {/* ─── Zone 2: Primary panels (always visible) ────────────── */}
      <OpportunityBoardPanel
        slug={params().slug}
        opportunities={d()?.opportunities ?? null}
        degraded={d()?.degraded.includes('opportunities') ?? false}
        refresh={refresh}
      />
      <ReplyTriagePanel />
      <OperationsPanel
        slug={params().slug}
        summary={d()?.summary ?? null}
        flags={d()?.flags ?? null}
        autopilot={d()?.autopilot ?? null}
        degraded={d()?.degraded ?? []}
        refresh={refresh}
      />

      {/* ─── Zone 3: BRAIN — decision intelligence subsystems ── */}
      <div class="brain-section">
        <div class="brain-header">
          <span class="eyebrow">BRAIN</span>
          <h2>Decision intelligence and operational subsystems</h2>
        </div>

        <div class="brain-group">
          <span class="brain-group-label">Scorecard</span>
          <CollapsibleSection eyebrow="SCORECARD" title="Agent scorecard" badge="detail">
            <ScorecardPanel />
          </CollapsibleSection>
        </div>

        <div class="brain-group">
          <span class="brain-group-label">Growth</span>
          <CollapsibleSection eyebrow="GROWTH" title="Growth delivery" badge={growth()?.totals.pending ? `${growth()!.totals.pending} pending` : 'idle'}>
            <GrowthPanel growth={d()?.growth ?? null} degraded={d()?.degraded.includes('growth') ?? false} />
          </CollapsibleSection>
          <CollapsibleSection eyebrow="METRICS" title="Growth metrics">
            <GrowthMetricsPanel slug={params().slug} />
          </CollapsibleSection>
          <CollapsibleSection eyebrow="OBJECTIVES" title="Growth objectives">
            <GrowthObjectivesPanel slug={params().slug} />
          </CollapsibleSection>
        </div>

        <div class="brain-group">
          <span class="brain-group-label">Outreach</span>
          <CollapsibleSection eyebrow="OUTREACH" title="Outreach pipeline">
            <OutreachPipelinePanel slug={params().slug} />
          </CollapsibleSection>
        </div>

        <div class="brain-group">
          <span class="brain-group-label">Signals</span>
          <CollapsibleSection eyebrow="BEACON" title="Beacon signals">
            <BeaconSignalPanel slug={params().slug} />
          </CollapsibleSection>
        </div>

        <div class="brain-group">
          <span class="brain-group-label">Communications</span>
          <CollapsibleSection eyebrow="PRESS" title="Press room">
            <PressRoomPanel slug={params().slug} />
          </CollapsibleSection>
        </div>

        <div class="brain-group">
          <span class="brain-group-label">Releases</span>
          <CollapsibleSection eyebrow="RELEASES" title="Release campaigns">
            <ReleaseCampaignsPanel slug={params().slug} />
          </CollapsibleSection>
        </div>

        <div class="brain-group">
          <span class="brain-group-label">Ledger</span>
          <CollapsibleSection eyebrow="LEDGER" title="Play ledger">
            <PlayLedgerPanel slug={params().slug} />
          </CollapsibleSection>
        </div>
      </div>
    </>}</Show>
  </section>
}
