import { Show, Suspense, createMemo } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { ProcessMap } from '../components/ProcessMap'
import { SkeletonPageHead, SkeletonBlock } from '../components/Skeleton'

export function FlowPage() {
  const tenants = useQuery(() => ({
    queryKey: ['tenants'],
    queryFn: () => api.tenants(),
    reconcile: 'id',
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

      <Suspense fallback={<><SkeletonPageHead /><SkeletonBlock height="300px" radius="var(--radius-lg)" /></>}>
      <Show
        when={slug()}
        fallback={<div class="error-card" role="alert">No active tenant — create one on the Tenants tab.</div>}
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
      </Suspense>
    </section>
  )
}
