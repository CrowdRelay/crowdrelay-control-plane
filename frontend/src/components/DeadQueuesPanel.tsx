import { For, Show, createSignal } from 'solid-js'
import { CircleCheck, Send } from 'lucide-solid'
import { api } from '../lib/api'
import { toast } from './app/toast'
import { formatTimestamp as observed, timestampMillis, tokenLabel } from '../lib/format'
import type { DeliveryDetails, OutboxItem, DeliveryItem, PushDeliveryItem, OperationsSummary } from '../lib/types'
import { EmptyState } from './ui/empty-state'
import { SectionIcon } from './SectionIcon'
import { SkeletonRows } from './Skeleton'
import { Spinner } from './Spinner'
import { Button } from './app/button'
import { DataTable, type ColumnDef } from './app/data-table'
import { Pill, Tile, Tiles } from './ui/dash'
import { ErrorCard, Section } from './layout'
import { Dialog, confirmAction } from './Dialog'
import { authState } from '../lib/auth'


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
  beacon_session_ineligible: { reason: 'amplifier session expired or revoked', retryable: false },
  staff_endpoint_ineligible: { reason: 'staff session expired', retryable: false },
  device_ack_timeout: { reason: 'sent, but the device never acknowledged', retryable: true },
  preference_disabled: { reason: 'fan turned this notification category off', retryable: false },
}

const pushFailureReason = (code: string | null | undefined) =>
  (code && PUSH_FAILURES[code]?.reason) ?? code ?? 'no reason recorded'

// Unknown codes stay retryable: a new failure mode nobody has classified yet
// should not silently lose its only remedy.
const pushIsRetryable = (code: string | null | undefined) =>
  !code || (PUSH_FAILURES[code]?.retryable ?? true)

type QueueKind = 'outbox' | 'delivery' | 'push'
const QUEUE_LABEL: Record<QueueKind, string> = { outbox: 'Failed events', delivery: 'Delivery failures', push: 'Push failures' }
const QUEUE_SHORT: Record<QueueKind, string> = { outbox: 'Event', delivery: 'Webhook delivery', push: 'Push' }

/** One dead item from any of the three queues. */
type DeadRow = {
  id: string
  kind: QueueKind
  title: string
  detail: string
  reason: string
  attempts: string
  failedAt: string | null
  retryable: boolean
  /** What the toast and the screen reader call this row — the words the row
   *  shows, never its UUID, which nobody can match against the screen. */
  label: string
  delivery?: DeliveryItem
}

// The error kinds in words. HTTP classes say who refused; the status, when
// there is one, is the number to search a receiver's logs for.
const ERROR_WORDS: Record<string, string> = {
  http_4xx: 'The receiver refused it',
  http_5xx: 'The receiver failed',
  timeout: 'Timed out',
  payload_rejected: 'The receiver rejected the payload',
  connection_refused: 'Could not connect',
  dns: 'The address does not resolve',
}
const reasonOf = (kind: string | null | undefined, status?: number | null) => {
  const words = kind ? ERROR_WORDS[kind] ?? tokenLabel(kind) : 'No reason recorded'
  return status != null ? `${words} (HTTP ${status})` : words
}
const eventTitle = (eventType: string) => tokenLabel(eventType)

