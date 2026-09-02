import { Show, Suspense } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { IntelligenceTransparencyPanel } from '../components/IntelligenceTransparencyPanel'
import { GrowthIntelligencePanel } from '../components/GrowthIntelligencePanel'
import { RunBrainCyclePanel } from '../components/RunBrainCyclePanel'
import { GrowthObjectivesPanel } from '../components/GrowthObjectivesPanel'
import { LearningLoopPanel } from '../components/LearningLoopPanel'
import { ScorecardPanel } from '../components/ScorecardPanel'
import { StatusBadge } from '../components/StatusBadge'
import { SkeletonIntelligencePage } from '../components/Skeleton'
import { TabBar, TabPanel, useTabPanels } from '../components/TabBar'
import { refreshTick } from '../lib/refresh'

/**
 * Intelligence subpage — tabbed view for the deterministic Rust autopilot.
 *
 * Tabs: Overview | Growth Intelligence | Decisions | Learning
 * Each tab groups related panels thematically.
 */
export function TenantIntelligencePage() {
  const params = useParams({ from: '/tenants/$slug/intelligence' })
  const { activeTab, switchTab, isVisited } = useTabPanels('overview')
  const model = useQuery(() => ({
    queryKey: ['tenant-operations', params().slug, refreshTick()],
    queryFn: () => api.tenantOperations(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const d = () => model.data
  const autopilot = () => d()?.autopilot

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">BRAIN</span>
        <h1>Intelligence</h1>
        <p>The deterministic autopilot's decision timeline, worker dispatch, and growth intelligence. The intelligence engine owns strategy — LLM workers gather and draft, but never decide.</p>
      </div>
      <Show when={model.data}>
        <div class="page-head-status">
          <Show when={autopilot()?.runtime_enabled}>
            <StatusBadge status="autopilot on" tone="good" />
          </Show>
          <StatusBadge status={autopilot()?.queued_actions ? `${autopilot()!.queued_actions} queued` : 'idle'} tone={autopilot()?.queued_actions ? 'warn' : 'muted'} />
        </div>
      </Show>
    </div>

    <Show when={model.error}>
      <div class="error-card" role="alert">{model.error instanceof Error ? model.error.message : 'Intelligence channel unavailable'}</div>
    </Show>

    <Suspense fallback={<SkeletonIntelligencePage />}>
    <Show when={model.data}>{<>
      {/* Intelligence loop SVG — persistent across tabs */}
      <div class="intel-loop-wrap">
        <svg viewBox="0 0 800 120" xmlns="http://www.w3.org/2000/svg" class="intel-loop-svg" aria-hidden="true">
          <defs>
            <marker id="intel-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="#9b87f5" />
            </marker>
          </defs>
          <rect x="20" y="30" width="160" height="60" rx="10" class="intel-loop-node intel-loop-node-core" />
          <text x="100" y="55" text-anchor="middle" class="intel-loop-label">Intelligence</text>
          <text x="100" y="72" text-anchor="middle" class="intel-loop-sub">Rust autopilot</text>
          <line x1="180" y1="60" x2="290" y2="60" stroke="#9b87f5" stroke-width="1.5" marker-end="url(#intel-arrow)" />
          <rect x="300" y="30" width="160" height="60" rx="10" class="intel-loop-node intel-loop-node-worker" />
          <text x="380" y="55" text-anchor="middle" class="intel-loop-label">Workers</text>
          <text x="380" y="72" text-anchor="middle" class="intel-loop-sub">LLM agents</text>
          <line x1="460" y1="60" x2="570" y2="60" stroke="#9b87f5" stroke-width="1.5" marker-end="url(#intel-arrow)" />
          <rect x="580" y="30" width="160" height="60" rx="10" class="intel-loop-node intel-loop-node-outcome" />
          <text x="660" y="55" text-anchor="middle" class="intel-loop-label">Outcomes</text>
          <text x="660" y="72" text-anchor="middle" class="intel-loop-sub">fans · engagement</text>
          <path d="M 660 90 Q 400 115, 100 90" fill="none" stroke="#7dffb2" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#intel-arrow)" />
          <text x="380" y="115" text-anchor="middle" class="intel-loop-feedback">learning loop</text>
        </svg>
      </div>

      {/* Tab bar */}
      <TabBar
        active={activeTab()}
        onChange={switchTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'growth', label: 'Growth Intelligence' },
          { id: 'decisions', label: 'Decisions' },
          { id: 'learning', label: 'Learning' },
        ]}
      />

      {/* ── Overview tab — what it knows ── */}
      <TabPanel active={activeTab()} id="overview" visited={isVisited('overview')}>
        <div class="brain-group">
          <div class="brain-group-head">
            <span class="eyebrow">WHAT IT KNOWS</span>
            <h3>Scorecard & objectives</h3>
          </div>
          <ScorecardPanel slug={params().slug} />
          <GrowthObjectivesPanel slug={params().slug} />
        </div>
      </TabPanel>

      {/* ── Growth Intelligence tab — what it believes ── */}
      <TabPanel active={activeTab()} id="growth" visited={isVisited('growth')}>
        <div class="brain-group">
          <div class="brain-group-head">
            <span class="eyebrow">WHAT IT BELIEVES</span>
            <h3>Growth intelligence</h3>
          </div>
          <RunBrainCyclePanel slug={params().slug} />
          <GrowthIntelligencePanel slug={params().slug} />
        </div>
      </TabPanel>

      {/* ── Decisions tab — what it decided ── */}
      <TabPanel active={activeTab()} id="decisions" visited={isVisited('decisions')}>
        <div class="brain-group">
          <div class="brain-group-head">
            <span class="eyebrow">WHAT IT DECIDED</span>
            <h3>Decision timeline</h3>
          </div>
          <IntelligenceTransparencyPanel slug={params().slug} />
        </div>
      </TabPanel>

      {/* ── Learning tab — what it learned ── */}
      <TabPanel active={activeTab()} id="learning" visited={isVisited('learning')}>
        <div class="brain-group">
          <div class="brain-group-head">
            <span class="eyebrow">WHAT IT LEARNED</span>
            <h3>Decision → Action → Outcome → Learning</h3>
          </div>
          <LearningLoopPanel slug={params().slug} />
        </div>
      </TabPanel>
    </>}</Show>
    </Suspense>
  </section>
}
