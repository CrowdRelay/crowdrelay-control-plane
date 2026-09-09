import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { fetchOperationsAttention } from '../lib/attention'
import { errorMessage, formatTimestamp as observed } from '../lib/format'
import type { OperationsSummary } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { WatchdogAlertsPanel } from '../components/WatchdogAlertsPanel'
import { AttentionInbox } from '../components/AttentionInbox'
import { EmptyState } from '../components/EmptyState'
import { SignalOverviewPanel } from '../components/SignalOverviewPanel'
import { DeadQueuesPanel } from '../components/DeadQueuesPanel'
import { SkeletonSection, SkeletonKpiStrip } from '../components/Skeleton'
import { SectionIcon } from '../components/SectionIcon'
import { Spinner } from '../components/Spinner'
import { TabBar, TabPanel, useTabPanels } from '../components/TabBar'

const totalDead = (summary: OperationsSummary) => summary.outbox.dead + summary.deliveries.dead + summary.push.dead
const staleAreaReservations = (summary: OperationsSummary) => summary.area.stale_voucher_reservations + summary.area.stale_ticket_reward_reservations

export function TenantAttentionPage() {
  const params = useParams({ from: '/tenants/$slug/attention' })
  const { activeTab, switchTab, isVisited } = useTabPanels('inbox')
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

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">CONTROL</span>
        <h1>Operator Attention</h1>
        <p>Incidents, observability and bounded maintenance. One snapshot, on-demand details.</p>
      </div>
      <Show when={!summary.error && summary.data} fallback={<StatusBadge status={summary.error ? 'unavailable' : 'loading'} tone={summary.error ? 'bad' : 'muted'} />}>
        {data => <StatusBadge
          status={totalDead(data()) > 0 || data().watchdog.critical_alerts > 0 || staleAreaReservations(data()) > 0 ? 'attention required' : data().watchdog.active_alerts > 0 ? 'watch' : 'healthy'}
          tone={totalDead(data()) > 0 || data().watchdog.critical_alerts > 0 || staleAreaReservations(data()) > 0 ? 'bad' : data().watchdog.active_alerts > 0 ? 'warn' : 'good'}
        />}
      </Show>
    </div>

    <TabBar
      active={activeTab()}
      onChange={switchTab}
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

      <Show when={summary.error}>
        <div class="error-card" role="alert">{errorMessage(summary.error, 'Operations attention snapshot unavailable')}</div>
      </Show>

      <Show when={!summary.error && !summary.data}>
        <SkeletonKpiStrip count={4} />
        <SkeletonSection titleWidth="200px" lines={3} minHeight="120px" />
        <SkeletonSection titleWidth="180px" lines={4} minHeight="140px" />
      </Show>

      {/* Reconciliation findings */}
      <Show when={!summary.error && summary.data}>{data => <>
        <div class="section-title" id="reconciliation-findings">
          <div>
            <span class="eyebrow">RECONCILIATION</span>
            <h3><SectionIcon name="refresh-cw" />Ecosystem reconciliation</h3>
            <p>Consistency pass across feature flags, Bandsintown sync, and open findings. Run it first, then work through what it finds.</p>
          </div>
          <button class={confirmingReconcile() ? 'reconciliation-confirm' : 'ghost'} disabled={!!busy()} onClick={() => void reconcile()}>{busy() === 'reconcile' && <Spinner />} {busy() === 'reconcile' ? 'Reconciling…' : confirmingReconcile() ? 'Confirm reconciliation' : 'Run reconciliation'}</button>
        </div>
        <Show when={attention.data?.ecosystem}><div class="operations-metrics">
          <div><span>Open findings</span><strong>{attention.data!.ecosystem!.open_findings}</strong><small>reported by canonical overview</small></div>
          <div><span>Last reconciliation</span><strong>{attention.data!.ecosystem!.last_reconciliation?.status ?? '—'}</strong><small>{observed(attention.data!.ecosystem!.last_reconciliation?.finished_at ?? null)}</small></div>
          <div><span>Bandsintown failures</span><strong>{attention.data!.ecosystem!.bandsintown_sync?.consecutive_failures ?? 0}</strong><small>{attention.data!.ecosystem!.bandsintown_sync?.in_progress ? 'sync in progress' : 'idle'}</small></div>
        </div></Show>
        <For each={attention.data?.findings ?? []}>{finding => <div class={finding.severity === 'critical' ? 'error-card' : 'warning-card'}>
          <div class="section-title"><div><strong>{finding.summary}</strong><small>{finding.severity} · {finding.kind} · {finding.entity_label ?? finding.entity_type}</small><Show when={finding.suggested_action}><p>{finding.suggested_action}</p></Show></div><StatusBadge status={finding.severity} tone={finding.severity === 'critical' ? 'bad' : finding.severity === 'warning' ? 'warn' : 'muted'} /></div>
        </div>}</For>
        <Show when={findingsCount() === 0}><div class="inherit-card"><EmptyState label="No reconciliation findings" hint="The reconciliation engine checks for state mismatches between systems. Findings appear here when discrepancies are detected." /></div></Show>
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
      <Show when={!summary.error && summary.data} fallback={<SkeletonSection titleWidth="180px" lines={4} minHeight="140px" />}>
        {data => <>
          <div class="section-title"><div><span class="eyebrow">POSTGRES RUNTIME</span><h3><SectionIcon name="database" />Database health</h3></div><StatusBadge status={data().database.async_io_active ? 'async I/O active' : 'check I/O'} tone={data().database.async_io_active ? 'good' : 'warn'} /></div>
          <div class="operations-metrics">
            <div><span>Pool</span><strong>{data().database.pool_size}/{data().database.pool_max}</strong><small>{data().database.pool_idle} idle</small></div>
            <div><span>Postgres</span><strong>{data().database.server_version_num}</strong><small>{data().database.io_method ?? 'I/O method unknown'}</small></div>
            <div><span>Effective I/O concurrency</span><strong>{data().database.effective_io_concurrency ?? '—'}</strong><small>workers {data().database.io_workers ?? '—'}</small></div>
            <div><span>Maintenance I/O</span><strong>{data().database.maintenance_io_concurrency ?? '—'}</strong><small>max concurrency {data().database.io_max_concurrency ?? '—'}</small></div>
          </div>

          <div class="section-title"><div><span class="eyebrow">AREA RUNTIME</span><h3><SectionIcon name="map-pin" />Reservation maintenance</h3></div><StatusBadge status={staleAreaReservations(data()) > 0 ? `${staleAreaReservations(data())} stale` : 'clean'} tone={staleAreaReservations(data()) > 0 ? 'bad' : 'good'} /></div>
          <div class="operations-metrics">
            <div><span>Stale vouchers</span><strong>{data().area.stale_voucher_reservations}</strong><small>{data().area.vouchers_issued} issued</small></div>
            <div><span>Stale ticket rewards</span><strong>{data().area.stale_ticket_reward_reservations}</strong><small>{data().area.ticket_rewards_issued} issued</small></div>
            <div><span>Credits</span><strong>{data().area.credits_total}</strong><small>current total</small></div>
            <div><span>Legacy imports</span><strong>{data().area.legacy_imported_players}</strong><small>players migrated</small></div>
          </div>
        </>}
      </Show>

      <SignalOverviewPanel slug={params().slug} />
    </TabPanel>

    {/* ─── Trace Tab ─────────────────────────────────────────────── */}
    <TabPanel active={activeTab()} id="trace" visited={isVisited('trace')}>
      <div class="section-title"><div><span class="eyebrow">REQUEST TIMELINE</span><h3><SectionIcon name="history" />Correlation trace</h3><p>Metadata-only trace across audit, outbox, delivery and operator actions.</p></div></div>
      <div class="provision-row">
        <input class="mono" value={timelineInput()} onInput={(event) => setTimelineInput(event.currentTarget.value)} placeholder="Request or correlation ID" aria-label="Request or correlation ID" />
        <button class="ghost" disabled={!timelineInput().trim() || !!busy()} onClick={() => void lookupTimeline()}>{busy() === 'timeline' ? 'Tracing…' : 'Trace request'}</button>
      </div>
      <Show when={timeline()}>{result => <div class="panel"><div class="section-title"><div><span class="eyebrow">REQUEST TIMELINE</span><h3><SectionIcon name="history" />{result().events.length} timeline event(s)</h3><button class="ghost dead-toggle-id" onClick={() => toggleRevealedId('timeline')}>{revealedId() === 'timeline' ? 'Hide ID' : 'Details'}</button><Show when={revealedId() === 'timeline'}><small class="mono dead-event-id">Request ID · <span class="mono">{result().request_id}</span></small></Show></div><button class="ghost" onClick={() => setTimeline(null)}>Close</button></div><For each={result().events}>{event => <div class="warning-card"><div class="dead-event-title"><span class="badge tone-muted mono-badge">{event.source}</span><span class="badge tone-muted">{event.kind}</span></div><p>{observed(event.occurred_at)} · {event.status ?? '—'} · {event.target_type ?? '—'}</p></div>}</For></div>}</Show>
    </TabPanel>
  </section>
}
