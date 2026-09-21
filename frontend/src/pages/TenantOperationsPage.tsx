import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link, useParams } from '@tanstack/solid-router'
import { RefreshCw } from 'lucide-solid'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { formatTimestamp, relativeTime } from '../lib/format'
import { cn } from '../lib/cn'
import { ReplyTriagePanel } from '../components/ReplyTriagePanel'
import { NegotiationsPanel } from '../components/NegotiationsPanel'
import { OutreachPipelinePanel } from '../components/OutreachPipelinePanel'
import { OpportunityShortlistPanel } from '../components/OpportunityShortlistPanel'
import { PressRoomPanel } from '../components/PressRoomPanel'
import { ReleaseCampaignsPanel } from '../components/ReleaseCampaignsPanel'
import { PlayLedgerPanel } from '../components/PlayLedgerPanel'
import { ListingPanel } from '../components/ListingPanel'
import { AttestationsPanel } from '../components/AttestationsPanel'
import { SkeletonKpiStrip, SkeletonSection } from '../components/Skeleton'
import { Eyebrow, KpiCard, KpiStrip, PageShell, PageHeader, Section, SkeletonBlock, TabBar, TabPanel, useTabPanels } from '../components/layout'
import { SectionIcon } from '../components/SectionIcon'
import { StatusBadge } from '../components/StatusBadge'
import { TenantStatusLine } from '../components/TenantStatusLine'
import { buttonVariants } from '../components/app/button'
import { Button } from '../components/app/button'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { operationalTone, operationalLabel } from '../lib/health-tone'
import type { TenantOperationsReadModel } from '../lib/types'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'

const metric = (value: number | undefined | null, suffix = '') =>
  value == null ? '—' : `${value.toLocaleString()}${suffix}`

