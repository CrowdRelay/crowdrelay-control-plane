import { For, Show, createResource, createSignal } from 'solid-js'
import { api } from '../lib/api'
import { errorMessage, formatTimestamp } from '../lib/format'
import { refreshTick } from '../lib/refresh'
import { toast } from '../lib/toast'
import { Dialog } from './Dialog'
import { EmptyState } from './EmptyState'
import { SectionIcon } from './SectionIcon'
import { SkeletonRows } from './Skeleton'
import { StatusBadge } from './StatusBadge'
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
  const [localRefresh, setLocalRefresh] = createSignal(0)

  const source = () => ({ tab: tab(), status: status(), tick: refreshTick() + localRefresh(), slug: props.slug })

  const [items, { refetch }] = createResource(source, async (key) => {
    const params = { limit: 50, status: key.status || undefined }
    return key.tab === 'outbox'
      ? await api.listOutbox(key.slug, params) as (OutboxItem | DeliveryItem)[]
      : await api.listDeliveries(key.slug, params) as (OutboxItem | DeliveryItem)[]
  })

  const isDelivery = (item: OutboxItem | DeliveryItem): item is DeliveryItem =>
    'endpoint_name' in item

  const retry = async (item: OutboxItem | DeliveryItem) => {
    setBusy(item.id)
    try {
      const result = isDelivery(item)
        ? await api.retryDelivery(props.slug, item.id)
        : await api.retryOutbox(props.slug, item.id)
      toast.success(result.status === 'queued' ? 'Queued for another attempt.' : `Retry: ${result.status}`)
      setLocalRefresh(v => v + 1)
      await refetch()
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

  return <article class="panel queue-panel">
    <div class="section-title">
      <div>
        <span class="eyebrow">QUEUES</span>
        <h2><SectionIcon name="list-checks" />What is stuck, and why</h2>
        <p>The outbox holds events leaving this system; deliveries are the webhook attempts against your endpoints. A dead row has used every attempt and will not move again on its own — read one before retrying the rest, because a bulk retry reproduces a bad payload as fast as it reproduces a blip.</p>
      </div>
    </div>

    <div class="queue-controls">
      <div class="ui-tabs queue-tabs">
        <button class="ui-tab" classList={{ active: tab() === 'deliveries' }} onClick={() => setTab('deliveries')}>Deliveries</button>
        <button class="ui-tab" classList={{ active: tab() === 'outbox' }} onClick={() => setTab('outbox')}>Outbox</button>
      </div>
      <label class="compact-field queue-filter">
        <span>Status</span>
        <select value={status()} onChange={event => setStatus(event.currentTarget.value)}>
          <option value="">Any status</option>
          <For each={STATUSES}>{value => <option value={value}>{value}</option>}</For>
        </select>
      </label>
    </div>

    <Show when={items.error}>
      <div class="error-card" role="alert">{errorMessage(items.error, 'The queue could not be read')}</div>
    </Show>

    <Show when={items.loading && !items()}><SkeletonRows count={3} /></Show>

    <Show when={items()}>{rows => (
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
    )}</Show>

    <Dialog open={detail() !== null} onClose={() => setDetail(null)} label="Delivery attempts" class="dialog-panel queue-detail-dialog">
      <Show when={detail()}>{data => <>
        <div class="section-title"><div><span class="eyebrow">DELIVERY</span><h2>{data().delivery.event_type}</h2></div>
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
  </article>
}
