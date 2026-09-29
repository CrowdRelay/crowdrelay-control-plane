import { For, Show, createSignal } from 'solid-js'
import { ClipboardCheck, Inbox, Send } from 'lucide-solid'
import { api } from '../lib/api'
import { formatIsoAge, formatTimestamp, httpUrl, relativeTime, humanizeToken } from '../lib/format'
import { toast } from './app/toast'
import { Dialog } from './Dialog'
import { EmptyState } from './ui/empty-state'
import { SectionIcon } from './SectionIcon'
import { StatusBadge } from './StatusBadge'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { Section } from './layout'
import { JourneyRail, JourneyCard, type JourneyStageSpec } from './Journey'
import { DeadQueuesPanel } from './DeadQueuesPanel'
import { UnpublishedDraftsPanel } from './UnpublishedDraftsPanel'
import type {
  DeliveryDetails,
  DeliveryItem,
  DeliveryResult,
  OutboxItem,
  TenantDeliveryReadModel,
} from '../lib/types'

// The delivery journey — what is stuck, and why, as a pipe rather than a
// table: drafted → queued → on the wire → landed, with the dead rows (the
// ones that will not move on their own) leading because they are the ask.
//
// Every row set rides the `tenant-delivery` read model — this panel fetches
// nothing but the lazy delivery-detail dialog. A section the tenant could
// not answer renders `—` on the rail and does not mount below; the page's
// degraded strip names it.
//
// The dead queues keep their working surface (DeadQueuesPanel): retry,
// clear and the failure reasons stay where the operator already knows them.
// Retry on a live row lands here too — the same mutation the dead list runs.

const IN_FLIGHT = new Set(['pending', 'processing'])

const statusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'delivered' || status === 'succeeded' ? 'good'
    : status === 'dead' || status === 'failed' ? 'bad'
      : IN_FLIGHT.has(status) ? 'warn'
        : 'muted'

const errorLabel = (kind: string | null | undefined) =>
  kind ? kind.replace(/_/g, ' ') : 'no error recorded'

const isDelivery = (item: OutboxItem | DeliveryItem): item is DeliveryItem =>
  'endpoint_name' in item

const oldestAge = (items: { created_at: string }[]): string | null => {
  const oldest = items.reduce<string | null>(
    (acc, item) => (acc === null || item.created_at < acc ? item.created_at : acc),
    null,
  )
  return oldest ? `oldest ${formatIsoAge(oldest)}` : null
}

