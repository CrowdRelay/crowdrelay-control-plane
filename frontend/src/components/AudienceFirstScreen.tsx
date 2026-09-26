import { For, Show, createMemo } from 'solid-js'
import type { AudienceReadModel } from '../lib/types'
import { Bar, Card, Note, Split, StatRow, Tile, Tiles } from './ui/dash'
import { Link as LinkIcon, Megaphone, TrendingUp, Users } from 'lucide-solid'

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

export function AudienceFirstScreen(props: { slug: string; model: AudienceReadModel }) {
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

  const growth28 = () => {
    let sum = 0
    let known = false
    for (const series of props.model.growth_metrics?.series ?? []) {
      if (series.subject_id || NOT_FOLLOWERS.has(series.platform) || !FOLLOWER_KEYS.has(series.metric_key)) continue
      if (series.delta_28d != null) { sum += series.delta_28d; known = true }
    }
    return known ? sum : null
  }
  const sources = () => props.model.acquisition_sources?.sources ?? []
  const tracked = () => props.model.acquisition_sources?.tracked_fans ?? 0
  const topSource = () => sources()[0] ?? null

  return (
    <>
      <Tiles>
        <Tile
          label="Followers, all platforms"
          value={followers().length ? totalFollowers().toLocaleString() : null}
          sub={growth28() != null ? <><span class="text-success-foreground">{growth28()! >= 0 ? '+' : ''}{growth28()}</span> this month</> : `${followers().length} platforms`}
        />
        <Tile
          label="Fans in Signal"
          value={fans()}
          sub={activity() ? <><span class={activity()!.new_fans_30d > 0 ? 'text-success-foreground' : undefined}>+{activity()!.new_fans_30d}</span> in 30 days</> : undefined}
        />
        <Tile
          label="You can reach"
          value={reachable()}
          sub={fans() && reachable() != null ? `${Math.round((reachable()! / fans()!) * 100)}% said yes to messages` : 'said yes to messages'}
        />
        <Tile label="Came to a show" value={overview()?.attendees} sub={overview() ? `${overview()!.ticket_buyers} bought a ticket` : undefined} />
      </Tiles>

      <Split mid>
        <Card title="Followers you can turn into fans" icon={<Users />} aside="per platform">
          <Show when={followers().length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">No follower counts synced yet.</p>}>
            <For each={top()}>{([platform, count]) => <Bar label={PLATFORM_LABEL[platform] ?? platform} value={count} max={maxBar()} />}</For>
            <Show when={others() > 0}><Bar label="Others" value={others()} max={maxBar()} /></Show>
            <Show when={fans() != null}><Bar label="Signal fans" value={fans()!} max={maxBar()} tone="good" /></Show>
            <Show when={ratio()}>
              <Note>Fewer than 1 in {ratio()!.toLocaleString()} followers is a fan you can message. The join ask is how the rest cross over.</Note>
            </Show>
          </Show>
        </Card>
        <Card title="The join ask" icon={<Megaphone />}>
          <p class="m-0 py-2 text-sm text-muted-foreground">
            Joins from each ask are not measured yet — signups carry no campaign until the tracked join links land.
          </p>
          <Note>Once they do, each post shows how many people it brought in.</Note>
        </Card>
      </Split>

      <Split even>
        <Card title="From fan to the room" icon={<TrendingUp />}>
          <Show when={funnel().length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">The fan counts could not be read.</p>}>
            <For each={funnel()}>{step => <Bar label={step.label} value={step.value} max={funnelMax()} />}</For>
            <Show when={overview()!.attendees === 0}>
              <Note>No one was scanned at the door yet — use the next night's door QR.</Note>
            </Show>
          </Show>
        </Card>
        <Card title="How fans arrived" icon={<LinkIcon />}>
          <Show when={sources().length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">No tracked arrivals yet.</p>}>
            <Show when={topSource() && topSource()!.fans === tracked()}>
              <p class="m-0 text-sm text-foreground">All {tracked()} tracked fans came through {(SOURCE_LABEL[topSource()!.source] ?? topSource()!.source).toLowerCase()}</p>
            </Show>
            <For each={sources()}>{source => (
              <StatRow label={SOURCE_LABEL[source.source] ?? source.source.replaceAll('_', ' ')} value={<span class="tabular-nums text-foreground">{source.fans}</span>} />
            )}</For>
            <Show when={(props.model.acquisition_sources?.active_fans ?? 0) > tracked()}>
              <StatRow label="Before tracking" value={<span class="tabular-nums text-foreground">{props.model.acquisition_sources!.active_fans - tracked()}</span>} />
            </Show>
          </Show>
        </Card>
      </Split>
    </>
  )
}
