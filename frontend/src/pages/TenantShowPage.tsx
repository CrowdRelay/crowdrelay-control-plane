import { For, Show, createSignal, type JSX } from 'solid-js'
import { Link, useParams } from '@tanstack/solid-router'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { ShowTimelineState, ShowTimelineStep, TenantShowHelpersResponse } from '../lib/types'
import { hasDegradedSections, whileIncomplete } from '../lib/incomplete'
import { PageShell, PageHeader } from '../components/layout'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { SkeletonSection } from '../components/Skeleton'
import { Badge } from '../components/app/badge'
import { ShowSetupPanel } from '../components/ShowSetupPanel'
import { SharedNightPanel } from '../components/SharedNightPanel'
import { formatTimestamp } from '../lib/format'
import { ArrowLeft } from 'lucide-solid'

const STATE_VARIANT: Record<ShowTimelineState, { variant: 'success' | 'default' | 'warning' | 'muted' | 'outline'; label: string }> = {
  done: { variant: 'success', label: 'Done' },
  active: { variant: 'default', label: 'In progress' },
  due: { variant: 'warning', label: 'Due now' },
  waiting: { variant: 'muted', label: 'Waiting' },
  skipped: { variant: 'outline', label: 'Skipped' },
}

/** One act as the timeline's crossbill detail carries it — the API emits
 * position + per-act ticket link, in running order already. */
type LineupAct = { slug?: string; name?: string; position?: number; ticket_url?: string | null }

/** The night's bill, read off the announced step's crossbill detail. Empty
 * when nobody has listed who plays — the setup panel is where that gets
 * fixed, and this block stays hidden rather than rendering an empty list. */
