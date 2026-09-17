import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { RefreshCw } from 'lucide-solid'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { cn } from '../lib/cn'
import { toast } from '../components/app/toast'
import { fetchOperationsAttention, type BrainSelfAssessment, type TenantAttentionReadModel } from '../lib/attention'
import { whileIncomplete } from '../lib/incomplete'
import { errorMessage, relativeTime, formatTimestamp as observed } from '../lib/format'
import type { OperationsSummary, ReconciliationFinding } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { WatchdogAlertsPanel } from '../components/WatchdogAlertsPanel'
import { UnpublishedDraftsPanel } from '../components/UnpublishedDraftsPanel'
import { AttentionInbox } from '../components/AttentionInbox'
import { OpportunityBoardPanel } from '../components/OpportunityBoardPanel'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { hasDegradedSections } from '../lib/incomplete'
import { EmptyState } from '../components/ui/empty-state'
import { SignalOverviewPanel } from '../components/SignalOverviewPanel'
import { DeadQueuesPanel } from '../components/DeadQueuesPanel'
import { SkeletonSection, SkeletonKpiStrip, SkeletonRows } from '../components/Skeleton'
import { SectionIcon, type IconName } from '../components/SectionIcon'
import { Spinner } from '../components/Spinner'
import { TabBar, TabPanel, useTabPanels, KpiCard, KpiStrip, PageShell, PageHeader, ErrorCard, SectionTitle, PanelTitle } from '../components/layout'
import { Button } from '../components/app/button'
import { Alert } from '../components/app/alert'
import { Card } from '../components/app/card'
import { Input } from '../components/ui/input'
import { Badge } from '../components/app/badge'

const totalDead = (summary: OperationsSummary) => summary.outbox.dead + summary.deliveries.dead + summary.push.dead
const staleAreaReservations = (summary: OperationsSummary) => summary.area.stale_voucher_reservations + summary.area.stale_ticket_reward_reservations

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
        <small class="block text-sm text-muted-foreground">{props.finding.kind} · {props.finding.entity_label ?? props.finding.entity_type}</small>
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
          <EmptyState
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

