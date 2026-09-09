import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { ChiefOfStaffPanel } from '../components/ChiefOfStaffPanel'
import { QueueInspectorPanel } from '../components/QueueInspectorPanel'
import { SystemHealthPanel } from '../components/SystemHealthPanel'
import { RuntimeSwitchesPanel } from '../components/RuntimeSwitchesPanel'
import { AuthorityPoliciesPanel } from '../components/AuthorityPoliciesPanel'
import { SkeletonSection } from '../components/Skeleton'
import { StatusBadge } from '../components/StatusBadge'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { TabBar, TabPanel, useTabPanels, PageShell, PageHeader } from '../components/layout'
import { operationalTone, operationalLabel } from '../lib/health-tone'
import type { TenantOperationsReadModel } from '../lib/types'

export function TenantHealthPage() {
  const params = useParams({ from: '/tenants/$slug/health' })
  const { activeTab, switchTab, isVisited } = useTabPanels('policies')
  const model = useQuery(() => ({
    queryKey: ['tenant-operations', params().slug],
    queryFn: () => api.tenantOperations(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const overview = useQuery(() => ({
    queryKey: ['tenant-overview', params().slug],
    queryFn: () => api.tenantOverview(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))
  const refresh = () => model.refetch()
  const d = (): TenantOperationsReadModel | undefined => model.data
  const summary = () => d()?.summary
  const _healthTone = () => operationalTone(summary())
  const _healthLabel = () => operationalLabel(summary())

  return <PageShell>
    <PageHeader eyebrow="SYSTEM" title="Autopilot" description="Authority policies, system health, chief of staff summary, and delivery queue inspector." actions={
      <Show when={model.data && !model.error}>
        <StatusBadge status={_healthLabel()} tone={_healthTone()} />
      </Show>
    } />

    <Show when={model.error}>
      <SectionFailureCard error={model.error} fallback="Tenant operations channel unavailable" onRetry={() => void refresh()} />
    </Show>

    <Show when={!model.error && !model.data}>
      <SkeletonSection titleWidth="180px" lines={4} minHeight="200px" />
      <SkeletonSection titleWidth="160px" lines={3} minHeight="160px" />
      <SkeletonSection titleWidth="200px" lines={4} minHeight="180px" />
    </Show>

    <Show when={model.data && !model.error}>
      {/* Above the numbers on purpose: the numbers assume you already know
          which ones are bad. This says what to do. */}
      <SystemHealthPanel
        slug={params().slug}
        summary={d()?.summary ?? undefined}
        onChanged={refresh}
      />
      {/* The autopilot's own account of the last day, which the API has
          served all along and no screen rendered. */}
      <ChiefOfStaffPanel slug={params().slug} />
      {/* The dead-letter remediation above says "open Deliveries and read one
          failure". This is Deliveries. */}
      <QueueInspectorPanel slug={params().slug} />

      {/* Autopilot controls — split into Runtime and Policies tabs so each
          loads independently and the page does not become one long scroll.
          This is the ONLY place autopilot authority switches and sliders
          live. Operations shows read-only autopilot status and links here. */}
      <TabBar
        active={activeTab()}
        onChange={switchTab}
        tabs={[
          { id: 'policies', label: 'Policies' },
          { id: 'runtime', label: 'Runtime' },
        ]}
      />

      <TabPanel active={activeTab()} id="policies" visited={isVisited('policies')}>
        <AuthorityPoliciesPanel
          slug={params().slug}
          degraded={d()?.degraded ?? []}
          sections={d()?.sections}
          freshness={d()?.freshness}
          fetchedAt={d()?.fetchedAt}
          refresh={refresh}
        />
      </TabPanel>

      <TabPanel active={activeTab()} id="runtime" visited={isVisited('runtime')}>
        <RuntimeSwitchesPanel
          slug={params().slug}
          summary={d()?.summary ?? null}
          refresh={refresh}
          canRedeploy={overview.data?.platform?.capabilities?.canRedeploy}
        />
      </TabPanel>
    </Show>
  </PageShell>
}
