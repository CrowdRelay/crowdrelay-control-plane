import { For, Show, createMemo, createSignal, type Component } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { compactNumber, trendArrow, trendDirection } from '../lib/charts'
import { Sparkline } from './Sparkline'
import { EmptyState } from './ui/empty-state'
import { SkeletonBlock, SkeletonRows } from '../components/Skeleton'
import type { FeedCoverage, GrowthMetricTrendView } from '../lib/types'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'

const feedStateLabel = (state: string): string =>
  state === 'live' ? 'Live' : state === 'stale' ? 'Stale' : 'Missing'

const feedStateTone = (state: string): 'good' | 'warn' | 'bad' =>
  state === 'live' ? 'good' : state === 'stale' ? 'warn' : 'bad'

const feedStateVariant = (state: string): 'success' | 'warning' | 'destructive' =>
  state === 'live' ? 'success' : state === 'stale' ? 'warning' : 'destructive'

// Platform display config — label + brand color for bars and headers.
const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  spotify:      { label: 'Spotify',      color: '#1db954' },
  you_tube:     { label: 'YouTube',      color: '#ff0000' },
  // The coverage feed sends the unsnaked spellings — `youtube`, `soundcloud`,
  // `x` — which missed every entry below and printed the raw key in lowercase
  // next to properly named platforms.
  youtube:      { label: 'YouTube',      color: '#ff0000' },
  soundcloud:   { label: 'SoundCloud',   color: '#ff5500' },
  x:            { label: 'X',            color: '#e7e9ea' },
  twitter:      { label: 'X',            color: '#e7e9ea' },
  last_fm:      { label: 'Last.fm',      color: '#d51007' },
  apple_music:  { label: 'Apple Music',  color: '#fa2d48' },
  applemusic:   { label: 'Apple Music',  color: '#fa2d48' },
  bandsintown:  { label: 'Bandsintown',  color: '#e6b04c' },
  social:       { label: 'Social',       color: '#ff4500' },
  meta:         { label: 'Meta',         color: '#0866ff' },
  tiktok:       { label: 'TikTok',       color: '#25f4ee' },
  tik_tok:      { label: 'TikTok',       color: '#25f4ee' },
  sound_cloud:  { label: 'SoundCloud',   color: '#ff5500' },
  instagram:    { label: 'Instagram',    color: '#e1306c' },
  facebook:     { label: 'Facebook',     color: '#0866ff' },
  discord:      { label: 'Discord',      color: '#5865f2' },
  telegram:     { label: 'Telegram',     color: '#26a5e4' },
  lastfm:       { label: 'Last.fm',      color: '#d51007' },
  deezer:       { label: 'Deezer',       color: '#a238ff' },
  discogs:      { label: 'Discogs',      color: '#333333' },
  bluesky:      { label: 'Bluesky',      color: '#0085ff' },
  bandcamp:     { label: 'Bandcamp',     color: '#629aa9' },
  signal:       { label: 'Signal',       color: '#9b87f5' },
  ticketing:    { label: 'Ticketing',    color: '#3ddc84' },
  merch:        { label: 'Merch',        color: '#f5b942' },
}

// An unknown key is still a name, so it is capitalised rather than printed as
// the storage token.
const platformLabel = (key: string) => PLATFORM_CONFIG[key]?.label
  ?? key.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
const platformColor = (key: string) => PLATFORM_CONFIG[key]?.color ?? '#9b87f5'

// ── Series label ───────────────────────────────────────────────────────
//
// The server pre-formats `display_name` as "<Platform> <what> — <subject>", and
// the row is already inside a section headed with that platform. So every line
// read "Bandcamp supporters — virya" under a "Bandcamp" heading, and a screenful
// of them was mostly the same nine words repeated down the left edge.
//
// Split it: what is counted carries the line, the subject follows in muted
// text, and the platform — already the heading — is dropped.

/** Entities survive the server's own formatting: a subreddit called
 *  "news, reviews, videos &amp; discussion" arrives with the entity intact and
 *  a text node renders it literally. */
const decodeEntities = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

/** Some subreddit names already carry their own `r/`, so the server's prefix
 *  produced `r//r/Metalcore`. */