export function DeliveryJourneyPanel(props: {
  slug: string
  model: () => TenantDeliveryReadModel
  onRefresh: () => void
}) {
  const [busy, setBusy] = createSignal<string | null>(null)
  const [detail, setDetail] = createSignal<DeliveryDetails | null>(null)

  const attention = () => props.model().attention
  const liveOutbox = () => (props.model().outbox ?? []).filter(item => IN_FLIGHT.has(item.status))
  const liveDeliveries = () => (props.model().deliveries ?? []).filter(item => IN_FLIGHT.has(item.status))
  const landed = () => props.model().delivery_results ?? []
  const drafts = () => attention()?.unpublished_drafts ?? []
  const draftTotal = () => drafts().reduce((n, c) => n + c.drafts, 0)
  const deadTotal = () => {
    const s = props.model().summary
    return s ? s.outbox.dead + s.deliveries.dead + s.push.dead : 0
  }

  const stages = (): JourneyStageSpec[] => [
    {
      key: 'stuck',
      label: 'Stuck',
      count: props.model().summary === null ? null : deadTotal(),
      waiting: deadTotal() > 0 ? deadTotal() : undefined,
      detail: props.model().summary === null ? null : deadTotal() > 0 ? 'will not retry on their own' : 'queues draining',
      anchor: 'delivery-stuck',
    },
    {
      key: 'drafted',
      label: 'Drafted',
      count: attention() === null || (attention()?.not_reported ?? []).includes('unpublished_drafts') ? null : draftTotal(),
      detail: draftTotal() > 0 ? 'waiting to publish' : null,
      anchor: 'delivery-drafted',
    },
    {
      key: 'queued',
      label: 'Queued',
      count: props.model().outbox === null ? null : liveOutbox().length,
      detail: liveOutbox().length > 0 ? oldestAge(liveOutbox()) : null,
      anchor: 'delivery-queued',
    },
    {
      key: 'wire',
      label: 'On the wire',
      count: props.model().deliveries === null ? null : liveDeliveries().length,
      detail: liveDeliveries().length > 0 ? oldestAge(liveDeliveries()) : null,
      anchor: 'delivery-wire',
    },
    {
      key: 'landed',
      label: 'Landed',
      count: props.model().delivery_results === null ? null : landed().length,
      detail: landed().length > 0 ? 'recent attempts' : null,
      anchor: 'delivery-landed',
    },
  ]

  const retry = async (item: OutboxItem | DeliveryItem) => {
    setBusy(item.id)
    try {
      const result = isDelivery(item)
        ? await api.retryDelivery(props.slug, item.id)
        : await api.retryOutbox(props.slug, item.id)
      toast.success(result.status === 'queued' ? 'Queued for another attempt.' : `Retry: ${humanizeToken(result.status)}`)
      props.onRefresh()
    } catch (error) {
      toast.error("Couldn't retry", error)
    } finally {
      setBusy(null)
    }
  }

  const inspect = async (item: DeliveryItem) => {
    setBusy(item.id)
    try {
      setDetail(await api.deliveryDetails(props.slug, item.id))
    } catch (error) {
      toast.error("Couldn't load delivery details", error)
    } finally {
      setBusy(null)
    }
  }

  return <>
    <JourneyRail stages={stages()} />

    {/* ── Stuck — the rows that gave up. The dead-queue working surface
        stays whole: read one before retrying the rest. A degraded
        attention section does not mount it — its empty states assert a
        clean queue, which is the one thing it cannot claim. ── */}
    <div id="delivery-stuck" class="scroll-mt-4">
      <Show when={attention() !== null}>
        <DeadQueuesPanel
          slug={props.slug}
          summary={props.model().summary}
          deadOutbox={attention()?.dead_outbox}
          deadDeliveries={attention()?.dead_deliveries}
          deadPush={attention()?.dead_push}
          error={null}
          isLoading={false}
          onRefresh={props.onRefresh}
        />
      </Show>
    </div>

    {/* ── Drafted — finished work no channel shipped ── */}
    <div id="delivery-drafted" class="scroll-mt-4">
      <Show when={attention() !== null}>
        <UnpublishedDraftsPanel
          drafts={drafts()}
          automatic={attention()?.automatic_queue}
          notReported={attention()?.not_reported ?? []}
        />
      </Show>
    </div>

    {/* ── Queued — outbox rows still in flight ── */}
    <div id="delivery-queued" class="scroll-mt-4">
      <Show when={props.model().outbox !== null}>
        <Section
          title="In the outbox"
          icon={<SectionIcon name="inbox" />}
          count={liveOutbox().length}
          description="Events leaving this system that have not reached an endpoint yet."
        >
          <Show
            when={liveOutbox().length > 0}
            fallback={<EmptyState icon={<ClipboardCheck />} label="Nothing queued" hint="Every event either went out or is in the dead list above." />}
          >
            <div class="grid gap-2">
              <For each={liveOutbox()}>{item => (
                <JourneyCard
                  title={<>{item.event_type.replace(/_/g, ' ')}</>}
                  badge={{ label: item.status, tone: statusTone(item.status) }}
                  meta={`attempt ${item.attempts} of ${item.max_attempts} · ${errorLabel(item.last_error_kind)} · created ${formatIsoAge(item.created_at)}`}
                  action={
                    <Button writes variant="ghost" size="sm" disabled={busy() === item.id} onClick={() => retry(item)}>
                      {busy() === item.id ? 'Working…' : 'Retry'}
                    </Button>
                  }
                />
              )}</For>
            </div>
          </Show>
        </Section>
      </Show>
    </div>

    {/* ── On the wire — delivery attempts in flight ── */}
    <div id="delivery-wire" class="scroll-mt-4">
      <Show when={props.model().deliveries !== null}>
        <Section
          title="On the wire"
          icon={<SectionIcon name="activity" />}
          count={liveDeliveries().length}
          description="Attempts to send queued events to their endpoints, still moving."
        >
          <Show
            when={liveDeliveries().length > 0}
            fallback={<EmptyState icon={<Send />} label="Nothing on the wire" hint="No delivery attempt is in flight right now." />}
          >
            <div class="grid gap-2">
              <For each={liveDeliveries()}>{item => (
                <JourneyCard
                  title={<>{item.event_type.replace(/_/g, ' ')}</>}
                  badge={{ label: item.status, tone: statusTone(item.status) }}
                  meta={`${item.endpoint_name} · attempt ${item.attempt_count} of ${item.max_attempts} · ${errorLabel(item.last_error_kind)}${item.last_response_status != null ? ` · HTTP ${item.last_response_status}` : ''} · created ${formatIsoAge(item.created_at)}`}
                  action={
                    <div class="flex items-center gap-2">
                      <Button variant="ghost" size="sm" disabled={busy() === item.id} onClick={() => inspect(item)}>Inspect</Button>
                      <Button writes variant="ghost" size="sm" disabled={busy() === item.id} onClick={() => retry(item)}>
                        {busy() === item.id ? 'Working…' : 'Retry'}
                      </Button>
                    </div>
                  }
                />
              )}</For>
            </div>
          </Show>
        </Section>
      </Show>
    </div>

    {/* ── Landed — the recent delivery-results ledger ── */}
    <div id="delivery-landed" class="scroll-mt-4">
      <Show when={props.model().delivery_results !== null}>
        <Section
          title="Landed"
          icon={<SectionIcon name="target" />}
          count={landed().length}
          description="Content the system actually put somewhere — where it landed and the engagement it earned."
        >
          <Show
            when={landed().length > 0}
            fallback={<EmptyState icon={<Inbox />} label="Nothing landed yet" hint="When a send or a post reaches its channel, the receipt lands here." />}
          >
            <div class="grid gap-2">
              <For each={landed()}>{item => (
                <JourneyCard
                  title={<>{item.kind ? `${item.kind.replace(/_/g, ' ')} — ` : ''}{item.channel}</>}
                  badge={{ label: item.status, tone: statusTone(item.status) }}
                  meta={landedMeta(item)}
                  action={
                    <Show when={httpUrl(item.url)}>
                      {url => (
                        <a href={url()} target="_blank" rel="noreferrer" class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                          Open
                        </a>
                      )}
                    </Show>
                  }
                />
              )}</For>
            </div>
          </Show>
        </Section>
      </Show>
    </div>

    {/* The attempt ledger for one delivery — lazy, on inspect only. */}
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
              <li class="flex justify-between items-center gap-3 py-2.5 border-b border-border last:border-0">
                <div>
                  <strong>#{attempt.attempt_number} · {attempt.outcome}</strong>
                  <small class="block mt-0.5 text-sm text-muted-foreground leading-relaxed">{formatTimestamp(attempt.started_at)} · {attempt.duration_ms}ms · {errorLabel(attempt.error_kind)}</small>
                  {/* The status code alone cannot tell you whether the
                      receiver disliked the payload, the signature or the
                      event type. This is what it actually said. */}
                  <Show when={attempt.response_excerpt}>
                    <code class="block mt-1.5 p-2 border border-border rounded-sm bg-background text-secondary-foreground text-xs leading-relaxed whitespace-pre-wrap break-words max-h-36 overflow-auto">{attempt.response_excerpt}</code>
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
  </>
}

function landedMeta(item: DeliveryResult): string {
  const parts: string[] = []
  if (item.posted_at) parts.push(`posted ${relativeTime(new Date(item.posted_at).getTime())}`)
  else parts.push(`recorded ${formatIsoAge(item.created_at)}`)
  if (item.score != null) parts.push(`score ${item.score}`)
  if (item.upvotes != null) parts.push(`${item.upvotes} upvotes`)
  if (item.num_comments != null) parts.push(`${item.num_comments} comments`)
  if (item.error_message) parts.push(item.error_message)
  return parts.join(' · ')
}
