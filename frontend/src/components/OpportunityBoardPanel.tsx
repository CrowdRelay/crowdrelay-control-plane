import { For, Show, createSignal } from 'solid-js'
import type { OpportunityBoardEntry } from '../lib/types'
import { api } from '../lib/api'
import { StatusBadge } from './StatusBadge'
import { errorMessage } from '../lib/format'
import { SkeletonOpportunityBoard } from './Skeleton'

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

// Human-readable labels for the machine enums the backend sends. The fallback
// humanizes snake_case so an unknown value is still readable, not raw enum.
const CONTEXT_LABELS: Record<string, string> = {
  ticket_yield: 'Ticket Yield',
  fan_lifecycle: 'Fan Lifecycle',
  campaign_lifecycle: 'Campaign Lifecycle',
  merchandising: 'Merchandising',
  merch_pricing: 'Merch Pricing',
  merch_bundle: 'Merch Bundle',
  booking_opportunity: 'Booking',
  outreach: 'Outreach',
  content_supply: 'Content Supply',
  promotion_budget: 'Promotion Budget',
  experimentation: 'Experimentation',
  show_operations: 'Show Operations',
  release: 'Release',
  live_opportunity: 'Live Opportunity',
  funding: 'Funding',
  beacon: 'Beacon',
  show_growth: 'Show Growth',
  growth_metrics: 'Growth Metrics',
  growth_debt: 'Growth Debt',
  outreach_supply: 'Outreach Supply',
  growth_intelligence: 'Growth Intelligence',
  plays: 'Plays',
}

const DECISION_KIND_LABELS: Record<string, string> = {
  'ticket.price.change': 'Change Ticket Price',
  'ticket.capacity.change': 'Change Ticket Capacity',
  'fan.lifecycle.message.request': 'Send Fan Message',
  'merch.reorder.request': 'Reorder Merch',
  'merch.price.change': 'Change Merch Price',
  'booking.outreach.request': 'Booking Outreach',
  'audience.campaign.request': 'Audience Campaign',
  'merch.bundle.request': 'Create Merch Bundle',
  'outreach.request': 'Outreach Request',
  'beacon.discovery.request': 'Discover Beacons',
  'booking.target_discovery.request': 'Discover Booking Targets',
  'beacon.invite_batch.request': 'Request Beacon Invites',
  'outreach.discovery.request': 'Discover Outreach Targets',
  'beacon.outreach.request': 'Beacon Outreach',
  'show.growth.request': 'Show Growth Action',
  'content.artifact.request': 'Content Artifact',
  'experiment.allocation.change': 'Adjust Experiment',
  'experiment.complete': 'Complete Experiment',
  'show.task.complete': 'Complete Show Task',
  'show.task.escalate': 'Escalate Show Task',
  'promotion.budget_change.request': 'Change Promotion Budget',
  'release.milestone.execute': 'Execute Release Milestone',
  'opportunity.live.apply': 'Apply Live Opportunity',
  'playlist.placement.verify': 'Verify Playlist Placement',
  'release.editorial_pitch.escalate': 'Escalate Editorial Pitch',
  'opportunity.terms.counter': 'Counter Live Opportunity Terms',
  'opportunity.terms.accept': 'Accept Live Opportunity Terms',
  'funding.package.prepare': 'Prepare Funding Package',
  'funding.application.submit': 'Submit Funding Application',
  'growth.opportunity.raise': 'Growth Opportunity Detected',
  'growth.debt.raise': 'Growth Debt Raised',
  'referral.code.issue': 'Issue Referral Code',
  'play.step.run': 'Run Play Step',
  'team.assignment.email': 'Team Assignment Email',
  'agent.content.request': 'Agent Content Request',
  'agent.run.request': 'Agent Run',
  'community.engage.request': 'Community Engagement',
  'signal.push.request': 'Signal Push',
}

const SUBJECT_KIND_LABELS: Record<string, string> = {
  ticket_type: 'Ticket Type',
  fan: 'Fan',
  merch_variant: 'Merch Variant',
  merch_product: 'Merch Product',
  city: 'City',
  event: 'Event',
  outreach_opportunity: 'Outreach Opportunity',
  content_source: 'Content Source',
  experiment: 'Experiment',
  promotion_campaign: 'Promotion Campaign',
  release_plan: 'Release Plan',
  team_opportunity: 'Team Opportunity',
  beacon: 'Beacon',
  growth_metric_series: 'Growth Metric',
  booking_target: 'Booking Target',
  outreach_target: 'Outreach Target',
  target_community: 'Community',
  workspace: 'Workspace',
}

const humanize = (value: string) =>
  value.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')

