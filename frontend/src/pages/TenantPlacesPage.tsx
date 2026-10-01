import { ComparableActsPanel } from '../components/ComparableActsPanel'
import { For, Show, createEffect, createMemo, createSignal, lazy, onCleanup, onMount } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { PanelTitle } from '../components/layout'
import { PageShell } from '../components/layout'
import { DashHeader, SubPagePanel, useSubPage } from '../components/ui/dash'
import { PlacesFirstScreen } from '../components/PlacesFirstScreen'
import { SectionIcon } from '../components/SectionIcon'
import { EmptyState } from '../components/ui/empty-state'
import { SkeletonSection } from '../components/Skeleton'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { Card } from '../components/app/card'
import { Badge } from '../components/app/badge'
import { Button } from '../components/app/button'
import { Alert } from '../components/app/alert'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/app/table'
import { GigPlanPanel } from '../components/GigPlanPanel'
import { MapPin } from 'lucide-solid'
import { humanizeToken, httpUrl } from '../lib/format'
import { humanize } from '../lib/opportunity-labels'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'
import { count, draw, lastPlayed, organiseBand } from '../lib/organise'
// The AREA workspace stays its own chunk — the Cities tab never pays for
// the drop editor; TabPanel's Suspense boundary covers the load.
const AreaWorkspace = lazy(() =>
  import('../components/area/AreaWorkspace').then(m => ({ default: m.AreaWorkspace })),
)

import type { AudiencePlace, CityFunnelRow, CityVenueRow, TenantPlacesCitiesModel, TenantPlacesOnlineModel, TenantPlacesRoomsModel } from '../lib/types'

// Places — the "where do the next nights go" destination, tabbed so each
// question pays only for its own read model: Cities carries the funnel and
// the plan, Rooms the venue registry, Online the gathering places, and AREA
// the drop workspace. The page composes them city-first: the funnel table
// is the spine, the plan marks which rows it wants, and each city opens as
// its own page for the detail that would not fit here. The plan itself keeps
// its working surface (GigPlanPanel) — the read model only names its picks.
//
// The section labels are shared with the degraded alerts: a section the
// tenant could not answer is named, never silently absent.
const SECTION_LABEL: Record<string, string> = {
  city_funnel: 'Cities',
  city_venues: 'Rooms',
  audience_places: 'Gathering places',
  gig_plan: 'The plan',
  rooms_summary: 'Room counts',
  online_summary: 'Online place counts',
}

const BAND_SECTION_LABEL: Record<string, string> = {
  city_funnel: 'The cities',
  city_venues: 'The rooms',
  audience_places: 'Where fans gather',
  gig_plan: 'The plan',
  rooms_summary: 'Room counts',
  online_summary: 'Online place counts',
}

/** The first screen's row budget — every list shows its top slice and a
 *  "Show N more" button unwinds the rest, so a registry of hundreds never
 *  taxes the first paint or the read-model payload's layout work. */
const TOP_ROWS = 10

function useTopRows<T>(rows: () => readonly T[]) {
  const [expanded, setExpanded] = createSignal(false)
  const visible = createMemo(() => (expanded() ? rows() : rows().slice(0, TOP_ROWS)))
  const hidden = createMemo(() => Math.max(0, rows().length - TOP_ROWS))
  return {
    visible,
    hidden,
    expanded,
    toggle: () => setExpanded(e => !e),
  }
}

/** The "Show N more / Show fewer" toggle a sliced list puts after its table
 *  or chips — invisible until the list actually overflows. */
function ShowMoreRow(props: { hidden: number; expanded: boolean; onToggle: () => void }) {
  return (
    <Show when={props.hidden > 0 || props.expanded}>
      <div class="mt-3 flex justify-center">
        <Button variant="ghost" size="sm" onClick={props.onToggle}>
          {props.expanded ? 'Show fewer' : `Show ${props.hidden} more`}
        </Button>
      </div>
    </Show>
  )
}

/** The degraded-section alerts, shared by the three read-model tabs — a
 *  section the tenant could not answer is named, never silently absent. */
