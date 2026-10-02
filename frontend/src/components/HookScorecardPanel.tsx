import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link2 } from 'lucide-solid'
import { capability } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { formatTimestamp, httpUrl, tokenLabel } from '../lib/format'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { SectionFailureCard } from './SectionFailureCard'
import { SkeletonRows } from './Skeleton'
import { Button } from './app/button'
import { DataTable, type ColumnDef } from './app/data-table'
import { EmptyState } from './ui/empty-state'
import { Pill, Tile, Tiles, type Tone } from './ui/dash'

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

const VERDICT: Record<HookPost['verdict'], { label: string; tone: Tone }> = {
  held_attention: { label: 'Held attention', tone: 'good' },
  lost_early: { label: 'Lost them early', tone: 'warn' },
  typical: { label: 'Typical', tone: 'muted' },
  unmeasured: { label: 'Not measured', tone: 'muted' },
}

const versusMedian = (bps: number | null) => (bps == null ? null : `${(bps / 100).toFixed(0)}% of your usual`)

type Filter = 'all' | 'fans' | HookPost['verdict']
const FILTER_LABEL: Record<Filter, string> = {
  all: 'All', fans: 'Made fans', held_attention: 'Held attention', lost_early: 'Lost them early', typical: 'Typical', unmeasured: 'Not measured',
}
const matches = (post: HookPost, filter: Filter) =>
  filter === 'all' ? true : filter === 'fans' ? post.fans_acquired > 0 : post.verdict === filter

