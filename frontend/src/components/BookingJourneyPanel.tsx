import { For, Show, createMemo, createSignal } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { ArrowRight } from 'lucide-solid'
import { api, ApiError } from '../lib/api'
import { authState } from '../lib/auth'
import { confidencePercent, errorMessage, formatIsoAge, formatIsoUntil, money } from '../lib/format'
import { hasDegradedSections, whileIncomplete } from '../lib/incomplete'
import { toast } from './app/toast'
import { Alert } from './app/alert'
import { Button, buttonVariants } from './app/button'
import { EmptyState } from './ui/empty-state'
import { Section } from './layout'
import { SectionFailureCard } from './SectionFailureCard'
import { SkeletonSection } from './Skeleton'
import { Spinner } from './Spinner'
import { JourneyCard, JourneyRail, type JourneyStageSpec } from './Journey'
import type {
  BookingAgent,
  BookingCandidateView,
  GigPlanOutcome,
  GigPlanProposal,
  NegotiationEntry,
  OpportunityShortlistEntry,
  OutreachCandidateView,
  ReplyTriageEntry,
  TenantBookingSection,
  TenantShow,
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
        || (b.source_observed_at ?? '').localeCompare(a.source_observed_at ?? ''),
      ),
  )
  const [shownFound, setShownFound] = createSignal(10)
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
        detail: nextDeadline ? `answers ${formatIsoUntil(nextDeadline)}` : null,
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
        ? "Couldn't confirm: upstream refused it (it needs an email route and a city, and must still be waiting)."
        : status === 404
          ? 'Already handled elsewhere.'
          : errorMessage(error, 'The confirm did not go through')
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

  return (
    <>
      <Show when={model.error}>
        <SectionFailureCard
          error={model.error}
          fallback="The booking pipeline could not be read"
          onRetry={() => void model.refetch()}
        />
      </Show>
      <Show when={!model.error && !model.data}>
        <SkeletonSection titleWidth="220px" lines={2} minHeight="72px" />
        <SkeletonSection titleWidth="160px" lines={4} minHeight="180px" />
      </Show>
      <Show when={model.data}>
        {data => (
          <>
            <DegradedNotice degraded={data().degraded} />
            <div class="mb-6">
              <JourneyRail stages={stages()} />
            </div>

            {/* The human gate first — a pipeline view that buries the asks
                under the inventory is the old page again. `Section` has no
                id prop, so each stage's rail anchor lives on the wrapper. */}
            <div id="booking-waiting" class="scroll-mt-4">
            <Section
              title="Waiting on you"
              count={waitingCount()}
              lead
              flush
              description="Everything the pipeline cannot move past until a person says so — screened routes to confirm, plans to approve, moves parked mid-negotiation, replies nobody has read."
            >
              <Show
                when={waitingCount() > 0 || confirmed().length > 0}
                fallback={
                  <p class="text-sm text-muted-foreground">
                    {gateDown()
                      ? 'Cannot read the gate — every queue that feeds it is degraded.'
                      : 'Nothing parked — the pipeline\'s gate is clear.'}
                  </p>
                }
              >
                <div class="flex flex-col gap-2">
                  {/* Confirmed rows leave `admitted` on the next refetch, so
                      the proof of the click lives here — in page state —
                      not in the queue that no longer carries the row. */}
                  <Show when={confirmed().length > 0}>
                    <p class="text-xs font-medium text-muted-foreground">Just confirmed</p>
                    <For each={confirmed()}>
                      {c => <ConfirmedCard slug={props.slug} entry={c} />}
                    </For>
                  </Show>
                  <For each={waitingBooking()}>
                    {c => <CandidateCard candidate={c} confirming={pendingIds().has(c.candidate_id)} error={cardErrors()[c.candidate_id]} onConfirm={() => confirm.mutate({ kind: 'booking', id: c.candidate_id, name: c.display_name, citySlug: c.city_slug })} />}
                  </For>
                  <For each={waitingOutreach()}>
                    {c => <OutreachCard candidate={c} confirming={pendingIds().has(c.id)} error={cardErrors()[c.id]} onConfirm={() => confirm.mutate({ kind: 'outreach', id: c.id, name: c.display_name, citySlug: null })} />}
                  </For>
                  <For each={proposals()}>
                    {p => <ProposalCard slug={props.slug} proposal={p} />}
                  </For>
                  <For each={parkedMoves()}>
                    {n => <NegotiationCard slug={props.slug} entry={n} />}
                  </For>
                  <For each={repliesWaiting()}>
                    {r => <ReplyCard slug={props.slug} entry={r} />}
                  </For>
                </div>
              </Show>
            </Section>
            </div>

            <div id="booking-found" class="scroll-mt-4">
            <Section
              title="Found"
              count={degraded('shortlist') ? undefined : watching().length}
              description="What the scout is tracking — opportunities it has seen but not yet approached. A stale row says why it cannot be worked."
            >
              <Show
                when={!degraded('shortlist')}
                fallback={<DegradedLine name="shortlist" />}
              >
                <Show
                  when={watching().length > 0}
                  fallback={<p class="text-sm text-muted-foreground">Nothing on the watch list — the scout has no live candidates.</p>}
                >
                  <div class="flex flex-col gap-2">
                    <For each={watching().slice(0, shownFound())}>
                      {e => <ShortlistCard slug={props.slug} entry={e} />}
                    </For>
                    <div class="flex items-center gap-4">
                      <Show when={watching().length > shownFound()}>
                        <Button variant="outline" size="sm" onClick={() => setShownFound(n => n + 20)}>
                          Show more
                        </Button>
                      </Show>
                      <Show when={watching().length > 10}>
                        <DrillLink slug={props.slug} to="outreach" label={`All ${watching().length} on the shortlist`} />
                      </Show>
                    </div>
                  </div>
                </Show>
              </Show>
            </Section>
            </div>

            <div id="booking-approached" class="scroll-mt-4">
            <Section
              title="Approached"
              count={degraded('agents') && degraded('gig_plan') && degraded('shortlist') ? undefined : approachedCount()}
              description="Asks already out the door — applications sent, agent doors knocked on, gig-plan letters measuring their replies."
            >
              <Show
                when={!(degraded('agents') && degraded('gig_plan') && degraded('shortlist'))}
                fallback={<DegradedLine name="approached" />}
              >
                <Show
                  when={approachedCount() > 0}
                  fallback={<p class="text-sm text-muted-foreground">Nothing out yet — approved letters, applications and agent approaches land here.</p>}
                >
                  <div class="flex flex-col gap-2">
                    <For each={applied()}>
                      {e => <AppliedCard slug={props.slug} entry={e} />}
                    </For>
                    <For each={lettersOut()}>
                      {o => <LetterOutCard outcome={o} />}
                    </For>
                    <For each={approachedAgents()}>
                      {a => <AgentCard agent={a} />}
                    </For>
                  </div>
                </Show>
              </Show>
            </Section>
            </div>

            <div id="booking-talking" class="scroll-mt-4">
            <Section
              title="Talking"
              count={degraded('negotiations') ? undefined : negotiationsLive().length}
              description="Live terms conversations — who answered, what is on the table, when the next move is due."
            >
              <Show
                when={!degraded('negotiations')}
                fallback={<DegradedLine name="negotiations" />}
              >
                <Show
                  when={negotiationsLive().length > 0}
                  fallback={<p class="text-sm text-muted-foreground">No live terms conversations.</p>}
                >
                  <div class="flex flex-col gap-2">
                    <For each={negotiationsLive()}>
                      {n => <NegotiationCard slug={props.slug} entry={n} />}
                    </For>
                  </div>
                </Show>
              </Show>
            </Section>
            </div>

            <div id="booking-booked" class="scroll-mt-4">
            <Section
              title="Booked"
              count={degraded('shows') && degraded('gig_plan') ? undefined : bookedCount()}
              description="What the pipeline produced — nights on the calendar, and the gig-plan approvals that became real shows."
            >
              <Show
                when={!(degraded('shows') && degraded('gig_plan'))}
                fallback={<DegradedLine name="booked" />}
              >
                <Show
                  when={bookedCount() > 0}
                  fallback={
                    <EmptyState
                      label="Nothing booked yet"
                      hint="When an approach becomes a night it lands here — and on the Nights tab."
                    />
                  }
                >
                  <div class="flex flex-col gap-2">
                    <For each={bookedOutcomes()}>
                      {o => <BookedOutcomeCard outcome={o} />}
                    </For>
                    <For each={upcoming()}>
                      {s => <ShowNightCard slug={props.slug} show={s} />}
                    </For>
                  </div>
                </Show>
              </Show>
            </Section>
            </div>
          </>
        )}
      </Show>
    </>
  )
}

