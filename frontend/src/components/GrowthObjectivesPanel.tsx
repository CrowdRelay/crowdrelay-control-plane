import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api, ApiError } from '../lib/api'
import { refreshQueries } from '../lib/refresh'
import { errorMessage } from '../lib/format'
import { compactNumber } from '../lib/charts'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { ErrorCard } from './layout'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
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

const toneVariant = (tone: 'good' | 'warn' | 'bad' | 'muted'): 'success' | 'warning' | 'destructive' | 'muted' =>
  tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : tone === 'bad' ? 'destructive' : 'muted'

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
      setError(objectiveErrorMessage(err, 'We couldn\'t retire that objective. Try again.'))
    } finally {
      setRetiring(null)
    }
  }

  return <Card flat class="p-4">
    <div class="flex items-center justify-between gap-4">
      <h3 class="text-sm font-semibold text-foreground">Growth objectives</h3>
      <Show when={objectives.data && objectives.data!.length > 0}>
        <span class="text-muted-foreground">{objectives.data!.length} objectives</span>
      </Show>
    </div>
    <p class="mt-1 text-sm text-muted-foreground">Declared growth targets with progress tracking. Each objective freezes a baseline and measures progress toward the target value by the deadline.</p>

    <Show when={error()}>
      <ErrorCard class="mt-3">{error()}</ErrorCard>
    </Show>

    <Show when={objectives.error}><ErrorCard class="mt-3">Growth objectives unavailable: {objectiveErrorMessage(objectives.error, 'We couldn\'t reach the growth objectives. Try refreshing.')}</ErrorCard></Show>
    <Show when={objectives.data && objectives.data!.length > 0} fallback={
      <Show when={objectives.isFetching} fallback={
        <EmptyState label="No growth objectives declared" hint="Declare a target metric and deadline to start tracking progress. The intelligence measures every action against active objectives." />
      }>
        <SkeletonRows count={3} />
      </Show>
    }>
      <div class="mt-3 flex flex-col gap-3">
        <For each={showAll() ? objectives.data : objectives.data!.slice(0, MAX_VISIBLE)}>{(obj: GrowthObjectiveView) => {
          const observed = obj.observed_value ?? obj.baseline_value
          const pct = stateProgress(obj.state)
          const overTarget = observed > obj.target_value
          return (
            <div class="p-4 border border-border rounded-lg bg-card">
              <div class="flex items-center justify-between gap-3">
                <strong class="text-sm font-semibold text-foreground">{obj.platform} · {obj.metric_key.replace(/_/g, ' ')}</strong>
                <div class="flex items-center gap-2">
                  <Badge variant={toneVariant(stateTone(obj.state))}>{stateLabel(obj.state)}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    writes
                    disabled={retiring() === obj.objective_id}
                    onClick={() => retireObjective(obj)}
                  >{retiring() === obj.objective_id ? 'Retiring…' : 'Retire'}</Button>
                </div>
              </div>
              <div class="mt-3 h-2 rounded-full bg-surface-3 overflow-hidden">
                <div
                  class={`h-full rounded-full ${overTarget ? 'bg-destructive' : 'bg-primary'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div class="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
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
        <Button variant="ghost" size="sm" class="mt-3" onClick={() => setShowAll(s => !s)}>
          {showAll() ? 'Show fewer' : `Show all ${objectives.data!.length}`}
        </Button>
      </Show>
    </Show>
  </Card>
}