export function DeadQueuesPanel(props: {
  slug: string
  summary: OperationsSummary | null | undefined
  deadOutbox: OutboxItem[] | null | undefined
  deadDeliveries: DeliveryItem[] | null | undefined
  deadPush: PushDeliveryItem[] | null | undefined
  /// Sections the tenant snapshot could not produce — a dead queue listed
  /// here means "didn't report", which must never render as a clean queue.
  notReported: readonly string[]
  error: unknown
  isLoading: boolean
  onRefresh: () => void
}) {
  const [busy, setBusy] = createSignal('')
  const [deliveryDetails, setDeliveryDetails] = createSignal<DeliveryDetails | null>(null)
  // The row that opened the attempt history — its Retry lives in the dialog.
  const [detailsRow, setDetailsRow] = createSignal<DeadRow | null>(null)
  const [show, setShow] = createSignal<QueueKind | 'all'>('all')
  const platform = () => authState.isPlatformLevel()

  // A section counts as reported only when the snapshot named it nowhere in
  // `not_reported` and the caller actually has its rows. Both failure modes
  // read "not reported", never as a clean queue.
  const reported = (name: string, rows: readonly unknown[] | null | undefined) =>
    !props.notReported.includes(name) && rows != null
  const isReported = (kind: QueueKind) =>
    kind === 'outbox' ? reported('dead_outbox', props.deadOutbox)
    : kind === 'delivery' ? reported('dead_deliveries', props.deadDeliveries)
    : reported('dead_push', props.deadPush)

  const rows = (): DeadRow[] => [
    ...(props.deadOutbox ?? []).map((item): DeadRow => ({
      id: `outbox-${item.id}`, kind: 'outbox',
      title: eventTitle(item.event_type),
      detail: 'Event · from the outbox',
      reason: reasonOf(item.last_error_kind),
      attempts: `${item.attempts}/${item.max_attempts}`,
      failedAt: item.dead_at,
      retryable: true,
      label: `“${eventTitle(item.event_type)}”`,
    })),
    ...(props.deadDeliveries ?? []).map((item): DeadRow => ({
      id: `delivery-${item.id}`, kind: 'delivery', delivery: item,
      title: eventTitle(item.event_type),
      detail: `Webhook · to ${item.endpoint_name}${item.endpoint_active ? '' : ' (endpoint switched off)'}`,
      reason: reasonOf(item.last_error_kind, item.last_response_status),
      attempts: `${item.attempt_count}/${item.max_attempts}`,
      failedAt: item.dead_at ?? item.updated_at,
      retryable: true,
      label: `${eventTitle(item.event_type)} to ${item.endpoint_name}`,
    })),
    ...(props.deadPush ?? []).map((item): DeadRow => ({
      id: `push-${item.id}`, kind: 'push',
      title: item.title,
      detail: `Push · ${tokenLabel(item.source_kind).toLowerCase()}`,
      reason: tokenLabel(pushFailureReason(item.error_code)),
      attempts: `${item.attempt_count}`,
      failedAt: item.completed_at ?? item.available_at,
      retryable: pushIsRetryable(item.error_code),
      label: item.title,
    })),
  ]
  const countOf = (kind: QueueKind | 'all') => kind === 'all' ? rows().length : rows().filter(r => r.kind === kind).length
  const visible = () => show() === 'all' ? rows() : rows().filter(r => r.kind === show())

  // The summary counts every dead item; the lists carry what the snapshot
  // listed. Both are said, so a tile never contradicts the table under it.
  const summaryDead = (kind: QueueKind) => {
    const s = props.summary
    if (!s) return null
    return kind === 'outbox' ? s.outbox?.dead ?? null : kind === 'delivery' ? s.deliveries?.dead ?? null : s.push?.dead ?? null
  }
  const tile = (kind: QueueKind) => {
    if (!isReported(kind)) return { value: null, sub: 'not reported' }
    const listed = countOf(kind)
    const total = summaryDead(kind)
    return {
      value: Math.max(listed, total ?? 0),
      sub: total != null && total > listed ? `${listed} of them listed below` : listed > 0 ? 'after every retry' : 'all flowing',
    }
  }

  /// Says what the push failures mean before anyone reads twenty rows.
  const pushFailureSummary = () => {
    const items = props.deadPush ?? []
    if (!isReported('push') || items.length === 0) return null
    const retryable = items.filter(item => pushIsRetryable(item.error_code)).length
    const stale = items.length - retryable
    if (stale === items.length) {
      return `All ${items.length} push failures are devices that no longer exist — reinstalled or uninstalled apps. Nothing was lost and there is nothing to retry.`
    }
    if (stale === 0) return null
    return `${stale} push failures are devices that no longer exist and cannot be retried; ${retryable} are worth a retry.`
  }

  // Cancelling only touches webhook deliveries — the outbox and push queues
  // are left alone, and the dialog says so before anything happens.
  const deadDeliveries = () => Math.max(summaryDead('delivery') ?? 0, countOf('delivery'))
  const clearDead = async () => {
    const count = deadDeliveries()
    if (count <= 0 || busy()) return
    const ok = await confirmAction({
      title: `Cancel ${count} dead webhook deliver${count === 1 ? 'y' : 'ies'}?`,
      body: 'They are marked cancelled and will not be retried. Failed events and push notifications are not touched.',
      confirmLabel: 'Cancel deliveries',
      cancelLabel: 'Keep them',
      destructive: true,
    })
    if (!ok) return
    setBusy('clear')
    try {
      const result = await api.clearDeadDeliveries(props.slug)
      toast.success(`${result.cleared} dead deliver${result.cleared === 1 ? 'y' : 'ies'} cancelled. Failed events and pushes are untouched.`)
      props.onRefresh()
    } catch (error) {
      toast.error("Couldn't cancel the dead deliveries", error)
    } finally {
      setBusy('')
    }
  }

  const retry = async (row: DeadRow) => {
    if (busy()) return
    const id = row.id.slice(row.id.indexOf('-') + 1)
    setBusy(`retry:${row.id}`)
    try {
      if (row.kind === 'outbox') await api.retryOutbox(props.slug, id)
      else if (row.kind === 'delivery') await api.retryDelivery(props.slug, id)
      else await api.retryPush(props.slug, id)
      toast.success(`${row.label} is back in the queue.`)
      setDeliveryDetails(null)
      props.onRefresh()
    } catch (error) {
      toast.error("Couldn't retry it", error)
    } finally {
      setBusy('')
    }
  }

  const loadDeliveryDetails = async (row: DeadRow, id: string) => {
    if (busy()) return
    setBusy(`details:${id}`)
    try {
      setDetailsRow(row)
      setDeliveryDetails(await api.deliveryDetails(props.slug, id))
    } catch (error) {
      toast.error("Couldn't load the attempt history", error)
    } finally {
      setBusy('')
    }
  }

  const columns: ColumnDef<DeadRow, any>[] = [
    {
      id: 'what', header: 'What failed', accessorFn: r => r.title, meta: { class: 'min-w-56' },
      cell: c => <>
        <span class="font-medium text-foreground">{c.row.original.title}</span>
        <span class="block text-muted-foreground">{c.row.original.detail}</span>
      </>,
    },
    {
      id: 'reason', header: 'Why', accessorFn: r => r.reason, meta: { class: 'min-w-56' },
      cell: c => <span class="inline-flex flex-col items-start gap-0.5">
        <span class="text-pretty">{c.row.original.reason}</span>
        <Show when={!c.row.original.retryable}><Pill tone="muted">Nothing to retry</Pill></Show>
      </span>,
    },
    { id: 'attempts', header: 'Attempts', accessorFn: r => Number(r.attempts.split('/')[0]), meta: { numeric: true }, cell: c => c.row.original.attempts },
    {
      id: 'failed', header: 'Failed', accessorFn: r => timestampMillis(r.failedAt) || 0, meta: { class: 'whitespace-nowrap' },
      cell: c => <span class="text-muted-foreground">{c.row.original.failedAt ? observed(c.row.original.failedAt) : '—'}</span>,
    },
    {
      id: 'actions', header: () => <span class="sr-only">Actions</span>, enableSorting: false, enableHiding: false,
      meta: { class: 'text-right whitespace-nowrap' },
      cell: c => {
        const r = c.row.original
        return <div class="flex items-center justify-end gap-1.5">
          <Show when={r.delivery}>{d =>
            <Button variant="ghost" size="sm" disabled={!!busy()} onClick={() => void loadDeliveryDetails(r, d().id)}>
              {busy() === `details:${d().id}` && <Spinner />} Attempts<span class="sr-only">: {r.label}</span>
            </Button>
          }</Show>
          <Show when={r.retryable}>
            <Button writes variant="outline" size="sm" disabled={!!busy()} onClick={() => void retry(r)}>
              {busy() === `retry:${r.id}` && <Spinner />} {busy() === `retry:${r.id}` ? 'Retrying…' : 'Retry'}<span class="sr-only">: {r.label}</span>
            </Button>
          </Show>
        </div>
      },
    },
  ]

  const notes = () => {
    const out: string[] = []
    const missing = (['outbox', 'delivery', 'push'] as QueueKind[]).filter(k => !isReported(k)).map(k => QUEUE_LABEL[k].toLowerCase())
    if (missing.length > 0 && !props.isLoading && !props.error) {
      out.push(platform()
        ? `This tenant does not publish ${missing.join(', ')} — the console cannot show what it was never told.`
        : `Not reported yet: ${missing.join(', ')}.`)
    }
    const push = pushFailureSummary()
    if (push) out.push(push)
    return out
  }
  const CHIPS: (QueueKind | 'all')[] = ['all', 'outbox', 'delivery', 'push']

  return <div class="space-y-6">
    {/* One failure, said once — not once per queue. */}
    <Show when={props.error}><ErrorCard title="Couldn't load the failed queues" error={props.error} /></Show>

    <Show when={!props.isLoading} fallback={<SkeletonRows count={4} />}>
      <Tiles cols={3} class="mb-6">
        <For each={['outbox', 'delivery', 'push'] as QueueKind[]}>{kind => (
          <Tile
            label={QUEUE_LABEL[kind]}
            value={tile(kind).value}
            valueTone={(tile(kind).value ?? 0) > 0 ? 'bad' : undefined}
            sub={tile(kind).sub}
          />
        )}</For>
      </Tiles>

      {/* The anchors alerts and inbox items link to — one per queue, all
          landing on this table. */}
      <span id="dead-deliveries" class="block scroll-mt-4" />
      <span id="dead-push" class="block scroll-mt-4" />
      <section id="dead-outbox" class="scroll-mt-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <Section
          flush
          title="Failed queues"
          icon={<SectionIcon name="alert-triangle" />}
          count={rows().length}
          description="Everything that failed after its last retry. Retrying is safe — it never sends the same thing twice."
        >
          <DataTable
            data={visible()}
            columns={columns}
            getRowId={r => r.id}
            bordered={false}
            initialSorting={[{ id: 'failed', desc: true }]}
            searchText={r => [r.title, r.detail, r.reason, QUEUE_SHORT[r.kind]].join(' ')}
            searchPlaceholder="Search by event, endpoint or reason"
            toolbar={
              <div role="group" aria-label="Queue" class="flex flex-wrap items-center gap-1">
                <For each={CHIPS}>{id => (
                  <Button variant={show() === id ? 'secondary' : 'ghost'} size="sm" aria-pressed={show() === id} onClick={() => setShow(id)}>
                    {id === 'all' ? 'All' : QUEUE_LABEL[id]}
                    <span class="tabular-nums text-muted-foreground">{id !== 'all' && !isReported(id) ? '—' : countOf(id)}</span>
                  </Button>
                )}</For>
              </div>
            }
            actions={
              <Button writes variant="outline" size="sm" disabled={deadDeliveries() <= 0 || !!busy()} onClick={() => void clearDead()}>
                {busy() === 'clear' && <Spinner />} {busy() === 'clear' ? 'Cancelling…' : 'Cancel dead deliveries'}
              </Button>
            }
            empty={rows().length === 0
              ? <EmptyState icon={<CircleCheck />} label="Nothing failed" hint="Every event, webhook and push reached its destination or is still being retried." />
              : <EmptyState icon={<CircleCheck />} label="Nothing here" hint="Nothing failed in this queue.">
                  <Button variant="outline" size="sm" onClick={() => setShow('all')}>Show every queue</Button>
                </EmptyState>}
          />
          <For each={notes()}>{note => <p class="mt-3 text-xs text-muted-foreground text-pretty">{note}</p>}</For>
        </Section>
      </section>
    </Show>

    {/* The attempt history is read beside the table, with the one action it
        leads to in its footer. */}
    <Dialog
      open={deliveryDetails() !== null}
      onClose={() => setDeliveryDetails(null)}
      label={deliveryDetails() ? `Delivery to ${deliveryDetails()!.delivery.endpoint_name}` : 'Delivery'}
      description={deliveryDetails() ? eventTitle(deliveryDetails()!.delivery.event_type) : undefined}
      footer={<Show when={deliveryDetails()}>{_ => {
        const row = () => detailsRow()
        return <>
          <Button variant="ghost" size="sm" onClick={() => setDeliveryDetails(null)}>Close</Button>
          <Show when={row()}>{r =>
            <Button writes size="sm" disabled={!!busy()} onClick={() => void retry(r())}>
              {busy() === `retry:${r().id}` && <Spinner />} {busy() === `retry:${r().id}` ? 'Retrying…' : 'Retry delivery'}
            </Button>
          }</Show>
        </>
      }}</Show>}
    >
      <Show when={deliveryDetails()}>{details => (
        <Show when={details().attempts.length > 0} fallback={
          <EmptyState icon={<Send />} label="No delivery attempts" hint="Attempts are logged here once the outbox starts processing messages." />
        }>
          <ol class="divide-y divide-border rounded-lg border border-border">
            <For each={details().attempts}>{attempt => (
              <li class="space-y-0.5 px-3 py-2.5">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-sm font-medium text-foreground">Attempt {attempt.attempt_number}</span>
                  <Pill tone={attempt.outcome === 'succeeded' || attempt.outcome === 'delivered' ? 'good' : 'bad'}>{tokenLabel(attempt.outcome)}</Pill>
                </div>
                <p class="text-xs text-muted-foreground">
                  HTTP {attempt.response_status ?? '—'} · {attempt.error_kind ? tokenLabel(attempt.error_kind) : 'no error recorded'} · {attempt.duration_ms} ms · {observed(attempt.finished_at)}
                </p>
                <Show when={attempt.response_excerpt}>
                  <p class="break-words font-mono text-xs text-muted-foreground">{attempt.response_excerpt}</p>
                </Show>
              </li>
            )}</For>
          </ol>
        </Show>
      )}</Show>
    </Dialog>
  </div>
}
