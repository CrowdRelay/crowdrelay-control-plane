import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { fetchOperationsAttention } from '../lib/attention'
import { formatTimestamp as observed } from '../lib/format'
import type { DeliveryDetails, OperationsSummary } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { WatchdogAlertsPanel } from '../components/WatchdogAlertsPanel'
import { AttentionInbox } from '../components/AttentionInbox'
import { EmptyState } from '../components/EmptyState'
import { SignalOverviewPanel } from '../components/SignalOverviewPanel'
import { refreshTick } from '../lib/refresh'

const totalDead = (summary: OperationsSummary) => summary.outbox.dead + summary.deliveries.dead + summary.push.dead
const staleAreaReservations = (summary: OperationsSummary) => summary.area.stale_voucher_reservations + summary.area.stale_ticket_reward_reservations
const shortId = (value: string) => value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value

export function TenantAttentionPage() {
  const params = useParams({ from: '/tenants/$slug/attention' })
  const attention = useQuery(() => ({
    queryKey: ['tenant-operator-attention-snapshot', params().slug, refreshTick()],
    queryFn: () => fetchOperationsAttention(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 20_000,
  }))

  // Keep the rendering vocabulary local to this page while all five formerly
  // independent polling reads now share one server-side snapshot request.
  const summary = {
    get data() { return attention.data?.summary },
    get error() { return attention.error },
    get isLoading() { return attention.isLoading },
  }
  const deadOutbox = {
    get data() { return attention.data?.dead_outbox },
    get error() { return attention.error },
    get isLoading() { return attention.isLoading },
  }
  const deadDeliveries = {
    get data() { return attention.data?.dead_deliveries },
    get error() { return attention.error },
    get isLoading() { return attention.isLoading },
  }
  const deadPush = {
    get data() { return attention.data?.dead_push },
    get error() { return attention.error },
    get isLoading() { return attention.isLoading },
  }
  const ecosystem = {
    get data() { return attention.data?.ecosystem },
    get error() { return attention.error },
    get isLoading() { return attention.isLoading },
  }
  const findings = {
    get data() { return attention.data?.findings },
    get error() { return attention.error },
    get isLoading() { return attention.isLoading },
  }

  const [confirming, setConfirming] = createSignal(false)
  const [confirmingReconcile, setConfirmingReconcile] = createSignal(false)
  const [busy, setBusy] = createSignal('')
  const [deliveryDetails, setDeliveryDetails] = createSignal<DeliveryDetails | null>(null)
  const [timelineInput, setTimelineInput] = createSignal('')
  const [timeline, setTimeline] = createSignal<Awaited<ReturnType<typeof api.operationTimeline>> | null>(null)

  const refreshMaintenance = async () => {
    await attention.refetch()
  }

  const clearDead = async () => {
    if (!summary.data || summary.data.deliveries.dead <= 0 || busy()) return
    if (!confirming()) {
      setConfirming(true)
      toast.info('Click again to confirm marking dead webhook deliveries as cancelled.')
      return
    }
    setBusy('clear')
    try {
      const result = await api.clearDeadDeliveries(params().slug)
      setConfirming(false)
      toast.success(`Cleanup complete: ${result.cleared} dead delivery item(s) cancelled. Outbox and push queues untouched.`)
      await refreshMaintenance()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dead queue cleanup failed')
    } finally {
      setBusy('')
    }
  }

  const retryOutbox = async (id: string) => {
    if (busy()) return
    setBusy(`outbox:${id}`)
    try {
      await api.retryOutbox(params().slug, id)
      toast.success(`Outbox ${shortId(id)} is back in the pending queue.`)
      await refreshMaintenance()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Outbox retry failed')
    } finally {
      setBusy('')
    }
  }

  const retryDelivery = async (id: string) => {
    if (busy()) return
    setBusy(`delivery:${id}`)
    try {
      await api.retryDelivery(params().slug, id)
      toast.success(`Delivery ${shortId(id)} is back in the pending queue.`)
      setDeliveryDetails(null)
      await refreshMaintenance()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delivery retry failed')
    } finally {
      setBusy('')
    }
  }

  const retryPush = async (id: string) => {
    if (busy()) return
    setBusy(`push:${id}`)
    try {
      await api.retryPush(params().slug, id)
      toast.success(`Push ${shortId(id)} is back in the queue.`)
      await refreshMaintenance()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Push retry failed')
    } finally {
      setBusy('')
    }
  }

  const loadDeliveryDetails = async (id: string) => {
    if (busy()) return
    setBusy(`details:${id}`)
    try {
      setDeliveryDetails(await api.deliveryDetails(params().slug, id))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delivery details unavailable')
    } finally {
      setBusy('')
    }
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

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">TENANT / {params().slug.toUpperCase()}</span>
        <h1>Operator Attention</h1>
        <p>Incidents, observability and bounded maintenance. One snapshot, on-demand details.</p>
      </div>
      <Show when={summary.data} fallback={<StatusBadge status={summary.error ? 'unavailable' : 'loading'} tone={summary.error ? 'bad' : 'muted'} />}>
        {data => <StatusBadge
          status={totalDead(data()) > 0 || data().watchdog.critical_alerts > 0 || staleAreaReservations(data()) > 0 ? 'attention required' : data().watchdog.active_alerts > 0 ? 'watch' : 'healthy'}
          tone={totalDead(data()) > 0 || data().watchdog.critical_alerts > 0 || staleAreaReservations(data()) > 0 ? 'bad' : data().watchdog.active_alerts > 0 ? 'warn' : 'good'}
        />}
      </Show>
    </div>

    {/* Critical watchdog alerts are rendered by WatchdogAlertsPanel */}
    <WatchdogAlertsPanel alerts={attention.data?.alerts ?? []} slug={params().slug} />

    {/* ─── Attention Inbox — tiered action center ──────────────────── */}
    <Show when={summary.data}>
      <AttentionInbox
        needsYou={attention.data?.needs_you ?? []}
        deadJobs={summary.data ? totalDead(summary.data) : 0}
        criticalAlerts={summary.data?.watchdog.critical_alerts ?? 0}
        staleReservations={summary.data ? staleAreaReservations(summary.data) : 0}
        activeAlerts={summary.data?.watchdog.active_alerts ?? 0}
        awaitingApproval={attention.data?.awaiting_approval ?? 0}
      />
    </Show>

    <Show when={summary.error}>
      <div class="error-card" role="alert">{summary.error instanceof Error ? summary.error.message : 'Operations attention snapshot unavailable'}</div>
    </Show>

    <Show when={summary.data}>{data => <>
      <Show when={totalDead(data()) > 0 || data().watchdog.critical_alerts > 0 || staleAreaReservations(data()) > 0}>
        <div class="operations-attention" role="alert">
          <strong>Operator attention required</strong>
          <div class="attention-items">
            <Show when={totalDead(data()) > 0}><span>{totalDead(data())} dead queue item(s)</span></Show>
            <Show when={data().watchdog.critical_alerts > 0}><span>{data().watchdog.critical_alerts} critical watchdog alert(s)</span></Show>
            <Show when={staleAreaReservations(data()) > 0}><span>{staleAreaReservations(data())} stale AREA reservation(s)</span></Show>
          </div>
        </div>
      </Show>

      {/* Reconciliation — the first action an operator should take. Run it to
          get a fresh consistency pass, then work through the findings below. */}
      <div class="section-title" id="reconciliation-findings">
        <div>
          <span class="eyebrow">RECONCILIATION</span>
          <h3>Ecosystem reconciliation</h3>
          <p>Consistency pass across feature flags, Bandsintown sync, and open findings. Run it first, then work through what it finds.</p>
        </div>
        <button class={confirmingReconcile() ? 'reconciliation-confirm' : 'ghost'} disabled={!!busy()} onClick={() => void reconcile()}>{busy() === 'reconcile' ? 'Reconciling…' : confirmingReconcile() ? 'Confirm reconciliation' : 'Run reconciliation'}</button>
      </div>
      <Show when={ecosystem.data}><div class="operations-metrics">
        <div><span>Open findings</span><strong>{ecosystem.data!.open_findings}</strong><small>reported by canonical overview</small></div>
        <div><span>Last reconciliation</span><strong>{ecosystem.data!.last_reconciliation?.status ?? '—'}</strong><small>{observed(ecosystem.data!.last_reconciliation?.finished_at ?? null)}</small></div>
        <div><span>Bandsintown failures</span><strong>{ecosystem.data!.bandsintown_sync?.consecutive_failures ?? 0}</strong><small>{ecosystem.data!.bandsintown_sync?.in_progress ? 'sync in progress' : 'idle'}</small></div>
      </div></Show>
      <For each={findings.data ?? []}>{finding => <div class={finding.severity === 'critical' ? 'error-card' : 'warning-card'}>
        <div class="section-title"><div><strong>{finding.summary}</strong><small>{finding.severity} · {finding.kind} · {finding.entity_label ?? finding.entity_type}</small><Show when={finding.suggested_action}><p>{finding.suggested_action}</p></Show></div><StatusBadge status={finding.severity} tone={finding.severity === 'critical' ? 'bad' : finding.severity === 'warning' ? 'warn' : 'muted'} /></div>
      </div>}</For>
      <Show when={!findings.isLoading && (findings.data?.length ?? 0) === 0}><div class="inherit-card"><EmptyState label="No reconciliation findings" hint="The reconciliation engine checks for state mismatches between systems. Findings appear here when discrepancies are detected." /></div></Show>

      <div class="section-title"><div><span class="eyebrow">POSTGRES RUNTIME</span><h3>Database health</h3></div><StatusBadge status={data().database.async_io_active ? 'async I/O active' : 'check I/O'} tone={data().database.async_io_active ? 'good' : 'warn'} /></div>
      <div class="operations-metrics">
        <div><span>Pool</span><strong>{data().database.pool_size}/{data().database.pool_max}</strong><small>{data().database.pool_idle} idle</small></div>
        <div><span>Postgres</span><strong>{data().database.server_version_num}</strong><small>{data().database.io_method ?? 'I/O method unknown'}</small></div>
        <div><span>Effective I/O concurrency</span><strong>{data().database.effective_io_concurrency ?? '—'}</strong><small>workers {data().database.io_workers ?? '—'}</small></div>
        <div><span>Maintenance I/O</span><strong>{data().database.maintenance_io_concurrency ?? '—'}</strong><small>max concurrency {data().database.io_max_concurrency ?? '—'}</small></div>
      </div>

      <div class="section-title"><div><span class="eyebrow">AREA RUNTIME</span><h3>Reservation maintenance</h3></div><StatusBadge status={staleAreaReservations(data()) > 0 ? `${staleAreaReservations(data())} stale` : 'clean'} tone={staleAreaReservations(data()) > 0 ? 'bad' : 'good'} /></div>
      <div class="operations-metrics">
        <div><span>Stale vouchers</span><strong>{data().area.stale_voucher_reservations}</strong><small>{data().area.vouchers_issued} issued</small></div>
        <div><span>Stale ticket rewards</span><strong>{data().area.stale_ticket_reward_reservations}</strong><small>{data().area.ticket_rewards_issued} issued</small></div>
        <div><span>Credits</span><strong>{data().area.credits_total}</strong><small>current total</small></div>
        <div><span>Legacy imports</span><strong>{data().area.legacy_imported_players}</strong><small>players migrated</small></div>
      </div>
    </>}</Show>

    <SignalOverviewPanel slug={params().slug} />

    <div class="section-title" id="dead-outbox">
      <div><span class="eyebrow">DEAD OUTBOX</span><h3>Failed events</h3><p>50 newest dead events. Retry is idempotent.</p></div>
    </div>
    <Show when={deadOutbox.error}><div class="error-card">Dead outbox unavailable</div></Show>
    <For each={deadOutbox.data ?? []}>{item => <div class="warning-card">
      <div class="section-title"><div><strong>{item.event_type}</strong><small class="mono">{item.id}</small><p>{item.last_error_kind ?? 'unknown error'} · attempts {item.attempts}/{item.max_attempts} · dead {observed(item.dead_at)}</p></div><button class="ghost" disabled={!!busy()} onClick={() => void retryOutbox(item.id)}>{busy() === `outbox:${item.id}` ? 'Retrying…' : 'Retry'}</button></div>
    </div>}</For>
    <Show when={!deadOutbox.isLoading && (deadOutbox.data?.length ?? 0) === 0}><div class="inherit-card"><EmptyState label="No dead outbox events" hint="Dead outbox events are messages that failed delivery after all retries. A clean queue means everything is flowing." /></div></Show>

    <div class="section-title" id="dead-deliveries">
      <div><span class="eyebrow">DEAD WEBHOOK DELIVERIES</span><h3>Delivery failures</h3><p>Inspect attempt history before retrying.</p></div>
      <button type="button" class={confirming() ? 'danger-ghost' : 'ghost'} disabled={(summary.data?.deliveries.dead ?? 0) <= 0 || !!busy()} onClick={() => void clearDead()}>{busy() === 'clear' ? 'Clearing…' : confirming() ? 'Confirm cleanup' : 'Clear old dead queues'}</button>
    </div>
    <Show when={deadDeliveries.error}><div class="error-card">Dead deliveries unavailable</div></Show>
    <For each={deadDeliveries.data ?? []}>{item => <div class="warning-card">
      <div class="section-title"><div><strong>{item.endpoint_name} · {item.event_type}</strong><small class="mono">{item.id}</small><p>{item.last_error_kind ?? 'unknown error'} · HTTP {item.last_response_status ?? '—'} · attempts {item.attempt_count}/{item.max_attempts}</p></div><div><button class="ghost" disabled={!!busy()} onClick={() => void loadDeliveryDetails(item.id)}>Details</button> <button class="ghost" disabled={!!busy()} onClick={() => void retryDelivery(item.id)}>{busy() === `delivery:${item.id}` ? 'Retrying…' : 'Retry'}</button></div></div>
    </div>}</For>
    <Show when={!deadDeliveries.isLoading && (deadDeliveries.data?.length ?? 0) === 0}><div class="inherit-card"><EmptyState label="No dead webhook deliveries" hint="Dead webhooks are deliveries that failed after all retries. A clean list means webhooks are reaching their destinations." /></div></Show>

    <Show when={deliveryDetails()}>{details => <div class="panel">
      <div class="section-title"><div><span class="eyebrow">DELIVERY DETAILS</span><h3>{details().delivery.endpoint_name}</h3><small class="mono">{details().delivery.id}</small></div><button class="ghost" onClick={() => setDeliveryDetails(null)}>Close</button></div>
      <For each={details().attempts}>{attempt => <div class="warning-card"><strong>Attempt {attempt.attempt_number} · {attempt.outcome}</strong><p>HTTP {attempt.response_status ?? '—'} · {attempt.error_kind ?? 'no error kind'} · {attempt.duration_ms} ms · {observed(attempt.finished_at)}</p></div>}</For>
      <Show when={details().attempts.length === 0}><EmptyState label="No delivery attempts" hint="Delivery attempts are logged here once the outbox starts processing messages." /></Show>
    </div>}</Show>

    <div class="section-title" id="dead-push">
      <div><span class="eyebrow">DEAD PUSH</span><h3>Failed push deliveries</h3><p>Retry is idempotent.</p></div>
      <StatusBadge status={(summary.data?.push.dead ?? 0) > 0 ? 'dead' : 'clean'} tone={(summary.data?.push.dead ?? 0) > 0 ? 'bad' : 'good'} />
    </div>
    <Show when={deadPush.error}><div class="error-card">Dead push unavailable</div></Show>
    <For each={deadPush.data ?? []}>{item => <div class="warning-card">
      <div class="section-title"><div><strong>{item.title}</strong><small class="mono">{item.id}</small><p>{item.error_code ?? 'unknown error'} · attempts {item.attempt_count} · {item.source_kind}</p></div><button class="ghost" disabled={!!busy()} onClick={() => void retryPush(item.id)}>{busy() === `push:${item.id}` ? 'Retrying…' : 'Retry'}</button></div>
    </div>}</For>
    <Show when={!deadPush.isLoading && (deadPush.data?.length ?? 0) === 0}><div class="inherit-card"><EmptyState label="No dead push deliveries" hint="Dead push notifications are deliveries that failed after all retries. A clean list means pushes are reaching devices." /></div></Show>

    <div class="section-title"><div><span class="eyebrow">REQUEST TIMELINE</span><h3>Correlation trace</h3><p>Metadata-only trace across audit, outbox, delivery and operator actions.</p></div></div>
    <div class="provision-row">
      <input class="mono" value={timelineInput()} onInput={(event) => setTimelineInput(event.currentTarget.value)} placeholder="Request or correlation ID" aria-label="Request or correlation ID" />
      <button class="ghost" disabled={!timelineInput().trim() || !!busy()} onClick={() => void lookupTimeline()}>{busy() === 'timeline' ? 'Tracing…' : 'Trace request'}</button>
    </div>
    <Show when={timeline()}>{result => <div class="panel"><div class="section-title"><div><strong>{result().events.length} timeline event(s)</strong><small class="mono">{result().request_id}</small></div><button class="ghost" onClick={() => setTimeline(null)}>Close</button></div><For each={result().events}>{event => <div class="warning-card"><strong>{event.source} · {event.kind}</strong><p>{observed(event.occurred_at)} · {event.status ?? '—'} · {event.target_type ?? '—'} · <span class="mono">{event.target_id ?? '—'}</span></p></div>}</For></div>}</Show>
  </section>
}
