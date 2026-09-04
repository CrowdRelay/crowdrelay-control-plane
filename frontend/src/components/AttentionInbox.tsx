import { For, Show, onMount } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import type { PendingActionSummary } from '../lib/types'
import { EmptyState } from './EmptyState'
import { SectionIcon } from './SectionIcon'
import { CONTEXT_LABELS, DECISION_KIND_LABELS, SUBJECT_KIND_LABELS, labelOr } from '../lib/opportunity-labels'

// The attention inbox — converts the operator-attention experience from an
// informational banner into a real action-oriented surface.
//
// Each entry shows: what needs attention, why, urgency, expected action,
// and consequence of inaction. Entries are tiered: URGENT / REVIEW /
// INFORMATIONAL.
//
// The data comes from the existing operations read model — no new fetch.
// The inbox is a reorganization of existing data, not a new data source.

export type AttentionItem = {
  id: string
  tier: 'urgent' | 'review' | 'informational'
  title: string
  detail: string
  consequence?: string
  action?: { label: string; to?: string; hash?: string }
}

export function AttentionInbox(props: {
  slug: string
  needsYou: PendingActionSummary[]
  deadJobs: number
  criticalAlerts: number
  staleReservations: number
  activeAlerts: number
  awaitingApproval: number
}) {
  const opsPath = () => `/tenants/${props.slug}/operations`

  const items = (): AttentionItem[] => {
    const list: AttentionItem[] = []

    // URGENT: dead deliveries, critical alerts, stale reservations
    if (props.deadJobs > 0) {
      list.push({
        id: 'dead-jobs',
        tier: 'urgent',
        title: `${props.deadJobs} dead queue item(s)`,
        detail: 'Dead outbox, webhook, or push deliveries that failed after all retries.',
        consequence: 'Events are not reaching their destinations.',
        action: { label: 'Retry', to: opsPath(), hash: '#dead-outbox' },
      })
    }
    if (props.criticalAlerts > 0) {
      list.push({
        id: 'critical-alerts',
        tier: 'urgent',
        title: `${props.criticalAlerts} critical watchdog alert(s)`,
        detail: 'Watchdog has raised critical alerts requiring immediate attention.',
        consequence: 'System health may be compromised.',
        action: { label: 'Inspect', to: opsPath(), hash: '#watchdog' },
      })
    }
    if (props.staleReservations > 0) {
      list.push({
        id: 'stale-reservations',
        tier: 'urgent',
        title: `${props.staleReservations} stale AREA reservation(s)`,
        detail: 'Voucher or ticket reward reservations that have been held too long.',
        consequence: 'Reservations may need to be released.',
        action: { label: 'Inspect', to: opsPath(), hash: '#reconciliation-findings' },
      })
    }

    // REVIEW: pending approvals, opportunities awaiting
    for (const action of props.needsYou.slice(0, 5)) {
      list.push({
        id: `approval-${action.id}`,
        tier: 'review',
        // Underscore-stripping is not naming: `agent.run.request` came through
        // untouched and `outreach_supply` as two lowercase words. Same
        // vocabulary the board and the scorecard read from.
        title: `Approve ${labelOr(DECISION_KIND_LABELS, action.action_kind)}`,
        detail: `${labelOr(CONTEXT_LABELS, action.context)} · ${labelOr(SUBJECT_KIND_LABELS, action.subject_kind)}`,
        consequence: action.approval_expires_at
          ? `Approval expires ${new Date(action.approval_expires_at).toLocaleDateString()}`
          : undefined,
        action: { label: 'Review', to: opsPath() },
      })
    }
    if (props.awaitingApproval > 0) {
      list.push({
        id: 'awaiting-approval',
        tier: 'review',
        title: `${props.awaitingApproval} opportunity(ies) awaiting decision`,
        detail: 'The brain has found opportunities that need your decision.',
        action: { label: 'Review', to: opsPath() },
      })
    }

    // INFORMATIONAL: active (non-critical) alerts
    if (props.activeAlerts > 0) {
      list.push({
        id: 'active-alerts',
        tier: 'informational',
        title: `${props.activeAlerts} active watchdog alert(s)`,
        detail: 'Non-critical alerts that may indicate emerging issues.',
        action: { label: 'Inspect', to: opsPath(), hash: '#watchdog' },
      })
    }

    return list
  }

  const total = () => items().length
  const urgent = () => items().filter(i => i.tier === 'urgent')
  const review = () => items().filter(i => i.tier === 'review')
  const informational = () => items().filter(i => i.tier === 'informational')

  // Deep-link from team emails: the URL hash may contain
  // `#needs-you&action={id}`. On mount, parse the action ID and scroll to
  // the matching inbox item, highlighting it briefly so the operator can
  // see which action the email was about.
  onMount(() => {
    const hash = window.location.hash
    const match = hash.match(/action=([0-9a-f-]+)/i)
    if (!match) return
    const actionId = match[1]
    const el = document.getElementById(`attention-item-approval-${actionId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('attention-item-highlighted')
    setTimeout(() => el.classList.remove('attention-item-highlighted'), 4000)
  })

  return <div class="attention-inbox">
    <div class="attention-inbox-head">
      <div>
        <span class="eyebrow">ATTENTION</span>
        <div class="attention-inbox-count">
          <SectionIcon name="inbox" />
          <span class="attention-inbox-count-badge">{total()}</span>
          <span>item{total() !== 1 ? 's' : ''} need{total() === 1 ? 's' : ''} your attention</span>
        </div>
      </div>
    </div>

    <Show when={total() === 0}>
      <EmptyState
        label="Nothing needs attention"
        hint="The system is operating autonomously. Items appear here when the brain needs your decision or when delivery issues occur."
      />
    </Show>

    <Show when={urgent().length > 0}>
      <div class="attention-tier attention-tier-urgent">
        <div class="attention-tier-head">
          Urgent <span class="attention-tier-count">{urgent().length}</span>
        </div>
        <For each={urgent()}>{item => <AttentionItemRow item={item} />}</For>
      </div>
    </Show>

    <Show when={review().length > 0}>
      <div class="attention-tier attention-tier-review">
        <div class="attention-tier-head">
          Review <span class="attention-tier-count">{review().length}</span>
        </div>
        <For each={review()}>{item => <AttentionItemRow item={item} />}</For>
      </div>
    </Show>

    <Show when={informational().length > 0}>
      <div class="attention-tier attention-tier-informational">
        <div class="attention-tier-head">
          Informational <span class="attention-tier-count">{informational().length}</span>
        </div>
        <For each={informational()}>{item => <AttentionItemRow item={item} />}</For>
      </div>
    </Show>
  </div>
}

function AttentionItemRow(props: { item: AttentionItem }) {
  const tierClass = () => `attention-action-${props.item.tier}`
  return <div id={`attention-item-${props.item.id}`} class={`attention-item attention-item-${props.item.tier}`}>
    <div class="attention-item-body">
      <strong>{props.item.title}</strong>
      <small>{props.item.detail}</small>
      <Show when={props.item.consequence}>
        <small class="attention-item-consequence">{props.item.consequence}</small>
      </Show>
    </div>
    <Show when={props.item.action}>
      <div class="attention-item-actions">
        <Show when={props.item.action!.to} fallback={
          <button class={tierClass()}>{props.item.action!.label}</button>
        }>
          <Link class={tierClass()} to={props.item.action!.to!}>{props.item.action!.label}</Link>
        </Show>
      </div>
    </Show>
  </div>
}
