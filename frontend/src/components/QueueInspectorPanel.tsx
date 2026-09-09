import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { errorMessage, formatTimestamp } from '../lib/format'
import { toast } from '../lib/toast'
import { Dialog } from './Dialog'
import { EmptyState } from './EmptyState'
import { SectionIcon } from './SectionIcon'
import { SkeletonRows } from './Skeleton'
import { StatusBadge } from './StatusBadge'
import { Card } from './ui/card'
import { TabBar } from './layout'
import type { DeliveryDetails, DeliveryItem, OutboxItem } from '../lib/types'

// The health panel's remediation for a dead letter reads "Open Deliveries and
// read one failure" — and there was no Deliveries anywhere in the console. The
// list, detail and retry endpoints have all been served since the queues were
// built; an operator could see the count of what gave up and never which ones.

type Tab = 'outbox' | 'deliveries'

const STATUSES = ['dead', 'pending', 'processing', 'delivered', 'cancelled'] as const

const statusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'delivered' ? 'good'
    : status === 'dead' ? 'bad'
      : status === 'pending' || status === 'processing' ? 'warn'
        : 'muted'

const age = (value: string | null | undefined) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  const seconds = Math.floor((Date.now() - parsed.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const errorLabel = (kind: string | null) =>
  kind ? kind.replace(/_/g, ' ') : 'no error recorded'

export function QueueInspectorPanel(props: { slug: string }) {
  const [tab, setTab] = createSignal<Tab>('deliveries')
  const [status, setStatus] = createSignal<string>('dead')
  const [busy, setBusy] = createSignal<string | null>(null)
  const [detail, setDetail] = createSignal<DeliveryDetails | null>(null)

  // useQuery (not createResource) so that tab/status changes show skeletons
  // in place instead of throwing to the parent <Suspense> and replacing the
  // whole page. TanStack Query keeps previous data during auto-refresh
  // (triggerRefresh → invalidateQueries) and only resets on query-key change
  // (tab/status swap), which is exactly when we want skeletons.
  const model = useQuery(() => ({
    queryKey: ['queue-inspector', props.slug, tab(), status()],
    queryFn: async () => {
      const params = { limit: 50, status: status() || undefined }
      return tab() === 'outbox'
        ? await api.listOutbox(props.slug, params) as (OutboxItem | DeliveryItem)[]
        : await api.listDeliveries(props.slug, params) as (OutboxItem | DeliveryItem)[]
    },
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // Patch rows in place. Without this the store value is replaced wholesale
    // on every refresh, so `<For>` sees new item references and tears down and
    // rebuilds every row even when the payload is byte-identical.
    reconcile: 'id',
  }))

  const isDelivery = (item: OutboxItem | DeliveryItem): item is DeliveryItem =>
    'endpoint_name' in item

  const retry = async (item: OutboxItem | DeliveryItem) => {
    setBusy(item.id)
    try {
      const result = isDelivery(item)
        ? await api.retryDelivery(props.slug, item.id)
        : await api.retryOutbox(props.slug, item.id)
      toast.success(result.status === 'queued' ? 'Queued for another attempt.' : `Retry: ${result.status}`)
      await model.refetch()
    } catch (error) {
      toast.error(errorMessage(error, 'Retry failed'))
    } finally {
      setBusy(null)
    }
  }

  const inspect = async (item: DeliveryItem) => {
    setBusy(item.id)
    try {
      setDetail(await api.deliveryDetails(props.slug, item.id))
    } catch (error) {
      toast.error(errorMessage(error, 'Could not load the delivery'))
    } finally {
      setBusy(null)
    }
  }

  return <Card class="p-4 queue-panel">
    <div class="flex items-center justify-between gap-4 mt-6 mb-3">
      <div>
        <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">QUEUES</span>
        <h2><SectionIcon name="list-checks" />What is stuck, and why</h2>
        <p>The outbox holds events leaving this system; deliveries are the webhook attempts against your endpoints. A dead row has used every attempt and will not move again on its own — read one before retrying the rest, because a bulk retry reproduces a bad payload as fast as it reproduces a blip.</p>
      </div>
    </div>

    <div class="queue-controls">
      <TabBar
        tabs={[
          { id: 'deliveries', label: 'Deliveries' },
          { id: 'outbox', label: 'Outbox' },
        ]}
        active={tab()}
        onChange={setTab}
      />
      <label class="compact-field queue-filter">
        <span>Status</span>
        <select value={status()} onChange={event => setStatus(event.currentTarget.value)}>
          <option value="">Any status</option>
          <For each={STATUSES}>{value => <option value={value}>{value}</option>}</For>
        </select>
      </label>
    </div>

    <Show when={model.error}>
      <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{errorMessage(model.error, 'The queue could not be read')}</div>
    </Show>

    {/* Skeletons only before the first result. A tab or status change swaps the
        query key, but the global `placeholderData` keeps the previous rows on
        screen, so the list is marked as refreshing instead of collapsing into a
        skeleton — same height, no scroll jump. */}
    <Show when={model.isPending}><SkeletonRows count={3} /></Show>

    <Show when={model.data}>{rows => (
      <div data-refreshing={model.isFetching && !model.isPending} aria-busy={model.isFetching}>
      <Show
        when={rows().length > 0}
        fallback={<EmptyState
          label={status() === 'dead' ? 'Nothing has given up' : 'Nothing in this queue'}
          hint={status() === 'dead'
            ? 'Every event either went out or is still being attempted. Switch the filter to see what is in flight.'
            : 'Try another status — dead rows are the ones worth reading first.'}
        />}
      >
        <div class="queue-list">
          <For each={rows()}>{item => (
            <div class="queue-row">
              <div class="queue-row-main">
                <div class="row-health">
                  <strong>{item.event_type}</strong>
                  <StatusBadge status={item.status} tone={statusTone(item.status)} />
                </div>
                <small>
                  <Show when={isDelivery(item)}>{`${(item as DeliveryItem).endpoint_name} · `}</Show>
                  attempt {isDelivery(item) ? (item as DeliveryItem).attempt_count : (item as OutboxItem).attempts} of {item.max_attempts}
                  {' · '}{errorLabel(item.last_error_kind)}
                  <Show when={isDelivery(item) && (item as DeliveryItem).last_response_status != null}>
                    {` · HTTP ${(item as DeliveryItem).last_response_status}`}
                  </Show>
                  {' · '}created {age(item.created_at)}
                </small>
              </div>
              <div class="row-health queue-row-actions">
                <Show when={isDelivery(item)}>
                  <button class="ghost" disabled={busy() === item.id} onClick={() => inspect(item as DeliveryItem)}>Inspect</button>
                </Show>
                <button class="ghost" disabled={busy() === item.id} onClick={() => retry(item)}>
                  {busy() === item.id ? 'Working…' : 'Retry'}
                </button>
              </div>
            </div>
          )}</For>
        </div>
      </Show>
      </div>
    )}</Show>

    <Dialog open={detail() !== null} onClose={() => setDetail(null)} label="Delivery attempts" class="dialog-panel queue-detail-dialog">
      <Show when={detail()}>{data => <>
        <div class="flex items-center justify-between gap-4 mt-6 mb-3"><div><span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">DELIVERY</span><h2>{data().delivery.event_type}</h2></div>
          <StatusBadge status={data().delivery.status} tone={statusTone(data().delivery.status)} /></div>
        <p class="queue-detail-meta">
          {data().delivery.endpoint_name}
          {data().delivery.endpoint_active ? '' : ' · endpoint disabled'}
          {' · '}attempt {data().delivery.attempt_count} of {data().delivery.max_attempts}
        </p>
        <Show when={data().attempts.length > 0} fallback={<p class="cos-empty">No attempt was recorded, which means it never left the queue.</p>}>
          <ol class="queue-attempts">
            <For each={data().attempts}>{attempt => (
              <li>
                <div>
                  <strong>#{attempt.attempt_number} · {attempt.outcome}</strong>
                  <small>{formatTimestamp(attempt.started_at)} · {attempt.duration_ms}ms · {errorLabel(attempt.error_kind)}</small>
                  {/* The status code alone cannot tell you whether the
                      receiver disliked the payload, the signature or the
                      event type. This is what it actually said. */}
                  <Show when={attempt.response_excerpt}>
                    <code class="queue-attempt-response">{attempt.response_excerpt}</code>
                  </Show>
                </div>
                <Show when={attempt.response_status != null}>
                  <span class="badge">HTTP {attempt.response_status}</span>
                </Show>
              </li>
            )}</For>
          </ol>
        </Show>
        <div class="form-actions right">
          <button class="ghost" onClick={() => setDetail(null)}>Close</button>
          <button disabled={busy() !== null} onClick={() => { void retry(data().delivery); setDetail(null) }}>Retry this delivery</button>
        </div>
      </>}</Show>
    </Dialog>
  </Card>
}
