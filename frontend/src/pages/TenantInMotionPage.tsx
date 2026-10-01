import { For, Show, createMemo, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { AlertTriangle, CircleCheck, Share2 } from 'lucide-solid'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { timestampMillis } from '../lib/format'
import { DECISION_KIND_LABELS, labelOr } from '../lib/opportunity-labels'
import { PageShell, SkeletonBlock } from '../components/layout'
import { Act, Card, DashHeader, ItemRow, MoreRow, Note, Row, Split, Tile, Tiles, SubPagePanel, useSubPage } from '../components/ui/dash'
import type { RelayProcessRun } from '../lib/types'
import { RelayRunCard } from '../components/RelayRunCard'
import { SectionFailureCard } from '../components/SectionFailureCard'

// In motion — "what is the machine doing right now on its own?" (mockup
// `console-mockups/in-motion.html`). One read, `in-motion/model`: the relay
// runs, the autopilot overview and the intelligence brief. The numbers and
// the stuck card come from the overview and the brief; "finished in the
// last day" tallies the overview's recent actions by kind.
//
// The relay runs are the first process kind on the page: one synced band post
// fanned out to one Signal push plus one drafted post per admitted community.
// A run's forum checklist is a second request made only when its card opens.

/** Plain words for the action kinds the machine runs most on its own. */
const ACTION_LABEL: Record<string, string> = {
  'agent.run.request': 'AI agent runs',
  'team.assignment.email': 'Team emails',
  'signal.push.request': 'Pushes to fans',
  'content.post.request': 'Posts',
  'visual.render.request': 'Visuals',
}

export type InMotionSection = 'overview' | 'relays'

const SECTION_TITLE: Record<InMotionSection, string> = {
  overview: 'In motion',
  relays: 'Post relays',
}

export const InMotionOverviewPage = () => <TenantInMotionPage section="overview" />
export const InMotionRelaysPage = () => <TenantInMotionPage section="relays" />

export function TenantInMotionPage(props: { section: InMotionSection }) {
  const params = useParams({ strict: false }) as () => { slug: string }
  const model = useQuery(() => ({
    queryKey: ['in-motion-model', params().slug],
    queryFn: () => api.inMotionModel(params().slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // Runs keep moving while the page sits open — approvals land, posts
    // publish, measurements arrive — so the model keeps a slow poll. A
    // section the tenant could not answer comes back on the same poll.
    refetchInterval: 30_000,
  }))
  const autopilot = () => model.data?.autopilot ?? null
  const chief = () => model.data?.intelligence?.chief_of_staff ?? null
  const runs = () => model.data?.relays?.runs ?? []
  const stuck = () => autopilot()?.awaiting_executor ?? 0
  // A section the tenant could not answer is `null` + named in `degraded`.
  // The poll keeps asking — the copy below names it instead of "nothing".
  const degraded = (name: 'relays' | 'autopilot' | 'intelligence') => (model.data?.degraded ?? []).includes(name)
  const stuckReported = () => !degraded('autopilot') && !degraded('intelligence')

  const finished = createMemo(() => {
    const since = Date.now() - 86_400_000
    const counts = new Map<string, number>()
    for (const action of autopilot()?.recent_actions ?? []) {
      // finished_at can arrive as a time tuple — Date.parse on an array is
      // NaN, which reads "fresh" and inflates the 24h tallies. Drop it instead.
      const finishedAt = timestampMillis(action.finished_at)
      if (action.status !== 'succeeded' || !Number.isFinite(finishedAt) || finishedAt < since) continue
      counts.set(action.action_kind, (counts.get(action.action_kind) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  })


  const areas = useSubPage(() => props.section, '/tenants/$slug/in-motion')

  return (
    <PageShell>
      <DashHeader
        title={SECTION_TITLE[props.section]}
        subtitle="What the machine is doing on its own"
      />

      <Show when={model.error}>
        <SectionFailureCard error={model.error} title="Couldn't load what's in motion" onRetry={() => void model.refetch()} />
      </Show>


      <SubPagePanel when={areas.active() === 'overview'}>
      <Show when={!model.error && !model.data}>
        <SkeletonBlock style={{ 'min-height': '84px' }} />
        <SkeletonBlock style={{ 'min-height': '200px' }} />
      </Show>

      <Show when={model.data}>
        <Tiles>
          <Tile label="Running now" value={autopilot()?.processing_actions} sub="being carried out" />
          <Tile
            label="Waiting to run"
            value={autopilot() ? autopilot()!.queued_actions + stuck() : null}
            sub={stuck() > 0 ? (autopilot()!.queued_actions === 0 ? `all ${stuck()} stuck` : `${stuck()} stuck`) : 'the next cycle picks them up'}
          />
          <Tile label="Done today" value={autopilot()?.succeeded_24h} sub={autopilot() ? `${autopilot()!.failed_24h} failed` : undefined} />
          <Tile label="Confirmed landed" value={autopilot()?.executor_confirmed_24h} sub="receipts from the other side" />
        </Tiles>

        <Split>
          <Card title="Your posts, carried further" icon={<Share2 />} aside={degraded('relays') ? undefined : `${runs().length} this week`}>
            <Show when={model.data?.relays} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">Couldn't load relay runs. They come back on the next refresh.</p>}>
              <Show when={runs().length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">No relays yet — a post worth spreading lands here.</p>}>
                <div class="flex items-center gap-2.5 pb-1 text-xs text-muted-foreground">
                  <span class="flex-1" />
                  <span class="flex w-44 justify-between">
                    <span>seen</span><span>fans</span><span>forums</span><span>you</span><span>out</span>
                  </span>
                  <span class="w-16" />
                </div>
                <For each={runs().slice(0, 4)}>{run => <RelayRow run={run} slug={params().slug} />}</For>
                <Show when={runs().length > 4}>
                  <MoreRow text={`${runs().length - 4} older runs${runs().every(r => r.posted === 0) ? ' · nothing posted to forums yet' : ''}`} link={<Act onClick={() => areas.open('relays')}>All runs</Act>} />
                </Show>
              </Show>
            </Show>
          </Card>

          <Card title="Stuck" icon={<AlertTriangle />}>
            <Show when={stuck() > 0 || (chief()?.stopped ?? []).length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">{stuckReported() ? 'Nothing is stuck.' : "Couldn't fully load the queue — the console keeps asking and fills it in when the tenant answers."}</p>}>
              <Show when={stuck() > 0}>
                <ItemRow pill={{ tone: 'bad', text: String(stuck()) }} title="Waiting for a tool nobody runs" sub="no tool can do them" />
              </Show>
              <For each={chief()?.stopped ?? []}>{stop => (
                <ItemRow pill={{ tone: 'muted', text: String(stop.count) }} title={stop.detail.replace(/^\w/, c => c.toUpperCase())} />
              )}</For>
              <Show when={stuck() > 0}>
                <Note>They cancel themselves after 24 h. Connect the tool, or turn the step off.</Note>
                <div class="mt-3 flex gap-2">
                  <Act to="/tenants/$slug/intelligence/standing" params={{ slug: params().slug }}>Connect</Act>
                  <Act to="/tenants/$slug/settings/profile" params={{ slug: params().slug }}>Turn off</Act>
                </div>
              </Show>
            </Show>
          </Card>
        </Split>

        <Card title="Finished today" icon={<CircleCheck />} aside={degraded('autopilot') ? undefined : `${finished().reduce((sum, [, n]) => sum + n, 0)} things`} class="mb-3">
          <Show when={finished().length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">{degraded('autopilot') ? "Couldn't load recent actions — the console keeps asking and fills it in when the tenant answers." : 'Nothing finished in the last day.'}</p>}>
            <div class="mt-1 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
              <For each={finished()}>{([kind, count]) => (
                <div>
                  <p class="m-0 text-lg font-medium tabular-nums text-foreground">{count}</p>
                  <p class="m-0 text-xs text-muted-foreground">{ACTION_LABEL[kind] ?? labelOr(DECISION_KIND_LABELS, kind)}</p>
                </div>
              )}</For>
            </div>
          </Show>
        </Card>
      </Show>
      </SubPagePanel>

      <SubPagePanel when={areas.active() === 'relays'}>
        <Show when={runs().length > 0 || model.data} fallback={<SkeletonBlock style={{ 'min-height': '120px' }} />}>
          <Show when={runs().length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">{degraded('relays') ? 'Couldn\'t load relay runs — the console keeps asking and fills it in when the tenant answers.' : 'No relays yet — a post worth spreading lands here.'}</p>}>
            <div class="flex flex-col gap-3">
              <For each={runs()}>{run => <RelayRunCard slug={params().slug} run={run} />}</For>
            </div>
          </Show>
        </Show>
      </SubPagePanel>
    </PageShell>
  )
}

/** One relay run as the mockup draws it: the post, then five steps as dots
 *  — seen, pushed to fans, forums drafted, waiting for you, posted — and a
 *  Review that opens the full run card with its forum checklist. */
function RelayRow(props: { run: RelayProcessRun; slug: string }) {
  const [open, setOpen] = createSignal(false)
  const run = () => props.run
  const platform = () => ({ instagram: 'IG', facebook: 'FB' } as Record<string, string>)[run().platform ?? ''] ?? (run().platform ?? 'post')
  const day = () => (run().occurred_at ? new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(new Date(run().occurred_at!)) : '')
  const dot = (state: 'done' | 'wait' | 'none' | 'bad', text?: string | number) => (
    <span class={cn('inline-flex size-5 items-center justify-center rounded-full text-xs',
      state === 'done' ? 'bg-success-foreground/20 text-success-foreground'
      : state === 'wait' ? 'bg-warning-foreground/20 text-warning-foreground'
      : state === 'bad' ? 'bg-error-foreground/20 text-error-foreground'
      : 'border border-border text-muted-foreground')}>{text ?? ''}</span>
  )
  const pushed = () => run().push_status === 'succeeded'
  return (
    <>
      <Row>
        <div class="min-w-0 flex-1">
          <p class="m-0 truncate text-sm text-foreground">{platform()} · {day()}</p>
          <p class="m-0 truncate text-xs text-muted-foreground">{run().title ?? run().source_url ?? 'a post'}</p>
        </div>
        <span class="flex w-44 shrink-0 justify-between">
          {dot('done', '✓')}
          {dot(pushed() ? 'done' : run().push_decided ? 'wait' : 'none', pushed() ? '✓' : '')}
          {dot(run().communities_decided > 0 ? 'done' : 'none', run().communities_decided || '')}
          {dot(run().awaiting > 0 ? 'wait' : 'none', run().awaiting || '')}
          {dot(run().failed > 0 ? 'bad' : run().posted > 0 ? 'done' : 'none', run().posted || (run().manual > 0 ? 'hand' : ''))}
        </span>
        <span class="w-16 shrink-0 text-right"><Act onClick={() => setOpen(!open())}>{open() ? 'Close' : 'Review'}</Act></span>
      </Row>
      <Show when={open()}>
        <div class="py-2"><RelayRunCard slug={props.slug} run={run()} /></div>
      </Show>
    </>
  )
}
