import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { toast } from '../components/ui/toast'
import { fetchOperationsAttention } from '../lib/attention'
import { errorMessage, formatTimestamp as observed } from '../lib/format'
import type { OperationsSummary } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { WatchdogAlertsPanel } from '../components/WatchdogAlertsPanel'
import { UnpublishedDraftsPanel } from '../components/UnpublishedDraftsPanel'
import { AttentionInbox } from '../components/AttentionInbox'
import { EmptyState } from '../components/ui/empty-state'
import { SignalOverviewPanel } from '../components/SignalOverviewPanel'
import { DeadQueuesPanel } from '../components/DeadQueuesPanel'
import { SkeletonSection, SkeletonKpiStrip, SkeletonRows } from '../components/Skeleton'
import { SectionIcon } from '../components/SectionIcon'
import { Spinner } from '../components/Spinner'
import { TabBar, TabPanel, useTabPanels, PageShell, PageHeader, ErrorCard, SectionPanel } from '../components/layout'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'

const totalDead = (summary: OperationsSummary) => summary.outbox.dead + summary.deliveries.dead + summary.push.dead
const staleAreaReservations = (summary: OperationsSummary) => summary.area.stale_voucher_reservations + summary.area.stale_ticket_reward_reservations

export function TenantAttentionPage() {
  const params = useParams({ from: '/tenants/$slug/attention' })
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('inbox')
  const attention = useQuery(() => ({
    queryKey: ['tenant-operator-attention-snapshot', params().slug],
    queryFn: () => fetchOperationsAttention(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 20_000,
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
  const [revealedId, setRevealedId] = createSignal<string | null>(null)
  const toggleRevealedId = (key: string) => setRevealedId(prev => prev === key ? null : key)

  const refreshMaintenance = async () => {
    await attention.refetch()
  }

  const reconcile = async () => {
    if (busy()) return
    if (!confirmingReconcile()) {
      setConfirmingReconcile(true)
      toast.info('Click again to run an audited reconciliation pass.')
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

  return <PageShell>
    <PageHeader
      eyebrow="CONTROL"
      title="Operator Attention"
      description="Incidents, observability and bounded maintenance. One snapshot, on-demand details."
      actions={
        <Show when={!summary.error && summary.data} fallback={<StatusBadge status={summary.error ? 'unavailable' : 'loading'} tone={summary.error ? 'bad' : 'muted'} />}>
          {data => <StatusBadge
            status={totalDead(data()) > 0 || data().watchdog.critical_alerts > 0 || staleAreaReservations(data()) > 0 ? 'attention required' : data().watchdog.active_alerts > 0 ? 'watch' : 'healthy'}
            tone={totalDead(data()) > 0 || data().watchdog.critical_alerts > 0 || staleAreaReservations(data()) > 0 ? 'bad' : data().watchdog.active_alerts > 0 ? 'warn' : 'good'}
          />}
        </Show>
      }
    />

    <TabBar
      active={activeTab()}
      onChange={switchTab}
      onPrefetch={prefetch}
      tabs={[
        { id: 'inbox', label: 'Inbox' },
        { id: 'queues', label: 'Queues', count: deadCount() > 0 ? () => deadCount() : undefined },
        { id: 'runtime', label: 'Runtime' },
        { id: 'trace', label: 'Trace' },
      ]}
    />

    {/* ─── Inbox Tab ─────────────────────────────────────────────── */}
    <TabPanel active={activeTab()} id="inbox" visited={isVisited('inbox')}>
      {/* Critical watchdog alerts */}
      <Show when={!attention.isLoading} fallback={<SkeletonSection titleWidth="180px" lines={2} minHeight="80px" />}>
        <WatchdogAlertsPanel alerts={attention.data?.alerts ?? []} slug={params().slug} />
      </Show>

      {/* Attention Inbox — tiered action center */}
      <Show when={!summary.error && summary.data}>
        <AttentionInbox
          slug={params().slug}
          needsYou={attention.data?.needs_you ?? []}
          deadJobs={summary.data ? totalDead(summary.data) : 0}
          criticalAlerts={summary.data?.watchdog.critical_alerts ?? 0}
          staleReservations={summary.data ? staleAreaReservations(summary.data) : 0}
          activeAlerts={summary.data?.watchdog.active_alerts ?? 0}
          awaitingApproval={attention.data?.awaiting_approval ?? 0}
          notReported={attention.data?.not_reported ?? []}
        />
      </Show>

      {/* The queue the operator, not the system, is blocking */}
      <Show when={!attention.isLoading}>
        <UnpublishedDraftsPanel
          drafts={attention.data?.unpublished_drafts ?? []}
          notReported={attention.data?.not_reported ?? []}
        />
      </Show>

      <Show when={summary.error}>
        <ErrorCard>{errorMessage(summary.error, 'Operations attention snapshot unavailable')}</ErrorCard>
      </Show>

      <Show when={!summary.error && !summary.data}>
        <SkeletonKpiStrip count={4} />
        <SkeletonSection titleWidth="200px" lines={3} minHeight="120px" />
        <SkeletonSection titleWidth="180px" lines={4} minHeight="140px" />
      </Show>

      {/* Reconciliation findings */}
      <Show when={!summary.error && summary.data}>{data => <>
        <div class="flex items-center justify-between gap-4 mt-6 mb-3" id="reconciliation-findings">
          <div>
            <h3 class="text-base font-bold flex items-center gap-1.5"><SectionIcon name="refresh-cw" />Ecosystem reconciliation</h3>
            <p class="text-sm text-muted-foreground mt-1 leading-relaxed">Consistency pass across feature flags, Bandsintown sync, and open findings. Run it first, then work through what it finds.</p>
          </div>
          <Button variant={confirmingReconcile() ? 'default' : 'outline'} size="sm" class={confirmingReconcile() ? 'flex gap-2 items-center mt-2' : ''} disabled={!!busy()} onClick={() => void reconcile()}>{busy() === 'reconcile' && <Spinner />} {busy() === 'reconcile' ? 'Reconciling…' : confirmingReconcile() ? 'Confirm reconciliation' : 'Run reconciliation'}</Button>
        </div>
        <Show when={attention.data?.ecosystem}><div class="grid gap-2.5">
          <Card class="p-3.5 hover:border-border-strong transition-colors">
            <span class="block text-sm text-muted-foreground">Open findings</span>
            <strong class="block text-xl font-bold tabular-nums my-1.5">{attention.data!.ecosystem!.open_findings}</strong>
            <small class="block text-sm text-muted-foreground">reported by canonical overview</small>
          </Card>
          <Card class="p-3.5 hover:border-border-strong transition-colors">
            <span class="block text-sm text-muted-foreground">Last reconciliation</span>
            <strong class="block text-xl font-bold tabular-nums my-1.5">{attention.data!.ecosystem!.last_reconciliation?.status ?? '—'}</strong>
            <small class="block text-sm text-muted-foreground">{observed(attention.data!.ecosystem!.last_reconciliation?.finished_at ?? null)}</small>
          </Card>
          <Card class="p-3.5 hover:border-border-strong transition-colors">
            <span class="block text-sm text-muted-foreground">Bandsintown failures</span>
            <strong class="block text-xl font-bold tabular-nums my-1.5">{attention.data!.ecosystem!.bandsintown_sync?.consecutive_failures ?? 0}</strong>
            <small class="block text-sm text-muted-foreground">{attention.data!.ecosystem!.bandsintown_sync?.in_progress ? 'sync in progress' : 'idle'}</small>
          </Card>
        </div></Show>
        <For each={attention.data?.findings ?? []}>{finding => <div class={finding.severity === 'critical' ? 'rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 my-3 text-sm text-destructive leading-relaxed' : 'rounded-lg border border-warning/30 bg-warning/10 p-3.5 my-3 text-sm text-warning-light leading-relaxed'}>
          <div class="flex items-center justify-between gap-4"><div><strong>{finding.summary}</strong><small class="block text-sm text-muted-foreground">{finding.severity} · {finding.kind} · {finding.entity_label ?? finding.entity_type}</small><Show when={finding.suggested_action}><p class="text-sm text-muted-foreground mt-1 leading-relaxed">{finding.suggested_action}</p></Show></div><StatusBadge status={finding.severity} tone={finding.severity === 'critical' ? 'bad' : finding.severity === 'warning' ? 'warn' : 'muted'} /></div>
        </div>}</For>
        <Show when={findingsCount() === 0}><div class="p-4 border border-border-subtle rounded-lg bg-surface-1 text-left"><EmptyState label="No reconciliation findings" hint="The reconciliation engine checks for state mismatches between systems. Findings appear here when discrepancies are detected." /></div></Show>
      </>}</Show>
    </TabPanel>

    {/* ─── Queues Tab ────────────────────────────────────────────── */}
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

    {/* ─── Runtime Tab ───────────────────────────────────────────── */}
    <TabPanel active={activeTab()} id="runtime" visited={isVisited('runtime')}>
      <Show when={summary.error}>
        <ErrorCard>Runtime summary unavailable: {errorMessage(summary.error, 'Service unreachable')}</ErrorCard>
      </Show>
      {/* Section headings are static — show them immediately, skeleton only the data cards */}
      <div class="flex items-center justify-between gap-4 mt-6 mb-3"><div><h3 class="text-base font-bold flex items-center gap-1.5"><SectionIcon name="database" />Database health</h3></div><Show when={summary.data}>{data => <StatusBadge status={data().database.async_io_active ? 'async I/O active' : 'check I/O'} tone={data().database.async_io_active ? 'good' : 'warn'} />}</Show></div>
      <Show when={!summary.error && summary.data} fallback={<Show when={!summary.error}><SkeletonRows count={4} /></Show>}>
        {data => <>
          <div class="grid gap-2.5">
            <Card class="p-3.5 hover:border-border-strong transition-colors">
              <span class="block text-sm text-muted-foreground">Pool</span>
              <strong class="block text-xl font-bold tabular-nums my-1.5">{data().database.pool_size}/{data().database.pool_max}</strong>
              <small class="block text-sm text-muted-foreground">{data().database.pool_idle} idle</small>
            </Card>
            <Card class="p-3.5 hover:border-border-strong transition-colors">
              <span class="block text-sm text-muted-foreground">Postgres</span>
              <strong class="block text-xl font-bold tabular-nums my-1.5">{data().database.server_version_num}</strong>
              <small class="block text-sm text-muted-foreground">{data().database.io_method ?? 'I/O method unknown'}</small>
            </Card>
            <Card class="p-3.5 hover:border-border-strong transition-colors">
              <span class="block text-sm text-muted-foreground">Effective I/O concurrency</span>
              <strong class="block text-xl font-bold tabular-nums my-1.5">{data().database.effective_io_concurrency ?? '—'}</strong>
              <small class="block text-sm text-muted-foreground">workers {data().database.io_workers ?? '—'}</small>
            </Card>
            <Card class="p-3.5 hover:border-border-strong transition-colors">
              <span class="block text-sm text-muted-foreground">Maintenance I/O</span>
              <strong class="block text-xl font-bold tabular-nums my-1.5">{data().database.maintenance_io_concurrency ?? '—'}</strong>
              <small class="block text-sm text-muted-foreground">max concurrency {data().database.io_max_concurrency ?? '—'}</small>
            </Card>
          </div>
        </>}
      </Show>

      <div class="flex items-center justify-between gap-4 mt-6 mb-3"><div><h3 class="text-base font-bold flex items-center gap-1.5"><SectionIcon name="map-pin" />Reservation maintenance</h3></div><Show when={summary.data}>{data => <StatusBadge status={staleAreaReservations(data()) > 0 ? `${staleAreaReservations(data())} stale` : 'clean'} tone={staleAreaReservations(data()) > 0 ? 'bad' : 'good'} />}</Show></div>
      <Show when={!summary.error && summary.data} fallback={<Show when={!summary.error}><SkeletonRows count={4} /></Show>}>
        {data => <>
          <div class="grid gap-2.5">
            <Card class="p-3.5 hover:border-border-strong transition-colors">
              <span class="block text-sm text-muted-foreground">Stale vouchers</span>
              <strong class="block text-xl font-bold tabular-nums my-1.5">{data().area.stale_voucher_reservations}</strong>
              <small class="block text-sm text-muted-foreground">{data().area.vouchers_issued} issued</small>
            </Card>
            <Card class="p-3.5 hover:border-border-strong transition-colors">
              <span class="block text-sm text-muted-foreground">Stale ticket rewards</span>
              <strong class="block text-xl font-bold tabular-nums my-1.5">{data().area.stale_ticket_reward_reservations}</strong>
              <small class="block text-sm text-muted-foreground">{data().area.ticket_rewards_issued} issued</small>
            </Card>
            <Card class="p-3.5 hover:border-border-strong transition-colors">
              <span class="block text-sm text-muted-foreground">Credits</span>
              <strong class="block text-xl font-bold tabular-nums my-1.5">{data().area.credits_total}</strong>
              <small class="block text-sm text-muted-foreground">current total</small>
            </Card>
            <Card class="p-3.5 hover:border-border-strong transition-colors">
              <span class="block text-sm text-muted-foreground">Legacy imports</span>
              <strong class="block text-xl font-bold tabular-nums my-1.5">{data().area.legacy_imported_players}</strong>
              <small class="block text-sm text-muted-foreground">players migrated</small>
            </Card>
          </div>
        </>}
      </Show>

      <SignalOverviewPanel slug={params().slug} />
    </TabPanel>

    {/* ─── Trace Tab ─────────────────────────────────────────────── */}
    <TabPanel active={activeTab()} id="trace" visited={isVisited('trace')}>
      <div class="flex items-center justify-between gap-4 mt-6 mb-3"><div><h3 class="text-base font-bold flex items-center gap-1.5"><SectionIcon name="history" />Correlation trace</h3><p class="text-sm text-muted-foreground mt-1 leading-relaxed">Metadata-only trace across audit, outbox, delivery and operator actions.</p></div></div>
      <div class="flex gap-2.5 items-stretch">
        <Input class="min-h-10" value={timelineInput()} onInput={(event) => setTimelineInput(event.currentTarget.value)} placeholder="Request or correlation ID" aria-label="Request or correlation ID" />
        <Button variant="ghost" size="sm" disabled={!timelineInput().trim() || !!busy()} onClick={() => void lookupTimeline()}>{busy() === 'timeline' ? 'Tracing…' : 'Trace request'}</Button>
      </div>
      <Show when={timeline()}>{result => <SectionPanel><div class="flex items-center justify-between gap-4 mt-6 mb-3"><div><h3 class="text-base font-bold flex items-center gap-1.5"><SectionIcon name="history" />{result().events.length} timeline event(s)</h3><Button variant="ghost" size="sm" class="text-xs py-1.5 px-2.5" onClick={() => toggleRevealedId('timeline')}>{revealedId() === 'timeline' ? 'Hide ID' : 'Details'}</Button><Show when={revealedId() === 'timeline'}><small class="font-mono block p-1.5 px-2.5 rounded-sm bg-background border border-border-subtle text-muted-foreground text-xs break-all">Request ID · <span class="font-mono">{result().request_id}</span></small></Show></div><Button variant="ghost" size="sm" onClick={() => setTimeline(null)}>Close</Button></div><For each={result().events}>{event => <div class="rounded-lg border border-warning/30 bg-warning/10 p-3.5 px-4 my-3 text-sm text-warning-light leading-relaxed"><div class="flex gap-1.5 flex-wrap items-center"><Badge variant="muted" class="text-xs font-semibold px-2 py-0.5 rounded-full">{event.source}</Badge><Badge variant="muted" class="text-xs font-semibold px-2 py-0.5 rounded-full">{event.kind}</Badge></div><p class="mt-1.5">{observed(event.occurred_at)} · {event.status ?? '—'} · {event.target_type ?? '—'}</p></div>}</For></SectionPanel>}</Show>
    </TabPanel>
  </PageShell>
}
