import { Show, createMemo } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { ProcessMap } from '../components/ProcessMap'
import { SkeletonSection } from '../components/Skeleton'

export function FlowPage() {
  const tenants = useQuery(() => ({
    queryKey: ['tenants'],
    queryFn: () => api.tenants(),
    reconcile: 'id',
    refetchOnWindowFocus: false,
  }))

  // The map itself is generic — the same architecture diagram for every
  // tenant. The slug is only needed so node clicks navigate to the right
  // tenant-scoped page. Tenant operators see only their own tenant from the
  // API; admins get the first from the list.
  const slug = createMemo(() => {
    const profileSlug = authState.profile()?.tenantSlug
    if (profileSlug) return profileSlug
    return tenants.data?.items[0]?.slug ?? ''
  })

  return (
    <section class="page">
      <div class="page-head">
        <div>
          <span class="eyebrow">BIG PICTURE</span>
          <h1>Process map</h1>
          <p>
            Sources feed the deterministic Rust autopilot, which decides. What that decision is allowed
            to do is the fork: some actions queue immediately, some wait for a person and expire after
            72 hours if nobody answers, and some are recorded and never executed. Delivery is
            at-least-once, so only what comes back with a receipt updates the causal model and shapes
            the next decision. Click any block to jump to its page.
          </p>
        </div>
      </div>

      <Show
        when={slug()}
        fallback={<>
          <Show when={tenants.error}>
            <div class="error-card" role="alert">Could not load tenants: {String(tenants.error?.message ?? tenants.error)}</div>
          </Show>
          <Show when={!tenants.error && tenants.isPending && !tenants.data}>
            <SkeletonSection titleWidth="160px" lines={3} minHeight="120px" />
          </Show>
          <Show when={!tenants.error && !tenants.isPending && !slug()}>
            <div class="error-card" role="alert">No active tenant — create one on the Tenants tab.</div>
          </Show>
        </>}
      >
        <div class="process-map-legend">
          <span><i class="legend-swatch legend-inputs" />Sources</span>
          <span><i class="legend-swatch legend-intel" />Intelligence</span>
          <span><i class="legend-swatch legend-auth" />Authority</span>
          <span><i class="legend-swatch legend-worker" />Execution</span>
          <span><i class="legend-swatch legend-outcome" />Outcomes</span>
          <span><i class="legend-swatch legend-learning" />Learning loop</span>
        </div>
        <ProcessMap slug={slug} />
      </Show>
    </section>
  )
}