function DegradedNotices(props: { degraded: readonly string[] }) {
  return (
    <For each={props.degraded}>{section => (
      <Alert tone="warning" role="status">
        <Show when={authState.isPlatformLevel()} fallback={
          <>
            <strong>{BAND_SECTION_LABEL[section] ?? humanize(section)}</strong> couldn't be checked right
            now. The rest of the page keeps working — this comes back on its own.
          </>
        }>
          <strong>{SECTION_LABEL[section] ?? humanize(section)}</strong> isn't available on the connected
          CrowdRelay build right now. The rest of the page keeps working; ship a newer CrowdRelay
          release and this lights up on the next refresh.
        </Show>
      </Alert>
    )}</For>
  )
}

export type PlacesSection = 'overview' | 'cities' | 'rooms' | 'online' | 'area'

const SECTION_TITLE: Record<PlacesSection, string> = {
  overview: 'Places',
  cities: 'Cities',
  rooms: 'Rooms',
  online: 'Online',
  area: 'AREA',
}

export const PlacesOverviewPage = () => <TenantPlacesPage section="overview" />
export const PlacesCitiesPage = () => <TenantPlacesPage section="cities" />
export const PlacesRoomsPage = () => <TenantPlacesPage section="rooms" />
export const PlacesOnlinePage = () => <TenantPlacesPage section="online" />
export const PlacesAreaPage = () => <TenantPlacesPage section="area" />

