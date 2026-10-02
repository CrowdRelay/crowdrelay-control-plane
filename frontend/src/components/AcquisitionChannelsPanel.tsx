import { For, Show, createSignal } from 'solid-js'
import { Users } from 'lucide-solid'
import { Section } from './layout'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { tokenLabel } from '../lib/format'
import { SectionIcon } from './SectionIcon'
import { EmptyState } from './ui/empty-state'
import { Tile, Tiles } from './ui/dash'
import { SkeletonRows } from './Skeleton'
import { Alert } from './app/alert'
import { Button } from './app/button'
import { DataTable, type ColumnDef } from './app/data-table'
import type { ChannelPerformance } from '../lib/types'

// `/operations/acquisition-channels` answers the question the north star
// depends on — where did the fans come from, and did they stick — and had no
// screen. The unattributed rows carry their own remedy, which is the part
// worth surfacing: they say what to instrument, not just that data is missing.
//
// The totals are tiles, like every overview page. Channels and the signups
// that could not be traced were two tables with different columns for the
// same numbers; they are one table now, with a chip for each kind.

type Row = {
  id: string
  traced: boolean
  name: string
  detail: string
  /** What to do next: the channel's best action, or how to trace the rest. */
  advice: string | null
  signups: number
  activated: number
  activation: number | null
  departed: number | undefined
}

const pct = (basisPoints: number | null) =>
  basisPoints == null ? '—' : `${(basisPoints / 100).toFixed(1)}%`

/// Platform names as the platforms write them.
const BRANDS: Record<string, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', spotify: 'Spotify', bandcamp: 'Bandcamp', soundcloud: 'SoundCloud', reddit: 'Reddit' }
const sourceName = (raw: string) => BRANDS[raw.toLowerCase()] ?? tokenLabel(raw.replace(/_/g, ' '))

const fromChannel = (channel: ChannelPerformance, i: number): Row => {
  const traced = channel.attribution.evidence === 'attributed'
  const a = channel.attribution
  return {
    id: `c${i}`,
    traced,
    name: a.evidence === 'attributed' ? sourceName(a.source) : (authState.isPlatformLevel() ? 'Unattributed' : 'Not traced'),
    detail: a.evidence === 'attributed'
      ? [a.community, a.creative].filter(Boolean).join(' · ') || 'No community or post recorded'
      : tokenLabel(a.reason.replace(/_/g, ' ')),
    advice: channel.best_action,
    signups: channel.signups,
    activated: channel.activated_30d,
    activation: channel.activation_basis_points,
    departed: channel.departed,
  }
}

type Filter = 'all' | 'traced' | 'untraced'

