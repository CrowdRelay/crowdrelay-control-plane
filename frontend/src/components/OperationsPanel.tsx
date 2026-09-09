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

  return <article class="panel operations-panel">
    <Show when={showHealth()}>
    <div class="section-title operations-title">
      <div><span class="eyebrow">OPERATIONS</span><h2><SectionIcon name="activity" />Health & controls</h2><p>Live CrowdRelay telemetry and bounded runtime controls. Changes are tenant-scoped and audited.</p></div>
      <div class="row-health">
        <Show when={props.canRedeploy !== false}>
          <Show when={confirming() === 'redeploy'}><button class="ghost" onClick={() => setConfirming(null)}>Cancel</button></Show>
          <button disabled={pendingMutation() !== null} onClick={() => setConfirming('redeploy')}>{pendingMutation() === 'redeploy' && <Spinner />} {confirming() === 'redeploy' ? 'Confirm below ↓' : 'Redeploy app'}</button>
        </Show>
        <StatusBadge status={operationalLabel(summary.data)} tone={operationalTone(summary.data)} />
      </div>
    </div>

    <Show when={confirming() ? confirmCopy(confirming(), deadJobs()) : null} keyed>{copy =>
      <div class="warning-card confirm-card" role="alertdialog" aria-label={copy.title}>
        <strong>{copy.title}</strong>
        <span>{copy.body}</span>
        <div class="row-health">
          <button class="ghost" onClick={() => setConfirming(null)}>Cancel</button>
          <button class={confirming()?.startsWith('autopilot-disable') || confirming() === 'replay-dead' ? 'danger-ghost' : ''} disabled={pendingMutation() !== null}
            onClick={() => {
              const which = confirming()
              setConfirming(null)
              if (which === 'autopilot-disable') void bulkAutopilot(false)
              else if (which === 'autopilot-enable') void bulkAutopilot(true)
              else if (which === 'redeploy') void redeploy()
              else if (which === 'replay-dead') void replayDead()
            }}
          >{pendingMutation() !== null && <Spinner />} {copy.action}</button>
        </div>
      </div>
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
    <Show when={mutationError()}>{message => <div class="error-card operations-error" role="alert">{message()}</div>}</Show>

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

    <div class="operations-metrics">
      <div><span>HTTP p95</span><strong>{metric(summary.data?.http.p95_ms, ' ms')}</strong><small>p50 {metric(summary.data?.http.p50_ms, ' ms')}</small></div>
      <div><span>Outbox pending</span><strong>{metric(summary.data?.outbox.pending)}</strong><small>{summary.data ? `${summary.data.outbox.processing} processing` : '—'}</small></div>
      <div><span>Delivery pending</span><strong>{metric(summary.data?.deliveries.pending)}</strong><small>{summary.data ? `${summary.data.deliveries.dead} dead` : '—'}</small></div>
      <div><span>Push pending</span><strong>{metric(summary.data?.push.pending)}</strong><small>{summary.data ? `${summary.data.push.dead} dead` : '—'}</small></div>
      <div><span>Oldest queue</span><strong>{summary.data ? seconds(oldestQueueAge(summary.data)) : '—'}</strong><small>across async queues</small></div>
      <div><span>Watchdog</span><strong>{metric(summary.data?.watchdog.active_alerts)}</strong><small>{summary.data ? `${summary.data.watchdog.critical_alerts} critical` : '—'}</small></div>
    </div>

    <Show when={summary.data && (deadJobs() > 0 || summary.data.watchdog.critical_alerts > 0)}>
      <div class="operations-attention">
        <div><strong>Operator attention required</strong><br /><span>{deadJobs()} dead queue item(s) · {summary.data?.watchdog.critical_alerts ?? 0} critical watchdog alert(s)</span></div>
        <Show when={confirming() === 'replay-dead'}>
          <div class="row-health"><button class="ghost" onClick={() => setConfirming(null)}>Cancel</button><button disabled={pendingMutation() !== null} onClick={() => { setConfirming(null); void replayDead() }}>{pendingMutation() === 'replay-dead' && <Spinner />} Confirm replay</button></div>
        </Show>
        <Show when={confirming() !== 'replay-dead' && summary.data && summary.data.deliveries.dead > 0}>
          <button class="ghost" disabled={pendingMutation() !== null} onClick={() => setConfirming('replay-dead')}>Replay dead deliveries</button>
        </Show>
      </div>
    </Show>
    </Show>
  </article>
}
