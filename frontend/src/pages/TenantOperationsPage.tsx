import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link, useNavigate, useParams, useRouterState } from '@tanstack/solid-router'
import { Activity, Bot, ChartLine, Inbox, MapPin, RefreshCw, Send, Target, Ticket, Users } from 'lucide-solid'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { formatTimestamp, formatIsoAge, formatIsoUntil, relativeTime } from '../lib/format'
import { cn } from '../lib/cn'
import { ReplyTriagePanel } from '../components/ReplyTriagePanel'
import { NegotiationsPanel } from '../components/NegotiationsPanel'
import { OutreachPipelinePanel } from '../components/OutreachPipelinePanel'
import { OpportunityShortlistPanel } from '../components/OpportunityShortlistPanel'
import { PressRoomPanel } from '../components/PressRoomPanel'
import { ReleaseCampaignsPanel } from '../components/ReleaseCampaignsPanel'
import { ReleasePlanPanel } from '../components/ReleasePlanPanel'
import { OutreachWavesPanel } from '../components/OutreachWavesPanel'
import { PrizesToSendPanel } from '../components/PrizesToSendPanel'
import { PlayLedgerPanel } from '../components/PlayLedgerPanel'
import { SkeletonSection } from '../components/Skeleton'
import { BarList, DeltaBadge, Donut, Legend, Ring, StackBar, Widget, type Segment } from '../components/charts'
import { PageShell, PageHeader, Section, SkeletonBlock, TabBar, TabPanel, useTabPanels } from '../components/layout'
import { SectionIcon } from '../components/SectionIcon'
import { StatusBadge } from '../components/StatusBadge'
import { TenantStatusLine } from '../components/TenantStatusLine'
import { buttonVariants } from '../components/app/button'
import { Button } from '../components/app/button'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { Alert } from '../components/app/alert'
import { CONTEXT_LABELS, DECISION_KIND_LABELS, SUBJECT_KIND_LABELS, labelOr } from '../lib/opportunity-labels'
import { operationalTone, operationalLabel } from '../lib/health-tone'
import type { TenantTodayReadModel } from '../lib/types'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'

