import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { Link, useRouterState } from '@tanstack/solid-router'
import type { PendingActionSummary } from '../lib/types'
import { api, ApiError } from '../lib/api'
import { authState } from '../lib/auth'
import { errorMessage, formatIsoUntil } from '../lib/format'
import { DraftEditor, changedFields, emptiedField } from './DraftEditor'
import { toast } from './app/toast'
import { EmptyState } from './ui/empty-state'
import { SectionIcon } from './SectionIcon'
import { CONTEXT_LABELS, DECISION_KIND_LABELS, SUBJECT_KIND_LABELS, labelOr } from '../lib/opportunity-labels'
import { Button } from './app/button'
import { Spinner } from './Spinner'
import { cn } from '../lib/cn'
import { buttonVariants } from './app/button'
import { refreshQueries } from '../lib/refresh'
import { capabilityAction } from '../lib/capabilities'
import { fillPath, surface } from '../lib/surface'

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
  /// The draft an approve click sends — the action's `revisable` map plus the
  /// id that keys the edit state. Read first, editable on toggle.
  draft?: { actionId: string; fields: Record<string, string> }
}

export function AttentionInbox(props: {
  slug: string
  needsYou: PendingActionSummary[]
  // `null` = the section never reported — the corresponding row stays out
  // of the inbox rather than asserting an unmeasured zero.
  deadJobs: number | null
  criticalAlerts: number | null
  staleReservations: number | null
  activeAlerts: number | null
  awaitingApproval: number | null
  /// Sections the tenant does not report. A counter named here is unknown,
  /// not zero, so the inbox says so instead of staying quiet — "nothing needs
  /// you" and "this build cannot tell you" are different answers.
  notReported?: readonly string[]
  /// Editable drafts by action id — the `revisable` maps from the today's
  /// `autopilot.needs_you`, which the attention snapshot's summaries do not
  /// carry. An approval item with no entry here approves as before.
  drafts?: Record<string, Record<string, string>>
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

  // Draft edit state, keyed by action id: `edits` holds the working text
  // (initialized from `revisable` on first change), `editing` the ids in
  // edit mode, `itemErrors` per-item refusal text — a 409's sentence or a
  // blocked empty field lands on the row, everything else keeps the toast.
  const [edits, setEdits] = createSignal<Record<string, Record<string, string>>>({})
  const [editing, setEditing] = createSignal<Set<string>>(new Set())
  const [itemErrors, setItemErrors] = createSignal<Record<string, string>>({})
  const setItemError = (itemId: string, message: string | null) =>
    setItemErrors(prev => {
      const next = { ...prev }
      if (message == null) delete next[itemId]
      else next[itemId] = message
      return next
    })
  const editField = (item: AttentionItem, field: string, value: string) => {
    const draft = item.draft
    if (!draft) return
    setEdits(prev => ({
      ...prev,
      [draft.actionId]: { ...draft.fields, ...prev[draft.actionId], [field]: value },
    }))
  }
  const toggleEdit = (actionId: string) =>
    setEditing(prev => {
      const next = new Set(prev)
      if (next.has(actionId)) next.delete(actionId)
      else next.add(actionId)
      return next
    })
  const editedRevision = (item: AttentionItem) =>
    item.draft ? changedFields(item.draft.fields, edits()[item.draft.actionId] ?? {}) : undefined

  /// Saves the edited words without approving. A pitch inside an outreach
  /// wave can only be approved with its batch, so approve-with-edit refuses
  /// it one at a time — this is how its words get fixed before the wave goes.
  const saveEdits = async (item: AttentionItem) => {
    const draft = item.draft
    const revision = editedRevision(item)
    if (!draft || !revision || busy() !== null) return
    const empty = emptiedField(edits()[draft.actionId] ?? {})
    if (empty) {
      setItemError(item.id, `${empty} can't be empty — refuse the draft instead.`)
      return
    }
    const path = fillPath(capabilityAction('action-draft', 'Save edits').path, { action_id: draft.actionId })
    if (!path) return
    setItemError(item.id, null)
    setBusy(item.id)
    try {
      await surface.write(props.slug, 'POST', path, { revision })
      setEdits(prev => {
        const next = { ...prev }
        delete next[draft.actionId]
        return next
      })
      toggleEdit(draft.actionId)
      await props.onRefresh()
      toast.success('Saved — the draft now reads as you wrote it')
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setItemError(item.id, error.message)
      else toast.error(errorMessage(error, 'Your edit was not saved'))
    } finally {
      setBusy(null)
    }
  }

  const carryOut = async (item: AttentionItem) => {
    const job = item.run
    if (!job || busy() !== null) return
    if (confirming() !== item.id) {
      setConfirming(item.id)
      return
    }
    setConfirming(null)
    // A blanked field is refused upstream — name it here instead of
    // shipping a write that is known to fail.
    if (item.draft) {
      const empty = emptiedField(edits()[item.draft.actionId] ?? {})
      if (empty) {
        setItemError(item.id, `${empty} can't be empty — refuse the draft instead.`)
        return
      }
    }
    const revision = editedRevision(item)
    setItemError(item.id, null)
    setBusy(item.id)
    try {
      await job.execute()
      await props.onRefresh()
      toast.success(revision ? 'Approved with your edits' : job.success)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Upstream's refusal is a sentence written for a person — put it on
        // the item it refused rather than a toast that fades.
        setItemError(item.id, error.message)
      } else {
        toast.error(errorMessage(error, 'That did not go through'))
      }
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
    if (platform && (props.deadJobs ?? 0) > 0) {
      list.push({
        id: 'dead-jobs',
        tier: 'urgent',
        title: `${props.deadJobs} dead queue item(s)`,
        detail: 'Dead outbox, webhook, or push deliveries that failed after all retries.',
        consequence: 'Events are not reaching their destinations.',
        goto: { label: 'Open queues', tab: 'queues', anchor: 'dead-outbox' },
      })
    }
    if ((props.criticalAlerts ?? 0) > 0) {
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
    if (platform && (props.staleReservations ?? 0) > 0) {
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
      const draftFields = props.drafts?.[action.id]
      const draft =
        draftFields && Object.keys(draftFields).length > 0
          ? { actionId: action.id, fields: draftFields }
          : undefined
      list.push({
        id: `approval-${action.id}`,
        tier: 'review',
        // Underscore-stripping is not naming: `agent.run.request` came through
        // untouched and `outreach_supply` as two lowercase words. Same
        // vocabulary the board and the scorecard read from.
        title: `Approve ${labelOr(DECISION_KIND_LABELS, action.action_kind)}`,
        detail: `${labelOr(CONTEXT_LABELS, action.context)} · ${labelOr(SUBJECT_KIND_LABELS, action.subject_kind)}`,
        consequence: action.approval_expires_at
          ? `Approval lapses ${formatIsoUntil(action.approval_expires_at)}`
          : undefined,
        draft,
        // The approval is the whole item. It used to be a link to the
        // operations board, which meant the one thing the inbox exists to
        // collect was the one thing it could not do.
        run: {
          label: 'Approve',
          confirmLabel: 'Yes, approve',
          pendingLabel: 'Approving…',
          success: 'Approved — the action is executing',
          execute: async () => {
            const revision = draftFields
              ? changedFields(draftFields, edits()[action.id] ?? {})
              : undefined
            await api.approveOpportunityAction(props.slug, action.id, revision ? { revision } : undefined)
            setApproved(prev => new Set(prev).add(action.id))
            refreshQueries(['tenant-brain', props.slug], ['tenant-delivery', props.slug])
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
      const rest = Math.max(0, (props.awaitingApproval ?? 0) - stillListed() - shown.length)
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
    if ((props.activeAlerts ?? 0) > 0) {
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
    error={itemErrors()[item.id]}
    editing={item.draft ? editing().has(item.draft.actionId) : false}
    hasEdits={Boolean(editedRevision(item))}
    edited={item.draft ? (edits()[item.draft.actionId] ?? item.draft.fields) : {}}
    onEdit={(field, value) => editField(item, field, value)}
    onToggleEdit={() => { if (item.draft) toggleEdit(item.draft.actionId) }}
    onSave={() => void saveEdits(item)}
    onRun={() => void carryOut(item)}
    onReveal={props.onReveal}
  />

  const total = () => items().length
  const urgent = () => items().filter(i => i.tier === 'urgent')
  const review = () => items().filter(i => i.tier === 'review')
  const informational = () => items().filter(i => i.tier === 'informational')

  // Deep-link from team emails: the URL hash may contain
  // `#needs-you&action={id}`. Track the router's hash reactively — a second
  // deep link clicked while the page (and this panel) is already open must
  // still highlight its target; an onMount read silently ignored it.
  const currentHash = useRouterState({ select: s => s.location.hash })
  createEffect(() => {
    const match = currentHash().match(/action=([0-9a-f-]+)/i)
    if (!match) return
    const elId = `attention-item-approval-${match[1]}`
    // The target lives on this tab — with decisions now the default the
    // element may not even be mounted, so switch tabs via onReveal first and
    // let its retry loop land the scroll before adding the highlight.
    props.onReveal('inbox', elId)
    let highlightTimer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const highlight = () => {
      const el = document.getElementById(elId)
      if (el) {
        // A previous action's highlight never wins over the newest link.
        document.querySelectorAll('.attention-item-highlighted')
          .forEach(old => { if (old !== el) old.classList.remove('attention-item-highlighted') })
        el.classList.add('attention-item-highlighted')
        highlightTimer = setTimeout(() => el.classList.remove('attention-item-highlighted'), 4000)
      } else if (attempts++ < 60) {
        // Keep pace with revealAnchor's ~1s window — an element that mounts
        // late must still get its highlight, not just the scroll.
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
  error?: string
  editing: boolean
  hasEdits: boolean
  edited: Record<string, string>
  onEdit: (field: string, value: string) => void
  onToggleEdit: () => void
  onSave: () => void
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
      <Show when={props.item.draft}>{draft =>
        <DraftEditor
          fields={draft().fields}
          value={props.edited}
          onChange={props.onEdit}
          editing={props.editing}
          onToggle={props.onToggleEdit}
        />
      }</Show>
      <Show when={props.error}>
        <small class="text-xs text-destructive font-medium leading-[1.4]">{props.error}</small>
      </Show>
    </div>
    <div class="flex gap-2 shrink-0 items-center flex-wrap">
      <Show when={props.item.draft && !props.editing}>
        <Button size="sm" variant="ghost" writes disabled={props.disabled || props.busy} onClick={props.onToggleEdit}>
          Edit
        </Button>
      </Show>
      <Show when={props.item.draft && props.editing && props.hasEdits}>
        <Button size="sm" variant="outline" writes disabled={props.disabled || props.busy} onClick={props.onSave}>
          Save edits
        </Button>
      </Show>
      <Show when={props.item.run}>{run =>
        <Button
          size="sm"
          writes
          variant={props.item.tier === 'urgent' ? 'destructive' : 'default'}
          disabled={props.disabled || props.busy}
          onClick={props.onRun}
        >
          <Show when={props.busy}><Spinner /></Show>
          {props.busy ? run().pendingLabel : props.confirming ? (props.hasEdits ? 'Yes, approve as edited' : run().confirmLabel) : run().label}
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
