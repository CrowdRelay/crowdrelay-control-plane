import { For, Match, Show, Switch } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { api } from '../lib/api'
import type { PlatformHealthEntry, RuntimeHealth, TenantSummary } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'

const healthTone = (health: RuntimeHealth) => health === 'healthy' ? 'good' : health === 'degraded' ? 'bad' : health === 'stale' ? 'warn' : 'muted'
const healthLabel = (health: RuntimeHealth) => health === 'healthy' ? 'runtime healthy' : health === 'degraded' ? 'runtime degraded' : health === 'stale' ? 'runtime stale' : 'runtime unknown'

export function OverviewPage() {
  const tenants = useQuery(() => ({ queryKey: ['tenants'], queryFn: api.tenants, refetchInterval: 30_000 }))
  const overview = useQuery(() => ({ queryKey: ['overview'], queryFn: api.overview, refetchInterval: 30_000 }))
  const count = (health: RuntimeHealth) => (tenants.data?.items ?? []).filter((item: TenantSummary) => item.runtimeHealth === health).length
  return <section class="page">
    <div class="page-head"><div><span class="eyebrow">PLATFORM STATUS</span><h1>Everything that runs CrowdRelay.</h1><p>Tenant provisioning, runtime health, deployment state and platform audit — separated from band operations.</p></div></div>
    <Switch>
      <Match when={tenants.isPending}><div class="skeleton-grid"><div/><div/><div/></div></Match>
      <Match when={tenants.isError}><div class="error-card">{tenants.error?.message}</div></Match>
      <Match when={tenants.data}><div class="metric-grid">
        <article class="metric"><span>Tenants</span><strong>{tenants.data!.items.length}</strong></article>
        <article class="metric"><span>Healthy</span><strong>{count('healthy')}</strong></article>
        {/* The platform-wide attention index is reached from the metric it
            summarises; tenant-scoped attention lives on the tenant subnav. */}
        <Link class="metric" to="/attention"><span>Needs attention</span><strong>{count('degraded') + count('stale')}</strong></Link>
      </div></Match>
    </Switch>
    <Show when={overview.data?.platformHealth && overview.data.platformHealth.length > 0}>
      <div class="section-title"><h2>Platform services</h2></div>
      <div class="tenant-list compact"><For each={overview.data!.platformHealth}>{(svc: PlatformHealthEntry) => <div class="tenant-row">
        <div><strong>{svc.label}</strong><small>{svc.url}</small></div>
        <div class="row-health">
          <StatusBadge status={svc.healthy ? 'healthy' : 'down'} tone={svc.healthy ? 'good' : 'bad'} />
          <Show when={svc.latencyMs != null}><small>{svc.latencyMs}ms</small></Show>
        </div>
      </div>}</For></div>
    </Show>
    <div class="section-title"><h2>Tenant pulse</h2><Link to="/tenants">Manage tenants →</Link></div>
    <div class="tenant-list compact"><For each={tenants.data?.items ?? []}>{tenant => <Link to="/tenants/$slug" params={{ slug: tenant.slug }} class="tenant-row">
      <div><strong>{tenant.displayName}</strong><small>{tenant.slug}</small></div>
      <div class="row-health"><StatusBadge status={tenant.status} tone={tenant.status === 'active' ? 'good' : tenant.status === 'suspended' ? 'bad' : 'warn'} /><StatusBadge status={healthLabel(tenant.runtimeHealth)} tone={healthTone(tenant.runtimeHealth)} /></div>
    </Link>}</For></div>
  </section>
}
