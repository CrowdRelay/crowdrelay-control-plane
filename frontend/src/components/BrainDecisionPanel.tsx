import { Show, createSignal, For, createResource, createMemo } from 'solid-js'
import type { OpportunityBoardEntry, DecisionEvidence } from '../lib/types'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { StatusBadge } from './StatusBadge'
import { EmptyState } from './EmptyState'
import { errorMessage } from '../lib/format'
import { SkeletonRows } from './Skeleton'
import { CONTEXT_LABELS, SUBJECT_KIND_LABELS, labelOr, opportunityTitle } from '../lib/opportunity-labels'
import { SectionIcon } from './SectionIcon'
import { Spinner } from './Spinner'

// The flagship decision surface. Shows the single most important current
// decision (opportunity board position #1) in a structured narrative:
//
//   WHAT THE BRAIN DECIDED
//   → WHY (reason + evidence signals)
//   → WHAT IT WILL/DID DO (action state)
//   → RESULT (outcome where measured)
//
// The "Inspect" affordance fetches the full decision evidence (input_snapshot,
// policy_snapshot, recommendation) from the backend. The ranking is
// lexicographic, NOT weighted — we never invent numeric score contributions.
// The input_snapshot is rendered as key/value evidence, not as invented
// model explanations.

const confidencePercent = (basisPoints: number) => `${Math.round(basisPoints / 100)}%`

const dispositionLabel = (disposition: string) =>
  disposition.replaceAll('_', ' ')

const dispositionTone = (authority: string): 'good' | 'warn' | 'bad' | 'muted' => {
  if (authority === 'auto_executing') return 'good'
  if (authority === 'awaiting_approval') return 'warn'
  if (authority === 'recommended') return 'good'
  return 'muted'
}

const VALUE_TIER_LABELS: Record<string, string> = {
  vanity: 'vanity',
  intermediate: 'intermediate',
  downstream: 'downstream',
}

const RANK_FACTOR_LABELS: Record<string, string> = {
  authority: 'authority state',
  deadline: 'deadline proximity',
  value_tier: 'value tier',
  measured_effect: 'measured effect',
  confidence: 'confidence',
  magnitude: 'deviation magnitude',
  objective: 'objective target',
  tie: 'stable tie-break',
}

// Render input_snapshot as key/value evidence. The snapshot is raw JSON from
// the decision row — we display its top-level keys as evidence rows, never
// inventing numeric contributions or causal explanations.
const renderEvidence = (snapshot: Record<string, unknown>): Array<{ key: string; value: string; isJson: boolean }> => {
  const rows: Array<{ key: string; value: string; isJson: boolean }> = []
  for (const [key, value] of Object.entries(snapshot)) {
    if (value == null) continue
    const isJson = typeof value === 'object'
    // Two spaces and a compact width. JsonBlock splits the formatted string
    // into per-line wrappers so long wrapped values keep their visual indent.
    const display = isJson
      ? JSON.stringify(value, null, 2)
      : String(value)
    if (display.trim().length === 0) continue
    rows.push({ key: key.replaceAll('_', ' '), value: display, isJson })
  }
  return rows.slice(0, 12)
}

