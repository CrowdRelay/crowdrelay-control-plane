import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { StatusBadge } from '../components/StatusBadge'

// Index only. Attention is a tenant subpage with its own read model, so this
// page deliberately does not fetch a snapshot per row: one request lists the
// tenants, and the snapshot is loaded by the subpage the operator opens.
export function OperatorAttentionPage() {
  const tenants = useQuery(() => ({
    queryKey: ['tenants'],
    queryFn: api.tenants,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  }))

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">OPERATIONS</span>
        <h1>Operator Attention</h1>
        <p>Tenant-scoped incidents, observability and bounded maintenance. Open a tenant to load its consolidated attention snapshot.</p>
      </div>
    </div>
    <Show when={tenants.error}><div class="error-card" role="alert">{tenants.error instanceof Error ? tenants.error.message : 'Tenant registry unavailable'}</div></Show>
    <Show when={tenants.data} fallback={!tenants.error ? <div class="skeleton-block"/> : null}>{data => <div class="tenant-list compact">
      <For each={data().items.filter((tenant) => tenant.status === 'active')}>
        {tenant => <Link to="/tenants/$slug/attention" params={{ slug: tenant.slug }} class="tenant-row">
          <div><strong>{tenant.displayName}</strong><small>{tenant.slug}</small></div>
          <div class="row-health"><StatusBadge status="open attention" tone="muted" /></div>
        </Link>}
      </For>
    </div>}</Show>
  </section>
}
