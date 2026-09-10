import { For, Show, createSignal } from 'solid-js'
import { api } from '../lib/api'
import type { AutopilotOverview, FeatureFlag, FreshnessClassification, OperationsSummary, SectionFreshnessMap, SectionState, SectionVerdicts } from '../lib/types'
import { errorMessage, formatAge, formatTimestamp, oldestQueueAge } from '../lib/format'
import { operationalTone, operationalLabel } from '../lib/health-tone'
import { useOperationsMutations } from '../lib/operations-mutations'
import { toast } from '../lib/toast'
import { StatusBadge } from './StatusBadge'
import { SectionIcon } from './SectionIcon'
import { Spinner } from './Spinner'
import { Card } from './ui/card'
import { Alert } from './ui/alert'
import { Button } from './ui/button'

const seconds = (value: number) => value <= 0 ? '—' : formatAge(value)

// The badge used to say "controls will recover automatically" for every kind
// of gap. That is only true for a timeout or an unreachable tenant. A refused
// credential and a shape this contract no longer accepts do not recover on
// their own, and one of them means the numbers on this page cannot be trusted
// at all — so each class gets its own sentence.
const SECTION_STATE_COPY: Record<SectionState, string> = {
  ok: 'served',
  timeout: 'timed out — retrying may clear it',
  unreachable: 'tenant did not answer — check the runtime and its tunnel',
  upstream_error: 'tenant returned an error of its own — check its logs',
  unauthorized: 'tenant refused the Control Plane credential — re-run the management bootstrap',
  absent: 'not served by this tenant build',
  rejected: 'tenant rejected the request — Control Plane bug',
  contract_mismatch: 'answered in an unrecognised shape — treat these numbers as unknown',
}

// contract_mismatch is the one class that means "stop trusting this page",
// so it is called out rather than blended into the list.
const UNTRUSTWORTHY: readonly SectionState[] = ['contract_mismatch']

// Freshness classification → operator-facing label and tone. The Control
// Plane distinguishes "live" (upstream timestamp within stale threshold)
// from "stale" (upstream timestamp older than threshold) from "unknown"
// (no upstream timestamp — the Control Plane assembled this now but cannot
// vouch for the fact's recency) from "assembled" (came from the Control
// Plane database, not a live fan-out). The UI must not call a response
// "fresh" merely because the HTTP request just completed.
const FRESHNESS_LABEL: Record<FreshnessClassification, string> = {
  live: 'live',
  stale: 'stale',
  unknown: 'recency unknown',
  assembled: 'assembled',
}
const FRESHNESS_TONE: Record<FreshnessClassification, 'good' | 'warn' | 'muted'> = {
  live: 'good',
  stale: 'warn',
  unknown: 'warn',
  assembled: 'muted',
}
const freshnessAge = (observedAt: string | null): string => {
  if (!observedAt) return ''
  const age = (Date.now() - new Date(observedAt).getTime()) / 1000
  return ` · observed ${formatAge(age)}`
}

const metric = (value: number | undefined, suffix = '') => value == null ? '—' : `${value.toLocaleString()}${suffix}`

