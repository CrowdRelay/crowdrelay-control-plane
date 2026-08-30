import { For, Show, createResource, createSignal } from 'solid-js'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { refreshTick, triggerRefresh } from '../lib/refresh'
import { ModelIcon } from './ProviderIcon'
import { Sparkline } from './Sparkline'
import type { UsageAnalyticsData, TemplateRoi, ModelAnalytics } from '../lib/types'
import { EmptyState } from './EmptyState'

// --- Icons ---
const CrownIcon = (props: { size?: number }) => (
  <svg width={props.size ?? 16} height={props.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 18h18M3 18l2-10 5 5 2-8 2 8 5-5 2 10" />
  </svg>
)

const formatUsd = (microUsd: number): string => {
  const usd = microUsd / 1_000_000
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

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

const successTone = (rate: number | null): 'good' | 'warn' | 'bad' | 'muted' =>
  rate == null ? 'muted' : rate >= 90 ? 'good' : rate >= 75 ? 'warn' : 'bad'

export function AIUsagePanel(props: { slug: string }) {
  const [error, setError] = createSignal<string | null>(null)

  const refreshSource = () => refreshTick()

  const [data] = createResource(refreshSource, async () => {
    try {
      setError(null)
      return await api.usageAnalytics(props.slug)
    } catch (err) {
      setError(errorMessage(err, 'Failed to load usage analytics'))
      return null
    }
  })

  const budget = () => data()?.budget
  const templateRoi = () => data()?.template_roi ?? []
  const modelAnalytics = () => data()?.model_analytics ?? []
  const dailySpend = () => data()?.daily_spend ?? []

  const budgetPct = () => {
    const b = budget()
    if (!b || b.budget_micro_usd <= 0) return 0
    return Math.min(100, Math.round((b.monthly_spend_micro_usd / b.budget_micro_usd) * 100))
  }

  const projectedSpend = () => {
    const b = budget()
    if (!b || b.day_of_month === 0) return 0
    const dailyRate = b.monthly_spend_micro_usd / b.day_of_month
    return Math.round(dailyRate * b.days_in_month)
  }

  const maxDailySpend = () => {
    const spend = dailySpend()
    if (spend.length === 0) return 1
    return Math.max(1, ...spend.map(d => d.paid_cost_micro_usd + d.free_cost_micro_usd))
  }

  return <div class="ai-usage-panel">
    <Show when={error()}>
      <div class="error-card">{error()}</div>
    </Show>

    {/* Budget header */}
    <Show when={budget()} fallback={<Show when={!error()}><div class="skeleton-block" /></Show>}>
      <div class="agent-section">
        <div class="agent-section-head">
          <h3><CrownIcon size={16} /> AI Budget</h3>
          <button class="ghost" onClick={() => triggerRefresh()}>Refresh</button>
        </div>
        <div class="usage-budget-bar">
          <div class="usage-budget-head">
            <span>Monthly spend</span>
            <strong>{formatUsd(budget()!.monthly_spend_micro_usd)} / {formatUsd(budget()!.budget_micro_usd)}</strong>
          </div>
          <div class="usage-budget-track">
            <div class="usage-budget-fill" style={{ width: `${budgetPct()}%` }} />
          </div>
          <div class="usage-budget-meta">
            <span class="muted">{budgetPct()}% used</span>
            <span class="muted">{formatUsd(budget()!.remaining_micro_usd)} remaining</span>
            <span class="muted">projected: {formatUsd(projectedSpend())}</span>
          </div>
          <Show when={dailySpend().length >= 2}>
            <div class="usage-budget-spark">
              <Sparkline
                data={dailySpend().map(d => d.paid_cost_micro_usd + d.free_cost_micro_usd)}
                width={200}
                height={32}
                color={budgetPct() > 80 ? 'var(--warn)' : 'var(--accent)'}
              />
            </div>
          </Show>
        </div>
      </div>
    </Show>

    {/* Cost-ROI per template */}
    <Show when={templateRoi().length > 0}>
      <div class="agent-section">
        <div class="agent-section-head">
          <h3>Cost vs Outcome ROI</h3>
          <span class="muted">this month</span>
        </div>
        <p class="agent-section-intro">How much each worker template costs vs the growth outcomes it produced. Sorted by cost-per-outcome (best ROI first). Free models show $0 cost with outcome counts.</p>
        <div class="usage-table-wrap">
          <table class="agent-task-table">
            <thead><tr><th>Template</th><th>Tasks</th><th>Completed</th><th>Failed</th><th>Cost</th><th>Outcomes</th><th>Cost/Outcome</th><th>Success</th></tr></thead>
            <tbody>
              <For each={templateRoi()}>{(row: TemplateRoi) => (
                <tr>
                  <td><strong>{templateLabel(row.template_id)}</strong></td>
                  <td>{row.total_tasks}</td>
                  <td>{row.completed_tasks}</td>
                  <td>{row.failed_tasks}</td>
                  <td>{formatUsd(row.total_cost_micro_usd)}</td>
                  <td>{row.outcome_count}</td>
                  <td>
                    <Show when={row.cost_per_outcome_micro_usd != null} fallback={<span class="muted">—</span>}>
                      {formatUsd(row.cost_per_outcome_micro_usd!)}
                    </Show>
                  </td>
                  <td>
                    <Show when={row.success_rate != null} fallback={<span class="muted">—</span>}>
                      <span class={`badge tone-${successTone(row.success_rate)}`}>{row.success_rate}%</span>
                    </Show>
                  </td>
                </tr>
              )}</For>
            </tbody>
          </table>
        </div>
      </div>
    </Show>

    {/* Model routing analytics */}
    <Show when={modelAnalytics().length > 0}>
      <div class="agent-section">
        <div class="agent-section-head">
          <h3>Model Performance</h3>
          <span class="muted">last 30 days</span>
        </div>
        <p class="agent-section-intro">Per-model success rate, latency, and cost. Helps you see if the brain is routing tasks to the right models. Color-coded success rate: green ≥90%, yellow ≥75%, red below 75%.</p>
        <div class="usage-table-wrap">
          <table class="agent-task-table">
            <thead><tr><th>Model</th><th>Provider</th><th>Tasks</th><th>Success</th><th>Avg latency</th><th>Avg cost/task</th><th>Avg tokens</th></tr></thead>
            <tbody>
              <For each={modelAnalytics()}>{(m: ModelAnalytics) => (
                <tr>
                  <td><ModelIcon modelId={m.model_id} providerId={m.model_provider ?? ''} paid={m.total_cost_micro_usd > 0} size={16} /> <strong>{m.model_id}</strong></td>
                  <td class="muted">{m.model_provider ?? '—'}</td>
                  <td>{m.total_tasks}</td>
                  <td>
                    <Show when={m.success_rate != null} fallback={<span class="muted">—</span>}>
                      <span class={`badge tone-${successTone(m.success_rate)}`}>{m.success_rate}%</span>
                    </Show>
                  </td>
                  <td class="muted">{m.avg_latency_ms > 0 ? `${(m.avg_latency_ms / 1000).toFixed(1)}s` : '—'}</td>
                  <td>{formatUsd(m.avg_cost_per_task_micro_usd)}</td>
                  <td class="muted">{m.avg_tokens_in > 0 || m.avg_tokens_out > 0 ? `${m.avg_tokens_in}/${m.avg_tokens_out}` : '—'}</td>
                </tr>
              )}</For>
            </tbody>
          </table>
        </div>
      </div>
    </Show>

    {/* Daily spend chart */}
    <Show when={dailySpend().length > 0}>
      <div class="agent-section">
        <div class="agent-section-head">
          <h3>Daily Spend Trend</h3>
          <span class="muted">last 30 days</span>
        </div>
        <p class="agent-section-intro">Daily AI spend, free vs paid stacked. The bar height shows total requests; color shows paid cost. A flat line at $0 means the brain is routing to free models — that's the goal.</p>
        <div class="usage-chart">
          <For each={dailySpend()}>{(d) => {
            const totalCost = d.paid_cost_micro_usd + d.free_cost_micro_usd
            const heightPct = Math.max(2, Math.round((totalCost / maxDailySpend()) * 100))
            const paidPct = totalCost > 0 ? Math.round((d.paid_cost_micro_usd / totalCost) * 100) : 0
            const dayLabel = (() => {
              const dayStr = typeof d.day === 'string' ? d.day : String(d.day)
              // day is YYYY-MM-DD from the backend (day::text). Extract MM-DD.
              // If it's an ISO timestamp, parse and format.
              if (/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) return dayStr.slice(5)
              const parsed = new Date(dayStr)
              if (!Number.isNaN(parsed.getTime())) {
                return `${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
              }
              return dayStr
            })()
            return (
              <div class="usage-chart-bar" title={`${dayLabel}: ${formatUsd(d.paid_cost_micro_usd)} paid, ${d.requests} requests`}>
                <div class="usage-chart-bar-fill" style={{
                  height: `${heightPct}%`,
                  background: paidPct > 0
                    ? `linear-gradient(to top, var(--accent) ${100 - paidPct}%, var(--warn) ${100 - paidPct}%)`
                    : 'var(--accent)',
                }} />
                <span class="usage-chart-bar-label">{dayLabel}</span>
              </div>
            )
          }}</For>
        </div>
      </div>
    </Show>

    {/* Empty state */}
    <Show when={data() && templateRoi().length === 0 && modelAnalytics().length === 0}>
      <div class="inherit-card">
        <EmptyState label="No AI usage data" hint="AI usage tracks token consumption and costs for worker agents. Data appears here once the Brain dispatches workers." />
      </div>
    </Show>

    {/* Model routing preview — shows the brain's fallback chain */}
    <Show when={data() && (data()!.available_models.length > 0 || modelAnalytics().length > 0)}>
      <div class="agent-section">
        <div class="agent-section-head">
          <h3>Model Routing Preview</h3>
          <span class="muted">brain fallback chain</span>
        </div>
        <p class="agent-section-intro">The brain routes tasks to models using a fallback chain: free models first, then paid models if connected. This shows which models are available and whether they're being used.</p>
        <div class="routing-preview-grid">
          <For each={data()?.available_models ?? []}>{(m) => {
            const analytics = () => modelAnalytics().find(a => a.model_id === m.id)
            const tone = () => {
              const a = analytics()
              if (!a || a.success_rate == null) return 'muted' as const
              return a.success_rate >= 90 ? 'good' as const : a.success_rate >= 75 ? 'warn' as const : 'bad' as const
            }
            return (
              <div class="routing-model-card" classList={{ connected: m.connected, free: !m.paid }}>
                <div class="routing-model-head">
                  <ModelIcon modelId={m.id} providerId={m.provider} paid={m.paid} size={18} />
                  <strong>{m.name}</strong>
                  <Show when={!m.paid}>
                    <span class="badge free-chip">free</span>
                  </Show>
                  <Show when={m.paid && m.connected}>
                    <span class="badge tone-good">connected</span>
                  </Show>
                  <Show when={m.paid && !m.connected}>
                    <span class="badge tone-muted">not connected</span>
                  </Show>
                </div>
                <div class="routing-model-meta">
                  <span class="muted">{m.provider}</span>
                  <Show when={analytics()}>
                    {(a) => (
                      <span class={`badge tone-${tone()}`}>{a().success_rate ?? '—'}% success · {a().total_tasks} tasks</span>
                    )}
                  </Show>
                  <Show when={!analytics()}>
                    <span class="muted">not yet used</span>
                  </Show>
                </div>
              </div>
            )
          }}</For>
        </div>
      </div>
    </Show>
  </div>
}
