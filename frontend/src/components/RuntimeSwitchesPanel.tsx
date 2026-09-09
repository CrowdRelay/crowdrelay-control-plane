import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { FeatureFlag, OperationsSummary } from '../lib/types'
import { errorMessage, formatAge, oldestQueueAge } from '../lib/format'
import { operationalTone, operationalLabel } from '../lib/health-tone'
import { useOperationsMutations } from '../lib/operations-mutations'
import { toast } from '../lib/toast'
import { StatusBadge } from './StatusBadge'
import { SkeletonFlagList } from './Skeleton'
import { SectionIcon } from './SectionIcon'
import { Spinner } from './Spinner'
import { SectionFailureCard } from './SectionFailureCard'

const flagLabel = (key: string) => key
  .replace(/_enabled$/, '')
  .split('_')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ')

// Every switch on the page read "lazy default" underneath it — the store's
// word for a flag nobody has ever set, printed raw. Say that instead.
const flagReason = (flag: FeatureFlag) => flag.reason === 'lazy default'
  ? `Never changed · shipped default · v${flag.version}`
  : flag.reason || `v${flag.version} · no reason recorded`

const metric = (value: number | undefined, suffix = '') => value == null ? '—' : `${value.toLocaleString()}${suffix}`

const seconds = (value: number) => value <= 0 ? '—' : formatAge(value)

