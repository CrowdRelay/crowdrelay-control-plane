import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link, useNavigate, useParams, useRouterState } from '@tanstack/solid-router'
import { ChartLine, MapPin, RefreshCw, Target, Ticket, Users } from 'lucide-solid'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { compareTimestamps, formatIsoAge, formatIsoUntil, relativeTime, timestampMillis } from '../lib/format'
import { cn } from '../lib/cn'
import { ReplyTriagePanel } from '../components/ReplyTriagePanel'
import { NegotiationsPanel } from '../components/NegotiationsPanel'
import { OutreachPipelinePanel } from '../components/OutreachPipelinePanel'
import { OutreachConversationsPanel } from '../components/OutreachConversationsPanel'
import { OpportunityShortlistPanel } from '../components/OpportunityShortlistPanel'
import { PressRoomPanel } from '../components/PressRoomPanel'
import { ReleaseCampaignsPanel } from '../components/ReleaseCampaignsPanel'
import { ReleasePlanPanel } from '../components/ReleasePlanPanel'
import { OutreachWavesPanel } from '../components/OutreachWavesPanel'
import { PrizesToSendPanel } from '../components/PrizesToSendPanel'
import { PlayLedgerPanel } from '../components/PlayLedgerPanel'
import { SkeletonSection } from '../components/Skeleton'
import { BarList, DeltaBadge, Donut, Legend, Ring, Widget, type Segment } from '../components/charts'
import { Metric, MetricRow } from '../components/ui/metric'
import { CountdownRing, OutcomeRow, StepChecklist, WorkList, WorkRow } from '../components/work'
import { PageShell, PageHeader, Section, SkeletonBlock, TabBar, TabPanel, useTabPanels } from '../components/layout'
import { SectionIcon } from '../components/SectionIcon'
import { StatusBadge } from '../components/StatusBadge'
import { TenantStatusLine } from '../components/TenantStatusLine'
import { Button, buttonVariants } from '../components/app/button'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { Alert } from '../components/app/alert'
import { CONTEXT_LABELS, DECISION_KIND_LABELS, labelOr, humanize } from '../lib/opportunity-labels'
import type { OpportunityBoardEntry, OutcomeGroup, TenantTodayReadModel } from '../lib/types'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'

const metric = (value: number | undefined | null, suffix = '') =>
  value == null ? '—' : `${value.toLocaleString()}${suffix}`

// The section names the degraded strip prints — operator words for the
// `tenant-today` sections, with the raw key as the fallback.
const OPS_SECTION_LABEL: Record<string, string> = {
  summary: 'The queue summary',
  flags: 'The health flags',
  autopilot: 'Autopilot approvals',
  growth: 'Growth',
  opportunities: 'Opportunities',
  signal: 'Signal',
  audience: 'The audience',
  growth_metrics: 'Growth metrics',
  acquisition_sources: 'Acquisition sources',
  reply_triage: 'Replies and answers',
  shows: 'Shows',
  attention: 'Needs you',
  next_show_timeline: 'The next show timeline',
}
const sectionLabel = (key: string) => OPS_SECTION_LABEL[key] ?? humanize(key)