export function TenantPlacesPage(props: { section: PlacesSection }) {
  const params = useParams({ strict: false }) as () => { slug: string }


  // AREA routes sit behind require_platform_level upstream, so a band
  // session's probe is a guaranteed 403 — `entitled`/`enabled` can never
  // be observed by the sessions the || branch was written for. The area is
  // platform-only, and its read waits until the area is opened: the first
  // screen is one call (`places/cities`), not two.
  const areaVisible = () => authState.isPlatformLevel()
  const areas = useSubPage(() => props.section, '/tenants/$slug/places')
  // AREA is not a sub-page for band sessions — a pasted /places/area goes
  // back to the overview rather than mounting an area it can never read.
  // Waits for the profile: before it hydrates every session reads as band.
  createEffect(() => {
    if (props.section === 'area' && authState.profile() && !areaVisible()) areas.open('overview')
  })
  const switchTab = (id: string) => areas.open(id)
  const isVisited = (id: string) => areas.active() === id

  // Each tab owns its thin read model, enabled once visited — the Cities
  // tab never pays for the venue registry, the Online tab never pays for
  // the funnel. A section the tenant could not answer lands as 200 with
  // the section named in `degraded`, so keep asking until it fills.
  const cities = useQuery(() => ({
    queryKey: ['tenant-places', params().slug, 'cities'],
    queryFn: () => api.placesCities(params().slug),
    // The first screen reads this model whichever tab is open.
    reconcile: 'id' as const,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))
  const rooms = useQuery(() => ({
    queryKey: ['tenant-places', params().slug, 'rooms'],
    queryFn: () => api.placesRooms(params().slug),
    enabled: isVisited('rooms'),
    reconcile: 'id' as const,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))
  const online = useQuery(() => ({
    queryKey: ['tenant-places', params().slug, 'online'],
    queryFn: () => api.placesOnline(params().slug),
    enabled: isVisited('online'),
    reconcile: 'id' as const,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))



  // The cities the plan proposes, for marking the funnel rows it already
  // wants. Keyed by slug — the proposal's `city` field is the catalogue slug
  // the funnel row carries as `city_slug`.
  const planCities = createMemo(() => {
    const plan = cities.data?.gig_plan
    if (!plan) return null
    return new Set(plan.proposals.map(p => p.city))
  })

  return <PageShell>
    <DashHeader
      title={SECTION_TITLE[props.section]}
      subtitle="Where your fans are, and where to play next"
    />


    <SubPagePanel when={areas.active() === 'overview'}>
      <Show when={cities.data}>{data => <PlacesFirstScreen slug={params().slug} model={data()} onOpenTab={switchTab} />}</Show>
    </SubPagePanel>

    <SubPagePanel when={areas.active() === 'cities'}>
      <Show when={cities.error}>
        <SectionFailureCard error={cities.error} title="Couldn't load cities" onRetry={() => void cities.refetch()} />
      </Show>
      <Show when={!cities.error && !cities.data}>
        <SkeletonSection titleWidth="160px" lines={4} minHeight="140px" />
        <SkeletonSection titleWidth="200px" lines={6} minHeight="200px" />
      </Show>
      <Show when={cities.data} keyed>{(data: TenantPlacesCitiesModel) => <>
        <DegradedNotices degraded={data.degraded} />
        <p class="mb-4 text-sm text-muted-foreground">
          {data.city_funnel == null ? '—' : count(data.city_funnel.length)} cities with fans
          {' · '}{data.city_funnel == null ? '—' : count(data.city_funnel.filter(r => r.bookable).length)} bookable now
          {' · '}{data.gig_plan == null ? '—' : count(data.gig_plan.proposals.length)} plan proposals
        </p>
        <PlanPicks model={data} />
        <CitiesCard
          slug={params().slug}
          rows={data.city_funnel}
          degraded={data.degraded.includes('city_funnel')}
          planCities={planCities()}
        />
        {/* The plan's working surface: proposals to approve, the intent
            override, the passed-over list and the track record. It mounts when
            it scrolls near — its intent and plan queries stay out of the
            tab's read-model paint, and the model's gig_plan seeds the plan
            query so the default view has nothing left to fetch. */}
        <div id="plan" class="scroll-mt-4">
          <LazyGigPlan slug={params().slug} initialPlan={data.gig_plan} />
        </div>
      </>}</Show>
    </SubPagePanel>

    <SubPagePanel when={areas.active() === 'rooms'}>
      <Show when={rooms.error}>
        <SectionFailureCard error={rooms.error} title="Couldn't load rooms" onRetry={() => void rooms.refetch()} />
      </Show>
      <Show when={!rooms.error && !rooms.data}>
        <SkeletonSection titleWidth="160px" lines={5} minHeight="200px" />
      </Show>
      <Show when={rooms.data} keyed>{(data: TenantPlacesRoomsModel) => <>
        <DegradedNotices degraded={data.degraded} />
        <p class="mb-4 text-sm text-muted-foreground">
          {data.city_venues == null ? '—' : count(data.city_venues.length)} rooms on record
        </p>
        <RoomsCard
          slug={params().slug}
          rows={data.city_venues}
          degraded={data.degraded.includes('city_venues')}
        />
      </>}</Show>
      {/* The acts whose past nights make a room provable — operator curation. */}
      <ComparableActsPanel slug={params().slug} />
    </SubPagePanel>

    <SubPagePanel when={areas.active() === 'online'}>
      <Show when={online.error}>
        <SectionFailureCard error={online.error} title="Couldn't load gathering places" onRetry={() => void online.refetch()} />
      </Show>
      <Show when={!online.error && !online.data}>
        <SkeletonSection titleWidth="140px" lines={4} minHeight="160px" />
      </Show>
      <Show when={online.data} keyed>{(data: TenantPlacesOnlineModel) => <>
        <DegradedNotices degraded={data.degraded} />
        <p class="mb-4 text-sm text-muted-foreground">
          {data.audience_places == null ? '—' : count(data.audience_places.places.length)} places fans gather
        </p>
        <GatheringsCard
          places={data.audience_places?.places ?? null}
          degraded={data.degraded.includes('audience_places')}
        />
      </>}</Show>
    </SubPagePanel>

    {/* The AREA workspace mounts only once the tab is visited and only for
        a session allowed to see it — for a band on a tenant without AREA the
        tab is neither listed nor mounted. */}
    <SubPagePanel when={areaVisible() && areas.active() === 'area'}>
      <AreaWorkspace slug={params().slug} />
    </SubPagePanel>
  </PageShell>
}

/** Mounts GigPlanPanel when it approaches the viewport. Until then the page
 *  pays only the read model — the panel's own queries (intents, plan) wait
 *  for the operator to actually scroll to the working surface. */
function LazyGigPlan(props: { slug: string; initialPlan: TenantPlacesCitiesModel['gig_plan'] }) {
  const [near, setNear] = createSignal(false)
  let sentinel: HTMLDivElement | undefined
  onMount(() => {
    if (near()) return
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: '600px' },
    )
    if (sentinel) io.observe(sentinel)
    onCleanup(() => io.disconnect())
  })
  return (
    <div ref={sentinel}>
      <Show when={near()} fallback={<SkeletonSection titleWidth="180px" lines={5} minHeight="220px" />}>
        <GigPlanPanel slug={props.slug} initialPlan={props.initialPlan} />
      </Show>
    </div>
  )
}

/** The plan's picks as a strip above the funnel — the answer to "where does
 *  the plan want to play" before the evidence tables. Each pick anchors into
 *  the working plan card below, where the approval lives. */
function PlanPicks(props: { model: TenantPlacesCitiesModel }) {
  const proposals = () => props.model.gig_plan?.proposals ?? []
  const degraded = () => props.model.degraded.includes('gig_plan')
  return (
    <Show when={!degraded() && proposals().length > 0}>
      <Card flat class="mb-4">
        <PanelTitle icon={<SectionIcon name="target" />}>The plan's picks</PanelTitle>
        <p class="mt-1 text-sm text-muted-foreground leading-relaxed">
          {authState.isPlatformLevel()
            ? 'The cities the planner proposes, with the reach each names. Approval happens in the plan card below.'
            : 'The cities the plan picked, with the reach each names. Approving happens in the plan card below.'}
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <For each={proposals()}>
            {p => (
              <a
                href="#plan"
                class="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:border-primary"
              >
                <span class="text-foreground">{p.city_name}</span>
                <span class="text-xs text-muted-foreground">
                  {p.venue} · {p.reach.reachable.toLocaleString()} reachable
                </span>
              </a>
            )}
          </For>
        </div>
      </Card>
    </Show>
  )
}

/** The funnel — which city next. Rows are the organise-ranked fetch; "By
 *  activity" re-sorts the same rows into the order the upstream uses without
 *  the rank (active_30d, fans, slug — the funnel's own default ordering). */
function CitiesCard(props: {
  slug: string
  rows: CityFunnelRow[] | null
  degraded: boolean
  planCities: Set<string> | null
}) {
  const [order, setOrder] = createSignal<'organise' | 'activity'>('organise')
  const ordered = createMemo(() => {
    const list = props.rows ?? []
    if (order() === 'organise') return list
    return [...list].sort(
      (a, b) => b.active_30d - a.active_30d || b.fans - a.fans || a.city_slug.localeCompare(b.city_slug),
    )
  })
  const top = useTopRows(ordered)

  return (
    <Card class="mb-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <PanelTitle icon={<SectionIcon name="map-pin" />}>Cities</PanelTitle>
          <p class="mt-1 text-sm text-muted-foreground leading-relaxed">
            Where the fans already are, and whether anything is booked there.
            Reachable means consented and inside the radius they chose — the
            people we could actually tell about a show.
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-pressed={order() === 'organise'}
            class={`h-7 px-2 text-xs ${order() === 'organise' ? 'border-primary text-foreground' : 'text-muted-foreground'}`}
            onClick={() => setOrder('organise')}
          >
            Ranked
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-pressed={order() === 'activity'}
            class={`h-7 px-2 text-xs ${order() === 'activity' ? 'border-primary text-foreground' : 'text-muted-foreground'}`}
            onClick={() => setOrder('activity')}
          >
            By activity
          </Button>
        </div>
      </div>
      <Show when={props.degraded}>
        <p class="text-sm text-muted-foreground">
          Couldn't check the cities right now — they fill in on their own.
        </p>
      </Show>
      <Show when={!props.degraded && props.rows}>
        {list => (
          <Show
            when={list().length > 0}
            fallback={
              <EmptyState icon={<MapPin />}
                label="No cities yet"
                hint="A city appears once a fan there says where they are. Nothing here means nobody has told us where they live, not that nobody is out there."
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>City</TableHead>
                  <TableHead class="text-right">Fans</TableHead>
                  <TableHead class="text-right">Reachable</TableHead>
                  <TableHead class="text-right">Active 30d</TableHead>
                  <TableHead>Last show</TableHead>
                  <TableHead>What's there</TableHead>
                  <TableHead>Verdict</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={top.visible()}>
                  {(row: CityFunnelRow) => {
                    const band = organiseBand(row.organise_score_bp)
                    return (
                      <TableRow>
                        <TableCell>
                          <Link
                            to="/tenants/$slug/cities/$cityId"
                            params={{ slug: props.slug, cityId: row.city_slug }}
                            class="text-foreground underline decoration-border underline-offset-4 hover:text-primary"
                          >
                            {row.city_name}
                          </Link>
                          <span class="ml-1 text-xs text-muted-foreground">{row.country_code}</span>
                          <Show when={props.planCities?.has(row.city_slug)}>
                            <a href="#plan" class="ml-2">
                              <Badge variant="success">the plan wants this</Badge>
                            </a>
                          </Show>
                        </TableCell>
                        <TableCell class="text-right tabular-nums">{count(row.fans)}</TableCell>
                        <TableCell class="text-right tabular-nums">{count(row.reachable)}</TableCell>
                        <TableCell class="text-right tabular-nums">{count(row.active_30d)}</TableCell>
                        <TableCell class="text-xs text-muted-foreground">{lastPlayed(row)}</TableCell>
                        <TableCell class="text-xs text-muted-foreground">
                          {/* Confirmed, contactable supply — not candidates
                              awaiting screening. "What's there" has to mean
                              what we could write to this week. */}
                          {row.venues} venues · {row.promoters} promoters · {row.festivals} festivals
                        </TableCell>
                        <TableCell>
                          <Badge variant={band.variant}>{band.label}</Badge>
                        </TableCell>
                      </TableRow>
                    )
                  }}
                </For>
              </TableBody>
            </Table>
            <ShowMoreRow hidden={top.hidden()} expanded={top.expanded()} onToggle={top.toggle} />
          </Show>
        )}
      </Show>
    </Card>
  )
}

/** The shared venue registry — every room a completed show has marked,
 *  aggregated across acts. `contributors` is a count and never names one. */
function RoomsCard(props: { slug: string; rows: CityVenueRow[] | null; degraded: boolean }) {
  const top = useTopRows(() => props.rows ?? [])
  return (
    <Card class="mb-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <PanelTitle icon={<SectionIcon name="map-pin" />}>Rooms</PanelTitle>
          <p class="mt-1 text-sm text-muted-foreground leading-relaxed">
            {authState.isPlatformLevel()
              ? "Every room any tenant's played or completed show has marked, with what it draws. Aggregated across tenants — the count of contributors never names one."
              : "Every room any act's played or completed show has marked, with what it draws. Aggregated across acts — the count of contributors never names one."}
          </p>
        </div>
        <VerifyRegistryButton slug={props.slug} />
      </div>
      <Show when={props.degraded}>
        <p class="text-sm text-muted-foreground">
          Couldn't check the rooms right now — they fill in on their own.
        </p>
      </Show>
      <Show when={!props.degraded && props.rows}>
        {rows => (
          <Show
            when={rows().length > 0}
            fallback={
              <EmptyState icon={<MapPin />}
                label="No rooms on record"
                hint="A room appears here when a published or completed show names it. Logging past shows fills this in — the registry builds itself from the calendar."
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead class="text-right">Shows played</TableHead>
                  <TableHead class="text-right">Typical draw</TableHead>
                  <TableHead class="text-right">Regulars</TableHead>
                  <TableHead class="text-right">Bands</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={top.visible()}>
                  {(row: CityVenueRow) => (
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
                          <p class="m-0 mt-1 max-w-xs text-xs italic leading-relaxed font-normal text-muted-foreground">
                            {row.assessment_sentence}
                          </p>
                        </Show>
                        <Show when={row.assessment === 'closed'}>
                          <p class="m-0 mt-1 max-w-xs text-xs leading-relaxed font-normal text-warning-foreground">
                            {row.assessment_sentence}
                          </p>
                        </Show>
                        {/* not_assessed — the tenant's own facts could not be
                            read, so the sentence says so rather than claiming
                            a verdict the read could not support. */}
                        <Show when={row.assessment === 'not_assessed'}>
                          <p class="m-0 mt-1 max-w-xs text-xs italic leading-relaxed font-normal text-muted-foreground">
                            {row.assessment_sentence}
                          </p>
                        </Show>
                      </TableCell>
                      <TableCell class="text-xs text-muted-foreground">
                        <Link
                          to="/tenants/$slug/cities/$cityId"
                          params={{ slug: props.slug, cityId: row.city_slug }}
                          class="underline decoration-border underline-offset-4 hover:text-primary"
                        >
                          {row.city_name}
                        </Link>
                        {' '}{row.country_code}
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
                      <TableCell class="text-right tabular-nums">
                        {count(row.repeat_attenders)}
                      </TableCell>
                      <TableCell class="text-right tabular-nums">{count(row.contributors)}</TableCell>
                    </TableRow>
                  )}
                </For>
              </TableBody>
            </Table>
            <ShowMoreRow hidden={top.hidden()} expanded={top.expanded()} onToggle={top.toggle} />
          </Show>
        )}
      </Show>
    </Card>
  )
}

/** The online gathering places — communities the audience graph knows. A
 *  place is where fans already gather, not a person: press and amplifier
 *  contacts live under Audience → Contacts. */
function GatheringsCard(props: { places: AudiencePlace[] | null; degraded: boolean }) {
  const top = useTopRows(() => props.places ?? [])
  return (
    <Card class="mb-4">
      <PanelTitle icon={<SectionIcon name="target" />}>Where fans gather online</PanelTitle>
      <p class="mt-1 text-sm text-muted-foreground leading-relaxed">
        The communities and channels the audience graph knows about — where a
        release or a show can be carried into a room the act does not own.
      </p>
      <Show when={props.degraded}>
        <p class="text-sm text-muted-foreground">
          Couldn't check the gathering places right now — they fill in on their own.
        </p>
      </Show>
      <Show when={!props.degraded && props.places}>
        {places => (
          <Show
            when={places().length > 0}
            fallback={
              <EmptyState icon={<MapPin />}
                label="No gathering places yet"
                hint="Communities get registered under Audience → Communities, or by importing a list. Nothing here means none are on record, not that none exist."
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Place</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead class="text-right">Members</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={top.visible()}>
                  {(p: AudiencePlace) => (
                    <TableRow>
                      <TableCell class="text-foreground">
                        <Show when={httpUrl(p.url)} fallback={p.name}>
                          {url => <a href={url()} target="_blank" rel="noreferrer" class="underline decoration-border underline-offset-4 hover:text-primary">{p.name}</a>}
                        </Show>
                        <Show when={p.countryCode}>
                          <span class="ml-1 text-xs text-muted-foreground">{p.countryCode}</span>
                        </Show>
                      </TableCell>
                      <TableCell class="text-xs text-muted-foreground">{p.platform}</TableCell>
                      <TableCell class="text-xs text-muted-foreground">{p.placeKind}</TableCell>
                      <TableCell class="text-right tabular-nums">{count(p.memberCount)}</TableCell>
                      <TableCell class="text-xs text-muted-foreground">{humanizeToken(p.status)}</TableCell>
                    </TableRow>
                  )}
                </For>
              </TableBody>
            </Table>
            <ShowMoreRow hidden={top.hidden()} expanded={top.expanded()} onToggle={top.toggle} />
          </Show>
        )}
      </Show>
    </Card>
  )
}

/** "Verify the registry" — the delegation loop run the other way.
 *
 *  The registry's entries are claims the world made; this button hands all
 *  three lists — rooms, bands, booking agents — to the operator's AI as a
 *  paste-ready prompt: is each entry still alive, and which active ones are
 *  missing. The answer sheets land back through the Drive intake upstream —
 *  a closed room stops being proposed, a dead band retires, an inactive
 *  agent deactivates. Fetched lazily: the brief only exists to
 *  be copied, so it is not part of the page's standing payload. */
function VerifyRegistryButton(props: { slug: string }) {
  const [copied, setCopied] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  // Null brief is an answer, not an error: no rooms on record means there is
  // nothing to verify.
  const [empty, setEmpty] = createSignal(false)

  const copy = () => {
    const clipboard = navigator.clipboard
    if (!clipboard) {
      setFailed(true)
      return
    }
    void api
      .registryVerificationBrief(props.slug)
      .then(({ brief }) => {
        setFailed(false)
        // Null brief is an answer, not an error: nothing on record means
        // there is nothing to verify.
        if (!brief) {
          setEmpty(true)
          return
        }
        setEmpty(false)
        return clipboard.writeText(brief).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
      })
      .catch(() => setFailed(true))
  }

  return (
    <div class="shrink-0">
      <Button variant="outline" size="sm" class="h-7 px-2 text-xs" onClick={copy}>
        {copied() ? 'Copied' : 'Copy verification brief'}
      </Button>
      <Show when={failed()}>
        <p class="mt-1 max-w-xs text-xs text-destructive">
          {authState.isPlatformLevel()
            ? 'Could not fetch or copy the brief — check clipboard permissions.'
            : 'Could not fetch or copy the brief — try again in a moment.'}
        </p>
      </Show>
      <Show when={empty() && !failed()}>
        <p class="mt-1 max-w-xs text-xs text-muted-foreground">
          Nothing on record to verify yet.
        </p>
      </Show>
    </div>
  )
}
