import { For, Show, createMemo } from 'solid-js'
import type { AudienceReadModel } from '../lib/types'
import { KpiCard, KpiStrip, Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { cn } from '../lib/cn'

// Audience, first screen (mockup `console-mockups/audience.html`): who
// follows you, and who you can actually reach. From the one audience read:
// the overview counts, the latest point of each growth series (followers per
// platform), where fans arrived from, and the new-fan activity.
//
// Not built, no data yet: join-ask conversion per post (signups carry no
// campaign until virya#38 lands), and a count of fans interested in upcoming
// shows (the read has interests, not people).

/** Series that count an audience on a platform — not fan records, tickets
 *  or the subreddit sizes the brain tracks for its own targeting. */
const FOLLOWER_KEYS = new Set(['followers', 'subscribers', 'members', 'listeners', 'trackers', 'supporters', 'fans'])
const NOT_FOLLOWERS = new Set(['signal', 'ticketing', 'merch', 'social'])

const PLATFORM_LABEL: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', spotify: 'Spotify', lastfm: 'Last.fm',
  bandsintown: 'Bandsintown', tiktok: 'TikTok', discord: 'Discord', soundcloud: 'SoundCloud', bandcamp: 'Bandcamp',
  telegram: 'Telegram', deezer: 'Deezer', bluesky: 'Bluesky',
}

const SOURCE_LABEL: Record<string, string> = {
  public_signup: 'Website signup',
  concert_qr: 'Door scan',
  referral: 'Referral',
  import: 'Imported list',
}