// Runtime Switches tab — feature flags, health metrics, redeploy.
// Owns its own useQuery so it loads independently of the Policies tab.
// The summary (health metrics) comes from the parent read model; flags
// come from a dedicated endpoint so the tab does not wait for the full
// operations fan-out.
export function RuntimeSwitchesPanel(props: {
  slug: string
  summary: OperationsSummary | null | undefined
  refresh: () => Promise<unknown>
  canRedeploy?: boolean
}) {
  const flags = useQuery(() => ({
    queryKey: ['feature-flags', props.slug],
    queryFn: () => api.featureFlags(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const { pendingMutation, mutationError, mutate, redeploy, replayDead, confirmCopy } =
    useOperationsMutations(props.slug, props.refresh)
  const [flagOverrides, setFlagOverrides] = createSignal<Record<string, boolean>>({})

  const updateFlag = (flag: FeatureFlag) => {
    setFlagOverrides(prev => ({ ...prev, [flag.key]: !flag.enabled }))
    mutate(
      `flag:${flag.key}`,
      () => api.setFeatureFlag(props.slug, flag, !flag.enabled),
      () => flags.refetch(),
    ).finally(() => {
      setFlagOverrides(prev => {
        const next = { ...prev }
        delete next[flag.key]
        return next
      })
    })
  }

  const flagEnabled = (flag: FeatureFlag): boolean => {
    const override = flagOverrides()[flag.key]
    return override !== undefined ? override : flag.enabled
  }

  const deadJobs = () => props.summary ? props.summary.outbox.dead + props.summary.deliveries.dead + props.summary.push.dead : 0

  const [confirming, setConfirming] = createSignal<'redeploy' | 'replay-dead' | null>(null)

  return <article class="panel operations-panel">
    <div class="section-title operations-title">
      <div><span class="eyebrow">OPERATIONS</span><h2><SectionIcon name="activity" />Runtime switches</h2><p>Feature flags, health metrics and redeploy. Changes are tenant-scoped and audited.</p></div>
      <div class="row-health">
        <Show when={props.canRedeploy !== false}>
          <Show when={confirming() === 'redeploy'}><button class="ghost" onClick={() => setConfirming(null)}>Cancel</button></Show>
          <button disabled={pendingMutation() !== null} onClick={() => setConfirming('redeploy')}>{pendingMutation() === 'redeploy' && <Spinner />} {confirming() === 'redeploy' ? 'Confirm below ↓' : 'Redeploy app'}</button>
        </Show>
        <StatusBadge status={operationalLabel(props.summary ?? undefined)} tone={operationalTone(props.summary ?? undefined)} />
      </div>
    </div>

    <Show when={confirming() ? confirmCopy(confirming(), deadJobs()) : null} keyed>{copy =>
      <div class="warning-card confirm-card" role="alertdialog" aria-label={copy.title}>
        <strong>{copy.title}</strong>
        <span>{copy.body}</span>
        <div class="row-health">
          <button class="ghost" onClick={() => setConfirming(null)}>Cancel</button>
          <button class={confirming() === 'replay-dead' ? 'danger-ghost' : ''} disabled={pendingMutation() !== null}
            onClick={() => {
              const which = confirming()
              setConfirming(null)
              if (which === 'redeploy') void redeploy()
              else if (which === 'replay-dead') void replayDead()
            }}
          >{pendingMutation() !== null && <Spinner />} {copy.action}</button>
        </div>
      </div>
    }</Show>

    <Show when={mutationError()}>{message => <div class="error-card operations-error" role="alert">{message()}</div>}</Show>

    <div class="operations-metrics">
      <div><span>HTTP p95</span><strong>{metric(props.summary?.http.p95_ms, ' ms')}</strong><small>p50 {metric(props.summary?.http.p50_ms, ' ms')}</small></div>
      <div><span>Outbox pending</span><strong>{metric(props.summary?.outbox.pending)}</strong><small>{props.summary ? `${props.summary.outbox.processing} processing` : '—'}</small></div>
      <div><span>Delivery pending</span><strong>{metric(props.summary?.deliveries.pending)}</strong><small>{props.summary ? `${props.summary.deliveries.dead} dead` : '—'}</small></div>
      <div><span>Push pending</span><strong>{metric(props.summary?.push.pending)}</strong><small>{props.summary ? `${props.summary.push.dead} dead` : '—'}</small></div>
      <div><span>Oldest queue</span><strong>{props.summary ? seconds(oldestQueueAge(props.summary)) : '—'}</strong><small>across async queues</small></div>
      <div><span>Watchdog</span><strong>{metric(props.summary?.watchdog.active_alerts)}</strong><small>{props.summary ? `${props.summary.watchdog.critical_alerts} critical` : '—'}</small></div>
    </div>

    <Show when={props.summary && (deadJobs() > 0 || props.summary.watchdog.critical_alerts > 0)}>
      <div class="operations-attention">
        <div><strong>Operator attention required</strong><br /><span>{deadJobs()} dead queue item(s) · {props.summary?.watchdog.critical_alerts ?? 0} critical watchdog alert(s)</span></div>
        <Show when={confirming() === 'replay-dead'}>
          <div class="row-health"><button class="ghost" onClick={() => setConfirming(null)}>Cancel</button><button disabled={pendingMutation() !== null} onClick={() => { setConfirming(null); void replayDead() }}>{pendingMutation() === 'replay-dead' && <Spinner />} Confirm replay</button></div>
        </Show>
        <Show when={confirming() !== 'replay-dead' && props.summary && props.summary.deliveries.dead > 0}>
          <button class="ghost" disabled={pendingMutation() !== null} onClick={() => setConfirming('replay-dead')}>Replay dead deliveries</button>
        </Show>
      </div>
    </Show>

    <section class="operations-section">
      <details open>
        <summary class="operations-section-head"><div><span class="eyebrow">FEATURES</span><h3><SectionIcon name="settings" />Runtime switches</h3></div><small>{flags.data?.length ?? 0} declared</small></summary>
        <Show when={flags.data} fallback={
          <Show when={flags.error} fallback={<SkeletonFlagList />}>
            <SectionFailureCard error={flags.error} fallback="Feature flags unavailable" onRetry={() => void flags.refetch()} />
          </Show>
        }>{items => <div class="flag-list">
          <For each={items()}>{flag => <div class="flag-row">
            <div><strong>{flagLabel(flag.key)}</strong><small>{flagReason(flag)}</small></div>
            <button
              type="button"
              class={`switch-control ${flagEnabled(flag) ? 'on' : ''}`}
              role="switch"
              aria-checked={flagEnabled(flag)}
              aria-label={`${flagLabel(flag.key)} ${flagEnabled(flag) ? 'enabled' : 'disabled'}`}
              disabled={pendingMutation() !== null}
              onClick={() => updateFlag(flag)}
            ><span /></button>
          </div>}</For>
        </div>}</Show>
      </details>
    </section>
  </article>
}
