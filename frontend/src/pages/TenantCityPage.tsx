import { For, Show } from 'solid-js'
import { Link, useParams } from '@tanstack/solid-router'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import type { CityFunnelRow, GigPlanOutcome, TenantShow } from '../lib/types'
import { PageShell, PageHeader, PanelTitle, KpiStrip, KpiCard } from '../components/layout'
import { SectionIcon } from '../components/SectionIcon'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { SkeletonSection, SkeletonKpiStrip } from '../components/Skeleton'
import { EmptyState } from '../components/ui/empty-state'
import { Card } from '../components/app/card'
import { Badge } from '../components/app/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/app/table'
import { GigPlanPassedOverRow, GigPlanProposalCard, useGigPlanApproval } from '../components/GigPlanProposalCard'
import { formatTimestamp } from '../lib/format'

// N.12 — the city as its own object. Until now a city was a row on the
// Places tab or a name in a proposal; this page is where one city opens.
//
// The route's `cityId` is the catalogue slug — the one identifier every
// payload actually shares. The funnel and the venue registry carry
// `city_slug`; the gig plan carries it as `city`; neither exposes the
// catalogue uuid to read, so the slug is the join. Slugs are only unique per
// country upstream — the payloads offer nothing finer to disambiguate on.
//
// Every section renders what exists and nothing more: a city with no rooms
// shows no rooms block, and a null stays a null — "—", never a fake zero.
// Each section owns its own loading and failure state; a section whose
// payload answered without this city is simply absent.

const count = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString()

const draw = (value: number | null) => (value == null ? '—' : Math.round(value).toLocaleString())

/** Months since the last show, with "never" kept distinct from "a long
 *  time" — a band that has never played a city and a band that played it two
 *  years ago need opposite things. */
const lastPlayed = (row: CityFunnelRow) => {
  if (row.last_show_at == null) return 'never played'
  if (row.months_since_show == null) return 'played, date unclear'
  if (row.months_since_show === 0) return 'this month'
  return `${row.months_since_show} mo ago`
}

/** The organise score as a plain word — the same bands the funnel table
 *  uses, coarse because the score's own inputs are coarse. */
const organiseBand = (bp: number): { label: string; variant: 'success' | 'warning' | 'muted' } => {
  if (bp >= 6_000) return { label: 'organise now', variant: 'success' }
  if (bp >= 3_000) return { label: 'worth a look', variant: 'warning' }
  return { label: 'not yet', variant: 'muted' }
}

/** The venue registry's own identity rule — upstream `place_venue_key()` is
 *  `lower(btrim(name))` with inner whitespace collapsed, and a show marks a
 *  room by exactly that key. Matching a show's venue text to one of this
 *  city's rooms therefore attributes the show the way the registry itself
 *  does — the only join the shows payload can support, since it carries a
 *  venue name and no city. */
const venueKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')

/** Free-text sheet cities meet the catalogue on a folded name: trimmed,
 *  case- and mark-insensitive, whitespace collapsed — "Wroclaw" typed in a
 *  spreadsheet and "Wrocław" in the catalogue are the same city. */
const cityNameKey = (name: string) =>
  name.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ')

/** What an approval has produced so far for this city — the letter, its
 *  replies, and whether a real show followed. */
function OutcomeCard(props: { outcome: GigPlanOutcome }) {
  const o = () => props.outcome
  return (
    <div class="mt-3 rounded-md border border-border p-3">
      <p class="text-sm text-foreground">
        Approved {formatTimestamp(o().approved_at)} — a letter to {o().venue}
      </p>
      <p class="mt-1 text-xs text-muted-foreground">
        {o().action_status} · {o().recipients} {o().recipients === 1 ? 'recipient' : 'recipients'} · {o().replies} {o().replies === 1 ? 'reply' : 'replies'}
        {o().show_booked ? ' · a show was booked' : ''}
      </p>
      <Show when={o().unfinished_measurements > 0}>
        <p class="mt-1 text-xs text-muted-foreground">
          {o().unfinished_measurements} reply {o().unfinished_measurements === 1 ? 'window is' : 'windows are'} still open — in flight, not failed.
        </p>
      </Show>
    </div>
  )
}

function ShowRow(props: { show: TenantShow; slug: string }) {
  return (
    <Link
      to="/tenants/$slug/shows/$eventSlug"
      params={{ slug: props.slug, eventSlug: props.show.slug }}
      class="flex items-center gap-4 rounded-lg border border-border bg-background px-4 py-3 transition-colors hover:bg-card"
    >
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium text-foreground truncate">{props.show.title}</div>
        <div class="text-xs text-muted-foreground mt-0.5">
          {formatTimestamp(props.show.starts_at)}
          {props.show.venue ? ` · ${props.show.venue}` : ''}
        </div>
      </div>
      <div class="text-right shrink-0">
        <Show
          when={!props.show.upcoming}
          fallback={<Badge variant="success">upcoming</Badge>}
        >
          <div class="text-sm font-medium text-foreground tabular-nums">{props.show.scan_count}</div>
          <div class="text-xs text-muted-foreground">scans</div>
        </Show>
      </div>
    </Link>
  )
}

