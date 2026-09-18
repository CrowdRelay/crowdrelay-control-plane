import { For, Show, type JSX } from 'solid-js'
import { Link, useParams } from '@tanstack/solid-router'
import { useQuery } from '@tanstack/solid-query'
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
          class="text-xs text-muted-foreground hover:text-foreground"
        >
          ← All shows
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
          const cap = cb.cap_per_month != null ? ` · cap ${cb.cap_per_month}/mo${cb.deliveries_this_month != null ? `, ${cb.deliveries_this_month} sent` : ''}` : ''
          return `${base} · shared bill auto-pushed${cap}`
        }
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

type HelperSection = 'press' | 'rooms_and_promoters' | 'communities' | 'cold_rooms'

const HELPER_LABEL: Record<HelperSection, string> = {
  press: 'Press & radio',
  rooms_and_promoters: 'Rooms & promoters',
  communities: 'Communities',
  cold_rooms: 'Cold rooms',
}

/** The tab each section's owner surface lives under on the Audience page. */
const HELPER_TAB: Record<HelperSection, string> = {
  press: 'contacts',
  rooms_and_promoters: 'places',
  communities: 'communities',
  cold_rooms: 'places',
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
  }
}

/** One group: label + count, then compact rows or the single honest line.
 * A degraded section never reads as empty — "couldn't check" is not "none". */
function HelperGroup(props: { section: HelperSection; slug: string; count: number; empty: string; degraded: boolean; children: JSX.Element }) {
  return (
    <div class="mt-2">
      <div class="flex items-baseline justify-between gap-2">
        <p class="text-xs font-medium text-foreground">
          {HELPER_LABEL[props.section]}
          <span class="ml-1.5 tabular-nums text-muted-foreground">{props.degraded ? '—' : props.count}</span>
        </p>
        <Link
          to="/tenants/$slug/audience"
          params={{ slug: props.slug }}
          search={{ tab: HELPER_TAB[props.section] }}
          class="shrink-0 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          {HELPER_TAB[props.section] === 'places' ? 'Places' : HELPER_TAB[props.section] === 'contacts' ? 'Contacts' : 'Communities'} →
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
  const city = () => helpers.data?.event.city ?? null
  const country = () => helpers.data?.event.country_code ?? null
  const noCity = () => (helpers.data?.degraded ?? []).includes('city')
  const sectionDegraded = (s: HelperSection) => (helpers.data?.degraded ?? []).includes(s)
  const rowLink = "mt-0.5 block truncate text-xs text-muted-foreground hover:text-foreground"
  const audienceSearch = (s: HelperSection) => ({ tab: HELPER_TAB[s] })

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
