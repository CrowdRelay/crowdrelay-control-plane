import { For, Show, createMemo, createSignal, type JSX } from 'solid-js'
import { failureLine } from '../lib/errors'
import { Link } from '@tanstack/solid-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { CalendarDays, Plus } from 'lucide-solid'
import { api, ApiError } from '../lib/api'
import { authState } from '../lib/auth'
import { compareTimestamps, confidencePercent, formatIsoAge, formatIsoUntil, humanizeToken, money, timestampMillis, tokenLabel } from '../lib/format'
import { hasDegradedSections, whileIncomplete } from '../lib/incomplete'
import { toast } from './app/toast'
import { Alert } from './app/alert'
import { Button, buttonVariants } from './app/button'
import { EmptyState } from './ui/empty-state'
import { Section } from './layout'
import { SectionFailureCard } from './SectionFailureCard'
import { SkeletonSection } from './Skeleton'
import { Spinner } from './Spinner'
import { StageTiles, type JourneyStageSpec } from './Journey'
import { ActionSheet, type OpenWrite } from './capabilities/ActionSheet'
import { DataTable, type ColumnDef } from './app/data-table'
import { Pill, type Tone } from './ui/dash'
import { SectionIcon } from './SectionIcon'
import { capabilityAction } from '../lib/capabilities'
import type {
  BookingCandidateView,
  GigPlanOutcome,
  NegotiationEntry,
  TenantBookingSection,
} from '../lib/types'

// The book-a-show journey — the one process the whole product exists to
// feed. Five stages, pipeline order: the scout's finds, the asks parked on
// a person, the letters out, the terms conversations, the nights on the
// books. The page is a lens over the `booking` read model — one request —
// and every card either carries its one cheap answer (confirm a route) or
// links to the surface that owns the decision.

/// Upstream's `active` definition, kept in the same words: a shortlist row
/// that was submitted or answered has left the scout's pile — it lives in
/// Approached/Talking now. Won, lost and dismissed are terminal everywhere.
const LEFT_FOUND = new Set(['submitted', 'replied', 'won', 'lost', 'dismissed'])
const stillFound = (status: string) => !LEFT_FOUND.has(status)
const SENT = new Set(['submitted', 'replied'])

const sectionLabel: Record<string, string> = {
  gig_plan: 'Gig plan',
  shortlist: 'Opportunity shortlist',
  booking_candidates: 'Booking candidates',
  outreach_candidates: 'Outreach candidates',
  agents: 'Booking agents',
  reply_triage: 'Replies',
  negotiations: 'Negotiations',
  shows: 'Shows',
  // Stage-level fallbacks when every section a stage reads is degraded.
  approached: 'Approached',
  booked: 'Booked',
}

