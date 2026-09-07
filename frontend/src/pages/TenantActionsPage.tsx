import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { BrainDecisionPanel } from '../components/BrainDecisionPanel'
import { OpportunityBoardPanel } from '../components/OpportunityBoardPanel'
import { EmptyState } from '../components/EmptyState'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { SkeletonOperationsPage } from '../components/Skeleton'

// The simplified action view for a tenant. One page, one question:
// "what does the brain need me to decide on right now?"
//
// No metrics, no telemetry, no tabs — just the brain's top decision with
// inline Approve/Reject, and the opportunity board with Do it / Done
// ourselves. When nothing needs attention, a clean all-clear state.
//
// Shares the same query key as TenantOperationsPage and TenantHealthPage
// so navigating between them does not refetch.

export function TenantActionsPage() {
  const params = useParams({ from: '/tenants/$slug/actions' })
  const model = useQuery(() => ({
    queryKey: ['tenant-operations', params().slug],
    queryFn: () => api.tenantOperations(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const refresh = () => model.refetch()

  const d = () => model.data
  const opportunities = () => d()?.opportunities ?? null
  const topOpportunity = () => opportunities()?.[0] ?? null
  const hasActions = () => (opportunities()?.length ?? 0) > 0
  const degraded = () => d()?.degraded.includes('opportunities') ?? false

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">CONTROL</span>
        <h1>Actions</h1>
        <p>What the brain found and needs your decision on. Approve, reject, or mark as handled.</p>
      </div>
    </div>

    <Show when={model.error}>
      <SectionFailureCard error={model.error} fallback="Action queue unavailable" />
    </Show>

    <Show when={!model.error && model.isPending}>
      <SkeletonOperationsPage />
    </Show>

    <Show when={model.data}>
      <Show when={hasActions() || topOpportunity()} fallback={
        <EmptyState
          label="Nothing needs your attention"
          hint="The brain is evaluating signals. Opportunities will appear here when they meet the action threshold."
        />
      }>
        <BrainDecisionPanel
          slug={params().slug}
          opportunity={topOpportunity()}
          degraded={degraded()}
          lastDecisionAt={opportunities()?.[0]?.due_at ?? null}
          refresh={refresh}
        />
        <OpportunityBoardPanel
          slug={params().slug}
          opportunities={opportunities()}
          degraded={degraded()}
          refresh={refresh}
        />
      </Show>
    </Show>
  </section>
}
