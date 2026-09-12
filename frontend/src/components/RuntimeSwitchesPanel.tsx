import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { FeatureFlag, OperationsSummary } from '../lib/types'
import { errorMessage, formatAge, oldestQueueAge } from '../lib/format'
import { operationalTone, operationalLabel } from '../lib/health-tone'
import { useOperationsMutations } from '../lib/operations-mutations'
import { toast } from './ui/toast'
import { StatusBadge } from './StatusBadge'
import { SkeletonFlagList } from './Skeleton'
import { SectionIcon } from './SectionIcon'
import { Spinner } from './Spinner'
import { SectionFailureCard } from './SectionFailureCard'
import { ErrorCard, PanelTitle } from './layout'
import { Card } from './ui/card'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Switch } from './ui/switch'

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

  return <Card flat class="p-5">
    <div class="flex items-start justify-between gap-4 mb-3">
      <div><PanelTitle icon={<SectionIcon name="activity" />}>Runtime switches</PanelTitle><p class="mt-1 text-sm text-muted-foreground leading-relaxed">Feature flags, health metrics and redeploy. Changes are tenant-scoped and audited.</p></div>
      <div class="flex items-center gap-2 flex-wrap">
        <Show when={props.canRedeploy !== false}>
          <Show when={confirming() === 'redeploy'}><Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>Cancel</Button></Show>
          <Button writes size="sm" disabled={pendingMutation() !== null} onClick={() => setConfirming('redeploy')}>{pendingMutation() === 'redeploy' && <Spinner />} {confirming() === 'redeploy' ? 'Confirm below ↓' : 'Redeploy app'}</Button>
        </Show>
        <StatusBadge status={operationalLabel(props.summary ?? undefined)} tone={operationalTone(props.summary ?? undefined)} />
      </div>
    </div>

    <Show when={confirming() ? confirmCopy(confirming(), deadJobs()) : null} keyed>{copy =>
      <Alert tone="warning" class="mt-3" role="alertdialog" aria-label={copy.title}>
        <strong class="text-warning">{copy.title}</strong>
        <span class="block mt-1 text-sm text-secondary-foreground">{copy.body}</span>
        <div class="flex items-center gap-2 mt-3">
          <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>Cancel</Button>
          <Button writes variant={confirming() === 'replay-dead' ? 'destructive-ghost' : 'default'} size="sm" disabled={pendingMutation() !== null}
            onClick={() => {
              const which = confirming()
              setConfirming(null)
              if (which === 'redeploy') void redeploy()
              else if (which === 'replay-dead') void replayDead()
            }}
          >{pendingMutation() !== null && <Spinner />} {copy.action}</Button>
        </div>
      </Alert>
    }</Show>

    <Show when={mutationError()}>{message => <ErrorCard>{message()}</ErrorCard>}</Show>

    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
      <div><span class="block text-xs text-muted-foreground">HTTP p95</span><strong class="block mt-1 text-lg font-bold tabular-nums text-foreground">{metric(props.summary?.http.p95_ms, ' ms')}</strong><small class="block text-xs text-muted-foreground">p50 {metric(props.summary?.http.p50_ms, ' ms')}</small></div>
      <div><span class="block text-xs text-muted-foreground">Outbox pending</span><strong class="block mt-1 text-lg font-bold tabular-nums text-foreground">{metric(props.summary?.outbox.pending)}</strong><small class="block text-xs text-muted-foreground">{props.summary ? `${props.summary.outbox.processing} processing` : '—'}</small></div>
      <div><span class="block text-xs text-muted-foreground">Delivery pending</span><strong class="block mt-1 text-lg font-bold tabular-nums text-foreground">{metric(props.summary?.deliveries.pending)}</strong><small class="block text-xs text-muted-foreground">{props.summary ? `${props.summary.deliveries.dead} dead` : '—'}</small></div>
      <div><span class="block text-xs text-muted-foreground">Push pending</span><strong class="block mt-1 text-lg font-bold tabular-nums text-foreground">{metric(props.summary?.push.pending)}</strong><small class="block text-xs text-muted-foreground">{props.summary ? `${props.summary.push.dead} dead` : '—'}</small></div>
      <div><span class="block text-xs text-muted-foreground">Oldest queue</span><strong class="block mt-1 text-lg font-bold tabular-nums text-foreground">{props.summary ? seconds(oldestQueueAge(props.summary)) : '—'}</strong><small class="block text-xs text-muted-foreground">across async queues</small></div>
      <div><span class="block text-xs text-muted-foreground">Watchdog</span><strong class="block mt-1 text-lg font-bold tabular-nums text-foreground">{metric(props.summary?.watchdog.active_alerts)}</strong><small class="block text-xs text-muted-foreground">{props.summary ? `${props.summary.watchdog.critical_alerts} critical` : '—'}</small></div>
    </div>

    <Show when={props.summary && (deadJobs() > 0 || props.summary.watchdog.critical_alerts > 0)}>
      <div class="mt-3 p-3.5 rounded-md border border-destructive/30 bg-destructive/10 flex items-center justify-between gap-3 flex-wrap">
        <div><strong class="text-destructive">Operator attention required</strong><br /><span class="text-sm text-secondary-foreground">{deadJobs()} dead queue item(s) · {props.summary?.watchdog.critical_alerts ?? 0} critical watchdog alert(s)</span></div>
        <Show when={confirming() === 'replay-dead'}>
          <div class="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>Cancel</Button><Button writes size="sm" disabled={pendingMutation() !== null} onClick={() => { setConfirming(null); void replayDead() }}>{pendingMutation() === 'replay-dead' && <Spinner />} Confirm replay</Button></div>
        </Show>
        <Show when={confirming() !== 'replay-dead' && props.summary && props.summary.deliveries.dead > 0}>
          <Button writes variant="ghost" size="sm" disabled={pendingMutation() !== null} onClick={() => setConfirming('replay-dead')}>Replay dead deliveries</Button>
        </Show>
      </div>
    </Show>

    <section class="mt-6 pt-4 border-t border-border">
      <details open>
        <summary class="flex items-center justify-between gap-4 cursor-pointer list-none"><div><h3 class="flex items-center gap-2 text-sm font-semibold text-foreground"><SectionIcon name="settings" />Runtime switches</h3></div><small class="text-xs text-muted-foreground">{flags.data?.length ?? 0} declared</small></summary>
        <Show when={flags.data} fallback={
          <Show when={flags.error} fallback={<SkeletonFlagList />}>
            <SectionFailureCard error={flags.error} fallback="Feature flags unavailable" onRetry={() => void flags.refetch()} />
          </Show>
        }>{items => <div class="flex flex-col mt-3">
          <For each={items()}>{flag => <div class="flex items-center justify-between gap-3 py-2 border-b border-border">
            <div class="min-w-0"><strong class="block text-sm text-foreground">{flagLabel(flag.key)}</strong><small class="block text-xs text-muted-foreground">{flagReason(flag)}</small></div>
            <Switch
              checked={flagEnabled(flag)}
              label={`${flagLabel(flag.key)} ${flagEnabled(flag) ? 'enabled' : 'disabled'}`}
              disabled={pendingMutation() !== null}
              onChange={() => updateFlag(flag)}
            />
          </div>}</For>
        </div>}</Show>
      </details>
    </section>
  </Card>
}
