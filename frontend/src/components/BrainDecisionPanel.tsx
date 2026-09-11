import { Show, createSignal, For, createMemo } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import type { OpportunityBoardEntry, DecisionEvidence } from '../lib/types'
import { api } from '../lib/api'
import { toast } from './ui/toast'
import { StatusBadge } from './StatusBadge'
import { EmptyState } from './ui/empty-state'
import { errorMessage } from '../lib/format'
import { SkeletonRows } from './Skeleton'
import { CONTEXT_LABELS, SUBJECT_KIND_LABELS, labelOr, opportunityTitle } from '../lib/opportunity-labels'
import { SectionIcon } from './SectionIcon'
import { Spinner } from './Spinner'
import { Card } from './ui/card'
import { Alert } from './ui/alert'
import { Button } from './ui/button'

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

const confidencePercent = (basisPoints: number) => {
  const percent = basisPoints / 100
  if (percent > 0 && percent < 1) return '< 1%'
  return `${Math.round(percent)}%`
}

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
  authority: 'it is waiting on you',
  deadline: 'its deadline is closest',
  value_tier: 'it moves a real number, not a vanity one',
  measured_effect: 'this kind of action has worked before',
  confidence: 'the brain is most sure about it',
  magnitude: 'it is furthest off target',
  tie: 'nothing separated it from the rest',
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
    <div class="block m-0 p-3 bg-surface-1 border border-border-subtle rounded-sm font-mono text-xs leading-relaxed text-secondary-foreground max-h-[400px] overflow-auto text-left">
      <For each={lines()}>{line => {
        const match = /^\s*/.exec(line)
        const indent = match ? match[0].length : 0
        const content = line.slice(indent)
        const style = { 'padding-left': `${indent}ch` }
        return <span class="block whitespace-pre-wrap break-normal" style={style}>{content}</span>
      }}</For>
    </div>
  )
}

