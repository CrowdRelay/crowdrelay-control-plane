import { For, Show, type JSX } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { capability } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { tokenLabel } from '../lib/format'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { SkeletonRows } from './Skeleton'
import { Button } from './app/button'
import { DataTable, type ColumnDef } from './app/data-table'
import { Tile, Tiles } from './ui/dash'

// "Where did our fans come from" answers the first half; this answers what
// those fans turned into — the convert third of the North Star. Five reads,
// each degrading on its own: a source that could not be read says so and
// offers to try again, rather than rendering as zero.
//
// The headline numbers lead as tiles, the way the overview pages open; the
// two breakdowns below are sortable tables. The paid, referral and ad
// sentences that used to stack under small caps are the tiles now.

type FunnelRow = { source: string; acquired_fans: number; active_fans: number; ticket_buyers: number; attendees: number }
type RevenueRow = { currency: string; paid_orders: number; after_refunds_minor: number; refunded_minor: number }
type Referrals = { referrals_sent: number; qualified: number; activated: number; reversed: number }
type Ads = { attributed_fans: number; meta_attributed: number; google_attributed: number; bandsintown_attributed: number; utm_attributed: number }
type AdRow = { platform: string | null; utm_source: string; utm_campaign: string; attributed_fans: number; delivered: number; delivered_ok: number }

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100)
const n = (value: number) => value.toLocaleString()

/// Platform names as the platforms write them.
const BRANDS: Record<string, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', spotify: 'Spotify', bandcamp: 'Bandcamp', soundcloud: 'SoundCloud', google: 'Google', meta: 'Meta', bandsintown: 'Bandsintown' }
const sourceName = (raw: string) => BRANDS[raw.toLowerCase()] ?? tokenLabel(raw.replace(/_/g, ' '))
const share = (part: number, whole: number) => whole > 0 ? `${Math.round(part / whole * 100)}%` : null

function read<T>(slug: () => string, path: string) {
  return useQuery(() => ({
    queryKey: ['surface', slug(), 'conversion', path],
    queryFn: () => surface.read<T>(slug(), path),
    staleTime: 60_000,
    retry: 1,
  }))
}

/// One read's place on the page: its data, a skeleton while it loads, or a
/// sentence and Try again when it failed.
function Part<T>(props: { query: { data: T | undefined; error: unknown; refetch: () => unknown }; what: string; skeleton?: JSX.Element; children: (data: T) => JSX.Element }) {
  return (
    <Show when={!props.query.error} fallback={
      <p class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        Couldn't load {props.what}.
        <Button variant="outline" size="sm" onClick={() => void props.query.refetch()}>Try again</Button>
      </p>
    }>
      <Show when={props.query.data !== undefined} fallback={props.skeleton ?? <SkeletonRows count={3} />}>
        {props.children(props.query.data as T)}
      </Show>
    </Show>
  )
}

