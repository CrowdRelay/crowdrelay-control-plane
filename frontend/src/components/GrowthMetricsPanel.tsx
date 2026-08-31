import { For, Show, createResource } from 'solid-js'
import { api } from '../lib/api'
import { refreshTick } from '../lib/refresh'
import { compactNumber, trendArrow, trendDirection } from '../lib/charts'
import { Sparkline } from './Sparkline'
import { EmptyState } from './EmptyState'
import { SkeletonBlock, SkeletonRows } from './Skeleton'
import type { FeedCoverage, GrowthMetricTrendView } from '../lib/types'

const feedStateLabel = (state: string): string =>
  state === 'live' ? 'Live' : state === 'stale' ? 'Stale' : 'Missing'

const feedStateTone = (state: string): 'good' | 'warn' | 'bad' =>
  state === 'live' ? 'good' : state === 'stale' ? 'warn' : 'bad'

const PLATFORM_LABELS: Record<string, string> = {
  spotify: 'Spotify',
  you_tube: 'YouTube',
  bandsintown: 'Bandsintown',
  social: 'Social',
  meta: 'Meta',
  tiktok: 'TikTok',
}

const platformLabel = (key: string) => PLATFORM_LABELS[key] ?? key.replace(/_/g, ' ')

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

  return <div class="agent-section">
    <div class="agent-section-head">
      <h3>Growth Metrics</h3>
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
          <Show when={hasLive()} fallback={<p class="muted">No live feeds yet — trends appear once data starts flowing.</p>}>
            <p class="muted">No growth metric trends available.</p>
          </Show>
        }>
          <div class="growth-metrics-grid">
            <SkeletonBlock height="120px" radius="10px" />
            <SkeletonBlock height="120px" radius="10px" />
            <SkeletonBlock height="120px" radius="10px" />
          </div>
        </Show>
      }>
        <div class="growth-metrics-grid">
          <For each={trends()}>{(trend: GrowthMetricTrendView) => {
            const delta = trend.delta_7d ?? trend.delta_24h ?? trend.delta_28d
            const dir = trendDirection(delta)
            const ratioPct = trend.velocity_ratio_basis_points != null
              ? Math.round(trend.velocity_ratio_basis_points / 100)
              : null
            // Build a synthetic sparkline from available deltas:
            // 28d ago → 7d ago → 24h ago → now
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
                  {ratioPct != null ? ` · ${ratioPct > 0 ? '+' : ''}${ratioPct}% vs baseline` : ''}
                  {trend.stale ? ' · stale' : ''}
                </span>
                <span class="muted trend-platform">{trend.platform} · {trend.value_tier}</span>
              </div>
            )
          }}</For>
        </div>
      </Show>
    </Show>
  </div>
}
