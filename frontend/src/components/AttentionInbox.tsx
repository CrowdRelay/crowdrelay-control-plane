import { For, Show, createSignal, onMount, onCleanup } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import type { PendingActionSummary } from '../lib/types'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { errorMessage } from '../lib/format'
import { toast } from './app/toast'
import { EmptyState } from './ui/empty-state'
import { SectionIcon } from './SectionIcon'
import { CONTEXT_LABELS, DECISION_KIND_LABELS, SUBJECT_KIND_LABELS, labelOr } from '../lib/opportunity-labels'
import { Button } from './app/button'
import { Spinner } from './Spinner'
import { cn } from '../lib/cn'
import { buttonVariants } from './app/button'

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
  /// Carried out here, in the inbox. Two clicks: the first arms the button,
  /// the second sends. An item that can be finished from the inbox must be,
  /// because sending the operator to another page to press the same button is
  /// the inbox admitting it is a list of links rather than a queue of work.
  run?: {
    label: string
    /// Shown after the first click.
    confirmLabel: string
    pendingLabel: string
    success: string
    execute: () => Promise<unknown>
  }
  /// Somewhere else on this page. Switches to the owning tab, then scrolls —
  /// a plain `#anchor` cannot, because an inactive tab panel is hidden or not
  /// mounted at all.
  goto?: { label: string; tab: string; anchor?: string }
  /// Another page. Only for what genuinely lives on one.
  action?: { label: string; to?: string }
}