// ── Cards ────────────────────────────────────────────────────────────

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
/// refusal is an answer, so the card says it instead of offering a click
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

function CandidateCard(props: {
  candidate: BookingCandidateView
  confirming: boolean
  error?: string
  onConfirm: () => void
}) {
  const c = () => props.candidate
  const platform = authState.isPlatformLevel()
  return (
    <JourneyCard
      title={c().display_name}
      badge={{ label: 'route to confirm', tone: 'warn' }}
      meta={<>
        {c().target_kind.replaceAll('_', ' ')}
        {c().city_slug ? ` · ${c().city_slug}` : ''}
        {` · fit ${confidencePercent(c().fit_basis_points)}`}
        {` · via ${c().source}`}
      </>}
      action={
        <Show when={bookingRefusal(c()) === null}>
          <Button size="sm" writes disabled={props.confirming} onClick={props.onConfirm}>
            {props.confirming && <Spinner />} Confirm
          </Button>
        </Show>
      }
    >
      {/* The consequence is read before the click, not learned after it —
          or the refusal, which is the same sentence's other half. */}
      <p class="mt-1 text-xs text-muted-foreground">
        {bookingRefusal(c()) ?? (platform
          ? `Confirm adds ${c().display_name} as a booking contact for ${c().city_slug}. The gig planner can write to them. Nothing is sent.`
          : `Confirm saves ${c().display_name} as someone who books shows in ${c().city_slug}. Nothing is sent.`)}
      </p>
      <Show when={props.error}>
        {e => <p class="mt-1 text-xs text-destructive">{e()}</p>}
      </Show>
    </JourneyCard>
  )
}

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value)

