import { For, Show, createSignal } from 'solid-js'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { errorMessage, formatTimestamp as observed } from '../lib/format'
import type { DeliveryDetails, OutboxItem, DeliveryItem, PushDeliveryItem, OperationsSummary } from '../lib/types'
import { EmptyState } from './EmptyState'
import { SectionIcon } from './SectionIcon'
import { SkeletonRows } from './Skeleton'
import { Spinner } from './Spinner'
import { StatusBadge } from './StatusBadge'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

const shortId = (value: string) => value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value

// Push failures in words, and whether retrying can possibly help.
//
// The raw codes read as accusations. `fan_or_consent_ineligible` on twenty-one
// rows looked like the system had been messaging people who said no — it had
// not; those were one fan's seven abandoned app installs, and the same fan
// received their messages on the device they still use. A panel that cannot
// say which of those two things happened turns a hygiene event into a scare.
//
// Retry is offered only where it can succeed. A dead endpoint is a phone that
// reinstalled: there is nothing on the other end, and the button was a promise
// the system could not keep.
const PUSH_FAILURES: Record<string, { reason: string; retryable: boolean }> = {
  endpoint_inactive: {
    reason: 'device no longer registered — the app was reinstalled or removed',
    retryable: false,
  },
  fcm_endpoint_invalid: {
    reason: 'push service rejected the device token as stale',
    retryable: false,
  },
  fan_or_consent_ineligible: {
    reason: 'fan is inactive or has withdrawn marketing consent',
    retryable: false,
  },
  beacon_session_ineligible: { reason: 'beacon session expired or revoked', retryable: false },
  staff_endpoint_ineligible: { reason: 'staff session expired', retryable: false },
  device_ack_timeout: { reason: 'sent, but the device never acknowledged', retryable: true },
  preference_disabled: { reason: 'fan turned this notification category off', retryable: false },
}

const pushFailureReason = (code: string | null | undefined) =>
  (code && PUSH_FAILURES[code]?.reason) ?? code ?? 'unknown error'

// Unknown codes stay retryable: a new failure mode nobody has classified yet
// should not silently lose its only remedy.
const pushIsRetryable = (code: string | null | undefined) =>
  !code || (PUSH_FAILURES[code]?.retryable ?? true)

const DEAD_PREVIEW = 10

