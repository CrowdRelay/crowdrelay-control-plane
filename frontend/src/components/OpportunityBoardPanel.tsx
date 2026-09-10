import { For, Show, createSignal } from 'solid-js'
import type { OpportunityBoardEntry } from '../lib/types'
import { api } from '../lib/api'
import { StatusBadge } from './StatusBadge'
import { errorMessage } from '../lib/format'
import { SkeletonOpportunityBoard } from './Skeleton'
import { CONTEXT_LABELS, SUBJECT_KIND_LABELS, RANK_FACTOR_LABELS, VALUE_TIER_LABELS, labelOr, opportunityTitle } from '../lib/opportunity-labels'
import { SectionIcon } from './SectionIcon'
import { Spinner } from './Spinner'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

// Phase 18 — find, then "do it". CrowdRelay parks what its agent found; this
// board is where a human decides. "Do it" approves through CrowdRelay's own
// approval endpoint and "done ourselves" records that a human took the
// opportunity outside the system — a first-class outcome, not a dismissal.
// The panel renders one slice of the Operations read model and never fetches.


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

// Only a parked action can be approved. Everything else on this board is
// reported, not requested: `auto_executing` already ran under a bounded_auto
// policy, and `recommended`/`observed` never produced an action to approve.
//
// The button used to render whenever an `action_id` existed, which is true of
// every executed action too — so on a tenant whose policies are all
// bounded_auto, every "Do it" hit a 409 and the board looked broken while
// working exactly as designed.
const isApprovable = (entry: OpportunityBoardEntry) =>
  entry.authority === 'awaiting_approval' && entry.action_id !== null

const NOT_APPROVABLE_NOTE: Record<string, string> = {
  auto_executing: 'ran automatically — nothing to approve',
  recommended: 'advice only — no action was parked',
  observed: 'recorded for measurement — no action was parked',
}

const confidencePercent = (basisPoints: number) => `${Math.round(basisPoints / 100)}%`

// Basis points are the queue's only magnitude; percent is what a human reads.
const deviationLabel = (entry: OpportunityBoardEntry) =>
  entry.deviation_basis_points == null ? null : `${(entry.deviation_basis_points / 100).toFixed(1)}% measured movement`

