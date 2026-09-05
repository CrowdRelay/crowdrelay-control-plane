import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { refreshTick } from '../lib/refresh'
import { SectionIcon } from './SectionIcon'
import { EmptyState } from './EmptyState'
import { SkeletonSection } from './Skeleton'
import type { ChannelPerformance } from '../lib/types'

// `/operations/acquisition-channels` answers the question the north star
// depends on — where did the fans come from, and did they stick — and had no
// screen. The unattributed rows carry their own remedy, which is the part
// worth surfacing: they say what to instrument, not just that data is missing.

const pct = (basisPoints: number | null) =>
  basisPoints == null ? '—' : `${(basisPoints / 100).toFixed(1)}%`

const channelName = (channel: ChannelPerformance) =>
  channel.attribution.evidence === 'attributed'
    ? channel.attribution.source.replace(/_/g, ' ')
    : 'Unattributed'

const channelDetail = (channel: ChannelPerformance) => {
  if (channel.attribution.evidence !== 'attributed') return channel.attribution.reason.replace(/_/g, ' ')
  const parts = [channel.attribution.community, channel.attribution.creative].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'no community or creative recorded'
}

export function AcquisitionChannelsPanel(props: { slug: string }) {
  const model = useQuery(() => ({
    queryKey: ['acquisition-channels', props.slug, refreshTick()],
    queryFn: () => api.acquisitionChannels(props.slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  const d = () => model.data
  const best = () => {
    const channels = d()?.channels ?? []
    if (channels.length === 0) return 0
    return Math.max(...channels.map(c => c.signups))
  }

  return <article class="panel acquisition-panel">
    <div class="section-title">
      <div>
        <span class="eyebrow">ACQUISITION</span>
        <h2><SectionIcon name="users" />Where the fans came from</h2>
        <p>Signups by the channel that produced them, and how many of those were still active 30 days later. A channel that brings people who never come back is not working, however big the first number is.</p>
      </div>
    </div>

    <Show when={model.error}>
      <div class="inherit-card"><p>Acquisition attribution is not available on the connected CrowdRelay build. The funnel below still reports totals.</p></div>
    </Show>

    <Show when={!model.error && model.isPending}><SkeletonSection titleWidth="200px" lines={4} minHeight="160px" /></Show>

    <Show when={d()}>{data => <>
      <div class="acq-kpis">
        <div class="acq-kpi"><span>Signups</span><strong>{data().total_signups.toLocaleString()}</strong></div>
        <div class="acq-kpi"><span>Activated · 30d</span><strong>{data().total_activated_30d.toLocaleString()}</strong></div>
        <div class="acq-kpi"><span>Active · 30d</span><strong>{data().active_30d.toLocaleString()}</strong></div>
        <div class="acq-kpi"><span>Retained · 30d</span><strong>{data().retained_30d.toLocaleString()}</strong></div>
        <div class="acq-kpi"><span>Reachable</span><strong>{data().reachable_consented.toLocaleString()}</strong><small>consented to be contacted</small></div>
      </div>

      <Show
        when={data().channels.length > 0}
        fallback={<EmptyState
          label="No attributed signups yet"
          hint="A channel appears here once a fan arrives carrying its attribution — a tracked link, a community post, or a campaign creative. Until then the funnel counts them, but cannot say who sent them."
        />}
      >
        <ul class="acq-list">
          <For each={data().channels}>{channel => (
            <li class="acq-row" classList={{ 'acq-row-unattributed': channel.attribution.evidence !== 'attributed' }}>
              <div class="acq-row-name">
                <strong>{channelName(channel)}</strong>
                <small>{channelDetail(channel)}</small>
              </div>
              <div class="acq-bar-wrap" aria-hidden="true">
                <span class="acq-bar" style={{ width: `${best() > 0 ? (channel.signups / best()) * 100 : 0}%` }} />
              </div>
              <div class="acq-row-numbers">
                <span><strong>{channel.signups.toLocaleString()}</strong> signups</span>
                <span><strong>{channel.activated_30d.toLocaleString()}</strong> activated</span>
                <span class="acq-rate">{pct(channel.activation_basis_points)} activation</span>
              </div>
              <Show when={channel.best_action}>
                <p class="acq-best-action">{channel.best_action}</p>
              </Show>
            </li>
          )}</For>
        </ul>
      </Show>

      <Show when={data().unattributed.length > 0}>
        <section class="acq-unattributed">
          <h3>Signups the system could not attribute</h3>
          <p class="acq-block-intro">Each row says what to instrument so the next batch lands in a channel above.</p>
          <ul class="cos-risk-list">
            <For each={data().unattributed}>{item => (
              <li>
                <div>
                  <strong>{item.reason.replace(/_/g, ' ')}</strong>
                  <small>{item.remedy}</small>
                </div>
                <div class="row-health">
                  <span class="badge">{item.signups.toLocaleString()} signups</span>
                  <span class="badge">{item.activated_30d.toLocaleString()} activated</span>
                </div>
              </li>
            )}</For>
          </ul>
        </section>
      </Show>
    </>}</Show>
  </article>
}