export function DeadQueuesPanel(props: {
  slug: string
  summary: OperationsSummary | null | undefined
  deadOutbox: OutboxItem[] | null | undefined
  deadDeliveries: DeliveryItem[] | null | undefined
  deadPush: PushDeliveryItem[] | null | undefined
  error: unknown
  isLoading: boolean
  onRefresh: () => void
}) {
  const [expandOutbox, setExpandOutbox] = createSignal(false)
  const [expandDeliveries, setExpandDeliveries] = createSignal(false)
  const [expandPush, setExpandPush] = createSignal(false)
  const [confirming, setConfirming] = createSignal(false)
  const [busy, setBusy] = createSignal('')
  const [deliveryDetails, setDeliveryDetails] = createSignal<DeliveryDetails | null>(null)
  const [revealedId, setRevealedId] = createSignal<string | null>(null)
  const toggleRevealedId = (key: string) => setRevealedId(prev => prev === key ? null : key)

  /// Says what these failures mean before the operator reads twenty rows.
  const pushFailureSummary = () => {
    const items = props.deadPush ?? []
    if (items.length === 0) return 'Retry is idempotent.'
    const retryable = items.filter(item => pushIsRetryable(item.error_code)).length
    const stale = items.length - retryable
    if (stale === items.length) {
      return `All ${items.length} are devices that no longer exist — reinstalled or uninstalled apps. Nothing was lost and there is nothing to retry.`
    }
    if (stale === 0) return `${retryable} worth retrying. Retry is idempotent.`
    return `${stale} are devices that no longer exist and cannot be retried; ${retryable} are worth a retry. Retry is idempotent.`
  }

  const clearDead = async () => {
    if (!props.summary || props.summary.deliveries.dead <= 0 || busy()) return
    if (!confirming()) {
      setConfirming(true)
      toast.info('Click again to confirm marking dead webhook deliveries as cancelled.')
      return
    }
    setBusy('clear')
    try {
      const result = await api.clearDeadDeliveries(props.slug)
      setConfirming(false)
      toast.success(`Cleanup complete: ${result.cleared} dead delivery item(s) cancelled. Outbox and push queues untouched.`)
      props.onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dead queue cleanup failed')
    } finally {
      setBusy('')
    }
  }

  const retryOutbox = async (id: string) => {
    if (busy()) return
    setBusy(`outbox:${id}`)
    try {
      await api.retryOutbox(props.slug, id)
      toast.success(`Outbox ${shortId(id)} is back in the pending queue.`)
      props.onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Outbox retry failed')
    } finally {
      setBusy('')
    }
  }

  const retryDelivery = async (id: string) => {
    if (busy()) return
    setBusy(`delivery:${id}`)
    try {
      await api.retryDelivery(props.slug, id)
      toast.success(`Delivery ${shortId(id)} is back in the pending queue.`)
      setDeliveryDetails(null)
      props.onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delivery retry failed')
    } finally {
      setBusy('')
    }
  }

  const retryPush = async (id: string) => {
    if (busy()) return
    setBusy(`push:${id}`)
    try {
      await api.retryPush(props.slug, id)
      toast.success(`Push ${shortId(id)} is back in the queue.`)
      props.onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Push retry failed')
    } finally {
      setBusy('')
    }
  }

  const loadDeliveryDetails = async (id: string) => {
    if (busy()) return
    setBusy(`details:${id}`)
    try {
      setDeliveryDetails(await api.deliveryDetails(props.slug, id))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delivery details unavailable')
    } finally {
      setBusy('')
    }
  }

  return <>
    {/* ─── Dead Outbox ─────────────────────────────────────────── */}
    <div class="flex items-start justify-between gap-4 mt-6 mb-3" id="dead-outbox">
      <div><span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">DEAD OUTBOX</span><h3 class="mt-1 text-base font-semibold text-foreground flex items-center gap-2"><SectionIcon name="alert-triangle" />Failed events</h3><p class="mt-1 text-sm text-muted-foreground leading-relaxed">Retry is idempotent.</p></div>
    </div>
    <Show when={props.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{errorMessage(props.error, 'Dead outbox unavailable')}</div></Show>
    <Show when={props.isLoading}><SkeletonRows count={2} /></Show>
    <For each={expandOutbox() ? (props.deadOutbox ?? []) : (props.deadOutbox ?? []).slice(0, DEAD_PREVIEW)}>{item => <Card class="border-warning/30 bg-warning/10 p-4">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <Badge variant="warning" class="font-mono">{item.event_type}</Badge>
            <Badge variant="muted">outbox</Badge>
          </div>
          <p class="mt-1.5 m-0 text-sm text-secondary-foreground">{item.last_error_kind ?? 'unknown error'} · attempts {item.attempts}/{item.max_attempts} · dead {observed(item.dead_at)}</p>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => toggleRevealedId(`outbox:${item.id}`)}>{revealedId() === `outbox:${item.id}` ? 'Hide ID' : 'Details'}</Button>
          <Button variant="ghost" size="sm" disabled={!!busy()} onClick={() => void retryOutbox(item.id)}>{busy() === `outbox:${item.id}` && <Spinner />} {busy() === `outbox:${item.id}` ? 'Retrying…' : 'Retry'}</Button>
        </div>
      </div>
      <Show when={revealedId() === `outbox:${item.id}`}>
        <small class="block mt-2 text-xs text-muted-foreground font-mono">Event ID · <span class="font-mono">{item.id}</span></small>
      </Show>
    </Card>}</For>
    <Show when={(props.deadOutbox?.length ?? 0) > DEAD_PREVIEW}>
      <Button variant="ghost" size="sm" class="mt-3" onClick={() => setExpandOutbox(!expandOutbox())}>
        {expandOutbox() ? 'Show fewer' : `Show all ${props.deadOutbox?.length ?? 0} (showing ${DEAD_PREVIEW})`}
      </Button>
    </Show>
    <Show when={!props.isLoading && (props.deadOutbox?.length ?? 0) === 0}><Card class="p-4 mt-2.5"><EmptyState label="No dead outbox events" hint="Dead outbox events are messages that failed delivery after all retries. A clean queue means everything is flowing." /></Card></Show>

    {/* ─── Dead Webhook Deliveries ─────────────────────────────── */}
    <div class="flex items-start justify-between gap-4 mt-6 mb-3" id="dead-deliveries">
      <div><span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">DEAD WEBHOOK DELIVERIES</span><h3 class="mt-1 text-base font-semibold text-foreground flex items-center gap-2"><SectionIcon name="alert-triangle" />Delivery failures</h3><p class="mt-1 text-sm text-muted-foreground leading-relaxed">Inspect attempt history before retrying.</p></div>
      <Button type="button" variant={confirming() ? 'destructive-ghost' : 'ghost'} size="sm" disabled={(props.summary?.deliveries.dead ?? 0) <= 0 || !!busy()} onClick={() => void clearDead()}>{busy() === 'clear' && <Spinner />} {busy() === 'clear' ? 'Clearing…' : confirming() ? 'Confirm cleanup' : 'Clear old dead queues'}</Button>
    </div>
    <Show when={props.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{errorMessage(props.error, 'Dead deliveries unavailable')}</div></Show>
    <Show when={props.isLoading}><SkeletonRows count={2} /></Show>
    <For each={expandDeliveries() ? (props.deadDeliveries ?? []) : (props.deadDeliveries ?? []).slice(0, DEAD_PREVIEW)}>{item => <Card class="border-warning/30 bg-warning/10 p-4">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <Badge variant="warning" class="font-mono">{item.event_type}</Badge>
            <Badge variant="muted">{item.endpoint_name}</Badge>
          </div>
          <p class="mt-1.5 m-0 text-sm text-secondary-foreground">{item.last_error_kind ?? 'unknown error'} · HTTP {item.last_response_status ?? '—'} · attempts {item.attempt_count}/{item.max_attempts}</p>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => toggleRevealedId(`delivery:${item.id}`)}>{revealedId() === `delivery:${item.id}` ? 'Hide ID' : 'Details'}</Button>
          <Button variant="ghost" size="sm" disabled={!!busy()} onClick={() => void loadDeliveryDetails(item.id)}>Attempts</Button>
          <Button variant="ghost" size="sm" disabled={!!busy()} onClick={() => void retryDelivery(item.id)}>{busy() === `delivery:${item.id}` && <Spinner />} {busy() === `delivery:${item.id}` ? 'Retrying…' : 'Retry'}</Button>
        </div>
      </div>
      <Show when={revealedId() === `delivery:${item.id}`}>
        <small class="block mt-2 text-xs text-muted-foreground font-mono">Delivery ID · <span class="font-mono">{item.id}</span></small>
      </Show>
    </Card>}</For>
    <Show when={(props.deadDeliveries?.length ?? 0) > DEAD_PREVIEW}>
      <Button variant="ghost" size="sm" class="mt-3" onClick={() => setExpandDeliveries(!expandDeliveries())}>
        {expandDeliveries() ? 'Show fewer' : `Show all ${props.deadDeliveries?.length ?? 0} (showing ${DEAD_PREVIEW})`}
      </Button>
    </Show>
    <Show when={!props.isLoading && (props.deadDeliveries?.length ?? 0) === 0}><Card class="p-4 mt-2.5"><EmptyState label="No dead webhook deliveries" hint="Dead webhooks are deliveries that failed after all retries. A clean list means webhooks are reaching their destinations." /></Card></Show>

    <Show when={deliveryDetails()}>{details => <Card class="p-4">
      <div class="flex items-start justify-between gap-4 mt-6 mb-3"><div><span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">DELIVERY DETAILS</span><h3 class="mt-1 text-base font-semibold text-foreground flex items-center gap-2"><SectionIcon name="mail" />{details().delivery.endpoint_name}</h3><div class="flex items-center gap-2 flex-wrap mt-1"><Badge variant="warning" class="font-mono">{details().delivery.event_type}</Badge><Badge variant="muted">delivery</Badge></div></div><Button variant="ghost" size="sm" onClick={() => setDeliveryDetails(null)}>Close</Button></div>
      <For each={details().attempts}>{attempt => <div class="rounded-lg border border-warning/30 bg-warning/10 p-4"><strong class="text-foreground">Attempt {attempt.attempt_number} · {attempt.outcome}</strong><p class="mt-1 m-0 text-sm text-secondary-foreground">HTTP {attempt.response_status ?? '—'} · {attempt.error_kind ?? 'no error kind'} · {attempt.duration_ms} ms · {observed(attempt.finished_at)}</p></div>}</For>
      <Show when={details().attempts.length === 0}><EmptyState label="No delivery attempts" hint="Delivery attempts are logged here once the outbox starts processing messages." /></Show>
    </Card>}</Show>

    {/* ─── Dead Push ───────────────────────────────────────────── */}
    <div class="flex items-start justify-between gap-4 mt-6 mb-3" id="dead-push">
      <div><span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">DEAD PUSH</span><h3 class="mt-1 text-base font-semibold text-foreground flex items-center gap-2"><SectionIcon name="alert-triangle" />Failed push deliveries</h3><p class="mt-1 text-sm text-muted-foreground leading-relaxed">{pushFailureSummary()}</p></div>
      <StatusBadge status={(props.summary?.push.dead ?? 0) > 0 ? 'dead' : 'clean'} tone={(props.summary?.push.dead ?? 0) > 0 ? 'bad' : 'good'} />
    </div>
    <Show when={props.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{errorMessage(props.error, 'Dead push unavailable')}</div></Show>
    <Show when={props.isLoading}><SkeletonRows count={2} /></Show>
    <For each={expandPush() ? (props.deadPush ?? []) : (props.deadPush ?? []).slice(0, DEAD_PREVIEW)}>{item => <Card class="border-warning/30 bg-warning/10 p-4">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <Badge variant="warning" class="font-mono">{item.source_kind}</Badge>
            <Badge variant="muted">push</Badge>
          </div>
          <p class="mt-1.5 m-0 text-sm text-secondary-foreground"><strong class="text-foreground">{item.title}</strong> — {pushFailureReason(item.error_code)} · attempts {item.attempt_count}</p>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => toggleRevealedId(`push:${item.id}`)}>{revealedId() === `push:${item.id}` ? 'Hide ID' : 'Details'}</Button>
          <Show
            when={pushIsRetryable(item.error_code)}
            fallback={<span class="text-sm text-muted-foreground">nothing to retry</span>}
          >
            <Button variant="ghost" size="sm" disabled={!!busy()} onClick={() => void retryPush(item.id)}>{busy() === `push:${item.id}` && <Spinner />} {busy() === `push:${item.id}` ? 'Retrying…' : 'Retry'}</Button>
          </Show>
        </div>
      </div>
      <Show when={revealedId() === `push:${item.id}`}>
        <small class="block mt-2 text-xs text-muted-foreground font-mono">Push ID · <span class="font-mono">{item.id}</span></small>
      </Show>
    </Card>}</For>
    <Show when={(props.deadPush?.length ?? 0) > DEAD_PREVIEW}>
      <Button variant="ghost" size="sm" class="mt-3" onClick={() => setExpandPush(!expandPush())}>
        {expandPush() ? 'Show fewer' : `Show all ${props.deadPush?.length ?? 0} (showing ${DEAD_PREVIEW})`}
      </Button>
    </Show>
    <Show when={!props.isLoading && (props.deadPush?.length ?? 0) === 0}><Card class="p-4 mt-2.5"><EmptyState label="No dead push deliveries" hint="Dead push notifications are deliveries that failed after all retries. A clean list means pushes are reaching devices." /></Card></Show>
  </>
}