export function TenantCityPage() {
  const params = useParams({ from: '/tenants/$slug/cities/$cityId' })
  const slug = () => params().slug
  const citySlug = () => params().cityId
  const approval = useGigPlanApproval(slug)

  // The same query keys the Places tab uses, so a click through from the
  // funnel table or a proposal lands on warm data.
  const funnel = useQuery(() => ({
    queryKey: ['city-funnel', slug(), 'organise'],
    queryFn: () => api.cityFunnel(slug(), 'organise'),
    reconcile: 'city_slug',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const venues = useQuery(() => ({
    queryKey: ['city-venues', slug()],
    queryFn: () => api.cityVenues(slug()),
    reconcile: 'venue_id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const plan = useQuery(() => ({
    // The stored-intent read — the same entry the Places tab's panel holds
    // under its default key.
    queryKey: ['gig-plan', slug(), ''],
    queryFn: () => api.gigPlan(slug()),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const shows = useQuery(() => ({
    queryKey: ['tenant-shows', slug()],
    queryFn: () => api.shows(slug()),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const contacts = useQuery(() => ({
    queryKey: ['gdrive-contacts', slug()],
    queryFn: () => api.gdriveContacts(slug()),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const funnelRow = () => funnel.data?.find(row => row.city_slug === citySlug())
  const rooms = () => (venues.data ?? []).filter(row => row.city_slug === citySlug())
  const proposal = () => plan.data?.proposals.find(p => p.city === citySlug())
  const passedOver = () => plan.data?.passed_over.find(p => p.city === citySlug())
  const outcome = () => plan.data?.track_record.proposals.find(p => p.city === citySlug())

  // Shows carry only a venue name — attribution runs through this city's
  // rooms on the registry's own key, so a show at a room nobody marked does
  // not appear, and one it does appear under can only be a real mark.
  const roomKeys = () => new Set(rooms().map(room => venueKey(room.display_name)))
  const cityShows = () =>
    (shows.data?.events ?? []).filter(event => event.venue != null && roomKeys().has(venueKey(event.venue)))

  const cityName = () =>
    funnelRow()?.city_name
    ?? rooms()[0]?.city_name
    ?? proposal()?.city_name
    ?? passedOver()?.city_name
    ?? outcome()?.city_name
    ?? citySlug()

  // Staged contacts name their city in free text — the sheet's word folds
  // onto the catalogue name or the slug.
  const cityContacts = () => {
    const names = new Set([cityNameKey(citySlug()), cityNameKey(cityName())])
    return (contacts.data?.contacts ?? []).filter(
      contact => contact.city != null && names.has(cityNameKey(contact.city)),
    )
  }

  // Every read settled and none of them mention the city — that is itself
  // the honest answer, not a wall of empty cards.
  const nothingKnown = () =>
    funnel.data !== undefined
    && venues.data !== undefined
    && plan.data !== undefined
    && shows.data !== undefined
    && contacts.data !== undefined
    && !funnelRow()
    && rooms().length === 0
    && !proposal()
    && !passedOver()
    && !outcome()
    && cityContacts().length === 0

  const band = () => funnelRow() ? organiseBand(funnelRow()!.organise_score_bp) : null

  return (
    <PageShell>
      <PageHeader
        eyebrow={authState.isPlatformLevel() ? 'CITY' : undefined}
        title={cityName()}
        description="The proposal, the fans, the rooms, the staged contacts and the shows — one city as its own object."
        actions={
          <Show when={band()}>
            {b => (
              <div class="flex items-center gap-2">
                <Badge variant={b().variant}>{b().label}</Badge>
                <Show when={funnelRow()?.bookable}>
                  <Badge variant="success">bookable</Badge>
                </Show>
              </div>
            )}
          </Show>
        }
      />

      {/* ── The plan — the one write on the page is the same approve the
             Places tab runs: same mutation, same idempotency key discipline,
             same recomputation upstream. */}
      <Show when={plan.error || !plan.data || proposal() || passedOver() || outcome()}>
        <Card flat class="mb-4">
          <PanelTitle icon={<SectionIcon name="map-pin" />}>The plan</PanelTitle>
          <p class="mt-1 text-sm text-muted-foreground leading-relaxed">
            What the planner says about this city — a proposal to approve, the
            reason it passed, or what an approval produced.{' '}
            <Link to="/tenants/$slug/audience" params={{ slug: slug() }} search={{ tab: 'places' }} class="underline underline-offset-2">
              The whole plan lives under Places
            </Link>.
          </p>
          <Show when={plan.error}>
            <SectionFailureCard
              error={plan.error}
              fallback="Gig plan unavailable"
              onRetry={() => void plan.refetch()}
            />
          </Show>
          <Show when={!plan.error && !plan.data}>
            <SkeletonSection titleWidth="140px" lines={4} minHeight="160px" />
          </Show>
          <Show when={proposal()}>
            {p => (
              <div class="mt-3">
                <GigPlanProposalCard
                  proposal={p()}
                  approving={approval.approvingCityId() === p().city_id}
                  busy={approval.approve.isPending}
                  result={approval.approvalResult()?.cityId === p().city_id ? approval.approvalResult()!.result : null}
                  error={approval.approveError()?.cityId === p().city_id ? approval.approveError()!.message : null}
                  canSend={plan.data?.can_send}
                  sendBlockedReason={plan.data?.send_blocked_reason}
                  onApprove={(revision) => approval.approve.mutate({ proposal: p(), revision })}
                />
              </div>
            )}
          </Show>
          <Show when={outcome()}>
            {o => <OutcomeCard outcome={o()} />}
          </Show>
          <Show when={passedOver()}>
            {entry => (
              <ul class="mt-3 space-y-2">
                <GigPlanPassedOverRow entry={entry()} />
              </ul>
            )}
          </Show>
        </Card>
      </Show>

      {/* ── The funnel — this city's own counts, honest nulls held as "—". */}
      <Show when={funnel.error || !funnel.data || funnelRow()}>
        <Card flat class="mb-4">
          <PanelTitle icon={<SectionIcon name="users" />}>Who is here</PanelTitle>
          <p class="mt-1 text-sm text-muted-foreground leading-relaxed">
            {authState.isPlatformLevel()
              ? 'Fans who said they live here, and who a show here could actually reach — reachable means consented and inside the radius they chose.'
              : 'People here who listen, and who a show here could actually reach.'}
          </p>
          <Show when={funnel.error}>
            <SectionFailureCard
              error={funnel.error}
              fallback={authState.isPlatformLevel() ? 'City funnel unavailable' : 'The numbers for this city'}
              onRetry={() => void funnel.refetch()}
            />
          </Show>
          <Show when={!funnel.error && !funnel.data}>
            <SkeletonKpiStrip count={4} />
          </Show>
          <Show when={funnelRow()}>
            {row => (
              <>
                <KpiStrip>
                  <KpiCard label="Fans" value={count(row().fans)} />
                  <KpiCard label="Reachable" value={count(row().reachable)} tone="primary" />
                  <KpiCard label="Active 30d" value={count(row().active_30d)} />
                  <KpiCard label="New 30d" value={count(row().new_30d)} />
                  <KpiCard label="Consented" value={count(row().consented)} />
                </KpiStrip>
                <p class="mt-3 text-xs text-muted-foreground">
                  {row().country_code}{row().region ? ` · ${row().region}` : ''}
                  {' — '}
                  {row().venues} venues · {row().promoters} promoters · {row().festivals} festivals on record
                  {' — '}
                  last show {lastPlayed(row())}
                  {row().next_show_at ? ` · next ${formatTimestamp(row().next_show_at!)}` : ''}
                </p>
              </>
            )}
          </Show>
        </Card>
      </Show>

      {/* ── Shows — matched through this city's rooms on the venue registry's
             own key; a night at an unmarked room cannot be attributed. */}
      <Show when={shows.error || (rooms().length > 0 && !shows.data) || cityShows().length > 0}>
        <Card flat class="mb-4">
          <PanelTitle icon={<SectionIcon name="play" />}>Shows here</PanelTitle>
          <Show when={shows.error}>
            <SectionFailureCard
              error={shows.error}
              fallback="Shows unavailable"
              onRetry={() => void shows.refetch()}
            />
          </Show>
          <Show when={!shows.error && !shows.data}>
            <SkeletonSection titleWidth="120px" lines={3} minHeight="120px" />
          </Show>
          <Show when={cityShows().length > 0}>
            <div class="mt-3 flex flex-col gap-2">
              <For each={cityShows()}>{show => <ShowRow show={show} slug={slug()} />}</For>
            </div>
            <p class="mt-2 text-xs text-muted-foreground">
              Matched by the room's name — a night at a room no show has marked does not appear.
            </p>
          </Show>
        </Card>
      </Show>

      {/* ── Rooms — the shared registry's rows for this city. */}
      <Show when={venues.error || !venues.data || rooms().length > 0}>
        <Card flat class="mb-4">
          <PanelTitle icon={<SectionIcon name="map-pin" />}>Rooms</PanelTitle>
          <Show when={venues.error}>
            <SectionFailureCard
              error={venues.error}
              fallback={authState.isPlatformLevel() ? 'Venue registry unavailable' : 'The rooms'}
              onRetry={() => void venues.refetch()}
            />
          </Show>
          <Show when={!venues.error && !venues.data}>
            <SkeletonSection titleWidth="140px" lines={4} minHeight="160px" />
          </Show>
          <Show when={rooms().length > 0}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room</TableHead>
                  <TableHead class="text-right">Shows played</TableHead>
                  <TableHead class="text-right">Typical draw</TableHead>
                  <TableHead class="text-right">Regulars</TableHead>
                  <TableHead>Last show</TableHead>
                  <TableHead>Next show</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={rooms()}>
                  {row => (
                    <TableRow>
                      <TableCell class="text-foreground">
                        {row.display_name}
                        {/* The venue answer is a sentence, not a score — the
                            because-list when the evidence carries one, the
                            honest refusal when it does not. A stale server
                            sends neither field and the room just shows its
                            name. */}
                        <Show when={row.assessment === 'worth_contact'}>
                          <p class="m-0 mt-1 max-w-xs text-xs leading-relaxed font-normal text-muted-foreground">
                            {row.assessment_sentence}
                          </p>
                        </Show>
                        <Show when={row.assessment === 'insufficient_evidence'}>
                          <p class="m-0 mt-1 max-w-xs text-xs italic leading-relaxed font-normal text-muted-foreground/80">
                            {row.assessment_sentence}
                          </p>
                        </Show>
                      </TableCell>
                      <TableCell class="text-right tabular-nums">
                        {count(row.shows_played)}
                        <Show when={row.shows_booked > 0}>
                          <span class="ml-1 text-xs text-muted-foreground">
                            +{row.shows_booked} booked
                          </span>
                        </Show>
                      </TableCell>
                      {/* Null draw is an unticketed night, not a night nobody
                          came to. */}
                      <TableCell class="text-right tabular-nums">{draw(row.typical_draw)}</TableCell>
                      <TableCell class="text-right tabular-nums">{count(row.repeat_attenders)}</TableCell>
                      <TableCell class="text-xs text-muted-foreground">{formatTimestamp(row.last_played_at)}</TableCell>
                      <TableCell class="text-xs text-muted-foreground">{formatTimestamp(row.next_show_at)}</TableCell>
                    </TableRow>
                  )}
                </For>
              </TableBody>
            </Table>
          </Show>
        </Card>
      </Show>

      {/* ── Contacts — staged addresses the sheet filed under this city.
             Read-only: promote and dismiss stay on the Contacts tab where
             the review queue lives. */}
      <Show when={contacts.error || !contacts.data || cityContacts().length > 0}>
        <Card flat>
          <PanelTitle icon={<SectionIcon name="users" />}>Contacts here</PanelTitle>
          <Show when={contacts.error}>
            <SectionFailureCard
              error={contacts.error}
              fallback="Contacts unavailable"
              onRetry={() => void contacts.refetch()}
            />
          </Show>
          <Show when={!contacts.error && !contacts.data}>
            <SkeletonSection titleWidth="120px" lines={3} minHeight="120px" />
          </Show>
          <Show when={cityContacts().length > 0}>
            <ul class="mt-3 space-y-2">
              <For each={cityContacts()}>
                {contact => (
                  <li class="rounded-md border border-border/60 p-3">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-sm font-medium text-foreground">{contact.email}</span>
                      <Show when={contact.suggested_kind}>
                        <Badge variant="muted">{contact.suggested_kind!.replaceAll('_', ' ')}</Badge>
                      </Show>
                      <Show when={contact.fan_outcome !== 'staged'}>
                        <Badge variant={contact.fan_outcome === 'promoted' ? 'success' : 'muted'}>
                          fan {contact.fan_outcome}
                        </Badge>
                      </Show>
                      <Show when={contact.beacon_outcome !== 'staged'}>
                        <Badge variant={contact.beacon_outcome === 'promoted' ? 'success' : 'muted'}>
                          outreach {contact.beacon_outcome}
                        </Badge>
                      </Show>
                    </div>
                    <p class="m-0 mt-1 text-xs text-muted-foreground">
                      {[contact.display_name, contact.organization].filter(Boolean).join(' · ') || 'No name on file'}
                      {' — '}{contact.source_file_name}
                    </p>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Card>
      </Show>

      {/* Nothing on record anywhere — the city is a name, which is itself
          the answer. */}
      <Show when={nothingKnown()}>
        <EmptyState
          label="Nothing on record for this city"
          hint="A city fills in once a fan there says where they are, a show names one of its rooms, or a staged contact names it."
        />
      </Show>
    </PageShell>
  )
}
