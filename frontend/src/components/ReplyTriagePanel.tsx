import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { refreshQueries } from '../lib/refresh'
import { EmptyState } from './EmptyState'
import type { ReplyTriageEntry } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { SkeletonReplyTriage } from './Skeleton'
import { SectionIcon } from './SectionIcon'
import { Card } from './ui/card'

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

const confidencePercent = (bps: number) =>
  `${(bps / 100).toFixed(0)}%`

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

  return <Card class="p-4 operations-panel">
    <div class="flex items-center justify-between gap-4 mt-6 mb-3 operations-title">
      <div>
        <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">REPLY TRIAGE</span>
        <h2><SectionIcon name="inbox" />Replies needing a human</h2>
        <p>Inbound replies the classifier could not resolve automatically. Read the text, then decide.</p>
      </div>
      <Show when={data()}>
        <StatusBadge
          status={data()!.summary.needs_human_count > 0 ? `${data()!.summary.needs_human_count} waiting` : 'clear'}
          tone={data()!.summary.needs_human_count > 0 ? 'warn' : 'good'}
        />
      </Show>
    </div>

    <Show when={model.error}>
      <div class="warning-card operations-warning" role="status">
        {model.error instanceof Error ? model.error.message : 'Reply triage is temporarily unavailable.'}
      </div>
    </Show>

    <Show when={!model.error && model.isPending}><SkeletonReplyTriage /></Show>

    <Show when={data()}>{d => <>
      {/* Summary */}
      <div class="operations-metrics">
        <div>
          <span>Needs human</span>
          <strong>{d().summary.needs_human_count}</strong>
          <small>awaiting review</small>
        </div>
        <div>
          <span>Auto positive</span>
          <strong>{d().summary.auto_positive_count}</strong>
          <small class="tone-good">classified</small>
        </div>
        <div>
          <span>Auto declined</span>
          <strong>{d().summary.auto_declined_count}</strong>
          <small class="tone-warn">classified</small>
        </div>
        <div>
          <span>Auto DNC</span>
          <strong>{d().summary.auto_do_not_contact_count}</strong>
          <small class="tone-bad">classified</small>
        </div>
        <Show when={d().summary.pending_count > 0}>
          <div class="operations-attention">
            <strong>Pending</strong>
            <span>{d().summary.pending_count} reply(ies) queued for classification</span>
          </div>
        </Show>
      </div>

      {/* Needs human */}
      <section class="operations-section">
        <div class="operations-section-head">
          <div><span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">NEEDS HUMAN</span><h3><SectionIcon name="mail" />Read these</h3></div>
        </div>
        <Show
          when={d().needs_human.length > 0}
          fallback={<EmptyState label="No replies need human review" hint="The agent handles routine replies automatically. Items that need a human touch appear here." />}
        >
          <div class="flag-list">
            <For each={showAllNeedsHuman() ? d().needs_human : d().needs_human.slice(0, MAX_VISIBLE)}>{entry => <ReplyRow entry={entry} slug={params().slug} actionable />}</For>
          </div>
          <Show when={d().needs_human.length > MAX_VISIBLE}>
            <button class="ghost" onClick={() => setShowAllNeedsHuman(s => !s)}>
              {showAllNeedsHuman() ? 'Show less' : `Show all (${d().needs_human.length})`}
            </button>
          </Show>
        </Show>
      </section>

      {/* Recent auto */}
      <Show when={d().recent_auto.length > 0}>
        <section class="operations-section">
          <div class="operations-section-head">
            <div><span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">RECENT AUTO</span><h3><SectionIcon name="zap" />Classified without a human</h3></div>
          </div>
          <div class="flag-list">
            <For each={showAllRecentAuto() ? d().recent_auto : d().recent_auto.slice(0, MAX_VISIBLE)}>{entry => <ReplyRow entry={entry} slug={params().slug} />}</For>
          </div>
          <Show when={d().recent_auto.length > MAX_VISIBLE}>
            <button class="ghost" onClick={() => setShowAllRecentAuto(s => !s)}>
              {showAllRecentAuto() ? 'Show less' : `Show all (${d().recent_auto.length})`}
            </button>
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

  return <div class="flag-row release-component-row reply-triage-row">
    <div>
      <strong>{targetKindLabel(props.entry.target_kind)}</strong>
      <small class="reply-text">{props.entry.reply_text}</small>
      <Show when={reasonLabel(props.entry.human_review_reason)}>
        {r => <small>reason: {r()}</small>}
      </Show>
      <Show when={props.entry.matched_rules.length > 0}>
        <small>rules: {props.entry.matched_rules.join(', ')}</small>
      </Show>
      <small>{timeAgo(props.entry.classified_at)} · {confidencePercent(props.entry.confidence_basis_points)}</small>
      <Show when={error()}><small class="agent-error">{error()}</small></Show>
    </div>
    <div class="row-health reply-triage-actions">
      <StatusBadge
        status={dispositionLabel(props.entry.classified_disposition)}
        tone={dispositionTone(props.entry.classified_disposition)}
      />
      <Show when={props.actionable}>
        <div class="reply-triage-buttons">
          <button
            class="ghost reply-btn reply-btn-good"
            disabled={busy() !== null}
            onClick={() => resolve('positive')}
            title="Mark as positive — the contact is interested"
          >{busy() === 'positive' ? '…' : 'Positive'}</button>
          <button
            class="ghost reply-btn reply-btn-warn"
            disabled={busy() !== null}
            onClick={() => resolve('declined')}
            title="Mark as declined — the contact said no"
          >{busy() === 'declined' ? '…' : 'Declined'}</button>
          <button
            class="ghost reply-btn reply-btn-bad"
            disabled={busy() !== null}
            onClick={() => resolve('do_not_contact')}
            title="Do not contact — stop all outreach to this contact"
          >{busy() === 'do_not_contact' ? '…' : 'DNC'}</button>
        </div>
      </Show>
    </div>
  </div>
}
