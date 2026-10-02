import { For, Show } from 'solid-js'
import { authState } from '../lib/auth'
import { PanelTitle } from './layout'
import type { AutomaticQueueChannel, UnpublishedDraftChannel } from '../lib/attention'
import { SectionIcon } from './SectionIcon'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './app/table'
import { cn } from '../lib/cn'

// The post queue, in its two lanes.
//
// Automatic lane: posts the machine is carrying — claimed, sending, or
// waiting out a backoff — plus the ones it gave up on. Nothing there waits
// on a person; it exists so "the system is posting" never reads as "the
// queue is empty" or as something broken.
//
// Human lane: drafted posts waiting for a person to publish them. Every
// outbound channel can land here: Reddit is read-only by policy, X has no
// write API this stack holds, and Telegram, Discord and Meta post
// themselves only while their autopost switches are on. A draft nobody
// publishes reaches nobody — the measurement is abandoned rather than
// recorded as a false zero, but the work is still spent.
//
// Absent is not empty. When the tenant does not report a queue at all, its
// section says so instead of showing a zero nobody measured.

const CHANNEL_LABELS: Record<string, string> = {
  reddit: 'Reddit',
  telegram: 'Telegram',
  discord: 'Discord',
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
  youtube: 'YouTube',
  spotify: 'Spotify',
  tiktok: 'TikTok',
  bandcamp: 'Bandcamp',
  social: 'Social',
}

const channelLabel = (channel: string) => CHANNEL_LABELS[channel] ?? channel

// Why a channel lands in the human lane at all — the action a person can
// take differs per channel, so it is shown. For the band the env-var and
// API-tier names are noise; they read the reason, not the switch.
const CHANNEL_REASONS: Record<string, string> = {
  reddit: 'read-only by policy — publish and register the URL',
  telegram: 'awaiting CROWDRELAY_TELEGRAM_AUTO_POST',
  discord: 'awaiting CROWDRELAY_DISCORD_AUTO_POST',
  instagram: 'Meta autoposting is off — enable it or post yourself',
  facebook: 'Meta autoposting is off — enable it or post yourself',
  x: 'no automatic path implemented',
}
const BAND_CHANNEL_REASONS: Record<string, string> = {
  reddit: 'read-only — publish it yourself and register the URL',
  telegram: 'automatic posting is not switched on yet',
  discord: 'automatic posting is not switched on yet',
  instagram: 'automatic posting is not switched on yet',
  facebook: 'automatic posting is not switched on yet',
  x: 'post it yourself — we cannot post to X for you',
}

const ageInDays = (iso: string | null): number | null => {
  if (!iso) return null
  const drafted = new Date(iso)
  if (Number.isNaN(drafted.getTime())) return null
  return Math.floor((Date.now() - drafted.getTime()) / 86_400_000)
}

// A day-old queue is normal. A week-old one is a channel nobody is running.
const STALE_AFTER_DAYS = 3

