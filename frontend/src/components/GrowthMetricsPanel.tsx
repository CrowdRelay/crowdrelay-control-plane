import { For, Show, createMemo, createSignal, type Component } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { compactNumber, trendArrow, trendDirection } from '../lib/charts'
import { Sparkline } from './Sparkline'
import { EmptyState } from './EmptyState'
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
  const [showAllCoverage, setShowAllCoverage] = createSignal(false)
  const MAX_VISIBLE_COVERAGE = 10
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

  return <Card class="p-4">
    <div class="flex items-center justify-between gap-4">
      <h3 class="text-sm font-semibold text-foreground">Growth metrics</h3>
      <Show when={coverage.data && hasFeeds()}>
        <span class="text-muted-foreground">{liveSeries()} active series</span>
      </Show>
    </div>

    <Show when={coverage.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Growth coverage unavailable: {errorMessage(coverage.error, 'Service unreachable')}</div></Show>
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
      {/* Feed coverage */}
      <div class="mb-4">
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm text-muted-foreground uppercase tracking-wide">Feed coverage</span>
          <strong class="text-foreground">{liveSeries()} / {totalSeries()} series live</strong>
        </div>
        <div class="flex flex-col mt-2 border border-border-subtle rounded-md overflow-hidden">
          <For each={showAllCoverage() ? coverage.data!.platforms : coverage.data!.platforms.slice(0, MAX_VISIBLE_COVERAGE)}>{(platform: FeedCoverage) => (
            <div class="flex items-center gap-3 px-3 py-2 border-b border-border-subtle min-h-9 last:border-b-0" classList={{ 'opacity-60': platform.state === 'missing' }}>
              <span class="text-sm font-semibold text-secondary-foreground min-w-[90px]">{platformLabel(platform.platform)}</span>
              <Badge variant={feedStateVariant(platform.state)}>{feedStateLabel(platform.state)}</Badge>
              <span class="ml-auto text-xs text-muted-foreground tabular-nums">{platform.live_series}/{platform.series} series</span>
            </div>
          )}</For>
        </div>
        <Show when={coverage.data!.platforms.length > MAX_VISIBLE_COVERAGE}>
          <Button variant="ghost" size="sm" onClick={() => setShowAllCoverage(s => !s)}>
            {showAllCoverage() ? 'Show less' : `Show all (${coverage.data!.platforms.length})`}
          </Button>
        </Show>
      </div>

      <Show when={trends.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Growth trends unavailable: {errorMessage(trends.error, 'Service unreachable')}</div></Show>
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
                <div class="flex items-center gap-2 mb-2">
                  <span class="w-2 h-2 rounded-full shrink-0 opacity-90" style={{ background: color, 'box-shadow': `0 0 6px ${color}` }} />
                  <strong class="text-base font-bold text-foreground">{platformLabel(platform)}</strong>
                  <span class="text-sm text-muted-foreground">{items.length} series</span>
                </div>
                <div class="grid gap-1.5" style={{ 'grid-template-columns': 'minmax(120px,1.2fr) minmax(60px,2fr) 4.5rem 3.25rem' }}>
                  <For each={expandedPlatforms().has(platform) ? items : items.slice(0, MAX_VISIBLE_PLATFORM_BARS)}>{(trend: GrowthMetricTrendView) => {
                    const delta = trend.delta_7d ?? trend.delta_24h ?? trend.delta_28d
                    const dir = trendDirection(delta)
                    return (
                      <div class="contents" title={trend.display_name}>
                        <span class="text-sm text-secondary-foreground whitespace-nowrap overflow-hidden text-ellipsis cursor-help">{trend.display_name}</span>
                        <Bar value={trend.latest_value} max={max()} color={color} />
                        <span class="text-base font-semibold text-foreground whitespace-nowrap text-right">{compactNumber(trend.latest_value)}</span>
                        <Show when={delta != null}>
                          <span class="text-sm font-medium text-right" classList={{ 'text-success': dir === 'up', 'text-destructive': dir === 'down', 'text-muted-foreground': dir === 'flat' || dir === 'unknown' }}>{delta! > 0 ? '+' : ''}{compactNumber(delta!)}</span>
                        </Show>
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
          <div class="mt-6 pt-6 border-t border-border">
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
                  <div class="bg-surface-3 border border-border-subtle rounded-md p-3.5 flex flex-col gap-1">
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