export function AudienceFirstScreen(props: { model: AudienceReadModel }) {
  const overview = () => props.model.overview ?? null
  const activity = () => props.model.signal?.activity ?? null
  // One figure per platform: the largest un-scoped audience series.
  const followers = createMemo(() => {
    const best = new Map<string, number>()
    for (const series of props.model.growth_metrics?.series ?? []) {
      if (series.subject_id || NOT_FOLLOWERS.has(series.platform) || !FOLLOWER_KEYS.has(series.metric_key)) continue
      best.set(series.platform, Math.max(best.get(series.platform) ?? 0, series.latest_value))
    }
    return [...best.entries()].sort((a, b) => b[1] - a[1])
  })
  const totalFollowers = () => followers().reduce((sum, [, n]) => sum + n, 0)
  const top = () => followers().slice(0, 5)
  const others = () => followers().slice(5).reduce((sum, [, n]) => sum + n, 0)
  const maxBar = () => Math.max(1, ...followers().map(([, n]) => n))
  const fans = () => overview()?.active_fans ?? null
  const reachable = () => overview()?.marketing_consented_fans ?? null
  const ratio = () => (fans() && totalFollowers() ? Math.round(totalFollowers() / fans()!) : null)

  const funnel = () => {
    const o = overview()
    if (!o) return []
    return [
      { label: 'Fans', value: o.active_fans },
      { label: 'Reachable', value: o.marketing_consented_fans },
      { label: 'Show interests', value: activity()?.event_interests_total ?? null },
      { label: 'Bought a ticket', value: o.ticket_buyers },
      { label: 'Came', value: o.attendees },
    ]
  }
  const funnelMax = () => Math.max(1, ...funnel().map(step => step.value ?? 0))

  return (
    <>
      <KpiStrip>
        <KpiCard label="Followers, all platforms" value={followers().length ? totalFollowers().toLocaleString() : '—'} sub={`${followers().length} platforms`} />
        <KpiCard
          label="Fans in Signal"
          value={fans() == null ? '—' : fans()!.toLocaleString()}
          sub={activity() ? `+${activity()!.new_fans_30d} in 30 days · +${activity()!.new_fans_7d} this week` : undefined}
        />
        <KpiCard
          label="You can reach"
          value={reachable() == null ? '—' : reachable()!.toLocaleString()}
          sub={fans() && reachable() != null ? `${Math.round((reachable()! / fans()!) * 100)}% said yes to messages` : 'said yes to messages'}
          tone="primary"
        />
        <KpiCard
          label="Came to a show"
          value={overview() ? overview()!.attendees.toLocaleString() : '—'}
          sub={overview() ? `${overview()!.ticket_buyers} bought a ticket` : undefined}
        />
      </KpiStrip>

      <div class="grid gap-6 lg:grid-cols-2">
        <Section title="Followers you can turn into fans" icon={<SectionIcon name="users" />} description="Per platform, against the fans you can message.">
          <Show when={followers().length > 0} fallback={<p class="text-sm text-muted-foreground">No follower counts synced yet.</p>}>
            <div class="flex flex-col">
              <For each={top()}>{([platform, count]) => <Bar label={PLATFORM_LABEL[platform] ?? platform} value={count} max={maxBar()} />}</For>
              <Show when={others() > 0}><Bar label="Others" value={others()} max={maxBar()} /></Show>
              <Show when={fans() != null}><Bar label="Signal fans" value={fans()!} max={maxBar()} accent /></Show>
            </div>
            <Show when={ratio()}>
              <p class="mt-2 text-xs text-muted-foreground">
                About 1 in {ratio()!.toLocaleString()} followers is a fan you can message. The join ask is how the rest cross over.
              </p>
            </Show>
          </Show>
        </Section>

        <Section title="From fan to the room" icon={<SectionIcon name="trending-up" />}>
          <Show when={funnel().length > 0} fallback={<p class="text-sm text-muted-foreground">The fan counts could not be read.</p>}>
            <div class="flex flex-col">
              <For each={funnel()}>{step => <Bar label={step.label} value={step.value} max={funnelMax()} />}</For>
            </div>
            <p class="mt-2 text-xs text-muted-foreground">
              {overview()!.paid_ticket_orders} paid orders · {overview()!.qualified_referrals} qualified referrals · {overview()!.synesthesia_participants} Synesthesia players
            </p>
            <Show when={overview()!.attendees === 0}>
              <p class="mt-2 text-xs text-muted-foreground">No one was scanned at a door yet — the next night's door QR counts the room.</p>
            </Show>
          </Show>
        </Section>
      </div>

      <Section title="How fans arrived" icon={<SectionIcon name="link" />}>
        <Show when={(props.model.acquisition_sources?.sources ?? []).length > 0} fallback={<p class="text-sm text-muted-foreground">No tracked arrivals yet.</p>}>
          <div class="flex flex-col">
            <For each={props.model.acquisition_sources!.sources}>{source => (
              <Bar
                label={SOURCE_LABEL[source.source] ?? source.source.replaceAll('_', ' ')}
                value={source.fans}
                max={Math.max(1, props.model.acquisition_sources!.tracked_fans)}
                note={`${source.fans_30d} in 30 days`}
              />
            )}</For>
          </div>
          <Show when={props.model.acquisition_sources!.active_fans > props.model.acquisition_sources!.tracked_fans}>
            <p class="mt-2 text-xs text-muted-foreground">
              {props.model.acquisition_sources!.active_fans - props.model.acquisition_sources!.tracked_fans} joined before arrivals were tracked.
            </p>
          </Show>
        </Show>
      </Section>
    </>
  )
}

function Bar(props: { label: string; value: number | null; max: number; accent?: boolean; note?: string }) {
  const width = () => (props.value == null ? 0 : Math.max(2, Math.round((props.value / props.max) * 100)))
  return (
    <div class="flex items-center gap-3 border-t border-border py-2 text-xs first:border-t-0">
      <span class="w-28 shrink-0 text-foreground">{props.label}</span>
      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div class={cn('h-full rounded-full', props.accent ? 'bg-success-foreground' : 'bg-primary/75')} style={{ width: `${width()}%` }} />
      </div>
      <span class="w-14 shrink-0 text-right tabular-nums text-foreground">{props.value == null ? '—' : props.value.toLocaleString()}</span>
      <Show when={props.note}><span class="w-24 shrink-0 text-right text-muted-foreground">{props.note}</span></Show>
    </div>
  )
}
