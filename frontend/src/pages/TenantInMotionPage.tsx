import { For, Show, createMemo, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { AlertTriangle, CircleCheck, Share2 } from 'lucide-solid'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { confidencePercent, formatIsoAge, httpUrl, timestampMillis, tokenLabel } from '../lib/format'
import { DECISION_KIND_LABELS, labelOr } from '../lib/opportunity-labels'
import { PageShell, Section, SkeletonBlock } from '../components/layout'
import { Act, Card, DashHeader, ItemRow, MoreRow, Note, Pill, Row, Split, Tile, Tiles, SubPagePanel, useSubPage } from '../components/ui/dash'
import type { RelayProcessRun } from '../lib/types'
import { RelayRunCard, verdict } from '../components/RelayRunCard'
import { DataTable, type ColumnDef } from '../components/app/data-table'
import { Button } from '../components/app/button'
import { EmptyState } from '../components/ui/empty-state'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet'
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

const SECTION_SUBTITLE: Record<InMotionSection, string> = {
  overview: 'What the machine is doing on its own',
  // The runs wait on a person too — "on its own" said nothing needed you
  // above cards reading "46 waiting".
  relays: 'Your posts, spread to forums — and the ones waiting for your yes',
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
        subtitle={SECTION_SUBTITLE[props.section]}
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
          <RelayRunsTable slug={params().slug} runs={runs()} degraded={degraded('relays')} />
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
      state === 'done' ? 'bg-success-solid/20 text-success-foreground'
      : state === 'wait' ? 'bg-warning-solid/20 text-warning-foreground'
      : state === 'bad' ? 'bg-error-solid/20 text-error-foreground'
      : 'border border-border text-muted-foreground')}>{text ?? ''}</span>
  )
  const pushed = () => run().push_status === 'succeeded'
  return (
    <>
      <Row>
        <div class="min-w-0 flex-1">
          {/* Wraps rather than truncating — at phone width the step dots left
              the post's name a few letters wide. */}
          <p class="m-0 text-sm text-foreground text-pretty">{platform()} · {day()}</p>
          <p class="m-0 break-words text-xs text-muted-foreground text-pretty">{run().title ?? run().source_url ?? 'a post'}</p>
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

type RunFilter = 'all' | 'waiting' | 'measuring' | 'fans' | 'other'
const RUN_FILTER_LABEL: Record<RunFilter, string> = {
  all: 'All', waiting: 'Waiting on you', measuring: 'Measuring', fans: 'Brought fans', other: 'Other',
}
// The chips overlap: a run that brought fans can still have forums waiting
// on you, and counting it only once said "152 waiting across 0 runs".
const isWaiting = (run: RelayProcessRun) => run.awaiting > 0 || run.batch_status === 'awaiting_approval'
const broughtFans = (run: RelayProcessRun) => run.conversions > 0 || run.replies > 0
const isMeasuring = (run: RelayProcessRun) => !broughtFans(run) && run.posted + run.manual > 0
const matchesFilter = (run: RelayProcessRun, filter: RunFilter) =>
  filter === 'all' ? true
  : filter === 'waiting' ? isWaiting(run)
  : filter === 'fans' ? broughtFans(run)
  : filter === 'measuring' ? isMeasuring(run)
  : !isWaiting(run) && !broughtFans(run) && !isMeasuring(run)
const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** The runs as one table: what each post did, what waits on you, and the
 *  forum checklist in a sheet beside it rather than a card that grows. */
function RelayRunsTable(props: { slug: string; runs: RelayProcessRun[]; degraded: boolean }) {
  const [show, setShow] = createSignal<RunFilter>('all')
  const [opened, setOpened] = createSignal<RelayProcessRun | null>(null)
  const sum = (pick: (run: RelayProcessRun) => number) => props.runs.reduce((total, run) => total + pick(run), 0)
  const visible = () => props.runs.filter(run => matchesFilter(run, show()))
  const countOf = (filter: RunFilter) => props.runs.filter(run => matchesFilter(run, filter)).length
  const platformName = (run: RelayProcessRun) => run.platform ? tokenLabel(run.platform) : 'Post'

  const columns: ColumnDef<RelayProcessRun, any>[] = [
    {
      id: 'post', header: 'Post', accessorFn: r => r.title ?? '', meta: { class: 'min-w-48' },
      cell: c => {
        const r = c.row.original
        return <div class="flex items-start gap-3">
          <Show when={httpUrl(r.thumbnail_url)}>
            {url => <img src={url()} alt="" class="size-9 shrink-0 rounded-md object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" loading="lazy" />}
          </Show>
          <div class="min-w-0">
            <span class="block font-medium text-foreground text-pretty">{r.title ?? 'Untitled post'}</span>
            <span class="block text-xs text-muted-foreground">
              {platformName(r)} · observed {r.occurred_at ? formatIsoAge(r.occurred_at) : formatIsoAge(r.decided_at)}
            </span>
          </div>
        </div>
      },
    },
    {
      id: 'status', header: 'Status', accessorFn: r => verdict(r).label, meta: { class: 'whitespace-nowrap' },
      cell: c => <Pill tone={verdict(c.row.original).tone}>{sentenceCase(verdict(c.row.original).label)}</Pill>,
    },
    {
      id: 'decided', header: 'Forums', accessorFn: r => r.communities_decided, meta: { numeric: true, label: 'Forums decided' },
      cell: c => <>
        {c.row.original.communities_decided}
        <span class="block whitespace-nowrap text-xs text-muted-foreground">{confidencePercent(c.row.original.confidence_bp)} sure</span>
      </>,
    },
    {
      id: 'waiting', header: 'Needs you', accessorFn: r => r.awaiting, meta: { numeric: true },
      cell: c => <span class={c.row.original.awaiting > 0 ? 'font-medium text-warning-foreground' : 'text-muted-foreground'}>{c.row.original.awaiting}</span>,
    },
    {
      id: 'posted', header: 'Posted', accessorFn: r => r.posted + r.manual, meta: { numeric: true, class: 'whitespace-nowrap' },
      cell: c => <>
        {c.row.original.posted + c.row.original.manual}
        <Show when={c.row.original.manual > 0}><span class="block text-xs text-muted-foreground">{c.row.original.manual} by hand</span></Show>
      </>,
    },
    {
      id: 'gave', header: 'Fans gained', accessorFn: r => r.conversions, meta: { numeric: true },
      cell: c => <span class={c.row.original.conversions > 0 ? 'text-success-foreground' : 'text-muted-foreground'}>
        {c.row.original.conversions > 0 ? `+${c.row.original.conversions}` : '—'}
      </span>,
    },
    {
      id: 'actions', header: () => <span class="sr-only">Actions</span>, enableSorting: false, enableHiding: false,
      meta: { class: 'text-right whitespace-nowrap' },
      cell: c => <Button variant="outline" size="sm" onClick={() => setOpened(c.row.original)}>
        See the forums<span class="sr-only">: {c.row.original.title ?? 'untitled post'}</span>
      </Button>,
    },
  ]

  return <div class="space-y-6">
    <Tiles class="mb-6">
      <Tile label="Runs" value={props.runs.length} sub="posts being spread" />
      <Tile label="Waiting on you" value={sum(r => r.awaiting)} valueTone={sum(r => r.awaiting) > 0 ? 'warn' : undefined} sub={`across ${countOf('waiting')} runs`} />
      <Tile label="Posted to forums" value={sum(r => r.posted + r.manual)} sub={`${sum(r => r.manual)} by hand`} />
      <Tile label="Fans gained" value={sum(r => r.conversions)} valueTone={sum(r => r.conversions) > 0 ? 'good' : undefined} sub={`${sum(r => r.replies)} replies`} />
    </Tiles>

    <section class="rounded-xl border border-border bg-card p-4 sm:p-5">
      <Section
        flush
        title="Relay runs"
        icon={<Share2 />}
        count={props.runs.length}
        description="One run per post: the forums it was drafted for, what waits for your yes, what went out, and what it brought back."
      >
        <DataTable
          data={visible()}
          columns={columns}
          getRowId={r => r.source_id}
          bordered={false}
          initialSorting={[{ id: 'waiting', desc: true }]}
          searchText={r => [r.title, r.platform, verdict(r).label].filter(Boolean).join(' ')}
          searchPlaceholder="Search posts"
          toolbar={
            <div role="group" aria-label="Status" class="flex flex-wrap items-center gap-1">
              <For each={(['all', 'waiting', 'measuring', 'fans', 'other'] as RunFilter[]).filter(f => f === 'all' || countOf(f) > 0)}>{f => (
                <Button variant={show() === f ? 'secondary' : 'ghost'} size="sm" aria-pressed={show() === f} onClick={() => setShow(f)}>
                  {RUN_FILTER_LABEL[f]}
                  <span class="tabular-nums text-muted-foreground">{countOf(f)}</span>
                </Button>
              )}</For>
            </div>
          }
          empty={props.runs.length === 0
            ? <EmptyState
                icon={<Share2 />}
                label={props.degraded ? "Couldn't load relay runs" : 'No relays yet'}
                hint={props.degraded ? 'The console keeps asking and fills this in when the tenant answers.' : 'A post worth spreading lands here, with the forums it was drafted for.'}
              />
            : <EmptyState icon={<Share2 />} label="Nothing here" hint="No run matches this filter.">
                <Button variant="outline" size="sm" onClick={() => setShow('all')}>Show every run</Button>
              </EmptyState>}
        />
      </Section>
    </section>

    {/* The forum checklist beside the table — the run card, opened. */}
    <Sheet open={opened() !== null} onOpenChange={open => { if (!open) setOpened(null) }}>
      <SheetContent class="flex w-full flex-col gap-0 overflow-y-auto overscroll-contain p-0 sm:max-w-2xl">
        <Show when={opened()} keyed>{run => <>
          <SheetHeader class="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
            <SheetTitle class="text-base text-pretty">{run.title ?? 'Untitled post'}</SheetTitle>
            <SheetDescription>The forums this post was drafted for, and where each one stands.</SheetDescription>
          </SheetHeader>
          <div class="p-4">
            <RelayRunCard slug={props.slug} run={run} initiallyOpen />
          </div>
        </>}</Show>
      </SheetContent>
    </Sheet>
  </div>
}
