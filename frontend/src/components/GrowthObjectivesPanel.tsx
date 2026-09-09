import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api, ApiError } from '../lib/api'
import { refreshQueries } from '../lib/refresh'
import { errorMessage } from '../lib/format'
import { compactNumber } from '../lib/charts'
import { EmptyState } from './EmptyState'
import { SkeletonRows } from './Skeleton'
import type { GrowthObjectiveView, ObjectiveState } from '../lib/types'

const formatDeadline = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days < 30) return `${days}d left`
  if (days < 365) return `${Math.floor(days / 30)}mo left`
  return `${Math.floor(days / 365)}y left`
}

const stateLabel = (state: ObjectiveState): string => {
  switch (state.state) {
    case 'met': return 'Met'
    case 'on_track': return 'On track'
    case 'behind': return 'Behind'
    case 'missed': return 'Missed'
    case 'unmeasurable': return 'Unmeasurable'
  }
}

const stateTone = (state: ObjectiveState): 'good' | 'warn' | 'bad' | 'muted' => {
  switch (state.state) {
    case 'met': return 'good'
    case 'on_track': return 'good'
    case 'behind': return 'warn'
    case 'missed': return 'bad'
    case 'unmeasurable': return 'muted'
  }
}

const stateProgress = (state: ObjectiveState): number => {
  switch (state.state) {
    case 'met': case 'on_track': case 'behind': case 'missed':
      return Math.min(100, Math.round(state.progress_basis_points / 100))
    case 'unmeasurable': return 0
  }
}

// For contract_mismatch the generic errorMessage() heading hides the
// specific reason ("invalid upstream JSON", "upstream returned an empty
// success body", etc.). Surface the actual reason so the operator can
// diagnose whether the upstream is returning HTML, an empty body, or
// a shape that genuinely changed.
const objectiveErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiError && error.code === 'contract_mismatch') {
    return `${errorMessage(error, fallback)} (${error.message})`
  }
  return errorMessage(error, fallback)
}

export function GrowthObjectivesPanel(props: { slug: string }) {
  const [error, setError] = createSignal<string | null>(null)
  const [retiring, setRetiring] = createSignal<string | null>(null)
  const [showAll, setShowAll] = createSignal(false)
  const MAX_VISIBLE = 6

  const objectives = useQuery(() => ({
    queryKey: ['growth-objectives', props.slug],
    queryFn: async () => {
      const data = await api.growthObjectives(props.slug)
      return data.objectives
    },
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const retireObjective = async (objective: GrowthObjectiveView) => {
    setRetiring(objective.objective_id)
    setError(null)
    try {
      await api.retireGrowthObjective(props.slug, objective.objective_id)
      refreshQueries(['growth-objectives', props.slug])
    } catch (err) {
      setError(objectiveErrorMessage(err, 'Failed to retire objective'))
    } finally {
      setRetiring(null)
    }
  }

  return <div class="agent-section">
    <div class="agent-section-head">
      <h3>Growth objectives</h3>
      <Show when={objectives.data && objectives.data!.length > 0}>
        <span class="text-muted-foreground">{objectives.data!.length} objectives</span>
      </Show>
    </div>
    <p class="agent-section-intro">Declared growth targets with progress tracking. Each objective freezes a baseline and measures progress toward the target value by the deadline.</p>

    <Show when={error()}>
      <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{error()}</div>
    </Show>

    <Show when={objectives.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">Growth objectives unavailable: {objectiveErrorMessage(objectives.error, 'Service unreachable')}</div></Show>
    <Show when={objectives.data && objectives.data!.length > 0} fallback={
      <Show when={objectives.isFetching} fallback={
        <EmptyState label="No growth objectives declared" hint="Declare a target metric and deadline to start tracking progress. The intelligence measures every action against active objectives." />
      }>
        <SkeletonRows count={3} />
      </Show>
    }>
      <div class="objective-list">
        <For each={showAll() ? objectives.data : objectives.data!.slice(0, MAX_VISIBLE)}>{(obj: GrowthObjectiveView) => {
          const observed = obj.observed_value ?? obj.baseline_value
          const pct = stateProgress(obj.state)
          const overTarget = observed > obj.target_value
          return (
            <div class="objective-card">
              <div class="objective-card-head">
                <strong>{obj.platform} · {obj.metric_key}</strong>
                <span class={`badge tone-${stateTone(obj.state)}`}>{stateLabel(obj.state)}</span>
                <button
                  class="ghost"
                  disabled={retiring() === obj.objective_id}
                  onClick={() => retireObjective(obj)}
                >{retiring() === obj.objective_id ? 'Retiring…' : 'Retire'}</button>
              </div>
              <div class="objective-progress-track">
                <div
                  class={`objective-progress-fill ${overTarget ? 'over' : ''}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div class="objective-meta">
                <span>Baseline: {compactNumber(obj.baseline_value)}</span>
                <span>Observed: {obj.observed_value != null ? compactNumber(obj.observed_value) : '—'}</span>
                <span>Target: {compactNumber(obj.target_value)}</span>
                <span>{formatDeadline(obj.deadline)}</span>
              </div>
            </div>
          )
        }}</For>
      </div>
      <Show when={objectives.data!.length > MAX_VISIBLE}>
        <button class="ghost" onClick={() => setShowAll(s => !s)}>
          {showAll() ? 'Show less' : `Show all (${objectives.data!.length})`}
        </button>
      </Show>
    </Show>
  </div>
}
