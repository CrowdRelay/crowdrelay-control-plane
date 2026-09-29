import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, type JSX } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams, useRouterState } from '@tanstack/solid-router'
import { CircleCheck, Inbox, RefreshCw } from 'lucide-solid'
import { api, ApiError } from '../lib/api'
import { humanize } from '../lib/opportunity-labels'
import { authState } from '../lib/auth'
import { cn } from '../lib/cn'
import { toast } from '../components/app/toast'
import { fetchOperationsAttention, type BrainSelfAssessment, type TenantAttentionReadModel } from '../lib/attention'
import { whileIncomplete } from '../lib/incomplete'
import { refreshQueries } from '../lib/refresh'
import { relativeTime, formatTimestamp as observed, humanizeToken } from '../lib/format'
import type { OperationsSummary, ReconciliationFinding, TraceTimeline } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { TechId, TechIdList } from '../components/ui/TechnicalDetails'
import { WatchdogAlertsPanel } from '../components/WatchdogAlertsPanel'
import { UnpublishedDraftsPanel } from '../components/UnpublishedDraftsPanel'
import { LapsedApprovalsPanel, FailedSendsPanel, RejectedOutcomesPanel, BandNoticesPanel, UnansweredRepliesPanel } from '../components/QueueLossesPanel'
import { AttentionInbox } from '../components/AttentionInbox'
import { NeedsYouOverview, needsYouStatus } from '../components/NeedsYouOverview'
import { DashHeader, IconAct, SubPagePanel, useSubPage } from '../components/ui/dash'
import { OpportunityBoardPanel } from '../components/OpportunityBoardPanel'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { hasDegradedSections } from '../lib/incomplete'
import { EmptyState } from '../components/ui/empty-state'
import { SignalOverviewPanel } from '../components/SignalOverviewPanel'
import { DeadQueuesPanel } from '../components/DeadQueuesPanel'
import { ActionLedgerPanel } from '../components/ActionLedgerPanel'
import { SkeletonSection, SkeletonKpiStrip, SkeletonRows } from '../components/Skeleton'
import { SectionIcon, type IconName } from '../components/SectionIcon'
import { Spinner } from '../components/Spinner'
import { KpiCard, KpiStrip, PageShell, ErrorCard, SectionTitle, PanelTitle } from '../components/layout'
import { Button } from '../components/app/button'
import { Alert } from '../components/app/alert'
import { Card } from '../components/app/card'
import { Input } from '../components/ui/input'
import { Badge } from '../components/app/badge'

// Every lane must answer or the total is unknown — a partial sum looks
// like a real count, so missing lanes make null, not a smaller number.
const totalDead = (summary: OperationsSummary) => {
  const lanes = [summary.outbox?.dead, summary.deliveries?.dead, summary.push?.dead]
  return lanes.every((v): v is number => v != null) ? lanes.reduce((a, b) => a + b, 0) : null
}
const staleAreaReservations = (summary: OperationsSummary) => {
  const lanes = [summary.area?.stale_voucher_reservations, summary.area?.stale_ticket_reward_reservations]
  return lanes.every((v): v is number => v != null) ? lanes.reduce((a, b) => a + b, 0) : null
}

/** Format a Postgres server_version_num (e.g. 190000 → "19.0"). */
const formatPgVersion = (num: number | null | undefined): string => {
  if (num == null) return '—'
  const major = Math.floor(num / 10000)
  const minor = Math.floor((num % 10000) / 100)
  return minor === 0 ? `${major}` : `${major}.${minor}`
}

/** One heading shape for every section on the Inbox tab: a small title with
 *  its icon, one line of description, and whatever sits on the right. The tab
 *  used to draw five sections in four different ways. */
function InboxSection(props: { id?: string; icon: IconName; title: string; description: string; action?: JSX.Element; children: JSX.Element }) {
  return (
    <section id={props.id} class="space-y-3">
      <div class="flex items-start justify-between gap-4">
        <div>
          <PanelTitle as="h3" icon={<SectionIcon name={props.icon} />}>{props.title}</PanelTitle>
          <p class="mt-1 text-sm text-muted-foreground">{props.description}</p>
        </div>
        <Show when={props.action}><div class="shrink-0">{props.action}</div></Show>
      </div>
      {props.children}
    </section>
  )
}

