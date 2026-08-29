import { For, Show, createEffect, createSignal } from 'solid-js'
import { api } from '../lib/api'
import type { AutopilotOverview, AutopilotPolicy, AutonomyLevel, FeatureFlag, OperationsSummary } from '../lib/types'
import { errorMessage, formatAge, oldestQueueAge } from '../lib/format'
import { StatusBadge } from './StatusBadge'

const flagLabel = (key: string) => key
  .replace(/_enabled$/, '')
  .split('_')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ')

const contextLabel = (context: string) => context
  .split('_')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ')

const seconds = (value: number) => value <= 0 ? '—' : formatAge(value)

const metric = (value: number | undefined, suffix = '') => value == null ? '—' : `${value.toLocaleString()}${suffix}`

const operationalTone = (summary: OperationsSummary | undefined): 'good'|'warn'|'bad'|'muted' => {
  if (!summary) return 'muted'
  const dead = summary.outbox.dead + summary.deliveries.dead + summary.push.dead
  if (summary.watchdog.critical_alerts > 0 || dead > 0) return 'bad'
  if (summary.watchdog.active_alerts > 0 || summary.http.p95_ms > 1000 || oldestQueueAge(summary) > 300) return 'warn'
  return 'good'
}

const operationalLabel = (summary: OperationsSummary | undefined) => {
  const tone = operationalTone(summary)
  return tone === 'good' ? 'healthy' : tone === 'warn' ? 'attention' : tone === 'bad' ? 'degraded' : 'loading'
}

function PolicyEditor(props: {
  policy: AutopilotPolicy
  pending: boolean
  onSave: (input: Pick<AutopilotPolicy, 'enabled'|'autonomy_level'|'minimum_confidence'|'max_actions_24h'>) => Promise<void>
}) {
  const [enabled, setEnabled] = createSignal(props.policy.enabled)
  const [level, setLevel] = createSignal<AutonomyLevel>(props.policy.autonomy_level)
  const [confidence, setConfidence] = createSignal(props.policy.minimum_confidence / 100)
  const [maxActions, setMaxActions] = createSignal(props.policy.max_actions_24h)

  createEffect(() => {
    const policy = props.policy
    setEnabled(policy.enabled)
    setLevel(policy.autonomy_level)
    setConfidence(policy.minimum_confidence / 100)
    setMaxActions(policy.max_actions_24h)
  })

  const confidenceBasisPoints = () => Math.round(Math.max(0, Math.min(100, confidence())) * 100)
  const valid = () => Number.isFinite(confidence()) && confidence() >= 0 && confidence() <= 100 && Number.isInteger(maxActions()) && maxActions() >= 1 && maxActions() <= 1000
  const dirty = () => enabled() !== props.policy.enabled
    || level() !== props.policy.autonomy_level
    || confidenceBasisPoints() !== props.policy.minimum_confidence
    || maxActions() !== props.policy.max_actions_24h
  const guarded = () => props.policy.guarded_until && new Date(props.policy.guarded_until).getTime() > Date.now()

  return <div class="autopilot-policy-row">
    <div class="policy-name">
      <div class="row-health">
        <strong>{contextLabel(props.policy.context)}</strong>
        <Show when={guarded()}><StatusBadge status="guarded" tone="warn" /></Show>
      </div>
      <small>v{props.policy.version}{props.policy.guardrail_reason ? ` · ${props.policy.guardrail_reason}` : ''}</small>
    </div>
    <label class="compact-field policy-enabled">
      <span>Enabled</span>
      <button
        type="button"
        class={`switch-control ${enabled() ? 'on' : ''}`}
        role="switch"
        aria-checked={enabled()}
        aria-label={`${contextLabel(props.policy.context)} enabled`}
        disabled={props.pending}
        onClick={() => setEnabled((current) => !current)}
      ><span /></button>
    </label>
    <label class="compact-field">
      <span>Mode</span>
      <select disabled={props.pending} value={level()} onChange={(event) => setLevel(event.currentTarget.value as AutonomyLevel)}>
        <option value="observe">Observe</option>
        <option value="recommend">Recommend</option>
        <option value="require_approval">Require approval</option>
        <option value="bounded_auto">Bounded auto</option>
      </select>
    </label>
    <label class="compact-field confidence-field">
      <div class="confidence-field-head">
        <span>Min confidence</span>
        <strong>{Math.round(confidence())}%</strong>
      </div>

      <input
        class="confidence-slider"
        disabled={props.pending}
        type="range"
        min="0"
        max="100"
        step="1"
        value={confidence()}
        onInput={(event) => setConfidence(event.currentTarget.valueAsNumber)}
        aria-label={`${contextLabel(props.policy.context)} minimum confidence`}
      />
    </label>
    <label class="compact-field policy-number">
      <span>Max / 24h</span>
      <input disabled={props.pending} type="number" min="1" max="1000" step="1" value={maxActions()} onInput={(event) => setMaxActions(event.currentTarget.valueAsNumber)} />
    </label>
    <button
      class="ghost policy-save"
      disabled={!dirty() || !valid() || props.pending}
      onClick={() => props.onSave({
        enabled: enabled(),
        autonomy_level: level(),
        minimum_confidence: confidenceBasisPoints(),
        max_actions_24h: maxActions(),
      })}
    >{props.pending ? 'Saving…' : 'Apply'}</button>
  </div>
}