// The machine's surfaces for one tenant: replies, outreach, press, releases
// and the play ledger, each on its own tab. Decisions live on Needs you; the
// first figure here says how many are waiting and points there.
export function TenantOperationsPage() {
  const params = useParams({ from: '/tenants/$slug/operations' })
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('replies')
  const model = useQuery(() => ({
    queryKey: ['tenant-operations', params().slug],
    queryFn: () => api.tenantOperations(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // A section the tenant could not answer lands here as 200 with the
    // section named in `degraded`, so nothing retries it and the panel
    // stays empty for the life of the tab. Keep asking until it fills.
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))
  const refresh = () => void model.refetch()

  const d = (): TenantOperationsReadModel | undefined => model.error ? undefined : model.data
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
  const needsYouCount = () => autopilot()?.needs_you.length ?? 0
  const awaitingApproval = () => d()?.opportunities?.filter(o => o.authority === 'awaiting_approval').length ?? 0
  const hasAttention = () => needsYouCount() > 0 || awaitingApproval() > 0 || deadJobs() > 0

  // "The change this month" has two honest readings already in the
  // composite: arrivals (`new_fans_30d`, rolling) and the net population
  // delta (`delta_28d` on the signal.active_fans series). A stale series
  // cannot speak for this month, so it does not render.
  const activeFansTrend = createMemo(() =>
    model.data?.growth_metrics?.series?.find(
      s => s.platform === 'signal' && s.metric_key === 'active_fans' && !s.stale,
    ),
  )
  // "Where they came from" rides the same composite — the acquisition
  // section covers every tracked fan (concert QR, imports, purchases), not
  // just click-attributed signups. "Most came from X" is only claimed when
  // the top source actually beat the untracked bucket.
  const topSource = createMemo(() => {
    const acq = model.data?.acquisition_sources
    const top = acq?.sources?.[0]
    if (!acq || !top || acq.tracked_fans === 0) return null
    return {
      name: top.source.replaceAll('_', ' '),
      fans: top.fans,
      // "Most came from X" means an actual majority of all fans — beating
      // the untracked bucket alone only proves a plurality.
      majority: top.fans * 2 > acq.active_fans,
    }
  })
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
        <>
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
        </>
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
      <SkeletonKpiStrip count={4} />
      <SkeletonBlock style={{ 'min-height': '120px' }} />
    </Show>

    <Show when={model.data && !model.error}>
      {/* Four figures: is anything mine, is anything broken, is work going
          out, is the autopilot working. */}
      <KpiStrip>
        <KpiCard
          label="Waiting for you"
          tone={hasAttention() ? 'warn' : 'good'}
          value={needsYouCount() + awaitingApproval()}
          sub={needsYouCount() + awaitingApproval() > 0
            ? <Link to="/tenants/$slug/attention" params={{ slug: params().slug }} class="text-primary underline-offset-4 hover:underline">decide on Needs you</Link>
            : 'nothing to decide'}
        />
        <KpiCard
          label="Health"
          tone={deadJobs() > 0 ? 'bad' : healthTone() === 'good' ? 'good' : healthTone() === 'warn' ? 'warn' : 'default'}
          value={healthBadgeLabel()}
          sub={deadJobs() > 0 ? `${deadJobs()} stuck deliveries` : 'everything is moving'}
        />
        <KpiCard
          label="Growth delivered"
          value={metric(growth()?.totals.delivered)}
          sub={`${metric(growth()?.totals.pending)} still to send`}
        />
        <KpiCard
          label={authState.isPlatformLevel() ? 'Autopilot' : 'The brain'}
          tone={autopilot()?.runtime_enabled ? autopilotTone() ?? 'good' : 'default'}
          value={autopilot()?.runtime_enabled ? 'on' : 'off'}
          sub={<>
            <Show when={(autopilot()?.failed_24h ?? 0) > 0}>
              {metric(autopilot()!.failed_24h)} failed today ·{' '}
            </Show>
            {/* `queued_actions` counts what has not been handed out yet; a
                backlog that was dispatched and never confirmed is the number
                that says the loop has stopped. */}
            <Show when={(autopilot()?.awaiting_executor ?? 0) > 0}>
              {autopilot()!.awaiting_executor} {authState.isPlatformLevel() ? 'waiting on a worker' : 'waiting to run'} ·{' '}
            </Show>
            {autopilot()?.queued_actions ?? 0} {authState.isPlatformLevel() ? 'queued' : 'waiting'}
            {/* The switches live on Health, which the band's map does not
                carry — for the band the card ends at the counts. */}
            <Show when={authState.isPlatformLevel()}>
              {' · '}
              <Link to="/tenants/$slug/health" params={{ slug: params().slug }} class="text-primary underline-offset-4 hover:underline">
                change settings
              </Link>
            </Show>
          </>}
        />
      </KpiStrip>
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
        {/* The headline — "are we getting more fans" in one read. Reach
            is the send-path definition: active fans holding current
            marketing consent, not followers, not a raw total. */}
        <div class="flex flex-wrap items-end gap-x-10 gap-y-3">
          <div class="flex flex-col gap-1">
            <span class="text-3xl font-bold tabular-nums text-foreground">
              <Show when={d()?.audience?.marketing_consented_fans != null} fallback={<span class="text-muted-foreground">—</span>}>
                {d()!.audience!.marketing_consented_fans!.toLocaleString()}
              </Show>
            </span>
            <Eyebrow>Fans you can reach</Eyebrow>
          </div>
          <Show when={d()?.signal?.activity?.new_fans_7d != null}>
            <div class="flex flex-col gap-1">
              <span class="text-lg font-semibold tabular-nums text-success-foreground">+{d()!.signal!.activity!.new_fans_7d!.toLocaleString()}</span>
              <Eyebrow>new · 7 days</Eyebrow>
            </div>
          </Show>
          <Show when={d()?.signal?.activity?.new_fans_30d != null}>
            <div class="flex flex-col gap-1">
              <span class="text-lg font-semibold tabular-nums text-foreground">+{d()!.signal!.activity!.new_fans_30d!.toLocaleString()}</span>
              <Eyebrow>new · 30 days</Eyebrow>
            </div>
          </Show>
          <Show when={activeFansTrend()?.delta_28d != null}>
            <div class="flex flex-col gap-1">
              <span class="text-lg font-semibold tabular-nums text-foreground">
                {activeFansTrend()!.delta_28d! >= 0 ? '+' : ''}{activeFansTrend()!.delta_28d!.toLocaleString()}
              </span>
              <Eyebrow>net active fans · 28d</Eyebrow>
            </div>
          </Show>
        </div>
        <p class="mt-1 text-xs text-muted-foreground">
          Active fans who consented to be contacted — the number the send paths actually enforce.
          <Show when={topSource()}>{src => ` ${src().majority ? `Most fans arrived via ${src().name}` : `Top source so far: ${src().name}`} (${src().fans.toLocaleString()} fans).`}</Show>
        </p>
        {/* Where they came from — first-touch over the acquisition
            ledger, top sources with this month's arrivals. Fans who
            predate the ledger count as untracked, not as a made-up
            source. A degraded section simply does not render. */}
        <Show when={d()?.acquisition_sources}>
          {acq => (
            <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <For each={(acq().sources ?? []).slice(0, 4)}>{s => (
                <span>
                  <span class="text-foreground">{s.source.replaceAll('_', ' ')}</span>
                  {` ${s.fans.toLocaleString()}`}
                  {s.fans_30d > 0 ? ` (+${s.fans_30d.toLocaleString()} · 30d)` : ''}
                </span>
              )}</For>
              <Show when={acq().active_fans - acq().tracked_fans > 0}>
                <span>{(acq().active_fans - acq().tracked_fans).toLocaleString()} with no source recorded</span>
              </Show>
              <Show when={acq().tracked_fans === 0}>
                <span>No acquisition sources recorded yet — fans who arrived before tracking carry no source.</span>
              </Show>
            </div>
          )}
        </Show>
        {/* A measured zero is not a failure to hide — it is the state
            the whole product exists to change, so the empty card says
            where the first fans actually come from instead of padding
            itself with placeholder graphics. */}
        <Show when={d()?.audience?.active_fans === 0}>
          <p class="mt-3 text-sm text-muted-foreground">
            No fans yet — the first ones arrive when a door QR gets scanned at a show or a source connects.{' '}
            <Link to="/tenants/$slug/audience" params={{ slug: params().slug }} class="underline underline-offset-2">
              Audience sources
            </Link>
          </p>
        </Show>
        <div class="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 md:grid-cols-3 lg:grid-cols-5">
          <For each={[
            { term: 'Active fans', value: d()?.audience?.active_fans },
            { term: 'Ticket buyers', value: d()?.audience?.ticket_buyers },
            { term: 'Attendees', value: d()?.audience?.attendees },
            { term: 'Paid orders', value: d()?.audience?.paid_ticket_orders },
            { term: 'Qualified referrals', value: d()?.audience?.qualified_referrals },
          ]}>{kpi => (
            <div class="flex flex-col gap-1">
              <span class="text-xl font-bold tabular-nums text-foreground">
                <Show when={kpi.value != null} fallback={<span class="text-muted-foreground">—</span>}>{kpi.value!.toLocaleString()}</Show>
              </span>
              <Eyebrow>{kpi.term}</Eyebrow>
            </div>
          )}</For>
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
        { id: 'listing', label: 'Listing' },
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
      <OutreachPipelinePanel slug={params().slug} />
      <OpportunityShortlistPanel />
    </TabPanel>
    <TabPanel active={activeTab()} id="press" visited={isVisited('press')}>
      <PressRoomPanel slug={params().slug} />
    </TabPanel>
    <TabPanel active={activeTab()} id="releases" visited={isVisited('releases')}>
      <ReleaseCampaignsPanel slug={params().slug} />
    </TabPanel>
    <TabPanel active={activeTab()} id="plays" visited={isVisited('plays')}>
      <PlayLedgerPanel slug={params().slug} />
    </TabPanel>

    {/* ── Listing tab ── */}
    {/* §4h-12: the band-authored profile a share link admits an agent or
        label to, the representation contacts it may approach, and the
        month's allowance. Its own queries — the overview model doesn't
        carry any of it. */}
    <TabPanel active={activeTab()} id="listing" visited={isVisited('listing')}>
      <ListingPanel slug={params().slug} />
      <AttestationsPanel slug={params().slug} />
    </TabPanel>
  </PageShell>
}
