import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { IntelligenceTransparencyPanel } from '../components/IntelligenceTransparencyPanel'
import { GrowthIntelligencePanel } from '../components/GrowthIntelligencePanel'
import { RunBrainCyclePanel } from '../components/RunBrainCyclePanel'
import { GrowthObjectivesPanel } from '../components/GrowthObjectivesPanel'
import { LearningLoopPanel } from '../components/LearningLoopPanel'
import { LearningProofPanel } from '../components/LearningProofPanel'
import { ScorecardPanel } from '../components/ScorecardPanel'
import { GrowthPosturePanel } from '../components/GrowthPosturePanel'
import { GrowthMetricsPanel } from '../components/GrowthMetricsPanel'
import { AcquisitionChannelsPanel } from '../components/AcquisitionChannelsPanel'
import { GrowthFunnelPanel } from '../components/GrowthFunnelPanel'
import { StatusBadge } from '../components/StatusBadge'
import { SkeletonBrainGroup, SkeletonSection } from '../components/Skeleton'
import { TabBar, TabPanel, useTabPanels, PageShell, PageHeader, SectionTitle } from '../components/layout'
import { SectionIcon } from '../components/SectionIcon'
import { SectionFailureCard } from '../components/SectionFailureCard'

/**
 * Intelligence subpage — tabbed view for the deterministic Rust autopilot.
 *
 * Tabs: Overview | Growth Intelligence | Growth Funnel | Decisions | Learning
 * Each tab groups related panels thematically.
 */
export function TenantIntelligencePage() {
  const params = useParams({ from: '/tenants/$slug/intelligence' })
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('overview')
  const model = useQuery(() => ({
    queryKey: ['tenant-operations', params().slug],
    queryFn: () => api.tenantOperations(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const d = () => model.data
  const autopilot = () => d()?.autopilot

  return <PageShell>
    <PageHeader
      eyebrow="BRAIN"
      title="Intelligence"
      description="What the system decided to do, what it did, and how the growth numbers moved."
      actions={
        <Show when={!model.error && model.data}>
          <div class="flex items-center gap-2">
            <Show when={autopilot()?.runtime_enabled}>
              <StatusBadge status="autopilot on" tone="good" />
            </Show>
            <StatusBadge status={autopilot()?.queued_actions ? `${autopilot()!.queued_actions} queued` : 'idle'} tone={autopilot()?.queued_actions ? 'warn' : 'muted'} />
          </div>
        </Show>
      }
    />

    <Show when={model.error}>
      <SectionFailureCard error={model.error} fallback="Intelligence channel unavailable" onRetry={() => void model.refetch()} />
    </Show>

    {/* Intelligence loop SVG — static, renders immediately */}
    <div class="mb-4 p-5 rounded-lg border border-border bg-card">
      <svg viewBox="0 0 800 120" xmlns="http://www.w3.org/2000/svg" class="intel-loop-svg" aria-hidden="true">
        <defs>
          <marker id="intel-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0 0 L8 4 L0 8 z" fill="var(--color-primary)" />
          </marker>
        </defs>
        <rect x="20" y="30" width="160" height="60" rx="10" class="intel-loop-node intel-loop-node-core" />
        <text x="100" y="55" text-anchor="middle" class="intel-loop-label">Decides</text>
        <text x="100" y="72" text-anchor="middle" class="intel-loop-sub">what to do</text>
        <line x1="180" y1="60" x2="290" y2="60" stroke="var(--color-primary)" stroke-width="1.5" marker-end="url(#intel-arrow)" />
        <rect x="300" y="30" width="160" height="60" rx="10" class="intel-loop-node intel-loop-node-worker" />
        <text x="380" y="55" text-anchor="middle" class="intel-loop-label">Does it</text>
        <text x="380" y="72" text-anchor="middle" class="intel-loop-sub">research · draft · post</text>
        <line x1="460" y1="60" x2="570" y2="60" stroke="var(--color-primary)" stroke-width="1.5" marker-end="url(#intel-arrow)" />
        <rect x="580" y="30" width="160" height="60" rx="10" class="intel-loop-node intel-loop-node-outcome" />
        <text x="660" y="55" text-anchor="middle" class="intel-loop-label">Measures</text>
        <text x="660" y="72" text-anchor="middle" class="intel-loop-sub">fans · engagement</text>
        <path d="M 660 90 Q 400 115, 100 90" fill="none" stroke="var(--color-success-light)" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#intel-arrow)" />
        <text x="380" y="115" text-anchor="middle" class="intel-loop-feedback">Gets smarter each time</text>
      </svg>
    </div>

    {/* Tab bar — static, renders immediately */}
    <TabBar
      active={activeTab()}
      onChange={switchTab}
      onPrefetch={prefetch}
      tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'growth', label: 'Growth Intelligence' },
        { id: 'funnel', label: 'Growth Funnel' },
        { id: 'decisions', label: 'Decisions' },
        { id: 'learning', label: 'Learning' },
      ]}
    />

    {/* Tab content skeleton — shows whenever the read model is absent.
        Intelligence and Operations share the same query key, so isPending
        is false when the data is already cached from a prior visit. */}
    <Show when={!model.error && !model.data}>
      <SkeletonBrainGroup />
      <SkeletonSection titleWidth="160px" lines={4} minHeight="160px" />
    </Show>

    <Show when={!model.error && model.data}>{<>

      {/* ── Overview tab — what it knows ── */}
      <TabPanel active={activeTab()} id="overview" visited={isVisited('overview')}>
        <div class="mb-6">
          <SectionTitle title="Scorecard & objectives" icon={<SectionIcon name="brain" />} />
          <ScorecardPanel slug={params().slug} />
          <GrowthObjectivesPanel slug={params().slug} />
        </div>
      </TabPanel>

      {/* ── Growth Intelligence tab — what it believes ── */}
      <TabPanel active={activeTab()} id="growth" visited={isVisited('growth')}>
        <div class="mb-6">
          <SectionTitle title="Growth intelligence" icon={<SectionIcon name="trending-up" />} />
          <GrowthPosturePanel slug={params().slug} />
          <RunBrainCyclePanel slug={params().slug} />
          <GrowthIntelligencePanel slug={params().slug} />
        </div>
      </TabPanel>

      {/* ── Growth Funnel tab — where the audience is and how it converts ── */}
      <TabPanel active={activeTab()} id="funnel" visited={isVisited('funnel')}>
        <div class="mb-6">
          <SectionTitle title="Growth metrics & funnel" icon={<SectionIcon name="trending-up" />} />
          <GrowthMetricsPanel slug={params().slug} />
          <AcquisitionChannelsPanel slug={params().slug} />
          <GrowthFunnelPanel slug={params().slug} />
        </div>
      </TabPanel>

      {/* ── Decisions tab — what it decided ── */}
      <TabPanel active={activeTab()} id="decisions" visited={isVisited('decisions')}>
        <div class="mb-6">
          <SectionTitle title="Decision timeline" icon={<SectionIcon name="history" />} />
          <IntelligenceTransparencyPanel slug={params().slug} />
        </div>
      </TabPanel>

      {/* ── Learning tab — what it learned ── */}
      <TabPanel active={activeTab()} id="learning" visited={isVisited('learning')}>
        <div class="mb-6">
          <SectionTitle title="Decision → Action → Outcome → Learning" icon={<SectionIcon name="refresh-cw" />} />
          <LearningLoopPanel slug={params().slug} />
          <LearningProofPanel slug={params().slug} />
        </div>
      </TabPanel>
    </>}</Show>
  </PageShell>
}
