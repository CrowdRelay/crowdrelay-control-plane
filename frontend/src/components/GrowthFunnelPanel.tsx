import { For, Show, createResource, createSignal } from 'solid-js'
import { api } from '../lib/api'
import { errorMessage, formatIsoAge } from '../lib/format'
import { refreshTick, triggerRefresh } from '../lib/refresh'
import { StatusBadge } from './StatusBadge'
import { CountUp } from './CountUp'
import { FunnelChart } from './FunnelChart'
import { EmptyState } from './EmptyState'
import { SkeletonBlock, SkeletonRows } from './Skeleton'
import type { GrowthFunnelData, FunnelRecentWorkerRun } from '../lib/types'

// --- Funnel icon ---
const FunnelIcon = (props: { size?: number }) => (
  <svg width={props.size ?? 18} height={props.size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 4h18l-7 8v6l-4 2v-8L3 4z" />
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

const runStatusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'completed' ? 'good' :
  status === 'running' || status === 'queued' ? 'warn' :
  status === 'failed' ? 'bad' : 'muted'

export function GrowthFunnelPanel(props: { slug: string }) {
  const [error, setError] = createSignal<string | null>(null)
  const [days, setDays] = createSignal(30)

  const refreshSource = () => refreshTick() + days()

  const [funnel] = createResource(refreshSource, async () => {
    try {
      setError(null)
      return await api.growthFunnel(props.slug, days())
    } catch (err) {
      setError(errorMessage(err, 'Failed to load growth funnel'))
      return null
    }
  })

  // Build funnel stages from the data we have.
  // The agent service provides: communities_discovered, worker_runs, brain_workflows.
  // The CrowdRelay side (outreach targets, posts, clicks, signups, tickets) is
  // fetched separately via the operations read model — but for the agent-service
  // panel we show what we have here. The full funnel page combines both.
  const stages = () => {
    const data = funnel()
    if (!data) return []
    const wr = data.worker_runs
    const scannerRuns = wr['reddit-scanner']?.completed ?? 0
    const engagerRuns = wr['community-engager']?.completed ?? 0
    const inviterRuns = wr['signal-inviter']?.completed ?? 0
    return [
      { label: 'Communities Discovered', value: data.communities_discovered, hint: 'Reddit subreddits found by scraper' },
      { label: 'Scanner Runs', value: scannerRuns, hint: 'Intelligence-dispatched reddit-scanner workers' },
      { label: 'Engager Runs', value: engagerRuns, hint: 'Intelligence-dispatched community-engager workers' },
      { label: 'Inviter Runs', value: inviterRuns, hint: 'Intelligence-dispatched signal-inviter workers' },
      { label: 'Brain Workflows', value: data.brain_workflows.total, hint: 'Total brain-dispatched growth plans' },
    ]
  }

  const bottleneck = () => {
    const s = stages()
    if (s.length < 2) return null
    let worstRate = 100
    let worstIdx = -1
    for (let i = 0; i < s.length - 1; i++) {
      const curr = s[i]!
      const next = s[i + 1]!
      if (curr.value > 0) {
        const rate = (next.value / curr.value) * 100
        if (rate < worstRate) {
          worstRate = rate
          worstIdx = i
        }
      }
    }
    if (worstIdx === -1 || worstRate >= 100) return null
    return { stage: s[worstIdx]!, nextStage: s[worstIdx + 1]!, rate: Math.round(worstRate) }
  }

  const totalWorkerRuns = () => {
    const data = funnel()
    if (!data) return 0
    return Object.values(data.worker_runs).reduce((sum, r) => sum + r.total, 0)
  }

  const completedWorkerRuns = () => {
    const data = funnel()
    if (!data) return 0
    return Object.values(data.worker_runs).reduce((sum, r) => sum + r.completed, 0)
  }

  const failedWorkerRuns = () => {
    const data = funnel()
    if (!data) return 0
    return Object.values(data.worker_runs).reduce((sum, r) => sum + r.failed, 0)
  }

  return <div class="growth-funnel-panel">
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

    {/* KPI strip */}
    <Show when={funnel()} fallback={<Show when={!error()}><SkeletonBlock height="100px" radius="10px" /></Show>}>
      <div class="kpi-strip">
        <article class="kpi-card">
          <span class="kpi-label">Communities</span>
          <CountUp value={funnel()!.communities_discovered} />
          <span class="kpi-sub">discovered</span>
        </article>
        <article class="kpi-card">
          <span class="kpi-label">Worker runs</span>
          <CountUp value={totalWorkerRuns()} />
          <span class="kpi-sub">{completedWorkerRuns()} completed · {failedWorkerRuns()} failed</span>
        </article>
        <article class="kpi-card">
          <span class="kpi-label">Intelligence workflows</span>
          <CountUp value={funnel()!.brain_workflows.total} />
          <span class="kpi-sub">{funnel()!.brain_workflows.by_status.completed ?? 0} completed</span>
        </article>
      </div>
    </Show>

    {/* Funnel visualization */}
    <Show when={funnel()}>
      <div class="agent-section">
        <div class="agent-section-head">
          <h3><FunnelIcon size={18} /> Growth Funnel</h3>
        </div>
        <p class="agent-section-intro">The fan growth journey from community discovery to conversion. Each stage shows how many progressed to the next.</p>

        {/* Bottleneck highlight */}
        <Show when={bottleneck()}>{(b) => (
          <div class="warning-card">
            <strong>Funnel bottleneck: {b().stage.label}</strong>
            <span>Only {b().rate}% progressed to {b().nextStage.label}. {b().stage.value} → {b().nextStage.value}. Consider dispatching more {b().stage.label.toLowerCase()} runs or reviewing the intelligence's growth intelligence policy.</span>
          </div>
        )}</Show>

        <div class="funnel-stages">
          <FunnelChart stages={stages()} />
        </div>
      </div>
    </Show>

    {/* Worker run breakdown */}
    <Show when={funnel() && Object.keys(funnel()!.worker_runs).length > 0}>
      <div class="agent-section">
        <div class="agent-section-head">
          <h3>Worker run breakdown</h3>
        </div>
        <p class="agent-section-intro">Per-template worker run statistics. The intelligence dispatches these workers to gather intelligence and draft content.</p>
        <div class="funnel-worker-table">
          <table class="agent-task-table">
            <thead><tr><th>Template</th><th>Total</th><th>Completed</th><th>Failed</th><th>Running</th><th>Queued</th><th>Success rate</th></tr></thead>
            <tbody>
              <For each={Object.entries(funnel()!.worker_runs)}>{([tpl, stats]) => {
                const successRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : null
                const tone = successRate == null ? 'muted' : successRate >= 90 ? 'good' : successRate >= 75 ? 'warn' : 'bad'
                return (
                  <tr>
                    <td><strong>{templateLabel(tpl)}</strong></td>
                    <td>{stats.total}</td>
                    <td>{stats.completed}</td>
                    <td>{stats.failed}</td>
                    <td>{stats.running}</td>
                    <td>{stats.queued}</td>
                    <td><Show when={successRate != null} fallback={<span class="muted">—</span>}>
                      <span class={`badge tone-${tone}`}>{successRate}%</span>
                    </Show></td>
                  </tr>
                )
              }}</For>
            </tbody>
          </table>
        </div>
      </div>
    </Show>

    {/* Recent worker runs */}
    <Show when={funnel() && funnel()!.recent_worker_runs.length > 0}>
      <div class="agent-section">
        <div class="agent-section-head">
          <h3>Recent worker runs</h3>
          <span class="muted">last {funnel()!.recent_worker_runs.length}</span>
        </div>
        <p class="agent-section-intro">The most recent worker runs dispatched by the intelligence, with their outcomes.</p>
        <div class="funnel-recent-list">
          <For each={funnel()!.recent_worker_runs}>{(run: FunnelRecentWorkerRun) => (
            <div class="funnel-recent-row">
              <div class="funnel-recent-head">
                <strong>{templateLabel(run.template_id)}</strong>
                <StatusBadge status={run.status} tone={runStatusTone(run.status)} />
                <span class="muted">{formatIsoAge(run.created_at)}</span>
              </div>
              <div class="funnel-recent-meta">
                <Show when={run.has_outcome}>
                  <span class="badge free-chip">outcome: {run.outcome_kind ?? 'structured'}</span>
                </Show>
                <Show when={run.tokens_in > 0 || run.tokens_out > 0}>
                  <span class="muted">{run.tokens_in} in · {run.tokens_out} out tokens</span>
                </Show>
              </div>
            </div>
          )}</For>
        </div>
      </div>
    </Show>

    {/* Empty state */}
    <Show when={funnel() && funnel()!.communities_discovered === 0 && totalWorkerRuns() === 0}>
      <EmptyState
        icon={<FunnelIcon size={28} />}
        label="No growth activity in this period"
        hint="The autopilot hasn't dispatched any workers and no communities have been discovered. Make sure the autopilot is enabled and the growth intelligence policy is set to bounded auto or require approval."
      />
    </Show>
  </div>
}
