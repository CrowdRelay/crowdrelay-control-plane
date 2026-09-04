import { useQuery } from '@tanstack/solid-query'
import { api } from './api'
import type {
  AgentScorecard,
  AutopilotOverview,
  IntelligenceDecisionsData,
  GrowthObjectiveView,
  GrowthOverview,
  OperationsSummary,
  OpportunityBoardEntry,
  TenantOperationsReadModel,
} from './types'

// ─── Intelligence data composition layer ───────────────────────────────────────
// Composes existing endpoints in parallel with shared loading/error states.
// No backend changes — this is a frontend presentation layer.
// Each section degrades independently: a failed scorecard read doesn't
// blank the opportunity board beside it.

export interface IntelligenceData {
  // The main operations read model (one request, server-fan-out)
  operations: TenantOperationsReadModel | undefined
  operationsLoading: boolean
  operationsError: unknown

  // Scorecard (separate endpoint, parallel)
  scorecard: AgentScorecard | undefined
  scorecardLoading: boolean
  scorecardError: unknown

  // Intelligence decisions (separate endpoint, parallel)
  decisions: IntelligenceDecisionsData | undefined
  decisionsLoading: boolean
  decisionsError: unknown

  // Growth objectives (separate endpoint, parallel)
  objectives: GrowthObjectiveView[] | undefined
  objectivesLoading: boolean
  objectivesError: unknown

  // Derived helpers
  summary: OperationsSummary | null
  autopilot: AutopilotOverview | null
  growth: GrowthOverview | null
  opportunities: OpportunityBoardEntry[]
  degraded: string[]

  // Derived intelligence state
  topOpportunity: OpportunityBoardEntry | null
  needsOperator: boolean
  healthTone: 'good' | 'warn' | 'bad' | 'muted'
  healthLabel: string
  intelligenceStatus: string
  intelligenceTone: 'good' | 'warn' | 'bad' | 'muted'
}

export function useIntelligenceData(slug: string): IntelligenceData {
  const operations = useQuery(() => ({
    queryKey: ['tenant-operations', slug],
    queryFn: () => api.tenantOperations(slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const scorecard = useQuery(() => ({
    queryKey: ['agent-scorecard', slug],
    queryFn: () => api.agentScorecard(slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const decisions = useQuery(() => ({
    queryKey: ['intelligence-decisions', slug],
    queryFn: () => api.intelligenceDecisions(slug, 10, 7),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const objectivesQuery = useQuery(() => ({
    queryKey: ['growth-objectives', slug],
    queryFn: () => api.growthObjectives(slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const ops = () => operations.data
  const summary = () => ops()?.summary ?? null
  const autopilot = () => ops()?.autopilot ?? null
  const growth = () => ops()?.growth ?? null
  const opportunities = () => ops()?.opportunities ?? []
  const degraded = () => ops()?.degraded ?? []

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

  const topOpportunity = () => opportunities().length > 0 ? opportunities()[0]! : null

  const needsOperator = () => {
    const ap = autopilot()
    if (ap && ap.needs_you.length > 0) return true
    if (opportunities().some(o => o.authority === 'awaiting_approval')) return true
    const sc = scorecard.data
    if (sc && sc.status.parked_capabilities.length > 0) return true
    return false
  }

  const intelligenceStatus = () => {
    const sc = scorecard.data
    if (!sc) return 'loading'
    if (!sc.status.agent_enabled) return 'off'
    if (sc.status.dry_run) return 'dry run'
    if (sc.status.parked_capabilities.length > 0) return 'execution gap'
    return sc.status.posture ?? 'active'
  }

  const intelligenceTone = (): 'good' | 'warn' | 'bad' | 'muted' => {
    const sc = scorecard.data
    if (!sc) return 'muted'
    if (!sc.status.agent_enabled) return 'muted'
    if (sc.status.parked_capabilities.length > 0) return 'bad'
    if (sc.week.failed > 0) return 'warn'
    return 'good'
  }

  return {
    operations: operations.data,
    operationsLoading: operations.isPending,
    operationsError: operations.error,

    scorecard: scorecard.data,
    scorecardLoading: scorecard.isPending,
    scorecardError: scorecard.error,

    decisions: decisions.data,
    decisionsLoading: decisions.isPending,
    decisionsError: decisions.error,

    objectives: objectivesQuery.data?.objectives,
    objectivesLoading: objectivesQuery.isPending,
    objectivesError: objectivesQuery.error,

    summary: summary(),
    autopilot: autopilot(),
    growth: growth(),
    opportunities: opportunities(),
    degraded: degraded(),

    topOpportunity: topOpportunity(),
    needsOperator: needsOperator(),
    healthTone: healthTone(),
    healthLabel: healthLabel(),
    intelligenceStatus: intelligenceStatus(),
    intelligenceTone: intelligenceTone(),
  }
}
