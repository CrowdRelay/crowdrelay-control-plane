import { BrainCyclesPanel } from '../components/BrainCyclesPanel'
import { GoalScoreboardPanel } from '../components/GoalScoreboardPanel'
import { ReachPanel } from '../components/ReachPanel'
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useNavigate, useParams, useRouterState } from '@tanstack/solid-router'
import { RefreshCw } from 'lucide-solid'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { relativeTime } from '../lib/format'
import { humanize } from '../lib/opportunity-labels'
import { cn } from '../lib/cn'
import { BrainBriefPanel } from '../components/BrainBriefPanel'
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
import { FanAttributionPanel } from '../components/FanAttributionPanel'
import { GrowthFunnelPanel } from '../components/GrowthFunnelPanel'
import { SkeletonBrainGroup, SkeletonSection } from '../components/Skeleton'
import { RejectedOutcomesPanel } from '../components/QueueLossesPanel'
import { Alert } from '../components/app/alert'
import type { TenantBrainReadModel } from '../lib/types'
import { JourneyRail } from '../components/Journey'
import { brainCycleStages } from '../lib/brain-cycle'
import { PageShell, PanelTitle } from '../components/layout'
import { DashHeader, IconAct, WorkAreaPanel, WorkAreas, useWorkAreas } from '../components/ui/dash'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { IntelligenceOverview, brainStatus } from '../components/IntelligenceOverview'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'

const TABS = ['brief', 'standing', 'decisions', 'learning'] as const

// Pre-regroup deep links keep their intent — every retired tab id maps onto
// the tab its evidence moved to. `decisions` and `learning` keep their ids.
const LEGACY_TABS: Record<string, string> = {
  overview: 'standing',
  growth: 'standing',
  material: 'standing',
  funnel: 'decisions',
  numbers: 'learning',
}

// The section labels the degraded strip prints — a section the tenant could
// not answer is named, never silently absent.
const SECTION_LABEL: Record<string, string> = {
  autopilot: 'Autopilot posture',
  scorecard: 'The scorecard',
  learning: 'The decision loop',
  learning_proof: 'Belief changes',
  measurement: 'The measurement ledger',
  attention: 'What needs a person',
  action_states: 'The action state machine',
  intelligence: 'The intelligence brief',
}
const BAND_SECTION_LABEL: Record<string, string> = {
  autopilot: 'Autopilot posture',
  scorecard: 'The scorecard',
  learning: 'What it tried and what happened',
  learning_proof: 'What it changed its mind about',
  measurement: 'The numbers',
  attention: 'What needs you',
  action_states: "What's in progress",
  intelligence: 'How the brain is doing',
}

/**
 * Intelligence — the deterministic autopilot, regrouped around the loop:
 * the story (the brief — its own endpoint), where it stands, what it
 * decided and what came of it, what it learned. Four tabs; the page draws
 * no heading of its own under the tab bar.
 *
 * The evidence sections ride one read model (`tenant-brain`) — the panels
 * that render exactly one section take it as a prop and never ask again;
 * a section the tenant could not answer is named in the degraded strip
 * instead of mounting empty.
 */
