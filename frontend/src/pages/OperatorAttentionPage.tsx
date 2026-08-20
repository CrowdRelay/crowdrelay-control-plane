import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { OperationsSummary, TenantSummary } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'

const totalDead = (summary: OperationsSummary) => summary.outbox.dead + summary.deliveries.dead + summary.push.dead
const oldestQueueAge = (summary: OperationsSummary) => Math.max(
  summary.outbox.oldest_pending_seconds,
  summary.deliveries.oldest_pending_seconds,
  summary.push.oldest_pending_seconds,
)
const formatAge = (seconds: number) => {
  if (seconds <= 0) return '—'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(seconds < 36_000 ? 1 : 0)}h`
}
const observed = (value: string | null) => {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString()
}

function TenantAttention(props: { tenant: TenantSummary }) {
  const summary = useQuery(() => ({
    queryKey: ['tenant-operator-attention', props.tenant.slug],
    queryFn: () => api.operationsSummary(props.tenant.slug),
    enabled: props.tenant.status === 'active',
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const [confirming, setConfirming] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const [message, setMessage] = createSignal<string | null>(null)

  const clearDead = async () => {
    if (!summary.data || summary.data.deliveries.dead <= 0 || busy()) return
    if (!confirming()) {
      setConfirming(true)
      setMessage('Kliknij ponownie, aby potwierdzić zmianę dead webhook deliveries na cancelled.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const result = await api.clearDeadDeliveries(props.tenant.slug)
      setConfirming(false)
      setMessage(`Cleanup zakończony: ${result.cleared} dead delivery item(s) oznaczono jako cancelled.`)
      await summary.refetch()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Dead queue cleanup failed')
    } finally {
      setBusy(false)
    }
  }

  return <article class="panel">
    <div class="section-title">
      <div>
        <span class="eyebrow">TENANT / {props.tenant.slug.toUpperCase()}</span>
        <h2>{props.tenant.displayName}</h2>
      </div>
      <Show when={summary.data} fallback={<StatusBadge status={summary.error ? 'unavailable' : 'loading'} tone={summary.error ? 'bad' : 'muted'} />}>
        {data => <StatusBadge
          status={totalDead(data()) > 0 || data().watchdog.critical_alerts > 0 ? 'attention required' : data().watchdog.active_alerts > 0 ? 'watch' : 'healthy'}
          tone={totalDead(data()) > 0 || data().watchdog.critical_alerts > 0 ? 'bad' : data().watchdog.active_alerts > 0 ? 'warn' : 'good'}
        />}
      </Show>
    </div>

    <Show when={summary.error}>
      <div class="error-card" role="alert">{summary.error instanceof Error ? summary.error.message : 'Operations summary unavailable'}</div>
    </Show>

    <Show when={summary.data}>{data => <>
      <Show when={totalDead(data()) > 0 || data().watchdog.critical_alerts > 0}>
        <div class="operations-attention" role="alert">
          <strong>Operator attention required</strong>
          <span>{totalDead(data())} dead queue item(s) · {data().watchdog.critical_alerts} critical watchdog alert(s)</span>
        </div>
      </Show>

      <div class="operations-metrics">
        <div><span>Dead outbox</span><strong>{data().outbox.dead}</strong><small>{data().outbox.pending} pending</small></div>
        <div><span>Dead deliveries</span><strong>{data().deliveries.dead}</strong><small>{data().deliveries.cancelled} cancelled</small></div>
        <div><span>Dead push</span><strong>{data().push.dead}</strong><small>{data().push.pending} pending</small></div>
        <div><span>Critical watchdog</span><strong>{data().watchdog.critical_alerts}</strong><small>{data().watchdog.active_alerts} active total</small></div>
        <div><span>Oldest queue</span><strong>{formatAge(oldestQueueAge(data()))}</strong><small>across async queues</small></div>
        <div><span>Watchdog observed</span><strong>{data().watchdog.last_observed_at ? 'yes' : '—'}</strong><small>{observed(data().watchdog.last_observed_at)}</small></div>
      </div>

      <div class="section-title">
        <div>
          <span class="eyebrow">MAINTENANCE</span>
          <p>Cleanup jest audytowany i idempotentny. Nie usuwa historii: istniejący backend zmienia wyłącznie dead webhook deliveries na terminalny status cancelled; outbox i push pozostają nietknięte.</p>
        </div>
        <button
          type="button"
          class={confirming() ? 'danger-ghost' : 'ghost'}
          disabled={data().deliveries.dead <= 0 || busy()}
          onClick={() => void clearDead()}
        >{busy() ? 'Czyszczę…' : confirming() ? 'Potwierdź cleanup' : 'Usuń stare dead queues'}</button>
      </div>
      <Show when={message()}>{text => <div class="warning-card" role="status">{text()}</div>}</Show>
    </>}</Show>
  </article>
}

export function OperatorAttentionPage() {
  const tenants = useQuery(() => ({
    queryKey: ['tenants'],
    queryFn: api.tenants,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  }))

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">OPERATIONS</span>
        <h1>Operator Attention</h1>
        <p>Tenant-scoped operational incidents and bounded maintenance actions. Live queue/watchdog telemetry refreshes every 15 seconds.</p>
      </div>
    </div>
    <Show when={tenants.error}><div class="error-card" role="alert">{tenants.error instanceof Error ? tenants.error.message : 'Tenant registry unavailable'}</div></Show>
    <Show when={tenants.data} fallback={!tenants.error ? <div class="skeleton-block"/> : null}>{data => <div>
      <For each={data().items.filter((tenant) => tenant.status === 'active')}>
        {tenant => <TenantAttention tenant={tenant} />}
      </For>
    </div>}</Show>
  </section>
}
