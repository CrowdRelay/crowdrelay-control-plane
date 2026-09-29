import { For, Show, createSignal } from 'solid-js'
import { CircleCheck } from 'lucide-solid'
import { ErrorCard } from './layout'
import { failureLine } from '../lib/errors'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { capabilityAction } from '../lib/capabilities'
import { confidencePercent, money } from '../lib/format'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'
import { refreshQueries } from '../lib/refresh'
import { EmptyState } from './ui/empty-state'
import type { ReplyTriageEntry, WaitingReply } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { SkeletonReplyTriage } from './Skeleton'
import { SectionIcon } from './SectionIcon'
import { Metric, MetricRow } from './ui/metric'
import { Button } from './app/button'
import { SurfaceAction } from './capabilities/SurfaceAction'

const timeAgo = (value: string | null | undefined) => {
  if (!value) return 'never'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  const seconds = Math.floor((Date.now() - parsed.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const dispositionTone = (disp: string | null): 'good' | 'warn' | 'bad' | 'muted' => {
  if (!disp) return 'muted'
  if (disp === 'positive') return 'good'
  if (disp === 'declined') return 'warn'
  if (disp === 'do_not_contact') return 'bad'
  return 'muted'
}

const dispositionLabel = (disp: string | null) =>
  disp ?? 'pending'

const reasonLabel = (reason: string | null) => {
  const labels: Record<string, string> = {
    ambiguous_text: 'Ambiguous text',
    not_in_supported_language: 'Not in supported language',
    too_short: 'Too short',
    previous_do_not_contact: 'Previous DNC',
    unmatched_text: 'Unmatched',
    negotiation_reply: 'Negotiation reply',
  }
  return reason ? (labels[reason] ?? reason) : null
}

const targetKindLabel = (kind: string) =>
  kind.replace(/_/g, ' ')


export function ReplyTriagePanel() {
  const params = useParams({ from: '/tenants/$slug/operations' })
  // The reply queue rides the tenant's /today snapshot — same query key the
  // page already holds, so this subscriber adds no request of its own.
  const model = useQuery(() => ({
    queryKey: ['tenant-today', params().slug],
    queryFn: () => api.tenantToday(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // Same retry rule the page carries — every observer of a shared key
    // must poll a degraded section until it fills, or this subscriber's
    // "retrying" note would lie when it ever mounts alone.
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))

  const data = () => model.data?.reply_triage
  const waiting = () => data()?.waiting_on_you ?? []
  const waitingCount = () => data()?.summary.waiting_on_you_count ?? waiting().length
  const [showAllWaiting, setShowAllWaiting] = createSignal(false)
  // Everything here that asks a person for something: replies to read, and
  // people who answered and have not heard back.
  const openCount = () => (data()?.summary.needs_human_count ?? 0) + waitingCount()

  const [showAllNeedsHuman, setShowAllNeedsHuman] = createSignal(false)
  const [showAllRecentAuto, setShowAllRecentAuto] = createSignal(false)
  const MAX_VISIBLE = 10

  return <div class="space-y-4">
    <div class="flex items-start justify-between gap-4">
      <p class="text-sm text-muted-foreground">{authState.isPlatformLevel() ? 'Inbound replies the classifier could not resolve on its own. Read the text, then decide.' : 'Inbound replies it could not sort on its own. Read the text, then decide.'}</p>
      <Show when={data()}>
        <StatusBadge
          status={openCount() > 0 ? `${openCount()} waiting` : 'clear'}
          tone={openCount() > 0 ? 'warn' : 'good'}
        />
      </Show>
    </div>

    <Show when={model.error}>
      <ErrorCard class="mt-4" title="Couldn't load replies" error={model.error} onRetry={() => void model.refetch()} />
    </Show>

    <Show when={!model.error && model.isPending}><SkeletonReplyTriage /></Show>

    {/* The today snapshot loaded but the tenant's triage section did not —
        degraded, not empty. The page retries until it fills; say so instead
        of leaving a blank tab. */}
    <Show when={model.data && !data()}>
      <div class="rounded-lg border border-warning-foreground/30 bg-warning-foreground/10 p-4 text-sm text-warning-foreground mt-4" role="status">
        {authState.isPlatformLevel() ? 'Reply triage did not answer — retrying shortly.' : 'The replies list did not answer — retrying shortly.'}
      </div>
    </Show>

    <Show when={data()}>{d => <>
      {/* Summary: the same metric rail every page uses. The word "classified"
          used to be coloured green, orange and red under three static labels,
          which read as three states when it was one word. */}
      <MetricRow min="9rem">
        <Metric label="Needs a human" value={d().summary.needs_human_count} tone={d().summary.needs_human_count > 0 ? 'warn' : 'default'} sub="awaiting review" />
        <Metric label="Auto positive" value={d().summary.auto_positive_count} sub="classified" />
        <Metric label="Auto declined" value={d().summary.auto_declined_count} sub="classified" />
        <Metric label="Do not contact" value={d().summary.auto_do_not_contact_count} sub="classified" />
        <Show when={d().summary.pending_count > 0}>
          <Metric label="Pending" value={d().summary.pending_count} tone="warn" sub="queued for classification" />
        </Show>
      </MetricRow>

      {/* Answered you. The classifier's queue only sees replies that went
          through it; people who answered by a route it never reads — the
          reply form, the sheet import — were invisible here while they
          waited. Their last word is theirs, so the next move is the act's. */}
      <Show when={waitingCount() > 0}>
        <section id="answered" class="pt-2">
          <div class="flex justify-between gap-4 items-start">
            <div>
              <h3 class="flex items-center gap-2 text-sm font-semibold text-foreground"><SectionIcon name="mail" />Answered you — your turn</h3>
              <p class="mt-1 text-sm text-muted-foreground">
                {authState.isPlatformLevel()
                  ? 'Contacts whose latest logged message is inbound, from the outreach interaction ledger. A declined or do-not-contact answer closes the row; an outbound message logged after the reply ("I wrote back") does too.'
                  : 'They wrote back and nobody has answered them since. Reply from your mailbox, then press "I wrote back" — or log their answer if it was a no.'}
              </p>
            </div>
          </div>
          <div class="flex flex-col mt-3">
            <For each={showAllWaiting() ? waiting() : waiting().slice(0, MAX_VISIBLE)}>{contact => <WaitingRow contact={contact} slug={params().slug} />}</For>
          </div>
          <Show when={waitingCount() > waiting().length}>
            <p class="mt-2 text-xs text-muted-foreground">{waitingCount() - waiting().length} more not listed — the oldest are cut first.</p>
          </Show>
          <Show when={waiting().length > MAX_VISIBLE}>
            <Button variant="ghost" size="sm" class="mt-3" onClick={() => setShowAllWaiting(s => !s)}>
              {showAllWaiting() ? 'Show fewer' : `Show all ${waiting().length}`}
            </Button>
          </Show>
        </section>
      </Show>

      {/* Needs human */}
      <section class={waitingCount() > 0 ? 'pt-4 border-t border-border' : 'pt-2'}>
        <div class="flex justify-between gap-4 items-start">
          <div><h3 class="flex items-center gap-2 text-sm font-semibold text-foreground"><SectionIcon name="mail" />Read these</h3></div>
        </div>
        <Show
          when={d().needs_human.length > 0}
          fallback={<EmptyState icon={<CircleCheck />} label="No replies need human review" hint={authState.isPlatformLevel() ? 'The agent handles routine replies automatically. Items that need a human touch appear here.' : 'It handles routine replies on its own. Items that need a person appear here.'} />}
        >
          <div class="flex flex-col mt-3">
            <For each={showAllNeedsHuman() ? d().needs_human : d().needs_human.slice(0, MAX_VISIBLE)}>{entry => <ReplyRow entry={entry} slug={params().slug} actionable />}</For>
          </div>
          <Show when={d().needs_human.length > MAX_VISIBLE}>
            <Button variant="ghost" size="sm" class="mt-3" onClick={() => setShowAllNeedsHuman(s => !s)}>
              {showAllNeedsHuman() ? 'Show fewer' : `Show all ${d().needs_human.length}`}
            </Button>
          </Show>
        </Show>
      </section>

      {/* Recent auto */}
      <Show when={d().recent_auto.length > 0}>
        <section class="pt-4 border-t border-border">
          <div class="flex justify-between gap-4 items-start">
            <div><h3 class="flex items-center gap-2 text-sm font-semibold text-foreground"><SectionIcon name="zap" />Classified without a human</h3></div>
          </div>
          <div class="flex flex-col mt-3">
            <For each={showAllRecentAuto() ? d().recent_auto : d().recent_auto.slice(0, MAX_VISIBLE)}>{entry => <ReplyRow entry={entry} slug={params().slug} />}</For>
          </div>
          <Show when={d().recent_auto.length > MAX_VISIBLE}>
            <Button variant="ghost" size="sm" class="mt-3" onClick={() => setShowAllRecentAuto(s => !s)}>
              {showAllRecentAuto() ? 'Show fewer' : `Show all ${d().recent_auto.length}`}
            </Button>
          </Show>
        </section>
      </Show>
    </>}</Show>
  </div>
}

function ReplyRow(props: { entry: ReplyTriageEntry; slug: string; actionable?: boolean }) {
  const [busy, setBusy] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)

  const resolve = async (disposition: string) => {
    if (busy()) return
    setBusy(disposition)
    setError(null)
    try {
      await api.recordBeaconReply(props.slug, props.entry.target_id, {
        eventId: props.entry.id,
        disposition,
        occurredAt: new Date().toISOString(),
      })
      refreshQueries(['tenant-today', props.slug])
    } catch (err) {
      setError(failureLine("Couldn't save the reply status", err))
    } finally {
      setBusy(null)
    }
  }

  return <div class="flex items-start justify-between gap-3 py-3 border-b border-border last:border-0">
    <div class="min-w-0 flex-1">
      <strong class="block text-foreground">{targetKindLabel(props.entry.target_kind)}</strong>
      <small class="block text-muted-foreground text-sm">{props.entry.reply_text}</small>
      <Show when={reasonLabel(props.entry.human_review_reason)}>
        {r => <small class="block text-muted-foreground text-sm">reason: {r()}</small>}
      </Show>
      <Show when={props.entry.proposed_fee_minor != null && props.entry.proposed_currency != null}>
        <small class="block text-sm text-foreground">
          proposed {money(props.entry.proposed_fee_minor!, props.entry.proposed_currency!)} — confirm on the Negotiations tab
        </small>
      </Show>
      <Show when={props.entry.matched_rules.length > 0}>
        <small class="block text-muted-foreground text-sm">rules: {props.entry.matched_rules.join(', ')}</small>
      </Show>
      <small class="block text-muted-foreground text-sm">{timeAgo(props.entry.classified_at)} · {confidencePercent(props.entry.confidence_basis_points)}</small>
      <Show when={error()}><small class="block text-destructive text-sm">{error()}</small></Show>
    </div>
    <div class="flex flex-col items-end gap-2 flex-shrink-0">
      <StatusBadge
        status={dispositionLabel(props.entry.classified_disposition)}
        tone={dispositionTone(props.entry.classified_disposition)}
      />
      <Show when={props.actionable}>
        <div class="flex gap-1.5 flex-wrap justify-end">
          <Button writes
            variant="ghost"
            size="sm"
            class="text-success-foreground"
            disabled={busy() !== null}
            onClick={() => resolve('positive')}
            title="Mark as positive — the contact is interested"
          >{busy() === 'positive' ? '…' : 'Positive'}</Button>
          <Button writes
            variant="ghost"
            size="sm"
            class="text-warning-foreground"
            disabled={busy() !== null}
            onClick={() => resolve('declined')}
            title="Mark as declined — the contact said no"
          >{busy() === 'declined' ? '…' : 'Declined'}</Button>
          <Button writes
            variant="ghost"
            size="sm"
            class="text-destructive"
            disabled={busy() !== null}
            onClick={() => resolve('do_not_contact')}
            title="Do not contact — stop all outreach to this contact"
          >{busy() === 'do_not_contact' ? '…' : 'DNC'}</Button>
        </div>
      </Show>
    </div>
  </div>
}

/** Now, in the shape a datetime-local input takes: the answer being logged
 *  is usually today's, and the form needs one to submit. */
const localNow = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function WaitingRow(props: { contact: WaitingReply; slug: string }) {
  const queryClient = useQueryClient()
  const c = () => props.contact
  return <div class="flex flex-wrap items-start justify-between gap-3 py-3 border-b border-border last:border-0">
    <div class="min-w-0 flex-1">
      <strong class="block text-foreground">{c().display_name}</strong>
      <small class="block text-muted-foreground text-sm">
        {[targetKindLabel(c().target_kind), c().reply_label].filter(Boolean).join(' · ')}
      </small>
      <small class="block text-muted-foreground text-sm">
        answered {timeAgo(c().replied_at)}
        {c().last_written_at ? ` · you last wrote ${timeAgo(c().last_written_at)}` : ' · no message from you on record'}
      </small>
    </div>
    <div class="flex flex-col items-end gap-2 flex-shrink-0">
      <StatusBadge status={c().disposition} tone={dispositionTone(c().disposition)} />
      <SurfaceAction
        slug={props.slug}
        size="xs"
        variant="outline"
        action={capabilityAction('outreach-conversations', 'I wrote back')}
        label="I wrote back"
        fixed={{ target_id: c().target_id }}
        initial={{ occurred_at: localNow() }}
        onDone={() => void queryClient.invalidateQueries({ queryKey: ['tenant-today', props.slug] })}
      />
      <SurfaceAction
        slug={props.slug}
        size="xs"
        variant="ghost"
        action={capabilityAction('outreach-replies', 'Record a reply')}
        label="Log their answer"
        fixed={{ target_id: c().target_id }}
        initial={{ disposition: c().disposition, occurred_at: localNow() }}
        hidden={['opportunity_id']}
        onDone={() => void queryClient.invalidateQueries({ queryKey: ['tenant-today', props.slug] })}
      />
    </div>
  </div>
}