export function OperationsPanel(props: {
  slug: string
  summary: OperationsSummary | null | undefined
  flags: FeatureFlag[] | null | undefined
  autopilot: AutopilotOverview | null | undefined
  degraded: readonly string[]
  refresh: () => Promise<unknown>
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
  const [pendingMutation, setPendingMutation] = createSignal<string | null>(null)
  const [mutationError, setMutationError] = createSignal<string | null>(null)

  const mutate = async (key: string, operation: () => Promise<unknown>, refresh: () => Promise<unknown>) => {
    setMutationError(null)
    setPendingMutation(key)
    try {
      await operation()
      await refresh()
    } catch (error) {
      setMutationError(errorMessage(error, 'Tenant operation failed'))
    } finally {
      setPendingMutation(null)
    }
  }

  const updateFlag = (flag: FeatureFlag) => mutate(
    `flag:${flag.key}`,
    () => api.setFeatureFlag(props.slug, flag, !flag.enabled),
    () => flags.refetch(),
  )

  const updatePolicy = (policy: AutopilotPolicy, input: Pick<AutopilotPolicy, 'enabled'|'autonomy_level'|'minimum_confidence'|'max_actions_24h'>) => mutate(
    `policy:${policy.context}`,
    () => api.setAutopilotPolicy(props.slug, policy, input),
    () => autopilot.refetch(),
  )

  const unavailable = () => summary.error || flags.error || autopilot.error
  const deadJobs = () => summary.data ? summary.data.outbox.dead + summary.data.deliveries.dead + summary.data.push.dead : 0

  // Destructive/blast-radius actions share one inline confirmation so a
  // mis-click never flips every policy or redeploys an app by accident.
  const [confirming, setConfirming] = createSignal<'autopilot-disable' | 'autopilot-enable' | 'redeploy' | 'replay-dead' | null>(null)

  const bulkAutopilot = (enabled: boolean) => mutate(
    'autopilot-bulk',
    () => api.autopilotBulk(props.slug, enabled),
    () => flags.refetch(),
  )
  const redeploy = () => mutate('redeploy', () => api.deployTenant(props.slug), () => flags.refetch())
  const replayDead = () => mutate('replay-dead', () => api.clearDeadDeliveries(props.slug), () => flags.refetch())

  const confirmCopy = (): { title: string; body: string; action: string } | null => {
    switch (confirming()) {
      case 'autopilot-disable': return {
        title: 'Disable all Autopilot policies?',
        body: 'Every context stops acting immediately — full killswitch. Queued actions stay parked until you re-enable.',
        action: 'Disable everything',
      }
      case 'autopilot-enable': return {
        title: 'Enable all Autopilot policies?',
        body: 'Every context resumes at its saved autonomy level, confidence threshold and daily cap.',
        action: 'Enable everything',
      }
      case 'redeploy': return {
        title: 'Redeploy this app now?',
        body: 'Queues a fresh deployment job for the pinned release. The provisioner agent runs it; the current stack keeps serving until switchover.',
        action: 'Queue redeploy',
      }
      case 'replay-dead': return {
        title: 'Replay dead deliveries?',
        body: `Asks CrowdRelay to redeliver ${deadJobs()} dead queue item(s). Failed items land back in the dead queue if the root cause persists.`,
        action: 'Replay dead items',
      }
      default: return null
    }
  }

  return <article class="panel operations-panel">
    <div class="section-title operations-title">
      <div><span class="eyebrow">OPERATIONS</span><h2>Health & controls</h2><p>Live CrowdRelay telemetry and bounded runtime controls. Changes are tenant-scoped and audited.</p></div>
      <div class="row-health">
        <Show when={confirming() === 'redeploy'}><button class="ghost" onClick={() => setConfirming(null)}>Cancel</button></Show>
        <button disabled={pendingMutation() !== null} onClick={() => setConfirming('redeploy')}>{confirming() === 'redeploy' ? 'Confirm below ↓' : 'Redeploy app'}</button>
        <StatusBadge status={operationalLabel(summary.data)} tone={operationalTone(summary.data)} />
      </div>
    </div>

    <Show when={confirming() ? confirmCopy() : null} keyed>{copy =>
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
            }}>{copy.action}</button>
        </div>
      </div>
    }</Show>

    <Show when={unavailable()}>
      <div class="ops-degraded-badge" role="status">
        <span class="ops-degraded-dot" />
        Operational channel partially unavailable — controls will recover automatically
      </div>
    </Show>
    <Show when={mutationError()}>{message => <div class="error-card operations-error" role="alert">{message()}</div>}</Show>

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
        <div><strong>Operator attention required</strong><span>{deadJobs()} dead queue item(s) · {summary.data?.watchdog.critical_alerts ?? 0} critical watchdog alert(s)</span></div>
        <Show when={confirming() === 'replay-dead'}>
          <div class="row-health"><button class="ghost" onClick={() => setConfirming(null)}>Cancel</button><button disabled={pendingMutation() !== null} onClick={() => { setConfirming(null); void replayDead() }}>Confirm replay</button></div>
        </Show>
        <Show when={confirming() !== 'replay-dead' && summary.data && summary.data.deliveries.dead > 0}>
          <button class="ghost" disabled={pendingMutation() !== null} onClick={() => setConfirming('replay-dead')}>Replay dead deliveries</button>
        </Show>
      </div>
    </Show>

    <div class="operations-split">
      <section class="operations-section">
        <details>
          <summary class="operations-section-head"><div><span class="eyebrow">FEATURES</span><h3>Runtime switches</h3></div><small>{flags.data?.length ?? 0} declared</small></summary>
        <Show when={flags.data} fallback={flags.error ? null : <div class="mini-skeleton"/>}>{items => <div class="flag-list">
          <For each={items()}>{flag => <div class="flag-row">
            <div><strong>{flagLabel(flag.key)}</strong><small>{flag.reason || `v${flag.version} · no override reason`}</small></div>
            <button
              type="button"
              class={`switch-control ${flag.enabled ? 'on' : ''}`}
              role="switch"
              aria-checked={flag.enabled}
              aria-label={`${flagLabel(flag.key)} ${flag.enabled ? 'enabled' : 'disabled'}`}
              disabled={pendingMutation() !== null}
              onClick={() => updateFlag(flag)}
            ><span /></button>
          </div>}</For>
        </div>}</Show>
        </details>
      </section>

      <section class="operations-section autopilot-section">
        <details>
          <summary class="operations-section-head">
            <div><span class="eyebrow">AUTOPILOT</span><h3>Authority policies</h3></div>
            <div class="row-health">
              <StatusBadge status={autopilot.data?.runtime_enabled ? 'runtime on' : 'runtime off'} tone={autopilot.data?.runtime_enabled ? 'good' : 'muted'} />
              {/* Killswitch / full-enable: one switch, one confirmation. */}
              <Show when={autopilot.data && autopilot.data.policies.length > 0}>
                <button
                  class={`ghost ${confirming()?.startsWith('autopilot') ? '' : 'danger-ghost'}`}
                  disabled={pendingMutation() !== null}
                  aria-label={confirming() === 'autopilot-disable' ? 'Cancel bulk action' : 'Toggle all Autopilot policies'}
                  onClick={(e) => { e.preventDefault(); setConfirming(confirming()?.startsWith('autopilot') ? null : (autopilot.data!.policies.some(policy => policy.enabled) ? 'autopilot-disable' : 'autopilot-enable')) }}
                >{confirming()?.startsWith('autopilot')
                  ? 'Cancel'
                  : autopilot.data!.policies.some(policy => policy.enabled) ? 'Kill switch: disable all' : 'Enable all'}</button>
              </Show>
            </div>
          </summary>
        <Show when={confirming()?.startsWith('autopilot')}><div class="warning-card confirm-card" role="alertdialog" aria-label="Bulk Autopilot change">
          <strong>{confirmCopy()!.title}</strong>
          <span>{confirmCopy()!.body}</span>
          <div class="row-health">
            <button class="ghost" onClick={() => setConfirming(null)}>Cancel</button>
            <button class={confirming() === 'autopilot-disable' ? 'danger-ghost' : ''} disabled={pendingMutation() !== null} onClick={() => { const enable = confirming() === 'autopilot-enable'; setConfirming(null); void bulkAutopilot(enable) }}>{confirmCopy()!.action}</button>
          </div>
        </div></Show>
        <Show when={autopilot.data} fallback={autopilot.error ? null : <div class="mini-skeleton"/>}>{data => <>
          <div class="autopilot-kpis">
            <div><strong>{data().needs_you.length}</strong><span>needs you</span></div>
            <div><strong>{data().queued_actions}</strong><span>queued</span></div>
            <div><strong>{data().failed_24h}</strong><span>failed 24h</span></div>
            <div><strong>{data().executor_failed_24h}</strong><span>executor fail</span></div>
          </div>
          <div class="autopilot-policy-list">
            <For each={data().policies}>{policy => <PolicyEditor
              policy={policy}
              pending={pendingMutation() !== null}
              onSave={(input) => updatePolicy(policy, input) as Promise<void>}
            />}</For>
          </div>
          <Show when={data().rum_metrics_24h.length > 0}>
            <div class="rum-grid">
              <For each={data().rum_metrics_24h.slice(0, 6)}>{rum => <div><strong>{contextLabel(rum.metric_key)}</strong><span>{rum.surface} · {rum.samples_24h} samples</span><small>p75 {rum.p75.toFixed(1)} · p95 {rum.p95.toFixed(1)}</small></div>}</For>
            </div>
          </Show>
        </>}</Show>
        </details>
      </section>
    </div>
  </article>
}
