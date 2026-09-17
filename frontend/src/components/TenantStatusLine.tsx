import { Show, createMemo } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { cn } from '../lib/cn'
import type { TenantOperationsReadModel, TenantRuntimeSnapshot } from '../lib/types'

// One plain line for the machine: silent while everything answers, loud
// with the first broken thing when it does not. Detail lives on the Health
// page — this line only says whether to go there, never how to fix it.
export function TenantStatusLine(props: {
  slug: string
  initial: TenantRuntimeSnapshot
  operations: TenantOperationsReadModel | undefined
}) {
  // Same query key as TenantRuntimePanel so the line shares the heartbeat
  // cache — a visit to the Health page warms this line and vice versa.
  const runtime = useQuery(() => ({
    queryKey: ['tenant-runtime', props.slug],
    queryFn: () => api.tenantRuntime(props.slug),
    initialData: props.initial,
    initialDataUpdatedAt: Date.now(),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    reconcile: 'tenantId',
  }))
  const snapshot = () => runtime.data ?? props.initial

  const issues = createMemo(() => {
    const list: { text: string; bad: boolean }[] = []
    const rt = snapshot()
    if (rt.runtimeHealth === 'stale') {
      list.push({ text: 'live data has stopped updating', bad: true })
    } else if (rt.runtimeHealth === 'degraded') {
      list.push({ text: 'the runtime reports degraded health', bad: true })
    }
    if (rt.runtime?.apiHealthy === false) {
      list.push({ text: 'the fan-facing API is not answering', bad: true })
    }
    if (rt.runtime?.workerHealthy === false) {
      list.push({ text: 'background jobs are stopped', bad: true })
    }
    const ops = props.operations
    if (ops?.summary?.worker && !ops.summary.worker.alive) {
      list.push({ text: 'the brain worker is not responding', bad: true })
    }
    const watchdog = ops?.summary?.watchdog
    if (watchdog && watchdog.critical_alerts > 0) {
      list.push({
        text: `${watchdog.critical_alerts} critical alert${watchdog.critical_alerts === 1 ? '' : 's'}`,
        bad: true,
      })
    } else if (watchdog && watchdog.active_alerts > 0) {
      list.push({
        text: `${watchdog.active_alerts} active alert${watchdog.active_alerts === 1 ? '' : 's'}`,
        bad: false,
      })
    }
    const degraded = ops?.degraded?.length ?? 0
    if (degraded > 0) {
      list.push({ text: `could not check ${degraded} section${degraded === 1 ? '' : 's'}`, bad: false })
    }
    const failed = ops?.autopilot?.failed_24h ?? 0
    if (failed > 0) {
      list.push({
        text: `${failed} ${authState.isPlatformLevel() ? 'autopilot' : 'automated'} action${failed === 1 ? '' : 's'} failed in the last day`,
        bad: false,
      })
    }
    return list
  })

  return (
    <Show when={issues()[0]}>
      {issue => (
        <Link
          to={authState.isPlatformLevel() ? '/tenants/$slug/health' : '/tenants/$slug/attention'}
          search={authState.isPlatformLevel() ? {} : { tab: 'inbox' }}
          params={{ slug: props.slug }}
          aria-label={authState.isPlatformLevel() ? 'Open Health' : 'Open Needs you'}
          class={cn(
            'block rounded-md border px-3 py-2 text-sm transition-colors',
            issue().bad
              ? 'border-destructive/40 bg-destructive/10 text-foreground hover:border-destructive/70'
              : 'border-warning-foreground/40 bg-warning text-foreground hover:border-warning-foreground/70',
          )}
        >
          {issue().bad ? 'Something is broken: ' : 'Worth a look: '}
          {issue().text}
          {issues().length > 1 ? ` (+${issues().length - 1} more)` : ''}
          <span class="text-muted-foreground">{authState.isPlatformLevel() ? ' — Health' : ' — Needs you'}</span>
        </Link>
      )}
    </Show>
  )
}