/** One reconciliation finding. The surround says how loud it is; this says
 *  what it is, and is the same either way. */
function FindingBody(props: { finding: ReconciliationFinding }) {
  return (
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <strong class="text-foreground">{props.finding.summary}</strong>
        <small class="block text-sm text-muted-foreground">{humanizeToken(props.finding.kind)} · {props.finding.entity_label ?? props.finding.entity_type}</small>
        <Show when={props.finding.suggested_action}>
          <p class="text-sm text-muted-foreground mt-1 leading-relaxed">{props.finding.suggested_action}</p>
        </Show>
      </div>
      <StatusBadge
        status={props.finding.severity}
        tone={props.finding.severity === 'critical' ? 'bad' : props.finding.severity === 'warning' ? 'warn' : 'muted'}
      />
    </div>
  )
}

/** The brain's own account of itself: its verdict, how many cycles in a row
 *  it has done nothing, and the reason it recorded for the most recent one.
 *  A quiet system reads as patience rather than absence. */
function BrainPanel(props: { brain: BrainSelfAssessment | null | undefined; notReported: string[] }) {
  const brain = () => props.brain
  return (
    <InboxSection
      icon="brain"
      title="The brain's account of itself"
      description="Its verdict on its own recent performance and, when it has been doing nothing, the reason it gave."
      action={<Show when={brain()}>{b => <StatusBadge
        status={b().state ?? 'unknown'}
        tone={b().needs_attention ? 'bad' : b().state === 'improving' ? 'good' : 'muted'}
      />}</Show>}
    >
      <Show
        when={brain()}
        fallback={
          <EmptyState icon={<Inbox />}
            label={props.notReported.includes('brain') ? 'Not reported' : 'No self-assessment yet'}
            hint={props.notReported.includes('brain')
              ? (authState.isPlatformLevel()
                ? 'This tenant does not publish a brain self-assessment.'
                : 'No self-assessment is published yet.')
              : 'The brain forms a verdict once it has enough days of North Star readings.'}
          />
        }
      >
        {b => <Card class="space-y-2 p-4">
          <div class="flex items-center gap-3 flex-wrap text-sm">
            <span class="text-muted-foreground">North star verdict over <strong class="text-foreground">{b().days_observed ?? 0}</strong> observed day{(b().days_observed ?? 0) === 1 ? '' : 's'}</span>
            <Show when={(b().quiet_cycles ?? 0) > 0}>
              <span class="text-muted-foreground">·</span>
              <span class={b().needs_attention ? 'text-destructive' : 'text-warning-foreground'}>
                quiet for <strong>{b().quiet_cycles}</strong> consecutive cycle{b().quiet_cycles === 1 ? '' : 's'}
              </span>
            </Show>
          </div>
          <Show when={b().latest_wait_reason}>
            {reason => <p class="text-sm text-muted-foreground leading-relaxed">
              Last quiet cycle explained itself: <span class="font-mono text-xs text-foreground">{reason()}</span>
            </p>}
          </Show>
          <Show when={(b().quiet_cycles ?? 0) > 0 && !b().latest_wait_reason}>
            <p class="text-sm text-muted-foreground leading-relaxed">
              The quiet cycles carried no recorded reason. The wait went unexplained, which is itself worth knowing.
            </p>
          </Show>
        </Card>}
      </Show>
    </InboxSection>
  )
}

export type AttentionSection = 'overview' | 'decisions' | 'inbox' | 'queues' | 'runtime' | 'trace'

const SECTION_TITLE: Record<AttentionSection, string> = {
  overview: 'Needs you',
  decisions: 'Decision history',
  inbox: 'Inbox',
  queues: 'Queues',
  runtime: 'Runtime',
  trace: 'Trace',
}

export const AttentionOverviewPage = () => <TenantAttentionPage section="overview" />
export const AttentionDecisionsPage = () => <TenantAttentionPage section="decisions" />
export const AttentionInboxPage = () => <TenantAttentionPage section="inbox" />
export const AttentionQueuesPage = () => <TenantAttentionPage section="queues" />
export const AttentionRuntimePage = () => <TenantAttentionPage section="runtime" />
export const AttentionTracePage = () => <TenantAttentionPage section="trace" />

