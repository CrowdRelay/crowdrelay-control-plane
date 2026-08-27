import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { refreshInterval } from '../lib/refresh'
import type { ReplyTriageEntry } from '../lib/types'
import { StatusBadge } from './StatusBadge'

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
    refetchInterval: refreshInterval() || false,
    refetchOnWindowFocus: false,
    staleTime: 20_000,
  }))

  const data = () => model.data

  return <article class="panel operations-panel">
    <div class="section-title operations-title">
      <div>
        <span class="eyebrow">REPLY TRIAGE</span>
        <h2>Replies needing a human</h2>
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

    <Show when={!model.error && model.isPending}><div class="mini-skeleton" /></Show>

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
          <div><span class="eyebrow">NEEDS HUMAN</span><h3>Read these</h3></div>
        </div>
        <Show
          when={d().needs_human.length > 0}
          fallback={<div class="inherit-card"><p>No replies need human review right now.</p></div>}
        >
          <div class="flag-list">
            <For each={d().needs_human}>{entry => <ReplyRow entry={entry} />}</For>
          </div>
        </Show>
      </section>

      {/* Recent auto */}
      <Show when={d().recent_auto.length > 0}>
        <section class="operations-section">
          <div class="operations-section-head">
            <div><span class="eyebrow">RECENT AUTO</span><h3>Classified without a human</h3></div>
          </div>
          <div class="flag-list">
            <For each={d().recent_auto}>{entry => <ReplyRow entry={entry} />}</For>
          </div>
        </section>
      </Show>
    </>}</Show>
  </article>
}

function ReplyRow(props: { entry: ReplyTriageEntry }) {
  return <div class="flag-row release-component-row">
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
    </div>
    <div class="row-health">
      <StatusBadge
        status={dispositionLabel(props.entry.classified_disposition)}
        tone={dispositionTone(props.entry.classified_disposition)}
      />
    </div>
  </div>
}
