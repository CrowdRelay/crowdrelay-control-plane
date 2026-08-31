import { For, Show, createResource, createSignal } from 'solid-js'
import { api } from '../lib/api'
import { errorMessage, formatIsoAge } from '../lib/format'
import { refreshTick, triggerRefresh } from '../lib/refresh'
import { StatusBadge } from './StatusBadge'
import { SkeletonRows } from './Skeleton'
import { EmptyState } from './EmptyState'
import type { IntelligenceDecision, IntelligenceDecisionTask, IntelligenceDecisionsData } from '../lib/types'

// --- Intelligence icon (deterministic Rust autopilot) ---
const IntelligenceIcon = (props: { size?: number }) => (
  <svg width={props.size ?? 18} height={props.size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 7 17a3 3 0 0 0 2 4 3 3 0 0 0 3-3V3a3 3 0 0 0-3 0z" />
    <path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8A3 3 0 0 1 17 17a3 3 0 0 1-2 4 3 3 0 0 1-3-3" opacity="0.5" />
  </svg>
)

const templateLabel = (id: string): string => {
  const labels: Record<string, string> = {
    'reddit-scanner': 'Reddit Scanner',
    'community-engager': 'Community Engager',
    'signal-inviter': 'Signal Inviter',
    'press-pitch': 'Press Pitch',
    'social-post': 'Social Post',
    'audience-research': 'Audience Research',
    'campaign-analysis': 'Campaign Analysis',
    'growth-strategist': 'Growth Strategist',
  }
  return labels[id] ?? id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const decisionStatusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'completed' ? 'good' :
  status === 'running' || status === 'dispatching' || status === 'planning' ? 'warn' :
  status === 'failed' ? 'bad' : 'muted'

const taskStatusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'completed' ? 'good' :
  status === 'running' || status === 'queued' ? 'warn' :
  status === 'failed' ? 'bad' : 'muted'

export function IntelligenceTransparencyPanel(props: { slug: string }) {
  const [error, setError] = createSignal<string | null>(null)
  const [expanded, setExpanded] = createSignal<string | null>(null)
  const [days, setDays] = createSignal(30)

  const refreshSource = () => refreshTick() + days()

  const [data] = createResource(refreshSource, async () => {
    try {
      setError(null)
      return await api.intelligenceDecisions(props.slug, 30, days())
    } catch (err) {
      setError(errorMessage(err, 'Failed to load intelligence decisions'))
      return null
    }
  })

  const summary = () => data()?.summary
  const decisions = () => data()?.decisions ?? []

  const toggleExpand = (id: string) => {
    setExpanded((curr) => (curr === id ? null : id))
  }

  return <div class="intel-transparency-panel">
    <Show when={error()}>
      <div class="error-card">{error()}</div>
    </Show>

    {/* Time range selector */}
    <div class="funnel-controls">
      <label class="compact-field">
        <span>Time range</span>
        <select value={days()} onChange={(e) => setDays(Number(e.currentTarget.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>All time</option>
        </select>
      </label>
      <button class="ghost" onClick={() => triggerRefresh()}>Refresh</button>
    </div>

    {/* Summary KPIs */}
    <Show when={summary()} fallback={<Show when={!error()}><SkeletonRows count={3} /></Show>}>
      <div class="kpi-strip">
        <article class="kpi-card">
          <span class="kpi-label">Intelligence decisions</span>
          <strong class="kpi-value">{summary()!.total_decisions}</strong>
          <span class="kpi-sub">{summary()!.completed_decisions} completed · {summary()!.failed_decisions} failed</span>
        </article>
        <article class="kpi-card">
          <span class="kpi-label">Running</span>
          <strong class="kpi-value">{summary()!.running_decisions}</strong>
          <span class="kpi-sub">in progress now</span>
        </article>
        <article class="kpi-card">
          <span class="kpi-label">Worker tasks</span>
          <strong class="kpi-value">{summary()!.total_tasks}</strong>
          <span class="kpi-sub">{summary()!.completed_tasks} completed</span>
        </article>
      </div>
    </Show>

    {/* Decision timeline */}
    <div class="agent-section">
      <div class="agent-section-head">
        <h3><IntelligenceIcon size={18} /> Decision Timeline</h3>
        <Show when={decisions().length > 0}>
          <span class="muted">{decisions().length} decisions</span>
        </Show>
      </div>
      <p class="agent-section-intro">The intelligence's decision log. Each entry shows what the intelligence decided to research, why (rationale), which workers it dispatched, and what they found. The intelligence is deterministic Rust — it never follows an LLM blindly.</p>

      <Show when={data() && decisions().length === 0} fallback={
        <Show when={data()} fallback={<SkeletonRows count={3} />}>
        <div class="intel-decision-list">
          <For each={decisions()}>{(decision: IntelligenceDecision) => (
            <div class="intel-decision-card">
              <button class="intel-decision-header" onClick={() => toggleExpand(decision.id)}>
                <div class="intel-decision-meta">
                  <strong>{templateLabel(decision.brain_template)}</strong>
                  <span class="muted">{formatIsoAge(decision.created_at)}</span>
                </div>
                <div class="intel-decision-badges">
                  <StatusBadge status={decision.status} tone={decisionStatusTone(decision.status)} />
                  <Show when={decision.plan.length > 0}>
                    <span class="badge">{decision.plan.length} plan items</span>
                  </Show>
                  <Show when={decision.tasks.length > 0}>
                    <span class="badge">{decision.tasks.length} workers</span>
                  </Show>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" classList={{ rotated: expanded() === decision.id }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </button>

              {/* Quick summary (always visible) */}
              <div class="intel-decision-summary">
                <Show when={decision.plan.length > 0}>
                  <p class="intel-rationale-preview">
                    <Show when={decision.plan[0]?.rationale != null} fallback={<span class="muted">No rationale recorded</span>}>
                      {decision.plan[0]!.rationale}
                    </Show>
                  </p>
                </Show>
              </div>

              {/* Expanded detail */}
              <Show when={expanded() === decision.id}>
                <div class="intel-decision-detail">
                  {/* Plan items (the intelligence's reasoning) */}
                  <Show when={decision.plan.length > 0}>
                    <div class="intel-plan-section">
                      <h4>Growth Plan</h4>
                      <p class="muted intel-plan-intro">The intelligence's deterministic plan. Each item shows the template to dispatch, the priority, and the rationale (why the intelligence decided to do this).</p>
                      <For each={decision.plan}>{(item, i) => (
                        <div class="intel-plan-item">
                          <div class="intel-plan-head">
                            <span class="badge">#{i() + 1} · {templateLabel(item.template)}</span>
                            <span class="badge free-chip">priority {item.priority}</span>
                          </div>
                          <p class="intel-plan-rationale"><strong>Why:</strong> {item.rationale}</p>
                          <pre class="intel-plan-prompt">{item.prompt}</pre>
                        </div>
                      )}</For>
                    </div>
                  </Show>

                  {/* Dispatched worker tasks */}
                  <Show when={decision.tasks.length > 0}>
                    <div class="intel-tasks-section">
                      <h4>Dispatched Workers</h4>
                      <p class="muted intel-plan-intro">Workers the intelligence dispatched for this plan. Each worker runs an LLM template and emits structured outcomes. The intelligence consumes these outcomes deterministically.</p>
                      <table class="agent-task-table">
                        <thead><tr><th>Slot</th><th>Role</th><th>Template</th><th>Status</th><th>Outcome</th><th>Tokens</th><th></th></tr></thead>
                        <tbody>
                          <For each={decision.tasks}>{(task: IntelligenceDecisionTask) => (
                            <tr>
                              <td>{task.slot}</td>
                              <td><span class={`badge ${task.role === 'brain' ? 'free-chip' : 'paid-chip'}`}>{task.role}</span></td>
                              <td>{templateLabel(task.template_id)}</td>
                              <td><StatusBadge status={task.status} tone={taskStatusTone(task.status)} /></td>
                              <td>
                                <Show when={task.has_outcome} fallback={<span class="muted">—</span>}>
                                  <span class="badge free-chip">{task.outcome_kind ?? 'structured'}</span>
                                </Show>
                              </td>
                              <td class="muted">{task.tokens_in > 0 || task.tokens_out > 0 ? `${task.tokens_in}/${task.tokens_out}` : '—'}</td>
                              <td><Show when={task.error}><span class="agent-error" title={task.error!}>error</span></Show></td>
                            </tr>
                          )}</For>
                        </tbody>
                      </table>
                    </div>
                  </Show>

                  {/* Decision chain visualization */}
                  <div class="intel-chain-section">
                    <h4>Decision Chain</h4>
                    <div class="intel-chain">
                      <div class="intel-chain-step">
                        <span class="badge free-chip">Intelligence decides</span>
                        <span class="muted">{templateLabel(decision.brain_template)}</span>
                      </div>
                      <Show when={decision.plan.length > 0}>
                        <div class="intel-chain-arrow">↓</div>
                        <div class="intel-chain-step">
                          <span class="badge">Plan</span>
                          <span class="muted">{decision.plan.length} items with rationale</span>
                        </div>
                      </Show>
                      <Show when={decision.tasks.length > 0}>
                        <div class="intel-chain-arrow">↓</div>
                        <div class="intel-chain-step">
                          <span class="badge">Workers dispatched</span>
                          <span class="muted">{decision.tasks.length} LLM tasks</span>
                        </div>
                      </Show>
                      <Show when={decision.tasks.some(t => t.has_outcome)}>
                        <div class="intel-chain-arrow">↓</div>
                        <div class="intel-chain-step">
                          <span class="badge">Outcomes emitted</span>
                          <span class="muted">{decision.tasks.filter(t => t.has_outcome).length} structured results</span>
                        </div>
                      </Show>
                      <div class="intel-chain-arrow">↓</div>
                      <div class="intel-chain-step">
                        <span class={`badge tone-${decisionStatusTone(decision.status)}`}>{decision.status}</span>
                        <span class="muted">
                          <Show when={decision.completed_at} fallback="in progress">
                            {formatIsoAge(decision.completed_at!)}
                          </Show>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Show>
            </div>
          )}</For>
        </div>
        </Show>
      }>
        <div class="inherit-card">
          <EmptyState label="No intelligence decisions" hint="The intelligence dispatches growth plans on a deterministic schedule. Decisions appear here once the autopilot starts running." />
        </div>
      </Show>
    </div>
  </div>
}
