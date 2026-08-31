import { Show, createSignal, For, createResource } from 'solid-js'
import type { OpportunityBoardEntry, DecisionEvidence } from '../lib/types'
import { api } from '../lib/api'
import { StatusBadge } from './StatusBadge'
import { EmptyState } from './EmptyState'

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
const renderEvidence = (snapshot: Record<string, unknown>): Array<{ key: string; value: string }> => {
  const rows: Array<{ key: string; value: string }> = []
  for (const [key, value] of Object.entries(snapshot)) {
    if (value == null) continue
    const display = typeof value === 'object'
      ? JSON.stringify(value).slice(0, 200)
      : String(value)
    if (display.trim().length === 0) continue
    rows.push({ key: key.replaceAll('_', ' '), value: display })
  }
  return rows.slice(0, 8) // cap to avoid wall of JSON
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
              <div class="brain-evidence-row">
                <dt>{row.key}</dt>
                <dd>{row.value}</dd>
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
              <div class="brain-evidence-row">
                <dt>{row.key}</dt>
                <dd>{row.value}</dd>
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

  return <article class="panel brain-decision-panel">
    <div class="brain-decision-head">
      <div>
        <span class="eyebrow">BRAIN DECISION</span>
        <h2>What the system decided</h2>
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
          <strong class="brain-decision-action">{e.recommended_action}</strong>
          <small class="brain-decision-context">
            {e.context.replaceAll('_', ' ')} · {e.decision_kind.replaceAll('_', ' ')} · {e.subject_kind}
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
        </div>

        {/* Inspect — expandable full evidence */}
        <button class="ghost brain-decision-inspect" onClick={() => toggleEvidence()}>
          {showEvidence() ? 'Hide evidence' : 'Why this decision?'}
        </button>

        <Show when={showEvidence()}>
          <>
            <Show when={evidence.loading}>
              <div class="mini-skeleton" />
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
