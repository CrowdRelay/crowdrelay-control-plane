import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { SectionIcon } from './SectionIcon'
import { EmptyState } from './ui/empty-state'
import { SkeletonSection } from './Skeleton'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
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
    queryKey: ['acquisition-channels', props.slug],
    queryFn: () => api.acquisitionChannels(props.slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  const d = () => model.data
  const [showAllChannels, setShowAllChannels] = createSignal(false)
  const MAX_VISIBLE_CHANNELS = 10
  const [showAllUnattributed, setShowAllUnattributed] = createSignal(false)
  const MAX_VISIBLE_UNATTRIBUTED = 10
  const best = () => {
    const channels = d()?.channels ?? []
    if (channels.length === 0) return 0
    return Math.max(...channels.map(c => c.signups))
  }

  return <Card flat class="p-5">
    <div class="flex items-start justify-between gap-4 mt-6 mb-3">
      <div>
        <h2 class="text-lg font-bold text-foreground flex items-center gap-2"><SectionIcon name="users" />Where the fans came from</h2>
        <p class="mt-1 text-sm text-muted-foreground leading-relaxed">Signups by the channel that produced them, and how many of those were still active 30 days later. A channel that brings people who never come back is not working, however big the first number is.</p>
      </div>
    </div>

    <Show when={model.error}>
      <div class="p-4 mt-2.5 rounded-lg border border-border bg-surface-1"><p class="m-0 text-sm text-muted-foreground">Acquisition attribution is not available on the connected CrowdRelay build. The funnel below still reports totals.</p></div>
    </Show>

    <Show when={!model.error && model.isPending}><SkeletonSection titleWidth="200px" lines={4} minHeight="160px" /></Show>

    <Show when={d()}>{data => <>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <div class="p-3 border border-border rounded-lg bg-card"><span class="block text-xs text-muted-foreground">Signups</span><strong class="block mt-1 text-xl font-bold tabular-nums text-foreground">{data().total_signups.toLocaleString()}</strong></div>
        <div class="p-3 border border-border rounded-lg bg-card"><span class="block text-xs text-muted-foreground">Activated · 30d</span><strong class="block mt-1 text-xl font-bold tabular-nums text-foreground">{data().total_activated_30d.toLocaleString()}</strong></div>
        <div class="p-3 border border-border rounded-lg bg-card"><span class="block text-xs text-muted-foreground">Active · 30d</span><strong class="block mt-1 text-xl font-bold tabular-nums text-foreground">{data().active_30d.toLocaleString()}</strong></div>
        <div class="p-3 border border-border rounded-lg bg-card"><span class="block text-xs text-muted-foreground">Retained · 30d</span><strong class="block mt-1 text-xl font-bold tabular-nums text-foreground">{data().retained_30d.toLocaleString()}</strong></div>
        <div class="p-3 border border-border rounded-lg bg-card"><span class="block text-xs text-muted-foreground">Reachable</span><strong class="block mt-1 text-xl font-bold tabular-nums text-foreground">{data().reachable_consented.toLocaleString()}</strong><small class="block text-xs text-muted-foreground mt-0.5">consented to be contacted</small></div>
      </div>

      <Show
        when={data().channels.length > 0}
        fallback={<EmptyState
          label="No attributed signups yet"
          hint="A channel appears here once a fan arrives carrying its attribution — a tracked link, a community post, or a campaign creative. Until then the funnel counts them, but cannot say who sent them."
        />}
      >
        <ul class="grid gap-2.5 m-0 p-0 list-none mt-4">
          <For each={showAllChannels() ? data().channels : data().channels.slice(0, MAX_VISIBLE_CHANNELS)}>{channel => (
            <li class="grid items-center gap-3 p-3 border border-border-subtle rounded-lg bg-surface-1 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto]">
              <div class="min-w-0">
                <strong class="block text-base capitalize text-foreground">{channelName(channel)}</strong>
                <small class="block text-sm text-muted-foreground mt-0.5">{channelDetail(channel)}</small>
              </div>
              <div class="bg-surface-3 rounded-full min-w-15 h-2 overflow-hidden" aria-hidden="true">
                <span class="bg-primary rounded-full block h-full" style={{ width: `${best() > 0 ? (channel.signups / best()) * 100 : 0}%` }} />
              </div>
              <div class="flex items-center gap-3 text-sm text-muted-foreground whitespace-nowrap">
                <span><strong class="text-foreground">{channel.signups.toLocaleString()}</strong> signups</span>
                <span><strong class="text-foreground">{channel.activated_30d.toLocaleString()}</strong> activated</span>
                <span class="text-secondary-foreground">{pct(channel.activation_basis_points)} activation</span>
              </div>
              <Show when={channel.best_action}>
                <p class="col-span-full mt-1.5 pt-2 border-t border-border-subtle text-secondary-foreground text-sm leading-relaxed m-0">{channel.best_action}</p>
              </Show>
            </li>
          )}</For>
        </ul>
        <Show when={data().channels.length > MAX_VISIBLE_CHANNELS}>
          <Button variant="ghost" size="sm" onClick={() => setShowAllChannels(s => !s)}>
            {showAllChannels() ? 'Show less' : `Show all (${data().channels.length})`}
          </Button>
        </Show>
      </Show>

      <Show when={data().unattributed.length > 0}>
        <section class="mt-6 pt-4 border-t border-border">
          <h3 class="text-sm font-semibold text-foreground">Signups the system could not attribute</h3>
          <p class="m-0 mt-1 text-sm text-muted-foreground leading-relaxed">Each row says what to instrument so the next batch lands in a channel above.</p>
          <ul class="grid gap-2 m-0 p-0 list-none mt-3">
            <For each={showAllUnattributed() ? data().unattributed : data().unattributed.slice(0, MAX_VISIBLE_UNATTRIBUTED)}>{item => (
              <li class="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0">
                <div class="min-w-0">
                  <strong class="block text-foreground">{item.reason.replace(/_/g, ' ')}</strong>
                  <small class="block text-sm text-muted-foreground mt-0.5">{item.remedy}</small>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <Badge variant="muted">{item.signups.toLocaleString()} signups</Badge>
                  <Badge variant="muted">{item.activated_30d.toLocaleString()} activated</Badge>
                </div>
              </li>
            )}</For>
          </ul>
          <Show when={data().unattributed.length > MAX_VISIBLE_UNATTRIBUTED}>
            <Button variant="ghost" size="sm" onClick={() => setShowAllUnattributed(s => !s)}>
              {showAllUnattributed() ? 'Show less' : `Show all (${data().unattributed.length})`}
            </Button>
          </Show>
        </section>
      </Show>
    </>}</Show>
  </Card>
}