export function FanConversionPanel(props: { slug: string }) {
  const slug = () => props.slug
  const funnel = read<FunnelRow[]>(slug, capability('funnel').read!.path)
  const revenue = read<RevenueRow[]>(slug, capability('revenue').read!.path)
  const referrals = read<Referrals>(slug, capability('referral-conversion').read!.path)
  const ads = read<Ads>(slug, capability('ad-conversion').read!.path)
  const adRows = read<AdRow[]>(slug, capability('ad-conversion-breakdown').read!.path)

  const sum = (key: keyof Omit<FunnelRow, 'source'>) => (funnel.data ?? []).reduce((total, row) => total + row[key], 0)

  const funnelColumns: ColumnDef<FunnelRow, any>[] = [
    { id: 'source', header: 'First came from', accessorFn: r => sourceName(r.source), cell: c => <span class="font-medium text-foreground">{sourceName(c.row.original.source)}</span> },
    { id: 'fans', header: 'Fans', accessorFn: r => r.acquired_fans, meta: { numeric: true }, cell: c => n(c.row.original.acquired_fans) },
    { id: 'reachable', header: 'Still reachable', accessorFn: r => r.active_fans, meta: { numeric: true }, cell: c => n(c.row.original.active_fans) },
    {
      id: 'tickets', header: 'Bought a ticket', accessorFn: r => r.ticket_buyers, meta: { numeric: true },
      cell: c => <>
        {n(c.row.original.ticket_buyers)}
        <Show when={share(c.row.original.ticket_buyers, c.row.original.acquired_fans)}>{s => <span class="block text-xs text-muted-foreground">{s()} of fans</span>}</Show>
      </>,
    },
    { id: 'attended', header: 'Came to a show', accessorFn: r => r.attendees, meta: { numeric: true }, cell: c => n(c.row.original.attendees) },
  ]

  const adColumns: ColumnDef<AdRow, any>[] = [
    { id: 'platform', header: 'Platform', accessorFn: r => sourceName(r.platform ?? r.utm_source), cell: c => sourceName(c.row.original.platform ?? c.row.original.utm_source) },
    { id: 'campaign', header: 'Campaign', accessorFn: r => r.utm_campaign, meta: { class: 'whitespace-normal' }, cell: c => c.row.original.utm_campaign },
    { id: 'fans', header: 'Fans', accessorFn: r => r.attributed_fans, meta: { numeric: true }, cell: c => n(c.row.original.attributed_fans) },
    {
      // What the platform was told back, so its optimiser learns who converted.
      id: 'reported', header: 'Reported back', accessorFn: r => r.delivered_ok, meta: { numeric: true, class: 'whitespace-nowrap' },
      cell: c => <>{n(c.row.original.delivered_ok)} of {n(c.row.original.delivered)}</>,
    },
  ]

  return (
    <Section
      title="What it turned into"
      icon={<SectionIcon name="trending-up" />}
      description="For each place fans first came from: how many stayed, bought a ticket and came to a show. Then what that paid, and what referrals and ads brought."
    >
      <div class="space-y-6">
        <Tiles cols={4} class="mb-6">
          <Show when={revenue.data !== undefined && !revenue.error} fallback={<Tile label="Paid" value={revenue.error ? '—' : '…'} sub={revenue.error ? 'Couldn’t load' : undefined} />}>
            <Show when={(revenue.data ?? []).length > 0} fallback={<Tile label="Paid" value="—" sub="No paid order yet" />}>
              <For each={revenue.data!.slice(0, 1)}>{row => (
                <Tile
                  label="Paid, after refunds"
                  value={money(row.after_refunds_minor, row.currency)}
                  sub={`${n(row.paid_orders)} orders${row.refunded_minor > 0 ? ` · ${money(row.refunded_minor, row.currency)} refunded` : ''}${revenue.data!.length > 1 ? ` · +${revenue.data!.length - 1} more currencies` : ''}`}
                />
              )}</For>
            </Show>
          </Show>
          <Tile label="Bought a ticket" value={funnel.data ? n(sum('ticket_buyers')) : null} sub={funnel.data ? `${share(sum('ticket_buyers'), sum('acquired_fans')) ?? '—'} of fans` : undefined} />
          <Tile
            label="Fans brought by fans"
            value={referrals.data ? n(referrals.data.activated) : null}
            sub={referrals.data ? (referrals.data.referrals_sent > 0 ? `from ${n(referrals.data.referrals_sent)} referrals shared` : 'No referral shared yet') : referrals.error ? 'Couldn’t load' : undefined}
          />
          <Tile
            label="Fans from ads"
            value={ads.data ? n(ads.data.attributed_fans) : null}
            sub={ads.data && ads.data.attributed_fans > 0
              ? `Meta ${n(ads.data.meta_attributed)} · Google ${n(ads.data.google_attributed)} · Bandsintown ${n(ads.data.bandsintown_attributed)} · tagged links ${n(ads.data.utm_attributed)}`
              : ads.error ? 'Couldn’t load' : ads.data ? 'No fan has come from an ad' : undefined}
          />
        </Tiles>

        <div>
          <h3 class="mb-2 text-sm font-medium text-foreground">From first touch to the room</h3>
          <Part query={funnel} what="the funnel">{rows =>
            <Show when={rows.length > 0} fallback={<p class="text-sm text-muted-foreground">No fan has come through a tracked source yet.</p>}>
              <DataTable
                data={rows}
                columns={funnelColumns}
                pageSize={8}
                initialSorting={[{ id: 'fans', desc: true }]}
                searchText={r => sourceName(r.source)}
                searchPlaceholder="Search sources"
              />
            </Show>
          }</Part>
        </div>

        <Show when={(adRows.data ?? []).length > 0 || adRows.error}>
          <div>
            <h3 class="mb-2 text-sm font-medium text-foreground">Ad campaigns</h3>
            <Part query={adRows} what="the ad campaigns">{rows =>
              <DataTable
                data={rows}
                columns={adColumns}
                pageSize={8}
                initialSorting={[{ id: 'fans', desc: true }]}
                searchText={r => [r.platform, r.utm_source, r.utm_campaign].filter(Boolean).join(' ')}
                searchPlaceholder="Search campaigns"
              />
            }</Part>
          </div>
        </Show>
      </div>
    </Section>
  )
}
