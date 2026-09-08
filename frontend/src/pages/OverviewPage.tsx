import { For, Match, Show, Switch, createMemo } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { authState } from '../lib/auth'
import type { CommandCenterReadModel, CommandCenterTenantSummary, PlatformHealthEntry, RuntimeHealth, TenantSummary } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { CountUp } from '../components/CountUp'
import { ProgressRing } from '../components/ProgressRing'
import { EmptyState } from '../components/EmptyState'
import { SectionIcon } from '../components/SectionIcon'

const healthTone = (health: RuntimeHealth) => health === 'healthy' ? 'good' : health === 'degraded' ? 'bad' : health === 'stale' ? 'warn' : 'muted'

const formatLatency = (ms: number | null | undefined) => {
  if (ms == null) return null
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function OverviewPage() {
  const tenants = useQuery(() => ({ queryKey: ['tenants'], queryFn: api.tenants, refetchOnWindowFocus: false, reconcile: 'id' }))
  const commandCenter = useQuery(() => ({ queryKey: ['command-center'], queryFn: api.commandCenter, refetchOnWindowFocus: false, staleTime: 10_000 }))

  const items = () => tenants.data?.items ?? []
  const count = (health: RuntimeHealth) => items().filter(t => t.runtimeHealth === health).length
  const activeCount = () => items().filter(t => t.status === 'active').length
  const needsAttention = () => count('degraded') + count('stale')
  const suspendedCount = () => items().filter(t => t.status === 'suspended').length
  const parkedCount = () => items().filter(t => t.status === 'parked').length
  const unknownCount = () => count('unknown')
  const reportingCount = () => items().length - unknownCount()
  const healthyPct = () => {
    const reporting = reportingCount()
    if (reporting === 0) return 0
    return Math.round((count('healthy') / reporting) * 100)
  }
  const fleetTone = () => reportingCount() === 0 ? 'muted' as const : undefined
  const lastRefresh = () => {
    const ts = Math.max(tenants.dataUpdatedAt, commandCenter.dataUpdatedAt)
    if (ts === 0) return null
    return new Date(ts).toLocaleTimeString()
  }

  const cc = (): CommandCenterReadModel | undefined => commandCenter.data
  // Platform health has one source on this page. It used to be read from
  // `/overview` while `/command-center` carried the same list in
  // `system.platformServices`, so the page paid for two requests and the two
  // copies could disagree for the width of a refresh.
  const platformServices = createMemo<PlatformHealthEntry[]>(() => cc()?.system.platformServices ?? [])
  const healthyServices = createMemo(() => platformServices().filter(service => service.healthy).length)
  const ccTenants = createMemo(() => cc()?.perTenant ?? [])

  // The first tenant with attention needs — the natural drill-down target
  // for the ATTENTION block when the operator wants to see the detail.
  const firstNeedsYouTenant = createMemo(() => ccTenants().find(t => t.attention.available && t.attention.needsYou > 0))
  const firstAutopilotTenant = createMemo(() => ccTenants().find(t => t.autopilot.available && (t.autopilot.queuedActions > 0 || t.autopilot.processingActions > 0)))
  const firstOutcomesTenant = createMemo(() => ccTenants().find(t => t.outcomes.available && (t.outcomes.unknown > 0 || t.outcomes.waitingForObservation > 0)))
  const firstLearningTenant = createMemo(() => ccTenants().find(t => t.learning.available && t.learning.totalOutcomes > 0))

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">COMMAND CENTER</span>
        <h1>Operations command center</h1>
        <p>The whole ecosystem at a glance — attention, autopilot, outcomes, system and learning signal across all tenants. Each block drills into the page that owns the detail.</p>
      </div>
      <Show when={lastRefresh()}><span class="muted page-head-meta">Last refresh {lastRefresh()}</span></Show>
    </div>

    {/* ── Command blocks ─────────────────────────────────────────── */}
    <Switch>
      <Match when={commandCenter.isError}>
        <div class="error-card" role="alert">{errorMessage(commandCenter.error, 'Command center unavailable')}</div>
      </Match>
      <Match when={!cc()}>
        <div class="command-center-grid">
          {Array.from({ length: 5 }, () => (
            <div class="command-block skeleton-block" style={{ 'min-height': '120px', 'border-radius': 'var(--radius-lg)' }} />
          ))}
        </div>
      </Match>
      <Match when={cc()}>
        <div class="command-center-grid">
          {/* ATTENTION */}
          <Link
            class="command-block"
            to={firstNeedsYouTenant() ? '/tenants/$slug/attention' : '/attention'}
            params={firstNeedsYouTenant() ? { slug: firstNeedsYouTenant()!.slug } : {}}
            classList={{ 'command-block-warn': (cc()!.attention.needsYou + cc()!.attention.awaitingApproval + cc()!.attention.criticalAlerts) > 0 }}
          >
            <div class="command-block-head">
              <span class="eyebrow">ATTENTION</span>
              <Show when={cc()!.attention.unavailableTenants > 0}>
                <span class="command-block-unavailable">{cc()!.attention.unavailableTenants} unavailable</span>
              </Show>
            </div>
            <div class="command-block-body">
              <div class="command-block-metric">
                <CountUp value={cc()!.attention.needsYou} />
                <span class="command-block-label">need you</span>
              </div>
              <div class="command-block-detail">
                <Show when={cc()!.attention.awaitingApproval > 0}><span>{cc()!.attention.awaitingApproval} awaiting approval</span></Show>
                <Show when={cc()!.attention.criticalAlerts > 0}><span class="command-block-critical">{cc()!.attention.criticalAlerts} critical alerts</span></Show>
                <Show when={cc()!.attention.openFindings > 0}><span>{cc()!.attention.openFindings} open findings</span></Show>
                <Show when={cc()!.attention.deadDeliveries > 0}><span>{cc()!.attention.deadDeliveries} dead deliveries</span></Show>
                <Show when={cc()!.brainNeedsAttention}><span class="command-block-critical">brain needs attention</span></Show>
                <Show when={cc()!.attention.needsYou === 0 && cc()!.attention.awaitingApproval === 0 && cc()!.attention.criticalAlerts === 0}>
                  <span class="muted">Nothing needs you right now</span>
                </Show>
              </div>
            </div>
          </Link>

          {/* AUTOPILOT TODAY */}
          <Link
            class="command-block"
            to={firstAutopilotTenant() ? '/tenants/$slug/intelligence' : '/attention'}
            params={firstAutopilotTenant() ? { slug: firstAutopilotTenant()!.slug } : {}}
            classList={{ 'command-block-active': (cc()!.autopilot.queuedActions + cc()!.autopilot.processingActions) > 0 }}
          >
            <div class="command-block-head">
              <span class="eyebrow">AUTOPILOT TODAY</span>
            </div>
            <div class="command-block-body">
              <div class="command-block-metric">
                <CountUp value={cc()!.autopilot.queuedActions + cc()!.autopilot.processingActions} />
                <span class="command-block-label">in flight</span>
              </div>
              <div class="command-block-detail">
                <Show when={cc()!.autopilot.queuedActions > 0}><span>{cc()!.autopilot.queuedActions} queued</span></Show>
                <Show when={cc()!.autopilot.processingActions > 0}><span>{cc()!.autopilot.processingActions} processing</span></Show>
                <Show when={cc()!.autopilot.succeeded24h > 0}><span class="command-block-good">{cc()!.autopilot.succeeded24h} succeeded (24h)</span></Show>
                <Show when={cc()!.autopilot.failed24h > 0}><span class="command-block-critical">{cc()!.autopilot.failed24h} failed (24h)</span></Show>
                <Show when={cc()!.autopilot.unknownActions > 0}><span class="muted">{cc()!.autopilot.unknownActions} unknown</span></Show>
                <Show when={cc()!.autopilot.queuedActions === 0 && cc()!.autopilot.processingActions === 0}>
                  <span class="muted">No actions in flight</span>
                </Show>
              </div>
            </div>
          </Link>

          {/* OUTCOMES */}
          <Link
            class="command-block"
            to={firstOutcomesTenant() ? '/tenants/$slug/intelligence' : '/attention'}
            params={firstOutcomesTenant() ? { slug: firstOutcomesTenant()!.slug } : {}}
            classList={{ 'command-block-warn': cc()!.outcomes.unknown > 0 || cc()!.outcomes.waitingForObservation > 0 }}
          >
            <div class="command-block-head">
              <span class="eyebrow">OUTCOMES</span>
            </div>
            <div class="command-block-body">
              <div class="command-block-metric">
                <CountUp value={cc()!.outcomes.resolved} />
                <span class="command-block-label">resolved</span>
              </div>
              <div class="command-block-detail">
                <Show when={cc()!.outcomes.waitingForObservation > 0}><span>{cc()!.outcomes.waitingForObservation} waiting for observation</span></Show>
                <Show when={cc()!.outcomes.unknown > 0}><span class="muted">{cc()!.outcomes.unknown} unknown</span></Show>
                <Show when={cc()!.outcomes.resolved === 0 && cc()!.outcomes.unknown === 0 && cc()!.outcomes.waitingForObservation === 0}>
                  <span class="muted">No outcomes yet</span>
                </Show>
              </div>
            </div>
          </Link>

          {/* SYSTEM */}
          <Link class="command-block" to="/attention">
            <div class="command-block-head">
              <span class="eyebrow">SYSTEM</span>
            </div>
            <div class="command-block-body">
              <div class="command-block-metric">
                <CountUp value={healthyServices()} format={(n) => platformServices().length === 0 ? '—' : String(Math.round(n))} />
                <span class="command-block-label">of {platformServices().length || '—'} services healthy</span>
              </div>
              <div class="command-block-detail">
                <Show when={items().length > 0}>
                  <span>{count('healthy')} healthy · {needsAttention()} need attention<Show when={unknownCount() > 0}> · {unknownCount()} not reporting</Show></span>
                </Show>
              </div>
            </div>
          </Link>

          {/* LEARNING */}
          <Link
            class="command-block"
            to={firstLearningTenant() ? '/tenants/$slug/intelligence' : '/attention'}
            params={firstLearningTenant() ? { slug: firstLearningTenant()!.slug } : {}}
          >
            <div class="command-block-head">
              <span class="eyebrow">LEARNING</span>
            </div>
            <div class="command-block-body">
              <div class="command-block-metric">
                <CountUp value={cc()!.learning.totalOutcomes} />
                <span class="command-block-label">total outcomes</span>
              </div>
              <div class="command-block-detail">
                <Show when={cc()!.learning.admitted > 0}><span class="command-block-good">{cc()!.learning.admitted} admitted</span></Show>
                <Show when={cc()!.learning.rejected > 0}><span>{cc()!.learning.rejected} rejected</span></Show>
                <Show when={cc()!.learning.totalOutcomes === 0}>
                  <span class="muted">No learning outcomes yet</span>
                </Show>
              </div>
            </div>
          </Link>
        </div>
      </Match>
    </Switch>

    {/* ── KPI strip (fleet summary) ──────────────────────────────── */}
    <Switch>
      <Match when={!tenants.data && !tenants.isError}><div class="skeleton-grid"><div/><div/><div/><div/></div></Match>
      <Match when={tenants.isError}><div class="error-card" role="alert">{errorMessage(tenants.error, 'Tenant registry unavailable')}</div></Match>
      <Match when={tenants.data}>
        <div class="kpi-strip">
          <article class="kpi-card">
            <span class="kpi-label">Tenants</span>
            <CountUp value={items().length} />
            <span class="kpi-sub">{activeCount()} active<Show when={parkedCount() > 0}> · {parkedCount()} parked</Show><Show when={suspendedCount() > 0}> · {suspendedCount()} suspended</Show></span>
          </article>
          <article class="kpi-card" classList={{ 'kpi-good': count('healthy') > 0 }}>
            <span class="kpi-label">Healthy</span>
            <CountUp value={count('healthy')} />
            <span class="kpi-sub">
              <Show when={reportingCount() > 0} fallback="no runtime reports yet">
                {healthyPct()}% of reporting
              </Show>
            </span>
          </article>
          <Link class="kpi-card" to="/attention" classList={{ 'kpi-warn': needsAttention() > 0, 'kpi-good': needsAttention() === 0 && reportingCount() > 0 }}>
            <span class="kpi-label">Needs attention</span>
            <CountUp value={needsAttention()} />
            <span class="kpi-sub">
              {count('degraded')} degraded · {count('stale')} stale
              <Show when={unknownCount() > 0}> · {unknownCount()} not reporting</Show>
            </span>
          </Link>
          <article class="kpi-card">
            <span class="kpi-label">Platform services</span>
            <CountUp value={healthyServices()} format={(n) => platformServices().length === 0 ? '—' : String(Math.round(n))} />
            <span class="kpi-sub">of {platformServices().length || '—'} monitored</span>
          </article>
        </div>
      </Match>
    </Switch>

    {/* Fleet health ring + Tenant pulse — the fleet at a glance, first */}
    <div class="section-title">
      <div><span class="eyebrow">PULSE</span><h2><SectionIcon name="heartbeat" />Tenant pulse</h2></div>
      <Show when={authState.profile()?.role === 'platform_admin'}><Link to="/tenants" class="section-link">Manage tenants →</Link></Show>
    </div>
    <Show when={items().length > 0}>
      <div class="fleet-health-row">
        <div class="fleet-health-ring">
          <ProgressRing value={healthyPct()} size={72} strokeWidth={6} tone={fleetTone()} showValue={reportingCount() > 0} />
        </div>
        <div class="fleet-health-stats">
          <strong>
            {count('healthy')} healthy · {needsAttention()} need attention
            <Show when={unknownCount() > 0}> · {unknownCount()} not reporting</Show>
            {' '}· {items().length} total
          </strong>
          <Show when={reportingCount() === 0}>
            <span class="muted">No tenant has sent a runtime heartbeat yet, so there is nothing to score.</span>
          </Show>
        </div>
      </div>
    </Show>
    <div class="tenant-pulse-list">
      <For each={items()}>{tenant => (
        <Link to="/tenants/$slug" params={{ slug: tenant.slug }} class="tenant-pulse-row">
          <div class="tenant-pulse-row-left">
            <span class={`tenant-pulse-dot ${healthTone(tenant.runtimeHealth)}`} />
            <strong>{tenant.displayName}</strong>
            <span class="muted">{tenant.slug}</span>
          </div>
          <div class="tenant-pulse-row-right">
            <StatusBadge status={tenant.runtimeHealth} tone={healthTone(tenant.runtimeHealth)} />
            <StatusBadge status={tenant.status} tone={tenant.status === 'active' ? 'good' : tenant.status === 'suspended' ? 'bad' : tenant.status === 'parked' ? 'warn' : 'warn'} />
          </div>
        </Link>
      )}</For>
      <Show when={items().length === 0}>
        <EmptyState label="No tenants provisioned" hint="Create your first tenant to start managing fan growth operations." />
      </Show>
    </div>

    {/* Platform services — reference, moved below the fleet so the operator's
        own tenants are the first thing they see. */}
    <Show when={platformServices().length > 0}>
      <div class="section-title"><div><span class="eyebrow">SERVICES</span><h2><SectionIcon name="server" />Platform services</h2></div></div>
      <div class="service-grid">
        <For each={platformServices()}>{(svc: PlatformHealthEntry) => (
          <div class="service-card" classList={{ healthy: svc.healthy, unhealthy: !svc.healthy }}>
            <div class="service-card-head">
              <span class={`service-dot ${svc.healthy ? 'good' : 'bad'}`} />
              <strong>{svc.label}</strong>
            </div>
            <div class="service-card-meta">
              <Show when={formatLatency(svc.latencyMs)}>{lat => <span>{lat()}</span>}</Show>
              <Show when={!svc.healthy && svc.lastStatus}><span class="muted">{svc.lastStatus}</span></Show>
              <span class="muted">{svc.url.replace(/^https?:\/\//, '')}</span>
            </div>
          </div>
        )}</For>
      </div>
    </Show>
  </section>
}
