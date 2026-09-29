import { For, Show, createMemo } from 'solid-js'
import { Link, useParams } from '@tanstack/solid-router'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { CityViewModel, CityViewShow, GigPlanOutcome } from '../lib/types'
import { PageShell, KpiStrip, KpiCard } from '../components/layout'
import { Act, Bar, Card, DashHeader, ItemRow, MoreRow, Pill, Ring, Split, StatRow, Steps, Tile, Tiles, WorkAreaPanel, WorkAreas, useWorkAreas } from '../components/ui/dash'
import { Building, CalendarDays, ChartBar, MapPin, Target, Users } from 'lucide-solid'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { SkeletonSection, SkeletonKpiStrip } from '../components/Skeleton'
import { EmptyState } from '../components/ui/empty-state'
import { Badge } from '../components/app/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/app/table'
import { GigPlanPassedOverRow, GigPlanProposalCard, useGigPlanApproval } from '../components/GigPlanProposalCard'
import type { Tone as ViewTone } from '../components/ui/dash'
import { formatTimestamp } from '../lib/format'
import { count, draw, lastPlayed } from '../lib/organise'

// N.12 — the city as its own object, opened on the question "is this city
// worth a show, and what would make it one?" (approved mockup
// `console-mockups/city.html`).
//
// The first screen is one read, `views/cities/{slug}`: the funnel row, the
// rooms, the planner's verdict for this city, the shows played here and what
// the last one left behind. The page used to make five reads — the whole
// funnel, every room in the registry, the whole gig plan, every show, every
// staged contact — and filter them here. The plan (with its approve button)
// and the staged contacts are tabs now, and fetch when opened.
//
// Every number keeps the null rule: a night with no ticket sale has no paid
// count, a night with no door campaign has no room count — "not measured",
// never 0.

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

function ShowRow(props: { show: CityViewShow; slug: string }) {
  const upcoming = () => new Date(props.show.starts_at).getTime() > Date.now()
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
      <Show when={upcoming()}>
        <Badge variant="success">upcoming</Badge>
      </Show>
    </Link>
  )
}

/** Days-since as the tile's figure: "15 days", "today". */
const daysSince = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return days <= 0 ? 'today' : days === 1 ? '1 day' : `${days} days`
}

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso))

const TABS = ['rooms', 'fans', 'shows', 'contacts', 'plan'] as const