export function AcquisitionChannelsPanel(props: { slug: string }) {
  const model = useQuery(() => ({
    queryKey: ['acquisition-channels', props.slug],
    queryFn: () => api.acquisitionChannels(props.slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  const rows = (): Row[] => {
    const data = model.data
    if (!data) return []
    return [
      ...data.channels.map(fromChannel),
      ...data.unattributed.map((item, i): Row => ({
        id: `u${i}`,
        traced: false,
        name: authState.isPlatformLevel() ? 'Unattributed' : 'Not traced',
        detail: tokenLabel(item.reason.replace(/_/g, ' ')),
        advice: item.remedy,
        signups: item.signups,
        activated: item.activated_30d,
        activation: null,
        departed: item.departed,
      })),
    ]
  }
  const [show, setShow] = createSignal<Filter>('all')
  const matches = (row: Row, filter: Filter) => filter === 'all' || (filter === 'traced') === row.traced
  const count = (filter: Filter) => rows().filter(r => matches(r, filter)).length
  const best = () => Math.max(0, ...rows().map(r => r.signups))
  const pctOf = (part: number, whole: number) => whole > 0 ? `${Math.round(part / whole * 100)}% of signups` : undefined

  const columns: ColumnDef<Row, any>[] = [
    {
      id: 'channel', header: 'Channel', accessorFn: r => r.name, meta: { class: 'min-w-64 whitespace-normal' },
      cell: c => <div class="max-w-lg">
        <span class="font-medium text-foreground">{c.row.original.name}</span>
        <span class="block text-xs text-muted-foreground">{c.row.original.detail}</span>
        <Show when={c.row.original.advice}>
          <span class="mt-1 block text-xs text-foreground/80 text-pretty">{c.row.original.advice}</span>
        </Show>
      </div>,
    },
    {
      id: 'share', header: 'Share', enableSorting: false, meta: { class: 'w-[16%]' },
      // Signups across channels are the same unit, so length means something:
      // this channel's share of the biggest. The number is in the next column.
      cell: c => <div class="h-1.5 w-full min-w-12 overflow-hidden rounded-sm bg-muted" aria-hidden="true">
        <span class="block h-full rounded-sm bg-primary" style={{ width: `${best() > 0 ? (c.row.original.signups / best()) * 100 : 0}%` }} />
      </div>,
    },
    { id: 'signups', header: 'Signups', accessorFn: r => r.signups, meta: { numeric: true }, cell: c => <span class="font-medium">{c.row.original.signups.toLocaleString()}</span> },
    { id: 'activated', header: 'Activated', accessorFn: r => r.activated, meta: { numeric: true }, cell: c => c.row.original.activated.toLocaleString() },
    { id: 'activation', header: 'Activation', accessorFn: r => r.activation ?? -1, meta: { numeric: true }, cell: c => pct(c.row.original.activation) },
    {
      // Signups count only people who stayed, so a channel that churns hard
      // looks like a smaller one that did not. This column tells them apart.
      id: 'left', header: 'Left', accessorFn: r => r.departed ?? -1, meta: { numeric: true },
      cell: c => c.row.original.departed == null ? <span class="text-muted-foreground">—</span> : c.row.original.departed.toLocaleString(),
    },
  ]

  return <Section
    title="Where the fans came from"
    icon={<SectionIcon name="users" />}
    description="Signups by the channel that brought them, and how many were still active 30 days later. A channel whose people never come back isn't working, however big its first number is."
  >
    <Show when={model.error}>
      <Alert>{authState.isPlatformLevel() ? 'Acquisition attribution is not available on the connected CrowdRelay build. The funnel below still reports totals.' : 'We can’t tell where the fans came from on this setup yet. The totals below still report.'}</Alert>
    </Show>

    <Show when={!model.error && model.isPending}><SkeletonRows count={4} /></Show>

    <Show when={model.data}>{data => <>
      <Tiles cols={5} class="mb-4">
        <Tile label="Signups" value={data().total_signups.toLocaleString()} />
        <Tile label="Activated in 30 days" value={data().total_activated_30d.toLocaleString()} sub={pctOf(data().total_activated_30d, data().total_signups)} />
        <Tile label="Active in 30 days" value={data().active_30d.toLocaleString()} />
        <Tile label="Retained after 30 days" value={data().retained_30d.toLocaleString()} />
        <Tile label="Reachable" value={data().reachable_consented.toLocaleString()} sub="agreed to be contacted" />
      </Tiles>

      <DataTable
        data={rows().filter(r => matches(r, show()))}
        columns={columns}
        getRowId={r => r.id}
        pageSize={8}
        initialSorting={[{ id: 'signups', desc: true }]}
        searchText={r => [r.name, r.detail, r.advice].filter(Boolean).join(' ')}
        searchPlaceholder="Search channels"
        toolbar={
          <Show when={count('untraced') > 0 && count('traced') > 0}>
            <div role="group" aria-label="Traced or not" class="flex flex-wrap items-center gap-1">
              <For each={['all', 'traced', 'untraced'] as Filter[]}>{f => (
                <Button variant={show() === f ? 'secondary' : 'ghost'} size="sm" aria-pressed={show() === f} onClick={() => setShow(f)}>
                  {f === 'all' ? 'All' : f === 'traced' ? 'Traced' : 'Not traced'}
                  <span class="tabular-nums text-muted-foreground">{count(f)}</span>
                </Button>
              )}</For>
            </div>
          </Show>
        }
        empty={rows().length === 0
          ? <EmptyState
              icon={<Users />}
              label="No attributed signups yet"
              hint={authState.isPlatformLevel() ? 'A channel appears here once a fan arrives carrying its attribution — a tracked link, a community post, or a campaign creative. Until then the funnel counts them, but cannot say who sent them.' : 'A channel appears here once a fan arrives by a tracked link, a community post, or a campaign. Until then we count them, but cannot say who sent them.'}
            />
          : <EmptyState label="Nothing here" hint="No channel matches this filter.">
              <Button variant="outline" size="sm" onClick={() => setShow('all')}>Show every channel</Button>
            </EmptyState>}
      />
    </>}</Show>
  </Section>
}