export function TenantIntelligencePage() {
  const params = useParams({ from: '/tenants/$slug/intelligence' })
  const navigate = useNavigate()
  // The id list makes `?tab=` deep links land on the right tab.
  const areas = useWorkAreas([...TABS])
  const switchTab = (id: string) => areas.open(id)
  const activeTab = () => areas.active()
  // A retired `?tab=` id remaps onto the tab its evidence moved to — the hook
  // alone would snap it back to the brief and the intent would be lost.
  const locationSearch = useRouterState({ select: s => s.location.search })
  // `on`: track only the search value — switchTab navigates, and navigate's
  // own router reads must not subscribe this effect to router updates.
  createEffect(on(locationSearch, search => {
    const t = (search as Record<string, unknown>)?.tab
    if (typeof t === 'string' && LEGACY_TABS[t]) switchTab(LEGACY_TABS[t])
  }))
  const model = useQuery(() => ({
    queryKey: ['tenant-brain', params().slug],
    queryFn: () => api.brainModel(params().slug),
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

  // The brain's own loop as a live rail — the derivation is pure, the page
  // owns the drill-through: stages land on the tab (or the Needs-you page)
  // that holds their evidence. Re-derives on the 15s tick so "this week"
  // and the relative clocks stay honest while the page sits open.
  const goAttention = (tab?: 'trace') => void navigate({
    to: '/tenants/$slug/attention',
    params: { slug: params().slug },
    search: tab ? { tab } : undefined,
  })
  const cycleStages = createMemo(() => {
    const m = model.data
    if (!m) return []
    const platform = authState.isPlatformLevel()
    const stages = brainCycleStages(m, platform, now())
    for (const stage of stages) {
      switch (stage.key) {
        case 'sense': stage.onSelect = () => switchTab('brief'); break
        case 'decide': stage.onSelect = () => switchTab('decisions'); break
        case 'authorize': stage.onSelect = () => goAttention(); break
        case 'act': stage.onSelect = () => { platform ? goAttention('trace') : switchTab('decisions') }; break
        case 'measure':
        case 'learn': stage.onSelect = () => switchTab('learning'); break
      }
    }
    return stages
  })

  return <PageShell>
    <DashHeader
      title="Intelligence"
      subtitle="Is the brain getting anywhere, and what next"
      pill={brainStatus(model.data)}
      actions={
        <IconAct onClick={() => void model.refetch()} disabled={model.isFetching} label="Refresh" title={updated() ? `Updated ${updated()}` : 'Refresh'}>
          <RefreshCw class={cn('size-3.5', model.isFetching && 'animate-spin')} aria-hidden="true" />
        </IconAct>
      }
    />

    <Show when={model.error}>
      <SectionFailureCard error={model.error} fallback="Intelligence channel unavailable" onRetry={() => void model.refetch()} />
    </Show>

    {/* Degraded sections and the live cycle rail sit above the tabs — they
        describe the whole model, not one tab. The rail renders only once
        the model answers; a missing number is '—', never 0. */}
    <Show when={!model.error && model.data}>{(data: () => TenantBrainReadModel) => <>
      <For each={data().degraded}>{section => (
        <Alert tone="warning" role="status" class="mb-4">
          <Show when={authState.isPlatformLevel()} fallback={
            <>
              <strong>{BAND_SECTION_LABEL[section] ?? humanize(section)}</strong> couldn't be checked right
              now. The rest of the page keeps working — it comes back on its own.
            </>
          }>
            <strong>{SECTION_LABEL[section] ?? humanize(section)}</strong> isn't available on the connected
            tenant right now. The rest of the page keeps working — it recovers on the next poll.
          </Show>
        </Alert>
      )}</For>

      <IntelligenceOverview slug={params().slug} model={data()} />
    </>}</Show>

    {/* The tabs say what each one holds, in the order the loop runs. The
        first tab is the story — the other seven are the evidence. */}
    <WorkAreas
      label="Details"
      active={areas.active()}
      onToggle={areas.toggle}
      areas={[
        { id: 'brief', label: 'Are we getting anywhere' },
        { id: 'standing', label: 'Where it stands' },
        { id: 'decisions', label: 'What it decided' },
        { id: 'learning', label: 'What it learned' },
      ]}
    />

    {/* The brief is the default tab and answers from its own read model —
        it must not wait on the brain model, an unrelated channel whose
        failure would hide the one thing this page exists to say. The other
        three tabs are evidence surfaces and keep the shared gate. */}
    <WorkAreaPanel id="brief" active={areas.active()}>
      <Show when={model.data}>
        <div class="mb-5">
        <PanelTitle as="h2" class="mb-2">
          {authState.isPlatformLevel() ? 'The autopilot cycle, live' : 'How the brain works for you, right now'}
        </PanelTitle>
        <JourneyRail stages={cycleStages()} />
      </div>
        <BrainBriefPanel slug={params().slug} initial={model.data?.intelligence} />
      </Show>
    </WorkAreaPanel>

    {/* Intelligence and Operations share the query key, so the skeleton
        shows whenever the read model is absent, not only on first fetch. */}
    <Show when={!model.error && !model.data && activeTab() != null && activeTab() !== 'brief'}>
      <SkeletonBrainGroup />
      <SkeletonSection titleWidth="160px" lines={4} minHeight="160px" />
    </Show>

    <Show when={!model.error && model.data}>{(data: () => TenantBrainReadModel) => <>

      {/* ── Where it stands — posture, capabilities, objectives, beliefs,
            and the material it may speak with ── */}
      <WorkAreaPanel id="standing" active={areas.active()}>
        <Show when={data().scorecard}>{d => <ScorecardPanel slug={params().slug} data={d()} />}</Show>
        <ReachPanel slug={params().slug} />
        {/* N.9 — the dispatch gate's registry per lane: which capabilities
            are live, held, or missing. The scorecard counts them; this
            names them before an approval meets the refusal. */}
        <ExecutorCapabilitiesPanel slug={params().slug} />
        <GrowthObjectivesPanel slug={params().slug} />
        <GoalScoreboardPanel slug={params().slug} />
        <GrowthPosturePanel slug={params().slug} />
        <RunBrainCyclePanel slug={params().slug} />
        <BrainCyclesPanel slug={params().slug} />
        <GrowthIntelligencePanel slug={params().slug} />
        <ContentSourcesPanel slug={params().slug} />
      </WorkAreaPanel>

      {/* ── What it decided — the decision log and what came of the
            decisions: growth, channels, attribution, the funnel ── */}
      <WorkAreaPanel id="decisions" active={areas.active()}>
        <IntelligenceTransparencyPanel slug={params().slug} />
        <GrowthMetricsPanel slug={params().slug} />
        <AcquisitionChannelsPanel slug={params().slug} />
        {/* The causal half of the same question — the channels panel says
            where fans arrived from, this says which templates and strategies
            produced them, and when the growth rate itself shifted. */}
        <FanAttributionPanel slug={params().slug} />
        <GrowthFunnelPanel slug={params().slug} />
      </WorkAreaPanel>

      {/* ── What it learned — the loop, the beliefs it closed, the gate's
            refusals in its own words, and the ledger that judges it ── */}
      <WorkAreaPanel id="learning" active={areas.active()}>
        <Show when={data().learning}>{d => <LearningLoopPanel slug={params().slug} data={d()} />}</Show>
        <Show when={data().learning_proof}>{d => <LearningProofPanel slug={params().slug} data={d()} />}</Show>
        <Show when={data().attention}>{att => (
          <RejectedOutcomesPanel
            outcomes={att().rejected_agent_outcomes}
            notReported={att().not_reported ?? []}
          />
        )}</Show>
        <Show when={data().measurement}>{d => <MeasurementPanel slug={params().slug} data={d()} />}</Show>
      </WorkAreaPanel>
    </>}</Show>
  </PageShell>
}