function lineupActs(timeline: { steps: ShowTimelineStep[] }): LineupAct[] {
  const step = timeline.steps.find(s => s.key === 'announced')
  const crossbill = step?.detail?.crossbill as { acts?: LineupAct[] } | undefined
  return [...(crossbill?.acts ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
}

/** `/tenants/$slug/shows/$eventSlug` — one night, T-21→T+7, top to bottom.
 * One column, time order; every step shows its state, its owner, and the
 * one action available now. A band member should read Friday's state in
 * four seconds — no tabs, no filters, no charts. (UX-2.2) */
export function TenantShowPage() {
  const params = useParams({ from: '/tenants/$slug/shows/$eventSlug' })
  const model = useQuery(() => ({
    queryKey: ['tenant-show-timeline', params().slug, params().eventSlug],
    queryFn: () => api.showTimeline(params().slug, params().eventSlug),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  }))

  return (
    <PageShell>
      <div class="mb-2">
        <Link
          to="/tenants/$slug/shows"
          params={{ slug: params().slug }}
          class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft class="size-3.5" aria-hidden="true" /> All shows
        </Link>
      </div>
      <Show when={model.data} fallback={
        <>
          <Show when={model.error}>
            <PageHeader eyebrow="SHOW" title="Show" />
            <SectionFailureCard
              error={model.error}
              fallback="Show timeline unavailable"
              onRetry={() => void model.refetch()}
            />
          </Show>
          <Show when={!model.error}>
            <SkeletonSection titleWidth="200px" lines={2} minHeight="80px" />
            <SkeletonSection titleWidth="120px" lines={9} minHeight="420px" />
          </Show>
        </>
      }>
        {data => (
          <>
            <PageHeader
              eyebrow="SHOW"
              title={data().event.title}
              description={`${formatTimestamp(data().event.starts_at)}${data().event.venue ? ` · ${data().event.venue}` : ''}${data().event.venue_address ? ` · ${data().event.venue_address}` : ''}`}
            />
            {/* Venue knowledge lives on the show: what the room is to us —
                the relationship record, not a lookup. */}
            <Show when={(data().event.venue_knowledge ?? []).length > 0}>
              <div class="mb-3 rounded-lg border border-border bg-background px-4 py-2.5">
                <p class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">The room</p>
                <For each={data().event.venue_knowledge ?? []}>
                  {v => (
                    <div class="mt-1 text-xs text-muted-foreground">
                      <span class="text-foreground">{v.name}</span>
                      {` · ${v.kind.replaceAll('_', ' ')} — ${v.status.replaceAll('_', ' ')}`}
                      {v.last_reply !== 'none' ? ` · reply: ${v.last_reply.replaceAll('_', ' ')}` : ''}
                      {v.last_outreach_at ? ` · last contact ${formatTimestamp(v.last_outreach_at)}` : ''}
                      <Show when={v.notes}>
                        <p class="mt-0.5 truncate text-[11px]">{v.notes}</p>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            {/* The lineup — who else plays, in running order, with each
                act's own ticket link. Read-side view of the bill the setup
                panel edits (4V.5b). */}
            <Show when={lineupActs(data()).length > 0}>
              <div class="mb-3 rounded-lg border border-border bg-background px-4 py-2.5">
                <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Who's playing</p>
                <For each={lineupActs(data())}>
                  {(act, index) => (
                    <div class="mt-1 flex items-baseline gap-2 text-xs text-muted-foreground">
                      <span class="w-4 shrink-0 text-right tabular-nums">{index() + 1}.</span>
                      <span class="text-foreground">{act.name}</span>
                      <Show when={act.ticket_url}>
                        {url => (
                          <a
                            href={url()}
                            target="_blank"
                            rel="noreferrer"
                            class="text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                          >
                            tickets ↗
                          </a>
                        )}
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            {/* The shared night — every tenant's event at this room on this
                date. Renders only when the venue registry resolved a link;
                the block's own lens is the tenant workspace's, derived
                upstream (4V.6b). */}
            <Show when={data().event.place_event_id}>
              {placeEventId => (
                <SharedNightPanel slug={params().slug} placeEventId={placeEventId()} />
              )}
            </Show>
            <ShowSetupPanel slug={params().slug} eventSlug={params().eventSlug} timeline={data()} />
            {/* §4h-11 — who could help with this show: the staging queue
                read against a date rather than as an inventory. Candidates,
                never instructions — no row carries a contact address. */}
            <ShowHelpersPanel slug={params().slug} eventSlug={params().eventSlug} />
            <div class="flex flex-col gap-2">
              <For each={data().steps}>{s => <StepRow step={s} slug={params().slug} eventSlug={params().eventSlug} />}</For>
            </div>
          </>
        )}
      </Show>
    </PageShell>
  )
}

function StepRow(props: { step: ShowTimelineStep; slug: string; eventSlug: string }) {
  const state = () => STATE_VARIANT[props.step.state] ?? STATE_VARIANT.waiting
  return (
    <div class="flex items-start gap-3 rounded-lg border border-border bg-background px-4 py-3">
      <div class="w-11 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
        {props.step.anchor}
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-foreground">{props.step.label}</span>
          <Badge variant={state().variant}>{state().label}</Badge>
        </div>
        <DetailLine step={props.step} />
      </div>
      <div class="shrink-0 text-right">
        <Show when={props.step.owner}>
          <div class="text-xs text-muted-foreground">{props.step.owner}</div>
        </Show>
        <Show when={props.step.action}>
          {action => <StepAction action={action()} slug={props.slug} eventSlug={props.eventSlug} />}
        </Show>
      </div>
    </div>
  )
}

/** Where a step's action actually goes: approvals to the attention queue,
 * the QR to the door view, the T+7 artifact to the report page. Chores
 * with no console surface yet render as a plain chip — a link that goes
 * nowhere is worse than no link. */
function StepAction(props: { action: { kind: string; label: string }; slug: string; eventSlug: string }) {
  const chip = "mt-1 inline-block rounded-md border border-border px-2 py-1 text-xs"
  switch (props.action.kind) {
    case 'qr':
      return (
        <Link to="/tenants/$slug/shows/$eventSlug/scan" params={{ slug: props.slug, eventSlug: props.eventSlug }} class={`${chip} text-foreground hover:bg-card`}>
          {props.action.label}
        </Link>
      )
    case 'report':
      return (
        <Link to="/tenants/$slug/shows/$eventSlug/report" params={{ slug: props.slug, eventSlug: props.eventSlug }} class={`${chip} text-foreground hover:bg-card`}>
          {props.action.label}
        </Link>
      )
    case 'approve':
    case 'review':
      return (
        <Link to="/tenants/$slug/attention" params={{ slug: props.slug }} class={`${chip} text-foreground hover:bg-card`}>
          {props.action.label}
        </Link>
      )
    default:
      return <span class={`${chip} text-muted-foreground`}>{props.action.label}</span>
  }
}

/** One muted line under the step title — the two or three facts a band
 * member scans for. Unknown keys stay unrendered: the API owns the shape,
 * this only picks what is salient per step. */
function DetailLine(props: { step: ShowTimelineStep }) {
  const d = () => props.step.detail
  const text = () => {
    switch (props.step.key) {
      case 'announced': {
        const surfaces = (d().surfaces as Array<{ surface: string; status: string }> | undefined) ?? []
        const live = surfaces.filter(s => s.status === 'published' || s.status === 'verified').length
        const base = d().emitted_at
          ? `Announced ${formatTimestamp(String(d().emitted_at))}${live ? ` · on ${live} surface${live === 1 ? '' : 's'}` : ''}`
          : live ? `On ${live} surface${live === 1 ? '' : 's'}` : 'Not announced yet'
        const cb = d().crossbill as { state?: string; acts?: Array<{ name: string }>; cap_per_month?: number | null; deliveries_this_month?: number | null } | undefined
        if (cb?.state === 'automated_overlap' && cb.acts && cb.acts.length > 1) {
          const cap = cb.cap_per_month != null ? ` · cap ${cb.cap_per_month}/mo${cb.deliveries_this_month != null ? `, ${cb.deliveries_this_month} used` : ''}` : ''
          return `${base} · shared bill auto-pushed${cap}`
        }
        if (cb?.state === 'unreciprocated' && cb.acts && cb.acts.length > 1)
          return `${base} · shared bill — cross-bill blocked until our audience carries theirs`
        if (cb?.state === 'manual_ask' && cb.acts && cb.acts.length > 1) return `${base} · shared bill — ask is manual`
        return base
      }
      case 'sales_pace': {
        const sold = d().paid_tickets as number | undefined
        const cap = d().capacity as number | null | undefined
        const read = d().last_read as { reason?: string } | null | undefined
        const base = cap ? `${sold ?? 0}/${cap} sold` : `${sold ?? 0} sold`
        return read?.reason ? `${base} · ${read.reason}` : base
      }
      case 'bands_posting': {
        const open = (d().open as number) ?? 0
        const settled = (d().settled as number) ?? 0
        const skipped = (d().skipped as string[] | undefined) ?? []
        if (!open && !settled) return 'No asks on record yet'
        return `${settled} settled${skipped.length ? ` (${skipped.length} skipped)` : ''} · ${open} open`
      }
      case 'nearby_fans':
        return `${(d().notified as number) ?? 0} fans notified`
      case 'capture_plan':
        return `Plan ${(d().status as string) ?? 'pending'}`
      case 'the_scan':
        return `${(d().checkins as number) ?? 0} scanned${d().campaign_ready ? '' : ' · no QR yet'}`
      case 'recall': {
        const st = d().action_status as string | null | undefined
        const c = d().campaign as { subject?: string | null; delivered?: number | null; status?: string } | null | undefined
        const receipt = c?.delivered != null ? ` · ${c.delivered} delivered` : c?.status ? ` · campaign ${c.status}` : ''
        if (st === 'succeeded') return `${`Sent ${d().finished_at ? formatTimestamp(String(d().finished_at)) : ''}`.trim()}${receipt}`
        if (st) return `Recap ${st.replaceAll('_', ' ')}${c?.subject ? ` · "${c.subject}"` : ''}`
        return 'No recap queued yet'
      }
      case 'harvest': {
        const pending = (d().pending_requests as number) ?? 0
        const collected = (d().collected_requests as number) ?? 0
        if (collected > 0) return `${collected} artifact${collected === 1 ? '' : 's'} collected${pending ? ` · ${pending} in flight` : ''}`
        if (d().occurred_at) return pending ? `${pending} artifact request${pending === 1 ? '' : 's'} in flight` : 'Source recorded · nothing collected'
        return 'No material collected yet'
      }
      case 'the_numbers': {
        const cost = d().cost as { predicted_total_cost_minor?: number | null; settled_total_cost_minor?: number | null; fee_received_minor?: number | null } | null | undefined
        if (cost?.settled_total_cost_minor != null) return `Cost settled · fee ${cost.fee_received_minor != null ? `${Math.round(cost.fee_received_minor / 100)}` : '—'}`
        if (cost?.predicted_total_cost_minor != null) return 'Cost predicted, not settled yet'
        return 'No report yet'
      }
      default:
        return ''
    }
  }
  return (
    <Show when={text()}>
      <div class="mt-0.5 truncate text-xs text-muted-foreground">{text()}</div>
    </Show>
  )
}

// ── Who can help (§4h-11) ────────────────────────────────────────────────
// The staging queue read against a date rather than as an inventory. Four
// independent sections, each degrading on its own: a section named in
// `degraded` reads as "couldn't check", an empty one as a measured empty —
// the difference between "no press in Wrocław" and "we don't know".
// Every row links to the surface that owns the next step (Contacts for
// press, Places for rooms, Communities for communities); nothing here
// hands out an address — promotion is still the only door to a send.

type HelperSection =
  | 'press'
  | 'rooms_and_promoters'
  | 'communities'
  | 'cold_rooms'
  | 'bill_mates'
  | 'venue_channel'
  | 'photographers'

const HELPER_LABEL: Record<HelperSection, string> = {
  press: 'Press & radio',
  rooms_and_promoters: 'Rooms & promoters',
  communities: 'Communities',
  cold_rooms: 'Cold rooms',
  bill_mates: 'The other bands on the bill',
  venue_channel: 'The room itself',
  photographers: 'Photographers',
}

/** The tab each section's owner surface lives under on the Audience page.
 * The bill-side sections own beacons instead — their owner link overrides
 * the audience-tab default. */
const HELPER_TAB: Record<HelperSection, string> = {
  press: 'contacts',
  rooms_and_promoters: 'places',
  communities: 'communities',
  cold_rooms: 'places',
  bill_mates: '',
  venue_channel: 'places',
  photographers: '',
}

/** The honest line a measured-empty section collapses to. `place` is the
 * city name for city-scoped sections and the country code for communities —
 * the granularity the match actually ran on. */
function emptyLine(section: HelperSection, place: string | null): string {
  const where = place ? ` in ${place}` : ''
  switch (section) {
    case 'press':
      return `No proposed press${where} yet — Contacts is where staged contacts get promoted`
    case 'rooms_and_promoters':
      return `No active rooms or promoters${where} yet — Places holds the booking targets`
    case 'communities':
      return `No communities${where} yet`
    case 'cold_rooms':
      return `No unplayed rooms${where} on the shared registry`
    case 'bill_mates':
      return 'No other acts on this bill yet — the bill is the operator\'s to enter'
    case 'venue_channel':
      return 'The event names no room — add the venue to the show and it lands here'
    case 'photographers':
      return `No photographer beacons${where} — the recap needs one found before the show`
  }
}

/** One group: label + count, then compact rows or the single honest line.
 * A degraded section never reads as empty — "couldn't check" is not "none". */
function HelperGroup(props: { section: HelperSection; slug: string; count: number; empty: string; degraded: boolean; children: JSX.Element; owner?: 'beacons' }) {
  const ownerLink = () =>
    props.owner === 'beacons'
      ? { to: '/tenants/$slug/beacons' as const, label: 'Beacons' }
      : {
          to: '/tenants/$slug/audience' as const,
          label:
            HELPER_TAB[props.section] === 'places'
              ? 'Places'
              : HELPER_TAB[props.section] === 'contacts'
                ? 'Contacts'
                : 'Communities',
        }
  return (
    <div class="mt-2">
      <div class="flex items-baseline justify-between gap-2">
        <p class="text-xs font-medium text-foreground">
          {HELPER_LABEL[props.section]}
          <span class="ml-1.5 tabular-nums text-muted-foreground">{props.degraded ? '—' : props.count}</span>
        </p>
        <Link
          to={ownerLink().to}
          params={{ slug: props.slug }}
          search={props.owner === 'beacons' ? {} : { tab: HELPER_TAB[props.section] }}
          class="shrink-0 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          {ownerLink().label} →
        </Link>
      </div>
      <Show
        when={!props.degraded}
        fallback={<p class="mt-0.5 text-xs text-muted-foreground">Couldn't check this section — it fills in on its own.</p>}
      >
        <Show when={props.count > 0} fallback={<p class="mt-0.5 text-xs text-muted-foreground">{props.empty}</p>}>
          {props.children}
        </Show>
      </Show>
    </div>
  )
}

function ShowHelpersPanel(props: { slug: string; eventSlug: string }) {
  // The same degraded-read convention every read model on the console uses:
  // a 200 with a section named in `degraded` is not an error, so nothing
  // retries it by default — whileIncomplete keeps asking until it fills.
  const helpers = useQuery(() => ({
    queryKey: ['tenant-show-helpers', props.slug, props.eventSlug],
    queryFn: () => api.showHelpers(props.slug, props.eventSlug),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))
  const queryClient = useQueryClient()
  const city = () => helpers.data?.event.city ?? null
  const country = () => helpers.data?.event.country_code ?? null
  const citySlug = () => helpers.data?.event.city_slug ?? null
  const noCity = () => (helpers.data?.degraded ?? []).includes('city')
  const sectionDegraded = (s: HelperSection) => (helpers.data?.degraded ?? []).includes(s)
  const rowLink = "mt-0.5 block truncate text-xs text-muted-foreground hover:text-foreground"
  const audienceSearch = (s: HelperSection) => ({ tab: HELPER_TAB[s] })
  const [admitting, setAdmitting] = createSignal<string | null>(null)
  const [admitNote, setAdmitNote] = createSignal<string | null>(null)

  // A candidate becomes a roster row: unverified, outreach off — a name to
  // research, never a contact to mail. The same rule the researched-import
  // carries ("approve them before inviting") is what makes this one click.
  const admit = (name: string, kind: 'scene_partner' | 'venue') => {
    const slug = citySlug()
    if (!slug || admitting()) return
    setAdmitting(name)
    setAdmitNote(null)
    void api
      .upsertBeacon(props.slug, {
        displayName: name,
        beaconKind: kind,
        citySlug: slug,
        active: true,
        verified: false,
        acceptsOutreach: false,
        doNotContact: false,
        relationshipScore: 50,
        relevanceBasisPoints: 7_500,
        confidenceBasisPoints: 7_500,
      })
      .then(() => {
        setAdmitNote(`${name} is on the roster — unverified. Find their channel before outreach.`)
        void queryClient.invalidateQueries({ queryKey: ['tenant-show-helpers', props.slug, props.eventSlug] })
      })
      .catch(() => setAdmitNote(`Adding ${name} did not work.`))
      .finally(() => setAdmitting(null))
  }

  return (
    <div class="mb-3 rounded-lg border border-border bg-background px-4 py-2.5">
      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Who can help</p>
      <Show when={helpers.error}>
        <p class="mt-1 text-xs text-muted-foreground">The candidate list could not be loaded.</p>
      </Show>
      <Show when={!helpers.data && !helpers.error}>
        <p class="mt-1 text-xs text-muted-foreground">Checking who could help…</p>
      </Show>
      <Show when={helpers.data}>
        {(data: () => TenantShowHelpersResponse) => (
          <>
            {/* A city-less show has no local anybody — one line for the whole
                card rather than four identical empties. */}
            <Show when={noCity()}>
              <p class="mt-1 text-xs text-muted-foreground">
                The show has no city yet — set one and this list fills in.
              </p>
            </Show>
            <Show when={!noCity()}>
              <HelperGroup section="press" slug={props.slug} count={data().press.length} degraded={sectionDegraded('press')} empty={emptyLine('press', city())}>
                <For each={data().press}>
                  {row => (
                    <Link to="/tenants/$slug/audience" params={{ slug: props.slug }} search={audienceSearch('press')} class={rowLink}>
                      <span class="text-foreground">{row.display_name}</span>
                      {` · ${row.target_kind.replaceAll('_', ' ')}`}
                      {row.contact_domain ? ` · ${row.contact_domain}` : ''}
                      {row.verified ? ' · verified' : ''}
                    </Link>
                  )}
                </For>
              </HelperGroup>
              <HelperGroup section="rooms_and_promoters" slug={props.slug} count={data().rooms_and_promoters.length} degraded={sectionDegraded('rooms_and_promoters')} empty={emptyLine('rooms_and_promoters', city())}>
                <For each={data().rooms_and_promoters}>
                  {row => (
                    <Link to="/tenants/$slug/audience" params={{ slug: props.slug }} search={audienceSearch('rooms_and_promoters')} class={rowLink}>
                      <span class="text-foreground">{row.display_name}</span>
                      {` · ${row.target_kind}`}
                      {row.venue_linked ? ' · on the registry' : ''}
                      {row.accepts_booking ? '' : ' · booking closed'}
                    </Link>
                  )}
                </For>
              </HelperGroup>
              <HelperGroup section="communities" slug={props.slug} count={data().communities.length} degraded={sectionDegraded('communities')} empty={emptyLine('communities', country())}>
                <For each={data().communities}>
                  {row => (
                    <Link to="/tenants/$slug/audience" params={{ slug: props.slug }} search={audienceSearch('communities')} class={rowLink}>
                      <span class="text-foreground">{row.community_name}</span>
                      {` · ${row.platform} · ${row.self_promo_policy.replaceAll('_', ' ')}`}
                    </Link>
                  )}
                </For>
              </HelperGroup>
              <HelperGroup section="cold_rooms" slug={props.slug} count={data().cold_rooms.length} degraded={sectionDegraded('cold_rooms')} empty={emptyLine('cold_rooms', city())}>
                <For each={data().cold_rooms}>
                  {row => (
                    <Link to="/tenants/$slug/audience" params={{ slug: props.slug }} search={audienceSearch('cold_rooms')} class={rowLink}>
                      <span class="text-foreground">{row.display_name}</span>
                      {row.capacity ? ` · ${row.capacity}` : ''}
                    </Link>
                  )}
                </For>
              </HelperGroup>
              {/* P.3 — the three sides the show never contacted: the bill-mate
                  who is not a roster sibling, the venue's own channel, the
                  local photographer. Names, not addresses — the roster is
                  the only door, same as every other section here. */}
              <HelperGroup section="bill_mates" slug={props.slug} count={data().bill_mates.length} degraded={sectionDegraded('bill_mates')} empty={emptyLine('bill_mates', city())} owner="beacons">
                <For each={data().bill_mates}>
                  {row => (
                    <div class="mt-0.5 flex items-baseline justify-between gap-2">
                      <Link to="/tenants/$slug/beacons" params={{ slug: props.slug }} class={`${rowLink} mt-0 flex-1`}>
                        <span class="text-foreground">{row.act_name}</span>
                        {row.position === 0 ? ' · headline' : ` · slot ${row.position}`}
                        {row.shared_bills > 1 ? ` · shared ${row.shared_bills} bills` : ''}
                        {row.on_roster ? ' · on the roster' : row.resolution === 'peer' ? ' · on the registry' : ' · unclaimed name'}
                      </Link>
                      <Show when={!row.on_roster}>
                        <button
                          type="button"
                          disabled={admitting() !== null}
                          onClick={() => admit(row.act_name, 'scene_partner')}
                          class="shrink-0 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground disabled:opacity-50"
                        >
                          {admitting() === row.act_name ? 'Adding…' : 'Add to roster'}
                        </button>
                      </Show>
                    </div>
                  )}
                </For>
              </HelperGroup>
              <HelperGroup section="venue_channel" slug={props.slug} count={data().venue_channel ? 1 : 0} degraded={sectionDegraded('venue_channel')} empty={emptyLine('venue_channel', city())}>
                <Show when={data().venue_channel}>
                  {channel => (
                    <div class="mt-0.5 flex items-baseline justify-between gap-2">
                      <Link to="/tenants/$slug/beacons" params={{ slug: props.slug }} class={`${rowLink} mt-0 flex-1`}>
                        <span class="text-foreground">{channel().display_name}</span>
                        {channel().venue_id ? ' · on the registry' : ' · not on the registry yet'}
                        {channel().on_roster ? ' · on the roster' : ''}
                      </Link>
                      <Show when={!channel().on_roster}>
                        <button
                          type="button"
                          disabled={admitting() !== null}
                          onClick={() => admit(channel().display_name, 'venue')}
                          class="shrink-0 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground disabled:opacity-50"
                        >
                          {admitting() === channel().display_name ? 'Adding…' : 'Add to roster'}
                        </button>
                      </Show>
                    </div>
                  )}
                </Show>
              </HelperGroup>
              <HelperGroup section="photographers" slug={props.slug} count={data().photographers.length} degraded={sectionDegraded('photographers')} empty={emptyLine('photographers', city())} owner="beacons">
                <For each={data().photographers}>
                  {row => (
                    <Link to="/tenants/$slug/beacons" params={{ slug: props.slug }} class={rowLink}>
                      <span class="text-foreground">{row.display_name}</span>
                      {row.verified ? ' · verified' : ''}
                      {row.contacted_before ? ' · contacted before' : ''}
                    </Link>
                  )}
                </For>
              </HelperGroup>
              <Show when={admitNote()}>
                {note => <p class="mt-2 text-xs text-muted-foreground">{note()}</p>}
              </Show>
            </Show>
            {/* The read's own gaps, named — never pattern-matched around. */}
            <Show when={data().notes.includes('staged_contacts_have_no_city')}>
              <p class="mt-2 text-xs text-muted-foreground">
                Staged Drive contacts have no city to match on — they live on Contacts, not here.
              </p>
            </Show>
          </>
        )}
      </Show>
    </div>
  )
}