const TONE_DOT = {
  good: 'bg-success-foreground',
  warn: 'bg-warning-foreground',
  bad: 'bg-error-foreground',
  muted: 'bg-muted-foreground/40',
} as const

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
  reply_triage: 'Reply triage',
  shows: 'Shows',
  attention: 'Needs you',
  next_show_timeline: 'The next show timeline',
}
const sectionLabel = (key: string) => OPS_SECTION_LABEL[key] ?? key

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
  const growth = () => d()?.growth
  const autopilot = () => d()?.autopilot
  const summary = () => d()?.summary
  const deadJobs = () => {
    const s = summary()
    if (!s) return 0
    return s.outbox.dead + s.deliveries.dead + s.push.dead
  }
  const healthTone = () => operationalTone(summary())
  const healthLabel = () => operationalLabel(summary())
  // The operator's health vocabulary is the read model's own words; the band
  // gets the same states in the words its console uses — "attention" is
  // "needs you", and a degraded machine is just something broken.
  const healthBadgeLabel = () => {
    const label = healthLabel()
    if (authState.isPlatformLevel()) return label
    return label === 'attention' ? 'needs you' : label === 'degraded' ? 'something is broken' : label
  }

  // Whether the autopilot is *working*, not merely switched on. Failures
  // outnumbering successes is bad; some failures is a warning; dispatched
  // and never confirmed is bad however few failures were reported.
  const autopilotTone = (): 'good' | 'warn' | 'bad' | undefined => {
    const a = autopilot()
    if (!a) return undefined
    if (a.awaiting_executor > 0 && a.executor_confirmed_24h === 0) return 'bad'
    if (a.failed_24h === 0) return a.awaiting_executor > 0 ? 'warn' : a.succeeded_24h > 0 ? 'good' : undefined
    return a.failed_24h >= a.succeeded_24h ? 'bad' : 'warn'
  }

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
  const needsYouCount = () => autopilot()?.needs_you?.length ?? 0
  const awaitingApproval = () => d()?.opportunities?.filter(o => o.authority === 'awaiting_approval').length ?? 0

  // "The change this month" has two honest readings already in the
  // composite: arrivals (`new_fans_30d`, rolling) and the net population
  // delta (`delta_28d` on the signal.active_fans series). A stale series
  // cannot speak for this month, so it does not render.
  const activeFansTrend = createMemo(() =>
    model.data?.growth_metrics?.series?.find(
      s => s.platform === 'signal' && s.metric_key === 'active_fans' && !s.stale,
    ),
  )
  // The next show — the timeline of the nearest upcoming night for the
  // two-or-three steps that still need a person.
  const shows = useQuery(() => ({
    queryKey: ['tenant-shows', params().slug],
    queryFn: () => api.shows(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))
  const nextShow = createMemo(() =>
    (shows.data?.events ?? [])
      .filter(e => e.upcoming)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0],
  )
  const nextShowTimeline = useQuery(() => ({
    queryKey: ['tenant-show-timeline', params().slug, nextShow()?.slug ?? ''],
    queryFn: () => api.showTimeline(params().slug, nextShow()!.slug),
    enabled: nextShow() != null,
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  }))
  // Due steps outrank active ones; within each rank the timeline's own
  // T-21→T+7 order stands. Three at most — a list of ten is a list nobody
  // works. The global queryClient keeps previous data across a key change,
  // so the payload must be matched back to the show it's about — otherwise
  // one refresh renders last month's steps under next month's title.
  const nextShowTimelineData = createMemo(() => {
    const tl = nextShowTimeline.data
    return tl && tl.event.slug === nextShow()?.slug ? tl : undefined
  })
  const nextShowSteps = createMemo(() => {
    const rank = { due: 0, active: 1 } as const
    return (nextShowTimelineData()?.steps ?? [])
      .filter(s => s.state === 'due' || s.state === 'active')
      .sort((a, b) => rank[a.state as keyof typeof rank] - rank[b.state as keyof typeof rank])
      .slice(0, 3)
  })

  // ── Widget data ──────────────────────────────────────────────────────
  // A section named in `degraded` never answered — its count is absent, not
  // zero. The waiting widget reads `autopilot` and `opportunities`, so when
  // either is degraded the total is unknown and "nothing to decide" is a lie.
  const waitingDegraded = () => {
    const deg = d()?.degraded ?? []
    return deg.includes('autopilot') || deg.includes('opportunities')
  }
  const waitingTotal = () => needsYouCount() + awaitingApproval()
  const waitingSegments = (): Segment[] => [
    { key: 'needs-you', label: authState.isPlatformLevel() ? 'Autopilot approvals' : 'Approvals', value: needsYouCount(), class: 'bg-chart-1' },
    { key: 'opportunities', label: 'Opportunities to approve', value: awaitingApproval(), class: 'bg-chart-4' },
  ]
  const queues = () => {
    const s = summary()
    return s
      ? [
          { label: 'Outbox', summary: s.outbox },
          { label: 'Deliveries', summary: s.deliveries },
          { label: 'Push', summary: s.push },
        ]
      : []
  }
  const deliveredShare = () => {
    const t = growth()?.totals
    if (!t) return null
    const all = t.delivered + t.pending + t.failed
    return all === 0 ? null : t.delivered / all
  }
  const autopilotSegments = (): Segment[] => {
    const a = autopilot()
    return [
      { key: 'succeeded', label: 'Succeeded · 24h', value: a?.succeeded_24h ?? 0, class: 'bg-success-foreground' },
      { key: 'awaiting', label: authState.isPlatformLevel() ? 'Waiting on a worker' : 'Waiting to run', value: a?.awaiting_executor ?? 0, class: 'bg-chart-4' },
      { key: 'failed', label: 'Failed · 24h', value: a?.failed_24h ?? 0, class: 'bg-error-foreground' },
    ]
  }
  const reachShare = () => {
    const a = d()?.audience
    return a && a.active_fans > 0 ? a.marketing_consented_fans / a.active_fans : null
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
        // Hidden for now — the widgets below already carry health and the
        // autopilot state; kept in the tree so it can come back with a class.
        <div class="hidden">
          <Show when={model.data && !model.error}>
            <StatusBadge status={healthBadgeLabel()} tone={healthTone()} />
            <Show when={autopilot()?.runtime_enabled}>
              <StatusBadge status={authState.isPlatformLevel() ? 'autopilot on' : 'working on its own'} tone="good" />
            </Show>
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
      {/* A section the tenant could not answer is named here once, above the
          widgets, so "0" below is never read as "checked and empty". */}
      <For each={model.data!.degraded}>{section => (
        <Alert tone="warning" role="status" class="mb-4">
          <strong>{sectionLabel(section)}</strong> couldn't be checked right now — the rest of the page keeps working and it recovers on the next poll.
        </Alert>
      )}</For>
      {/* Four widgets: is anything mine, is anything broken, is work going
          out, is the autopilot working. Each draws its answer before it
          spells it out. */}
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Widget
          label="Waiting for you"
          icon={<Inbox class="size-4" aria-hidden="true" />}
          action={<Show when={waitingTotal() > 0}>
            <Link to="/tenants/$slug/attention" params={{ slug: params().slug }} class="font-medium text-primary underline-offset-4 hover:underline">Decide</Link>
          </Show>}
        >
          <div class="flex items-baseline gap-2">
            <span class={cn('text-3xl font-bold tabular-nums', waitingTotal() > 0 ? 'text-warning-foreground' : 'text-foreground')}>{waitingDegraded() ? '—' : waitingTotal()}</span>
            <span class="text-sm text-muted-foreground">{waitingDegraded() ? 'couldn\'t be checked' : waitingTotal() > 0 ? 'on Needs you' : 'nothing to decide'}</span>
          </div>
          <StackBar label="What is waiting" segments={waitingSegments()} class="mt-auto" />
          <Legend segments={waitingSegments()} />
        </Widget>

        <Widget
          label="Health"
          icon={<Activity class="size-4" aria-hidden="true" />}
          action={<Show when={authState.isPlatformLevel()}>
            <Link to="/tenants/$slug/health" params={{ slug: params().slug }} class="font-medium text-primary underline-offset-4 hover:underline">Details</Link>
          </Show>}
        >
          <div class="flex items-center gap-2">
            <span class={cn('size-2.5 rounded-full', TONE_DOT[deadJobs() > 0 ? 'bad' : healthTone()])} aria-hidden="true" />
            <span class="text-2xl font-bold capitalize text-foreground">{healthBadgeLabel()}</span>
          </div>
          {/* One bar per queue: sent in the last day, still waiting, stuck. */}
          <ul class="mt-auto flex flex-col gap-2.5">
            <For each={queues()}>{q => (
              <li class="flex flex-col gap-1">
                <div class="flex justify-between text-xs">
                  <span class="text-muted-foreground">{q.label}</span>
                  <span class={cn('tabular-nums', q.summary.dead > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                    {q.summary.dead > 0 ? `${q.summary.dead} stuck` : `${q.summary.delivered_24h.toLocaleString()} sent · 24h`}
                  </span>
                </div>
                <StackBar
                  label={`${q.label} queue`}
                  class="h-1.5"
                  segments={[
                    { key: 'sent', label: 'Sent · 24h', value: q.summary.delivered_24h, class: 'bg-success-foreground' },
                    { key: 'waiting', label: 'In flight', value: q.summary.pending + q.summary.processing, class: 'bg-chart-4' },
                    { key: 'stuck', label: 'Stuck', value: q.summary.dead, class: 'bg-error-foreground' },
                  ]}
                />
              </li>
            )}</For>
          </ul>
        </Widget>

        <Widget label="Growth delivered" icon={<Send class="size-4" aria-hidden="true" />}>
          <div class="flex items-center gap-4">
            <Ring value={deliveredShare()} label="Share of growth sends delivered" class="size-20" arcClass="stroke-success-foreground">
              <span class="text-sm font-semibold tabular-nums text-foreground">
                {deliveredShare() == null ? '—' : `${Math.round(deliveredShare()! * 100)}%`}
              </span>
            </Ring>
            <div class="flex min-w-0 flex-col gap-1">
              <span class="text-3xl font-bold tabular-nums text-foreground">{metric(growth()?.totals.delivered)}</span>
              <span class="text-sm text-muted-foreground">delivered</span>
            </div>
          </div>
          <Legend
            class="mt-auto"
            segments={[
              { key: 'pending', label: 'Still to send', value: growth()?.totals.pending ?? 0, class: 'bg-chart-4' },
              { key: 'failed', label: 'Failed sends', value: growth()?.totals.failed ?? 0, class: 'bg-error-foreground' },
            ]}
          />
        </Widget>

        <Widget
          label={authState.isPlatformLevel() ? 'Autopilot' : 'The brain'}
          icon={<Bot class="size-4" aria-hidden="true" />}
          action={<Show when={authState.isPlatformLevel()}>
            {/* The switches live on Health → Policies, which the band's
                map does not carry — for the band the widget ends at the
                counts. The link lands on the policies tab, not the status
                page the operator then has to leave again. */}
            <Link to="/tenants/$slug/health" params={{ slug: params().slug }} search={{ tab: 'policies' }} class="font-medium text-primary underline-offset-4 hover:underline">Settings</Link>
          </Show>}
        >
          <div class="flex items-center gap-2">
            <span class={cn('size-2.5 rounded-full', autopilot()?.runtime_enabled ? TONE_DOT[autopilotTone() ?? 'good'] : 'bg-muted-foreground/40')} aria-hidden="true" />
            <span class="text-2xl font-bold text-foreground">{autopilot()?.runtime_enabled ? 'On' : 'Off'}</span>
            <span class="text-sm text-muted-foreground">
              · {autopilot()?.queued_actions ?? 0} {authState.isPlatformLevel() ? 'queued' : 'waiting'}
            </span>
          </div>
          {/* The last day's runs. `queued_actions` counts what has not been
              handed out yet; dispatched and never confirmed is the number
              that says the loop has stopped. */}
          <StackBar label="Autopilot runs in the last 24 hours" segments={autopilotSegments()} class="mt-auto" />
          <Legend segments={autopilotSegments()} />
        </Widget>
      </div>
    </Show>

    {/* The human gate, named — the widget above counts what is waiting,
        this names the three-or-so asks that are actually parked on a
        person. The full queue (dead queues, alerts, findings) stays on
        Needs you; every row lands on the tab that owns it. */}
    <Show when={model.data && !model.error}>
      <NeedsYouStrip model={d} slug={params().slug} />
    </Show>

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

    {/* The next night — under the fans, before the machine. Up to three
        steps that still need a person; the whole block is one door into
        the gig page. No upcoming show says so plainly — an absent night
        is a fact, not a skeleton. */}
    <Show when={nextShow()}>
      {show => (
        <Section
          title="The next night"
          icon={<SectionIcon name="map-pin" />}
          description="The nearest show on the books and what it still needs."
        >
          <Link
            to="/tenants/$slug/shows/$eventSlug"
            params={{ slug: params().slug, eventSlug: show().slug }}
            class="group block rounded-md border border-border p-4 transition-colors hover:border-foreground/30"
          >
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span class="text-lg font-semibold text-foreground group-hover:underline">{show().title}</span>
              <span class="text-sm text-muted-foreground">{formatTimestamp(show().starts_at)}</span>
              <Show when={show().venue}><span class="text-sm text-muted-foreground">· {show().venue}</span></Show>
            </div>
            <div class="mt-3 flex flex-col gap-1.5">
              <For each={nextShowSteps()}>{step => (
                <div class="flex items-center gap-2 text-sm">
                  <StatusBadge
                    status={step.state}
                    tone={step.state === 'due' ? 'warn' : 'muted'}
                  />
                  <span class="text-foreground">{step.label}</span>
                  <Show when={step.owner}><span class="text-muted-foreground">— {step.owner}</span></Show>
                </div>
              )}</For>
              <Show when={nextShowTimelineData() && nextShowSteps().length === 0}>
                <span class="text-sm text-muted-foreground">Everything on track — nothing waiting on a person.</span>
              </Show>
            </div>
          </Link>
        </Section>
      )}
    </Show>
    <Show when={shows.data && !nextShow()}>
      <p class="text-sm text-muted-foreground">
        No upcoming show on the books — publish a gig in CrowdRelay and the next announced night lands{' '}
        <Link to="/tenants/$slug/shows" params={{ slug: params().slug }} class="underline underline-offset-2">here</Link>.
      </p>
    </Show>

    {/* Worth doing this week — the three moves that carry most of it.
        Each row is one door into the decision queue on Needs you, where
        the real approve/dismiss buttons live. A degraded section hides
        the whole block; an empty queue says so plainly. Moved here from
        the tenant page — the moves are the operational read, not settings. */}
    <Show when={d()?.opportunities}>
      <Section
        title="Worth doing this week"
        icon={<SectionIcon name="target" />}
        description="The moves that carry most of it, ranked upstream. Needs you has the approve buttons."
      >
        <div class="flex flex-col gap-3">
          <For each={weekMoves()}>{move => (
            <Link
              to="/tenants/$slug/attention"
              params={{ slug: params().slug }}
              class="group block rounded-md border border-border p-3 transition-colors hover:border-foreground/30"
            >
              <div class="flex items-baseline gap-2">
                <span class="text-sm font-medium text-foreground group-hover:underline">{move.recommended_action}</span>
              </div>
              <p class="mt-1 text-xs leading-relaxed text-muted-foreground">{move.reason}</p>
              <Show when={move.consequence}>
                <p class="mt-1 text-xs text-warning-foreground">If nobody acts: {move.consequence}</p>
              </Show>
            </Link>
          )}</For>
          <Show when={weekMoves().length === 0}>
            <p class="text-sm text-muted-foreground">Nothing needs you this week — the queue is empty.</p>
          </Show>
        </div>
      </Section>
    </Show>

    {/* Prizes owed to draw winners — a chore with a person on the other
        end, so it sits with the week's moves. Silent when nothing is owed. */}
    <PrizesToSendPanel slug={params().slug} />

    {/* Tab bar — static, renders immediately. Count callbacks return 0
        while data is pending, which is the correct placeholder. */}
    <TabBar
      active={activeTab()}
      onChange={switchTab}
      onPrefetch={prefetch}
      tabs={[
        { id: 'replies', label: 'Replies' },
        { id: 'negotiations', label: 'Negotiations' },
        { id: 'outreach', label: 'Outreach' },
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
  </PageShell>
}

// ── Needs-you strip ──────────────────────────────────────────────────
// The merged human gate, bounded: the asks parked on a person, capped so
// the strip stays a worklist and not a second inbox. Every row is a door
// into the Needs-you queue — approvals deep-link to their inbox row, the
// rest land on the tab that owns them. A healthy-empty queue renders
// nothing: the widget band already carries "nothing to decide".
// `model` is the page's accessor, not a snapshot: reconcile patches or
// replaces the read model on every poll, and a captured object would freeze
// the strip at whatever the first fetch returned.
function NeedsYouStrip(props: { model: () => TenantTodayReadModel | undefined; slug: string }) {
  const attention = () => props.model()?.attention
  const degraded = () => props.model()?.degraded.includes('attention') ?? false
  const notReported = (name: string) => (attention()?.not_reported ?? []).includes(name)

  // Approvals that die soonest lead — expiry is the only ordering the
  // queue itself insists on. Three at most: the "+N more" row owns the
  // rest so the strip never becomes the inbox it points at.
  const approvals = createMemo(() =>
    (attention()?.needs_you ?? [])
      .slice()
      .sort((a, b) => (a.approval_expires_at ?? '9999').localeCompare(b.approval_expires_at ?? '9999'))
      .slice(0, 3),
  )
  const drafts = () => notReported('unpublished_drafts') ? [] : (attention()?.unpublished_drafts ?? [])
  const draftsTotal = () => drafts().reduce((n, c) => n + c.drafts, 0)
  const draftsMeta = () => {
    const channels = drafts().map(c => c.channel).join(' · ')
    const oldest = drafts().map(c => c.oldest_drafted_at).filter((t): t is string => t != null).sort()[0]
    return [channels, oldest ? `oldest ${formatIsoAge(oldest)}` : null].filter(Boolean).join(' · ')
  }
  // The queue's losses — asks that died waiting and sends that failed.
  // They are not work (nothing to approve twice), so they close the
  // strip as a cost line rather than rows.
  const lapsed = () => notReported('lapsed_approvals') ? 0 : (attention()?.lapsed_approvals?.total ?? 0)
  const failedSends = () => notReported('failed_sends') ? 0 : (attention()?.failed_sends?.total ?? 0)
  const overflow = () => Math.max(0, (attention()?.awaiting_approval ?? 0) - approvals().length)
  const count = () => {
    const a = attention()
    if (!a || degraded()) return undefined
    return (notReported('awaiting_approval') ? approvals().length : (a.awaiting_approval ?? 0)) + draftsTotal()
  }
  const visible = () =>
    degraded()
    || approvals().length > 0
    || draftsTotal() > 0
    || lapsed() + failedSends() > 0
    || notReported('needs_you')
    || notReported('awaiting_approval')

  return (
    <Show when={visible()}>
      <div id="needs-you">
        <Section
          title="Needs you"
          icon={<SectionIcon name="inbox" />}
          count={count()}
          description="The asks only a person can say yes to. The full queue — dead sends, alerts, findings — lives on Needs you."
          action={
            <Link to="/tenants/$slug/attention" params={{ slug: props.slug }} class={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Open the queue
            </Link>
          }
        >
          <div class="flex flex-col gap-3">
            <Show when={degraded()}>
              <Alert tone="warning" title="The needs-you queue did not answer">
                Approvals and drafts may be parked that this strip cannot see — the section is named in the page's degraded list and keeps retrying.
              </Alert>
            </Show>
            <Show when={notReported('needs_you') || notReported('awaiting_approval')}>
              <Alert tone="info" title="Pending approvals are not reported">
                This build does not publish the approval queue — work may be parked awaiting a decision without appearing here.
              </Alert>
            </Show>
            <For each={approvals()}>{action => (
              <Link
                to="/tenants/$slug/attention"
                params={{ slug: props.slug }}
                search={{ tab: 'inbox' }}
                hash={`action=${action.id}`}
                class="group flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:border-foreground/30"
              >
                <div class="min-w-0">
                  <span class="text-sm font-medium text-foreground group-hover:underline">
                    Approve {labelOr(DECISION_KIND_LABELS, action.action_kind)}
                  </span>
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    {[action.title ?? labelOr(CONTEXT_LABELS, action.context), labelOr(SUBJECT_KIND_LABELS, action.subject_kind)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Show when={action.approval_expires_at}>
                  {expires => <span class="shrink-0 text-xs text-warning-foreground">closes {formatIsoUntil(expires())}</span>}
                </Show>
              </Link>
            )}</For>
            <Show when={overflow() > 0}>
              <Link
                to="/tenants/$slug/attention"
                params={{ slug: props.slug }}
                search={{ tab: 'inbox' }}
                class="group block rounded-md border border-dashed border-border p-3 transition-colors hover:border-foreground/30"
              >
                <span class="text-sm text-muted-foreground group-hover:text-foreground">
                  +{overflow()} more waiting on a decision — the queue has all of them
                </span>
              </Link>
            </Show>
            <Show when={draftsTotal() > 0}>
              <Link
                to="/tenants/$slug/attention"
                params={{ slug: props.slug }}
                search={{ tab: 'inbox' }}
                class="group flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:border-foreground/30"
              >
                <div class="min-w-0">
                  <span class="text-sm font-medium text-foreground group-hover:underline">
                    {draftsTotal()} draft{draftsTotal() === 1 ? '' : 's'} written — nothing posted yet
                  </span>
                  <Show when={draftsMeta()}>
                    <p class="mt-0.5 text-xs text-muted-foreground">{draftsMeta()}</p>
                  </Show>
                </div>
                <span class="shrink-0 text-xs text-muted-foreground">publish on Needs you</span>
              </Link>
            </Show>
            <Show when={lapsed() + failedSends() > 0}>
              <p class="text-xs text-muted-foreground">
                While these waited: {[
                  lapsed() > 0 ? `${lapsed()} ask${lapsed() === 1 ? '' : 's'} expired unanswered` : null,
                  failedSends() > 0 ? `${failedSends()} send${failedSends() === 1 ? '' : 's'} failed` : null,
                ].filter(Boolean).join(' · ')}
              </p>
            </Show>
          </div>
        </Section>
      </div>
    </Show>
  )
}