export function AttentionInbox(props: {
  slug: string
  needsYou: PendingActionSummary[]
  deadJobs: number
  criticalAlerts: number
  staleReservations: number
  activeAlerts: number
  awaitingApproval: number
  /// Sections the tenant does not report. A counter named here is unknown,
  /// not zero, so the inbox says so instead of staying quiet — "nothing needs
  /// you" and "this build cannot tell you" are different answers.
  notReported?: readonly string[]
  /// Refetch the attention snapshot after an item is carried out.
  onRefresh: () => Promise<unknown>
  /// Show a section of this page, switching tab first if it owns one.
  onReveal: (tab: string, anchor?: string) => void
}) {
  const unreported = (name: string) => (props.notReported ?? []).includes(name)

  const [busy, setBusy] = createSignal<string | null>(null)
  const [confirming, setConfirming] = createSignal<string | null>(null)
  // Actions approved in this session. An id leaves the set as soon as the
  // tenant stops listing it, so the row cannot reappear during the refresh lag
  // and the "and N more" count below is never subtracted twice.
  const [approved, setApproved] = createSignal<Set<string>>(new Set())
  const stillListed = () => props.needsYou.filter(action => approved().has(action.id)).length
  const queue = () => props.needsYou.filter(action => !approved().has(action.id))

  const carryOut = async (item: AttentionItem) => {
    const job = item.run
    if (!job || busy() !== null) return
    if (confirming() !== item.id) {
      setConfirming(item.id)
      return
    }
    setConfirming(null)
    setBusy(item.id)
    try {
      await job.execute()
      await props.onRefresh()
      toast.success(job.success)
    } catch (error) {
      toast.error(errorMessage(error, 'That did not go through'))
    } finally {
      setBusy(null)
    }
  }

  const items = (): AttentionItem[] => {
    const list: AttentionItem[] = []
    const platform = authState.isPlatformLevel()

    // URGENT: dead deliveries, critical alerts, stale reservations.
    // Delivery queues and AREA reservations are operator machinery — the
    // band's tabs do not carry them, so the band's inbox does not either.
    if (platform && props.deadJobs > 0) {
      list.push({
        id: 'dead-jobs',
        tier: 'urgent',
        title: `${props.deadJobs} dead queue item(s)`,
        detail: 'Dead outbox, webhook, or push deliveries that failed after all retries.',
        consequence: 'Events are not reaching their destinations.',
        goto: { label: 'Open queues', tab: 'queues', anchor: 'dead-outbox' },
      })
    }
    if (props.criticalAlerts > 0) {
      list.push({
        id: 'critical-alerts',
        tier: 'urgent',
        title: platform
          ? `${props.criticalAlerts} critical watchdog alert(s)`
          : `${props.criticalAlerts} critical alert(s)`,
        detail: platform
          ? 'Watchdog has raised critical alerts requiring immediate attention.'
          : 'The monitor raised critical alerts that need a person now.',
        consequence: 'System health may be compromised.',
        goto: { label: 'Inspect', tab: 'inbox', anchor: 'watchdog-alerts' },
      })
    }
    if (platform && props.staleReservations > 0) {
      list.push({
        id: 'stale-reservations',
        tier: 'urgent',
        title: `${props.staleReservations} stale AREA reservation(s)`,
        detail: 'Voucher or ticket reward reservations that have been held too long.',
        consequence: 'Reservations may need to be released.',
        goto: { label: 'Inspect', tab: 'inbox', anchor: 'reconciliation-findings' },
      })
    }

    // REVIEW: pending approvals, opportunities awaiting
    const shown = queue().slice(0, 5)
    for (const action of shown) {
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
        // The approval is the whole item. It used to be a link to the
        // operations board, which meant the one thing the inbox exists to
        // collect was the one thing it could not do.
        run: {
          label: 'Approve',
          confirmLabel: 'Yes, approve',
          pendingLabel: 'Approving…',
          success: 'Approved — the action is executing',
          execute: async () => {
            await api.approveOpportunityAction(props.slug, action.id)
            setApproved(prev => new Set(prev).add(action.id))
          },
        },
        // Secondary, for the evidence behind the decision — the full board
        // is this page's decisions tab since UX-3.2.
        goto: { label: 'Details', tab: 'decisions' },
      })
    }
    if (unreported('awaiting_approval') || unreported('needs_you')) {
      list.push({
        id: 'approvals-not-reported',
        tier: 'review',
        title: 'Pending approvals are not reported',
        detail: platform
          ? 'This CrowdRelay build does not publish the approval queue, so this console cannot tell whether anything is waiting.'
          : 'This build does not publish pending approvals, so the console cannot tell whether anything is waiting.',
        consequence: 'Work may be parked awaiting your decision without appearing here.',
        goto: { label: 'Open decisions', tab: 'decisions' },
      })
    } else {
      // Only what is not already a row above. The count and the rows come from
      // the same query, so printing both in full said "3 awaiting decision"
      // directly under the three of them.
      const rest = Math.max(0, props.awaitingApproval - stillListed() - shown.length)
      if (rest > 0) {
        list.push({
          id: 'awaiting-approval',
          tier: 'review',
          title: `${rest} more ${platform ? 'opportunity(ies)' : 'moves'} awaiting decision`,
          detail: platform
            ? 'The brain has found more than this inbox lists. The board shows all of them.'
            : 'There is more than this list shows. The decisions tab shows all of them.',
          goto: { label: platform ? 'Open board' : 'Open decisions', tab: 'decisions' },
        })
      }
    }

    // INFORMATIONAL: active (non-critical) alerts
    if (props.activeAlerts > 0) {
      list.push({
        id: 'active-alerts',
        tier: 'informational',
        title: `${props.activeAlerts} active ${platform ? 'watchdog ' : ''}alert(s)`,
        detail: 'Non-critical alerts that may indicate emerging issues.',
        goto: { label: 'Inspect', tab: 'inbox', anchor: 'watchdog-alerts' },
      })
    }

    return list
  }

  // One row shape for all three tiers. Only one item runs at a time, so every
  // other button goes disabled while it does.
  const row = (item: AttentionItem) => <AttentionItemRow
    item={item}
    busy={busy() === item.id}
    disabled={busy() !== null && busy() !== item.id}
    confirming={confirming() === item.id}
    onRun={() => void carryOut(item)}
    onReveal={props.onReveal}
  />

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
    const elId = `attention-item-approval-${match[1]}`
    // The target lives on the inbox tab — with decisions now the default the
    // element may not even be mounted, so switch tabs via onReveal first and
    // let its retry loop land the scroll before adding the highlight.
    props.onReveal('inbox', elId)
    let highlightTimer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const highlight = () => {
      const el = document.getElementById(elId)
      if (el) {
        el.classList.add('attention-item-highlighted')
        highlightTimer = setTimeout(() => el.classList.remove('attention-item-highlighted'), 4000)
      } else if (attempts++ < 15) {
        requestAnimationFrame(highlight)
      }
    }
    requestAnimationFrame(highlight)
    onCleanup(() => clearTimeout(highlightTimer))
  })

  return <div class="rounded-lg border border-border bg-card">
    {/* A zero in a dark pill on a dark header read as a smudge, and the row
        said "0 items need your attention" where the panel below already says
        nothing does. The count appears when there is a count — and so does the
        header: with an empty inbox this printed "Nothing needs you right now"
        directly above an empty state reading "Nothing needs attention", which
        is the same sentence twice in two type sizes. The empty state carries
        the better one, because it also says what would put something here. */}
    <Show when={total() > 0}>
      <div class="flex items-center justify-between gap-2 p-4 border-b border-border">
        <div class="text-muted-foreground text-sm flex items-center gap-2">
          <SectionIcon name="inbox" />
          <span class="bg-primary/20 text-primary text-xs rounded-full px-1.5 font-bold tabular-nums">{total()}</span>
          <span>item{total() !== 1 ? 's' : ''} need{total() === 1 ? 's' : ''} {authState.isPlatformLevel() ? 'your attention' : 'you'}</span>
        </div>
      </div>
    </Show>

    <Show when={total() === 0}>
      <EmptyState
        label={authState.isPlatformLevel() ? 'Nothing needs attention' : 'Nothing needs you'}
        hint={authState.isPlatformLevel()
          ? 'The system is operating autonomously. Items appear here when the brain needs your decision or when delivery issues occur.'
          : 'It is working on its own. Items appear here when the brain needs your decision or when something breaks.'}
      />
    </Show>

    <Show when={urgent().length > 0}>
      <div class="border-b border-border last:border-0">
        <div class="flex items-center gap-2 p-4 pb-2 text-destructive">
          <span class="text-xs font-semibold uppercase tracking-wider">Urgent</span>
          <span class="bg-destructive/15 text-destructive text-xs rounded-full px-2 py-0.5 font-bold">{urgent().length}</span>
        </div>
        <For each={urgent()}>{row}</For>
      </div>
    </Show>

    <Show when={review().length > 0}>
      <div class="border-b border-border last:border-0">
        <div class="flex items-center gap-2 p-4 pb-2 text-warning-foreground">
          <span class="text-xs font-semibold uppercase tracking-wider">Review</span>
          <span class="bg-warning-foreground/10 text-warning-foreground text-xs rounded-full px-2 py-0.5 font-bold">{review().length}</span>
        </div>
        <For each={review()}>{row}</For>
      </div>
    </Show>

    <Show when={informational().length > 0}>
      <div class="last:border-0">
        <div class="flex items-center gap-2 p-4 pb-2 text-muted-foreground">
          <span class="text-xs font-semibold uppercase tracking-wider">Informational</span>
          <span class="bg-muted text-muted-foreground text-xs rounded-full px-2 py-0.5 font-bold">{informational().length}</span>
        </div>
        <For each={informational()}>{row}</For>
      </div>
    </Show>
  </div>
}

