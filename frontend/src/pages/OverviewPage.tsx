import { For, Match, Show, Switch, Suspense } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { refreshTick } from '../lib/refresh'
import type { PlatformHealthEntry, RuntimeHealth, TenantSummary } from '../lib/types'
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
  const tenants = useQuery(() => ({ queryKey: ['tenants', refreshTick()], queryFn: api.tenants, refetchOnWindowFocus: false, reconcile: 'id' }))
  const overview = useQuery(() => ({ queryKey: ['overview', refreshTick()], queryFn: api.overview, refetchOnWindowFocus: false, reconcile: 'id' }))

  const items = () => tenants.data?.items ?? []
  const count = (health: RuntimeHealth) => items().filter(t => t.runtimeHealth === health).length
  const activeCount = () => items().filter(t => t.status === 'active').length
  const needsAttention = () => count('degraded') + count('stale')
  const suspendedCount = () => items().filter(t => t.status === 'suspended').length
  // `unknown` is a real fourth state — a tenant that has never reported. It
  // used to be invisible: a fleet of one unknown tenant read as "0 healthy,
  // 0 degraded, 0 stale" behind a red 0% ring, which looks like an outage.
  const unknownCount = () => count('unknown')
  const reportingCount = () => items().length - unknownCount()
  const healthyPct = () => {
    // Percentage of tenants that actually report, so silence dilutes nothing.
    const reporting = reportingCount()
    if (reporting === 0) return 0
    return Math.round((count('healthy') / reporting) * 100)
  }
  const fleetTone = () => reportingCount() === 0 ? 'muted' as const : undefined

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">PLATFORM STATUS</span>
        <h1>Operations dashboard</h1>
        <p>Tenant provisioning, runtime health, deployment state and platform audit — separated from band operations.</p>
      </div>
    </div>

    {/* KPI strip — the first thing an operator sees. */}
    <Suspense fallback={<div class="skeleton-grid"><div/><div/><div/><div/></div>}>
    <Switch>
      <Match when={tenants.isPending}><div class="skeleton-grid"><div/><div/><div/><div/></div></Match>
      <Match when={tenants.isError}><div class="error-card">{tenants.error?.message}</div></Match>
      <Match when={tenants.data}>
        <div class="kpi-strip">
          <article class="kpi-card">
            <span class="kpi-label">Tenants</span>
            <CountUp value={items().length} />
            <span class="kpi-sub">{activeCount()} active<Show when={suspendedCount() > 0}> · {suspendedCount()} suspended</Show></span>
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
            <CountUp value={overview.data?.platformHealth?.filter(s => s.healthy).length ?? 0} format={(n) => Math.round(n) === 0 && !overview.data?.platformHealth?.length ? '—' : String(Math.round(n))} />
            <span class="kpi-sub">of {overview.data?.platformHealth?.length ?? '—'} monitored</span>
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
            <StatusBadge status={tenant.status} tone={tenant.status === 'active' ? 'good' : tenant.status === 'suspended' ? 'bad' : 'warn'} />
          </div>
        </Link>
      )}</For>
      <Show when={items().length === 0}>
        <EmptyState label="No tenants provisioned" hint="Create your first tenant to start managing fan growth operations." />
      </Show>
    </div>

    {/* Platform services — reference, moved below the fleet so the operator's
        own tenants are the first thing they see. */}
    <Show when={overview.data?.platformHealth && overview.data.platformHealth.length > 0}>
      <div class="section-title"><div><span class="eyebrow">SERVICES</span><h2><SectionIcon name="server" />Platform services</h2></div></div>
      <div class="service-grid">
        <For each={overview.data!.platformHealth}>{(svc: PlatformHealthEntry) => (
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
    </Suspense>
  </section>
}
