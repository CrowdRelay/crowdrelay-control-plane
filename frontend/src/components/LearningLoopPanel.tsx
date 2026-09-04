import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { EmptyState } from './EmptyState'
import type { LearningLoopEntry } from '../lib/types'
import { SkeletonLearningLoop } from './Skeleton'
import { SectionIcon } from './SectionIcon'
import { DECISION_KIND_LABELS, labelOr } from '../lib/opportunity-labels'

// The learning loop panel — shows the real decision → action → outcome chain.
// Uses the learning-loop endpoint which joins viryaos_autopilot_decisions,
// viryaos_autopilot_actions, and viryaos_autopilot_outcomes.
//
// Missing stages are shown as "Not yet measured" — never fabricated.
// The summary line (N decisions → M actions → K outcomes → success %) is
// computed from the returned data, not invented.

const confidencePercent = (basisPoints: number) => `${Math.round(basisPoints / 100)}%`

// Confidence level → CSS class for color-coded confidence display.
// High (≥80%) = green, medium (≥50%) = accent, low = muted.
const confidenceClass = (basisPoints: number) => {
  const pct = basisPoints / 100
  if (pct >= 80) return 'learning-loop-conf-high'
  if (pct >= 50) return 'learning-loop-conf-medium'
  return 'learning-loop-conf-low'
}

// Action status → tone class for colored status badge.
const actionStatusClass = (status: string) => {
  if (status === 'succeeded') return 'learning-loop-status-succeeded'
  if (status === 'failed') return 'learning-loop-status-failed'
  if (status === 'pending' || status === 'in_progress') return 'learning-loop-status-pending'
  return 'learning-loop-status-neutral'
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
  if (assessment === 'improved') return 'learning-loop-outcome-improved'
  if (assessment === 'worsened') return 'learning-loop-outcome-worsened'
  return 'learning-loop-outcome-neutral'
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

  return <article class="panel learning-loop-panel">
    <div class="learning-loop-head">
      <div>
        <span class="eyebrow">LEARNING LOOP</span>
        <h2><SectionIcon name="book-open" />Decision → Action → Outcome → Learning</h2>
      </div>
    </div>

    <Show when={model.error}>
      <div class="warning-card" role="status">
        Learning loop data is temporarily unavailable.
      </div>
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
          <div class="learning-loop-stat learning-loop-stat-highlight">
            <span>Positive outcome rate</span>
            <strong>{positiveOutcomeRate() != null ? `${positiveOutcomeRate()}%` : '—'}</strong>
          </div>
        </div>

        {/* Decision chain entries — left → right flow */}
        <div class="learning-loop-list">
          <For each={entries().slice(0, 10)}>{(entry) => (
            <div class="learning-loop-entry">
              {/* DECISION */}
              <div class="learning-loop-stage-card learning-loop-stage-decision">
                <span class="learning-loop-stage-label">Decision</span>
                <div class="learning-loop-stage-rows">
                  <div><span class="muted">Kind</span><strong>{entry.decision_kind.replaceAll('_', ' ')}</strong></div>
                  <div><span class="muted">Disposition</span><strong>{dispositionLabel(entry.disposition)}</strong></div>
                  <div><span class="muted">Confidence</span><strong class={confidenceClass(entry.confidence_basis_points)}>{confidencePercent(entry.confidence_basis_points)}</strong></div>
                  <div><span class="muted">Evaluated</span><span>{timeAgo(entry.evaluated_at)}</span></div>
                </div>
                <Show when={entry.reason}>
                  <p class="learning-loop-reason">{entry.reason}</p>
                </Show>
              </div>

              <div class="learning-loop-arrow">→</div>

              {/* ACTION */}
              <div class="learning-loop-stage-card learning-loop-stage-action">
                <span class="learning-loop-stage-label">Action</span>
                <Show when={entry.action} fallback={
                  <Show when={entry.data_integrity?.action} fallback={
                    <p class="learning-loop-pending">No action — {dispositionLabel(entry.disposition)} decision</p>
                  }>
                    <p class="learning-loop-integrity-issue" title="A stage that should exist but has a broken reference in the data.">Data integrity issue</p>
                  </Show>
                }>
                  {action => (
                    <div class="learning-loop-stage-rows">
                      <div><span class="muted">Kind</span><strong>{labelOr(DECISION_KIND_LABELS, action().action_kind)}</strong></div>
                      <div><span class="muted">Status</span><strong class={actionStatusClass(action().status)}>{action().status.replaceAll('_', ' ')}</strong></div>
                      <Show when={action().finished_at}>
                        <div><span class="muted">Finished</span><span>{timeAgo(action().finished_at!)}</span></div>
                      </Show>
                    </div>
                  )}
                </Show>
              </div>

              <div class="learning-loop-arrow">→</div>

              {/* OUTCOME */}
              <div class="learning-loop-stage-card learning-loop-stage-outcome">
                <span class="learning-loop-stage-label">Outcome</span>
                <Show when={entry.outcome} fallback={
                  <Show when={entry.data_integrity?.outcome} fallback={
                    <p class="learning-loop-pending">Not yet measured</p>
                  }>
                    <p class="learning-loop-integrity-issue" title="A stage that should exist but has a broken reference in the data.">Data integrity issue</p>
                  </Show>
                }>
                  {outcome => (
                    <div class="learning-loop-stage-rows">
                      <div><span class="muted">Assessment</span><strong class={outcomeClass(outcome().effect_assessment)}>{outcomeLabel(outcome().effect_assessment)}</strong></div>
                      <div><span class="muted">Metric</span><span>{outcome().metric_key.replaceAll('_', ' ')}</span></div>
                      <div><span class="muted">Delta</span><strong class={outcomeClass(outcome().effect_assessment)}>{outcome().delta_basis_points > 0 ? '+' : ''}{(outcome().delta_basis_points / 100).toFixed(1)}%</strong></div>
                    </div>
                  )}
                </Show>
              </div>

              {/* LEARNING — derived from outcome, not fabricated */}
              <Show when={entry.outcome}>
                <div class="learning-loop-arrow">→</div>
                <div class="learning-loop-stage-card learning-loop-stage-learned">
                  <span class="learning-loop-stage-label">Learned</span>
                  <p class={outcomeClass(entry.outcome!.effect_assessment)}>
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
  </article>
}