function renderEvidenceDetail(data: DecisionEvidence) {
  const inputRows = renderEvidence(data.input_snapshot)
  const policyRows = renderEvidence(data.policy_snapshot)
  return (
    <div class="flex flex-col gap-4 mt-3 p-4 border border-border-subtle rounded-lg bg-surface-3">
      <div class="flex flex-col gap-2">
        <Show when={inputRows.length > 0} fallback={
          <p class="text-sm text-muted-foreground">No signal data recorded for this decision.</p>
        }>
          <dl class="m-0 flex flex-col gap-1">
            <For each={inputRows}>{row => (
              <div classList={{ 'flex gap-3 items-baseline py-1 border-b border-border-subtle': true, 'flex-col gap-1 items-stretch min-w-0': row.isJson }}>
                <dt class="text-xs text-muted-foreground capitalize" classList={{ 'flex-none': !row.isJson }}>{row.key}</dt>
                <dd class="flex-1 min-w-0 m-0 text-sm text-secondary-foreground break-words" classList={{ 'w-full': row.isJson }}>
                  <Show when={row.isJson} fallback={row.value}>
                    <JsonBlock source={row.value} />
                  </Show>
                </dd>
              </div>
            )}</For>
          </dl>
        </Show>
      </div>
      <div class="flex flex-col gap-2">
        <Show when={policyRows.length > 0} fallback={
          <p class="text-sm text-muted-foreground">No policy data recorded for this decision.</p>
        }>
          <dl class="m-0 flex flex-col gap-1">
            <For each={policyRows}>{row => (
              <div classList={{ 'flex gap-3 items-baseline py-1 border-b border-border-subtle': true, 'flex-col gap-1 items-stretch min-w-0': row.isJson }}>
                <dt class="text-xs text-muted-foreground capitalize" classList={{ 'flex-none': !row.isJson }}>{row.key}</dt>
                <dd class="flex-1 min-w-0 m-0 text-sm text-secondary-foreground break-words" classList={{ 'w-full': row.isJson }}>
                  <Show when={row.isJson} fallback={row.value}>
                    <JsonBlock source={row.value} />
                  </Show>
                </dd>
              </div>
            )}</For>
          </dl>
        </Show>
      </div>
      <div class="flex flex-col gap-2">
        <p class="m-0 text-sm text-secondary-foreground">{dispositionLabel(data.disposition)} · evaluated {new Date(data.evaluated_at).toLocaleString()}</p>
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

  const evidence = useQuery(() => ({
    queryKey: ['decision-evidence', props.slug, props.opportunity?.decision_id, showEvidence()],
    queryFn: async () => {
      if (!showEvidence() || !props.opportunity?.decision_id) return null
      return api.decisionEvidence(props.slug, props.opportunity.decision_id)
    },
    enabled: showEvidence() && props.opportunity?.decision_id != null,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

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

  return <Card flat class="p-5">
    <div class="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 class="mt-1 text-lg font-bold text-foreground flex items-center gap-2"><SectionIcon name="brain" />What the system decided</h2>
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
      <Alert tone="warning" role="status">
        The decision channel is temporarily unavailable. The brain's latest
        decision will appear here once the channel recovers.
      </Alert>
    </Show>

    <Show when={!hasDecision() && !props.degraded}>
      <EmptyState
        label="No active decisions"
        hint="CrowdRelay is evaluating signals. Nothing currently meets the execution threshold."
        signal={props.lastDecisionAt ? `Last evaluation ${timeAgoBrief(props.lastDecisionAt)}` : undefined}
      />
    </Show>

    <Show when={entry()} keyed>{(e) => (
        <div class="flex flex-col gap-4">
        {/* WHAT — the decision itself */}
        <div class="flex flex-col gap-1">
          <strong class="text-lg font-bold leading-snug text-foreground">{opportunityTitle(e)}</strong>
          <small class="text-sm text-muted-foreground">
            {labelOr(CONTEXT_LABELS, e.context)} · {labelOr(SUBJECT_KIND_LABELS, e.subject_kind)}
          </small>
        </div>

        {/* WHY — reason + key factors */}
        <div class="flex flex-col gap-2">
          <p class="m-0 text-sm leading-relaxed text-secondary-foreground">{e.reason}</p>
          <div class="flex flex-wrap gap-3 mt-1">
            <div class="flex flex-col gap-0.5 px-3 py-2 border border-border-subtle rounded-lg bg-surface-3 min-w-[80px]">
              <span class="text-xs text-muted-foreground uppercase tracking-wider">Confidence</span>
              <strong class="text-sm font-bold text-foreground">{confidencePercent(e.confidence)}</strong>
            </div>
            <Show when={e.value_tier}>
              <div class="flex flex-col gap-0.5 px-3 py-2 border border-border-subtle rounded-lg bg-surface-3 min-w-[80px]">
                <span class="text-xs text-muted-foreground uppercase tracking-wider">Value</span>
                <strong class="text-sm font-bold text-foreground">{VALUE_TIER_LABELS[e.value_tier!] ?? e.value_tier}</strong>
              </div>
            </Show>
            <div class="flex flex-col gap-0.5 px-3 py-2 border border-border-subtle rounded-lg bg-surface-3 min-w-[80px]">
              {/* "Ranked by: stable tie-break" describes the sort function.
                  The operator's question is why this one is at the top. */}
              <span class="text-xs text-muted-foreground uppercase tracking-wider">Top of the list because</span>
              <strong class="text-sm font-medium text-foreground leading-snug">{RANK_FACTOR_LABELS[e.ranked_by] ?? e.ranked_by}</strong>
            </div>
            <Show when={e.deviation_basis_points != null}>
              <div class="flex flex-col gap-0.5 px-3 py-2 border border-border-subtle rounded-lg bg-surface-3 min-w-[80px]">
                <span class="text-xs text-muted-foreground uppercase tracking-wider">Deviation</span>
                <strong class="text-sm font-bold text-foreground">{(e.deviation_basis_points! / 100).toFixed(1)}%</strong>
              </div>
            </Show>
          </div>
        </div>

        {/* WHAT IT WILL/DID DO — action state */}
        <div class="flex flex-col gap-2 pt-3 border-t border-border-subtle">
          {/* The fallback ignored `authority`, so a decision the brain had
              already run itself rendered "No executable step — handle it
              yourself" under an "auto executing" badge, above "if ignored: the
              action proceeds without you". Three answers to one question, all
              different. Authority decides the sentence; "if ignored" is only
              meaningful while the decision is still waiting on somebody. */}
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <Show when={e.action_id} fallback={
              <span class="text-sm text-muted-foreground">
                {e.authority === 'auto_executing'
                  ? 'The autopilot handled this — nothing for you to do'
                  : 'Nothing here can run this — handle it yourself'}
              </span>
            }>
              <span class="font-semibold text-secondary-foreground">
                {e.authority === 'awaiting_approval'
                  ? 'Awaiting your approval'
                  : e.authority === 'auto_executing'
                    ? 'Executing automatically'
                    : 'Ready to execute'}
              </span>
            </Show>
            <Show when={e.due_at && e.authority !== 'auto_executing'}>
              <span class="text-sm font-semibold text-warning">deadline {new Date(e.due_at!).toLocaleDateString()}</span>
            </Show>
          </div>
          <Show when={e.consequence && e.authority !== 'auto_executing'}>
            <small class="text-xs text-muted-foreground leading-relaxed">If nobody acts: {e.consequence}</small>
          </Show>

          {/* Approve / Reject / Inspect */}
          <div class="flex items-center gap-2 mt-1 flex-wrap">
            <Show when={e.authority === 'awaiting_approval' && e.action_id && !actedOn().has(e.decision_id)}>
              <Button
                type="button"
                size="sm"
                disabled={pendingMutation() !== null}
                onClick={() => approve(e)}
              >
                {pendingMutation() === `approve:${e.decision_id}` && <Spinner />} {pendingMutation() === `approve:${e.decision_id}` ? 'Approving…' : confirming() === `approve:${e.decision_id}` ? 'Confirm approval' : 'Approve'}
              </Button>
              <Button
                type="button"
                variant="destructive-ghost"
                size="sm"
                classList={{ 'confirm-danger': confirming() === `reject:${e.decision_id}` }}
                disabled={pendingMutation() !== null}
                onClick={() => reject(e)}
              >
                {pendingMutation() === `reject:${e.decision_id}` && <Spinner />} {pendingMutation() === `reject:${e.decision_id}` ? 'Rejecting…' : confirming() === `reject:${e.decision_id}` ? 'Confirm reject' : 'Reject'}
              </Button>
            </Show>
            <Button variant="ghost" size="sm" class="ml-auto" onClick={() => toggleEvidence()}>
              {showEvidence() ? 'Hide evidence' : 'Why this decision?'}
            </Button>
          </div>
        </div>

        <Show when={showEvidence()}>
          <>
            <Show when={evidence.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">Brain decision evidence unavailable: {errorMessage(evidence.error, 'We couldn\'t reach the brain decision evidence. Try refreshing.')}</div></Show>
            <Show when={evidence.isFetching}>
              <SkeletonRows count={3} />
            </Show>
            <Show when={!evidence.isFetching && evidence.data === null}>
              <Alert tone="warning" role="status">
                Evidence not available for this decision. The decision row may
                predate the evidence endpoint, or the channel is temporarily unavailable.
              </Alert>
            </Show>
            <Show when={evidence.data} keyed>{(data) => renderEvidenceDetail(data as DecisionEvidence)}</Show>
          </>
        </Show>

        </div>
    )}</Show>
  </Card>
}