export function UnpublishedDraftsPanel(props: {
  drafts: UnpublishedDraftChannel[]
  automatic: AutomaticQueueChannel[] | undefined
  notReported: string[]
  class?: string
}) {
  const reported = () => !props.notReported.includes('unpublished_drafts')
  // The projection substitutes [] and names the lane in not_reported when
  // the tenant predates it — `[]` is defined, so presence cannot mean
  // reported. Consult not_reported like the human lane does.
  const automaticReported = () =>
    props.automatic !== undefined && !props.notReported.includes('automatic_queue')
  const total = () => props.drafts.reduce((sum, channel) => sum + channel.drafts, 0)
  const inFlight = () => (props.automatic ?? []).reduce((sum, channel) => sum + channel.in_flight, 0)
  const machineFailed = () => (props.automatic ?? []).reduce((sum, channel) => sum + channel.failed, 0)
  const oldestDays = () => {
    const ages = props.drafts
      .map(channel => ageInDays(channel.oldest_drafted_at))
      .filter((age): age is number => age !== null)
    return ages.length > 0 ? Math.max(...ages) : null
  }
  const platform = authState.isPlatformLevel()
  const reason = (channel: string) =>
    (platform ? CHANNEL_REASONS : BAND_CHANNEL_REASONS)[channel] ?? (platform ? 'awaiting an operator' : 'waiting on a person')
  // Most first: the lane's biggest pile is the one worth acting on.
  const automatic = () => [...(props.automatic ?? [])].sort((a, b) => (b.in_flight + b.failed) - (a.in_flight + a.failed))
  const drafts = () => [...props.drafts].sort((a, b) => b.drafts - a.drafts)

  const Age = (p: { iso: string | null }) => {
    const age = ageInDays(p.iso)
    return <span class={cn('tabular-nums', age !== null && age >= STALE_AFTER_DAYS ? 'text-warning-foreground' : 'text-muted-foreground')}>
      {age === null ? '—' : `${age}d`}
    </span>
  }

  return <section class={cn('min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5', props.class)}>
    <PanelTitle as="h3" icon={<SectionIcon name="inbox" />}>Post queue</PanelTitle>
    <p class="mt-1 text-sm text-muted-foreground">What the machine is posting itself, and what waits for a person to publish.</p>

    <div class="mt-4 grid gap-6 lg:grid-cols-2">
      {/* Human lane — the operator's to-do. This is the queue where the
          system is blocked on a person rather than the reverse. Listed first
          because it is the only lane anyone can act on. */}
      <div class="min-w-0">
        <div>
          <h4 class="text-sm font-medium text-foreground">Waiting for you to publish</h4>
          <Show when={reported() && total() > 0}>
            <span class="block text-xs text-muted-foreground tabular-nums">
              {total()} draft{total() === 1 ? '' : 's'}<Show when={oldestDays() !== null}> · oldest <span class={oldestDays()! >= STALE_AFTER_DAYS ? 'text-warning-foreground' : undefined}>{oldestDays()}d</span></Show>
            </span>
          </Show>
        </div>
        <Show when={reported()} fallback={
          <p class="mt-2 text-sm text-muted-foreground">{platform ? 'This tenant does not report the draft queue.' : 'The draft queue is not reported yet.'}</p>
        }>
          <Show when={total() > 0} fallback={
            <p class="mt-2 text-sm text-muted-foreground">No drafts waiting. Everything the brain wrote is published or in the machine's lane.</p>
          }>
            <Table class="mt-2">
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead class="text-right">Drafts</TableHead>
                  <TableHead class="text-right">Oldest</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={drafts()}>{(channel) => (
                  <TableRow>
                    <TableCell>
                      <span class="font-medium text-foreground">{channelLabel(channel.channel)}</span>
                      <span class="block text-xs text-muted-foreground text-pretty">{reason(channel.channel)}</span>
                    </TableCell>
                    <TableCell numeric>{channel.drafts}</TableCell>
                    <TableCell numeric><Age iso={channel.oldest_drafted_at} /></TableCell>
                  </TableRow>
                )}</For>
              </TableBody>
            </Table>
          </Show>
        </Show>
      </div>

      {/* Automatic lane — system-owned. Informational: nothing here is
          anyone's to-do, so it renders quiet rather than as an alarm. */}
      <div class="min-w-0">
        <div>
          <h4 class="text-sm font-medium text-foreground">Posting automatically</h4>
          <Show when={automaticReported() && (props.automatic ?? []).length > 0}>
            <span class="block text-xs text-muted-foreground tabular-nums">
              {inFlight()} in flight<Show when={machineFailed() > 0}> · <span class="text-error-foreground">{machineFailed()} failed</span></Show>
            </span>
          </Show>
        </div>
        <Show when={automaticReported()} fallback={
          <p class="mt-2 text-sm text-muted-foreground">{platform ? 'This tenant does not report the machine queue.' : 'The machine queue is not reported yet.'}</p>
        }>
          <Show when={(props.automatic ?? []).length > 0} fallback={
            <p class="mt-2 text-sm text-muted-foreground">Nothing in the machine's queue.</p>
          }>
            <Table class="mt-2">
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead class="text-right">In flight</TableHead>
                  <TableHead class="text-right">Failed</TableHead>
                  <TableHead class="text-right">Oldest</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={automatic()}>{(channel) => (
                  <TableRow>
                    <TableCell class="font-medium text-foreground">{channelLabel(channel.channel)}</TableCell>
                    <TableCell numeric>{channel.in_flight}</TableCell>
                    <TableCell numeric class={channel.failed > 0 ? 'text-error-foreground' : 'text-muted-foreground'}>{channel.failed}</TableCell>
                    <TableCell numeric><Age iso={channel.oldest_queued_at} /></TableCell>
                  </TableRow>
                )}</For>
              </TableBody>
            </Table>
            <Show when={machineFailed() > 0}>
              <p class="mt-2 text-xs text-muted-foreground">Failed sends are the system's own losses — the alerts carry the detail.</p>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  </section>
}
