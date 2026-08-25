import { For, Show, createSignal } from 'solid-js'
import type { OpportunityBoardEntry } from '../lib/types'
import { api } from '../lib/api'
import { StatusBadge } from './StatusBadge'

// Phase 18 — find, then "do it". CrowdRelay parks what its agent found; this
// board is where a human decides. "Do it" approves through CrowdRelay's own
// approval endpoint and "done ourselves" records that a human took the
// opportunity outside the system — a first-class outcome, not a dismissal.
// The panel renders one slice of the Operations read model and never fetches.

const errorMessage = (value: unknown, fallback: string) => value instanceof Error ? value.message : fallback

const formatDue = (value: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleString()
}

const authorityTone = (entry: OpportunityBoardEntry): 'good' | 'warn' | 'bad' | 'muted' => {
  if (entry.authority === 'awaiting_approval') return 'warn'
  if (entry.authority === 'auto_executing') return 'good'
  if (entry.authority === 'recommended') return 'good'
  return 'muted'
}

const authorityLabel = (entry: OpportunityBoardEntry) =>
  entry.authority.replaceAll('_', ' ')

const RANK_FACTOR_LABELS: Record<string, string> = {
  authority: 'authority state',
  deadline: 'deadline proximity',
  value_tier: 'value tier',
  measured_effect: 'measured effect',
  confidence: 'confidence',
  magnitude: 'deviation magnitude',
  tie: 'stable tie-break',
}

const VALUE_TIER_LABELS: Record<string, string> = {
  vanity: 'vanity',
  intermediate: 'intermediate',
  downstream: 'downstream',
}

const confidencePercent = (basisPoints: number) => `${Math.round(basisPoints / 100)}%`

// Basis points are the queue's only magnitude; percent is what a human reads.
const deviationLabel = (entry: OpportunityBoardEntry) =>
  entry.deviation_basis_points == null ? null : `${(entry.deviation_basis_points / 100).toFixed(1)}% measured movement`

export function OpportunityBoardPanel(props: {
  slug: string
  opportunities: OpportunityBoardEntry[] | null
  degraded: boolean
  refresh: () => Promise<unknown>
}) {
  const board = {
    get data() { return props.opportunities ?? undefined },
    get error() { return props.degraded ? new Error('Opportunity queue is temporarily unavailable.') : undefined },
  }

  const [pendingMutation, setPendingMutation] = createSignal<string | null>(null)
  const [confirming, setConfirming] = createSignal<string | null>(null)
  const [mutationError, setMutationError] = createSignal<string | null>(null)

  // One mutation at a time; destructive intent needs a second click on the
  // same control before anything is sent.
  const decide = async (key: string, operation: () => Promise<unknown>) => {
    if (pendingMutation() !== null) return
    if (confirming() !== key) {
      setConfirming(key)
      return
    }
    setConfirming(null)
    setMutationError(null)
    setPendingMutation(key)
    try {
      await operation()
      await props.refresh()
    } catch (error) {
      setMutationError(errorMessage(error, 'Opportunity decision failed'))
    } finally {
      setPendingMutation(null)
    }
  }

  const doIt = (entry: OpportunityBoardEntry) => {
    if (!entry.action_id) return
    void decide(`do:${entry.decision_id}`, () => api.approveOpportunityAction(props.slug, entry.action_id!))
  }

  const doneOurselves = (entry: OpportunityBoardEntry) =>
    void decide(`done:${entry.decision_id}`, () => api.markOpportunityHandledExternally(props.slug, entry.decision_id))

  return <article class="panel operations-panel">
    <div class="section-title operations-title">
      <div>
        <span class="eyebrow">OPPORTUNITY BOARD</span>
        <h2>Found for you — decide</h2>
        <p>Everything the agent found and parked: gigs with computed economics, pitches, waves and deadlines. “Do it” approves the parked action through CrowdRelay’s existing approval path; “done ourselves” records that a human handled it outside the system, which is a success — not a dismissal.</p>
      </div>
      <StatusBadge status={board.data ? `${board.data.length} queued` : 'loading'} tone={board.error ? 'bad' : 'muted'} />
    </div>

    <Show when={board.error}>
      <div class="warning-card operations-warning" role="status">
        {errorMessage(board.error, 'Opportunity queue is temporarily unavailable.')}
      </div>
    </Show>

    <Show when={mutationError()}>
      {message => <div class="error-card operations-error" role="alert">{message()}</div>}
    </Show>

    <Show when={board.data} fallback={!board.error ? <div class="mini-skeleton"/> : null}>{data => <>
      <Show when={data().length === 0}>
        <div class="inherit-card"><p>The agent has nothing parked right now. Findings appear here the moment a detector raises them.</p></div>
      </Show>
      <Show when={data().length > 0}>
        <div class="flag-list opportunity-list">
          <For each={data()}>{entry => (
            <div class="flag-row release-component-row opportunity-row">
              <div class="opportunity-body">
                <strong>
                  <span class="opportunity-rank">#{entry.position}</span>
                  {' '}{entry.recommended_action}
                </strong>
                <small>{entry.context.replaceAll('_', ' ')} · {entry.decision_kind.replaceAll('_', ' ')} · {entry.subject_kind}</small>
                <small>{entry.reason}</small>
                <Show when={formatDue(entry.due_at)}>
                  {due => <small class="opportunity-deadline">deadline {due()}</small>}
                </Show>
                <small class="opportunity-consequence">if ignored: {entry.consequence}</small>
                <div class="row-health opportunity-facts">
                  <StatusBadge status={authorityLabel(entry)} tone={authorityTone(entry)} />
                  <span class="badge">{RANK_FACTOR_LABELS[entry.ranked_by] ?? entry.ranked_by}</span>
                  <span class="badge">confidence {confidencePercent(entry.confidence)}</span>
                  <Show when={entry.value_tier}>
                    {tier => <span class="badge">{VALUE_TIER_LABELS[tier()] ?? tier()} value</span>}
                  </Show>
                  <Show when={deviationLabel(entry)}>
                    {label => <span class="badge">{label()}</span>}
                  </Show>
                </div>
              </div>
              <div class="opportunity-actions">
                <Show when={entry.action_id} fallback={<span class="opportunity-no-action">no executable step — handle it yourself</span>}>
                  <button
                    type="button"
                    classList={{ 'confirm-danger': confirming() === `do:${entry.decision_id}` }}
                    disabled={pendingMutation() !== null}
                    onClick={() => doIt(entry)}
                  >
                    {pendingMutation() === `do:${entry.decision_id}` ? 'Approving…' : confirming() === `do:${entry.decision_id}` ? 'Confirm approval' : 'Do it'}
                  </button>
                </Show>
                <button
                  type="button"
                  class="ghost"
                  disabled={pendingMutation() !== null}
                  onClick={() => doneOurselves(entry)}
                >
                  {pendingMutation() === `done:${entry.decision_id}` ? 'Recording…' : confirming() === `done:${entry.decision_id}` ? 'Confirm done' : 'Done ourselves'}
                </button>
              </div>
            </div>
          )}</For>
        </div>
      </Show>
    </>}</Show>
  </article>
}
