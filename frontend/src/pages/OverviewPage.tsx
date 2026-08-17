import { For, Match, Switch } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { StatusBadge } from '../components/StatusBadge'

export function OverviewPage() {
  const tenants = useQuery(() => ({ queryKey: ['tenants'], queryFn: api.tenants, refetchInterval: 30_000 }))
  const healthy = () => (tenants.data?.items ?? []).filter(item => item.runtime?.apiHealthy === true && item.runtime?.workerHealthy === true).length
  const degraded = () => (tenants.data?.items ?? []).filter(item => item.runtime?.apiHealthy === false || item.runtime?.workerHealthy === false).length
  return <section class="page">
    <div class="page-head"><div><span class="eyebrow">PLATFORM STATUS</span><h1>Everything that runs CrowdRelay.</h1><p>Tenant provisioning, runtime health, deployment state and platform audit — separated from band operations.</p></div></div>
    <Switch>
      <Match when={tenants.isPending}><div class="skeleton-grid"><div/><div/><div/></div></Match>
      <Match when={tenants.isError}><div class="error-card">{tenants.error?.message}</div></Match>
      <Match when={tenants.data}><div class="metric-grid">
        <article class="metric"><span>Tenants</span><strong>{tenants.data!.items.length}</strong></article>
        <article class="metric"><span>Healthy</span><strong>{healthy()}</strong></article>
        <article class="metric"><span>Degraded</span><strong>{degraded()}</strong></article>
      </div></Match>
    </Switch>
    <div class="section-title"><h2>Tenant pulse</h2><Link to="/tenants">Manage tenants →</Link></div>
    <div class="tenant-list compact"><For each={tenants.data?.items ?? []}>{tenant => <Link to="/tenants/$slug" params={{ slug: tenant.slug }} class="tenant-row">
      <div><strong>{tenant.displayName}</strong><small>{tenant.slug}</small></div>
      <div class="row-health"><StatusBadge status={tenant.status} tone={tenant.status === 'active' ? 'good' : tenant.status === 'suspended' ? 'bad' : 'warn'} /><StatusBadge status={tenant.runtime?.apiHealthy === true ? 'API healthy' : tenant.runtime?.apiHealthy === false ? 'API down' : 'API unknown'} tone={tenant.runtime?.apiHealthy === true ? 'good' : tenant.runtime?.apiHealthy === false ? 'bad' : 'muted'} /></div>
    </Link>}</For></div>
  </section>
}
