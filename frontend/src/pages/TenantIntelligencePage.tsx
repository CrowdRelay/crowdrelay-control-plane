import { Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { RefreshCw } from 'lucide-solid'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { relativeTime } from '../lib/format'
import { cn } from '../lib/cn'
import { IntelligenceTransparencyPanel } from '../components/IntelligenceTransparencyPanel'
import { GrowthIntelligencePanel } from '../components/GrowthIntelligencePanel'
import { RunBrainCyclePanel } from '../components/RunBrainCyclePanel'
import { GrowthObjectivesPanel } from '../components/GrowthObjectivesPanel'
import { LearningLoopPanel } from '../components/LearningLoopPanel'
import { LearningProofPanel } from '../components/LearningProofPanel'
import { ContentSourcesPanel } from '../components/ContentSourcesPanel'
import { ScorecardPanel } from '../components/ScorecardPanel'
import { ExecutorCapabilitiesPanel } from '../components/ExecutorCapabilitiesPanel'
import { MeasurementPanel } from '../components/MeasurementPanel'
import { GrowthPosturePanel } from '../components/GrowthPosturePanel'
import { GrowthMetricsPanel } from '../components/GrowthMetricsPanel'
import { AcquisitionChannelsPanel } from '../components/AcquisitionChannelsPanel'
import { GrowthFunnelPanel } from '../components/GrowthFunnelPanel'
import { SkeletonBrainGroup, SkeletonSection } from '../components/Skeleton'
import { TabBar, TabPanel, useTabPanels, PageShell, PageHeader } from '../components/layout'
import { Button } from '../components/app/button'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { StatusBadge } from '../components/StatusBadge'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'

const TABS = ['measurement', 'overview', 'growth', 'material', 'decisions', 'funnel', 'learning'] as const

/**
 * Intelligence — the deterministic autopilot, one tab per question in the
 * order the loop runs: where we stand, what it believes, what it may say,
 * what it decided, what moved, what it learned. Each panel draws its own
 * heading; the page draws none of its own under the tab bar.
 */
export function TenantIntelligencePage() {
  const params = useParams({ from: '/tenants/$slug/intelligence' })
  const autopilot = () => model.data?.autopilot
  // The id list makes `?tab=` deep links land on the right tab.
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('measurement', [...TABS])
  const model = useQuery(() => ({
    queryKey: ['tenant-operations', params().slug],
    queryFn: () => api.tenantOperations(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // A section the tenant could not answer lands here as 200 with the
    // section named in `degraded`, so nothing retries it and the panel
    // stays empty for the life of the tab. Keep asking until it fills.
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))

  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now()
    return model.dataUpdatedAt ? relativeTime(model.dataUpdatedAt) : null
  })

  return <PageShell>
    <PageHeader
      title="Intelligence"
      description={authState.isPlatformLevel()
        ? 'What the autopilot decided to do, what it did, and how the growth numbers moved.'
        : 'What the system decided to do, what it did, and how the growth numbers moved.'}
      actions={
        <>
          <Show when={!model.error && model.data}>
            <div class="flex items-center gap-2">
              <Show when={autopilot()?.runtime_enabled}>
                <StatusBadge status={authState.isPlatformLevel() ? 'autopilot on' : 'working on its own'} tone="good" />
              </Show>
              <StatusBadge status={autopilot()?.queued_actions ? `${autopilot()!.queued_actions} ${authState.isPlatformLevel() ? 'queued' : 'waiting'}` : 'idle'} tone={autopilot()?.queued_actions ? 'warn' : 'muted'} />
            </div>
          </Show>
          <Show when={updated()}><span class="text-sm text-muted-foreground">Updated {updated()}</span></Show>
          <Button variant="outline" size="sm" onClick={() => void model.refetch()} disabled={model.isFetching} aria-label="Refresh">
            <RefreshCw class={cn(model.isFetching && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </>
      }
    />

    <Show when={model.error}>
      <SectionFailureCard error={model.error} fallback="Intelligence channel unavailable" onRetry={() => void model.refetch()} />
    </Show>

    {/* The tabs say what each one holds, in the order the loop runs. */}
    <TabBar
      active={activeTab()}
      onChange={switchTab}
      onPrefetch={prefetch}
      tabs={[
        { id: 'measurement', label: 'Are we getting anywhere' },
        { id: 'overview', label: 'Where we stand' },
        { id: 'growth', label: 'What it believes' },
        { id: 'material', label: 'What it may say' },
        { id: 'decisions', label: 'What it decided' },
        { id: 'funnel', label: 'What moved' },
        { id: 'learning', label: 'What it learned' },
      ]}
    />

    {/* Intelligence and Operations share the query key, so the skeleton
        shows whenever the read model is absent, not only on first fetch. */}
    <Show when={!model.error && !model.data}>
      <SkeletonBrainGroup />
      <SkeletonSection titleWidth="160px" lines={4} minHeight="160px" />
    </Show>

    <Show when={!model.error && model.data}>{<>

      {/* ── Measurement tab — the plan's fifteen claims, each with its
              number or the reason this build cannot produce it ── */}
      <TabPanel active={activeTab()} id="measurement" visited={isVisited('measurement')}>
        <MeasurementPanel slug={params().slug} />
      </TabPanel>

      <TabPanel active={activeTab()} id="overview" visited={isVisited('overview')}>
        <ScorecardPanel slug={params().slug} />
        {/* N.9 — the dispatch gate's registry per lane: which capabilities
            are live, held, or missing. The scorecard counts them; this
            names them before an approval meets the refusal. */}
        <ExecutorCapabilitiesPanel slug={params().slug} />
        <GrowthObjectivesPanel slug={params().slug} />
      </TabPanel>

      <TabPanel active={activeTab()} id="growth" visited={isVisited('growth')}>
        <GrowthPosturePanel slug={params().slug} />
        <RunBrainCyclePanel slug={params().slug} />
        <GrowthIntelligencePanel slug={params().slug} />
      </TabPanel>

      <TabPanel active={activeTab()} id="material" visited={isVisited('material')}>
        <ContentSourcesPanel slug={params().slug} />
      </TabPanel>

      <TabPanel active={activeTab()} id="decisions" visited={isVisited('decisions')}>
        <IntelligenceTransparencyPanel slug={params().slug} />
      </TabPanel>

      <TabPanel active={activeTab()} id="funnel" visited={isVisited('funnel')}>
        <GrowthMetricsPanel slug={params().slug} />
        <AcquisitionChannelsPanel slug={params().slug} />
        <GrowthFunnelPanel slug={params().slug} />
      </TabPanel>

      <TabPanel active={activeTab()} id="learning" visited={isVisited('learning')}>
        <LearningLoopPanel slug={params().slug} />
        <LearningProofPanel slug={params().slug} />
      </TabPanel>
    </>}</Show>
  </PageShell>
}
