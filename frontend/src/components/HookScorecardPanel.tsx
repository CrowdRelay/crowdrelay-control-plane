import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { capability } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { formatTimestamp, httpUrl } from '../lib/format'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Badge } from './app/badge'

// Which of the band's own posts held attention — CrowdRelay's hook
// scorecard (`/v1/control-plane/content/hooks`). Each post is judged against
// the band's own medians over 60 days: watch time on video, saves plus
// shares per reach. The point is the next video: open it the way the posts
// that held attention opened. The drafters read the same verdicts.

type HookPost = {
  id: string
  platform: string | null
  media_type: string | null
  opening: string | null
  url: string | null
  posted_at: string
  reach: number | null
  avg_watch_ms: number | null
  saves: number | null
  shares: number | null
  fans_acquired: number
  fans_activated_within_30d: number
  fan_conversion_per_1000_reach: number | null
  fan_activation_bps: number | null
  verdict: 'held_attention' | 'lost_early' | 'typical' | 'unmeasured'
  watch_index_bps: number | null
  keep_index_bps: number | null
}

type FanLink = {
  channel: string
  slug: string
  creative: string | null
  destination_url: string | null
  fans: number
  stayed: number
}

const VERDICT: Record<HookPost['verdict'], { label: string; variant: 'success' | 'warning' | 'muted' }> = {
  held_attention: { label: 'held attention', variant: 'success' },
  lost_early: { label: 'lost them early', variant: 'warning' },
  typical: { label: 'typical', variant: 'muted' },
  unmeasured: { label: 'not measured', variant: 'muted' },
}

const versusMedian = (bps: number | null) => (bps == null ? null : `${(bps / 100).toFixed(0)}% of usual`)

function HookRow(props: { post: HookPost }) {
  const verdict = () => VERDICT[props.post.verdict]
  return (
    <li class="rounded-lg border border-border bg-background px-4 py-3">
      <p class="text-xs text-muted-foreground">
        <Badge variant={verdict().variant}>{verdict().label}</Badge>{' '}
        {props.post.platform ?? 'post'}{props.post.media_type ? ` · ${props.post.media_type.toLowerCase()}` : ''} · {formatTimestamp(props.post.posted_at)}
        <Show when={httpUrl(props.post.url)}>{url => <> · <a class="underline" href={url()} target="_blank" rel="noreferrer">open</a></>}</Show>
      </p>
      <Show when={props.post.opening}>{opening => <p class="mt-1 text-sm text-foreground">“{opening()}”</p>}</Show>
      <p class="mt-1 text-xs text-muted-foreground">
        <Show when={props.post.avg_watch_ms != null}>watched {((props.post.avg_watch_ms ?? 0) / 1000).toFixed(1)}s on average{versusMedian(props.post.watch_index_bps) ? ` (${versusMedian(props.post.watch_index_bps)})` : ''} · </Show>
        {(props.post.saves ?? 0) + (props.post.shares ?? 0)} saves and shares{versusMedian(props.post.keep_index_bps) ? ` (${versusMedian(props.post.keep_index_bps)})` : ''}
        {props.post.reach != null ? ` · reached ${props.post.reach}` : ''}
      </p>
      <Show when={props.post.fans_acquired > 0}>
        <p class="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="success">{props.post.fans_acquired} fan{props.post.fans_acquired === 1 ? '' : 's'} acquired</Badge>
          <span class="text-muted-foreground">
            {props.post.fans_activated_within_30d} activated within 30d
            {props.post.fan_conversion_per_1000_reach != null ? ` · ${props.post.fan_conversion_per_1000_reach} per 1k reach` : ''}
          </span>
        </p>
      </Show>
    </li>
  )
}

export function HookScorecardPanel(props: { slug: string }) {
  const hooks = useQuery(() => ({
    queryKey: ['surface', props.slug, 'content-hooks'],
    queryFn: () => surface.read<{ window_days: number; posts: HookPost[]; links?: FanLink[] }>(props.slug, capability('content-hooks').read!.path),
    staleTime: 5 * 60_000,
    retry: 1,
  }))
  const posts = () => hooks.data?.posts ?? []
  const held = () => posts().filter(post => post.verdict === 'held_attention')
  const lost = () => posts().filter(post => post.verdict === 'lost_early')
  const links = () => hooks.data?.links ?? []
  const fanCreators = () => posts()
    .filter(post => post.fans_acquired > 0)
    .slice()
    .sort((a, b) =>
      b.fans_acquired - a.fans_acquired
        || b.fans_activated_within_30d - a.fans_activated_within_30d
        || (b.fan_conversion_per_1000_reach ?? -1) - (a.fan_conversion_per_1000_reach ?? -1)
    )
    .slice(0, 5)

  return (
    <Section
      title="What held attention"
      icon={<SectionIcon name="trending-up" />}
      description="Your own posts from the last 60 days: attention and actual fan acquisition kept separate. Repeat the patterns that create fans, not just the ones that look busy."
    >
      <Show when={!hooks.error} fallback={<p class="text-sm text-muted-foreground">Couldn't read how your posts did.</p>}>
        <Show when={hooks.data} fallback={<p class="text-sm text-muted-foreground">Checking…</p>}>
          <Show when={fanCreators().length > 0}>
            <div class="mb-4">
              <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Posts that made fans</p>
              <p class="mt-1 text-xs text-muted-foreground">Inspect these first when choosing the next Meta hook or format. CrowdRelay ranks actual acquired fans before attention.</p>
              <ul class="mt-2 space-y-2">
                <For each={fanCreators()}>{post => <HookRow post={post} />}</For>
              </ul>
            </div>
          </Show>

          <Show
            when={held().length + lost().length > 0}
            fallback={<p class="text-sm text-muted-foreground">Not enough measured posts yet — it takes about four with reach before anything stands out.</p>}
          >
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Held attention</p>
                <ul class="mt-2 space-y-2">
                  <For each={held()} fallback={<li class="text-xs text-muted-foreground">None stood out yet.</li>}>{post => <HookRow post={post} />}</For>
                </ul>
              </div>
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lost them early</p>
                <ul class="mt-2 space-y-2">
                  <For each={lost()} fallback={<li class="text-xs text-muted-foreground">None — nothing dropped well below your usual.</li>}>{post => <HookRow post={post} />}</For>
                </ul>
              </div>
            </div>
          </Show>
          <Show when={links().length > 0}>
            <p class="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Links that brought fans, 90 days</p>
            <ul class="mt-2 space-y-1 text-sm">
              <For each={links()}>{link => (
                <li class="flex flex-wrap items-baseline gap-2">
                  <Badge variant={link.stayed > 0 ? 'success' : 'muted'}>{link.stayed} of {link.fans} stayed</Badge>
                  <span class="text-foreground">{link.channel}{link.creative ? ` · ${link.creative}` : ''}</span>
                  <span class="text-xs text-muted-foreground">/l/{link.slug}</span>
                </li>
              )}</For>
            </ul>
            <p class="mt-1 text-xs text-muted-foreground">Stayed: still subscribed, still hearing from you, and did something in the last 30 days. Give each post or story its own link and it earns its own line here.</p>
          </Show>
        </Show>
      </Show>
    </Section>
  )
}
