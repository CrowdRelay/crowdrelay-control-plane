import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { formatTimestamp } from '../lib/format'
import type { RuntimeHealth, TenantRuntimeSnapshot } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { SectionIcon } from './SectionIcon'
import { Card } from './ui/card'

const runtimeTone = (health: RuntimeHealth) => health === 'healthy' ? 'good' : health === 'degraded' ? 'bad' : health === 'stale' ? 'warn' : 'muted'

export function TenantRuntimePanel(props: { slug: string; initial: TenantRuntimeSnapshot }) {
  // This query is deliberately owned by the smallest live surface. The tenant
  // page itself must never subscribe to the runtime tick: forms, scroll,
  // provisioning controls and configuration stay mounted while telemetry changes.
  // Refetching is driven by the global refresh tick, not a hardcoded interval.
  const runtime = useQuery(() => ({
    queryKey: ['tenant-runtime', props.slug],
    queryFn: () => api.tenantRuntime(props.slug),
    initialData: props.initial,
    // The subpage read model already carried this snapshot, so the first tick
    // is 15s from mount rather than an immediate second request on page load.
    initialDataUpdatedAt: Date.now(),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    // Patch the snapshot in place. Solid Query replaces the whole result by
    // default, which rebuilt this panel's DOM on every 15s tick.
    reconcile: 'tenantId',
  }))
  const snapshot = () => runtime.data ?? props.initial

  return <Card class="p-4 runtime-panel" aria-busy={runtime.isFetching && !runtime.data}>
    <div class="flex items-center justify-between gap-4 mt-6 mb-3">
      {/* Named for its source. Plain "Health" read as a contradiction next to
          the Operations page, which reports CrowdRelay's own HTTP health from
          a different feed: this one is the heartbeat the tenant pushes here. */}
      <div><span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">RUNTIME</span><h2><SectionIcon name="heartbeat" />Heartbeat</h2></div>
      <StatusBadge status={snapshot().runtimeHealth} tone={runtimeTone(snapshot().runtimeHealth)} />
    </div>
    <Show when={runtime.error}><div class="inline-stale-note" role="status">Live refresh failed. Showing the last known runtime snapshot.</div></Show>
    <Show when={snapshot().runtimeHealth === 'unknown'}>
      <p class="runtime-unknown-note">This tenant has never reported a runtime heartbeat, so there is nothing to score here yet. Service health measured inside CrowdRelay is on the Operations page.</p>
    </Show>
    <Show when={snapshot().runtimeHealth === 'stale'}>
      <p class="runtime-unknown-note">The runtime reporter has stopped sending fresh telemetry. Optional products and app-store distribution do not affect this status.</p>
    </Show>
    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
      <div class="rounded-lg border border-border bg-card p-3 flex flex-col gap-1">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">API</span>
        <span class="text-sm font-medium text-foreground">{String(snapshot().runtime?.apiHealthy ?? 'unknown')}</span>
      </div>
      <div class="rounded-lg border border-border bg-card p-3 flex flex-col gap-1">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Worker</span>
        <span class="text-sm font-medium text-foreground">{String(snapshot().runtime?.workerHealthy ?? 'unknown')}</span>
      </div>
      <div class="rounded-lg border border-border bg-card p-3 flex flex-col gap-1">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Schema</span>
        <span class="text-sm font-medium text-foreground">{snapshot().runtime?.schemaVersion ?? '—'}</span>
      </div>
      <div class="rounded-lg border border-border bg-card p-3 flex flex-col gap-1">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Deploy SHA</span>
        <span class="text-sm font-mono text-foreground">{snapshot().runtime?.deployedSha?.slice(0, 12) ?? '—'}</span>
      </div>
      <div class="rounded-lg border border-border bg-card p-3 flex flex-col gap-1">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Outbox pending</span>
        <span class="text-sm font-medium text-foreground">{snapshot().runtime?.outboxPending ?? '—'}</span>
      </div>
      <div class="rounded-lg border border-border bg-card p-3 flex flex-col gap-1">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Heartbeat</span>
        <span class="text-sm font-medium text-foreground">{formatTimestamp(snapshot().runtime?.lastHeartbeatAt)}</span>
      </div>
    </div>
  </Card>
}
