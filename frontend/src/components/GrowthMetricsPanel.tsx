import { For, Show, createResource } from 'solid-js'
import { api } from '../lib/api'
import { refreshTick } from '../lib/refresh'
import { compactNumber, trendArrow, trendDirection } from '../lib/charts'
import type { FeedCoverage, GrowthMetricTrendView } from '../lib/types'

const feedStateLabel = (state: string): string =>
  state === 'live' ? 'Live' : state === 'stale' ? 'Stale' : 'Missing'

const feedStateTone = (state: string): 'good' | 'warn' | 'bad' =>
  state === 'live' ? 'good' : state === 'stale' ? 'warn' : 'bad'

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

  return <div class="agent-section">
    <div class="agent-section-head">
      <h3>Growth Metrics</h3>
      <Show when={coverage()}>
        <span class="muted">{liveSeries()} active series</span>
      </Show>
    </div>
    <p class="agent-section-intro">Growth metric trends from all platforms — Spotify, Meta, Bandsintown, and more. Coverage shows which feeds are connected and live.</p>

    <Show when={coverage() ?? undefined} fallback={<p class="muted">Growth metric coverage not available.</p>}>
      {(cov) => (
        <div class="coverage-bar-wrap">
          <div class="objective-card-head">
            <span class="trend-card-label">Feed coverage</span>
            <strong>{liveSeries()} / {totalSeries()} series live</strong>
          </div>
          <div class="feed-coverage-list">
            <For each={cov()?.platforms ?? []}>{(platform: FeedCoverage) => (
              <div class="feed-coverage-row">
                <span class="feed-platform-name">{platform.platform}</span>
                <span class={`badge tone-${feedStateTone(platform.state)}`}>{feedStateLabel(platform.state)}</span>
                <span class="muted">{platform.live_series}/{platform.series} series</span>
              </div>
            )}</For>
          </div>
        </div>
      )}
    </Show>

    <Show when={trends() && trends()!.length > 0} fallback={<p class="muted">No growth metric trends available.</p>}>
      <div class="growth-metrics-grid">
        <For each={trends()}>{(trend: GrowthMetricTrendView) => {
          const delta = trend.delta_7d ?? trend.delta_24h ?? trend.delta_28d
          const dir = trendDirection(delta)
          const ratioPct = trend.velocity_ratio_basis_points != null
            ? Math.round(trend.velocity_ratio_basis_points / 100)
            : null
          return (
            <div class="trend-card">
              <div class="trend-card-head">
                <span class="trend-card-label">{trend.display_name}</span>
                <span class={`trend-arrow ${dir}`}>{trendArrow(dir)}</span>
              </div>
              <span class="trend-card-value">{compactNumber(trend.latest_value)}</span>
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
  </div>
}
