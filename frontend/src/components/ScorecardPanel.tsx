import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { formatTimestamp } from '../lib/format'
import type { AgentScorecard } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { CountUp } from './CountUp'
import { ProgressRing } from './ProgressRing'
import { SkeletonScorecard } from './Skeleton'
import { SectionIcon } from './SectionIcon'
import { CONTEXT_LABELS, DECISION_KIND_LABELS, SUBJECT_KIND_LABELS, labelOr } from '../lib/opportunity-labels'

const count = (value: number | undefined | null) =>
  value == null ? '—' : value.toLocaleString()

const bpsToPercent = (value: number | null | undefined) =>
  value == null ? '—' : `${(value / 100).toFixed(1)}%`

const timeAgo = (value: string | null | undefined) => {
  if (!value) return 'never'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  const seconds = Math.floor((Date.now() - parsed.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const postureLabel = (value: string | null | undefined) =>
  value == null ? 'unset' : value.replace(/_/g, ' ')

const statusTone = (data: AgentScorecard | undefined): 'good'|'warn'|'bad'|'muted' => {
  if (!data) return 'muted'
  if (!data.status.agent_enabled) return 'muted'
  if (data.status.parked_capabilities.length > 0) return 'bad'
  if (data.week.failed > 0) return 'warn'
  return 'good'
}

const statusLabel = (data: AgentScorecard | undefined) => {
  if (!data) return 'loading'
  if (!data.status.agent_enabled) return 'off'
  if (data.status.dry_run) return 'dry run'
  if (data.status.parked_capabilities.length > 0) return 'execution gap'
  return data.status.posture ?? 'active'
}

const outcomeTone = (outcome: string | null): 'good'|'warn'|'bad'|'muted' => {
  if (!outcome) return 'muted'
  if (outcome === 'improved') return 'good'
  if (outcome === 'worsened') return 'bad'
  return 'muted'
}

const outcomeLabel = (outcome: string | null) =>
  outcome ?? 'unmeasured'

const deltaLabel = (delta: number | null) => {
  if (delta == null) return null
  const sign = delta > 0 ? '+' : ''
  return `${sign}${(delta / 100).toFixed(1)}%`
}

// The panel used to carry its own seven-entry context map with a raw-key
// fallback, so `growth_intelligence` and `outreach_supply` — two of the three
// contexts this tenant actually runs — rendered as their storage keys. The
// shared vocabulary already covers all 22 and humanises what it does not know.
const contextLabel = (context: string) => labelOr(CONTEXT_LABELS, context)
const actionLabel = (kind: string) => labelOr(DECISION_KIND_LABELS, kind)
const subjectLabel = (kind: string) => labelOr(SUBJECT_KIND_LABELS, kind)

export function ScorecardPanel(props: { slug: string }) {
  const model = useQuery(() => ({
    queryKey: ['agent-scorecard', props.slug],
    queryFn: () => api.agentScorecard(props.slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const data = () => model.data

  return <article class="panel operations-panel">
    <div class="section-title operations-title">
      <div>
        <span class="eyebrow">AGENT SCORECARD</span>
        <h2><SectionIcon name="activity" />Is it working?</h2>
        <p>Autopilot status, weekly activity, and recent completions — results, not logs.</p>
      </div>
      <StatusBadge status={statusLabel(data())} tone={statusTone(data())} />
    </div>

    <Show when={model.error}>
      <div class="warning-card operations-warning" role="status">
        {model.error instanceof Error ? model.error.message : 'Agent scorecard is temporarily unavailable.'}
      </div>
    </Show>

    <Show when={!model.error && model.isPending}><SkeletonScorecard /></Show>

    <Show when={data()}>{d => <>
      {/* Status row */}
      <div class="operations-metrics">
        <div>
          <span>Agent</span>
          <strong>{d().status.agent_enabled ? 'on' : 'off'}</strong>
          <small>{d().status.dry_run ? 'dry run' : postureLabel(d().status.posture)}</small>
        </div>
        <div>
          <span>Last decision</span>
          <strong>{timeAgo(d().status.last_decision_at)}</strong>
          <small>{timeAgo(d().status.last_action_at)} last action</small>
        </div>
        <div>
          <span>Live capabilities</span>
          <strong>{count(d().status.live_capabilities.length)}</strong>
          <small>{d().status.live_capabilities.length > 0 ? d().status.live_capabilities.join(', ') : 'no active capabilities'}</small>
        </div>
        <Show when={d().status.parked_capabilities.length > 0}>
          <div class="operations-attention">
            <strong>Execution gap</strong>
            <span>{d().status.parked_capabilities.length} capability(ies) have parked actions but no executor: {d().status.parked_capabilities.join(', ')}</span>
          </div>
        </Show>
      </div>

      {/* Week summary */}
      <section class="operations-section">
        <div class="operations-section-head">
          <div><span class="eyebrow">THIS WEEK</span><h3><SectionIcon name="zap" />Actions</h3></div>
        </div>
        <div class="operations-metrics">
          <div><span>Executed</span><CountUp value={d().week.executed} /><small>{count(d().week.succeeded)} succeeded · {count(d().week.failed)} failed</small></div>
          <div><span>Success rate</span>
            <Show when={d().week.success_rate_basis_points != null} fallback={<strong>—</strong>}>
              <ProgressRing value={Math.round((d().week.success_rate_basis_points as number) / 100)} size={44} strokeWidth={4} showValue />
            </Show>
            <small>of executed actions</small>
          </div>
          <div><span>Parked</span><CountUp value={d().week.parked} /><small>no executor available</small></div>
          <div><span>Awaiting approval</span><CountUp value={d().week.awaiting_approval} /><small>requires operator review</small></div>
        </div>
      </section>

      {/* Track record */}
      <section class="operations-section">
        <div class="operations-section-head">
          <div><span class="eyebrow">TRACK RECORD</span><h3><SectionIcon name="history" />Did it work?</h3></div>
        </div>
        <div class="operations-metrics">
          <div><span>Improved</span><strong>{count(d().track_record.improved)}</strong><small class="tone-good">measured wins</small></div>
          <div><span>Worsened</span><strong>{count(d().track_record.worsened)}</strong><small class="tone-bad">measured losses</small></div>
          <div><span>Neutral</span><strong>{count(d().track_record.neutral)}</strong><small>no change</small></div>
          <div><span>Unmeasured</span><strong>{count(d().track_record.unmeasured)}</strong><small>{bpsToPercent(d().track_record.measurement_coverage_basis_points)} coverage</small></div>
          <Show when={(d().track_record.awaiting_measurement ?? 0) > 0}>
            <div>
              <span>Awaiting</span>
              <strong>{count(d().track_record.awaiting_measurement ?? 0)}</strong>
              <small>{
                d().track_record.next_measurement_due_at
                  ? `first result ${formatTimestamp(d().track_record.next_measurement_due_at as string)}`
                  : 'horizon not elapsed'
              }</small>
            </div>
          </Show>
        </div>
        {/* Only warn about work that can never be judged. Actions still inside
            a 7, 14 or 30 day horizon are not a coverage failure, and warning
            about them told the operator the system was blind days before its
            first result was due. */}
        <Show when={d().track_record.measurement_coverage_basis_points != null
                    && (d().track_record.measurement_coverage_basis_points as number) < 5000
                    && d().track_record.unmeasured > 0}>
          <details class="ops-details-warning">
            <summary>Low measurement coverage — click for details</summary>
            <div class="operations-attention">
              <strong>Low measurement coverage</strong>
              <span>{d().track_record.unmeasured} executed action(s) have no measurement scheduled, so their effect can never be judged. This excludes anything still inside its measurement horizon.</span>
            </div>
          </details>
        </Show>
        <Show when={(d().track_record.awaiting_measurement ?? 0) > 0
                    && d().track_record.improved + d().track_record.neutral + d().track_record.worsened === 0}>
          <p class="muted">
            No verdicts yet because no measurement horizon has elapsed — not because nothing is being
            measured. {count(d().track_record.awaiting_measurement ?? 0)} action(s) are waiting on a 7, 14 or 30 day window.
          </p>
        </Show>
      </section>

      {/* By context */}
      <Show when={d().by_context.length > 0}>
        <section class="operations-section">
          <div class="operations-section-head">
            <div><span class="eyebrow">BY CONTEXT</span><h3><SectionIcon name="target" />Which parts are producing</h3></div>
          </div>
          <div class="scorecard-grid-3">
            <For each={d().by_context}>{ctx => <div class="scorecard-context-card">
              <strong>{contextLabel(ctx.context)}</strong>
              <small>{count(ctx.executed)} executed · {count(ctx.succeeded)} succeeded · {count(ctx.failed)} failed</small>
              <Show when={ctx.parked > 0}><small class="muted">{count(ctx.parked)} parked</small></Show>
            </div>}</For>
          </div>
        </section>
      </Show>

      {/* Recent results */}
      <section class="operations-section">
        <div class="operations-section-head">
          <div><span class="eyebrow">RECENT RESULTS</span><h3><SectionIcon name="list-checks" />Last 10 completed actions</h3></div>
        </div>
        <Show when={d().recent_results.length > 0} fallback={<div class="inherit-card"><p>The agent has not completed any actions yet.</p></div>}>
          <div class="scorecard-grid-2">
            <For each={d().recent_results}>{result => <div class="scorecard-result-card">
              <div class="scorecard-result-head">
                <strong>{actionLabel(result.action_kind)}</strong>
                <StatusBadge status={outcomeLabel(result.outcome)} tone={outcomeTone(result.outcome)} />
              </div>
              <small>{contextLabel(result.context)} · {subjectLabel(result.subject_kind)}</small>
              <Show when={result.metric_key}><small class="muted">metric: {result.metric_key}</small></Show>
              <small class="muted">{timeAgo(result.completed_at)}<Show when={result.executor_id}>{` · ${result.executor_id}`}</Show></small>
            </div>}</For>
          </div>
        </Show>
      </section>
    </>}</Show>
  </article>
}
