import { For, Show, createSignal } from 'solid-js'
import { KpiCard, KpiStrip, PanelTitle } from './layout'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { SectionIcon } from './SectionIcon'
import { EmptyState } from './ui/empty-state'
import { SkeletonSection } from './Skeleton'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'
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
    <div class="flex items-start justify-between gap-4 mb-3">
      <div>
        <PanelTitle icon={<SectionIcon name="users" />}>Where the fans came from</PanelTitle>
        <p class="mt-1 text-sm text-muted-foreground leading-relaxed">Signups by the channel that produced them, and how many of those were still active 30 days later. A channel that brings people who never come back is not working, however big the first number is.</p>
      </div>
    </div>

    <Show when={model.error}>
      <div class="p-4 mt-2.5 rounded-lg border border-border bg-surface-1"><p class="m-0 text-sm text-muted-foreground">Acquisition attribution is not available on the connected CrowdRelay build. The funnel below still reports totals.</p></div>
    </Show>

    <Show when={!model.error && model.isPending}><SkeletonSection titleWidth="200px" lines={4} minHeight="160px" /></Show>

    <Show when={d()}>{data => <>
      <KpiStrip class="mt-4 mb-0">
        <KpiCard label="Signups" value={data().total_signups.toLocaleString()} />
        <KpiCard label="Activated · 30d" value={data().total_activated_30d.toLocaleString()} />
        <KpiCard label="Active · 30d" value={data().active_30d.toLocaleString()} />
        <KpiCard label="Retained · 30d" value={data().retained_30d.toLocaleString()} />
        <KpiCard label="Reachable" value={data().reachable_consented.toLocaleString()} sub="consented to be contacted" />
      </KpiStrip>

      <Show
        when={data().channels.length > 0}
        fallback={<EmptyState
          label="No attributed signups yet"
          hint="A channel appears here once a fan arrives carrying its attribution — a tracked link, a community post, or a campaign creative. Until then the funnel counts them, but cannot say who sent them."
        />}
      >
        {/* These were bordered list items with their own three-column grid,
            directly above a table on the same page with different column
            widths and a different row height. Same data shape, same table. */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Channel</TableHead>
              <TableHead class="w-[18%]">Share</TableHead>
              <TableHead class="text-right">Signups</TableHead>
              <TableHead class="text-right">Activated</TableHead>
              <TableHead class="text-right">Activation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <For each={showAllChannels() ? data().channels : data().channels.slice(0, MAX_VISIBLE_CHANNELS)}>{channel => <>
              <TableRow class={channel.best_action ? 'border-b-0' : undefined}>
                <TableCell class="whitespace-normal">
                  <strong class="capitalize text-foreground">{channelName(channel)}</strong>
                  <small class="mt-0.5 block text-xs text-muted-foreground">{channelDetail(channel)}</small>
                </TableCell>
                <TableCell>
                  {/* Signups across channels are the same unit, so length here
                      does mean something: this channel's share of the biggest. */}
                  <div class="h-1.5 w-full min-w-12 overflow-hidden rounded-sm bg-surface-1" aria-hidden="true">
                    <span class="block h-full rounded-sm bg-primary" style={{ width: `${best() > 0 ? (channel.signups / best()) * 100 : 0}%` }} />
                  </div>
                </TableCell>
                <TableCell numeric class="font-semibold">{channel.signups.toLocaleString()}</TableCell>
                <TableCell numeric>{channel.activated_30d.toLocaleString()}</TableCell>
                <TableCell numeric class="text-secondary-foreground">{pct(channel.activation_basis_points)}</TableCell>
              </TableRow>
              <Show when={channel.best_action}>
                <TableRow>
                  <TableCell colSpan={5} class="whitespace-normal pb-3 pt-0 text-sm leading-relaxed text-secondary-foreground">
                    {channel.best_action}
                  </TableCell>
                </TableRow>
              </Show>
            </>}</For>
          </TableBody>
        </Table>
        <Show when={data().channels.length > MAX_VISIBLE_CHANNELS}>
          <Button variant="ghost" size="sm" onClick={() => setShowAllChannels(s => !s)}>
            {showAllChannels() ? 'Show fewer' : `Show all ${data().channels.length}`}
          </Button>
        </Show>
      </Show>

      <Show when={data().unattributed.length > 0}>
        <section class="mt-6 pt-4 border-t border-border">
          <h3 class="text-sm font-semibold text-foreground">Signups the system could not attribute</h3>
          <p class="m-0 mt-1 text-sm text-muted-foreground leading-relaxed">Each row says what to instrument so the next batch lands in a channel above.</p>
          <Table class="mt-3">
            <TableHeader>
              <TableRow>
                <TableHead>Why it could not be attributed</TableHead>
                <TableHead class="text-right">Signups</TableHead>
                <TableHead class="text-right">Activated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <For each={showAllUnattributed() ? data().unattributed : data().unattributed.slice(0, MAX_VISIBLE_UNATTRIBUTED)}>{item => (
                <TableRow>
                  <TableCell class="whitespace-normal">
                    <strong class="text-foreground">{item.reason.replace(/_/g, ' ')}</strong>
                    <small class="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{item.remedy}</small>
                  </TableCell>
                  <TableCell numeric>{item.signups.toLocaleString()}</TableCell>
                  <TableCell numeric>{item.activated_30d.toLocaleString()}</TableCell>
                </TableRow>
              )}</For>
            </TableBody>
          </Table>
          <Show when={data().unattributed.length > MAX_VISIBLE_UNATTRIBUTED}>
            <Button variant="ghost" size="sm" onClick={() => setShowAllUnattributed(s => !s)}>
              {showAllUnattributed() ? 'Show fewer' : `Show all ${data().unattributed.length}`}
            </Button>
          </Show>
        </section>
      </Show>
    </>}</Show>
  </Card>
}