/// Platform names as the platforms write them — "Youtube" read wrong.
const BRANDS: Record<string, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', spotify: 'Spotify', bandcamp: 'Bandcamp' }
const platformName = (raw: string) => BRANDS[raw.toLowerCase()] ?? tokenLabel(raw)
const days = (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`

/// Where a post went out and what it was, in words: "Facebook · Video".
const where = (post: HookPost) =>
  [post.platform ? platformName(post.platform) : 'Post', post.media_type ? tokenLabel(post.media_type.toLowerCase()) : null].filter(Boolean).join(' · ')
const postName = (post: HookPost) => post.opening ? `“${post.opening}”` : `${where(post)} post`

const n = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString()

// Which of the band's own posts held attention, and which made fans — one
// table, every post once, filtered by its verdict. It used to be three lists
// that repeated the same post and packed each post's numbers into a sentence.
export function HookScorecardPanel(props: { slug: string }) {
  const hooks = useQuery(() => ({
    queryKey: ['surface', props.slug, 'content-hooks'],
    queryFn: () => surface.read<{ window_days: number; posts: HookPost[]; links?: FanLink[] }>(props.slug, capability('content-hooks').read!.path),
    staleTime: 5 * 60_000,
    retry: 1,
  }))
  const [show, setShow] = createSignal<Filter>('all')
  const posts = () => hooks.data?.posts ?? []
  const links = () => hooks.data?.links ?? []
  const count = (filter: Filter) => posts().filter(post => matches(post, filter)).length
  const measured = () => posts().filter(post => post.verdict !== 'unmeasured').length
  const fans = () => posts().reduce((sum, post) => sum + post.fans_acquired, 0)
  const activated = () => posts().reduce((sum, post) => sum + post.fans_activated_within_30d, 0)

  const columns: ColumnDef<HookPost, any>[] = [
    {
      id: 'post', header: 'Post', accessorFn: postName, meta: { class: 'min-w-64' },
      cell: c => {
        const post = c.row.original
        return <div class="max-w-md">
          <span class="font-medium text-foreground text-pretty">{postName(post)}</span>
          <span class="block text-xs text-muted-foreground">
            {where(post)} · {formatTimestamp(post.posted_at)}
            <Show when={httpUrl(post.url)}>{url => <>
              {' · '}
              <a class="underline underline-offset-2 hover:text-foreground" href={url()} target="_blank" rel="noreferrer">
                Open<span class="sr-only"> {postName(post)} on {post.platform ? platformName(post.platform) : 'the platform'} (opens in a new tab)</span>
              </a>
            </>}</Show>
          </span>
        </div>
      },
    },
    {
      id: 'verdict', header: 'Verdict', accessorFn: p => VERDICT[p.verdict].label, meta: { class: 'whitespace-nowrap' },
      cell: c => <Pill tone={VERDICT[c.row.original.verdict].tone}>{VERDICT[c.row.original.verdict].label}</Pill>,
    },
    {
      id: 'watched', header: 'Watched', accessorFn: p => p.avg_watch_ms ?? -1, meta: { numeric: true, class: 'whitespace-nowrap' },
      cell: c => <Show when={c.row.original.avg_watch_ms != null} fallback="—">
        {((c.row.original.avg_watch_ms ?? 0) / 1000).toFixed(1)}s
        <Show when={versusMedian(c.row.original.watch_index_bps)}>{v => <span class="block text-xs text-muted-foreground">{v()}</span>}</Show>
      </Show>,
    },
    {
      id: 'kept', header: 'Saves + shares', accessorFn: p => (p.saves ?? 0) + (p.shares ?? 0), meta: { numeric: true, class: 'whitespace-nowrap' },
      cell: c => <>
        {n((c.row.original.saves ?? 0) + (c.row.original.shares ?? 0))}
        <Show when={versusMedian(c.row.original.keep_index_bps)}>{v => <span class="block text-xs text-muted-foreground">{v()}</span>}</Show>
      </>,
    },
    { id: 'reach', header: 'Reach', accessorFn: p => p.reach ?? -1, meta: { numeric: true }, cell: c => n(c.row.original.reach) },
    {
      id: 'fans', header: 'Fans made', accessorFn: p => p.fans_acquired, meta: { numeric: true, class: 'whitespace-nowrap' },
      cell: c => <>
        <span class={c.row.original.fans_acquired > 0 ? 'font-medium text-success-foreground' : 'text-muted-foreground'}>{n(c.row.original.fans_acquired)}</span>
        <Show when={c.row.original.fans_acquired > 0}>
          <span class="block text-xs text-muted-foreground">{n(c.row.original.fans_activated_within_30d)} active in 30d</span>
        </Show>
      </>,
    },
  ]

  const linkColumns: ColumnDef<FanLink, any>[] = [
    {
      id: 'where', header: 'Link', accessorFn: l => l.creative ?? l.slug, meta: { class: 'min-w-48' },
      cell: c => <>
        <span class="font-medium text-foreground">{platformName(c.row.original.channel)}{c.row.original.creative ? ` · ${c.row.original.creative}` : ''}</span>
        <span class="block font-mono text-xs text-muted-foreground">/l/{c.row.original.slug}</span>
      </>,
    },
    { id: 'fans', header: 'Fans', accessorFn: l => l.fans, meta: { numeric: true }, cell: c => n(c.row.original.fans) },
    {
      id: 'stayed', header: 'Stayed', accessorFn: l => l.stayed, meta: { numeric: true, class: 'whitespace-nowrap' },
      cell: c => <>
        <span class={c.row.original.stayed > 0 ? 'font-medium text-success-foreground' : 'text-muted-foreground'}>{n(c.row.original.stayed)}</span>
        <Show when={c.row.original.fans > 0}><span class="block text-xs text-muted-foreground">{Math.round(c.row.original.stayed / c.row.original.fans * 100)}% of them</span></Show>
      </>,
    },
  ]

  return (
    <Show when={!hooks.error} fallback={
      <SectionFailureCard error={hooks.error} title="Couldn't read how your posts did" onRetry={() => void hooks.refetch()} />
    }>
      <Show when={hooks.data} fallback={<SkeletonRows count={5} />}>
        <div class="space-y-6">
          <Tiles class="mb-6">
            <Tile label="Posts measured" value={measured()} sub={`of ${posts().length} in ${days(hooks.data!.window_days)}`} />
            <Tile label="Held attention" value={count('held_attention')} valueTone={count('held_attention') > 0 ? 'good' : undefined} sub="above your usual" />
            <Tile label="Lost them early" value={count('lost_early')} valueTone={count('lost_early') > 0 ? 'warn' : undefined} sub="well below your usual" />
            <Tile label="Fans made" value={fans().toLocaleString()} valueTone={fans() > 0 ? 'good' : undefined} sub={`${activated().toLocaleString()} active within 30 days`} />
          </Tiles>

          <section class="rounded-xl border border-border bg-card p-4 sm:p-5">
            <Section
              flush
              title="Your posts"
              icon={<SectionIcon name="trending-up" />}
              count={posts().length}
              description={`Each post judged against your own usual over ${days(hooks.data!.window_days)}. Fans made comes first: repeat what makes fans, not just what looks busy.`}
            >
              <DataTable
                data={posts().filter(post => matches(post, show()))}
                columns={columns}
                getRowId={p => p.id}
                bordered={false}
                initialSorting={[{ id: 'fans', desc: true }]}
                searchText={p => [p.opening, p.platform, p.media_type, VERDICT[p.verdict].label].filter(Boolean).join(' ')}
                searchPlaceholder="Search by opening line or platform"
                toolbar={
                  <div role="group" aria-label="Verdict" class="flex flex-wrap items-center gap-1">
                    <For each={(['all', 'fans', 'held_attention', 'lost_early', 'typical', 'unmeasured'] as Filter[]).filter(f => f === 'all' || count(f) > 0)}>{f => (
                      <Button variant={show() === f ? 'secondary' : 'ghost'} size="sm" aria-pressed={show() === f} onClick={() => setShow(f)}>
                        {FILTER_LABEL[f]}
                        <span class="tabular-nums text-muted-foreground">{count(f)}</span>
                      </Button>
                    )}</For>
                  </div>
                }
                empty={posts().length === 0
                  ? <EmptyState icon={<SectionIcon name="trending-up" />} label="No posts measured yet" hint="It takes about four posts with reach before anything stands out." />
                  : <EmptyState label="Nothing here" hint="No post matches this filter.">
                      <Button variant="outline" size="sm" onClick={() => setShow('all')}>Show every post</Button>
                    </EmptyState>}
              />
              <Show when={posts().length > 0 && count('held_attention') + count('lost_early') === 0}>
                <p class="mt-3 text-xs text-muted-foreground">Nothing stands out from your usual yet — it takes about four posts with reach.</p>
              </Show>
            </Section>
          </section>

          <Show when={links().length > 0}>
            <section class="rounded-xl border border-border bg-card p-4 sm:p-5">
              <Section
                flush
                title="Links that brought fans"
                icon={<Link2 />}
                count={links().length}
                description="The last 90 days. Stayed means still subscribed, still hearing from you, and active in the last 30 days. Give each post or story its own link and it gets its own row."
              >
                <DataTable
                  data={links()}
                  columns={linkColumns}
                  getRowId={l => l.slug + l.channel}
                  bordered={false}
                  pageSize={8}
                  initialSorting={[{ id: 'stayed', desc: true }]}
                  searchText={l => [l.channel, l.creative, l.slug].filter(Boolean).join(' ')}
                  searchPlaceholder="Search links"
                />
              </Section>
            </section>
          </Show>
        </div>
      </Show>
    </Show>
  )
}