const labelOr = (map: Record<string, string>, value: string) =>
  map[value] ?? humanize(value)

// The primary title: prefer the backend briefing summary (rich, contextual),
// fall back to a human-readable decision kind label, then to the raw
// recommended_action or decision_kind humanized.
const entryTitle = (entry: OpportunityBoardEntry): string => {
  if (entry.briefing?.summary) return entry.briefing.summary
  const labeled = DECISION_KIND_LABELS[entry.decision_kind]
  if (labeled) return labeled
  if (entry.recommended_action) return humanize(entry.recommended_action)
  return humanize(entry.decision_kind)
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

    <Show when={board.data} fallback={!board.error ? <SkeletonOpportunityBoard /> : null}>{data => <>
      <Show when={data().length === 0}>
        <div class="inherit-card"><p>The agent has nothing parked right now. Findings appear here the moment a detector raises them.</p></div>
      </Show>
      <Show when={data().length > 0}>
        <details class="opportunity-guide-collapse">
          <summary>How to decide</summary>
          <div class="opportunity-guide">
            <p><strong>Do it</strong> — the agent found something with an executable step. Clicking approves it through CrowdRelay's normal action path. <strong>Done ourselves</strong> — you handled it outside the system (sent the message manually, made the call, etc.). This records a success and stops the agent from re-raising it. If you're unsure, leave it — the approval will expire on its own and the agent will re-evaluate next cycle.</p>
          </div>
        </details>
      </Show>
      <Show when={data().length > 0}>
        <div class="opportunity-list">
          <For each={showAll() ? data() : data().slice(0, MAX_VISIBLE)}>{entry => (
            <div class="opportunity-row">
              <div class="opportunity-body">
                <div class="opportunity-head">
                  <span class="opportunity-rank">#{entry.position}</span>
                  <strong>{entryTitle(entry)}</strong>
                </div>
                <p class="opportunity-reason">{entry.reason}</p>
                <div class="row-health opportunity-facts">
                  <span class="badge">{labelOr(CONTEXT_LABELS, entry.context)}</span>
                  <span class="badge">{labelOr(SUBJECT_KIND_LABELS, entry.subject_kind)}</span>
                  <StatusBadge status={authorityLabel(entry)} tone={authorityTone(entry)} />
                  <Show when={entry.decision_kind?.startsWith('agent.')}>
                    <span class="badge llm-badge">LLM</span>
                  </Show>
                  <span class="badge">{RANK_FACTOR_LABELS[entry.ranked_by] ?? entry.ranked_by}</span>
                  <span class="badge">confidence {confidencePercent(entry.confidence)}</span>
                  <Show when={entry.value_tier}>
                    {tier => <span class="badge">{VALUE_TIER_LABELS[tier()] ?? tier()} value</span>}
                  </Show>
                  <Show when={deviationLabel(entry)}>
                    {label => <span class="badge">{label()}</span>}
                  </Show>
                </div>
                <Show when={formatDue(entry.due_at)}>
                  {due => <small class="opportunity-deadline">deadline {due()}</small>}
                </Show>
                <small class="opportunity-consequence">if ignored: {entry.consequence}</small>
                <Show when={entry.briefing}>
                  {briefing => (
                    <details class="opportunity-briefing">
                      <summary>Details</summary>
                      <p class="opportunity-briefing-why">{briefing().why_it_matters}</p>
                      <Show when={briefing().steps.length > 0}>
                        <ol class="opportunity-briefing-steps">
                          <For each={briefing().steps}>{step => (
                            <li><strong>{step.what_to_do}</strong> — {step.why_it_matters}</li>
                          )}</For>
                        </ol>
                      </Show>
                      <Show when={briefing().content.length > 0}>
                        <dl class="opportunity-briefing-content">
                          <For each={briefing().content}>{field => (
                            <div class="brain-evidence-row">
                              <dt>{field.label}</dt>
                              <dd>{field.value}</dd>
                            </div>
                          )}</For>
                        </dl>
                      </Show>
                    </details>
                  )}
                </Show>
              </div>
              <div class="opportunity-actions">
                <Show
                  when={isApprovable(entry)}
                  fallback={
                    <span class="opportunity-no-action">
                      {NOT_APPROVABLE_NOTE[entry.authority] ?? 'no executable step — handle it yourself'}
                    </span>
                  }
                >
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
        <Show when={data().length > MAX_VISIBLE}>
          <button class="ghost opportunity-show-all" onClick={() => setShowAll(s => !s)}>
            {showAll() ? 'Show fewer' : `Show all ${data().length}`}
          </button>
        </Show>
      </Show>
    </>}</Show>
  </article>
}
