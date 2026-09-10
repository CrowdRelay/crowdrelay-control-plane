import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { EmptyState } from './EmptyState'
import type { LearningProofEntry } from '../lib/types'
import { SectionIcon } from './SectionIcon'
import { Card } from './ui/card'
import { Alert } from './ui/alert'
import { Badge } from './ui/badge'

// The learning proof panel — what the brain changed, because of what.
//
// LearningLoopPanel shows decision → action → outcome, which proves the brain
// acts and that its actions get measured. It cannot show the link that makes
// the loop a loop: that a later decision differs *because* of an earlier
// outcome. This panel reads the belief-revision ledger, where each row was
// written by the code that performed the update and cites the actions whose
// measured outcomes caused it.
//
// Nothing here is inferred. An entry with no influenced decisions renders as
// exactly that — a belief that moved and has not yet changed what the brain
// does — rather than being hidden or dressed up as proof.

const timeAgo = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

const MODULE_LABELS: Record<string, string> = {
  strategy_posterior: 'Strategy posterior',
  hypothesis_state: 'Template lifecycle',
}

const moduleLabel = (module: string) => MODULE_LABELS[module] ?? module.replaceAll('_', ' ')

const outcomeClass = (assessment: string | null): string => {
  if (assessment === 'improved') return 'learning-loop-outcome-improved'
  if (assessment === 'worsened') return 'learning-loop-outcome-worsened'
  return 'learning-loop-outcome-neutral'
}

export function LearningProofPanel(props: { slug: string }) {
  const model = useQuery(() => ({
    queryKey: ['learning-proof', props.slug],
    queryFn: () => api.learningProof(props.slug),
    reconcile: 'revision_id',
    refetchOnWindowFocus: false,
    staleTime: 20_000,
  }))

  const entries = (): LearningProofEntry[] => model.data?.entries ?? []
  const provenChains = () => entries().filter(entry => entry.changed_a_decision).length

  return <Card class="p-4 learning-proof-panel">
    <div class="learning-loop-head">
      <div>
        <h2><SectionIcon name="git-branch" />Outcome → Belief → Next decision</h2>
        <p class="text-muted-foreground text-sm">
          What the brain changed its mind about, and what changed it.
        </p>
      </div>
    </div>

    <Show when={model.error}>
      <Alert tone="warning" role="status">
        Learning proof data is temporarily unavailable.
      </Alert>
    </Show>

    <Show when={model.data}>
      <Show when={entries().length > 0} fallback={
        <EmptyState
          label="No belief changes recorded yet"
          hint="A revision is written when measured outcomes move the strategy posterior or a template's lifecycle state. Until outcomes resolve, there is nothing to record."
        />
      }>
        <div class="learning-loop-summary">
          <div class="learning-loop-stat">
            <span>Beliefs changed</span>
            <strong>{entries().length}</strong>
          </div>
          <div class="learning-loop-stat learning-loop-stat-highlight">
            <span>Changed a later decision</span>
            <strong>{provenChains()}</strong>
          </div>
        </div>

        <div class="learning-proof-list">
          <For each={entries()}>{(entry) => (
            <div class="learning-proof-entry">
              <div class="learning-proof-header">
                <Badge variant={entry.changed_a_decision ? 'success' : 'muted'}>
                  {entry.changed_a_decision ? 'Changed a decision' : 'Not yet acted on'}
                </Badge>
                <span class="text-muted-foreground">{moduleLabel(entry.module)}</span>
                <span class="text-muted-foreground">{entry.belief_key.replace(/_/g, ' ')}</span>
                <span class="text-muted-foreground">{timeAgo(entry.recorded_at)}</span>
              </div>

              <p class="learning-proof-summary">{entry.change_summary}</p>

              {/* WHAT HAPPENED — the ledger's own citation, not a timestamp match */}
              <div class="learning-proof-stage">
                <span class="learning-loop-stage-label">Because of</span>
                <Show when={entry.caused_by.length > 0} fallback={
                  <p class="learning-loop-pending">
                    The cited actions are no longer readable.
                  </p>
                }>
                  <For each={entry.caused_by}>{(cause) => (
                    <div class="learning-proof-cause">
                      <strong>{(cause.action_kind ?? 'action').replaceAll('_', ' ')}</strong>
                      <Show when={cause.decision_reason}>
                        <span class="text-muted-foreground">{cause.decision_reason}</span>
                      </Show>
                      <Show when={cause.effect_assessment} fallback={
                        <span class="learning-loop-pending">no assessed outcome recorded</span>
                      }>
                        <span class={outcomeClass(cause.effect_assessment)}>
                          {cause.effect_assessment} on {(cause.metric_key ?? '').replaceAll('_', ' ')}
                          <Show when={cause.delta_basis_points != null}>
                            {' '}({cause.delta_basis_points! > 0 ? '+' : ''}{(cause.delta_basis_points! / 100).toFixed(1)}%)
                          </Show>
                        </span>
                      </Show>
                      <span class="text-muted-foreground">{timeAgo(cause.observed_at ?? cause.decided_at)}</span>
                    </div>
                  )}</For>
                </Show>
              </div>

              {/* WHAT CHANGED AFTERWARDS — matched on what each decision itself
                  recorded at decision time, never re-derived now */}
              <div class="learning-proof-stage">
                <span class="learning-loop-stage-label">So the brain then</span>
                <Show when={entry.then_influenced.length > 0} fallback={
                  <p class="learning-loop-pending">
                    Has not taken a decision on this belief yet.
                  </p>
                }>
                  <For each={entry.then_influenced}>{(influence) => (
                    <div class="learning-proof-influence">
                      <strong>{influence.decision_kind.replaceAll('_', ' ')}</strong>
                      <Show when={influence.template_id}>
                        <span class="text-muted-foreground">{influence.template_id!.replace(/_/g, ' ')}</span>
                      </Show>
                      <Show when={influence.strategy_source === 'posterior'} fallback={
                        <span class="text-muted-foreground">
                          strategy {influence.strategy_applied ?? '—'} (operator rules agreed)
                        </span>
                      }>
                        <span class="learning-loop-outcome-improved">
                          strategy {influence.strategy_prior ?? '—'} → {influence.strategy_applied ?? '—'} because of what was measured
                        </span>
                      </Show>
                      <span class="text-muted-foreground">{timeAgo(influence.evaluated_at)}</span>
                    </div>
                  )}</For>
                </Show>
              </div>
            </div>
          )}</For>
        </div>
      </Show>
    </Show>
  </Card>
}