const timeAgoBrief = (iso: string): string => {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (Number.isNaN(d.getTime())) return '—'
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

// A JSON block where every line is its own wrapper. The leading spaces of the
// formatted JSON are converted to `padding-left` on the wrapper, so when a long
// string value wraps, the continuation line starts at the same visual indent as
// the first line. `white-space: pre-wrap` keeps internal spaces and wraps words.
function JsonBlock(props: { source: string }) {
  const lines = createMemo(() => props.source.split('\n'))
  return (
    <div class="brain-evidence-json">
      <For each={lines()}>{line => {
        const match = /^\s*/.exec(line)
        const indent = match ? match[0].length : 0
        const content = line.slice(indent)
        const style = { 'padding-left': `${indent}ch` }
        return <span class="json-line" style={style}>{content}</span>
      }}</For>
    </div>
  )
}

function renderEvidenceDetail(data: DecisionEvidence) {
  const inputRows = renderEvidence(data.input_snapshot)
  const policyRows = renderEvidence(data.policy_snapshot)
  return (
    <div class="brain-decision-evidence">
      <div class="brain-evidence-section">
        <span class="eyebrow">SIGNALS</span>
        <Show when={inputRows.length > 0} fallback={
          <p class="muted">No signal data recorded for this decision.</p>
        }>
          <dl class="brain-evidence-list">
            <For each={inputRows}>{row => (
              <div classList={{ 'brain-evidence-row': true, 'brain-evidence-row-json': row.isJson }}>
                <dt>{row.key}</dt>
                <dd>
                  <Show when={row.isJson} fallback={row.value}>
                    <JsonBlock source={row.value} />
                  </Show>
                </dd>
              </div>
            )}</For>
          </dl>
        </Show>
      </div>
      <div class="brain-evidence-section">
        <span class="eyebrow">POLICY</span>
        <Show when={policyRows.length > 0} fallback={
          <p class="muted">No policy data recorded for this decision.</p>
        }>
          <dl class="brain-evidence-list">
            <For each={policyRows}>{row => (
              <div classList={{ 'brain-evidence-row': true, 'brain-evidence-row-json': row.isJson }}>
                <dt>{row.key}</dt>
                <dd>
                  <Show when={row.isJson} fallback={row.value}>
                    <JsonBlock source={row.value} />
                  </Show>
                </dd>
              </div>
            )}</For>
          </dl>
        </Show>
      </div>
      <div class="brain-evidence-section">
        <span class="eyebrow">DISPOSITION</span>
        <p>{dispositionLabel(data.disposition)} · evaluated {new Date(data.evaluated_at).toLocaleString()}</p>
      </div>
    </div>
  )
}


export function BrainDecisionPanel(props: {
  slug: string
  opportunity: OpportunityBoardEntry | null | undefined
  degraded: boolean
  lastDecisionAt: string | null
  refresh: () => Promise<unknown>
}) {
  const [showEvidence, setShowEvidence] = createSignal(false)
  const [pendingMutation, setPendingMutation] = createSignal<string | null>(null)
  const [confirming, setConfirming] = createSignal<string | null>(null)
  // Track decisions we've already acted on locally. After a successful
  // approve/reject, the backend may still report awaiting_approval on
  // refresh (processing lag). This prevents the buttons from reappearing
  // and forcing the user to click through confirmation a second time.
  const [actedOn, setActedOn] = createSignal<Set<string>>(new Set())

  const [evidence] = createResource(showEvidence, async (show) => {
    if (!show || !props.opportunity?.decision_id) return null
    try {
      return await api.decisionEvidence(props.slug, props.opportunity.decision_id)
    } catch {
      return null
    }
  })

  const entry = () => props.opportunity
  const hasDecision = () => entry() != null

  const toggleEvidence = () => setShowEvidence(s => !s)

  // Two-click confirmation: destructive intent needs a second click on the
  // same control before anything is sent. Toasts give success/error feedback
  // without layout shift — matches TenantAttentionPage's mutation pattern.
  const decide = async (key: string, operation: () => Promise<unknown>, successMsg: string) => {
    if (pendingMutation() !== null) return
    if (confirming() !== key) {
      setConfirming(key)
      return
    }
    setConfirming(null)
    setPendingMutation(key)
    try {
      await operation()
      // Mark this decision as acted on so the buttons don't reappear
      // when refresh brings back the same awaiting_approval state.
      const decisionId = key.split(':')[1] ?? ''
      setActedOn(prev => new Set(prev).add(decisionId))
      await props.refresh()
      toast.success(successMsg)
    } catch (error) {
      toast.error(errorMessage(error, 'Decision failed'))
    } finally {
      setPendingMutation(null)
    }
  }

  const approve = (e: OpportunityBoardEntry) => {
    if (!e.action_id) return
    void decide(`approve:${e.decision_id}`, () => api.approveOpportunityAction(props.slug, e.action_id!), 'Decision approved — action is now executing')
  }

  const reject = (e: OpportunityBoardEntry) => {
    if (!e.action_id) return
    void decide(`reject:${e.decision_id}`, () => api.cancelOpportunityAction(props.slug, e.action_id!), 'Decision rejected — action cancelled')
  }

  return <article class="panel brain-decision-panel">
    <div class="brain-decision-head">
      <div>
        <span class="eyebrow">BRAIN DECISION</span>
        <h2><SectionIcon name="brain" />What the system decided</h2>
      </div>
      <Show when={hasDecision()} fallback={
        <StatusBadge status="idle" tone="muted" />
      }>
        <StatusBadge
          status={dispositionLabel(entry()!.authority)}
          tone={dispositionTone(entry()!.authority)}
        />
      </Show>
    </div>

    <Show when={props.degraded && !hasDecision()}>
      <div class="warning-card" role="status">
        The decision channel is temporarily unavailable. The brain's latest
        decision will appear here once the channel recovers.
      </div>
    </Show>

    <Show when={!hasDecision() && !props.degraded}>
      <EmptyState
        label="No active decisions"
        hint="CrowdRelay is evaluating signals. Nothing currently meets the execution threshold."
        signal={props.lastDecisionAt ? `Last evaluation ${timeAgoBrief(props.lastDecisionAt)}` : undefined}
      />
    </Show>

    <Show when={entry()} keyed>{(e) => (
        <div class="brain-decision-body">
        {/* WHAT — the decision itself */}
        <div class="brain-decision-what">
          <strong class="brain-decision-action">{opportunityTitle(e)}</strong>
          <small class="brain-decision-context">
            {labelOr(CONTEXT_LABELS, e.context)} · {labelOr(SUBJECT_KIND_LABELS, e.subject_kind)}
          </small>
        </div>

        {/* WHY — reason + key factors */}
        <div class="brain-decision-why">
          <span class="eyebrow">WHY</span>
          <p class="brain-decision-reason">{e.reason}</p>
          <div class="brain-decision-factors">
            <div class="brain-decision-factor">
              <span>Confidence</span>
              <strong>{confidencePercent(e.confidence)}</strong>
            </div>
            <Show when={e.value_tier}>
              <div class="brain-decision-factor">
                <span>Value</span>
                <strong>{VALUE_TIER_LABELS[e.value_tier!] ?? e.value_tier}</strong>
              </div>
            </Show>
            <div class="brain-decision-factor">
              <span>Ranked by</span>
              <strong>{RANK_FACTOR_LABELS[e.ranked_by] ?? e.ranked_by}</strong>
            </div>
            <Show when={e.deviation_basis_points != null}>
              <div class="brain-decision-factor">
                <span>Deviation</span>
                <strong>{(e.deviation_basis_points! / 100).toFixed(1)}%</strong>
              </div>
            </Show>
          </div>
        </div>

        {/* WHAT IT WILL/DID DO — action state */}
        <div class="brain-decision-action-state">
          <span class="eyebrow">ACTION</span>
          <div class="brain-decision-action-row">
            <Show when={e.action_id} fallback={
              <span class="brain-decision-no-action">No executable step — handle it yourself</span>
            }>
              <span class="brain-decision-action-status">
                {e.authority === 'awaiting_approval'
                  ? 'Awaiting your approval'
                  : e.authority === 'auto_executing'
                    ? 'Executing automatically'
                    : 'Ready to execute'}
              </span>
            </Show>
            <Show when={e.due_at}>
              <span class="brain-decision-deadline">deadline {new Date(e.due_at!).toLocaleDateString()}</span>
            </Show>
          </div>
          <Show when={e.consequence}>
            <small class="brain-decision-consequence">if ignored: {e.consequence}</small>
          </Show>

          {/* Approve / Reject / Inspect — all in one row. Approve on the
              left, Reject on the right, "Why this decision?" between them
              so the operator sees the evidence link alongside the actions. */}
          <div class="brain-decision-actions-row">
            <Show when={e.authority === 'awaiting_approval' && e.action_id && !actedOn().has(e.decision_id)}>
              <button
                type="button"
                disabled={pendingMutation() !== null}
                onClick={() => approve(e)}
              >
                {pendingMutation() === `approve:${e.decision_id}` && <Spinner />} {pendingMutation() === `approve:${e.decision_id}` ? 'Approving…' : confirming() === `approve:${e.decision_id}` ? 'Confirm approval' : 'Approve'}
              </button>
              <button
                type="button"
                classList={{ 'confirm-danger': confirming() === `reject:${e.decision_id}` }}
                disabled={pendingMutation() !== null}
                onClick={() => reject(e)}
              >
                {pendingMutation() === `reject:${e.decision_id}` && <Spinner />} {pendingMutation() === `reject:${e.decision_id}` ? 'Rejecting…' : confirming() === `reject:${e.decision_id}` ? 'Confirm reject' : 'Reject'}
              </button>
            </Show>
            <button class="brain-decision-inspect" onClick={() => toggleEvidence()}>
              {showEvidence() ? 'Hide evidence' : 'Why this decision?'}
            </button>
          </div>
        </div>

        <Show when={showEvidence()}>
          <>
            <Show when={evidence.loading}>
              <SkeletonRows count={3} />
            </Show>
            <Show when={!evidence.loading && evidence() === null}>
              <div class="warning-card" role="status">
                Evidence not available for this decision. The decision row may
                predate the evidence endpoint, or the channel is temporarily unavailable.
              </div>
            </Show>
            <Show when={evidence()} keyed>{(data) => renderEvidenceDetail(data as DecisionEvidence)}</Show>
          </>
        </Show>

        </div>
    )}</Show>
  </article>
}