export function TenantAttentionPage(props: { section: AttentionSection }) {
  const params = useParams({ strict: false }) as () => { slug: string }
  // Decisions is the default tab: a queue of decisions is what a person has.
  const areas = useSubPage(() => props.section, '/tenants/$slug/attention')
  // Open a work area, then scroll to something inside it once it mounts.
  // A lazy panel can take several hundred ms to render — retry for ~1s like
  // the layout system's revealAnchor does, then give up rather than spin.
  const revealAnchor = (id: string, anchor?: string) => {
    areas.open(id)
    if (!anchor) return
    let attempts = 0
    const scroll = () => {
      const element = document.getElementById(anchor)
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      else if (attempts++ < 60) requestAnimationFrame(scroll)
    }
    requestAnimationFrame(scroll)
  }
  const isVisited = (id: string) => areas.active() === id
  // Which tab owns which anchor. The failed-queue sections live in Queues;
  // everything else an alert or inbox item points at is on the Inbox tab.
  const reveal = (anchor: string) => revealAnchor(anchor.startsWith('dead-') ? 'queues' : 'inbox', anchor)
  const attention = useQuery(() => ({
    queryKey: ['tenant-operator-attention-snapshot', params().slug],
    queryFn: () => fetchOperationsAttention(params().slug),
    // The first screen reads `today` alone; this snapshot feeds the Inbox and
    // the platform tabs, so it waits until one of them is opened.
    enabled: isVisited('inbox') || isVisited('queues') || isVisited('runtime'),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 20_000,
    // `not_reported` is this model's degraded list: sections the tenant could
    // not answer arrive inside a 200, so nothing retries them by default.
    refetchInterval: whileIncomplete((m: TenantAttentionReadModel) => (m.not_reported ?? []).length > 0),
  }))

  // The ranked decision queue lives in the operations read model. Identical
  // observer options to the other 'tenant-today' consumers: a shared key
  // with mismatched retry rules lets the first mount win.
  const operations = useQuery(() => ({
    queryKey: ['tenant-today', params().slug],
    queryFn: () => api.tenantToday(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))

  // `#…&action=<id>` links point at inbox rows, but the inbox panel does not
  // mount until its tab is visited, so the parse lives here where it always
  // runs. Tracked against the router's hash (not read once at mount) so a
  // second deep link clicked while the page is already open still reveals —
  // an onMount-only parse silently ignored it. `on` tracks the hash alone:
  // the reveal calls `navigate`, whose synchronous `router.load()` reads the
  // router's store signals, and tracking those re-ran this effect on every
  // load it caused — an endless navigate/load loop that froze the tab.
  const currentHash = useRouterState({ select: s => s.location.hash })
  createEffect(on(currentHash, hash => {
    const match = hash.match(/action=([0-9a-f-]+)/i)
    if (match) revealAnchor('inbox', `attention-item-approval-${match[1]}`)
  }))

  const summary = {
    get data() { return attention.data?.summary },
    get error() { return attention.error },
    get isLoading() { return attention.isLoading },
  }

  const [confirmingReconcile, setConfirmingReconcile] = createSignal(false)
  const [busy, setBusy] = createSignal('')
  const [timelineInput, setTimelineInput] = createSignal('')
  const [timeline, setTimeline] = createSignal<Awaited<ReturnType<typeof api.operationTimeline>> | null>(null)
  const [traceResult, setTraceResult] = createSignal<TraceTimeline | null>(null)
  const [showRequestId, setShowRequestId] = createSignal(false)

  const refreshMaintenance = async () => {
    // An inbox approve must not leave the same action listed on the
    // decisions board until its own refetch interval notices.
    await Promise.all([attention.refetch(), operations.refetch()])
    refreshQueries(['tenant-brain', params().slug], ['tenant-delivery', params().slug])
  }
  const refreshing = () => attention.isFetching || operations.isFetching

  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now()
    const ts = Math.max(attention.dataUpdatedAt, operations.dataUpdatedAt)
    return ts === 0 ? null : relativeTime(ts)
  })

  const reconcile = async () => {
    if (busy()) return
    if (!confirmingReconcile()) {
      setConfirmingReconcile(true)
      toast.info('Click again to run the check. It only reads — nothing is changed.')
      return
    }
    setBusy('reconcile')
    try {
      const result = await api.runReconciliation(params().slug)
      setConfirmingReconcile(false)
      toast.success(`Reconciliation finished: ${result.findings.length} finding(s), status ${humanizeToken(result.run.status)}.`)
      await refreshMaintenance()
    } catch (error) {
      toast.error("Couldn't run reconciliation", error)
    } finally {
      setBusy('')
    }
  }

  const lookupTimeline = async () => {
    const id = timelineInput().trim()
    if (!id || busy()) return
    setBusy('timeline')
    setTimeline(null)
    setTraceResult(null)
    try {
      setTimeline(await api.operationTimeline(params().slug, id))
    } catch (error) {
      // A UUID that is not a request id may still be a trace id — the
      // ledger's causal key joins a different set of tables than the
      // request-correlation timeline does.
      if (error instanceof ApiError && error.status === 404) {
        try {
          setTraceResult(await api.operationTrace(params().slug, id))
          return
        } catch (traceError) {
          toast.error("Couldn't load the trace", traceError)
          return
        }
      }
      toast.error("Couldn't load the timeline", error)
    } finally {
      setBusy('')
    }
  }

  const findingsCount = () => attention.data?.findings?.length ?? 0
  // Editable draft text by action id. The attention snapshot's needs_you
  // summaries carry no `revisable`; the full PendingAutopilotAction rows do,
  // under the same `tenant-today` query the decisions tab already runs.
  const drafts = createMemo(() => {
    const out: Record<string, Record<string, string>> = {}
    for (const action of operations.data?.autopilot?.needs_you ?? []) {
      if (action.revisable && Object.keys(action.revisable).length > 0) out[action.id] = action.revisable
    }
    return out
  })

  return <PageShell>
    <DashHeader
      title={SECTION_TITLE[props.section]}
      subtitle="What waits for your yes"
      pill={needsYouStatus(operations.data)}
      actions={
        <IconAct onClick={() => void refreshMaintenance()} disabled={refreshing()} label="Refresh" title={updated() ? `Updated ${updated()}` : 'Refresh'}>
          <RefreshCw class={cn('size-3.5', refreshing() && 'animate-spin')} aria-hidden="true" />
        </IconAct>
      }
    />

    <Show when={operations.error}>
      <SectionFailureCard error={operations.error} title="Couldn't load what needs you" onRetry={() => void operations.refetch()} />
    </Show>


    {/* The answer to "is anything mine" is the Overview tab's body: every
        figure here is a queue on one of the tabs to its right. */}
    <SubPagePanel when={areas.active() === 'overview'}>
      <Show when={!operations.error && !operations.data}>
        <SkeletonKpiStrip count={4} />
        <SkeletonSection titleWidth="160px" lines={4} minHeight="200px" />
      </Show>
      <Show when={operations.data}>
        {data => (
          <NeedsYouOverview
            slug={params().slug}
            model={data()}
            onOpenDecisions={() => areas.open('decisions')}
            refresh={() => void operations.refetch()}
          />
        )}
      </Show>
    </SubPagePanel>

    {/* ─── Decisions ─────────────────────────────────────────────── */}
    <SubPagePanel when={areas.active() === 'decisions'}>
      <Show when={operations.error}>
        <SectionFailureCard error={operations.error} title="Couldn't load decisions" onRetry={() => void operations.refetch()} />
      </Show>
      <Show when={!operations.error && !operations.data}>
        <SkeletonSection titleWidth="160px" lines={4} minHeight="160px" />
      </Show>
      <Show when={operations.data} keyed>{(data) => (
        <OpportunityBoardPanel
          slug={params().slug}
          opportunities={data.opportunities ?? null}
          degraded={data.degraded.includes('opportunities')}
          refresh={() => operations.refetch()}
        />
      )}</Show>
    </SubPagePanel>

    {/* ─── Inbox ─────────────────────────────────────────────────── */}
    <SubPagePanel when={areas.active() === 'inbox'}>
      <Show when={summary.error}>
        <ErrorCard title="Couldn't load the Needs you list" error={summary.error} />
      </Show>
      <Show when={!summary.error && !summary.data}>
        <SkeletonSection titleWidth="200px" lines={3} minHeight="120px" />
        <SkeletonSection titleWidth="180px" lines={4} minHeight="140px" />
      </Show>

      <Show when={!summary.error && summary.data}>
        <div class="space-y-8">
          <WatchdogAlertsPanel alerts={attention.data?.alerts ?? []} slug={params().slug} onReveal={reveal} />

          <AttentionInbox
            slug={params().slug}
            needsYou={attention.data?.needs_you ?? []}
            deadJobs={summary.data ? totalDead(summary.data) : null}
            criticalAlerts={summary.data?.watchdog?.critical_alerts ?? null}
            staleReservations={summary.data ? staleAreaReservations(summary.data) : null}
            activeAlerts={summary.data?.watchdog?.active_alerts ?? null}
            awaitingApproval={(attention.data?.not_reported ?? []).includes('awaiting_approval') ? null : attention.data?.awaiting_approval ?? null}
            notReported={attention.data?.not_reported ?? []}
            drafts={drafts()}
            onRefresh={refreshMaintenance}
            onReveal={revealAnchor}
          />

          {/* The queue where people wait on the band — replies nobody has
              answered. Ahead of every other queue: a person who wrote back
              is warmer than anything the machine can propose. */}
          <UnansweredRepliesPanel
            replies={attention.data?.unanswered_replies}
            notReported={attention.data?.not_reported ?? []}
          />

          {/* The post queue, in both lanes — what the machine is carrying
              and what waits for a person. */}
          <UnpublishedDraftsPanel
            drafts={attention.data?.unpublished_drafts ?? []}
            automatic={attention.data?.automatic_queue}
            notReported={attention.data?.not_reported ?? []}
          />

          {/* The queue's other half — what the inbox above already lost. The
              pending list shows what is waiting; these show what reached its
              deadline and which sends never arrived, named by who missed out. */}
          <LapsedApprovalsPanel
            lapsed={attention.data?.lapsed_approvals}
            notReported={attention.data?.not_reported ?? []}
          />
          <FailedSendsPanel
            slug={params().slug}
            failed={attention.data?.failed_sends}
            notReported={attention.data?.not_reported ?? []}
          />
          <RejectedOutcomesPanel
            outcomes={attention.data?.rejected_agent_outcomes}
            notReported={attention.data?.not_reported ?? []}
          />
          <BandNoticesPanel
            notices={attention.data?.band_notices}
            notReported={attention.data?.not_reported ?? []}
          />

          <BrainPanel
            brain={attention.data?.brain}
            notReported={attention.data?.not_reported ?? []}
          />

          {/* Console↔tenant reconciliation is operator machinery — it compares
              two systems' beliefs, which is not a question the band asks. */}
          <Show when={authState.isPlatformLevel()}>
            <InboxSection
              id="reconciliation-findings"
              icon="refresh-cw"
              title="Cross-check against the tenant"
              description="Compares what this console believes about the tenant with what the tenant reports. It only reads."
              action={
                <Button writes variant={confirmingReconcile() ? 'default' : 'outline'} size="sm" disabled={!!busy()} onClick={() => void reconcile()}>
                  {busy() === 'reconcile' && <Spinner />}
                  {busy() === 'reconcile' ? 'Checking…' : confirmingReconcile() ? 'Yes, run the check' : 'Run the check'}
                </Button>
              }
            >
              <Show when={attention.data?.ecosystem}><KpiStrip class="mb-0">
                <KpiCard
                  label="Open findings"
                  value={attention.data!.ecosystem!.open_findings}
                  sub="differences nobody has closed yet"
                  tone={attention.data!.ecosystem!.open_findings > 0 ? 'warn' : 'default'}
                />
                <KpiCard
                  label="Last check"
                  value={humanize(attention.data!.ecosystem!.last_reconciliation?.status ?? '—')}
                  sub={observed(attention.data!.ecosystem!.last_reconciliation?.finished_at ?? null)}
                />
                <KpiCard
                  label="Bandsintown sync"
                  value={attention.data!.ecosystem!.bandsintown_sync?.consecutive_failures ?? '—'}
                  sub={attention.data!.ecosystem!.bandsintown_sync?.in_progress ? 'running now' : attention.data!.ecosystem!.bandsintown_sync ? 'failures in a row' : 'not reported'}
                  tone={(attention.data!.ecosystem!.bandsintown_sync?.consecutive_failures ?? 0) > 0 ? 'warn' : 'default'}
                />
              </KpiStrip></Show>
              <Show when={findingsCount() > 0} fallback={
                <EmptyState icon={<CircleCheck />} label="Nothing disagrees" hint="The last check found no difference between what this console believes and what the tenant reports." />
              }>
                <div class="flex flex-col gap-3">
                  <For each={attention.data?.findings ?? []}>{finding =>
                    <Alert tone={finding.severity === 'critical' ? 'destructive' : 'warning'}>
                      <FindingBody finding={finding} />
                    </Alert>
                  }</For>
                </div>
              </Show>
            </InboxSection>
          </Show>
        </div>
      </Show>
    </SubPagePanel>

    {/* ─── Queues ────────────────────────────────────────────────── */}
    <SubPagePanel when={areas.active() === 'queues'}>
      <DeadQueuesPanel
        slug={params().slug}
        summary={summary.data}
        deadOutbox={attention.data?.dead_outbox}
        deadDeliveries={attention.data?.dead_deliveries}
        deadPush={attention.data?.dead_push}
        error={attention.error}
        isLoading={attention.isLoading}
        onRefresh={refreshMaintenance}
      />
    </SubPagePanel>

    {/* ─── Runtime ───────────────────────────────────────────────── */}
    <SubPagePanel when={areas.active() === 'runtime'}>
      <Show when={summary.error}>
        <ErrorCard title="Couldn't load the runtime summary" error={summary.error} />
      </Show>
      <SectionTitle title="Database health" icon={<SectionIcon name="database" />} action={<Show when={summary.data}>{data => <StatusBadge status={data().database.async_io_active ? 'async I/O active' : 'check I/O'} tone={data().database.async_io_active ? 'good' : 'warn'} />}</Show>} />
      <Show when={!summary.error && summary.data} fallback={<Show when={!summary.error}><SkeletonRows count={4} /></Show>}>
        {data => <KpiStrip class="mb-0" min="9rem">
          <KpiCard label="Pool" value={`${data().database.pool_size}/${data().database.pool_max}`} sub={`${data().database.pool_idle} idle`} />
          <KpiCard label="Postgres" value={formatPgVersion(data().database.server_version_num)} sub={data().database.io_method ?? 'I/O method unknown'} />
          <KpiCard label="Effective I/O concurrency" value={data().database.effective_io_concurrency ?? '—'} sub={`workers ${data().database.io_workers ?? '—'}`} />
          <KpiCard label="Maintenance I/O" value={data().database.maintenance_io_concurrency ?? '—'} sub={`max ${data().database.io_max_concurrency ?? '—'}`} />
        </KpiStrip>}
      </Show>

      <SectionTitle title="Reservation maintenance" icon={<SectionIcon name="map-pin" />} action={<Show when={summary.data}>{data => <StatusBadge status={(() => { const n = staleAreaReservations(data()); return n == null ? 'not fully reported' : n > 0 ? `${n} stale` : 'clean' })()} tone={(() => { const n = staleAreaReservations(data()); return n == null ? 'muted' : n > 0 ? 'bad' : 'good' })()} />}</Show>} />
      <Show when={!summary.error && summary.data} fallback={<Show when={!summary.error}><SkeletonRows count={4} /></Show>}>
        {data => <KpiStrip class="mb-0" min="9rem">
          <KpiCard label="Stale vouchers" value={data().area.stale_voucher_reservations} sub={`${data().area.vouchers_issued} issued`} tone={data().area.stale_voucher_reservations > 0 ? 'bad' : 'default'} />
          <KpiCard label="Stale ticket rewards" value={data().area.stale_ticket_reward_reservations} sub={`${data().area.ticket_rewards_issued} issued`} tone={data().area.stale_ticket_reward_reservations > 0 ? 'bad' : 'default'} />
          <KpiCard label="Credits" value={data().area.credits_total} sub="current total" />
          <KpiCard label="Legacy imports" value={data().area.legacy_imported_players} sub="players migrated" />
        </KpiStrip>}
      </Show>

      <SignalOverviewPanel slug={params().slug} />
    </SubPagePanel>

    {/* ─── Trace ─────────────────────────────────────────────────── */}
    <SubPagePanel when={areas.active() === 'trace'}>
      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">Metadata-only trace of one request across audit, outbox, delivery and operator actions. A trace ID from the action ledger works too.</p>
        <form class="flex flex-col gap-2 sm:flex-row" onSubmit={e => { e.preventDefault(); void lookupTimeline() }}>
          <Input class="sm:max-w-md" value={timelineInput()} onInput={(event) => setTimelineInput(event.currentTarget.value)} placeholder="Request, correlation or trace ID" aria-label="Request, correlation or trace ID" />
          <Button type="submit" variant="outline" disabled={!timelineInput().trim() || !!busy()}>{busy() === 'timeline' ? 'Tracing…' : 'Trace'}</Button>
        </form>
        <Show when={timeline()}>{result => <Card class="p-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <PanelTitle as="h3" icon={<SectionIcon name="history" />}>{result().events.length} timeline event{result().events.length === 1 ? '' : 's'}</PanelTitle>
              <Button variant="link" size="sm" class="h-auto px-0" onClick={() => setShowRequestId(v => !v)}>{showRequestId() ? 'Hide request ID' : 'Show request ID'}</Button>
              <Show when={showRequestId()}><code class="block break-all text-xs text-muted-foreground">{result().request_id}</code></Show>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setTimeline(null)}>Close</Button>
          </div>
          <ol class="mt-3 divide-y divide-border border-t border-border">
            <For each={result().events}>{event => <li class="py-3 text-sm">
              <div class="flex flex-wrap items-center gap-1.5">
                <Badge variant="muted">{humanizeToken(event.source)}</Badge>
                <Badge variant="outline">{humanizeToken(event.kind)}</Badge>
              </div>
              <p class="mt-1.5 text-muted-foreground">{observed(event.occurred_at)} · {event.status != null ? humanizeToken(event.status) : '—'} · {event.target_type != null ? humanizeToken(event.target_type) : '—'}</p>
            </li>}</For>
          </ol>
        </Card>}</Show>
        <Show when={traceResult()}>{result => <Card class="p-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <PanelTitle as="h3" icon={<SectionIcon name="history" />}>{result().events.length} trace event{result().events.length === 1 ? '' : 's'}</PanelTitle>
              <div class="mt-1"><TechId label="trace" value={result().trace_id} /></div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setTraceResult(null)}>Close</Button>
          </div>
          <ol class="mt-3 divide-y divide-border border-t border-border">
            <For each={result().events}>{event => <li class="py-3 text-sm">
              <div class="flex flex-wrap items-center gap-1.5">
                <Badge variant="muted">{humanizeToken(event.source)}</Badge>
                <Badge variant="outline">{humanizeToken(event.kind)}</Badge>
                <Show when={event.state}><Badge variant="outline">{humanizeToken(event.state!)}</Badge></Show>
                <Badge variant="outline">{humanizeToken(event.certainty)}</Badge>
              </div>
              <p class="mt-1.5 text-muted-foreground">
                {observed(event.occurred_at)}
              </p>
              <TechIdList class="mt-0.5" ids={[
                { label: 'action', value: event.action_id },
                { label: 'decision', value: event.decision_id },
                { label: 'causation', value: event.causation_id },
                { label: 'event', value: event.event_id },
              ]} />
            </li>}</For>
          </ol>
        </Card>}</Show>
        <ActionLedgerPanel slug={params().slug} />
      </div>
    </SubPagePanel>
  </PageShell>
}
