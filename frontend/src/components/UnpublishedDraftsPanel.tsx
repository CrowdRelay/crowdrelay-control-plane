import { For, Show } from 'solid-js'
import { authState } from '../lib/auth'
import { KpiCard, KpiStrip, PanelTitle } from './layout'
import type { AutomaticQueueChannel, UnpublishedDraftChannel } from '../lib/attention'
import { SectionIcon } from './SectionIcon'
import { Badge } from './app/badge'
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
}) {
  const reported = () => !props.notReported.includes('unpublished_drafts')
  const automaticReported = () => props.automatic !== undefined
  const total = () => props.drafts.reduce((sum, channel) => sum + channel.drafts, 0)
  const inFlight = () => (props.automatic ?? []).reduce((sum, channel) => sum + channel.in_flight, 0)
  const machineFailed = () => (props.automatic ?? []).reduce((sum, channel) => sum + channel.failed, 0)
  const oldestDays = () => {
    const ages = props.drafts
      .map(channel => ageInDays(channel.oldest_drafted_at))
      .filter((age): age is number => age !== null)
    return ages.length > 0 ? Math.max(...ages) : null
  }

  return <section class="space-y-3">
    <div>
      <PanelTitle as="h3" icon={<SectionIcon name="inbox" />}>Post queue</PanelTitle>
      <p class="text-muted-foreground text-sm mt-1">
        Two lanes: what the machine is posting itself, and what waits for a person.
      </p>
    </div>

    {/* Automatic lane — system-owned. Informational: nothing here is
        anyone's to-do, so it renders quiet rather than as an alarm. */}
    <Show when={automaticReported()}>
      <div class="flex flex-col gap-2">
        <div class="flex items-baseline justify-between gap-2">
          <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Automatic</h4>
          <Show when={inFlight() > 0}>
            <span class="text-xs text-muted-foreground">{inFlight()} in flight</span>
          </Show>
        </div>
        <Show when={(props.automatic ?? []).length > 0} fallback={
          <p class="text-muted-foreground text-sm italic">Nothing in the machine's queue.</p>
        }>
          <div class="flex flex-col gap-2">
            <For each={props.automatic ?? []}>{(channel) => {
              const age = ageInDays(channel.oldest_queued_at)
              const stale = age !== null && age >= STALE_AFTER_DAYS
              return <div class="flex items-center gap-2 flex-wrap rounded-md border border-border bg-background px-3 py-2 text-sm">
                <Badge variant="muted">{channelLabel(channel.channel)}</Badge>
                <Show when={channel.in_flight > 0}>
                  <span class="text-foreground">{channel.in_flight} in flight</span>
                </Show>
                <Show when={channel.failed > 0}>
                  <span class="text-destructive">{channel.failed} failed</span>
                </Show>
                <Show when={age !== null}>
                  <span class={cn('text-xs', stale ? 'text-destructive' : 'text-muted-foreground')}>
                    oldest {age}d
                  </span>
                </Show>
              </div>
            }}</For>
          </div>
          <Show when={machineFailed() > 0}>
            <p class="text-xs text-muted-foreground">Failed sends are the system's own losses — alerts carry the detail.</p>
          </Show>
        </Show>
      </div>
    </Show>

    {/* Human lane — the operator's to-do. This is the queue where the
        system is blocked on a person rather than the reverse. */}
    <div class="flex flex-col gap-2">
      <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Waiting on you to publish</h4>
      <Show when={reported()} fallback={
        <p class="text-sm text-muted-foreground italic">{authState.isPlatformLevel() ? 'This tenant does not report the draft queue.' : 'The draft queue is not reported yet.'}</p>
      }>
        <Show when={total() > 0} fallback={
          <p class="text-muted-foreground text-sm">No drafts waiting. Everything the brain wrote is published or in the machine's lane.</p>
        }>
          <KpiStrip class="mb-0">
            <KpiCard label="Drafts waiting" value={total()} />
            <Show when={oldestDays() !== null}>
              <KpiCard label="Oldest" value={`${oldestDays()}d`} tone="warn" />
            </Show>
          </KpiStrip>

          {/* One row per channel, each in its own box. As four inline spans on
              a shared baseline they wrapped into a single paragraph, so where
              one channel ended and the next began was invisible — and the
              reason, the longest of them, decided where every other row
              broke. The reason now has its own line under the counts. */}
          <div class="flex flex-col gap-2">
            <For each={props.drafts}>{(channel) => {
              const age = ageInDays(channel.oldest_drafted_at)
              const stale = age !== null && age >= STALE_AFTER_DAYS
              return <div class="flex flex-col gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm">
                <div class="flex items-center gap-2 flex-wrap">
                  <Badge variant={stale ? 'warning' : 'muted'}>{channelLabel(channel.channel)}</Badge>
                  <strong class="text-foreground">{channel.drafts} draft{channel.drafts === 1 ? '' : 's'}</strong>
                  <Show when={age !== null}>
                    <span class={cn('text-xs', stale ? 'text-destructive' : 'text-muted-foreground')}>
                      oldest {age}d
                    </span>
                  </Show>
                </div>
                <span class="text-xs leading-relaxed text-muted-foreground">
                  {(authState.isPlatformLevel() ? CHANNEL_REASONS : BAND_CHANNEL_REASONS)[channel.channel] ?? (authState.isPlatformLevel() ? 'awaiting an operator' : 'waiting on a person')}
                </span>
              </div>
            }}</For>
          </div>
        </Show>
      </Show>
    </div>
  </section>
}