// The machine's surfaces for one tenant: replies, outreach, press, releases
// and the play ledger, each on its own tab. Decisions live on Needs you; the
// first figure here says how many are waiting and points there.
export function TenantOperationsPage() {
  const params = useParams({ from: '/tenants/$slug/operations' })
  // The valid list is what makes `?tab=` work both ways — without it a
  // deep link or a Booking-journey drill-through lands on Replies and
  // `switchTab` never writes the param back.
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('replies', [
    'replies', 'negotiations', 'outreach', 'press', 'releases', 'plays',
  ])
  // The listing tab dissolved into /proof — a pre-dissolve deep link keeps
  // its intent instead of snapping back to Replies.
  const navigate = useNavigate()
  const locationSearch = useRouterState({ select: s => s.location.search })
  createEffect(() => {
    if ((locationSearch() as Record<string, unknown>)?.tab === 'listing') {
      void navigate({ to: '/tenants/$slug/proof', params: { slug: params().slug }, replace: true })
    }
  })
  const model = useQuery(() => ({
    queryKey: ['tenant-today', params().slug],
    queryFn: () => api.tenantToday(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // A section the tenant could not answer lands here as 200 with the
    // section named in `degraded`, so nothing retries it and the panel
    // stays empty for the life of the tab. Keep asking until it fills.
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))
  const refresh = () => void model.refetch()

  const d = (): TenantTodayReadModel | undefined => model.error ? undefined : model.data
  // The header pill — one plain sentence for the machine's state, read off
  // the derived block the read model now assembles. Broken beats idle beats
  // working; an absent derived block (older build) simply keeps the pill
  // hidden rather than claiming a state nobody reported.
  const statusPill = createMemo((): { text: string; tone: 'good' | 'warn' | 'bad' | 'muted' } | null => {
    const st = d()?.derived?.status
    if (!st) return null
    if (st.dead_jobs != null && st.dead_jobs > 0)
      return { text: `${st.dead_jobs} send${st.dead_jobs === 1 ? '' : 's'} stuck — needs a look`, tone: 'bad' }
    if (st.failed_24h != null && st.failed_24h > 0)
      return { text: `${st.failed_24h} failed in the last day`, tone: 'warn' }
    if (st.running === false) return { text: 'the machine is off — nothing runs without you', tone: 'warn' }
    const done = st.done_24h
    if (st.running == null)
      // Nobody reported a run state — name what was done, claim nothing more.
      return done != null
        ? { text: `${done} done in 24h`, tone: done > 0 ? 'good' : 'muted' }
        : { text: 'the machine has not reported in', tone: 'muted' }
    return {
      text: done != null && done > 0 ? `on its own · ${done} done in 24h` : 'on its own',
      tone: 'good',
    }
  })

  // One human-gate number for the KPI strip: answers owed + asks parked +
  // drafts waiting. It exists only when all three are reported — a sum of
  // the parts that happen to be visible reads as a total and is not one.
  const waitingTotal = () => {
    const c = d()?.derived?.work_area_counts
    if (!c || c.replies == null || c.approvals == null || c.drafts == null) return null
    return c.replies + c.approvals + c.drafts
  }

  // Whether the autopilot is *working*, not merely switched on. Failures
  // outnumbering successes is bad; some failures is a warning; dispatched
  // and never confirmed is bad however few failures were reported.

  // Worth doing this week — the upstream next-best-action queue, already
  // ranked. Only what still needs a person: approvals awaiting a yes and
  // plain recommendations — `observed`/`auto_executing` are status, not
  // moves. Three at most; the full queue lives on Needs you.
  const weekMoves = createMemo(() =>
    (d()?.opportunities ?? [])
      .filter(e => e.authority === 'awaiting_approval' || e.authority === 'recommended')
      .sort((a, b) => a.position - b.position)
      .slice(0, 3),
  )
  // needs_you can be absent on older tenants — optional-chain the field
  // itself, not just the section (same guard as brain-cycle.ts / Shell).

  // "The change this month" has two honest readings already in the
  // composite: arrivals (`new_fans_30d`, rolling) and the net population
  // delta (`delta_28d` on the signal.active_fans series). A stale series
  // cannot speak for this month, so it does not render.
  const activeFansTrend = createMemo(() =>
    model.data?.growth_metrics?.series?.find(
      s => s.platform === 'signal' && s.metric_key === 'active_fans' && !s.stale,
    ),
  )
  // The next show and its timeline ride the same `tenant-today` read model —
  // `shows` lists the nights and `next_show_timeline` is the dependent hop
  // the server fetched for the nearest one. No second requests: the page's
  // whole band answers in one fan-out.
  const nextShow = createMemo(() =>
    (d()?.shows?.events ?? [])
      .filter(e => e.upcoming)
      .sort((a, b) => compareTimestamps(a.starts_at, b.starts_at))[0],
  )
  // The timeline must be matched back to the show it's about — reconcile can
  // swap the show list while the old timeline sits in the model.
  const nextShowTimelineData = createMemo(() => {
    const tl = d()?.next_show_timeline
    return tl && tl.event?.slug === nextShow()?.slug ? tl : undefined
  })
  const nextShowSteps = createMemo(() => {
    const rank = { due: 0, active: 1 } as const
    return (nextShowTimelineData()?.steps ?? [])
      .filter(s => s.state === 'due' || s.state === 'active')
      .sort((a, b) => rank[a.state as keyof typeof rank] - rank[b.state as keyof typeof rank])
      .slice(0, 3)
  })

  // Days to the nearest upcoming night — plain ms math, the countdown's
  // window is a month out (the ring is full when the show is tonight).
  const nextShowDays = createMemo(() => {
    const show = nextShow()
    if (!show) return null
    const parsed = timestampMillis(show.starts_at)
    return Number.isFinite(parsed) ? Math.max(0, Math.ceil((parsed - Date.now()) / 86_400_000)) : null
  })

  // Tickets sold and the room's capacity live on the sales-pace step's
  // detail until the shows section carries them. `detail` is upstream JSON
  // — numbers get a type check, anything else reads as unknown, not zero.
  const nextShowSales = createMemo((): { sold: number | null; capacity: number | null } => {
    const tl = d()?.next_show_timeline
    if (!tl || tl.event?.slug !== nextShow()?.slug) return { sold: null, capacity: null }
    const step = tl.steps?.find(s => s.key === 'sales_pace')
    const detail = step?.detail
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    return { sold: num(detail?.['paid_tickets']), capacity: num(detail?.['capacity']) }
  })

  // The checklist the card draws — the timeline's own order, its plain
  // labels, and for the not-yet-done steps the anchor ("T-14") as the note.
  const nextShowChecklist = createMemo(() => {
    const tl = d()?.next_show_timeline
    if (!tl || tl.event?.slug !== nextShow()?.slug) return []
    return (tl.steps ?? []).map(s => ({
      key: s.key,
      label: s.label,
      state: s.state,
      note: s.state === 'done' ? undefined : s.anchor,
    }))
  })

  // A section named in `degraded` never answered — its count is absent, not
  // zero; the sections below degrade on their own rather than lying.
  const reachShare = () => {
    const a = d()?.audience
    if (!a || !(a.active_fans > 0) || a.marketing_consented_fans == null) return null
    const share = a.marketing_consented_fans / a.active_fans
    return Number.isFinite(share) ? share : null
  }
  const shareOfActive = (value: number) => {
    const active = d()?.audience?.active_fans ?? 0
    return active > 0 ? `${Math.round((value / active) * 100)}%` : undefined
  }
  // This week's arrivals per day against the 30-day rate. `change` is null
  // when the month had no arrivals to compare against.
  const pace = createMemo(() => {
    const act = d()?.signal?.activity
    if (act?.new_fans_7d == null || act.new_fans_30d == null) return null
    const week = act.new_fans_7d / 7
    const month = act.new_fans_30d / 30
    return { week, month, change: month > 0 ? week / month - 1 : null }
  })
  // Top four sources, the rest folded into "other", and fans with no
  // recorded source as their own muted arc.
  const SOURCE_COLORS = [
    { class: 'stroke-chart-1', dot: 'bg-chart-1' },
    { class: 'stroke-chart-2', dot: 'bg-chart-2' },
    { class: 'stroke-chart-3', dot: 'bg-chart-3' },
    { class: 'stroke-chart-4', dot: 'bg-chart-4' },
  ]
  const sourceSegments = createMemo((): Array<Segment & { note?: string; dot?: string }> => {
    const acq = d()?.acquisition_sources
    if (!acq) return []
    const sources = acq.sources ?? []
    const top = sources.slice(0, 4).map((s, i) => ({
      key: s.source,
      label: s.source.replaceAll('_', ' '),
      value: s.fans,
      ...SOURCE_COLORS[i]!,
      note: s.fans_30d > 0 ? `+${s.fans_30d.toLocaleString()}` : undefined,
    }))
    const other = sources.slice(4).reduce((sum, s) => sum + s.fans, 0)
    const untracked = acq.active_fans - acq.tracked_fans
    return [
      ...top,
      ...(other > 0 ? [{ key: 'other', label: 'other sources', value: other, class: 'stroke-chart-5', dot: 'bg-chart-5' }] : []),
      ...(untracked > 0 ? [{ key: 'untracked', label: 'no source recorded', value: untracked, class: 'stroke-muted-foreground/40', dot: 'bg-muted-foreground/40' }] : []),
    ]
  })

  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now()
    return model.dataUpdatedAt ? relativeTime(model.dataUpdatedAt) : null
  })

  return <PageShell>
    <PageHeader
      title="Today"
      description={authState.isPlatformLevel() ? 'Your daily worklist. Anything the autopilot needs a decision on is here — work the list top to bottom.' : 'Your daily worklist. Anything the brain needs a decision on is here — work the list top to bottom.'}
      actions={
        <div class="flex items-center gap-3">
          <Show when={model.data && !model.error}>
            {/* One sentence for the machine's state — running, done, broken.
                On an older read model it stays hidden rather than guessing. */}
            <Show when={statusPill()}>{pill => <StatusBadge status={pill().text} tone={pill().tone} />}</Show>
          </Show>
          <Show when={updated()}><span class="text-sm text-muted-foreground">Updated {updated()}</span></Show>
          <Button variant="outline" size="sm" onClick={refresh} disabled={model.isFetching} aria-label="Refresh">
            <RefreshCw class={cn(model.isFetching && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      }
    />

    <Show when={model.error}>
      <SectionFailureCard error={model.error} fallback={authState.isPlatformLevel() ? 'Tenant operations channel unavailable' : 'Today'} onRetry={() => void refresh()} />
    </Show>

    {/* The band's "is anything broken for me" — one plain line, silent when
        fine, on the first screen they open. The machine's detail stays on
        the operator's Health page. */}
    <Show when={!authState.isPlatformLevel()}>
      <TenantStatusLine slug={params().slug} operations={model.data} />
    </Show>

    {/* Operations and Intelligence share the query key, so the skeleton
        shows whenever there is no data to render, not only on first fetch. */}
    <Show when={!model.error && !model.data}>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <For each={[0, 1, 2, 3]}>{() => <SkeletonBlock style={{ 'min-height': '180px' }} />}</For>
      </div>
      <SkeletonBlock style={{ 'min-height': '320px' }} />
    </Show>

    <Show when={model.data && !model.error}>
      {/* A section the tenant could not answer is named once, compactly —
          the pill already says "something is broken", this line says what.
          A null below is never read as "checked and empty" while it shows. */}
      <Show when={model.data!.degraded.length > 0}>
        <Alert tone="warning" role="status" class="mb-4">
          {model.data!.degraded.length === 1
            ? <><strong>{sectionLabel(model.data!.degraded[0]!)}</strong> couldn't be checked right now</>
            : <><strong>{model.data!.degraded.map(sectionLabel).join(', ')}</strong> couldn't be checked right now</>
          }{' '}— the rest of the page keeps working and it recovers on the next poll.
        </Alert>
      </Show>

      {/* The four numbers the band asks for first, as one divided rail.
          Each is null-safe: an unreported figure draws "—", never a 0. */}
      <MetricRow class="mb-5">
        <Metric
          label="Fans you can reach"
          value={metric(d()?.audience?.marketing_consented_fans)}
          sub="active fans who consented to be contacted"
        />
        <Metric
          label="Waiting on you"
          value={metric(waitingTotal())}
          sub="answers owed, asks parked, drafts waiting"
          tone={waitingTotal() != null && waitingTotal()! > 0 ? 'warn' : 'default'}
        />
        <Metric
          label="Next show"
          value={nextShowDays() == null ? '—' : `in ${nextShowDays()}d`}
          sub={(() => {
            const tl = d()?.next_show_timeline
            const city = tl && tl.event?.slug === nextShow()?.slug
              ? tl.event?.venue_address?.split(',')[0] ?? null
              : null
            return city ?? nextShow()?.title ?? 'no night booked'
          })()}
        />
        <Metric
          label="Tickets sold"
          value={nextShowSales().sold == null ? '—' : `${nextShowSales().sold}${nextShowSales().capacity != null ? ` / ${nextShowSales().capacity}` : ''}`}
          sub={nextShow() ? 'for the nearest night' : 'no night booked'}
        />
      </MetricRow>

      {/* The two bands a person reads next: what to do (~60%) beside the
          night it is doing it for (~40%). */}
      <div class="grid gap-4 lg:grid-cols-5">
        <div id="needs-you" class="lg:col-span-3">
          <DoThisNext
            model={d}
            slug={params().slug}
            nextShow={nextShow()}
            nextShowSteps={nextShowSteps()}
            weekMoves={weekMoves()}
          />
        </div>
        <div class="lg:col-span-2">
          <NextShowCard
            slug={params().slug}
            show={nextShow()}
            address={(() => {
              const tl = d()?.next_show_timeline
              return tl && tl.event?.slug === nextShow()?.slug ? tl.event?.venue_address ?? null : null
            })()}
            showsLoaded={d()?.shows != null}
            days={nextShowDays()}
            sales={nextShowSales()}
            checklist={nextShowChecklist()}
          />
        </div>
      </div>

      <IsItWorking model={d} slug={params().slug} />
    </Show>

    {/* Tab bar — static, renders immediately. Count callbacks return 0
        while data is pending, which is the correct placeholder. */}
    <TabBar
      active={activeTab()}
      onChange={switchTab}
      onPrefetch={prefetch}
      tabs={[
        // Mirrors the derived `replies` definition — the summary's waiting
        // count, then the list length, so older builds still show a badge.
        { id: 'replies', label: 'Replies', count: () =>
            d()?.derived?.work_area_counts?.replies
            ?? d()?.reply_triage?.summary?.waiting_on_you_count
            ?? (d()?.reply_triage?.waiting_on_you?.length ?? 0) },
        { id: 'negotiations', label: 'Negotiations' },
        {
          id: 'outreach', label: 'Outreach',
          count: () => (d()?.derived?.approval_batches ?? [])
            .filter(b => b.context === 'outreach')
            .reduce((n, b) => n + b.count, 0),
        },
        { id: 'press', label: 'Press' },
        { id: 'releases', label: 'Releases' },
        { id: 'plays', label: 'Play ledger' },
      ]}
    />

    <Show when={!model.error && !model.data && isVisited(activeTab())}>
      <SkeletonSection titleWidth="160px" lines={4} minHeight="160px" />
    </Show>

    {/* Each panel runs its own queries, so it loads independently of the
        read model. TabPanel's Suspense boundary shows the first skeleton. */}
    <TabPanel active={activeTab()} id="replies" visited={isVisited('replies')}>
      <ReplyTriagePanel />
    </TabPanel>
    {/* P.7: the negotiation table — live terms conversations with the
        ladder and the parked move, plus the record of settled ones. */}
    <TabPanel active={activeTab()} id="negotiations" visited={isVisited('negotiations')}>
      <NegotiationsPanel />
    </TabPanel>
    <TabPanel active={activeTab()} id="outreach" visited={isVisited('outreach')}>
      <OutreachConversationsPanel slug={params().slug} />
      <OutreachWavesPanel slug={params().slug} />
      <OutreachPipelinePanel slug={params().slug} />
      <OpportunityShortlistPanel />
    </TabPanel>
    <TabPanel active={activeTab()} id="press" visited={isVisited('press')}>
      <PressRoomPanel slug={params().slug} />
    </TabPanel>
    <TabPanel active={activeTab()} id="releases" visited={isVisited('releases')}>
      <ReleasePlanPanel slug={params().slug} />
      <ReleaseCampaignsPanel slug={params().slug} />
    </TabPanel>
    <TabPanel active={activeTab()} id="plays" visited={isVisited('plays')}>
      <PlayLedgerPanel slug={params().slug} />
    </TabPanel>

    {/* Fan growth — the north star, moved off the tenant landing so this
        daily page opens on recent progress. Degrades silently per field:
        an unanswered section simply does not render. */}
    <Show when={model.data && !model.error}>
      <Section
        flush
        lead
        title="Fan growth"
        icon={<SectionIcon name="users" />}
        description="The north star. Everything else on this page exists to move the headline number."
        action={<Link to="/tenants/$slug/audience" params={{ slug: params().slug }} class={buttonVariants({ variant: 'ghost', size: 'sm' })}>Audience detail</Link>}
      >
        <div class="grid gap-4 lg:grid-cols-3">
          {/* The headline — "are we getting more fans" in one read. Reach
              is the send-path definition: active fans holding current
              marketing consent, not followers, not a raw total. */}
          <Widget label="Fans you can reach" icon={<Users class="size-4" aria-hidden="true" />} class="lg:col-span-2">
            <div class="flex flex-wrap items-end gap-x-4 gap-y-2">
              <span class="text-5xl font-bold tracking-tight tabular-nums text-foreground">
                <Show when={d()?.audience?.marketing_consented_fans != null} fallback={<span class="text-muted-foreground">—</span>}>
                  {d()!.audience!.marketing_consented_fans!.toLocaleString()}
                </Show>
              </span>
              <div class="flex flex-wrap gap-1.5 pb-1.5">
                <Show when={d()?.signal?.activity?.new_fans_7d != null}>
                  <DeltaBadge value={d()!.signal!.activity!.new_fans_7d} label="new · 7d" />
                </Show>
                <Show when={d()?.signal?.activity?.new_fans_30d != null}>
                  <DeltaBadge value={d()!.signal!.activity!.new_fans_30d} label="new · 30d" />
                </Show>
                <Show when={activeFansTrend()?.delta_28d != null}>
                  <DeltaBadge value={activeFansTrend()!.delta_28d} label="net · 28d" />
                </Show>
              </div>
            </div>
            <p class="-mt-2 text-xs text-muted-foreground">
              Active fans who consented to be contacted — the number the send paths actually enforce.
            </p>

            {/* Arrival pace — this week's daily rate against the month's.
                The only trend the read model can honestly draw until the
                series history reaches the console. */}
            <Show when={pace()}>
              {p => (
                <div class="flex flex-col gap-3 border-t border-border pt-4">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-sm font-medium text-foreground">Arrival pace</span>
                    <Show when={p().change != null}>
                      <span class={cn('text-xs font-medium tabular-nums', p().change! > 0 ? 'text-success-foreground' : p().change! < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        {p().change! > 0 ? '+' : ''}{Math.round(p().change! * 100)}% vs 30-day average
                      </span>
                    </Show>
                  </div>
                  <BarList
                    format={v => `${v.toFixed(1)} / day`}
                    rows={[
                      { label: 'This week', value: p().week, class: 'bg-chart-2' },
                      { label: '30-day average', value: p().month, class: 'bg-chart-3' },
                    ]}
                  />
                </div>
              )}
            </Show>

            {/* A measured zero is not a failure to hide — it is the state
                the whole product exists to change, so the empty widget says
                where the first fans actually come from. */}
            <Show when={d()?.audience?.active_fans === 0}>
              <p class="text-sm text-muted-foreground">
                No fans yet — the first ones arrive when a door QR gets scanned at a show or a source connects.{' '}
                <Link to="/tenants/$slug/audience" params={{ slug: params().slug }} class="underline underline-offset-2">
                  Audience sources
                </Link>
              </p>
            </Show>

            <div class="mt-auto flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
              <ChartLine class="size-4 shrink-0" aria-hidden="true" />
              Fans over time appears here once the metric history reaches the console.
            </div>
          </Widget>

          {/* How much of the audience the send paths may actually contact. */}
          <Widget label="Reachable share" icon={<Target class="size-4" aria-hidden="true" />}>
            <div class="flex flex-1 flex-col items-center justify-center gap-4">
              <Ring value={reachShare()} label="Share of active fans who consented to contact" class="size-36">
                <span class="text-2xl font-bold tabular-nums text-foreground">
                  {reachShare() == null ? '—' : `${Math.round(reachShare()! * 100)}%`}
                </span>
                <span class="text-xs text-muted-foreground">reachable</span>
              </Ring>
              <p class="text-center text-sm text-muted-foreground">
                <span class="font-medium tabular-nums text-foreground">{metric(d()?.audience?.marketing_consented_fans)}</span>
                {' of '}
                <span class="font-medium tabular-nums text-foreground">{metric(d()?.audience?.active_fans)}</span>
                {' active fans consented to be contacted'}
              </p>
            </div>
          </Widget>

          {/* From fan to the room — each stage as a share of active fans.
              Not a conversion funnel: a buyer need not have consented. */}
          <Show when={d()?.audience}>
            {aud => (
              <Widget label="From fan to the room" icon={<Ticket class="size-4" aria-hidden="true" />} class="lg:col-span-2">
                <BarList rows={[
                  { label: 'Active fans', value: aud().active_fans, class: 'bg-chart-3' },
                  { label: 'Reachable', value: aud().marketing_consented_fans, note: shareOfActive(aud().marketing_consented_fans), class: 'bg-chart-2' },
                  { label: 'Ticket buyers', value: aud().ticket_buyers, note: shareOfActive(aud().ticket_buyers), class: 'bg-chart-4' },
                  { label: 'Attendees', value: aud().attendees, note: shareOfActive(aud().attendees), class: 'bg-chart-1' },
                ]} />
                <div class="mt-auto grid grid-cols-2 gap-4 border-t border-border pt-4">
                  <div class="flex flex-col gap-0.5">
                    <span class="text-xl font-bold tabular-nums text-foreground">{metric(aud().paid_ticket_orders)}</span>
                    <span class="text-xs text-muted-foreground">Paid orders</span>
                  </div>
                  <div class="flex flex-col gap-0.5">
                    <span class="text-xl font-bold tabular-nums text-foreground">{metric(aud().qualified_referrals)}</span>
                    <span class="text-xs text-muted-foreground">Qualified referrals</span>
                  </div>
                </div>
              </Widget>
            )}
          </Show>

          {/* Where they came from — first-touch over the acquisition ledger.
              Fans who predate the ledger count as untracked, not as a
              made-up source. */}
          <Show when={d()?.acquisition_sources}>
            {acq => (
              <Widget label="Where fans came from" icon={<MapPin class="size-4" aria-hidden="true" />}>
                <Show
                  when={acq().active_fans > 0}
                  fallback={<p class="text-sm text-muted-foreground">No acquisition sources recorded yet — fans who arrived before tracking carry no source.</p>}
                >
                  <div class="flex justify-center">
                    <Donut segments={sourceSegments()} label="Fans by acquisition source">
                      <span class="text-lg font-bold tabular-nums text-foreground">
                        {Math.round((acq().tracked_fans / acq().active_fans) * 100)}%
                      </span>
                      <span class="text-xs text-muted-foreground">tracked</span>
                    </Donut>
                  </div>
                  <Legend segments={sourceSegments()} />
                </Show>
              </Widget>
            )}
          </Show>
        </div>
      </Section>
    </Show>

    {/* Prizes owed to draw winners — a chore with a person on the other
        end, so it sits with the week's moves. Silent when nothing is owed. */}
    <PrizesToSendPanel slug={params().slug} />

  </PageShell>
}

// ── Do this next ────────────────────────────────────────────────────
// The one ranked list the redesign opened with: answers owed first (a warm
// reply cools), then approval waves (expiry is a real deadline), then the
// next night's due steps, then the machine's ranked suggestions. A wave of
// same-kind letters is one row, not sixteen cards — the derived block's
// `approval_batches` does the folding cp-side, and the count row opens the
// whole batch on Needs you.

type NextMove = {
  title: string
  why: string
  to: string
  params: Record<string, string>
  search?: Record<string, string>
  hash?: string
}

/// A batch's name in the band's own words — "16 letters" reads better than
/// "16 Outreach Request". Kinds without a phrase fall back to the decision
/// kind's label, pluralised plainly.
const BATCH_KIND_PHRASE: Record<string, [string, string]> = {
  'outreach.request': ['letter', 'letters'],
  'booking.outreach.request': ['booking ask', 'booking asks'],
  'beacon.outreach.request': ['amplifier ask', 'amplifier asks'],
  'community.post': ['community post', 'community posts'],
  'social.post': ['post', 'posts'],
  'signal.push.request': ['push', 'pushes'],
  'opportunity.live.apply': ['application', 'applications'],
}
const batchPhrase = (kind: string, count: number) => {
  const pair = BATCH_KIND_PHRASE[kind]
  if (pair) return count === 1 ? pair[0] : pair[1]
  const base = labelOr(DECISION_KIND_LABELS, kind).toLowerCase()
  if (count === 1) return base
  return /(s|x|ch|sh)$/.test(base) ? `${base}es` : `${base}s`
}

function DoThisNext(props: {
  model: () => TenantTodayReadModel | undefined
  slug: string
  nextShow: { slug: string; title: string } | undefined
  nextShowSteps: { state: string; label: string; owner: string | null }[]
  weekMoves: OpportunityBoardEntry[]
}) {
  // recommended_action is a machine kind ("outreach.request") — the
  // briefing's own subject line is the human title when it carries one.
  const weekMoveTitle = (move: OpportunityBoardEntry) => {
    const subject = move.briefing?.content?.find(f => /temat|subject/i.test(f.label))?.value
    if (subject) return subject
    const [singular] = BATCH_KIND_PHRASE[move.recommended_action] ?? []
    if (singular) return `${singular[0]?.toUpperCase() ?? ''}${singular.slice(1)} to write`
    return labelOr(DECISION_KIND_LABELS, move.decision_kind)
  }
  // Ranked by how fast each thing rots: a person who wrote back cools off,
  // an approval expires, a show step has a date on it.
  const moves = createMemo((): NextMove[] => {
    const out: NextMove[] = []
    const waiting = props.model()?.reply_triage?.waiting_on_you ?? []
    for (const reply of waiting.slice(0, 2)) {
      // reply_label is the source's own words — quote it when it reads like
      // words. A SHOUTY_SNAKE token is a pipeline state, not their answer.
      const humanLabel = reply.reply_label && /[a-z]/.test(reply.reply_label)
      const answered = humanLabel
        ? `They wrote "${reply.reply_label}"`
        : reply.disposition === 'positive'
          ? 'They said yes'
          : 'They wrote back'
      out.push({
        title: `Answer ${reply.display_name}`,
        why: `${answered} ${formatIsoAge(reply.replied_at)} — a warm answer cools fast.`,
        to: '/tenants/$slug/operations',
        params: { slug: props.slug },
        search: { tab: 'replies' },
        hash: 'answered',
      })
    }
    // Approval waves as one row each — the derived batch already carries
    // the count and the soonest expiry.
    for (const batch of (props.model()?.derived?.approval_batches ?? []).slice(0, 3)) {
      out.push({
        title: `Approve ${batch.count > 1 ? `${batch.count} ` : ''}${batchPhrase(batch.action_kind, batch.count)}`,
        why: [
          batch.title ?? labelOr(CONTEXT_LABELS, batch.context),
          batch.earliest_expires_at ? `closes ${formatIsoUntil(batch.earliest_expires_at)}` : null,
        ].filter(Boolean).join(' · '),
        to: '/tenants/$slug/attention',
        params: { slug: props.slug },
        search: { tab: 'inbox' },
        hash: batch.count === 1 && typeof batch.action_ids[0] === 'string'
          ? `action=${batch.action_ids[0]}`
          : undefined,
      })
    }
    for (const step of props.nextShowSteps.filter(s => s.state === 'due').slice(0, 1)) {
      out.push({
        title: step.label,
        why: `Due for ${props.nextShow?.title ?? 'the next night'}${step.owner ? ` — ${step.owner}` : ''}`,
        to: '/tenants/$slug/shows/$eventSlug',
        params: { slug: props.slug, eventSlug: props.nextShow?.slug ?? '' },
      })
    }
    for (const move of props.weekMoves.slice(0, 2)) {
      out.push({
        title: weekMoveTitle(move),
        why: move.reason,
        to: '/tenants/$slug/attention',
        params: { slug: props.slug },
      })
    }
    return out.slice(0, 5)
  })


  // The cost line under the list: asks that died waiting and sends that
  // failed while the queue sat. Attention's own names, absent → silent.
  const attention = () => props.model()?.attention
  const lapsed = () => (attention()?.not_reported ?? []).includes('lapsed_approvals')
    ? null : (attention()?.lapsed_approvals?.total ?? null)
  const failedSends = () => (attention()?.not_reported ?? []).includes('failed_sends')
    ? null : (attention()?.failed_sends?.total ?? null)
  const totalWaiting = () => props.model()?.attention?.awaiting_approval

  return (
    <Section
      title="Do this next"
      icon={<SectionIcon name="target" />}
      count={totalWaiting() ?? undefined}
      description="Ranked by what rots first — a warm reply cools, an approval expires. Each row opens the control that does it."
    >
      <WorkList>
        <For each={moves()}>{move => (
          <WorkRow
            title={move.title}
            why={move.why}
            action={
              <Link
                to={move.to}
                params={move.params}
                search={move.search}
                hash={move.hash}
                class={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Open
              </Link>
            }
          />
        )}</For>
      </WorkList>
      <Show when={moves().length === 0}>
        <p class="text-sm text-muted-foreground">
          Nothing is waiting on you — the machine is working, and the first thing that needs a say lands here.
        </p>
      </Show>
      <Show when={(totalWaiting() ?? 0) > 0}>
        <Link
          to="/tenants/$slug/attention"
          params={{ slug: props.slug }}
          class="mt-3 inline-block text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {totalWaiting()} waiting on a decision in all — the full queue is on Needs you
        </Link>
      </Show>
      <Show when={(lapsed() ?? 0) + (failedSends() ?? 0) > 0}>
        <p class="mt-2 text-xs text-muted-foreground">
          While these waited: {[
            (lapsed() ?? 0) > 0 ? `${lapsed()} ask${lapsed() === 1 ? '' : 's'} expired unanswered` : null,
            (failedSends() ?? 0) > 0 ? `${failedSends()} send${failedSends() === 1 ? '' : 's'} failed` : null,
          ].filter(Boolean).join(' · ')}
        </p>
      </Show>
    </Section>
  )
}

// ── Next show ───────────────────────────────────────────────────────────
// The right-hand card beside the work list: where the night is, how far
// away, what the room holds, and the promotion steps as a checklist —
// done, or the anchor it runs on.

function NextShowCard(props: {
  slug: string
  show: { slug: string; title: string; venue: string | null; starts_at: string } | undefined
  /** The timeline event's venue_address, matched back to this show's slug. */
  address?: string | null
  showsLoaded: boolean
  days: number | null
  sales: { sold: number | null; capacity: number | null }
  checklist: { key: string; label: string; state: string; note?: string }[]
}) {
  // The venue field has carried a tour title where a room name belongs
  // (seen in production: venue == title). Where they collide, the address
  // line is the honest one to show.
  const where = () => {
    const s = props.show
    if (!s) return null
    const venue = s.venue && s.venue !== s.title ? s.venue : null
    const city = props.address?.split(',')[0] ?? null
    return [venue, city].filter(Boolean).join(' · ') || null
  }
  // Compact date for the card — "Fri 17 Oct, 19:30"; seconds carry nothing.
  const showDay = (iso: string) => {
    const t = new Date(iso)
    return Number.isNaN(t.getTime()) ? null
      : t.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }
  return (
    <Section
      title="Next show"
      icon={<SectionIcon name="map-pin" />}
      description="The nearest night on the books and how its promotion is going."
      action={<Link to="/tenants/$slug/shows" params={{ slug: props.slug }} class={buttonVariants({ variant: 'ghost', size: 'sm' })}>All shows</Link>}
    >
      <Show
        when={props.show}
        fallback={
          <Show when={props.showsLoaded}>
            <p class="text-sm text-muted-foreground">
              No upcoming night on the books — publish a gig in CrowdRelay and it lands{' '}
              <Link to="/tenants/$slug/shows" params={{ slug: props.slug }} class="underline underline-offset-2">here</Link>.
            </p>
          </Show>
        }
      >
        {show => (
          <div class="flex flex-col gap-4">
            <div class="flex items-center gap-4">
              <CountdownRing days={props.days} label={`Days until ${show().title}`} />
              <div class="min-w-0">
                <Link
                  to="/tenants/$slug/shows/$eventSlug"
                  params={{ slug: props.slug, eventSlug: show().slug }}
                  class="text-base font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  {show().title}
                </Link>
                <p class="mt-0.5 text-sm text-muted-foreground">
                  {[where(), showDay(show().starts_at)].filter(Boolean).join(' · ')}
                </p>
                <p class="mt-1 text-sm text-muted-foreground">
                  Tickets sold{' '}
                  <span class="font-medium tabular-nums text-foreground">
                    {props.sales.sold == null ? '—' : props.sales.sold}
                  </span>
                  <Show when={props.sales.capacity != null}>
                    {' '}of {props.sales.capacity}
                  </Show>
                </p>
              </div>
            </div>
            <Show when={props.checklist.length > 0}>
              <div class="border-t border-border pt-3">
                <StepChecklist steps={props.checklist} />
              </div>
            </Show>
          </div>
        )}
      </Show>
    </Section>
  )
}

// ── Is it working ───────────────────────────────────────────────────────
// The fan headline, then what the machine's approved work produced — folded
// into one row per kind by the read model ("4 pushes to fans · measuring"),
// because an outcome row per action id is a log, not an answer. On an older
// control plane the flat action list still renders.

/// A kind's words for what it did — "4 pushes to fans", not
/// `signal.push.request`. Kinds without a phrase pluralise the kind label.
const OUTCOME_KIND_PHRASE: Record<string, [string, string]> = {
  'signal.push.request': ['push to fans', 'pushes to fans'],
  'forum.post': ['forum post', 'forum posts'],
  'community.post': ['community post', 'community posts'],
  'community.engage.request': ['community reply', 'community replies'],
  'social.post': ['post', 'posts'],
  'outreach.request': ['letter', 'letters'],
  'booking.outreach.request': ['booking ask', 'booking asks'],
  'beacon.outreach.request': ['amplifier ask', 'amplifier asks'],
  'content.artifact.request': ['piece of content', 'pieces of content'],
  'agent.run.request': ['agent run', 'agent runs'],
  'show.growth.request': ['show push', 'show pushes'],
}
const outcomePhrase = (kind: string, count: number) => {
  const pair = OUTCOME_KIND_PHRASE[kind]
  if (pair) return `${count} ${count === 1 ? pair[0] : pair[1]}`
  const base = labelOr(DECISION_KIND_LABELS, kind).toLowerCase()
  return count === 1 ? base : `${count} ${base}s`
}

/// A measured metric's plain name — `fans_interested` reads "interested".
const METRIC_PHRASE: Record<string, string> = {
  fans_interested: 'interested',
  new_fans: 'new fans',
  new_fans_7d: 'new fans',
  active_fans: 'active fans',
  attendees: 'came',
  ticket_buyers: 'bought tickets',
  plays: 'plays',
}
const metricPhrase = (key: string) => METRIC_PHRASE[key] ?? key.replaceAll('_', ' ')

function IsItWorking(props: { model: () => TenantTodayReadModel | undefined; slug: string }) {
  const outcomes = useQuery(() => ({
    queryKey: ['ops-outcomes', props.slug],
    queryFn: () => api.opsOutcomes(props.slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  }))
  const audience = () => props.model()?.audience
  const activity = () => props.model()?.signal?.activity

  /// The group's honest verdict word. Mixed results name their parts —
  /// "1 improved · 2 flat" — instead of collapsing into one direction.
  const groupWord = (g: OutcomeGroup): { word: string; tone: 'good' | 'bad' | 'warn' | 'muted' } => {
    if (g.failed > 0) return { word: `${g.failed} failed`, tone: 'bad' }
    const parts: string[] = []
    if (g.improved > 0) parts.push(`${g.improved} improved`)
    if (g.worsened > 0) parts.push(`${g.worsened} went down`)
    if (g.neutral > 0) parts.push(`${g.neutral} no change`)
    if (parts.length > 0)
      return { word: parts.join(' · '), tone: g.worsened > 0 ? 'bad' : g.improved > 0 ? 'good' : 'muted' }
    if (g.pending > 0) return { word: 'measuring', tone: 'muted' }
    return { word: 'not measured yet', tone: 'muted' }
  }
  /// The freshest measured action's own result line — "1 interested" —
  /// appended when the group carried one.
  const groupResult = (g: OutcomeGroup): string | null => {
    const metric = (g.latest_metrics ?? []).find(m => m.observed != null)
    return metric ? `${metric.observed} ${metricPhrase(metric.metric)}` : null
  }

  return (
    <Section
      title="Is it working"
      icon={<SectionIcon name="trending-up" />}
      description="The fan headline, then what each approved ask produced in the last two weeks."
      action={<Link to="/tenants/$slug/audience" params={{ slug: props.slug }} class={buttonVariants({ variant: 'ghost', size: 'sm' })}>Audience</Link>}
    >
      <div class="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-md border border-border p-4">
        <span class="text-4xl font-bold tracking-tight tabular-nums text-foreground">
          <Show when={audience()?.marketing_consented_fans != null} fallback={<span class="text-muted-foreground">—</span>}>
            {audience()!.marketing_consented_fans!.toLocaleString()}
          </Show>
        </span>
        <span class="pb-1.5 text-sm text-muted-foreground">fans you can reach</span>
        <div class="flex flex-wrap gap-1.5 pb-1.5">
          <Show when={activity()?.new_fans_7d != null}>
            <DeltaBadge value={activity()!.new_fans_7d} label="new · 7d" />
          </Show>
          <Show when={activity()?.new_fans_30d != null}>
            <DeltaBadge value={activity()!.new_fans_30d} label="new · 30d" />
          </Show>
        </div>
      </div>
      <div class="mt-3 flex flex-col gap-2">
        <Show when={outcomes.data} fallback={
          <Show when={!outcomes.isPending}>
            <p class="text-sm text-muted-foreground">The outcome ledger could not be read — try refreshing.</p>
          </Show>
        }>
          {/* The grouped read is preferred; an older control plane without
              `groups` falls back to the flat action lines. */}
          <Show
            when={outcomes.data!.groups}
            fallback={
              <For each={outcomes.data!.actions ?? []}>{line => (
                <OutcomeRow
                  label={line.label ?? labelOr(DECISION_KIND_LABELS, line.kind)}
                  result={outcomeWord(line).word}
                  resultTone={outcomeWord(line).tone}
                  when={line.finished_at ? formatIsoAge(line.finished_at) : undefined}
                />
              )}</For>
            }
          >
            {groups => (
              <For each={groups()}>{g => (
                <OutcomeRow
                  label={outcomePhrase(g.kind, g.count)}
                  result={[groupWord(g).word, groupResult(g)].filter(Boolean).join(' — ')}
                  resultTone={groupWord(g).tone}
                  when={g.latest_finished_at ? formatIsoAge(g.latest_finished_at) : undefined}
                />
              )}</For>
            )}
          </Show>
          <Show when={(outcomes.data!.actions ?? []).length === 0}>
            <p class="text-sm text-muted-foreground">
              Nothing approved in the last {outcomes.data!.window_days ?? '—'} days — approve an ask above and what it produced lands here.
            </p>
          </Show>
        </Show>
      </div>
    </Section>
  )
}

/// The per-action verdict word, kept for the fallback path — a control
/// plane build without `groups` still renders honest rows.
function outcomeWord(line: { outcome_state: string; status: string; outcomes: { verdict: string | null }[] }) {
  if (line.status === 'failed') return { word: 'failed', tone: 'bad' as const }
  const verdict = line.outcomes.find(o => o.verdict)?.verdict
  if (verdict === 'improved') return { word: 'it worked', tone: 'good' as const }
  if (verdict === 'worsened') return { word: 'it went down', tone: 'bad' as const }
  if (verdict === 'neutral') return { word: 'no change yet', tone: 'muted' as const }
  if (line.outcome_state === 'pending') return { word: 'still measuring', tone: 'muted' as const }
  return { word: 'not measured yet', tone: 'muted' as const }
}