export function TenantCityPage() {
  const params = useParams({ from: '/tenants/$slug/cities/$cityId' })
  const slug = () => params().slug
  const citySlug = () => params().cityId
  const tabs = useWorkAreas(['overview', ...TABS], 'tab', 'overview')

  const view = useQuery(() => ({
    queryKey: ['city-view', slug(), citySlug()],
    queryFn: () => api.cityView(slug(), citySlug()),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const model = (): CityViewModel | undefined => view.data
  const funnelRow = () => model()?.funnel ?? null
  const rooms = () => model()?.rooms ?? []
  const verdict = () => model()?.verdict ?? null
  const lastShow = () => model()?.last_show ?? null
  const cityName = () => funnelRow()?.city_name ?? rooms()[0]?.city_name ?? citySlug()

  const played = () => rooms().filter(room => room.shows_played > 0).length
  const byAssessment = (kind: string) => rooms().filter(room => room.assessment === kind).length

  const status = createMemo((): { tone: ViewTone; text: string } => {
    const v = verdict()
    if (!v) return { tone: 'muted', text: 'The planner has not looked at this city — no fan here has named it yet' }
    if (v.proposed) return { tone: 'good', text: 'The plan proposes a show here' }
    if (v.floor != null && v.reachable != null) {
      return { tone: 'warn', text: `Not a plan yet · ${v.reachable} asked, a show needs about ${v.floor}` }
    }
    return { tone: 'warn', text: 'Not a plan yet' }
  })

  // Ranked by what the band can act on today: rooms it already played (it
  // knows the people), then rooms the evidence says are worth a letter, with
  // what we know about each. Rooms with nothing on record stay on the tab.
  const workRooms = () =>
    rooms()
      .filter(room => room.assessment === 'worth_contact' || room.shows_played > 0)
      .slice()
      .sort((a, b) => b.shows_played - a.shows_played
        || Number(Boolean(b.genres_fact)) - Number(Boolean(a.genres_fact))
        || a.display_name.localeCompare(b.display_name))
  const roomWhy = (room: CityViewModel['rooms'][number]) => {
    if (room.shows_played > 0) {
      return `Played ${room.shows_played === 1 ? 'once' : `${room.shows_played} times`}`
        + (room.last_played_at ? ` · last ${shortDate(room.last_played_at)}` : '')
        + ' · you know the room'
    }
    return [room.genres_fact, room.address_fact, room.website_fact].filter(Boolean).join(' · ')
      || room.assessment_sentence
  }

  return (
    <PageShell>
      <DashHeader
        title={cityName()}
        subtitle={funnelRow()?.region ?? undefined}
        pill={model() ? status() : null}
        back={{ label: 'Places', to: '/tenants/$slug/places', params: { slug: slug() } }}
      />

      <Show when={view.error}>
        <SectionFailureCard
          error={view.error}
          title="Couldn't load this city"
          onRetry={() => void view.refetch()}
        />
      </Show>
      <WorkAreas
        active={tabs.active()}
        onToggle={tabs.toggle}
        areas={[
          { id: 'overview', label: 'Overview' },
          { id: 'rooms', label: 'Rooms here', count: model() ? rooms().length : null },
          { id: 'fans', label: 'Fans here', count: funnelRow()?.fans ?? null },
          { id: 'shows', label: 'Shows here', count: model()?.shows.length ?? null },
          { id: 'contacts', label: 'Contacts here' },
          { id: 'plan', label: 'The plan' },
        ]}
      />

      <WorkAreaPanel id="overview" active={tabs.active()}>
        <Show when={!view.error && !model()}>
          <SkeletonKpiStrip count={4} />
          <SkeletonSection titleWidth="160px" lines={4} minHeight="200px" />
        </Show>

        <Show when={model()}>
        <Tiles>
          <Tile
            label="Fans here"
            value={funnelRow()?.fans}
            sub={funnelRow() ? <><span class="text-success-foreground">+{funnelRow()!.new_30d}</span> in 30 days · {funnelRow()!.active_30d} active</> : 'no fan has named the city'}
          />
          <Tile label="Within reach" value={verdict()?.reachable ?? funnelRow()?.reachable} sub="fans in or near the city" />
          <Tile label="Rooms known" value={rooms().length} sub={`${played()} you played · ${rooms().length - played()} researched`} />
          <Tile
            label="Last night here"
            value={lastShow() ? daysSince(lastShow()!.starts_at) : null}
            sub={lastShow() ? `${lastShow()!.venue ?? lastShow()!.title} · ${shortDate(lastShow()!.starts_at)}` : 'never played here'}
          />
        </Tiles>

        <Split>
          <Card title="What would make it a plan" icon={<Target />} aside="rooms you played first">
            <For each={workRooms().slice(0, 4)}>{room => (
              <ItemRow
                pill={{ tone: room.shows_played > 0 ? 'good' : 'muted', text: 'room' }}
                title={room.display_name}
                sub={roomWhy(room)}
                action={<Act onClick={() => tabs.open('rooms')}>Open</Act>}
              />
            )}</For>
            <Show when={workRooms().length === 0}>
              <p class="m-0 py-2 text-sm text-muted-foreground">No room here is on record as worth a letter yet.</p>
            </Show>
            <Show when={rooms().length > 4}>
              <MoreRow text={`${rooms().length - Math.min(4, workRooms().length)} more rooms`} link={<Act onClick={() => tabs.open('rooms')}>All rooms</Act>} />
            </Show>
          </Card>

          <Card title="What the planner says" icon={<MapPin />}>
            <Show when={verdict()} fallback={
              <p class="m-0 text-sm text-muted-foreground">Not considered — the planner looks at cities where fans said they live.</p>
            }>
              {v => (
                <>
                  <div class="my-3 flex items-center gap-3">
                    <Show when={v().floor != null && v().reachable != null}>
                      <Ring share={v().reachable! / v().floor!} label={`${v().reachable}/${v().floor}`} tone="warn" />
                    </Show>
                    <div class="min-w-0">
                      <p class="m-0 text-sm text-foreground">{v().proposed ? 'Proposed — approve it in the plan' : 'Passed, not refused'}</p>
                      <Show when={v().reason}>
                        <p class="m-0 mt-0.5 text-xs text-muted-foreground">{v().reason}</p>
                      </Show>
                    </div>
                  </div>
                  <Steps steps={[
                    { label: lastShow() ? `Played here · ${shortDate(lastShow()!.starts_at)}` : 'Never played here', state: lastShow() ? 'done' : 'waiting' },
                    { label: `${rooms().length} rooms known`, state: rooms().length > 0 ? 'done' : 'waiting' },
                    ...(v().floor != null && v().reachable != null && v().reachable! < v().floor!
                      ? [{ label: `${v().floor! - v().reachable!} more who ask to hear from you`, state: 'waiting' }]
                      : []),
                  ]} />
                  <div class="mt-3"><Act onClick={() => tabs.open('plan')}>The plan for this city</Act></div>
                </>
              )}
            </Show>
          </Card>
        </Split>

        <Split even>
          <Card title={lastShow() ? `Last night here · ${shortDate(lastShow()!.starts_at)}` : 'Last night here'} icon={<ChartBar />}>
            <Show when={lastShow()} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">No night here on record yet.</p>}>
              {last => (
                <>
                  <p class="m-0 text-xs text-muted-foreground">{last().title}{last().venue ? ` · ${last().venue}` : ''}</p>
                  <div class="mt-1.5">
                    <StatRow label="Paid tickets" value={last().paid_buyers == null ? <Pill>not measured · no ticket sale</Pill> : <span class="text-foreground">{last().paid_buyers}</span>} />
                    <StatRow label="Ticket link clicks" value={<span class="text-foreground">{last().ticket_clicks}</span>} />
                    <StatRow label="Fans interested" value={<span class="text-foreground">{last().interested}</span>} />
                    <StatRow label="In the room" value={last().checkins == null ? <Pill>not measured · no door QR</Pill> : <span class="text-foreground">{last().checkins} checked in</span>} />
                  </div>
                </>
              )}
            </Show>
          </Card>
          <Card title="Rooms, by what we know" icon={<Building />}>
            <Bar label="Worth a letter" value={byAssessment('worth_contact')} max={Math.max(1, rooms().length)} tone="good" labelWidth="md" />
            <Bar label="Too little known" value={byAssessment('insufficient_evidence')} max={Math.max(1, rooms().length)} tone="warn" labelWidth="md" />
            <Show when={byAssessment('not_assessed') > 0}>
              <Bar label="Not assessed" value={byAssessment('not_assessed')} max={Math.max(1, rooms().length)} tone="muted" labelWidth="md" />
            </Show>
          </Card>
        </Split>
        </Show>
      </WorkAreaPanel>

      <Show when={model()}>
        <div>
          <WorkAreaPanel id="rooms" active={tabs.active()}>
            <Show when={rooms().length > 0} fallback={<EmptyState icon={<MapPin />} label="No rooms on record here" hint="A room lands here once a show marks it or research finds it." />}>
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
          </WorkAreaPanel>
          <WorkAreaPanel id="fans" active={tabs.active()}>
            <Show when={funnelRow()} fallback={<EmptyState icon={<Users />} label="No fan here yet" hint="A city fills in once a fan says they live here." />}>
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
                    {row().venues} venues · {row().promoters} promoters · {row().festivals} festivals open to booking
                    {' — '}
                    last show {lastPlayed(row())}
                    {row().next_show_at ? ` · next ${formatTimestamp(row().next_show_at!)}` : ''}
                  </p>
                </>
              )}
            </Show>
          </WorkAreaPanel>
          <WorkAreaPanel id="shows" active={tabs.active()}>
            <Show when={(model()?.shows.length ?? 0) > 0} fallback={<EmptyState icon={<CalendarDays />} label="No show here on record" />}>
              <div class="flex flex-col gap-2">
                <For each={model()!.shows}>{show => <ShowRow show={show} slug={slug()} />}</For>
              </div>
            </Show>
          </WorkAreaPanel>
          <WorkAreaPanel id="contacts" active={tabs.active()}>
            <CityContacts slug={slug()} citySlug={citySlug()} cityName={cityName()} />
          </WorkAreaPanel>
          <WorkAreaPanel id="plan" active={tabs.active()}>
            <CityPlan slug={slug()} citySlug={citySlug()} />
          </WorkAreaPanel>
        </div>
      </Show>
    </PageShell>
  )
}

/** Staged addresses the sheet filed under this city. Read-only: promote and
 *  dismiss stay on the Contacts tab where the review queue lives. Fetched
 *  when the tab opens. */
function CityContacts(props: { slug: string; citySlug: string; cityName: string }) {
  const contacts = useQuery(() => ({
    queryKey: ['gdrive-contacts', props.slug],
    queryFn: () => api.gdriveContacts(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  // Staged contacts name their city in free text — the sheet's word folds
  // onto the catalogue name or the slug.
  const cityContacts = () => {
    const names = new Set([cityNameKey(props.citySlug), cityNameKey(props.cityName)])
    return (contacts.data?.contacts ?? []).filter(
      contact => contact.city != null && names.has(cityNameKey(contact.city)),
    )
  }
  return (
    <>
      <Show when={contacts.error}>
        <SectionFailureCard error={contacts.error} title="Couldn't load contacts" onRetry={() => void contacts.refetch()} />
      </Show>
      <Show when={!contacts.error && !contacts.data}>
        <SkeletonSection titleWidth="120px" lines={3} minHeight="120px" />
      </Show>
      <Show when={contacts.data && cityContacts().length === 0}>
        <EmptyState icon={<MapPin />} label="No staged contact names this city" />
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
                      <Show when={contact.counterparty_prior && contact.counterparty_prior!.tenants_contacted > 0 ? contact.counterparty_prior : null}>
                        {prior => (
                          <Badge
                            variant="muted"
                            title="Anonymous counts across every tenant — sends, replies, wins on this address"
                          >
                            {`${prior().tenants_contacted} wrote · ${prior().tenants_replied} answered`}
                          </Badge>
                        )}
                      </Show>
                      <Show when={contact.venue_prior && contact.venue_prior!.tenants_played > 0 ? contact.venue_prior : null}>
                        {prior => (
                          <Badge
                            variant="muted"
                            title="Anonymous counts across every tenant — the room's play record on the registry"
                          >
                            {`${prior().tenants_played} played · ${prior().shows} show${prior().shows === 1 ? '' : 's'}`}
                          </Badge>
                        )}
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
    </>
  )
}

/** The planner's full answer for this city — a proposal to approve, the
 *  reason it passed, or what an approval produced. The one write on the page
 *  is the same approve the Places tab runs. Fetched when the tab opens. */
function CityPlan(props: { slug: string; citySlug: string }) {
  const approval = useGigPlanApproval(() => props.slug)
  const plan = useQuery(() => ({
    // The stored-intent read — the same entry the Places tab's panel holds
    // under its default key.
    queryKey: ['gig-plan', props.slug, ''],
    queryFn: () => api.gigPlan(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const proposal = () => plan.data?.proposals.find(p => p.city === props.citySlug)
  const passedOver = () => plan.data?.passed_over.find(p => p.city === props.citySlug)
  const outcome = () => plan.data?.track_record.proposals.find(p => p.city === props.citySlug)
  return (
    <>
      <p class="text-sm text-muted-foreground leading-relaxed">
        <Link to="/tenants/$slug/places" params={{ slug: props.slug }} class="underline underline-offset-2">
          The whole plan lives under Places
        </Link>.
      </p>
      <Show when={plan.error}>
        <SectionFailureCard error={plan.error} title="Couldn't load the gig plan" onRetry={() => void plan.refetch()} />
      </Show>
      <Show when={!plan.error && !plan.data}>
        <SkeletonSection titleWidth="140px" lines={4} minHeight="160px" />
      </Show>
      <Show when={plan.data && !proposal() && !passedOver() && !outcome()}>
        <EmptyState icon={<MapPin />} label="The planner did not consider this city" />
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
    </>
  )
}
