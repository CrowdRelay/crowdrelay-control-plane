import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { errorMessage, formatTimestamp, relativeTime } from '../lib/format'
import { toast } from './ui/toast'
import { Dialog } from './Dialog'
import { EmptyState } from './ui/empty-state'
import { SectionIcon } from './SectionIcon'
import { SkeletonRows } from './Skeleton'
import { StatusBadge } from './StatusBadge'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { ErrorCard, PanelTitle, TabBar } from './layout'
import type { DeliveryDetails, DeliveryItem, OutboxItem } from '../lib/types'
import { NativeSelect } from './ui/native-select'

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
      toast.error(errorMessage(error, 'We couldn\'t load the delivery details. Try refreshing.'))
    } finally {
      setBusy(null)
    }
  }

  return <Card flat class="p-4">
    <div class="flex items-center justify-between gap-4 mb-3">
      <div>
        <PanelTitle icon={<SectionIcon name="list-checks" />}>What is stuck, and why</PanelTitle>
        <p>The outbox holds events leaving this system; deliveries are the attempts to send them. A dead row has used every attempt and will not move again on its own — read one before retrying the rest, because a bulk retry reproduces a bad one as fast as it reproduces a blip.</p>
      </div>
      <Show when={model.dataUpdatedAt}><span class="text-xs text-muted-foreground whitespace-nowrap">Updated {relativeTime(model.dataUpdatedAt)}</span></Show>
    </div>

    <div class="flex items-end gap-3 flex-wrap">
      <TabBar
        tabs={[
          { id: 'deliveries', label: 'Deliveries' },
          { id: 'outbox', label: 'Outbox' },
        ]}
        active={tab()}
        onChange={setTab}
      />
      <NativeSelect
        size="sm"
        value={status()}
        onChange={event => setStatus(event.currentTarget.value)}
        aria-label="Filter by status"
        class="mb-4 w-auto min-w-[120px]"
      >
        <option value="">Any status</option>
        <For each={STATUSES}>{value => <option value={value}>{value}</option>}</For>
      </NativeSelect>
    </div>

    <Show when={model.error}>
      <ErrorCard>{errorMessage(model.error, 'The queue could not be read')}</ErrorCard>
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
        <div class="grid gap-2">
          <For each={rows()}>{item => (
            <div class="flex justify-between items-center gap-3.5 p-3 border border-border-subtle rounded-lg bg-surface-1 transition-colors hover:border-border">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <strong>{item.event_type}</strong>
                  <StatusBadge status={item.status} tone={statusTone(item.status)} />
                </div>
                <small class="block mt-0.5 text-sm text-muted-foreground leading-relaxed">
                  <Show when={isDelivery(item)}>{`${(item as DeliveryItem).endpoint_name} · `}</Show>
                  attempt {isDelivery(item) ? (item as DeliveryItem).attempt_count : (item as OutboxItem).attempts} of {item.max_attempts}
                  {' · '}{errorLabel(item.last_error_kind)}
                  <Show when={isDelivery(item) && (item as DeliveryItem).last_response_status != null}>
                    {` · HTTP ${(item as DeliveryItem).last_response_status}`}
                  </Show>
                  {' · '}created {age(item.created_at)}
                </small>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <Show when={isDelivery(item)}>
                  <Button variant="ghost" size="sm" disabled={busy() === item.id} onClick={() => inspect(item as DeliveryItem)}>Inspect</Button>
                </Show>
                <Button writes variant="ghost" size="sm" disabled={busy() === item.id} onClick={() => retry(item)}>
                  {busy() === item.id ? 'Working…' : 'Retry'}
                </Button>
              </div>
            </div>
          )}</For>
        </div>
      </Show>
      </div>
    )}</Show>

    <Dialog
      open={detail() !== null}
      onClose={() => setDetail(null)}
      label="Delivery attempts"
      title={<span class="flex items-center gap-2">
        {detail()?.delivery.event_type.replace(/_/g, ' ')}
        <Show when={detail()}>{data => <StatusBadge status={data().delivery.status} tone={statusTone(data().delivery.status)} />}</Show>
      </span>}
      class="max-w-2xl"
      footer={<>
        <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>Close</Button>
        <Show when={detail()}>{data => <Button writes size="sm" disabled={busy() !== null} onClick={() => { void retry(data().delivery); setDetail(null) }}>Retry this delivery</Button>}</Show>
      </>}
    >
      <Show when={detail()}>{data => <>
        <p class="m-0 mb-3 text-sm text-muted-foreground">
          {data().delivery.endpoint_name}
          {data().delivery.endpoint_active ? '' : ' · endpoint disabled'}
          {' · '}attempt {data().delivery.attempt_count} of {data().delivery.max_attempts}
        </p>
        <Show when={data().attempts.length > 0} fallback={<p class="m-0 text-sm text-muted-foreground leading-relaxed">No attempt was recorded, which means it never left the queue.</p>}>
          <ol class="grid gap-2 max-h-80 m-0 list-none overflow-y-auto">
            <For each={data().attempts}>{attempt => (
              <li class="flex justify-between items-center gap-3 py-2.5 border-b border-border-subtle last:border-0">
                <div>
                  <strong>#{attempt.attempt_number} · {attempt.outcome}</strong>
                  <small class="block mt-0.5 text-sm text-muted-foreground leading-relaxed">{formatTimestamp(attempt.started_at)} · {attempt.duration_ms}ms · {errorLabel(attempt.error_kind)}</small>
                  {/* The status code alone cannot tell you whether the
                      receiver disliked the payload, the signature or the
                      event type. This is what it actually said. */}
                  <Show when={attempt.response_excerpt}>
                    <code class="block mt-1.5 p-2 border border-border-subtle rounded-sm bg-background text-secondary-foreground text-xs leading-relaxed whitespace-pre-wrap break-words max-h-36 overflow-auto">{attempt.response_excerpt}</code>
                  </Show>
                </div>
                <Show when={attempt.response_status != null}>
                  <Badge variant="muted">HTTP {attempt.response_status}</Badge>
                </Show>
              </li>
            )}</For>
          </ol>
        </Show>
      </>}</Show>
    </Dialog>
  </Card>
}
