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

// ── Horizontal bar — scaled relative to the max value in the group ──
const Bar: Component<{ value: number; max: number; color: string }> = (props) => {
  const pct = () => Math.max(2, Math.min(100, (props.value / props.max) * 100))
  return (
    <div class="h-1.5 bg-surface-1 rounded-sm overflow-hidden" title={compactNumber(props.value)}>
      <div class="h-full rounded-sm transition-[width] duration-[400ms] ease-out" style={{ width: `${pct()}%`, background: props.color }} />
    </div>
  )
}

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
      <Show when={unreportedPlatforms().length > 0}>
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <span class="text-sm text-muted-foreground">No data from</span>
          <For each={unreportedPlatforms()}>{(platform: FeedCoverage) => (
            <Badge variant={feedStateVariant(platform.state)}>{platformLabel(platform.platform)}</Badge>
          )}</For>
        </div>
      </Show>

      <Show when={trends.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Growth trends unavailable: {errorMessage(trends.error, 'We couldn\'t reach the growth trends. Try refreshing.')}</div></Show>
      <Show when={trends.data && trends.data!.length > 0} fallback={
        <Show when={trends.isFetching} fallback={
          <Show when={hasLive()} fallback={<EmptyState label="No live feeds yet" hint="Trends appear once data starts flowing." />}>
            <EmptyState label="No growth metric trends available" hint="Trends require at least one live data feed. Connect a source (Reddit, Spotify, Meta) to start collecting metric series." />
          </Show>
        }>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SkeletonBlock height="120px" radius="10px" />
            <SkeletonBlock height="120px" radius="10px" />
            <SkeletonBlock height="120px" radius="10px" />
          </div>
        </Show>
      }>
        {/* ── Platform sections with bar charts ── */}
        <For each={Object.entries(grouped().groups).sort((a, b) => platformLabel(a[0]).localeCompare(platformLabel(b[0])))}>
          {([platform, items]) => {
            const max = () => Math.max(...items.map(t => t.latest_value), 1)
            const color = platformColor(platform)
            return (
              <div class="mb-4">
                {/* "1 series" under a heading with one row beneath it is a
                    caption counting to one. The count appears when counting
                    is worth doing. */}
                <div class="flex items-center gap-2 mb-2">
                  <span class="w-2 h-2 rounded-full shrink-0 opacity-90" style={{ background: color, 'box-shadow': `0 0 6px ${color}` }} />
                  <strong class="text-sm font-semibold text-foreground">{platformLabel(platform)}</strong>
                  <Show when={items.length > 1}>
                    <span class="text-xs text-muted-foreground tabular-nums">{items.length}</span>
                  </Show>
                  <Show when={degradedCoverage(platform)}>
                    {state => <Badge variant={feedStateVariant(state())}>{feedStateLabel(state())}</Badge>}
                  </Show>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5">
                  <For each={expandedPlatforms().has(platform) ? items : items.slice(0, MAX_VISIBLE_PLATFORM_BARS)}>{(trend: GrowthMetricTrendView) => {
                    const delta = trend.delta_7d ?? trend.delta_24h ?? trend.delta_28d
                    const dir = trendDirection(delta)
                    return (
                      <div class="flex items-center gap-2 min-w-0" title={trend.display_name}>
                        <span class="flex min-w-0 shrink-0 basis-[42%] items-baseline gap-1.5 overflow-hidden whitespace-nowrap text-ellipsis">
                          <span class="text-sm text-secondary-foreground">{seriesLabel(trend).metric}</span>
                          <Show when={seriesLabel(trend).subject}>
                            <span class="overflow-hidden text-ellipsis text-xs text-muted-foreground">{seriesLabel(trend).subject}</span>
                          </Show>
                        </span>
                        <div class="flex-1 min-w-0"><Bar value={trend.latest_value} max={max()} color={color} /></div>
                        <span class="text-sm font-semibold text-foreground whitespace-nowrap text-right shrink-0 tabular-nums">{compactNumber(trend.latest_value)}</span>
                        {/* A column of "0" down the right edge is a column of
                            nothing happening. A change is worth a glyph; no
                            change is worth the space it frees. */}
                        <span class="w-10 shrink-0 text-right text-sm font-medium tabular-nums" classList={{ 'text-success': dir === 'up', 'text-destructive': dir === 'down' }}>
                          <Show when={delta != null && delta !== 0}>{delta! > 0 ? '+' : ''}{compactNumber(delta!)}</Show>
                        </span>
                      </div>
                    )
                  }}</For>
                </div>
                <Show when={items.length > MAX_VISIBLE_PLATFORM_BARS}>
                  <Button variant="ghost" size="sm" onClick={() => togglePlatform(platform)}>
                    {expandedPlatforms().has(platform) ? 'Show less' : `Show all (${items.length})`}
                  </Button>
                </Show>
              </div>
            )
          }}
        </For>

        {/* ── Conversion (downstream) section ── */}
        <Show when={grouped().downstream.length > 0}>
          <div class="mt-6 pt-4 border-t border-border">
            <div class="flex items-center gap-2 mb-2">
              <strong class="text-base font-bold text-foreground">Conversion</strong>
              <span class="text-sm text-muted-foreground">{grouped().downstream.length} metrics</span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
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