const entryTitle = opportunityTitle

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
  const [showAll, setShowAll] = createSignal(false)
  const MAX_VISIBLE = 3

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

  return <Card class="p-5 operations-panel">
    <div class="flex items-start justify-between gap-4 mt-6 mb-3">
      <div>
        <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">OPPORTUNITY BOARD</span>
        <h2 class="mt-1 text-lg font-bold text-foreground flex items-center gap-2"><SectionIcon name="target" />Found for you — decide</h2>
        <p class="mt-1 text-sm text-muted-foreground leading-relaxed max-w-prose">Everything the agent found and parked: gigs with computed economics, pitches, waves and deadlines. “Do it” approves the parked action through CrowdRelay’s existing approval path; “done ourselves” records that a human handled it outside the system, which is a success — not a dismissal.</p>
      </div>
      <StatusBadge status={board.data ? `${board.data.length} queued` : 'loading'} tone={board.error ? 'bad' : 'muted'} />
    </div>

    <Show when={board.error}>
      <div class="warning-card operations-warning" role="status">
        {errorMessage(board.error, 'Opportunity queue is temporarily unavailable.')}
      </div>
    </Show>

    <Show when={mutationError()}>
      {message => <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive operations-error" role="alert">{message()}</div>}
    </Show>

    <Show when={board.data} fallback={!board.error ? <SkeletonOpportunityBoard /> : null}>{data => <>
      <Show when={data().length === 0}>
        <Card class="p-4 mt-2.5"><p class="m-0 text-sm text-muted-foreground">The agent has nothing parked right now. Findings appear here the moment a detector raises them.</p></Card>
      </Show>
      <Show when={data().length > 0}>
        <details class="mb-4">
          <summary class="cursor-pointer text-sm text-muted-foreground py-2 border-b border-border hover:text-secondary-foreground">How to decide</summary>
          <div class="mt-2.5 p-3.5 border border-border rounded-md bg-surface-1">
            <p class="m-0 text-sm text-muted-foreground leading-relaxed"><strong class="text-foreground">Do it</strong> — the agent found something with an executable step. Clicking approves it through CrowdRelay's normal action path. <strong class="text-foreground">Done ourselves</strong> — you handled it outside the system (sent the message manually, made the call, etc.). This records a success and stops the agent from re-raising it. If you're unsure, leave it — the approval will expire on its own and the agent will re-evaluate next cycle.</p>
          </div>
        </details>
      </Show>
      <Show when={data().length > 0}>
        <div class="grid gap-2.5">
          <For each={showAll() ? data() : data().slice(0, MAX_VISIBLE)}>{entry => (
            <div class="flex justify-between items-start gap-4 p-3.5 border border-border rounded-md bg-card hover:border-primary/40 hover:bg-surface-3 transition-colors">
              <div class="min-w-0 flex-1 flex flex-col gap-1.5">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="inline-flex items-center justify-center min-w-[26px] h-[22px] px-1.5 rounded-sm bg-surface-4 text-primary-foreground font-bold text-xs flex-shrink-0">#{entry.position}</span>
                  <strong class="text-sm leading-snug text-foreground">{entryTitle(entry)}</strong>
                </div>
                <p class="m-0 text-sm text-secondary-foreground leading-relaxed">{entry.reason}</p>
                <div class="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={authorityLabel(entry)} tone={authorityTone(entry)} />
                  <Badge variant="muted">confidence {confidencePercent(entry.confidence)}</Badge>
                  <Show when={formatDue(entry.due_at)}>
                    {due => <Badge variant="warning">deadline {due()}</Badge>}
                  </Show>
                  <Show when={entry.decision_kind?.startsWith('agent.')}>
                    <Badge variant="outline">LLM</Badge>
                  </Show>
                </div>
                {/* Secondary facts — collapsed */}
                <details class="mt-1">
                  <summary class="cursor-pointer text-xs text-muted-foreground font-medium py-0.5 list-none">More</summary>
                  <div class="flex items-center gap-2 flex-wrap mt-1">
                    <Badge variant="outline">{labelOr(CONTEXT_LABELS, entry.context)}</Badge>
                    <Badge variant="outline">{labelOr(SUBJECT_KIND_LABELS, entry.subject_kind)}</Badge>
                    <Badge variant="outline">{RANK_FACTOR_LABELS[entry.ranked_by] ?? entry.ranked_by}</Badge>
                    <Show when={entry.value_tier}>
                      {tier => <Badge variant="outline">{VALUE_TIER_LABELS[tier()] ?? tier()} value</Badge>}
                    </Show>
                    <Show when={deviationLabel(entry)}>
                      {label => <Badge variant="outline">{label()}</Badge>}
                    </Show>
                  </div>
                </details>
                <Show when={formatDue(entry.due_at)}>
                  {due => <small class="text-sm text-warning">deadline {due()}</small>}
                </Show>
                <small class="text-xs text-warning-light">if ignored: {entry.consequence}</small>
                <Show when={entry.briefing}>
                  {briefing => (
                    <details class="mt-1.5 border-t border-border-subtle pt-2">
                      <summary class="cursor-pointer text-sm text-muted-foreground font-medium list-none">Details</summary>
                      <p class="m-0 mb-2 text-sm text-secondary-foreground leading-relaxed mt-1">{briefing().why_it_matters}</p>
                      <Show when={briefing().steps.length > 0}>
                        <ol class="m-0 mb-2 pl-4.5 text-sm text-secondary-foreground leading-relaxed list-decimal">
                          <For each={briefing().steps}>{step => (
                            <li class="mb-1"><strong class="text-foreground">{step.what_to_do}</strong> — {step.why_it_matters}</li>
                          )}</For>
                        </ol>
                      </Show>
                      <Show when={briefing().content.length > 0}>
                        <dl class="m-0 flex flex-col gap-0">
                          <For each={briefing().content}>{field => (
                            <div class="flex gap-3 items-baseline py-1 border-b border-border-subtle">
                              <dt class="text-xs text-muted-foreground capitalize">{field.label}</dt>
                              <dd class="flex-1 min-w-0 m-0 text-sm text-secondary-foreground break-words">{field.value}</dd>
                            </div>
                          )}</For>
                        </dl>
                      </Show>
                    </details>
                  )}
                </Show>
              </div>
              <div class="flex flex-row items-center gap-2 flex-shrink-0 flex-wrap">
                <Show
                  when={isApprovable(entry)}
                  fallback={
                    <span class="max-w-[170px] text-right text-muted-foreground text-sm leading-snug">
                      {NOT_APPROVABLE_NOTE[entry.authority] ?? 'no executable step — handle it yourself'}
                    </span>
                  }
                >
                  <Button
                    type="button"
                    size="sm"
                    classList={{ 'confirm-danger': confirming() === `do:${entry.decision_id}` }}
                    disabled={pendingMutation() !== null}
                    onClick={() => doIt(entry)}
                  >
                    {pendingMutation() === `do:${entry.decision_id}` && <Spinner />} {pendingMutation() === `do:${entry.decision_id}` ? 'Approving…' : confirming() === `do:${entry.decision_id}` ? 'Confirm approval' : 'Do it'}
                  </Button>
                </Show>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pendingMutation() !== null}
                  onClick={() => doneOurselves(entry)}
                >
                  {pendingMutation() === `done:${entry.decision_id}` && <Spinner />} {pendingMutation() === `done:${entry.decision_id}` ? 'Recording…' : confirming() === `done:${entry.decision_id}` ? 'Confirm done' : 'Done ourselves'}
                </Button>
              </div>
            </div>
          )}</For>
        </div>
        <Show when={data().length > MAX_VISIBLE}>
          <Button variant="ghost" class="mt-3 w-full" onClick={() => setShowAll(s => !s)}>
            {showAll() ? 'Show fewer' : `Show all ${data().length}`}
          </Button>
        </Show>
      </Show>
    </>}</Show>
  </Card>
}
