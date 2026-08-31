import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { refreshTick } from '../lib/refresh'
import { EmptyState } from './EmptyState'
import type { LearningLoopEntry } from '../lib/types'

// The learning loop panel — shows the real decision → action → outcome chain.
// Uses the learning-loop endpoint which joins viryaos_autopilot_decisions,
// viryaos_autopilot_actions, and viryaos_autopilot_outcomes.
//
// Missing stages are shown as "Not yet measured" — never fabricated.
// The summary line (N decisions → M actions → K outcomes → success %) is
// computed from the returned data, not invented.

const confidencePercent = (basisPoints: number) => `${Math.round(basisPoints / 100)}%`

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
  if (assessment === 'improved') return 'learning-loop-outcome-improved'
  if (assessment === 'worsened') return 'learning-loop-outcome-worsened'
  return 'learning-loop-outcome-neutral'
}

const outcomeLabel = (assessment: string): string =>
  assessment.replaceAll('_', ' ')

export function LearningLoopPanel(props: { slug: string }) {
  const model = useQuery(() => ({
    queryKey: ['learning-loop', props.slug, refreshTick()],
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

  return <article class="panel learning-loop-panel">
    <div class="learning-loop-head">
      <div>
        <span class="eyebrow">LEARNING LOOP</span>
        <h2>Decision → Action → Outcome → Learning</h2>
      </div>
    </div>

    <Show when={model.error}>
      <div class="warning-card" role="status">
        Learning loop data is temporarily unavailable.
      </div>
    </Show>

    <Show when={!model.error && model.isPending}>
      <div class="mini-skeleton" />
    </Show>

    <Show when={model.data}>
      <Show when={total() > 0} fallback={
        <EmptyState
          label="No decisions yet"
          hint="The learning loop appears once the brain has evaluated signals and made decisions."
        />
      }>
        {/* Summary line — computed from real data */}
        <div class="learning-loop-summary">
          <div class="learning-loop-stat">
            <span>Decisions</span>
            <strong>{total()}</strong>
          </div>
          <div class="learning-loop-stat">
            <span>Actions created</span>
            <strong>{actionsCreated()}</strong>
          </div>
          <div class="learning-loop-stat">
            <span>Executed</span>
            <strong>{executed()}</strong>
          </div>
          <div class="learning-loop-stat">
            <span>Outcomes measured</span>
            <strong>{withOutcome()}</strong>
          </div>
          <div class="learning-loop-stat">
            <span>Positive outcomes</span>
            <strong>{positiveOutcomes()}</strong>
          </div>
          <div class="learning-loop-stat">
            <span>Positive outcome rate</span>
            <strong>{positiveOutcomeRate() != null ? `${positiveOutcomeRate()}%` : '—'}</strong>
          </div>
        </div>

        {/* Decision chain entries */}
        <div class="learning-loop-list">
          <For each={entries().slice(0, 10)}>{(entry) => (
            <div class="learning-loop-entry">
              {/* DECISION */}
              <div class="learning-loop-stage">
                <span class="learning-loop-stage-label">Decision</span>
                <span class="learning-loop-stage-content">
                  <strong>{entry.decision_kind.replaceAll('_', ' ')}</strong>
                  {' · '}
                  {dispositionLabel(entry.disposition)}
                  {' · '}
                  confidence {confidencePercent(entry.confidence_basis_points)}
                  {' · '}
                  {timeAgo(entry.evaluated_at)}
                </span>
              </div>
              <Show when={entry.reason}>
                <div class="learning-loop-stage">
                  <span class="learning-loop-stage-label">Reason</span>
                  <span class="learning-loop-stage-content">{entry.reason}</span>
                </div>
              </Show>

              {/* ACTION */}
              <div class="learning-loop-arrow">↓</div>
              <div class="learning-loop-stage">
                <span class="learning-loop-stage-label">Action</span>
                <Show when={entry.action} fallback={
                  <Show when={entry.data_integrity?.action} fallback={
                    <span class="learning-loop-stage-content learning-loop-pending">
                      No action — {dispositionLabel(entry.disposition)} decision
                    </span>
                  }>
                    <span class="learning-loop-stage-content learning-loop-integrity-issue">
                      Data integrity issue
                    </span>
                  </Show>
                }>
                  {action => (
                    <span class="learning-loop-stage-content">
                      <strong>{action().action_kind.replaceAll('_', ' ')}</strong>
                      {' · '}
                      {action().status.replaceAll('_', ' ')}
                      <Show when={action().finished_at}>
                        {' · '}{timeAgo(action().finished_at!)}
                      </Show>
                    </span>
                  )}
                </Show>
              </div>

              {/* OUTCOME */}
              <div class="learning-loop-arrow">↓</div>
              <div class="learning-loop-stage">
                <span class="learning-loop-stage-label">Outcome</span>
                <Show when={entry.outcome} fallback={
                  <Show when={entry.data_integrity?.outcome} fallback={
                    <span class="learning-loop-stage-content learning-loop-pending">
                      Not yet measured
                    </span>
                  }>
                    <span class="learning-loop-stage-content learning-loop-integrity-issue">
                      Data integrity issue
                    </span>
                  </Show>
                }>
                  {outcome => (
                    <span class={`learning-loop-stage-content ${outcomeClass(outcome().effect_assessment)}`}>
                      <strong>{outcomeLabel(outcome().effect_assessment)}</strong>
                      {' · '}
                      {outcome().metric_key.replaceAll('_', ' ')}
                      {' · '}
                      {outcome().delta_basis_points > 0 ? '+' : ''}{(outcome().delta_basis_points / 100).toFixed(1)}%
                    </span>
                  )}
                </Show>
              </div>

              {/* LEARNING — derived from outcome, not fabricated */}
              <Show when={entry.outcome}>
                <div class="learning-loop-arrow">↓</div>
                <div class="learning-loop-stage">
                  <span class="learning-loop-stage-label">Learned</span>
                  <span class={`learning-loop-stage-content ${outcomeClass(entry.outcome!.effect_assessment)}`}>
                    <Show when={entry.outcome!.effect_assessment === 'improved'} fallback={
                      <Show when={entry.outcome!.effect_assessment === 'worsened'} fallback={
                        <>No change detected on {entry.outcome!.metric_key.replaceAll('_', ' ')}</>
                      }>
                        <>Negative effect on {entry.outcome!.metric_key.replaceAll('_', ' ')} — policy may re-evaluate this pattern</>
                      </Show>
                    }>
                      <>Positive effect confirmed on {entry.outcome!.metric_key.replaceAll('_', ' ')}</>
                    </Show>
                  </span>
                </div>
              </Show>
            </div>
          )}</For>
        </div>
      </Show>
    </Show>
  </article>
}