export function OperationsPanel(props: {
  slug: string
  summary: OperationsSummary | null | undefined
  flags: FeatureFlag[] | null | undefined
  autopilot: AutopilotOverview | null | undefined
  degraded: readonly string[]
  // Per-section verdicts from the read model. Optional so a cached payload
  // from before this field existed still renders rather than crashing.
  sections?: SectionVerdicts
  // Per-section fact freshness. Optional for the same backward-compat reason.
  // When present, the panel renders a freshness badge so the operator can
  // distinguish "live" from "stale" from "recency unknown" — the HTTP
  // request completing does not mean the underlying facts are current.
  freshness?: SectionFreshnessMap
  fetchedAt?: string
  refresh: () => Promise<unknown>
  mode?: 'full' | 'health'
  canRedeploy?: boolean
}) {
  // The Operations subpage owns the one read-model request. This panel renders
  // its health metrics and control sections and keeps each section's degraded
  // state local, so a failed Autopilot read cannot blank the queue metrics
  // beside it. Mutations stay on their own routes and refresh the model.
  const degradedSection = (name: string) => props.degraded.includes(name)
  const summary = {
    get data() { return props.summary ?? undefined },
    get error() { return degradedSection('summary') },
  }
  const flags = {
    get data() { return props.flags ?? undefined },
    get error() { return degradedSection('flags') },
    refetch: () => props.refresh(),
  }
  const autopilot = {
    get data() { return props.autopilot ?? undefined },
    get error() { return degradedSection('autopilot') },
    refetch: () => props.refresh(),
  }
  const { pendingMutation, mutationError, mutate, redeploy, replayDead, bulkAutopilot, confirmCopy } =
    useOperationsMutations(props.slug, props.refresh)

  const unavailable = () => summary.error || flags.error || autopilot.error
  // Name each missing section and why. Falls back to the old wording only
  // when the server did not send verdicts.
  const degradedReasons = () => props.degraded.map((name) => {
    const state = props.sections?.[name]?.state
    return { name, state, copy: state ? SECTION_STATE_COPY[state] : 'unavailable' }
  })
  const untrusted = () => degradedReasons().some((entry) => entry.state !== undefined && UNTRUSTWORTHY.includes(entry.state))
  // The worst freshness across all sections — drives the summary badge. If
  // any section is stale or unknown, the operator needs to see that without
  // inspecting each section individually. "live" and "assembled" are the
  // default and don't need a visible badge.
  const worstFreshness = (): FreshnessClassification | null => {
    const map = props.freshness
    if (!map) return null
    let worst: FreshnessClassification | null = null
    const rank: Record<FreshnessClassification, number> = { live: 0, assembled: 0, unknown: 1, stale: 2 }
    for (const key of Object.keys(map)) {
      const f = map[key]
      if (!f) continue
      if (worst === null || rank[f.classification] > rank[worst]) worst = f.classification
    }
    return worst
  }
  const staleSections = () => {
    const map = props.freshness
    if (!map) return []
    return Object.entries(map).filter(([, f]) => f && (f.classification === 'stale' || f.classification === 'unknown'))
      .map(([name, f]) => ({ name, classification: f!.classification, observedAt: f!.observedAt }))
  }
  const deadJobs = () => summary.data ? summary.data.outbox.dead + summary.data.deliveries.dead + summary.data.push.dead : 0
  const showHealth = () => !props.mode || props.mode === 'full' || props.mode === 'health'

  // Destructive/blast-radius actions share one inline confirmation so a
  // mis-click never flips every policy or redeploys an app by accident.
  const [confirming, setConfirming] = createSignal<'autopilot-disable' | 'autopilot-enable' | 'redeploy' | 'replay-dead' | null>(null)

  return <Card class="p-5 operations-panel">
    <Show when={showHealth()}>
    <div class="flex items-start justify-between gap-4 mt-6 mb-3">
      <div><span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">OPERATIONS</span><h2 class="mt-1 text-lg font-bold text-foreground flex items-center gap-2"><SectionIcon name="activity" />Health & controls</h2><p class="mt-1 text-sm text-muted-foreground leading-relaxed max-w-prose">Live CrowdRelay telemetry and bounded runtime controls. Changes are tenant-scoped and audited.</p></div>
      <div class="flex items-center gap-2 flex-wrap">
        <Show when={props.canRedeploy !== false}>
          <Show when={confirming() === 'redeploy'}><Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>Cancel</Button></Show>
          <Button size="sm" disabled={pendingMutation() !== null} onClick={() => setConfirming('redeploy')}>{pendingMutation() === 'redeploy' && <Spinner />} {confirming() === 'redeploy' ? 'Confirm below ↓' : 'Redeploy app'}</Button>
        </Show>
        <StatusBadge status={operationalLabel(summary.data)} tone={operationalTone(summary.data)} />
      </div>
    </div>

    <Show when={confirming() ? confirmCopy(confirming(), deadJobs()) : null} keyed>{copy =>
      <Alert tone="warning" class="confirm-card" role="alertdialog" aria-label={copy.title}>
        <strong>{copy.title}</strong>
        <span>{copy.body}</span>
        <div class="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>Cancel</Button>
          <Button variant={confirming()?.startsWith('autopilot-disable') || confirming() === 'replay-dead' ? 'destructive-ghost' : 'default'} size="sm" disabled={pendingMutation() !== null}
            onClick={() => {
              const which = confirming()
              setConfirming(null)
              if (which === 'autopilot-disable') void bulkAutopilot(false)
              else if (which === 'autopilot-enable') void bulkAutopilot(true)
              else if (which === 'redeploy') void redeploy()
              else if (which === 'replay-dead') void replayDead()
            }}
          >{pendingMutation() !== null && <Spinner />} {copy.action}</Button>
        </div>
      </Alert>
    }</Show>

    <Show when={unavailable() || props.degraded.length > 0}>
      <div class="ops-degraded-badge" role={untrusted() ? 'alert' : 'status'}>
        <span class="ops-degraded-dot" />
        <span>
          <Show
            when={degradedReasons().length > 0}
            fallback="Operational channel partially unavailable"
          >
            <For each={degradedReasons()}>{entry =>
              <span class="ops-degraded-reason"><strong>{entry.name}</strong>: {entry.copy}</span>
            }</For>
          </Show>
        </span>
      </div>
    </Show>
    <Show when={mutationError()}>{message => <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive operations-error" role="alert">{message()}</div>}</Show>

    {/* Freshness — the Control Plane distinguishes "live" (upstream timestamp
        within stale threshold) from "stale" from "unknown" (no upstream
        timestamp). The UI must not call a response "fresh" merely because
        the HTTP request just completed. Only show the badge when at least
        one section is stale or unknown; "live" and "assembled" are the
        default and don't need a visible badge. */}
    <Show when={worstFreshness() && worstFreshness() !== 'live' && worstFreshness() !== 'assembled'}>
      <div class={`ops-freshness-badge tone-${FRESHNESS_TONE[worstFreshness()!]}`} role="status">
        <span class="ops-freshness-dot" />
        <span>
          <Show when={staleSections().length > 0} fallback={`Data ${FRESHNESS_LABEL[worstFreshness()!]}`}>
            <For each={staleSections()}>{entry =>
              <span class="ops-freshness-reason">
                <strong>{entry.name}</strong>: {FRESHNESS_LABEL[entry.classification]}{freshnessAge(entry.observedAt)}
              </span>
            }</For>
          </Show>
        </span>
        <Show when={props.fetchedAt}>
          {ts => <small class="ops-freshness-fetched">assembled {formatTimestamp(ts())}</small>}
        </Show>
      </div>
    </Show>

    <div class="grid gap-2.5">
      <div><span class="block text-muted-foreground text-sm">HTTP p95</span><strong class="block my-1.5 text-foreground">{metric(summary.data?.http.p95_ms, ' ms')}</strong><small class="block text-muted-foreground text-sm">p50 {metric(summary.data?.http.p50_ms, ' ms')}</small></div>
      <div><span class="block text-muted-foreground text-sm">Outbox pending</span><strong class="block my-1.5 text-foreground">{metric(summary.data?.outbox.pending)}</strong><small class="block text-muted-foreground text-sm">{summary.data ? `${summary.data.outbox.processing} processing` : '—'}</small></div>
      <div><span class="block text-muted-foreground text-sm">Delivery pending</span><strong class="block my-1.5 text-foreground">{metric(summary.data?.deliveries.pending)}</strong><small class="block text-muted-foreground text-sm">{summary.data ? `${summary.data.deliveries.dead} dead` : '—'}</small></div>
      <div><span class="block text-muted-foreground text-sm">Push pending</span><strong class="block my-1.5 text-foreground">{metric(summary.data?.push.pending)}</strong><small class="block text-muted-foreground text-sm">{summary.data ? `${summary.data.push.dead} dead` : '—'}</small></div>
      <div><span class="block text-muted-foreground text-sm">Oldest queue</span><strong class="block my-1.5 text-foreground">{summary.data ? seconds(oldestQueueAge(summary.data)) : '—'}</strong><small class="block text-muted-foreground text-sm">across async queues</small></div>
      <div><span class="block text-muted-foreground text-sm">Watchdog</span><strong class="block my-1.5 text-foreground">{metric(summary.data?.watchdog.active_alerts)}</strong><small class="block text-muted-foreground text-sm">{summary.data ? `${summary.data.watchdog.critical_alerts} critical` : '—'}</small></div>
    </div>

    <Show when={summary.data && (deadJobs() > 0 || summary.data.watchdog.critical_alerts > 0)}>
      <div class="rounded-md border border-destructive/30 bg-destructive/10 p-3 flex items-center justify-between gap-3 flex-wrap mt-4">
        <div><strong class="text-destructive">Operator attention required</strong><br /><span class="text-sm text-secondary-foreground">{deadJobs()} dead queue item(s) · {summary.data?.watchdog.critical_alerts ?? 0} critical watchdog alert(s)</span></div>
        <Show when={confirming() === 'replay-dead'}>
          <div class="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>Cancel</Button><Button size="sm" disabled={pendingMutation() !== null} onClick={() => { setConfirming(null); void replayDead() }}>{pendingMutation() === 'replay-dead' && <Spinner />} Confirm replay</Button></div>
        </Show>
        <Show when={confirming() !== 'replay-dead' && summary.data && summary.data.deliveries.dead > 0}>
          <Button variant="ghost" size="sm" disabled={pendingMutation() !== null} onClick={() => setConfirming('replay-dead')}>Replay dead deliveries</Button>
        </Show>
      </div>
    </Show>
    </Show>
  </Card>
}
