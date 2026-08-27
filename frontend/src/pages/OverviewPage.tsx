import { For, Match, Show, Switch } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { refreshInterval } from '../lib/refresh'
import type { PlatformHealthEntry, RuntimeHealth, TenantSummary } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'

const healthTone = (health: RuntimeHealth) => health === 'healthy' ? 'good' : health === 'degraded' ? 'bad' : health === 'stale' ? 'warn' : 'muted'
const healthLabel = (health: RuntimeHealth) => health === 'healthy' ? 'healthy' : health === 'degraded' ? 'degraded' : health === 'stale' ? 'stale' : 'unknown'

const formatLatency = (ms: number | null | undefined) => {
  if (ms == null) return null
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function OverviewPage() {
  const tenants = useQuery(() => ({ queryKey: ['tenants'], queryFn: api.tenants, refetchInterval: refreshInterval() || false, refetchOnWindowFocus: false, reconcile: 'id' }))
  const overview = useQuery(() => ({ queryKey: ['overview'], queryFn: api.overview, refetchInterval: refreshInterval() || false, refetchOnWindowFocus: false, reconcile: 'id' }))

  const items = () => tenants.data?.items ?? []
  const count = (health: RuntimeHealth) => items().filter(t => t.runtimeHealth === health).length
  const activeCount = () => items().filter(t => t.status === 'active').length
  const needsAttention = () => count('degraded') + count('stale')
  const suspendedCount = () => items().filter(t => t.status === 'suspended').length
  const healthyPct = () => {
    const total = items().length
    if (total === 0) return 0
    return Math.round((count('healthy') / total) * 100)
  }

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">PLATFORM STATUS</span>
        <h1>Operations dashboard</h1>
        <p>Tenant provisioning, runtime health, deployment state and platform audit — separated from band operations.</p>
      </div>
    </div>

    {/* KPI strip — the first thing an operator sees. */}
    <Switch>
      <Match when={tenants.isPending}><div class="skeleton-grid"><div/><div/><div/><div/></div></Match>
      <Match when={tenants.isError}><div class="error-card">{tenants.error?.message}</div></Match>
      <Match when={tenants.data}>
        <div class="kpi-strip">
          <article class="kpi-card">
            <span class="kpi-label">Tenants</span>
            <strong class="kpi-value">{items().length}</strong>
            <span class="kpi-sub">{activeCount()} active<Show when={suspendedCount() > 0}> · {suspendedCount()} suspended</Show></span>
          </article>
          <article class="kpi-card kpi-good">
            <span class="kpi-label">Healthy</span>
            <strong class="kpi-value">{count('healthy')}</strong>
            <span class="kpi-sub">{healthyPct()}% of fleet</span>
          </article>
          <Link class="kpi-card" to="/attention" classList={{ 'kpi-warn': needsAttention() > 0, 'kpi-good': needsAttention() === 0 }}>
            <span class="kpi-label">Needs attention</span>
            <strong class="kpi-value">{needsAttention()}</strong>
            <span class="kpi-sub">{count('degraded')} degraded · {count('stale')} stale</span>
          </Link>
          <article class="kpi-card">
            <span class="kpi-label">Platform services</span>
            <strong class="kpi-value">{overview.data?.platformHealth?.filter(s => s.healthy).length ?? '—'}</strong>
            <span class="kpi-sub">of {overview.data?.platformHealth?.length ?? '—'} monitored</span>
          </article>
        </div>
      </Match>
    </Switch>

    {/* Platform services — compact health table */}
    <Show when={overview.data?.platformHealth && overview.data.platformHealth.length > 0}>
      <div class="section-title"><h2>Platform services</h2></div>
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

    {/* Tenant pulse — the fleet at a glance */}
    <div class="section-title">
      <h2>Tenant pulse</h2>
      <Link to="/tenants" class="section-link">Manage tenants →</Link>
    </div>
    <div class="tenant-pulse-grid">
      <For each={items()}>{tenant => (
        <Link to="/tenants/$slug" params={{ slug: tenant.slug }} class="tenant-pulse-card">
          <div class="tenant-pulse-head">
            <span class={`tenant-pulse-dot ${healthTone(tenant.runtimeHealth)}`} />
            <strong>{tenant.displayName}</strong>
          </div>
          <div class="tenant-pulse-meta">
            <span class="muted">{tenant.slug}</span>
            <StatusBadge status={tenant.status} tone={tenant.status === 'active' ? 'good' : tenant.status === 'suspended' ? 'bad' : 'warn'} />
          </div>
        </Link>
      )}</For>
      <Show when={items().length === 0}>
        <div class="inherit-card"><p>No tenants provisioned yet.</p></div>
      </Show>
    </div>
  </section>
}