export function BookingJourneyPanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const model = useQuery(() => ({
    queryKey: ['tenant-booking', props.slug],
    queryFn: () => api.bookingModel(props.slug),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))

  const degraded = (name: TenantBookingSection) => (model.data?.degraded ?? []).includes(name)

  // ── Stage membership ────────────────────────────────────────────────
  // Found is a ranking, not a feed: best fit first, confidence breaks the
  // tie, freshest sighting breaks that.
  const watching = createMemo(() =>
    (model.data?.shortlist?.entries ?? [])
      .filter(e => stillFound(e.status))
      .sort((a, b) =>
        b.fit_basis_points - a.fit_basis_points
        || b.confidence_basis_points - a.confidence_basis_points
        || compareTimestamps(b.source_observed_at, a.source_observed_at),
      ),
  )
  // Rows the shortlist already sent — an application out is an approach,
  // and "they replied" is the strongest approach signal there is.
  const applied = createMemo(() =>
    (model.data?.shortlist?.entries ?? []).filter(e => SENT.has(e.status)),
  )
  // Confirmed ids leave the gate between the mutation and the refetch —
  // excluded here so the count never briefly lies.
  const [confirmed, setConfirmed] = createSignal<ConfirmedEntry[]>([])
  const confirmedIds = createMemo(() => new Set(confirmed().map(c => c.id)))
  const byFitDesc = <T extends { fit_basis_points: number }>(a: T, b: T) =>
    b.fit_basis_points - a.fit_basis_points
  const waitingBooking = createMemo(() =>
    (model.data?.booking_candidates ?? [])
      .filter(c => c.status === 'admitted' && !confirmedIds().has(c.candidate_id))
      .sort(byFitDesc),
  )
  const waitingOutreach = createMemo(() =>
    (model.data?.outreach_candidates ?? [])
      .filter(c => c.status === 'admitted' && !confirmedIds().has(c.id))
      .sort(byFitDesc),
  )
  const proposals = createMemo(() => model.data?.gig_plan?.proposals ?? [])
  const outcomes = createMemo(() => model.data?.gig_plan?.track_record.proposals ?? [])
  const repliesWaiting = createMemo(() => model.data?.reply_triage?.needs_human ?? [])
  const negotiationsLive = createMemo(() => model.data?.negotiations?.live ?? [])
  const parkedMoves = createMemo(() => negotiationsLive().filter(n => n.pending_move != null))
  const approachedAgents = createMemo(() =>
    (model.data?.agents?.agents ?? [])
      .filter(a => a.active && !a.do_not_contact && (a.approach_pending || a.approached_at != null)),
  )
  // Every approved letter that never became a night is an approached ask —
  // the badge says whether replies can still land or the window is closed.
  const lettersOut = createMemo(() => outcomes().filter(o => !o.show_booked))
  const upcoming = createMemo(() =>
    (model.data?.shows?.events ?? []).filter(e => e.upcoming),
  )
  const bookedOutcomes = createMemo(() => outcomes().filter(o => o.show_booked))

  const waitingCount = createMemo(() =>
    waitingBooking().length + waitingOutreach().length + proposals().length
    + parkedMoves().length + repliesWaiting().length,
  )
  const approachedCount = createMemo(() =>
    approachedAgents().length + lettersOut().length + applied().length,
  )
  const bookedCount = createMemo(() => upcoming().length + bookedOutcomes().length)

  // The gate reads five sections — only when all five are down is its
  // count unknown rather than zero.
  const gateDown = createMemo(() =>
    degraded('booking_candidates') && degraded('outreach_candidates')
    && degraded('gig_plan') && degraded('negotiations') && degraded('reply_triage'),
  )

  // The rail's per-stage detail line — each stage's own honest clock.
  const oldestIso = (isos: (string | null | undefined)[]) =>
    isos.filter((v): v is string => typeof v === 'string').sort()[0]

  const stages = createMemo((): JourneyStageSpec[] => {
    const foundOldest = oldestIso(watching().map(e => e.source_observed_at))
    const waitingOldest = oldestIso(repliesWaiting().map(r => r.classified_at))
    const approachedOldest = oldestIso(approachedAgents().map(a => a.approached_at))
    const nextDeadline = negotiationsLive().map(n => n.responds_by).sort()[0]
    const nextNight = upcoming()
      .map(e => e.starts_at).sort()[0]
    return [
      {
        key: 'found', label: 'Found', anchor: 'booking-found',
        count: degraded('shortlist') ? null : watching().length,
        detail: foundOldest ? `oldest ${formatIsoAge(foundOldest)}` : null,
      },
      {
        key: 'waiting', label: 'Waiting on you', anchor: 'booking-waiting',
        count: gateDown() ? null : waitingCount(),
        detail: waitingOldest ? `since ${formatIsoAge(waitingOldest)}` : null,
      },
      {
        key: 'approached', label: 'Approached', anchor: 'booking-approached',
        count: degraded('agents') && degraded('gig_plan') && degraded('shortlist')
          ? null
          : approachedCount(),
        detail: approachedOldest ? `oldest ${formatIsoAge(approachedOldest)}` : null,
      },
      {
        key: 'talking', label: 'Talking', anchor: 'booking-talking',
        count: degraded('negotiations') ? null : negotiationsLive().length,
        waiting: parkedMoves().length,
        detail: nextDeadline && !Number.isNaN(timestampMillis(nextDeadline)) ? `answers ${formatIsoUntil(nextDeadline)}` : null,
      },
      {
        key: 'booked', label: 'Booked', anchor: 'booking-booked',
        count: degraded('shows') && degraded('gig_plan') ? null : bookedCount(),
        detail: nextNight ? `next ${formatIsoUntil(nextNight)}` : null,
      },
    ]
  })

  // The one cheap answer a card may carry in place: confirming a screened
  // candidate is a yes/no a person gives in a click — the same carry-out
  // the attention inbox performs. Everything else links to its owner.
  //
  // Confirm only ever files a contact — nothing is sent — and upstream only
  // accepts an email route with a named city, so the cards below say that
  // before the click and refuse in words when it cannot succeed.
  const [pendingIds, setPendingIds] = createSignal<ReadonlySet<string>>(new Set())
  const [cardErrors, setCardErrors] = createSignal<Readonly<Record<string, string>>>({})
  const confirm = useMutation(() => ({
    mutationFn: async (input: {
      kind: 'booking' | 'outreach'
      id: string
      name: string
      citySlug: string | null
    }) => {
      const result = input.kind === 'booking'
        ? await api.confirmBookingCandidate(props.slug, input.id)
        : await api.confirmOutreachCandidate(props.slug, input.id)
      return { input, result }
    },
    onMutate: input => {
      setPendingIds(ids => new Set(ids).add(input.id))
      setCardErrors(prev => {
        if (!(input.id in prev)) return prev
        const next = { ...prev }
        delete next[input.id]
        return next
      })
    },
    onSuccess: async ({ input, result }) => {
      // A promotion that replayed or filed nothing still answers 200 — the
      // card reads what actually happened, not "it worked".
      if (input.kind === 'outreach' && result.target_id === null) {
        setCardErrors(prev => ({ ...prev, [input.id]: 'Upstream left it waiting — nothing was saved.' }))
        return
      }
      setConfirmed(list => [
        ...list,
        { kind: input.kind, id: input.id, name: input.name, citySlug: input.citySlug, replayed: result.replayed },
      ])
      toast.success(input.kind === 'booking'
        ? `Confirmed: ${input.name} saved as a ${input.citySlug} booking contact.`
        : `Confirmed: ${input.name} saved as a contact.`)
      // The same candidates sit in Today's queue and the attention
      // snapshot — the server cache already cleared (the mutation handler
      // invalidates the tenant); these keys clear the browser's copies.
      // Places and the city funnel join them: a city that just gained a
      // booking contact is a city whose plan can move.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenant-booking', props.slug] }),
        queryClient.invalidateQueries({ queryKey: ['tenant-today', props.slug] }),
        queryClient.invalidateQueries({ queryKey: ['tenant-operator-attention-snapshot', props.slug] }),
        queryClient.invalidateQueries({ queryKey: ['tenant-places', props.slug] }),
        queryClient.invalidateQueries({ queryKey: ['city-funnel', props.slug] }),
      ])
    },
    // A refusal is an answer and belongs on the card it came from — keyed
    // by candidate id so one failure does not mark every card.
    onError: (error, input) => {
      const status = error instanceof ApiError ? error.status : undefined
      const message = status === 409
        ? "Couldn't confirm this one. It needs an email address and a city, and it must still be waiting for you."
        : status === 404
          ? 'Someone already handled this.'
          : failureLine("Couldn't confirm it", error)
      setCardErrors(prev => ({ ...prev, [input.id]: message }))
      if (status === 404) {
        void queryClient.invalidateQueries({ queryKey: ['tenant-booking', props.slug] })
      }
    },
    onSettled: (_data, _error, input) => {
      setPendingIds(ids => {
        const next = new Set(ids)
        next.delete(input.id)
        return next
      })
    },
  }))

  // ── One table ────────────────────────────────────────────────────────
  // Every stage's items as rows of one table, filtered by stage. The rail
  // above is the stage summary and drills into the same filter.
  const [stage, setStage] = createSignal<StageFilter>('all')
  const [write, setWrite] = createSignal<OpenWrite | null>(null)
  const refreshBooking = () => void queryClient.invalidateQueries({ queryKey: ['tenant-booking', props.slug] })

  const rows = createMemo((): PipelineRow[] => {
    const out: PipelineRow[] = []
    const push = (row: Omit<PipelineRow, 'order'>) => out.push({ ...row, order: out.length })
    const platform = authState.isPlatformLevel()

    // Waiting on you — the human gate first.
    for (const c of confirmed()) {
      push({
        id: `confirmed-${c.id}`, stage: 'waiting', title: c.name,
        meta: c.kind === 'booking'
          ? c.replayed ? 'Already a booking contact' : `Added to ${c.citySlug}'s booking contacts`
          : c.replayed ? 'Already a contact' : 'Added to outreach contacts',
        status: { label: 'Confirmed', tone: 'good' }, when: null, whenLabel: null,
        action: c.kind === 'booking' && c.citySlug
          ? <Link to="/tenants/$slug/cities/$cityId" params={{ slug: props.slug, cityId: c.citySlug }} class={buttonVariants({ variant: 'outline', size: 'sm' })}>Open {c.citySlug}</Link>
          : undefined,
      })
    }
    for (const c of waitingBooking()) {
      const refusal = bookingRefusal(c)
      push({
        id: c.candidate_id, stage: 'waiting', title: c.display_name,
        meta: [tokenLabel(c.target_kind), c.city_slug, `fit ${confidencePercent(c.fit_basis_points)}`, `via ${c.source}`].filter(Boolean).join(' · '),
        // The consequence is read before the click, not learned after it —
        // or the refusal, which is the same sentence's other half.
        note: refusal ?? (platform
          ? `Confirm adds ${c.display_name} as a booking contact for ${c.city_slug}. The gig planner can write to them. Nothing is sent.`
          : `Confirm saves ${c.display_name} as someone who books shows in ${c.city_slug}. Nothing is sent.`),
        error: cardErrors()[c.candidate_id],
        status: refusal === null ? { label: 'To confirm', tone: 'warn' } : { label: "Can't file yet", tone: 'muted' },
        when: null, whenLabel: null,
        action: refusal === null
          ? <Button size="sm" writes disabled={pendingIds().has(c.candidate_id)} onClick={() => confirm.mutate({ kind: 'booking', id: c.candidate_id, name: c.display_name, citySlug: c.city_slug })}>
              {pendingIds().has(c.candidate_id) && <Spinner />} Confirm
            </Button>
          : undefined,
      })
    }
    for (const c of waitingOutreach()) {
      // Only an email route becomes an outreach contact — for a form or a
      // handle there is nothing to file, and the button would lie.
      const confirmable = c.route_kind === 'email'
      push({
        id: c.id, stage: 'waiting', title: c.display_name,
        meta: [tokenLabel(c.target_kind), c.pitch_class ? humanizeToken(c.pitch_class) : null, `fit ${confidencePercent(c.fit_basis_points)}`,
          c.follower_count != null ? `${c.follower_count.toLocaleString()} followers` : null].filter(Boolean).join(' · '),
        note: confirmable
          ? platform ? `Confirm adds ${c.display_name} to outreach contacts. Nothing is sent.` : `Confirm saves ${c.display_name} as a contact. Nothing is sent.`
          : `${tokenLabel(c.route_kind)} route: nothing to save. Apply by hand.`,
        noteLink: !confirmable && isHttpUrl(c.source_reference) ? c.source_reference : undefined,
        error: cardErrors()[c.id],
        status: confirmable ? { label: 'To confirm', tone: 'warn' } : { label: 'Apply by hand', tone: 'muted' },
        when: null, whenLabel: null,
        action: confirmable
          ? <Button size="sm" writes disabled={pendingIds().has(c.id)} onClick={() => confirm.mutate({ kind: 'outreach', id: c.id, name: c.display_name, citySlug: null })}>
              {pendingIds().has(c.id) && <Spinner />} Confirm
            </Button>
          : undefined,
      })
    }
    for (const p of proposals()) {
      push({
        id: `proposal-${p.city_name}-${p.venue}-${out.length}`, stage: 'waiting', title: `${p.city_name} — ${p.venue}`,
        meta: [`${p.reach.reachable.toLocaleString()} reachable`, p.reach.room_typical_draw != null ? `room draws ~${p.reach.room_typical_draw}` : null,
          p.contact[0] ? `to ${p.contact[0].name}` : null,
          p.caveats.length > 0 ? `${p.caveats.length} caveat${p.caveats.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · '),
        status: { label: 'Plan to approve', tone: 'warn' }, when: null, whenLabel: null,
        action: <Link to="/tenants/$slug/places" params={{ slug: props.slug }} class={buttonVariants({ variant: 'outline', size: 'sm' })}>Review the plan</Link>,
      })
    }
    for (const n of parkedMoves()) push(negotiationRow(props.slug, n, 'waiting'))
    for (const r of repliesWaiting()) {
      push({
        id: `reply-${r.id ?? out.length}`, stage: 'waiting',
        title: tokenLabel(r.classified_disposition ?? r.target_kind),
        meta: [r.human_review_reason ?? 'Classified for human review',
          r.proposed_fee_minor != null && r.proposed_currency ? `proposed ${money(r.proposed_fee_minor, r.proposed_currency)}` : null].filter(Boolean).join(' · '),
        status: { label: 'Reply to read', tone: 'warn' }, when: r.classified_at, whenLabel: formatIsoAge(r.classified_at),
        action: <Link to="/tenants/$slug/operations" params={{ slug: props.slug }} search={{ tab: 'replies' }} class={buttonVariants({ variant: 'outline', size: 'sm' })}>Read it</Link>,
      })
    }

    // Found — the scout's watch list, best fit first.
    for (const e of watching()) {
      push({
        id: `found-${e.opportunity_id}`, stage: 'found', title: e.title,
        meta: [e.organization, `fit ${confidencePercent(e.fit_basis_points)}`].filter(Boolean).join(' · '),
        status: e.stale_reason ? { label: tokenLabel(e.stale_reason), tone: 'muted' } : { label: 'Watching', tone: 'muted' },
        when: e.deadline ?? e.source_observed_at ?? null,
        whenLabel: e.deadline ? `deadline ${formatIsoUntil(e.deadline)}` : e.source_observed_at ? `seen ${formatIsoAge(e.source_observed_at)}` : null,
        // Where the application actually stands — only a person knows it
        // left, came back, won or lost. A terminal answer needs its reason.
        action: <Button variant="outline" size="sm" writes onClick={() => setWrite({
          title: 'Mark progress', description: e.title,
          action: capabilityAction('team-opportunities', 'Progress'),
          fixed: { opportunity_id: e.opportunity_id }, initial: { progress: 'package_ready' }, submitLabel: 'Save progress',
        })}>Mark progress</Button>,
      })
    }

    // Approached — asks already out the door.
    for (const e of applied()) {
      push({
        id: `applied-${e.opportunity_id}`, stage: 'approached', title: e.title,
        meta: [e.organization, `fit ${confidencePercent(e.fit_basis_points)}`].filter(Boolean).join(' · '),
        status: e.status === 'replied' ? { label: 'They answered', tone: 'good' } : { label: 'Application sent', tone: 'muted' },
        when: e.source_observed_at ?? null, whenLabel: e.source_observed_at ? `seen ${formatIsoAge(e.source_observed_at)}` : null,
        action: <Button variant="outline" size="sm" writes onClick={() => setWrite({
          title: 'What happened', description: e.title,
          action: capabilityAction('team-opportunities', 'Progress'),
          fixed: { opportunity_id: e.opportunity_id }, initial: { progress: 'replied' }, submitLabel: 'Save progress',
        })}>What happened</Button>,
      })
    }
    for (const o of lettersOut()) {
      const state = letterState(o)
      push({
        id: `letter-${o.city_name}-${o.venue}-${o.approved_at}`, stage: 'approached', title: `${o.city_name} — ${o.venue}`,
        meta: state.meta, status: { label: state.label, tone: state.tone },
        when: o.approved_at, whenLabel: `approved ${formatIsoAge(o.approved_at)}`,
      })
    }
    for (const a of approachedAgents()) {
      push({
        id: `agent-${a.name}-${a.agency ?? ''}`, stage: 'approached', title: a.name,
        meta: [a.agency ?? 'Independent', a.refused_until ? `declined until ${formatIsoUntil(a.refused_until)}` : null].filter(Boolean).join(' · '),
        status: a.approach_pending ? { label: 'Approach queued', tone: 'muted' } : { label: 'Approached', tone: 'muted' },
        when: a.approached_at ?? null, whenLabel: a.approached_at ? formatIsoAge(a.approached_at) : null,
      })
    }

    // Talking — live terms conversations; parked ones already sit above.
    for (const n of negotiationsLive().filter(n => n.pending_move == null)) push(negotiationRow(props.slug, n, 'talking'))

    // Booked — what the pipeline produced.
    for (const o of bookedOutcomes()) {
      push({
        id: `booked-${o.city_name}-${o.venue}-${o.approved_at}`, stage: 'booked', title: `${o.city_name} — ${o.venue}`,
        meta: `${o.recipients} contacted · ${o.replies} replied`,
        status: { label: 'Became a night', tone: 'good' }, when: o.approved_at, whenLabel: `approved ${formatIsoAge(o.approved_at)}`,
      })
    }
    for (const show of upcoming()) {
      push({
        id: `show-${show.slug}`, stage: 'booked', title: show.title,
        meta: show.venue ?? '',
        status: show.status === 'draft' ? { label: 'Draft', tone: 'muted' } : { label: 'On the calendar', tone: 'good' },
        when: show.starts_at, whenLabel: `starts ${formatIsoUntil(show.starts_at)}`,
        action: <Link to="/tenants/$slug/shows/$eventSlug" params={{ slug: props.slug, eventSlug: show.slug }} class={buttonVariants({ variant: 'outline', size: 'sm' })}>Open night</Link>,
      })
    }
    return out
  })

  // A stage whose every source is down reads as unknown, not empty.
  const stageDown = (key: StageKey) =>
    key === 'waiting' ? gateDown()
    : key === 'found' ? degraded('shortlist')
    : key === 'approached' ? degraded('agents') && degraded('gig_plan') && degraded('shortlist')
    : key === 'talking' ? degraded('negotiations')
    : degraded('shows') && degraded('gig_plan')
  // Talking counts every live conversation, parked moves included, so the
  // chip matches the rail even though parked ones are listed under Waiting.
  const stageCount = (key: StageFilter) =>
    key === 'all' ? rows().length
    // Just-confirmed rows stay listed as proof of the click, but they no
    // longer wait on anyone — count them the way the rail does.
    : key === 'waiting' ? waitingCount()
    : key === 'talking' ? negotiationsLive().length
    : rows().filter(r => r.stage === key).length
  const visible = () =>
    stage() === 'all' ? rows()
    : stage() === 'talking' ? rows().filter(r => r.stage === 'talking' || (r.stage === 'waiting' && r.talking))
    : rows().filter(r => r.stage === stage())

  const selectStage = (key: StageKey) => {
    setStage(key)
    document.getElementById('booking-pipeline')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const railStages = () => stages().map(s => ({ ...s, anchor: undefined, selected: stage() === s.key, onSelect: () => selectStage(s.key as StageKey) }))

  const columns: ColumnDef<PipelineRow, any>[] = [
    {
      id: 'item', header: 'Item', accessorFn: r => r.title, meta: { class: 'min-w-64' },
      cell: c => {
        const r = c.row.original
        return <>
          <span class="font-medium text-foreground">{r.title}</span>
          <Show when={r.meta}><span class="block text-muted-foreground">{r.meta}</span></Show>
          <Show when={r.note}>
            <span class="mt-0.5 block max-w-md text-xs text-muted-foreground text-pretty">
              {r.note}
              <Show when={r.noteLink}>{' '}<a href={r.noteLink} target="_blank" rel="noopener" class="break-all underline underline-offset-2">{r.noteLink}</a></Show>
            </span>
          </Show>
          <Show when={r.error}><span class="mt-0.5 block max-w-md text-xs text-error-foreground text-pretty">{r.error}</span></Show>
        </>
      },
    },
    {
      id: 'stage', header: 'Stage', accessorFn: r => r.order, meta: { class: 'whitespace-nowrap' },
      cell: c => <span class="text-muted-foreground">
        {STAGE_LABEL[c.row.original.stage]}
        {/* A parked move waits on you and is still a live conversation —
            say both, so the Talking filter doesn't look wrong. */}
        <Show when={c.row.original.talking}><span class="block text-xs">and Talking</span></Show>
      </span>,
    },
    {
      id: 'status', header: 'Status', accessorFn: r => r.status.label,
      cell: c => <Pill tone={c.row.original.status.tone}>{c.row.original.status.label}</Pill>,
    },
    {
      id: 'when', header: 'When', accessorFn: r => timestampMillis(r.when) || 0, meta: { class: 'whitespace-nowrap' },
      // A date that does not parse says nothing — "answers —" is noise.
      cell: c => {
        const r = c.row.original
        const known = r.when == null || !Number.isNaN(timestampMillis(r.when))
        return <span class="text-muted-foreground">{known ? r.whenLabel ?? '—' : '—'}</span>
      },
    },
    {
      id: 'action', header: () => <span class="sr-only">Action</span>, enableSorting: false, enableHiding: false,
      meta: { class: 'text-right whitespace-nowrap' },
      cell: c => c.row.original.action,
    },
  ]

  const emptyFor = (key: StageFilter) => {
    if (key !== 'all' && stageDown(key)) return <DegradedLine name={key === 'waiting' ? 'reply_triage' : key === 'found' ? 'shortlist' : key === 'talking' ? 'negotiations' : key} />
    switch (key) {
      case 'waiting': return <EmptyState icon={<CalendarDays />} label="Nothing waiting on you" hint="The pipeline's gate is clear — nothing is parked on a person." />
      case 'found': return <EmptyState icon={<CalendarDays />} label="Nothing on the watch list" hint="The scout has no live candidates. Add one you heard about." />
      case 'approached': return <EmptyState icon={<CalendarDays />} label="Nothing out yet" hint="Approved letters, applications and agent approaches land here." />
      case 'talking': return <EmptyState icon={<CalendarDays />} label="No live terms conversations" hint="When someone answers with an offer, the conversation lands here." />
      case 'booked': return <EmptyState icon={<CalendarDays />} label="Nothing booked yet" hint="When an approach becomes a night it lands here — and on the Nights tab." />
      default: return <EmptyState icon={<CalendarDays />} label="The pipeline is empty" hint="Opportunities the scout finds and ones you add show up here as they move toward a booked night." />
    }
  }

  return (
    <>
      <Show when={model.error}>
        <SectionFailureCard
          error={model.error}
          title="Couldn't load the booking pipeline"
          onRetry={() => void model.refetch()}
        />
      </Show>
      <Show when={!model.error && !model.data}>
        <SkeletonSection titleWidth="220px" lines={2} minHeight="72px" />
        <SkeletonSection titleWidth="160px" lines={4} minHeight="180px" />
      </Show>
      <Show when={model.data}>
        {data => (
          <div class="space-y-6">
            <DegradedNotice degraded={data().degraded} />
            <StageTiles stages={railStages()} />

            <div id="booking-pipeline" class="scroll-mt-4 rounded-xl border border-border bg-card p-4 sm:p-5">
              <Section
                flush
                title="Booking pipeline"
                icon={<SectionIcon name="target" />}
                count={rows().length}
                description="Every ask on its way to a night, in pipeline order: what waits on you, what the scout found, what is out the door, who is talking terms, and what got booked."
              >
                <DataTable
                  data={visible()}
                  columns={columns}
                  getRowId={r => r.id}
                  bordered={false}
                  pageSize={15}
                  initialSorting={[{ id: 'stage', desc: false }]}
                  searchText={r => [r.title, r.meta, r.note, r.status.label, STAGE_LABEL[r.stage]].filter(Boolean).join(' ')}
                  searchPlaceholder="Search by name, venue or organisation"
                  toolbar={
                    <div role="group" aria-label="Stage" class="flex flex-wrap items-center gap-1">
                      <For each={STAGE_FILTERS}>{key => (
                        <Button variant={stage() === key ? 'secondary' : 'ghost'} size="sm" aria-pressed={stage() === key} onClick={() => setStage(key)}>
                          {key === 'all' ? 'All' : STAGE_LABEL[key]}
                          <span class="tabular-nums text-muted-foreground">{key !== 'all' && stageDown(key) ? '—' : stageCount(key)}</span>
                        </Button>
                      )}</For>
                    </div>
                  }
                  actions={
                    // A person hears about a slot, a grant or a showcase before
                    // any scout does. Filing it puts it through the same
                    // shortlist, costing and refusal rules as a found one.
                    <Button writes variant="outline" size="sm" onClick={() => setWrite({
                      title: 'Add an opportunity',
                      description: 'A slot, grant or showcase you heard about. It goes through the same shortlist, costing and refusal rules as one the scout found.',
                      action: capabilityAction('team-opportunities', 'I found one'),
                      submitLabel: 'Add opportunity',
                    })}>
                      <Plus aria-hidden="true" /> Add one you heard about
                    </Button>
                  }
                  empty={emptyFor(stage())}
                />
              </Section>
            </div>

            <ActionSheet
              slug={props.slug}
              write={write()}
              onClose={() => setWrite(null)}
              onDone={() => { setWrite(null); refreshBooking() }}
            />
          </div>
        )}
      </Show>
    </>
  )
}

// ── Rows ──────────────────────────────────────────────────────────────

type StageKey = 'waiting' | 'found' | 'approached' | 'talking' | 'booked'
type StageFilter = 'all' | StageKey
const STAGE_FILTERS: StageFilter[] = ['all', 'waiting', 'found', 'approached', 'talking', 'booked']
const STAGE_LABEL: Record<StageKey, string> = {
  waiting: 'Waiting on you', found: 'Found', approached: 'Approached', talking: 'Talking', booked: 'Booked',
}

/** One item anywhere in the pipeline, whatever read it came from. */
type PipelineRow = {
  id: string
  stage: StageKey
  /** Pipeline position — the default sort, gate first. */
  order: number
  title: string
  meta: string
  /** What the action does, or why there is none — read before the click. */
  note?: string
  noteLink?: string
  error?: string
  status: { label: string; tone: Tone }
  when: string | null
  whenLabel: string | null
  action?: JSX.Element
  /** A parked negotiation is waiting on you and still a live conversation. */
  talking?: boolean
}

/** A row the operator already said yes to — kept in page state because the
 *  admitted queue stops carrying it the moment upstream files it. */
type ConfirmedEntry = {
  kind: 'booking' | 'outreach'
  id: string
  name: string
  citySlug: string | null
  replayed: boolean
}

/// Upstream confirm files only an email route into a booking target — the
/// refusal is an answer, so the row says it instead of offering a click
/// that can only 409.
function bookingRefusal(c: BookingCandidateView): string | null {
  if (c.route_kind !== 'email') {
    return `Only an email route can be saved as a booking contact. This one is a ${c.route_kind}.`
  }
  if (c.city_slug == null) {
    return "No city named, so it can't be filed under a city yet."
  }
  return null
}

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value)

function negotiationRow(slug: string, n: NegotiationEntry, stage: StageKey): Omit<PipelineRow, 'order'> {
  return {
    id: `negotiation-${n.opportunity_id}`, stage, talking: stage === 'waiting',
    title: n.title,
    meta: [n.organization, `on the table ${money(n.offered_fee_minor, n.currency)}`,
      n.countered_fee_minor != null ? `asked ${money(n.countered_fee_minor, n.currency)}` : null].filter(Boolean).join(' · '),
    status: n.pending_move ? { label: 'Move parked', tone: 'warn' } : { label: 'Talking', tone: 'muted' },
    when: n.responds_by, whenLabel: `answers ${formatIsoUntil(n.responds_by)}`,
    action: (
      <Link to="/tenants/$slug/operations" params={{ slug }} search={{ tab: 'negotiations' }} class={buttonVariants({ variant: 'outline', size: 'sm' })}>
        {n.pending_move ? 'Answer the move' : 'Open terms'}
      </Link>
    ),
  }
}

/// Upstream's own vocabulary (track_record.rs): the letter only "left" on
/// `succeeded`; `cancelled` means it never did; anything else — queued,
/// running, reconciling — is parked on the executor, not closed.
function letterState(o: GigPlanOutcome): { label: string; tone: Tone; meta: string } {
  if (o.action_status === 'cancelled') return { label: 'Never sent', tone: 'muted', meta: 'Cancelled before it left' }
  if (o.action_status === 'failed' || o.action_status === 'unknown') return { label: 'Send failed', tone: 'bad', meta: `The send ended ${o.action_status}` }
  if (o.action_status !== 'succeeded') return { label: 'Letter parked', tone: 'warn', meta: `Still ${o.action_status} — has not gone out` }
  const replies = `${o.replies} ${o.replies === 1 ? 'reply' : 'replies'}`
  if (o.unfinished_measurements > 0) return { label: 'Letter out', tone: 'muted', meta: `Sent to ${o.recipients} · ${replies} · replies may still land` }
  return { label: 'Closed, no night', tone: 'muted', meta: `Sent to ${o.recipients} · ${replies} · window closed` }
}

// A section the tenant could not serve reads as its own honest line — the
// table beside it keeps working, and the name tells the operator which
// upstream route to chase.
function DegradedNotice(props: { degraded: readonly string[] }) {
  return (
    <Show when={props.degraded.length > 0}>
      <div class="flex flex-col gap-2">
        <For each={props.degraded}>
          {name => (
            <Alert tone="warning" role="status">
              <strong>{sectionLabel[name] ?? humanizeToken(name)}</strong> didn't load. The counts below
              leave it out, so a stage may look smaller than it is. It comes back on its own.
            </Alert>
          )}
        </For>
      </div>
    </Show>
  )
}

function DegradedLine(props: { name: string }) {
  return (
    <p class="py-6 text-center text-sm text-muted-foreground">
      {sectionLabel[props.name] ?? humanizeToken(props.name)} didn't load, so this is unknown rather than empty.
    </p>
  )
}