const tidySubject = (value: string) => decodeEntities(value).replace(/^r\/+r\//, 'r/')

export function seriesLabel(trend: { platform: string; display_name: string }) {
  const full = decodeEntities(trend.display_name)
  const [metricPart, ...subjectParts] = full.split(' — ')
  const platform = platformLabel(trend.platform)
  // Strip the platform from the front of the metric, case-insensitively: the
  // heading above the row already says it.
  const metric = (metricPart ?? full)
    .replace(new RegExp(`^${platform.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i'), '')
    .trim()
  const subject = subjectParts.length > 0 ? tidySubject(subjectParts.join(' — ')) : undefined
  return { metric: metric || metricPart || full, subject }
}

// ── Movement bar ────────────────────────────────────────────────────────
//
// The bar here used to be length-proportional to the metric's own value,
// scaled against the largest value in its platform group. Those groups are not
// comparable quantities: Spotify reports followers in the tens of thousands and
// playlist adds in single digits, so the adds row drew a 2% stub next to a full
// bar, every time, whatever either number did. The bar encoded "is this the
// platform's biggest number", which is not a question anyone asks, and it
// encoded it about quantities that cannot be ranked against each other.
//
// What is comparable across every row on the screen is movement: a metric went
// up by some amount, or down, or did nothing. That is also the question the
// panel exists to answer. So the bar is zero-centred and scaled to the largest
// absolute change in the panel — right for growth, left for loss, and nothing
// at all for a series that did not move.
const MovementBar: Component<{ delta: number | null; max: number }> = (props) => {
  const half = () => {
    if (props.delta == null || props.delta === 0 || props.max <= 0) return 0
    // Floor at 2% so a real but tiny change stays visible as a mark.
    return Math.max(2, Math.min(50, (Math.abs(props.delta) / props.max) * 50))
  }
  const up = () => (props.delta ?? 0) > 0
  return (
    <div class="relative h-1.5 w-full min-w-16 rounded-sm bg-surface-1" aria-hidden="true">
      <div class="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
      <Show when={half() > 0}>
        <div
          class="absolute inset-y-0 rounded-sm transition-[width] duration-[400ms] ease-out"
          classList={{ 'bg-success': up(), 'bg-destructive': !up() }}
          style={up()
            ? { left: '50%', width: `${half()}%` }
            : { right: '50%', width: `${half()}%` }}
        />
      </Show>
    </div>
  )
}

/** The change a row reports, newest window first. */
const rowDelta = (trend: GrowthMetricTrendView) =>
  trend.delta_7d ?? trend.delta_24h ?? trend.delta_28d ?? null

export function GrowthMetricsPanel(props: { slug: string }) {
  const [expandedPlatforms, setExpandedPlatforms] = createSignal<Set<string>>(new Set())
  const MAX_VISIBLE_PLATFORM_BARS = 10
  const [showAllDownstream, setShowAllDownstream] = createSignal(false)
  const MAX_VISIBLE_DOWNSTREAM = 6

  const togglePlatform = (platform: string) => {
    setExpandedPlatforms((curr) => {
      const next = new Set(curr)
      if (next.has(platform)) next.delete(platform)
      else next.add(platform)
      return next
    })
  }

  const coverage = useQuery(() => ({
    queryKey: ['growth-metric-coverage', props.slug],
    queryFn: () => api.growthMetricCoverage(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const trends = useQuery(() => ({
    queryKey: ['growth-metric-trends', props.slug],
    queryFn: async () => {
      const data = await api.growthMetricTrends(props.slug)
      return data.series
    },
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  // A platform's coverage state, but only when it is worth saying. Fully live
  // is the expected case and needs no badge.
  const degradedCoverage = (platform: string) => {
    const entry = (coverage.data?.platforms ?? []).find(p => p.platform === platform)
    if (!entry || entry.state === 'live') return null
    return entry.state
  }

  // Platforms that report nothing have no section below, so they would vanish
  // from the panel entirely. They keep a chip.
  const unreportedPlatforms = createMemo(() =>
    (coverage.data?.platforms ?? []).filter(p => p.live_series === 0),
  )

  const totalSeries = () => (coverage.data?.platforms ?? []).reduce((sum, p) => sum + p.series, 0)
  const liveSeries = () => (coverage.data?.platforms ?? []).reduce((sum, p) => sum + p.live_series, 0)
  const hasFeeds = () => totalSeries() > 0
  const hasLive = () => liveSeries() > 0

  // Group trends by platform, split into upstream (intermediate/vanity) and downstream.
  // Deduplicate by (platform, display_name) — orphaned series from deleted
  // connections can produce duplicate bars with identical display names.
  // We keep the one with the most recent latest_at.
  const grouped = createMemo(() => {
    const all = trends.data ?? []
    // Deduplicate: group by (platform, display_name), keep most recent
    const dedup: Record<string, GrowthMetricTrendView> = {}
    for (const t of all) {
      if (t.value_tier === 'downstream') continue
      const key = `${t.platform}|${t.display_name}`
      const existing = dedup[key]
      if (!existing || t.latest_at > existing.latest_at) {
        dedup[key] = t
      }
    }
    const groups: Record<string, GrowthMetricTrendView[]> = {}
    const downstream: GrowthMetricTrendView[] = []
    for (const t of all) {
      if (t.value_tier === 'downstream') {
        downstream.push(t)
      }
    }
    for (const t of Object.values(dedup)) {
      const key = t.platform
      if (!groups[key]) groups[key] = []
      groups[key].push(t)
    }
    // Sort each group by value descending
    for (const key of Object.keys(groups)) {
      groups[key]!.sort((a, b) => b.latest_value - a.latest_value)
    }
    // Sort downstream by platform then value
    downstream.sort((a, b) => a.platform.localeCompare(b.platform) || b.latest_value - a.latest_value)
    return { groups, downstream }
  })

  // The largest absolute change anywhere in the panel. Every movement bar is
  // drawn against this one number, so a bar in the Spotify group means the same
  // thing as a bar in the Reddit group. Zero means nothing moved, and the
  // column is dropped rather than drawn empty for every row.
  const movementScale = createMemo(() => {
    let max = 0
    for (const items of Object.values(grouped().groups)) {
      for (const trend of items) {
        const delta = rowDelta(trend)
        if (delta != null) max = Math.max(max, Math.abs(delta))
      }
    }
    return max
  })

  // Group downstream by platform
  const downstreamGrouped = createMemo(() => {
    const groups: Record<string, GrowthMetricTrendView[]> = {}
    for (const t of grouped().downstream) {
      const key = t.platform
      if (!groups[key]) groups[key] = []
      groups[key].push(t)
    }
    return groups
  })

  return <Card flat class="p-4">
    <div class="flex items-center justify-between gap-4">
      <h3 class="text-sm font-semibold text-foreground">Growth metrics</h3>
      <Show when={coverage.data && hasFeeds()}>
        <span class="text-sm text-muted-foreground tabular-nums">
          {liveSeries()}{liveSeries() === totalSeries() ? '' : ` / ${totalSeries()}`} feeds live
        </span>
      </Show>
    </div>

    <Show when={coverage.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Growth coverage unavailable: {errorMessage(coverage.error, 'We couldn\'t reach the growth coverage data. Try refreshing.')}</div></Show>
    <Show
      when={coverage.data && hasFeeds()}
      fallback={
        <Show when={coverage.isFetching} fallback={
          <Show when={coverage.data} fallback={
            <EmptyState
              icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18" /><path d="M7 14l4-4 4 4 6-6" /></svg>}
              label="No metric feeds connected"
              hint="Connect Spotify, YouTube, Bandsintown, or social feeds to start tracking growth trends. The intelligence needs metric data to measure whether actions are moving the needle."
            />
          }>
            <SkeletonRows count={4} />
          </Show>
        }>
          <SkeletonBlock height="80px" radius="10px" />
          <SkeletonRows count={3} />
        </Show>
      }
    >
      {/* The coverage grid used to live here: one chip per platform, carrying a
          state badge and an `n/n` count, directly above a list of sections
          headed by those same platforms. Every platform on the screen twice,
          and the healthy ones — which is most of them — said only that they
          were healthy.

          A platform whose feeds are all live needs no chip. One whose feeds are
          stale or missing is worth flagging, and the flag belongs on its own
          section heading, next to the rows it explains. Platforms reporting
          nothing at all have no section, so those keep a chip. */}
      <Show when={trends.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Growth trends unavailable: {errorMessage(trends.error, 'We couldn\'t reach the growth trends. Try refreshing.')}</div></Show>
      <Show when={trends.data && trends.data!.length > 0} fallback={
        <Show when={trends.isFetching} fallback={
          <Show when={hasLive()} fallback={<EmptyState label="No live feeds yet" hint="Trends appear once data starts flowing." />}>
            <EmptyState label="No growth metric trends available" hint="Trends require at least one live data feed. Connect a source (Reddit, Spotify, Meta) to start collecting metric series." />
          </Show>
        }>
          <div class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            <SkeletonBlock height="120px" radius="10px" />
            <SkeletonBlock height="120px" radius="10px" />
            <SkeletonBlock height="120px" radius="10px" />
          </div>
        </Show>
      }>
        {/* ── One table, grouped by platform ──
            Each platform used to draw its own two-column grid with its own
            column widths, so no value on the screen lined up with any other
            value and the panel read as nine small charts rather than as one
            list of metrics. This is a single grid: platform names are group
            rows inside it, and every number sits in the same column as every
            other number. */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead class="text-right">Now</TableHead>
              <TableHead class="text-right">Change</TableHead>
              <Show when={movementScale() > 0}>
                <TableHead class="w-[28%]">Movement</TableHead>
              </Show>
            </TableRow>
          </TableHeader>
          <TableBody>
            <For each={Object.entries(grouped().groups).sort((a, b) => platformLabel(a[0]).localeCompare(platformLabel(b[0])))}>
              {([platform, items]) => {
                const color = platformColor(platform)
                const visible = () => expandedPlatforms().has(platform) ? items : items.slice(0, MAX_VISIBLE_PLATFORM_BARS)
                return <>
                  <TableRow class="hover:bg-transparent">
                    <TableCell colSpan={movementScale() > 0 ? 4 : 3} class="whitespace-normal pt-4">
                      <span class="flex items-center gap-2">
                        <span class="h-2 w-2 shrink-0 rounded-full opacity-90" style={{ background: color, 'box-shadow': `0 0 6px ${color}` }} />
                        <strong class="text-sm font-semibold text-foreground">{platformLabel(platform)}</strong>
                        {/* "1 series" above a single row is a caption counting
                            to one. The count appears when counting is worth
                            doing. */}
                        <Show when={items.length > 1}>
                          <span class="text-xs tabular-nums text-muted-foreground">{items.length}</span>
                        </Show>
                        <Show when={degradedCoverage(platform)}>
                          {state => <Badge variant={feedStateVariant(state())}>{feedStateLabel(state())}</Badge>}
                        </Show>
                      </span>
                    </TableCell>
                  </TableRow>
                  <For each={visible()}>{(trend: GrowthMetricTrendView) => {
                    const delta = () => rowDelta(trend)
                    const dir = () => trendDirection(delta())
                    return (
                      <TableRow>
                        <TableCell class="pl-6" title={trend.display_name}>
                          <span class="flex items-baseline gap-1.5 overflow-hidden">
                            <span class="text-secondary-foreground">{seriesLabel(trend).metric}</span>
                            <Show when={seriesLabel(trend).subject}>
                              <span class="overflow-hidden text-ellipsis text-xs text-muted-foreground">{seriesLabel(trend).subject}</span>
                            </Show>
                          </span>
                        </TableCell>
                        <TableCell numeric class="font-semibold">{compactNumber(trend.latest_value)}</TableCell>
                        {/* A column of "0" down the right edge is a column of
                            nothing happening. A change is worth a glyph; no
                            change is worth the space it frees. */}
                        <TableCell numeric classList={{ 'text-success': dir() === 'up', 'text-destructive': dir() === 'down' }}>
                          <Show when={delta() != null && delta() !== 0} fallback={<span class="text-muted-foreground">—</span>}>
                            {delta()! > 0 ? '+' : ''}{compactNumber(delta()!)}
                          </Show>
                        </TableCell>
                        <Show when={movementScale() > 0}>
                          <TableCell><MovementBar delta={delta()} max={movementScale()} /></TableCell>
                        </Show>
                      </TableRow>
                    )
                  }}</For>
                  <Show when={items.length > MAX_VISIBLE_PLATFORM_BARS}>
                    <TableRow class="hover:bg-transparent">
                      <TableCell colSpan={movementScale() > 0 ? 4 : 3} class="pl-6">
                        <Button variant="ghost" size="sm" onClick={() => togglePlatform(platform)}>
                          {expandedPlatforms().has(platform) ? 'Show fewer' : `Show all ${items.length}`}
                        </Button>
                      </TableCell>
                    </TableRow>
                  </Show>
                </>
              }}
            </For>
          </TableBody>
        </Table>
        <Show when={movementScale() === 0}>
          <p class="mt-2 text-xs text-muted-foreground">
            No series has moved in the reported window, so there is no movement to chart.
          </p>
        </Show>

        {/* ── Conversion (downstream) section ── */}
        <Show when={grouped().downstream.length > 0}>
          <div class="mt-6 pt-4 border-t border-border">
            <div class="flex items-center gap-2 mb-2">
              <strong class="text-base font-bold text-foreground">Conversion</strong>
              <span class="text-sm text-muted-foreground">{grouped().downstream.length} metrics</span>
            </div>
            <div class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              <For each={showAllDownstream() ? grouped().downstream : grouped().downstream.slice(0, MAX_VISIBLE_DOWNSTREAM)}>{(trend: GrowthMetricTrendView) => {
                const delta = trend.delta_7d ?? trend.delta_24h ?? trend.delta_28d
                const dir = trendDirection(delta)
                const sparkData = () => {
                  const v = trend.latest_value
                  const d28 = trend.delta_28d != null ? v - trend.delta_28d : v
                  const d7 = trend.delta_7d != null ? v - trend.delta_7d : d28
                  const d24 = trend.delta_24h != null ? v - trend.delta_24h : d7
                  return [d28, d7, d24, v].map(n => Math.max(0, n))
                }
                const sparkColor = dir === 'up' ? 'var(--color-success)' : dir === 'down' ? 'var(--color-destructive)' : 'var(--color-muted-foreground)'
                return (
                  <div class="bg-surface-3 border border-border-subtle rounded-lg p-3.5 flex flex-col gap-1">
                    <div class="flex justify-between items-center">
                      <span class="text-sm text-muted-foreground uppercase tracking-wide">{trend.display_name}</span>
                      <span classList={{ 'text-success': dir === 'up', 'text-destructive': dir === 'down', 'text-muted-foreground': dir === 'flat' || dir === 'unknown' }}>{trendArrow(dir)}</span>
                    </div>
                    <span class="text-xl font-bold text-foreground">{compactNumber(trend.latest_value)}</span>
                    <Show when={sparkData().some((n, i) => i > 0 && n !== sparkData()[0])}>
                      <div class="my-1.5 h-7 opacity-85">
                        <Sparkline data={sparkData()} width={120} height={28} color={sparkColor} />
                      </div>
                    </Show>
                    <span class="text-sm text-muted-foreground">
                      {delta != null ? `${delta > 0 ? '+' : ''}${compactNumber(delta)} (7d)` : 'no prior'}
                      {trend.stale ? ' · stale' : ''}
                    </span>
                    <span class="text-xs text-muted-foreground mt-0.5">{platformLabel(trend.platform)}</span>
                  </div>
                )
              }}</For>
            </div>
            <Show when={grouped().downstream.length > MAX_VISIBLE_DOWNSTREAM}>
              <Button variant="ghost" size="sm" onClick={() => setShowAllDownstream(s => !s)}>
                {showAllDownstream() ? 'Show less' : `Show all (${grouped().downstream.length})`}
              </Button>
            </Show>
          </div>
        </Show>
      </Show>
    </Show>
  </Card>
}
