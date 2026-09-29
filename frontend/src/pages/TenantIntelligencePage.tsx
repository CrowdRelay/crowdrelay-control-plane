import { BrainCyclesPanel } from '../components/BrainCyclesPanel'
import { GoalScoreboardPanel } from '../components/GoalScoreboardPanel'
import { ReachPanel } from '../components/ReachPanel'
import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useNavigate, useParams } from '@tanstack/solid-router'
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
import { DashHeader, IconAct, SubPagePanel } from '../components/ui/dash'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { IntelligenceOverview, brainStatus } from '../components/IntelligenceOverview'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'

export type IntelligenceSection = 'overview' | 'brief' | 'standing' | 'decisions' | 'learning'

const SECTION_TITLE: Record<IntelligenceSection, string> = {
  overview: 'Intelligence',
  brief: 'Are we getting anywhere',
  standing: 'Where it stands',
  decisions: 'What it decided',
  learning: 'What it learned',
}

export const IntelligenceOverviewPage = () => <TenantIntelligencePage section="overview" />
export const IntelligenceBriefPage = () => <TenantIntelligencePage section="brief" />
export const IntelligenceStandingPage = () => <TenantIntelligencePage section="standing" />
export const IntelligenceDecisionsPage = () => <TenantIntelligencePage section="decisions" />
export const IntelligenceLearningPage = () => <TenantIntelligencePage section="learning" />

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
 * decided and what came of it, what it learned. The overview lands at
 * `/intelligence`; each of the four is a sub-page nested under it in the
 * sidebar (`/intelligence/brief`, `/standing`, `/decisions`, `/learning`).
 *
 * The evidence sections ride one read model (`tenant-brain`) — the panels
 * that render exactly one section take it as a prop and never ask again;
 * a section the tenant could not answer is named in the degraded strip
 * instead of mounting empty.
 */
export function TenantIntelligencePage(props: { section: IntelligenceSection }) {
  const params = useParams({ strict: false }) as () => { slug: string }
  const navigate = useNavigate()
  const section = () => props.section
  const openSection = (id: Exclude<IntelligenceSection, 'overview'>) =>
    void navigate({ to: `/tenants/$slug/intelligence/${id}`, params: { slug: params().slug } })
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
  // owns the drill-through: stages land on the sub-page (or the Needs-you page)
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
        case 'sense': stage.onSelect = () => openSection('brief'); break
        case 'decide': stage.onSelect = () => openSection('decisions'); break
        case 'authorize': stage.onSelect = () => goAttention(); break
        case 'act': stage.onSelect = () => { platform ? goAttention('trace') : openSection('decisions') }; break
        case 'measure':
        case 'learn': stage.onSelect = () => openSection('learning'); break
      }
    }
    return stages
  })

  return <PageShell>
    <DashHeader
      title={SECTION_TITLE[section()]}
      subtitle="Is the brain getting anywhere, and what next"
      pill={brainStatus(model.data)}
      actions={
        <IconAct onClick={() => void model.refetch()} disabled={model.isFetching} label="Refresh" title={updated() ? `Updated ${updated()}` : 'Refresh'}>
          <RefreshCw class={cn('size-3.5', model.isFetching && 'animate-spin')} aria-hidden="true" />
        </IconAct>
      }
    />

    <Show when={model.error}>
      <SectionFailureCard error={model.error} title="Couldn't load intelligence" onRetry={() => void model.refetch()} />
    </Show>

    {/* Degraded sections sit above every sub-page — they describe the
        whole model, not one page. */}
    <Show when={!model.error && model.data}>{(data: () => TenantBrainReadModel) => (
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
    )}</Show>

    <SubPagePanel when={section() === 'overview'}>
      {/* The rail renders only once the model answers; a missing number is
          '—', never 0. */}
      <Show when={!model.error && model.data}>{(data: () => TenantBrainReadModel) =>
        <IntelligenceOverview slug={params().slug} model={data()} />
      }</Show>
    </SubPagePanel>

    {/* The brief answers from its own read model — it must not wait on the
        brain model, an unrelated channel whose failure would hide the one
        thing this page exists to say. The other three sub-pages are
        evidence surfaces and keep the shared gate. */}
    <SubPagePanel when={section() === 'brief'}>
      <Show when={model.data}>
        <div class="mb-5">
        <PanelTitle as="h2" class="mb-2">
          {authState.isPlatformLevel() ? 'The autopilot cycle, live' : 'How the brain works for you, right now'}
        </PanelTitle>
        <JourneyRail stages={cycleStages()} />
      </div>
        <BrainBriefPanel slug={params().slug} initial={model.data?.intelligence} />
      </Show>
    </SubPagePanel>

    {/* Intelligence and Operations share the query key, so the skeleton
        shows whenever the read model is absent, not only on first fetch. */}
    <Show when={!model.error && !model.data && section() !== 'overview' && section() !== 'brief'}>
      <SkeletonBrainGroup />
      <SkeletonSection titleWidth="160px" lines={4} minHeight="160px" />
    </Show>

    <Show when={!model.error && model.data}>{(data: () => TenantBrainReadModel) => <>

      {/* ── Where it stands — posture, capabilities, objectives, beliefs,
            and the material it may speak with ── */}
      <SubPagePanel when={section() === 'standing'}>
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
      </SubPagePanel>

      {/* ── What it decided — the decision log and what came of the
            decisions: growth, channels, attribution, the funnel ── */}
      <SubPagePanel when={section() === 'decisions'}>
        <IntelligenceTransparencyPanel slug={params().slug} />
        <GrowthMetricsPanel slug={params().slug} />
        <AcquisitionChannelsPanel slug={params().slug} />
        {/* The causal half of the same question — the channels panel says
            where fans arrived from, this says which templates and strategies
            produced them, and when the growth rate itself shifted. */}
        <FanAttributionPanel slug={params().slug} />
        <GrowthFunnelPanel slug={params().slug} />
      </SubPagePanel>

      {/* ── What it learned — the loop, the beliefs it closed, the gate's
            refusals in its own words, and the ledger that judges it ── */}
      <SubPagePanel when={section() === 'learning'}>
        <Show when={data().learning}>{d => <LearningLoopPanel slug={params().slug} data={d()} />}</Show>
        <Show when={data().learning_proof}>{d => <LearningProofPanel slug={params().slug} data={d()} />}</Show>
        <Show when={data().attention}>{att => (
          <RejectedOutcomesPanel
            outcomes={att().rejected_agent_outcomes}
            notReported={att().not_reported ?? []}
          />
        )}</Show>
        <Show when={data().measurement}>{d => <MeasurementPanel slug={params().slug} data={d()} />}</Show>
      </SubPagePanel>
    </>}</Show>
  </PageShell>
}
