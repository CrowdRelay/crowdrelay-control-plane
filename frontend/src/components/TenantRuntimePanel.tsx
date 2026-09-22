import { Show } from 'solid-js'
import { KpiCard, KpiStrip, Section } from './layout'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { formatTimestamp } from '../lib/format'
import type { TenantRuntimeSnapshot } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { SectionIcon } from './SectionIcon'
import { healthLabel, healthTone as runtimeHealthTone } from '../lib/health-tone'


// A runtime fact the operator can act on: a name in their vocabulary, an answer
// in words, and colour only where the answer is bad. `undefined` is "the tenant
// did not report this", which is not the same as `false` and must not read like it.
const healthWord = (value: boolean | null | undefined, good: string, bad: string) =>
  value == null ? 'No report' : value ? good : bad

const healthTone = (value: boolean | null | undefined): 'good' | 'bad' | undefined =>
  value == null ? undefined : value ? 'good' : 'bad'

// One fact on the shared rail. These were six bordered boxes at a smaller
// type scale than every other strip on the page.
function RuntimeFact(props: { label: string; value: string; tone?: 'good' | 'warn' | 'bad'; title?: string }) {
  return <KpiCard label={props.label} value={<span title={props.title}>{props.value}</span>} tone={props.tone} />
}

export function TenantRuntimePanel(props: { slug: string; initial?: TenantRuntimeSnapshot }) {
  // This query is deliberately owned by the smallest live surface. The tenant
  // page itself must never subscribe to the runtime tick: forms, scroll,
  // provisioning controls and configuration stay mounted while telemetry changes.
  // Refetching is driven by the global refresh tick, not a hardcoded interval.
  // `initial` is optional: pages that already carry a snapshot (the tenant
  // overview) pass it so the first tick lands 15s out; pages without one
  // (Health) omit it so the query fetches on mount.
  const runtime = useQuery(() => ({
    queryKey: ['tenant-runtime', props.slug],
    queryFn: () => api.tenantRuntime(props.slug),
    initialData: props.initial,
    initialDataUpdatedAt: props.initial ? Date.now() : undefined,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    // Patch the snapshot in place. Solid Query replaces the whole result by
    // default, which rebuilt this panel's DOM on every 15s tick.
    reconcile: 'tenantId',
  }))
  const snapshot = () => runtime.data ?? props.initial ?? { runtime: null, runtimeHealth: 'unknown' as const }

  // Every measured field absent means the tenant has not reported, whatever
  // timestamp the check itself carries.
  const neverReported = () => {
    const r = snapshot().runtime
    return !r || (r.apiHealthy == null && r.workerHealthy == null && r.schemaVersion == null && r.deployedSha == null && r.outboxPending == null)
  }

  {/* Named for its source. Plain "Health" read as a contradiction next to
      the Today page, which reports CrowdRelay's own HTTP health from a
      different feed: this one is the heartbeat the tenant pushes here. */}
  return <Section
    flush
    title="Heartbeat"
    icon={<SectionIcon name="heartbeat" />}
    description="What the tenant's own runtime last reported about itself."
    action={<StatusBadge status={healthLabel(snapshot().runtimeHealth)} tone={runtimeHealthTone(snapshot().runtimeHealth)} />}
    aria-busy={runtime.isFetching && !runtime.data}
  >
    <Show when={runtime.error}><p class="text-sm text-muted-foreground" role="status">Live refresh failed. Showing the last known runtime snapshot.</p></Show>
    <Show when={snapshot().runtimeHealth === 'unknown'}>
      <p class="text-sm text-muted-foreground">This tenant has never reported a runtime heartbeat, so there is nothing to score here yet. Service health measured inside CrowdRelay is on the Today page.</p>
    </Show>
    <Show when={snapshot().runtimeHealth === 'stale'}>
      <p class="text-sm text-muted-foreground">Live data has stopped updating. Optional products and app-store distribution do not affect this status.</p>
    </Show>
    {/* This grid printed `String(apiHealthy)` — the words "true", "false" and
        "unknown" — under headings named after the code that produced them
        ("Deploy SHA", "Schema", "Outbox pending"). Six cells, none of which
        told the person reading them whether anything was wrong. Same six
        facts, named for what they mean and answered in words. */}
    <KpiStrip class="mt-3 mb-0" min="9rem">
      <RuntimeFact label="Fan-facing API" value={healthWord(snapshot().runtime?.apiHealthy, 'Answering', 'Not answering')} tone={healthTone(snapshot().runtime?.apiHealthy)} />
      <RuntimeFact label="Background jobs" value={healthWord(snapshot().runtime?.workerHealthy, 'Running', 'Stopped')} tone={healthTone(snapshot().runtime?.workerHealthy)} />
      <RuntimeFact label="Database version" value={snapshot().runtime?.schemaVersion != null ? String(snapshot().runtime!.schemaVersion) : 'No report'} />
      <RuntimeFact
        label="Running build"
        value={snapshot().runtime?.deployedSha?.slice(0, 8) ?? 'No report'}
        title={snapshot().runtime?.deployedSha ?? undefined}
      />
      <RuntimeFact
        label="Events waiting to send"
        value={snapshot().runtime?.outboxPending != null ? String(snapshot().runtime!.outboxPending) : 'No report'}
        tone={(snapshot().runtime?.outboxPending ?? 0) > 0 ? 'warn' : undefined}
      />
      {/* The runtime endpoint fills `lastHeartbeatAt` with the time it ran the
          check, not with a heartbeat, so a tenant that has never reported one
          showed a timestamp from seconds ago under "Last report" — directly
          under the sentence saying it has never reported. When nothing else in
          the snapshot came back, that timestamp is our clock, not theirs. */}
      <RuntimeFact label="Last report" value={neverReported() ? 'Never' : formatTimestamp(snapshot().runtime?.lastHeartbeatAt)} />
    </KpiStrip>
  </Section>
}