function OutreachCard(props: {
  candidate: OutreachCandidateView
  confirming: boolean
  error?: string
  onConfirm: () => void
}) {
  const c = () => props.candidate
  const platform = authState.isPlatformLevel()
  const meta = () => [
    c().target_kind.replaceAll('_', ' '),
    c().pitch_class?.replaceAll('_', ' '),
    `fit ${confidencePercent(c().fit_basis_points)}`,
    c().follower_count != null ? `${c().follower_count!.toLocaleString()} followers` : null,
  ].filter(Boolean).join(' · ')
  // Only an email route becomes an outreach contact — for a form or a
  // handle there is nothing to file, and the button would lie.
  const confirmable = () => c().route_kind === 'email'
  return (
    <JourneyCard
      title={c().display_name}
      badge={{ label: 'route to confirm', tone: 'warn' }}
      meta={meta()}
      action={
        <Show when={confirmable()}>
          <Button size="sm" writes disabled={props.confirming} onClick={props.onConfirm}>
            {props.confirming && <Spinner />} Confirm
          </Button>
        </Show>
      }
    >
      <p class="mt-1 text-xs text-muted-foreground">
        {confirmable()
          ? platform
            ? `Confirm adds ${c().display_name} to outreach contacts. Nothing is sent.`
            : `Confirm saves ${c().display_name} as a contact. Nothing is sent.`
          : `${c().route_kind} route: nothing to save. Apply by hand.`}
        {' '}
        <Show when={!confirmable() && isHttpUrl(c().source_reference)}>
          <a href={c().source_reference} target="_blank" rel="noopener" class="underline underline-offset-2">
            {c().source_reference}
          </a>
        </Show>
      </p>
      <Show when={props.error}>
        {e => <p class="mt-1 text-xs text-destructive">{e()}</p>}
      </Show>
    </JourneyCard>
  )
}