export function TenantAttentionPage() {
  const params = useParams({ from: '/tenants/$slug/attention' })
  // Decisions is the default tab: a queue of decisions is what a person has.
  const { activeTab, switchTab, prefetch, revealAnchor, isVisited } = useTabPanels('decisions', ['decisions', 'inbox', 'queues', 'runtime', 'trace'])
  // Which tab owns which anchor. The failed-queue sections live in Queues;
  // everything else an alert or inbox item points at is on the Inbox tab.
  const reveal = (anchor: string) => revealAnchor(anchor.startsWith('dead-') ? 'queues' : 'inbox', anchor)
  const attention = useQuery(() => ({
    queryKey: ['tenant-operator-attention-snapshot', params().slug],
    queryFn: () => fetchOperationsAttention(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 20_000,
    // `not_reported` is this model's degraded list: sections the tenant could
    // not answer arrive inside a 200, so nothing retries them by default.
    refetchInterval: whileIncomplete((m: TenantAttentionReadModel) => (m.not_reported ?? []).length > 0),
  }))

  // The ranked decision queue lives in the operations read model. Identical
  // observer options to the other 'tenant-operations' consumers: a shared key
  // with mismatched retry rules lets the first mount win.
  const operations = useQuery(() => ({
    queryKey: ['tenant-operations', params().slug],
    queryFn: () => api.tenantOperations(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))

  // Mirror the board's own approvability test — an awaiting_approval entry
  // with no action_id is filed under "Noted, no action taken", not Needs you.
  const decideCount = () => operations.data?.opportunities?.filter(o => o.authority === 'awaiting_approval' && o.action_id !== null).length ?? 0

  // `#…&action=<id>` links point at inbox rows, but the inbox panel does not
  // mount until its tab is visited, so the parse lives here where it always
  // runs. The reveal mounts the panel; the inbox's own handler then scrolls.
  onMount(() => {
    const match = window.location.hash.match(/action=([0-9a-f-]+)/i)
    if (match) revealAnchor('inbox', `attention-item-approval-${match[1]}`)
  })

  const summary = {
    get data() { return attention.data?.summary },
    get error() { return attention.error },
    get isLoading() { return attention.isLoading },
  }

  const [confirmingReconcile, setConfirmingReconcile] = createSignal(false)
  const [busy, setBusy] = createSignal('')
  const [timelineInput, setTimelineInput] = createSignal('')
  const [timeline, setTimeline] = createSignal<Awaited<ReturnType<typeof api.operationTimeline>> | null>(null)
  const [showRequestId, setShowRequestId] = createSignal(false)

  const refreshMaintenance = async () => {
    // An inbox approve must not leave the same action listed on the
    // decisions board until its own refetch interval notices.
    await Promise.all([attention.refetch(), operations.refetch()])
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
      toast.success(`Reconciliation finished: ${result.findings.length} finding(s), status ${result.run.status}.`)
      await refreshMaintenance()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reconciliation failed')
    } finally {
      setBusy('')
    }
  }

  const lookupTimeline = async () => {
    const requestId = timelineInput().trim()
    if (!requestId || busy()) return
    setBusy('timeline')
    try {
      setTimeline(await api.operationTimeline(params().slug, requestId))
    } catch (error) {
      setTimeline(null)
      toast.error(error instanceof Error ? error.message : 'Timeline unavailable')
    } finally {
      setBusy('')
    }
  }

  const deadCount = () => summary.data ? totalDead(summary.data) : 0
  const findingsCount = () => attention.data?.findings?.length ?? 0
  const draftCount = () => (attention.data?.unpublished_drafts ?? []).reduce((sum, c) => sum + c.drafts, 0)
  const activeAlerts = () => summary.data?.watchdog.active_alerts ?? 0
  const criticalAlerts = () => summary.data?.watchdog.critical_alerts ?? 0
  const openFindings = () => attention.data?.ecosystem?.open_findings ?? 0

  return <PageShell>
    <PageHeader
      title={authState.isPlatformLevel() ? 'Attention' : 'Needs you'}
      description={authState.isPlatformLevel()
        ? 'What needs a decision, what is wrong right now, and the checks you can run yourself.'
        : 'What needs a decision and what is wrong right now.'}
      actions={
        <>
          <Show when={updated()}><span class="text-sm text-muted-foreground">Updated {updated()}</span></Show>
          <Button variant="outline" size="sm" onClick={() => void refreshMaintenance()} disabled={refreshing()} aria-label="Refresh">
            <RefreshCw class={cn(refreshing() && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </>
      }
    />

    {/* The answer to "is anything mine" before any tab: every figure here
        is a queue on one of the tabs below. The header used to carry one
        badge summarising all of them as healthy, watch or attention required,
        and the counts were only visible after opening the right tab. */}
    <Show when={!attention.error && !attention.data}>
      <SkeletonKpiStrip count={4} />
    </Show>
    <Show when={attention.data}>
      <KpiStrip>
        <KpiCard label="Decisions" value={decideCount()} tone={decideCount() > 0 ? 'warn' : 'good'} sub={decideCount() > 0 ? 'waiting for you' : 'nothing to decide'} />
        <KpiCard label="Open alerts" value={activeAlerts()} tone={criticalAlerts() > 0 ? 'bad' : activeAlerts() > 0 ? 'warn' : 'good'}
          sub={criticalAlerts() > 0 ? `${criticalAlerts()} critical` : 'checked every 5 minutes'} />
        <KpiCard label="Drafts to publish" value={draftCount()} tone={draftCount() > 0 ? 'warn' : 'default'} sub={draftCount() > 0 ? 'written, not posted' : 'everything is posted'} />
        <Show when={authState.isPlatformLevel()}>
          <KpiCard label="Dead deliveries" value={deadCount()} tone={deadCount() > 0 ? 'bad' : 'good'} sub={deadCount() > 0 ? 'will not retry on their own' : 'everything is moving'} />
          <KpiCard label="Open findings" value={openFindings()} tone={openFindings() > 0 ? 'warn' : 'default'} sub="console and tenant disagree" />
        </Show>
      </KpiStrip>
    </Show>

    <TabBar
      active={activeTab()}
      onChange={switchTab}
      onPrefetch={prefetch}
      tabs={[
        { id: 'decisions', label: 'Decisions', count: decideCount() > 0 ? () => decideCount() : undefined },
        { id: 'inbox', label: 'Inbox' },
        // Delivery machinery and decision tracing are operator surfaces —
        // the band gets the queue and the alerts, not the plumbing.
        // Deep links (?tab=queues) still resolve.
        ...(authState.isPlatformLevel() ? [
          { id: 'queues', label: 'Queues', count: deadCount() > 0 ? () => deadCount() : undefined },
          { id: 'runtime', label: 'Runtime' },
          { id: 'trace', label: 'Trace' },
        ] : []),
      ]}
    />

    {/* ─── Decisions ─────────────────────────────────────────────── */}
    <TabPanel active={activeTab()} id="decisions" visited={isVisited('decisions')}>
      <Show when={operations.error}>
        <SectionFailureCard error={operations.error} fallback="Decision queue unavailable" onRetry={() => void operations.refetch()} />
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
    </TabPanel>

    {/* ─── Inbox ─────────────────────────────────────────────────── */}
    <TabPanel active={activeTab()} id="inbox" visited={isVisited('inbox')}>
      <Show when={summary.error}>
        <ErrorCard>{errorMessage(summary.error, 'Operations attention snapshot unavailable')}</ErrorCard>
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
            deadJobs={summary.data ? totalDead(summary.data) : 0}
            criticalAlerts={summary.data?.watchdog.critical_alerts ?? 0}
            staleReservations={summary.data ? staleAreaReservations(summary.data) : 0}
            activeAlerts={summary.data?.watchdog.active_alerts ?? 0}
            awaitingApproval={attention.data?.awaiting_approval ?? 0}
            notReported={attention.data?.not_reported ?? []}
            onRefresh={refreshMaintenance}
            onReveal={revealAnchor}
          />

          {/* The queue the operator, not the system, is blocking. */}
          <UnpublishedDraftsPanel
            drafts={attention.data?.unpublished_drafts ?? []}
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
                  value={attention.data!.ecosystem!.last_reconciliation?.status ?? '—'}
                  sub={observed(attention.data!.ecosystem!.last_reconciliation?.finished_at ?? null)}
                />
                <KpiCard
                  label="Bandsintown sync"
                  value={attention.data!.ecosystem!.bandsintown_sync?.consecutive_failures ?? 0}
                  sub={attention.data!.ecosystem!.bandsintown_sync?.in_progress ? 'running now' : 'failures in a row'}
                  tone={(attention.data!.ecosystem!.bandsintown_sync?.consecutive_failures ?? 0) > 0 ? 'warn' : 'default'}
                />
              </KpiStrip></Show>
              <Show when={findingsCount() > 0} fallback={
                <EmptyState label="Nothing disagrees" hint="The last check found no difference between what this console believes and what the tenant reports." />
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
    </TabPanel>

    {/* ─── Queues ────────────────────────────────────────────────── */}
    <TabPanel active={activeTab()} id="queues" visited={isVisited('queues')}>
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
    </TabPanel>

    {/* ─── Runtime ───────────────────────────────────────────────── */}
    <TabPanel active={activeTab()} id="runtime" visited={isVisited('runtime')}>
      <Show when={summary.error}>
        <ErrorCard>Runtime summary unavailable: {errorMessage(summary.error, 'We couldn\'t reach the runtime. Try refreshing — if it persists, the tenant may be down.')}</ErrorCard>
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

      <SectionTitle title="Reservation maintenance" icon={<SectionIcon name="map-pin" />} action={<Show when={summary.data}>{data => <StatusBadge status={staleAreaReservations(data()) > 0 ? `${staleAreaReservations(data())} stale` : 'clean'} tone={staleAreaReservations(data()) > 0 ? 'bad' : 'good'} />}</Show>} />
      <Show when={!summary.error && summary.data} fallback={<Show when={!summary.error}><SkeletonRows count={4} /></Show>}>
        {data => <KpiStrip class="mb-0" min="9rem">
          <KpiCard label="Stale vouchers" value={data().area.stale_voucher_reservations} sub={`${data().area.vouchers_issued} issued`} tone={data().area.stale_voucher_reservations > 0 ? 'bad' : 'default'} />
          <KpiCard label="Stale ticket rewards" value={data().area.stale_ticket_reward_reservations} sub={`${data().area.ticket_rewards_issued} issued`} tone={data().area.stale_ticket_reward_reservations > 0 ? 'bad' : 'default'} />
          <KpiCard label="Credits" value={data().area.credits_total} sub="current total" />
          <KpiCard label="Legacy imports" value={data().area.legacy_imported_players} sub="players migrated" />
        </KpiStrip>}
      </Show>

      <SignalOverviewPanel slug={params().slug} />
    </TabPanel>

    {/* ─── Trace ─────────────────────────────────────────────────── */}
    <TabPanel active={activeTab()} id="trace" visited={isVisited('trace')}>
      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">Metadata-only trace of one request across audit, outbox, delivery and operator actions.</p>
        <form class="flex flex-col gap-2 sm:flex-row" onSubmit={e => { e.preventDefault(); void lookupTimeline() }}>
          <Input class="sm:max-w-md" value={timelineInput()} onInput={(event) => setTimelineInput(event.currentTarget.value)} placeholder="Request or correlation ID" aria-label="Request or correlation ID" />
          <Button type="submit" variant="outline" disabled={!timelineInput().trim() || !!busy()}>{busy() === 'timeline' ? 'Tracing…' : 'Trace request'}</Button>
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
                <Badge variant="muted">{event.source}</Badge>
                <Badge variant="outline">{event.kind}</Badge>
              </div>
              <p class="mt-1.5 text-muted-foreground">{observed(event.occurred_at)} · {event.status ?? '—'} · {event.target_type ?? '—'}</p>
            </li>}</For>
          </ol>
        </Card>}</Show>
      </div>
    </TabPanel>
  </PageShell>
}
