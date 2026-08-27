import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { refreshInterval } from '../lib/refresh'
import type { AgentScorecard } from '../lib/types'
import { StatusBadge } from './StatusBadge'

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

const contextLabel = (context: string) => {
  const labels: Record<string, string> = {
    fan_lifecycle: 'Fan lifecycle',
    ticket_yield: 'Ticket yield',
    merchandising: 'Merchandising',
    merch_pricing: 'Merch pricing',
    booking_opportunity: 'Booking',
    promotion_budget: 'Promotion',
    growth_debt: 'Growth debt',
  }
  return labels[context] ?? context
}

const actionLabel = (kind: string) =>
  kind.replace(/_/g, ' ')

export function ScorecardPanel() {
  const params = useParams({ from: '/tenants/$slug/operations' })
  const model = useQuery(() => ({
    queryKey: ['agent-scorecard', params().slug],
    queryFn: () => api.agentScorecard(params().slug),
    reconcile: 'id',
    refetchInterval: refreshInterval() || false,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const data = () => model.data

  return <article class="panel operations-panel">
    <div class="section-title operations-title">
      <div>
        <span class="eyebrow">AGENT SCORECARD</span>
        <h2>Is it working?</h2>
        <p>One view: is the agent on, what did it do this week, did any of it work, and what were the last things it completed. Results, not logs.</p>
      </div>
      <StatusBadge status={statusLabel(data())} tone={statusTone(data())} />
    </div>

    <Show when={model.error}>
      <div class="warning-card operations-warning" role="status">
        {model.error instanceof Error ? model.error.message : 'Agent scorecard is temporarily unavailable.'}
      </div>
    </Show>

    <Show when={!model.error && model.isPending}><div class="mini-skeleton"/></Show>

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
          <small>{d().status.live_capabilities.join(', ') || 'none'}</small>
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
          <div><span class="eyebrow">THIS WEEK</span><h3>Actions</h3></div>
        </div>
        <div class="operations-metrics">
          <div><span>Executed</span><strong>{count(d().week.executed)}</strong><small>{count(d().week.succeeded)} succeeded · {count(d().week.failed)} failed</small></div>
          <div><span>Success rate</span><strong>{bpsToPercent(d().week.success_rate_basis_points)}</strong><small>of executed actions</small></div>
          <div><span>Parked</span><strong>{count(d().week.parked)}</strong><small>no executor available</small></div>
          <div><span>Awaiting approval</span><strong>{count(d().week.awaiting_approval)}</strong><small>needs a human</small></div>
        </div>
      </section>

      {/* Track record */}
      <section class="operations-section">
        <div class="operations-section-head">
          <div><span class="eyebrow">TRACK RECORD</span><h3>Did it work?</h3></div>
        </div>
        <div class="operations-metrics">
          <div><span>Improved</span><strong>{count(d().track_record.improved)}</strong><small class="tone-good">measured wins</small></div>
          <div><span>Worsened</span><strong>{count(d().track_record.worsened)}</strong><small class="tone-bad">measured losses</small></div>
          <div><span>Neutral</span><strong>{count(d().track_record.neutral)}</strong><small>no change</small></div>
          <div><span>Unmeasured</span><strong>{count(d().track_record.unmeasured)}</strong><small>{bpsToPercent(d().track_record.measurement_coverage_basis_points)} coverage</small></div>
        </div>
        <Show when={d().track_record.measurement_coverage_basis_points != null && (d().track_record.measurement_coverage_basis_points as number) < 5000}>
          <div class="operations-attention">
            <strong>Low measurement coverage</strong>
            <span>Less than half of executed actions have a measured outcome. The agent is busy but nobody can tell if the work is paying off.</span>
          </div>
        </Show>
      </section>

      {/* By context */}
      <Show when={d().by_context.length > 0}>
        <section class="operations-section">
          <div class="operations-section-head">
            <div><span class="eyebrow">BY CONTEXT</span><h3>Which parts are producing</h3></div>
          </div>
          <div class="flag-list">
            <For each={d().by_context}>{ctx => <div class="flag-row release-component-row">
              <div>
                <strong>{contextLabel(ctx.context)}</strong>
                <small>{count(ctx.executed)} executed · {count(ctx.succeeded)} succeeded · {count(ctx.failed)} failed</small>
                <Show when={ctx.parked > 0}><small>{count(ctx.parked)} parked</small></Show>
              </div>
            </div>}</For>
          </div>
        </section>
      </Show>

      {/* Recent results */}
      <section class="operations-section">
        <div class="operations-section-head">
          <div><span class="eyebrow">RECENT RESULTS</span><h3>Last 10 completed actions</h3></div>
        </div>
        <Show when={d().recent_results.length > 0} fallback={<div class="inherit-card"><p>The agent has not completed any actions yet.</p></div>}>
          <div class="flag-list">
            <For each={d().recent_results}>{result => <div class="flag-row release-component-row">
              <div>
                <strong>{actionLabel(result.action_kind)}</strong>
                <small>{contextLabel(result.context)} · {result.subject_kind}</small>
                <Show when={result.metric_key}><small>metric: {result.metric_key}</small></Show>
                <Show when={deltaLabel(result.delta_basis_points)}>{delta =>
                  <small>delta: {delta()}</small>
                }</Show>
                <small>{timeAgo(result.completed_at)}<Show when={result.executor_id}>{` · ${result.executor_id}`}</Show></small>
              </div>
              <div class="row-health">
                <StatusBadge status={outcomeLabel(result.outcome)} tone={outcomeTone(result.outcome)} />
              </div>
            </div>}</For>
          </div>
        </Show>
      </section>
    </>}</Show>
  </article>
}
