import { Show, Suspense } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { OperationsPanel } from '../components/OperationsPanel'
import { SystemHealthPanel } from '../components/SystemHealthPanel'
import { SkeletonPageHead, SkeletonBlock } from '../components/Skeleton'
import { StatusBadge } from '../components/StatusBadge'
import type { TenantOperationsReadModel } from '../lib/types'

export function TenantHealthPage() {
  const params = useParams({ from: '/tenants/$slug/health' })
  const model = useQuery(() => ({
    queryKey: ['tenant-operations', params().slug],
    queryFn: () => api.tenantOperations(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const refresh = () => model.refetch()
  const d = (): TenantOperationsReadModel | undefined => model.data
  const summary = () => d()?.summary
  const autopilot = () => d()?.autopilot
  const deadJobs = () => {
    const s = summary()
    if (!s) return 0
    return s.outbox.dead + s.deliveries.dead + s.push.dead
  }
  const healthTone = (): 'good' | 'warn' | 'bad' | 'muted' => {
    const s = summary()
    if (!s) return 'muted'
    if (s.watchdog.critical_alerts > 0 || deadJobs() > 0) return 'bad'
    if (s.watchdog.active_alerts > 0 || s.http.p95_ms > 1000) return 'warn'
    return 'good'
  }
  const healthLabel = () => {
    const t = healthTone()
    return t === 'good' ? 'healthy' : t === 'warn' ? 'attention' : t === 'bad' ? 'degraded' : 'loading'
  }

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">SYSTEM</span>
        <h1>Autopilot</h1>
        <p>Live telemetry, delivery queues, watchdog alerts, runtime switches and Autopilot authority policies.</p>
      </div>
      <Show when={model.data}>
        <div class="page-head-status">
          <StatusBadge status={healthLabel()} tone={healthTone()} />
        </div>
      </Show>
    </div>

    <Show when={model.error}>
      <div class="error-card" role="alert">{model.error instanceof Error ? model.error.message : 'Tenant operations channel unavailable'}</div>
    </Show>

    <Show when={!model.error && model.isPending}>
      <SkeletonPageHead />
      <SkeletonBlock height="200px" radius="var(--radius-lg)" />
      <SkeletonBlock height="160px" radius="var(--radius-lg)" />
    </Show>

    <Suspense fallback={<><SkeletonPageHead /><SkeletonBlock height="200px" radius="var(--radius-lg)" /><SkeletonBlock height="160px" radius="var(--radius-lg)" /></>}>
    <Show when={model.data}>
      {/* Above the numbers on purpose: the numbers assume you already know
          which ones are bad. This says what to do. */}
      <SystemHealthPanel
        slug={params().slug}
        summary={d()?.summary ?? undefined}
        onChanged={refresh}
      />
      <OperationsPanel
        slug={params().slug}
        summary={d()?.summary ?? null}
        flags={d()?.flags ?? null}
        autopilot={d()?.autopilot ?? null}
        degraded={d()?.degraded ?? []}
        refresh={refresh}
        mode="controls"
      />
    </Show>
    </Suspense>
  </section>
}