function AttentionItemRow(props: {
  item: AttentionItem
  busy: boolean
  disabled: boolean
  confirming: boolean
  onRun: () => void
  onReveal: (tab: string, anchor?: string) => void
}) {
  const tone = () => props.item.tier === 'urgent' ? 'destructive' as const : 'ghost' as const
  return <div id={`attention-item-${props.item.id}`} class={cn('flex items-start justify-between gap-3 px-4 py-3 border-b border-border last:border-0 border-l-2', props.item.tier === 'urgent' && 'border-l-destructive/50', props.item.tier === 'review' && 'border-l-warning-foreground/50', props.item.tier === 'informational' && 'border-l-border')}>
    <div class="flex-1 min-w-0 flex flex-col gap-1">
      <strong class="text-sm font-semibold text-foreground">{props.item.title}</strong>
      <small class="text-xs text-muted-foreground leading-[1.4]">{props.item.detail}</small>
      <Show when={props.item.consequence}>
        <small class="text-xs text-warning-foreground font-medium leading-[1.4]">{props.item.consequence}</small>
      </Show>
    </div>
    <div class="flex gap-2 shrink-0 items-center flex-wrap">
      <Show when={props.item.run}>{run =>
        <Button
          size="sm"
          writes
          variant={props.item.tier === 'urgent' ? 'destructive' : 'default'}
          disabled={props.disabled || props.busy}
          onClick={props.onRun}
        >
          <Show when={props.busy}><Spinner /></Show>
          {props.busy ? run().pendingLabel : props.confirming ? run().confirmLabel : run().label}
        </Button>
      }</Show>
      <Show when={props.item.goto}>{destination =>
        <Button size="sm" variant={props.item.run ? 'ghost' : tone()} onClick={() => props.onReveal(destination().tab, destination().anchor)}>
          {destination().label}
        </Button>
      }</Show>
      <Show when={props.item.action}>{action =>
        <Show when={action().to} fallback={<Button size="sm" variant="ghost">{action().label}</Button>}>
          {to => <Link class={buttonVariants({ variant: props.item.run ? 'ghost' : tone(), size: 'sm' })} to={to()}>{action().label}</Link>}
        </Show>
      }</Show>
    </div>
  </div>
}