function ConfirmedCard(props: { slug: string; entry: ConfirmedEntry }) {
  const c = () => props.entry
  return (
    <JourneyCard
      title={c().name}
      badge={{ label: 'confirmed', tone: 'good' }}
      meta={c().kind === 'booking'
        ? c().replayed
          ? 'Already a booking contact'
          : `Added to ${c().citySlug}'s booking contacts`
        : c().replayed
          ? 'Already a contact'
          : 'Added to outreach contacts'}
      action={
        <Show when={c().kind === 'booking' && c().citySlug}>
          <Link
            to="/tenants/$slug/cities/$cityId"
            params={{ slug: props.slug, cityId: c().citySlug! }}
            class={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Open {c().citySlug}
          </Link>
        </Show>
      }
    />
  )
}

function ProposalCard(props: { slug: string; proposal: GigPlanProposal }) {
  const p = () => props.proposal
  const meta = () => [
    `${p().reach.reachable.toLocaleString()} reachable`,
    p().reach.room_typical_draw != null ? `room draws ~${p().reach.room_typical_draw}` : null,
    p().contact[0] ? `to ${p().contact[0]!.name}` : null,
    p().caveats.length > 0 ? `${p().caveats.length} caveat${p().caveats.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <JourneyCard
      title={`${p().city_name} — ${p().venue}`}
      badge={{ label: 'plan to approve', tone: 'warn' }}
      meta={meta()}
      action={
        <Link
          to="/tenants/$slug/places"
          params={{ slug: props.slug }}
          class={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Review the plan
        </Link>
      }
    />
  )
}

function NegotiationCard(props: { slug: string; entry: NegotiationEntry }) {
  const n = () => props.entry
  return (
    <JourneyCard
      title={n().title}
      badge={n().pending_move
        ? { label: 'move parked', tone: 'warn' }
        : { label: `answers ${formatIsoUntil(n().responds_by)}`, tone: 'muted' }}
      meta={<>
        {n().organization}
        {` · on the table ${money(n().offered_fee_minor, n().currency)}`}
        {n().countered_fee_minor != null ? ` · asked ${money(n().countered_fee_minor!, n().currency)}` : ''}
        {` · answers ${formatIsoUntil(n().responds_by)}`}
      </>}
      action={
        <Link
          to="/tenants/$slug/operations"
          params={{ slug: props.slug }}
          search={{ tab: 'negotiations' }}
          class={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          {n().pending_move ? 'Answer the move' : 'Open terms'}
        </Link>
      }
    />
  )
}

function ReplyCard(props: { slug: string; entry: ReplyTriageEntry }) {
  const r = () => props.entry
  return (
    <JourneyCard
      title={r().classified_disposition?.replaceAll('_', ' ') ?? r().target_kind.replaceAll('_', ' ')}
      badge={{ label: 'reply to read', tone: 'warn' }}
      meta={<>
        {r().human_review_reason ?? 'classified for human review'}
        {` · ${formatIsoAge(r().classified_at)}`}
        {r().proposed_fee_minor != null && r().proposed_currency
          ? ` · proposed ${money(r().proposed_fee_minor!, r().proposed_currency!)}`
          : ''}
      </>}
      action={
        <Link
          to="/tenants/$slug/operations"
          params={{ slug: props.slug }}
          search={{ tab: 'replies' }}
          class={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Read it
        </Link>
      }
    />
  )
}

function ShortlistCard(props: { slug: string; entry: OpportunityShortlistEntry }) {
  const e = () => props.entry
  const meta = () => [
    e().organization,
    `fit ${confidencePercent(e().fit_basis_points)}`,
    e().deadline ? `deadline ${formatIsoUntil(e().deadline!)}` : null,
    e().source_observed_at ? `seen ${formatIsoAge(e().source_observed_at!)}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <JourneyCard
      title={e().title}
      badge={e().stale_reason
        ? { label: e().stale_reason!.replaceAll('_', ' '), tone: 'muted' }
        : { label: 'watching', tone: 'muted' }}
      meta={meta()}
      action={
        <Link
          to="/tenants/$slug/operations"
          params={{ slug: props.slug }}
          search={{ tab: 'outreach' }}
          class={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          <ArrowRight class="size-3.5" aria-hidden="true" /> Shortlist
        </Link>
      }
    />
  )
}

function AppliedCard(props: { slug: string; entry: OpportunityShortlistEntry }) {
  const e = () => props.entry
  const meta = () => [
    e().organization,
    `fit ${confidencePercent(e().fit_basis_points)}`,
    e().source_observed_at ? `seen ${formatIsoAge(e().source_observed_at!)}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <JourneyCard
      title={e().title}
      badge={e().status === 'replied'
        ? { label: 'they answered', tone: 'good' }
        : { label: 'application sent', tone: 'muted' }}
      meta={meta()}
      action={
        <Link
          to="/tenants/$slug/operations"
          params={{ slug: props.slug }}
          search={{ tab: 'outreach' }}
          class={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          <ArrowRight class="size-3.5" aria-hidden="true" /> Open
        </Link>
      }
    />
  )
}

function AgentCard(props: { agent: BookingAgent }) {
  const a = () => props.agent
  return (
    <JourneyCard
      title={a().name}
      badge={a().approach_pending
        ? { label: 'approach queued', tone: 'muted' }
        : { label: 'approached', tone: 'muted' }}
      meta={<>
        {a().agency ?? 'independent'}
        {a().approached_at ? ` · approached ${formatIsoAge(a().approached_at!)}` : ''}
        {a().refused_until ? ` · declined until ${formatIsoUntil(a().refused_until!)}` : ''}
      </>}
    />
  )
}

function LetterOutCard(props: { outcome: GigPlanOutcome }) {
  const o = () => props.outcome
  // Upstream's own vocabulary (track_record.rs): the letter only "left" on
  // `succeeded`; `cancelled` means it never did; anything else — queued,
  // running, reconciling — is parked on the executor, not closed.
  const state = (): { label: string; tone: 'warn' | 'muted' | 'bad'; meta: string } => {
    if (o().action_status === 'cancelled') {
      return { label: 'never sent', tone: 'muted', meta: `cancelled before it left · approved ${formatIsoAge(o().approved_at)}` }
    }
    if (o().action_status === 'failed' || o().action_status === 'unknown') {
      return { label: 'send failed', tone: 'bad', meta: `approved ${formatIsoAge(o().approved_at)} · the send ended ${o().action_status}` }
    }
    if (o().action_status !== 'succeeded') {
      return { label: 'letter parked', tone: 'warn', meta: `approved ${formatIsoAge(o().approved_at)} · still ${o().action_status} — has not gone out` }
    }
    if (o().unfinished_measurements > 0) {
      return { label: 'letter out', tone: 'muted', meta: `sent to ${o().recipients} · ${o().replies} ${o().replies === 1 ? 'reply' : 'replies'} · replies may still land` }
    }
    return { label: 'closed — no night', tone: 'muted', meta: `sent to ${o().recipients} · ${o().replies} ${o().replies === 1 ? 'reply' : 'replies'} · window closed` }
  }
  return (
    <JourneyCard
      title={`${o().city_name} — ${o().venue}`}
      badge={{ label: state().label, tone: state().tone }}
      meta={state().meta}
    />
  )
}

function BookedOutcomeCard(props: { outcome: GigPlanOutcome }) {
  const o = () => props.outcome
  return (
    <JourneyCard
      title={`${o().city_name} — ${o().venue}`}
      badge={{ label: 'became a night', tone: 'good' }}
      meta={<>{`approved ${formatIsoAge(o().approved_at)} · ${o().recipients} contacted · ${o().replies} replied`}</>}
    />
  )
}

function ShowNightCard(props: { slug: string; show: TenantShow }) {
  const s = () => props.show
  return (
    <Link
      to="/tenants/$slug/shows/$eventSlug"
      params={{ slug: props.slug, eventSlug: s().slug }}
      class="block rounded-lg transition-colors hover:bg-accent/40"
    >
      <JourneyCard
        title={s().title}
        badge={s().status === 'draft'
          ? { label: 'draft', tone: 'muted' }
          : { label: formatIsoUntil(s().starts_at), tone: 'good' }}
        meta={<>
          {s().venue ? `${s().venue} · ` : ''}
          {`starts ${formatIsoUntil(s().starts_at)}`}
        </>}
      />
    </Link>
  )
}

function DrillLink(props: { slug: string; to: string; label: string }) {
  return (
    <Link
      to="/tenants/$slug/operations"
      params={{ slug: props.slug }}
      search={{ tab: props.to }}
      class="inline-flex items-center gap-1 px-1 py-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      {props.label} <ArrowRight class="size-3.5" aria-hidden="true" />
    </Link>
  )
}

// A section the tenant could not serve reads as its own honest line — the
// card wall beside it keeps working, and the name tells the operator which
// upstream route to chase.
function DegradedNotice(props: { degraded: readonly string[] }) {
  return (
    <Show when={props.degraded.length > 0}>
      <div class="mb-4 flex flex-col gap-2">
        <For each={props.degraded}>
          {name => (
            <Alert tone="warning" role="status">
              <strong>{sectionLabel[name] ?? name}</strong> could not be read right now — counts below
              only cover the sections that answered, so a stage may be showing a partial picture.
              It comes back on its own.
            </Alert>
          )}
        </For>
      </div>
    </Show>
  )
}

function DegradedLine(props: { name: string }) {
  return (
    <p class="text-sm text-muted-foreground">
      {sectionLabel[props.name] ?? props.name} could not be read — unknown, not empty.
    </p>
  )
}
