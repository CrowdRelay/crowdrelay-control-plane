import { For, Show, createMemo, createResource, type Component } from 'solid-js'
import { api } from '../lib/api'
import { refreshTick } from '../lib/refresh'
import { compactNumber, trendArrow, trendDirection } from '../lib/charts'
import { Sparkline } from './Sparkline'
import { EmptyState } from './EmptyState'
import { SkeletonBlock, SkeletonRows } from '../components/Skeleton'
import type { FeedCoverage, GrowthMetricTrendView } from '../lib/types'

const feedStateLabel = (state: string): string =>
  state === 'live' ? 'Live' : state === 'stale' ? 'Stale' : 'Missing'

const feedStateTone = (state: string): 'good' | 'warn' | 'bad' =>
  state === 'live' ? 'good' : state === 'stale' ? 'warn' : 'bad'

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
    <div class="gm-bar-track" title={compactNumber(props.value)}>
      <div class="gm-bar-fill" style={{ width: `${pct()}%`, background: props.color }} />
    </div>
  )
}

export function GrowthMetricsPanel(props: { slug: string }) {
  const refreshSource = () => refreshTick()

  const [coverage] = createResource(refreshSource, async () => {
    try {
      return await api.growthMetricCoverage(props.slug)
    } catch {
      return null
    }
  })

  const [trends] = createResource(refreshSource, async () => {
    try {
      const data = await api.growthMetricTrends(props.slug)
      return data.series
    } catch {
      return null
    }
  })

  const totalSeries = () => (coverage()?.platforms ?? []).reduce((sum, p) => sum + p.series, 0)
  const liveSeries = () => (coverage()?.platforms ?? []).reduce((sum, p) => sum + p.live_series, 0)
  const hasFeeds = () => totalSeries() > 0
  const hasLive = () => liveSeries() > 0

  // Group trends by platform, split into upstream (intermediate/vanity) and downstream.
  // Deduplicate by (platform, display_name) — orphaned series from deleted
  // connections can produce duplicate bars with identical display names.
  // We keep the one with the most recent latest_at.
  const grouped = createMemo(() => {
    const all = trends() ?? []
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

  return <div class="agent-section">
    <div class="agent-section-head">
      <h3>Growth metrics</h3>
      <Show when={coverage() && hasFeeds()}>
        <span class="muted">{liveSeries()} active series</span>
      </Show>
    </div>

    <Show
      when={coverage() && hasFeeds()}
      fallback={
        <Show when={coverage.loading} fallback={
          <Show when={coverage()} fallback={
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
      <div class="coverage-bar-wrap">
        <div class="objective-card-head">
          <span class="trend-card-label">Feed coverage</span>
          <strong>{liveSeries()} / {totalSeries()} series live</strong>
        </div>
        <div class="feed-coverage-list">
          <For each={coverage()!.platforms}>{(platform: FeedCoverage) => (
            <div class="feed-coverage-row" classList={{ 'feed-coverage-row--missing': platform.state === 'missing' }}>
              <span class="feed-platform-name">{platformLabel(platform.platform)}</span>
              <span class={`badge tone-${feedStateTone(platform.state)}`}>{feedStateLabel(platform.state)}</span>
              <span class="feed-platform-series">{platform.live_series}/{platform.series} series</span>
            </div>
          )}</For>
        </div>
      </div>

      <Show when={trends() && trends()!.length > 0} fallback={
        <Show when={trends.loading} fallback={
          <Show when={hasLive()} fallback={<EmptyState label="No live feeds yet" hint="Trends appear once data starts flowing." />}>
            <EmptyState label="No growth metric trends available" />
          </Show>
        }>
          <div class="growth-metrics-grid">
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
              <div class="gm-platform-section">
                <div class="gm-platform-head">
                  <span class="gm-platform-dot" style={{ background: color }} />
                  <strong>{platformLabel(platform)}</strong>
                  <span class="muted">{items.length} series</span>
                </div>
                <div class="gm-bar-list">
                  <For each={items}>{(trend: GrowthMetricTrendView) => {
                    const delta = trend.delta_7d ?? trend.delta_24h ?? trend.delta_28d
                    const dir = trendDirection(delta)
                    return (
                      <div class="gm-bar-row" title={trend.display_name}>
                        <span class="gm-bar-label">{trend.display_name}</span>
                        <Bar value={trend.latest_value} max={max()} color={color} />
                        <span class="gm-bar-value">{compactNumber(trend.latest_value)}</span>
                        <Show when={delta != null}>
                          <span class={`gm-bar-delta ${dir}`}>{delta! > 0 ? '+' : ''}{compactNumber(delta!)}</span>
                        </Show>
                      </div>
                    )
                  }}</For>
                </div>
              </div>
            )
          }}
        </For>

        {/* ── Conversion (downstream) section ── */}
        <Show when={grouped().downstream.length > 0}>
          <div class="gm-conversion-section">
            <div class="gm-platform-head">
              <strong>Conversion</strong>
              <span class="muted">{grouped().downstream.length} metrics</span>
            </div>
            <div class="growth-metrics-grid">
              <For each={grouped().downstream}>{(trend: GrowthMetricTrendView) => {
                const delta = trend.delta_7d ?? trend.delta_24h ?? trend.delta_28d
                const dir = trendDirection(delta)
                const sparkData = () => {
                  const v = trend.latest_value
                  const d28 = trend.delta_28d != null ? v - trend.delta_28d : v
                  const d7 = trend.delta_7d != null ? v - trend.delta_7d : d28
                  const d24 = trend.delta_24h != null ? v - trend.delta_24h : d7
                  return [d28, d7, d24, v].map(n => Math.max(0, n))
                }
                const sparkColor = dir === 'up' ? 'var(--good)' : dir === 'down' ? 'var(--bad)' : 'var(--muted)'
                return (
                  <div class="trend-card">
                    <div class="trend-card-head">
                      <span class="trend-card-label">{trend.display_name}</span>
                      <span class={`trend-arrow ${dir}`}>{trendArrow(dir)}</span>
                    </div>
                    <span class="trend-card-value">{compactNumber(trend.latest_value)}</span>
                    <Show when={sparkData().some((n, i) => i > 0 && n !== sparkData()[0])}>
                      <div class="trend-card-spark">
                        <Sparkline data={sparkData()} width={120} height={28} color={sparkColor} />
                      </div>
                    </Show>
                    <span class="trend-delta">
                      {delta != null ? `${delta > 0 ? '+' : ''}${compactNumber(delta)} (7d)` : 'no prior'}
                      {trend.stale ? ' · stale' : ''}
                    </span>
                    <span class="muted trend-platform">{platformLabel(trend.platform)}</span>
                  </div>
                )
              }}</For>
            </div>
          </div>
        </Show>
      </Show>
    </Show>
  </div>
}
