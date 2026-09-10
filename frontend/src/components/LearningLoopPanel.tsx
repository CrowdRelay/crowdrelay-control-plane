import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { EmptyState } from './ui/empty-state'
import type { LearningLoopEntry } from '../lib/types'
import { SkeletonLearningLoop } from './Skeleton'
import { SectionIcon } from './SectionIcon'
import { DECISION_KIND_LABELS, labelOr } from '../lib/opportunity-labels'
import { Card } from './ui/card'
import { Alert } from './ui/alert'
import { cn } from '../lib/cn'

// The learning loop panel — shows the real decision → action → outcome chain.
// Uses the learning-loop endpoint which joins viryaos_autopilot_decisions,
// viryaos_autopilot_actions, and viryaos_autopilot_outcomes.
//
// Missing stages are shown as "Not yet measured" — never fabricated.
// The summary line (N decisions → M actions → K outcomes → success %) is
// computed from the returned data, not invented.

const confidencePercent = (basisPoints: number) => `${Math.round(basisPoints / 100)}%`

// Confidence level → text color class for color-coded confidence display.
// High (≥80%) = green, medium (≥50%) = accent, low = muted.
const confidenceClass = (basisPoints: number) => {
  const pct = basisPoints / 100
  if (pct >= 80) return 'text-success'
  if (pct >= 50) return 'text-primary'
  return 'text-muted-foreground'
}

// Action status → text color class for colored status badge.
const actionStatusClass = (status: string) => {
  if (status === 'succeeded') return 'text-success'
  if (status === 'failed') return 'text-destructive'
  if (status === 'pending' || status === 'in_progress') return 'text-warning'
  return 'text-muted-foreground'
}

const dispositionLabel = (disposition: string) =>
  disposition.replaceAll('_', ' ')

const timeAgo = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

const outcomeClass = (assessment: string): string => {
  if (assessment === 'improved') return 'text-success'
  if (assessment === 'worsened') return 'text-destructive'
  return 'text-muted-foreground'
}

const outcomeLabel = (assessment: string): string =>
  assessment.replaceAll('_', ' ')

