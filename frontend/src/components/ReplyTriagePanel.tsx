import { For, Show, createSignal } from 'solid-js'
import { PanelTitle } from './layout'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { confidencePercent, errorMessage } from '../lib/format'
import { refreshQueries } from '../lib/refresh'
import { EmptyState } from './ui/empty-state'
import type { ReplyTriageEntry } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { SkeletonReplyTriage } from './Skeleton'
import { SectionIcon } from './SectionIcon'
import { Card } from './ui/card'
import { Button } from './ui/button'

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
  }
  return reason ? (labels[reason] ?? reason) : null
}

const targetKindLabel = (kind: string) =>
  kind.replace(/_/g, ' ')


export function ReplyTriagePanel() {
  const params = useParams({ from: '/tenants/$slug/operations' })
  const model = useQuery(() => ({
    queryKey: ['reply-triage', params().slug],
    queryFn: () => api.replyTriage(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 20_000,
  }))

  const data = () => model.data

  const [showAllNeedsHuman, setShowAllNeedsHuman] = createSignal(false)
  const [showAllRecentAuto, setShowAllRecentAuto] = createSignal(false)
  const MAX_VISIBLE = 10

  return <Card flat class="p-4">
    <div class="flex items-start justify-between gap-4 mb-3">
      <div>
        <PanelTitle icon={<SectionIcon name="inbox" />}>Replies needing a human</PanelTitle>
        <p class="mt-1 text-sm text-muted-foreground leading-relaxed">Inbound replies the classifier could not resolve automatically. Read the text, then decide.</p>
      </div>
      <Show when={data()}>
        <StatusBadge
          status={data()!.summary.needs_human_count > 0 ? `${data()!.summary.needs_human_count} waiting` : 'clear'}
          tone={data()!.summary.needs_human_count > 0 ? 'warn' : 'good'}
        />
      </Show>
    </div>

    <Show when={model.error}>
      <div class="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning mt-4" role="status">
        {model.error instanceof Error ? model.error.message : 'Reply triage is temporarily unavailable.'}
      </div>
    </Show>

    <Show when={!model.error && model.isPending}><SkeletonReplyTriage /></Show>

    <Show when={data()}>{d => <>
      {/* Summary */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <div>
          <span class="block text-muted-foreground text-sm">Needs human</span>
          <strong class="block my-1.5 text-foreground">{d().summary.needs_human_count}</strong>
          <small class="block text-muted-foreground text-sm">awaiting review</small>
        </div>
        <div>
          <span class="block text-muted-foreground text-sm">Auto positive</span>
          <strong class="block my-1.5 text-foreground">{d().summary.auto_positive_count}</strong>
          <small class="block text-success text-sm">classified</small>
        </div>
        <div>
          <span class="block text-muted-foreground text-sm">Auto declined</span>
          <strong class="block my-1.5 text-foreground">{d().summary.auto_declined_count}</strong>
          <small class="block text-warning text-sm">classified</small>
        </div>
        <div>
          <span class="block text-muted-foreground text-sm">Auto DNC</span>
          <strong class="block my-1.5 text-foreground">{d().summary.auto_do_not_contact_count}</strong>
          <small class="block text-destructive text-sm">classified</small>
        </div>
        <Show when={d().summary.pending_count > 0}>
          <div class="flex flex-wrap gap-2 col-span-full p-3 border border-warning rounded-md bg-card text-warning">
            <strong class="text-foreground">Pending</strong>
            <span class="text-sm text-secondary-foreground">{d().summary.pending_count} reply(ies) queued for classification</span>
          </div>
        </Show>
      </div>

      {/* Needs human */}
      <section class="mt-6 pt-4 border-t border-border">
        <div class="flex justify-between gap-4 items-start">
          <div><h3 class="flex items-center gap-2 text-sm font-semibold text-foreground"><SectionIcon name="mail" />Read these</h3></div>
        </div>
        <Show
          when={d().needs_human.length > 0}
          fallback={<EmptyState label="No replies need human review" hint="The agent handles routine replies automatically. Items that need a human touch appear here." />}
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
        <section class="mt-6 pt-4 border-t border-border">
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
  </Card>
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
      refreshQueries(['reply-triage', props.slug])
    } catch (err) {
      setError(errorMessage(err, 'Failed to record the disposition'))
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
            class="text-success"
            disabled={busy() !== null}
            onClick={() => resolve('positive')}
            title="Mark as positive — the contact is interested"
          >{busy() === 'positive' ? '…' : 'Positive'}</Button>
          <Button writes
            variant="ghost"
            size="sm"
            class="text-warning"
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
