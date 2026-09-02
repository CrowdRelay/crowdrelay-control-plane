import { For, Show, Suspense } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'
import { SkeletonRows } from '../components/Skeleton'
import type { RuntimeHealth, TenantSummary } from '../lib/types'

const healthTone = (health: RuntimeHealth) => health === 'healthy' ? 'good' : health === 'degraded' ? 'bad' : health === 'stale' ? 'warn' : 'muted'
const healthLabel = (health: RuntimeHealth) => health === 'healthy' ? 'healthy' : health === 'degraded' ? 'degraded' : health === 'stale' ? 'stale' : 'unknown'

// Index only. Attention is a tenant subpage with its own read model, so this
// page deliberately does not fetch a snapshot per row: one request lists the
// tenants, and the snapshot is loaded by the subpage the operator opens.
export function OperatorAttentionPage() {
  const tenants = useQuery(() => ({
    queryKey: ['tenants'],
    queryFn: api.tenants,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    reconcile: 'id',
  }))

  const items = () => tenants.data?.items ?? []
  const activeItems = () => items().filter((t: TenantSummary) => t.status === 'active')
  const needsAttention = (t: TenantSummary) => t.runtimeHealth === 'degraded' || t.runtimeHealth === 'stale' || t.status === 'suspended'
  const attentionCount = () => activeItems().filter(needsAttention).length
  const healthyCount = () => activeItems().filter((t: TenantSummary) => t.runtimeHealth === 'healthy').length
  const suspendedCount = () => items().filter((t: TenantSummary) => t.status === 'suspended').length

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">OPERATIONS</span>
        <h1>Operator Attention</h1>
        <p>Tenant-scoped incidents, observability and bounded maintenance. Open a tenant to load its consolidated attention snapshot.</p>
      </div>
    </div>

    <Show when={tenants.error}><div class="error-card" role="alert">{tenants.error instanceof Error ? tenants.error.message : 'Tenant registry unavailable'}</div></Show>

    <Suspense fallback={<SkeletonRows count={4} />}>
    <Show when={tenants.data} fallback={!tenants.error ? <SkeletonRows count={4} /> : null}>
      <div class="kpi-strip">
        <article class="kpi-card">
          <span class="kpi-label">Active tenants</span>
          <strong class="kpi-value">{activeItems().length}</strong>
          <span class="kpi-sub">of {items().length} total</span>
        </article>
        <article class="kpi-card kpi-good">
          <span class="kpi-label">Healthy</span>
          <strong class="kpi-value">{healthyCount()}</strong>
          <span class="kpi-sub">runtime healthy</span>
        </article>
        <Link class="kpi-card" to="/attention" classList={{ 'kpi-warn': attentionCount() > 0, 'kpi-good': attentionCount() === 0 }}>
          <span class="kpi-label">Needs attention</span>
          <strong class="kpi-value">{attentionCount()}</strong>
          <span class="kpi-sub">degraded or stale</span>
        </Link>
        <article class="kpi-card" classList={{ 'kpi-bad': suspendedCount() > 0 }}>
          <span class="kpi-label">Suspended</span>
          <strong class="kpi-value">{suspendedCount()}</strong>
          <span class="kpi-sub">manually halted</span>
        </article>
      </div>

      <div class="section-title"><h2>Tenant registry</h2></div>
      <div class="tenant-list compact">
        <For each={items()}>{(tenant: TenantSummary) => (
          <Link to="/tenants/$slug/attention" params={{ slug: tenant.slug }} class="tenant-row">
            <div>
              <strong>{tenant.displayName}</strong>
              <small>{tenant.slug}</small>
            </div>
            <div class="row-health">
              <StatusBadge status={tenant.status} tone={tenant.status === 'active' ? 'good' : tenant.status === 'suspended' ? 'bad' : 'warn'} />
              <StatusBadge status={healthLabel(tenant.runtimeHealth)} tone={healthTone(tenant.runtimeHealth)} />
            </div>
          </Link>
        )}</For>
        <Show when={items().length === 0}>
          <EmptyState label="No tenants provisioned" hint="Create a tenant to start monitoring operational health." />
        </Show>
      </div>
    </Show>
    </Suspense>
  </section>
}