export function LearningLoopPanel(props: { slug: string }) {
  const model = useQuery(() => ({
    queryKey: ['learning-loop', props.slug],
    queryFn: () => api.learningLoop(props.slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 20_000,
  }))

  const entries = (): LearningLoopEntry[] => model.data ?? []
  const total = () => entries().length
  const actionsCreated = () => entries().filter(e => e.action).length
  const executed = () => entries().filter(e => e.action?.status === 'succeeded').length
  const withOutcome = () => entries().filter(e => e.outcome).length
  const positiveOutcomes = () => entries().filter(e => e.outcome?.effect_assessment === 'improved').length
  const positiveOutcomeRate = () => {
    const measured = entries().filter(e => e.outcome)
    if (measured.length === 0) return null
    const improved = measured.filter(e => e.outcome!.effect_assessment === 'improved').length
    return Math.round((improved / measured.length) * 100)
  }

  return <Card flat class="p-4 space-y-4">
    <div>
      <h2 class="text-lg font-semibold text-foreground flex items-center gap-2"><SectionIcon name="book-open" />Decision → Action → Outcome → Learning</h2>
    </div>

    <Show when={model.error}>
      <Alert tone="warning" role="status">
        Learning loop data is temporarily unavailable.
      </Alert>
    </Show>

    <Show when={!model.error && model.isPending}>
      <SkeletonLearningLoop />
    </Show>

    <Show when={model.data}>
      <Show when={total() > 0} fallback={
        <EmptyState
          label="No decisions yet"
          hint="The learning loop appears once the brain has evaluated signals and made decisions."
        />
      }>
        {/* Summary line — computed from real data. The positive outcome
            rate is the headline metric, so it gets visual emphasis. */}
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div class="flex flex-col gap-1 p-3 rounded-md bg-surface-1">
            <span class="text-xs text-muted-foreground">Decisions</span>
            <strong class="text-lg tabular-nums text-foreground">{total()}</strong>
          </div>
          <div class="flex flex-col gap-1 p-3 rounded-md bg-surface-1">
            <span class="text-xs text-muted-foreground">Actions created</span>
            <strong class="text-lg tabular-nums text-foreground">{actionsCreated()}</strong>
          </div>
          <div class="flex flex-col gap-1 p-3 rounded-md bg-surface-1">
            <span class="text-xs text-muted-foreground">Executed</span>
            <strong class="text-lg tabular-nums text-foreground">{executed()}</strong>
          </div>
          <div class="flex flex-col gap-1 p-3 rounded-md bg-surface-1">
            <span class="text-xs text-muted-foreground">Outcomes measured</span>
            <strong class="text-lg tabular-nums text-foreground">{withOutcome()}</strong>
          </div>
          <div class="flex flex-col gap-1 p-3 rounded-md bg-surface-1">
            <span class="text-xs text-muted-foreground">Positive outcomes</span>
            <strong class="text-lg tabular-nums text-foreground">{positiveOutcomes()}</strong>
          </div>
          <div class="flex flex-col gap-1 p-3 rounded-md bg-primary/5 ring-1 ring-primary/20">
            <span class="text-xs text-primary">Positive outcome rate</span>
            <strong class="text-lg tabular-nums text-primary">{positiveOutcomeRate() != null ? `${positiveOutcomeRate()}%` : '—'}</strong>
          </div>
        </div>

        {/* Decision chain entries — left → right flow */}
        <div class="space-y-3">
          <For each={entries().slice(0, 10)}>{(entry) => (
            <div class="flex items-stretch gap-2 flex-wrap md:flex-nowrap">
              {/* DECISION */}
              <div class="flex-1 min-w-[180px] p-3 rounded-md border border-border bg-surface-1 space-y-2">
                <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Decision</span>
                <div class="space-y-1 text-sm">
                  <div class="flex justify-between gap-2"><span class="text-muted-foreground">Kind</span><strong class="text-foreground">{entry.decision_kind.replaceAll('_', ' ')}</strong></div>
                  <div class="flex justify-between gap-2"><span class="text-muted-foreground">Disposition</span><strong class="text-foreground">{dispositionLabel(entry.disposition)}</strong></div>
                  <div class="flex justify-between gap-2"><span class="text-muted-foreground">Confidence</span><strong class={confidenceClass(entry.confidence_basis_points)}>{confidencePercent(entry.confidence_basis_points)}</strong></div>
                  <div class="flex justify-between gap-2"><span class="text-muted-foreground">Evaluated</span><span class="text-foreground">{timeAgo(entry.evaluated_at)}</span></div>
                </div>
                <Show when={entry.reason}>
                  <p class="text-xs text-muted-foreground italic border-t border-border pt-2">{entry.reason}</p>
                </Show>
              </div>

              <div class="flex items-center text-muted-foreground px-1">→</div>

              {/* ACTION */}
              <div class="flex-1 min-w-[180px] p-3 rounded-md border border-border bg-surface-1 space-y-2">
                <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Action</span>
                <Show when={entry.action} fallback={
                  <Show when={entry.data_integrity?.action} fallback={
                    <p class="text-xs text-muted-foreground italic">No action — {dispositionLabel(entry.disposition)} decision</p>
                  }>
                    <p class="text-xs text-destructive italic" title="A stage that should exist but has a broken reference in the data.">Data integrity issue</p>
                  </Show>
                }>
                  {action => (
                    <div class="space-y-1 text-sm">
                      <div class="flex justify-between gap-2"><span class="text-muted-foreground">Kind</span><strong class="text-foreground">{labelOr(DECISION_KIND_LABELS, action().action_kind)}</strong></div>
                      <div class="flex justify-between gap-2"><span class="text-muted-foreground">Status</span><strong class={actionStatusClass(action().status)}>{action().status.replaceAll('_', ' ')}</strong></div>
                      <Show when={action().finished_at}>
                        <div class="flex justify-between gap-2"><span class="text-muted-foreground">Finished</span><span class="text-foreground">{timeAgo(action().finished_at!)}</span></div>
                      </Show>
                    </div>
                  )}
                </Show>
              </div>

              <div class="flex items-center text-muted-foreground px-1">→</div>

              {/* OUTCOME */}
              <div class="flex-1 min-w-[180px] p-3 rounded-md border border-border bg-surface-1 space-y-2">
                <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Outcome</span>
                <Show when={entry.outcome} fallback={
                  <Show when={entry.data_integrity?.outcome} fallback={
                    <p class="text-xs text-muted-foreground italic">Not yet measured</p>
                  }>
                    <p class="text-xs text-destructive italic" title="A stage that should exist but has a broken reference in the data.">Data integrity issue</p>
                  </Show>
                }>
                  {outcome => (
                    <div class="space-y-1 text-sm">
                      <div class="flex justify-between gap-2"><span class="text-muted-foreground">Assessment</span><strong class={outcomeClass(outcome().effect_assessment)}>{outcomeLabel(outcome().effect_assessment)}</strong></div>
                      <div class="flex justify-between gap-2"><span class="text-muted-foreground">Metric</span><span class="text-foreground">{outcome().metric_key.replaceAll('_', ' ')}</span></div>
                      <div class="flex justify-between gap-2"><span class="text-muted-foreground">Delta</span><strong class={outcomeClass(outcome().effect_assessment)}>{outcome().delta_basis_points > 0 ? '+' : ''}{(outcome().delta_basis_points / 100).toFixed(1)}%</strong></div>
                    </div>
                  )}
                </Show>
              </div>

              {/* LEARNING — derived from outcome, not fabricated */}
              <Show when={entry.outcome}>
                <div class="flex items-center text-muted-foreground px-1">→</div>
                <div class="flex-1 min-w-[180px] p-3 rounded-md border border-border bg-surface-1 space-y-2">
                  <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Learned</span>
                  <p class={cn('text-sm', outcomeClass(entry.outcome!.effect_assessment))}>
                    <Show when={entry.outcome!.effect_assessment === 'improved'} fallback={
                      <Show when={entry.outcome!.effect_assessment === 'worsened'} fallback={
                        <>No change detected on {entry.outcome!.metric_key.replaceAll('_', ' ')}</>
                      }>
                        <>Negative effect on {entry.outcome!.metric_key.replaceAll('_', ' ')} — policy may re-evaluate this pattern</>
                      </Show>
                    }>
                      <>Positive effect confirmed on {entry.outcome!.metric_key.replaceAll('_', ' ')}</>
                    </Show>
                  </p>
                </div>
              </Show>
            </div>
          )}</For>
        </div>
      </Show>
    </Show>
  </Card>
}
