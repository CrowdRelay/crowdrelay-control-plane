import { For, Show, createEffect, createSignal, on, onCleanup, type JSX } from 'solid-js'
import { CircleCheck } from 'lucide-solid'
import { Link, useRouterState } from '@tanstack/solid-router'
import type { OpsAlert, PendingActionSummary, UnansweredReply } from '../lib/types'
import { api, ApiError } from '../lib/api'
import { authState } from '../lib/auth'
import { formatIsoUntil, errorMessage, formatTimestamp, timestampMillis, tokenLabel } from '../lib/format'
import { DraftEditor, changedFields, emptiedField } from './DraftEditor'
import { toast } from './app/toast'
import { EmptyState } from './ui/empty-state'
import { SectionIcon } from './SectionIcon'
import { CONTEXT_LABELS, DECISION_KIND_LABELS, SUBJECT_KIND_LABELS, labelOr } from '../lib/opportunity-labels'
import { Button } from './app/button'
import { Spinner } from './Spinner'
import { buttonVariants } from './app/button'
import { refreshQueriesSoon } from '../lib/refresh'
import { capabilityAction } from '../lib/capabilities'
import { fillPath, surface } from '../lib/surface'
import { DataTable, type ColumnDef } from './app/data-table'
import { Pill, type Tone } from './ui/dash'
import { Section } from './layout'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet'
import { alertAction, alertDetails, alertGuide } from './alert-guide'

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
  /// The watchdog's alerts, open and recovered in the last day.
  alerts?: OpsAlert[]
  /// People who answered and nobody wrote back — `undefined` when unreported.
  replies?: UnansweredReply[]
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
      if (error instanceof ApiError && error.status === 409) setItemError(item.id, errorMessage(error, ""))
      else toast.error("Couldn't save your edit", error)
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
        setItemError(item.id, errorMessage(error, ""))
      } else {
        toast.error("Couldn't complete that action", error)
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
        goto: { label: 'Show alerts', tab: 'inbox', anchor: 'watchdog-alerts' },
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
            refreshQueriesSoon(['tenant-brain', props.slug], ['tenant-delivery', props.slug])
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
        goto: { label: 'Show alerts', tab: 'inbox', anchor: 'watchdog-alerts' },
      })
    }

    return list
  }

  // ── One table ──────────────────────────────────────────────────────
  // The tiered items, the watchdog's alerts and the people waiting on a
  // reply are one list of things a person can do something about, filtered
  // by chips. Each row keeps its own action.
  const [show, setShow] = createSignal<Kind | 'all'>('all')
  const [reviewing, setReviewing] = createSignal<AttentionItem | null>(null)

  /// A `goto` at the alerts filters this table instead of scrolling to a
  /// section that no longer exists.
  const follow = (destination: NonNullable<AttentionItem['goto']>) => {
    if (destination.anchor === 'watchdog-alerts') {
      setShow('alert')
      document.getElementById('watchdog-alerts')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    props.onReveal(destination.tab, destination.anchor)
  }

  const rows = (): TodoRow[] => {
    const out: TodoRow[] = []
    for (const item of items()) {
      const kind: Kind = item.id === 'active-alerts' ? 'alert' : item.tier === 'urgent' ? 'urgent' : item.tier === 'review' ? 'review' : 'alert'
      out.push({
        id: `attention-item-${item.id}`, kind, item,
        title: item.title, detail: item.detail,
        note: item.consequence, noteTone: 'warn',
        error: itemErrors()[item.id],
        status: item.tier === 'urgent' ? { label: 'Urgent', tone: 'bad' } : item.tier === 'review' ? { label: 'Review', tone: 'warn' } : { label: 'For your information', tone: 'muted' },
        when: null, whenLabel: null,
        rank: item.tier === 'urgent' ? 0 : item.tier === 'review' ? 1 : 4,
      })
    }
    for (const alert of props.alerts ?? []) {
      const guide = alertGuide(alert)
      const critical = alert.severity === 'critical'
      out.push({
        id: `alert-${alert.alert_key}-${alert.first_seen_at ?? ''}`, kind: 'alert', alert,
        title: guide?.title ?? alert.summary,
        detail: guide?.cause ?? alert.summary,
        note: alertDetails(alert).join(' · ') || undefined,
        status: !alert.active
          ? { label: 'Recovered', tone: 'good' }
          : critical ? { label: 'Critical alert', tone: 'bad' } : { label: 'Alert', tone: 'warn' },
        when: alert.active ? alert.last_seen_at : alert.recovered_at ?? null,
        whenLabel: alert.active
          ? `last seen ${formatTimestamp(alert.last_seen_at)}`
          : `recovered ${formatTimestamp(alert.recovered_at ?? null)}`,
        rank: !alert.active ? 5 : critical ? 0 : 2,
      })
    }
    for (const reply of props.replies ?? []) {
      out.push({
        id: `reply-${reply.target_name}-${reply.replied_at}`, kind: 'reply', reply,
        title: reply.target_name,
        detail: [tokenLabel(reply.target_kind), reply.channel, reply.contact_email].filter(Boolean).join(' · '),
        note: reply.sheet_verdict ? `Sheet verdict: ${humanSheet(reply.sheet_verdict)}` : undefined,
        status: reply.disposition === 'positive' ? { label: 'Positive reply', tone: 'good' } : { label: 'Reply', tone: 'muted' },
        when: reply.replied_at,
        whenLabel: `waiting ${reply.waiting_days === 0 ? 'since today' : `${reply.waiting_days}d`}`,
        whenTone: reply.waiting_days >= 7 ? 'warn' : undefined,
        // Oldest first within replies — a positive answer ageing is the most
        // perishable thing on this board.
        rank: 3,
      })
    }
    return out
  }

  const countOf = (kind: Kind | 'all') => kind === 'all' ? rows().length : rows().filter(r => r.kind === kind).length
  const visible = () => show() === 'all' ? rows() : rows().filter(r => r.kind === show())
  const CHIPS: { id: Kind | 'all'; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'urgent', label: 'Urgent' },
    { id: 'review', label: 'Review' },
    { id: 'alert', label: 'Alerts' },
    { id: 'reply', label: 'Replies' },
  ]

  const actionsFor = (row: TodoRow): JSX.Element => {
    if (row.item) {
      const item = row.item
      const busyHere = busy() === item.id
      const disabled = busy() !== null && !busyHere
      return <div class="flex items-center justify-end gap-1.5">
        <Show when={item.draft}>
          <Button size="sm" variant="ghost" disabled={disabled || busyHere} onClick={() => setReviewing(item)}>Review draft<span class="sr-only">: {row.title}</span></Button>
        </Show>
        <Show when={item.run}>{run =>
          <Button size="sm" writes variant={item.tier === 'urgent' ? 'destructive' : 'default'} disabled={disabled || busyHere} onClick={() => void carryOut(item)}>
            <Show when={busyHere}><Spinner /></Show>
            {busyHere ? run().pendingLabel : confirming() === item.id ? (editedRevision(item) ? 'Yes, approve as edited' : run().confirmLabel) : run().label}
            <span class="sr-only">: {row.title}, {row.detail}</span>
          </Button>
        }</Show>
        <Show when={item.goto}>{destination =>
          <Button size="sm" variant={item.run ? 'ghost' : 'outline'} onClick={() => follow(destination())}>{destination().label}<span class="sr-only">: {row.title}</span></Button>
        }</Show>
        <Show when={item.action}>{action =>
          <Show when={action().to} fallback={<Button size="sm" variant="ghost">{action().label}</Button>}>
            {to => <Link class={buttonVariants({ variant: 'outline', size: 'sm' })} to={to()}>{action().label}</Link>}
          </Show>
        }</Show>
      </div>
    }
    if (row.alert && row.alert.active) {
      const action = alertAction(row.alert)
      if (!action) return null
      return 'operations' in action
        ? <Link class={buttonVariants({ variant: 'outline', size: 'sm' })} to="/tenants/$slug/operations" params={{ slug: props.slug }}>{action.label}<span class="sr-only">: {row.title}</span></Link>
        : <Button variant="outline" size="sm" onClick={() => props.onReveal(action.anchor.startsWith('dead-') ? 'queues' : 'inbox', action.anchor)}>{action.label}<span class="sr-only">: {row.title}</span></Button>
    }
    if (row.reply?.contact_email) {
      return <a class={buttonVariants({ variant: 'outline', size: 'sm' })} href={`mailto:${row.reply.contact_email}`}>Write back<span class="sr-only"> to {row.title}</span></a>
    }
    return null
  }

  const columns: ColumnDef<TodoRow, any>[] = [
    {
      id: 'item', header: 'Item', accessorFn: r => r.title, meta: { class: 'min-w-72' },
      cell: c => {
        const r = c.row.original
        return <div class="max-w-xl">
          <span class="font-medium text-foreground">{r.title}</span>
          <span class="block text-muted-foreground text-pretty">{r.detail}</span>
          <Show when={r.note}>
            <span class={r.noteTone === 'warn' ? 'mt-0.5 block text-xs font-medium text-warning-foreground' : 'mt-0.5 block text-xs text-muted-foreground'}>{r.note}</span>
          </Show>
          <Show when={r.error}><span class="mt-0.5 block text-xs font-medium text-error-foreground">{r.error}</span></Show>
        </div>
      },
    },
    {
      id: 'status', header: 'Status', accessorFn: r => r.rank, meta: { class: 'whitespace-nowrap' },
      cell: c => <Pill tone={c.row.original.status.tone}>{c.row.original.status.label}</Pill>,
    },
    {
      id: 'when', header: 'When', accessorFn: r => timestampMillis(r.when) || 0, meta: { class: 'whitespace-nowrap' },
      cell: c => <span class={c.row.original.whenTone === 'warn' ? 'text-warning-foreground' : 'text-muted-foreground'}>{c.row.original.whenLabel ?? '—'}</span>,
    },
    {
      id: 'actions', header: () => <span class="sr-only">Actions</span>, enableSorting: false, enableHiding: false,
      meta: { class: 'text-right whitespace-nowrap' },
      cell: c => actionsFor(c.row.original),
    },
  ]

  const platform = authState.isPlatformLevel()
  // Sections the tenant does not publish are unknown, not empty — said once,
  // under the table, instead of as a zero.
  const unreportedNotes = () => [
    unreported('unanswered_replies') || props.replies === undefined
      ? (platform ? 'This tenant does not publish its unanswered replies.' : 'Unanswered replies are not reported yet.')
      : null,
  ].filter((v): v is string => v !== null)

  // Deep-link from team emails: the URL hash may contain
  // `#needs-you&action={id}`. Track the router's hash reactively — a second
  // deep link clicked while the page (and this panel) is already open must
  // still highlight its target; an onMount read silently ignored it. `on`
  // tracks the hash alone — onReveal navigates, and tracking the router
  // signals that navigation reads looped this effect forever.
  const currentHash = useRouterState({ select: s => s.location.hash })
  // The highlight is state, not a class poked onto a node: the table
  // rebuilds its rows when the filter changes, and a class on the old node
  // vanished with it.
  const [highlighted, setHighlighted] = createSignal<string | null>(null)
  createEffect(on(currentHash, hash => {
    const match = hash.match(/action=([0-9a-f-]+)/i)
    if (!match) return
    const elId = `attention-item-approval-${match[1]}`
    // Approvals sit on the first page of the Review filter.
    setShow('review')
    props.onReveal('inbox', elId)
    // Scroll and highlight once the row exists. On a cold load the snapshot
    // takes seconds, so wait up to ten for it rather than one frame-second.
    let highlightTimer: ReturnType<typeof setTimeout> | undefined
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const land = () => {
      const el = document.getElementById(elId)
      if (el) {
        el.scrollIntoView({ block: 'center' })
        setHighlighted(elId)
        highlightTimer = setTimeout(() => setHighlighted(current => current === elId ? null : current), 4000)
      } else if (attempts++ < 100) {
        pollTimer = setTimeout(land, 100)
      }
    }
    land()
    onCleanup(() => { clearTimeout(highlightTimer); clearTimeout(pollTimer) })
  }))

  return <div id="watchdog-alerts" class="scroll-mt-4 rounded-xl border border-border bg-card p-4 sm:p-5">
    <Section
      flush
      title="To do"
      icon={<SectionIcon name="inbox" />}
      count={rows().length}
      description={platform
        ? 'What waits for your yes, the watchdog\'s alerts, and the people waiting on a reply. Alerts are checked every 5 minutes and close themselves when the problem goes away.'
        : 'What waits for your yes, what broke, and the people waiting on a reply. Alerts close themselves when the problem goes away.'}
    >
      <DataTable
        data={visible()}
        columns={columns}
        getRowId={r => r.id}
        rowDomId={r => r.id}
        rowClass={r => r.id === highlighted() ? 'bg-warning/40 hover:bg-warning/40' : undefined}
        bordered={false}
        pageSize={15}
        initialSorting={[{ id: 'status', desc: false }]}
        searchText={r => [r.title, r.detail, r.note, r.status.label].filter(Boolean).join(' ')}
        searchPlaceholder="Search by name, alert or approval"
        toolbar={
          <div role="group" aria-label="Show" class="flex flex-wrap items-center gap-1">
            <For each={CHIPS}>{chip => (
              <Button variant={show() === chip.id ? 'secondary' : 'ghost'} size="sm" aria-pressed={show() === chip.id} onClick={() => setShow(chip.id)}>
                {chip.label}
                <span class="tabular-nums text-muted-foreground">{countOf(chip.id)}</span>
              </Button>
            )}</For>
          </div>
        }
        empty={
          rows().length === 0
            ? <EmptyState icon={<CircleCheck />}
                label={platform ? 'Nothing needs attention' : 'Nothing needs you'}
                hint={platform
                  ? 'The system is operating autonomously. Items appear here when the brain needs your decision, when delivery issues occur, or when someone answers.'
                  : 'It is working on its own. Items appear here when the brain needs your decision, when something breaks, or when someone answers.'}
              />
            : <EmptyState icon={<CircleCheck />} label="Nothing here" hint="Nothing matches this filter.">
                <Button variant="outline" size="sm" onClick={() => setShow('all')}>Show everything</Button>
              </EmptyState>
        }
      />
      <For each={unreportedNotes()}>{note => <p class="mt-3 text-xs text-muted-foreground">{note}</p>}</For>
    </Section>

    {/* The draft an approve sends, read and edited beside the table. */}
    <Sheet open={reviewing() !== null} onOpenChange={open => { if (!open) setReviewing(null) }}>
      <SheetContent class="flex w-full flex-col gap-0 overscroll-contain p-0 sm:max-w-lg">
        <Show when={reviewing()}>{item => {
          const draft = () => item().draft!
          const editingNow = () => editing().has(draft().actionId)
          return <>
            <SheetHeader class="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
              <SheetTitle class="text-base">{item().title}</SheetTitle>
              <SheetDescription class="text-pretty">{item().detail}<Show when={item().consequence}> · {item().consequence}</Show></SheetDescription>
            </SheetHeader>
            <div class="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4">
              <DraftEditor
                fields={draft().fields}
                value={edits()[draft().actionId] ?? draft().fields}
                onChange={(field, value) => editField(item(), field, value)}
                editing={editingNow()}
                onToggle={() => toggleEdit(draft().actionId)}
              />
              <Show when={itemErrors()[item().id]}>
                <p class="text-xs font-medium text-error-foreground">{itemErrors()[item().id]}</p>
              </Show>
            </div>
            <div class="flex shrink-0 flex-row flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Show when={!editingNow()}>
                <Button size="sm" variant="ghost" writes disabled={busy() !== null} onClick={() => toggleEdit(draft().actionId)}>Edit</Button>
              </Show>
              <Show when={editingNow() && editedRevision(item())}>
                <Button size="sm" variant="outline" writes disabled={busy() !== null} onClick={() => void saveEdits(item())}>Save edits</Button>
              </Show>
              <Show when={item().run}>{run =>
                <Button size="sm" writes disabled={busy() !== null} onClick={() => void carryOut(item()).then(() => { if (!itemErrors()[item().id] && confirming() !== item().id) setReviewing(null) })}>
                  <Show when={busy() === item().id}><Spinner /></Show>
                  {busy() === item().id ? run().pendingLabel : confirming() === item().id ? (editedRevision(item()) ? 'Yes, approve as edited' : run().confirmLabel) : run().label}
                </Button>
              }</Show>
            </div>
          </>
        }}</Show>
      </SheetContent>
    </Sheet>
  </div>
}

type Kind = 'urgent' | 'review' | 'alert' | 'reply'

/** One thing to do, whichever list it came from. */
type TodoRow = {
  /** Also the row's DOM id — `attention-item-approval-<id>` deep links land here. */
  id: string
  kind: Kind
  item?: AttentionItem
  alert?: OpsAlert
  reply?: UnansweredReply
  title: string
  detail: string
  note?: string
  noteTone?: 'warn'
  error?: string
  status: { label: string; tone: Tone }
  when: string | null
  whenLabel: string | null
  whenTone?: 'warn'
  /** Default order: urgent and critical first, recovered last. */
  rank: number
}

const humanSheet = (verdict: string) => tokenLabel(verdict)
