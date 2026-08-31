import { For, Show } from 'solid-js'
import type { PendingActionSummary } from '../lib/types'
import { EmptyState } from './EmptyState'

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
  action?: { label: string; href?: string }
}

export function AttentionInbox(props: {
  needsYou: PendingActionSummary[]
  deadJobs: number
  criticalAlerts: number
  staleReservations: number
  activeAlerts: number
  awaitingApproval: number
}) {
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
        action: { label: 'Retry', href: '#dead-outbox' },
      })
    }
    if (props.criticalAlerts > 0) {
      list.push({
        id: 'critical-alerts',
        tier: 'urgent',
        title: `${props.criticalAlerts} critical watchdog alert(s)`,
        detail: 'Watchdog has raised critical alerts requiring immediate attention.',
        consequence: 'System health may be compromised.',
      })
    }
    if (props.staleReservations > 0) {
      list.push({
        id: 'stale-reservations',
        tier: 'urgent',
        title: `${props.staleReservations} stale AREA reservation(s)`,
        detail: 'Voucher or ticket reward reservations that have been held too long.',
        consequence: 'Reservations may need to be released.',
        action: { label: 'Inspect', href: '#reconciliation-findings' },
      })
    }

    // REVIEW: pending approvals, opportunities awaiting
    for (const action of props.needsYou.slice(0, 5)) {
      list.push({
        id: `approval-${action.id}`,
        tier: 'review',
        title: `Approve ${action.action_kind.replaceAll('_', ' ')}`,
        detail: `${action.context.replaceAll('_', ' ')} · ${action.subject_kind}`,
        consequence: action.approval_expires_at
          ? `Approval expires ${new Date(action.approval_expires_at).toLocaleDateString()}`
          : undefined,
        action: { label: 'Review', href: '/operations' },
      })
    }
    if (props.awaitingApproval > 0) {
      list.push({
        id: 'awaiting-approval',
        tier: 'review',
        title: `${props.awaitingApproval} opportunity(ies) awaiting decision`,
        detail: 'The brain has found opportunities that need your decision.',
        action: { label: 'Review', href: '/operations' },
      })
    }

    // INFORMATIONAL: active (non-critical) alerts
    if (props.activeAlerts > 0) {
      list.push({
        id: 'active-alerts',
        tier: 'informational',
        title: `${props.activeAlerts} active watchdog alert(s)`,
        detail: 'Non-critical alerts that may indicate emerging issues.',
      })
    }

    return list
  }

  const total = () => items().length
  const urgent = () => items().filter(i => i.tier === 'urgent')
  const review = () => items().filter(i => i.tier === 'review')
  const informational = () => items().filter(i => i.tier === 'informational')

  return <div class="attention-inbox">
    <div class="attention-inbox-head">
      <div>
        <span class="eyebrow">ATTENTION</span>
        <div class="attention-inbox-count">
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
  return <div class="attention-item">
    <div class="attention-item-body">
      <strong>{props.item.title}</strong>
      <small>{props.item.detail}</small>
      <Show when={props.item.consequence}>
        <small>{props.item.consequence}</small>
      </Show>
    </div>
    <Show when={props.item.action}>
      <div class="attention-item-actions">
        <Show when={props.item.action!.href} fallback={
          <button class="ghost">{props.item.action!.label}</button>
        }>
          {(href) => (
            <a class="ghost" href={href()}>{props.item.action!.label}</a>
          )}
        </Show>
      </div>
    </Show>
  </div>
}
