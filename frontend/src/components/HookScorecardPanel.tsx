import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { capability } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { formatTimestamp } from '../lib/format'
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
  verdict: 'held_attention' | 'lost_early' | 'typical' | 'unmeasured'
  watch_index_bps: number | null
  keep_index_bps: number | null
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
        <Show when={props.post.url}>{url => <> · <a class="underline" href={url()} target="_blank" rel="noreferrer">open</a></>}</Show>
      </p>
      <Show when={props.post.opening}>{opening => <p class="mt-1 text-sm text-foreground">“{opening()}”</p>}</Show>
      <p class="mt-1 text-xs text-muted-foreground">
        <Show when={props.post.avg_watch_ms != null}>watched {((props.post.avg_watch_ms ?? 0) / 1000).toFixed(1)}s on average{versusMedian(props.post.watch_index_bps) ? ` (${versusMedian(props.post.watch_index_bps)})` : ''} · </Show>
        {(props.post.saves ?? 0) + (props.post.shares ?? 0)} saves and shares{versusMedian(props.post.keep_index_bps) ? ` (${versusMedian(props.post.keep_index_bps)})` : ''}
        {props.post.reach != null ? ` · reached ${props.post.reach}` : ''}
      </p>
    </li>
  )
}

export function HookScorecardPanel(props: { slug: string }) {
  const hooks = useQuery(() => ({
    queryKey: ['surface', props.slug, 'content-hooks'],
    queryFn: () => surface.read<{ window_days: number; posts: HookPost[] }>(props.slug, capability('content-hooks').read!.path),
    staleTime: 5 * 60_000,
    retry: 1,
  }))
  const posts = () => hooks.data?.posts ?? []
  const held = () => posts().filter(post => post.verdict === 'held_attention')
  const lost = () => posts().filter(post => post.verdict === 'lost_early')

  return (
    <Section
      title="What held attention"
      icon={<SectionIcon name="trending-up" />}
      description="Your own posts from the last 60 days, judged against your own usual: how long people watched, and how often they saved or shared. Open the next one the way the winners opened."
    >
      <Show when={!hooks.error} fallback={<p class="text-sm text-muted-foreground">Couldn't read how your posts did.</p>}>
        <Show when={hooks.data} fallback={<p class="text-sm text-muted-foreground">Checking…</p>}>
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
        </Show>
      </Show>
    </Section>
  )
}
