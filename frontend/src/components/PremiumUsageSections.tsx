import { For, Show, createMemo } from 'solid-js'
import { formatIsoAge, formatUsd } from '../lib/format'
import { budgetPct, taskStatusTone } from '../lib/credential-health'
import { StatusBadge } from './StatusBadge'
import { ModelIcon } from './ProviderIcon'
import { EmptyState } from './ui/empty-state'
import { Sparkline } from './Sparkline'
import { Card } from './ui/card'
import { KpiCard, KpiStrip } from './layout'
import { RobotIcon, SparkIcon } from './provider-icons'
import type { PremiumUsage } from '../lib/types'

// ─── Compact budget + status strip ──────────────────────────────────────
// These were the only KPI tiles in the console still hand-rolled:
// rounded on a page of square panels, with uppercase letter-spaced
// labels where every other strip uses sentence case at the same size.
// Same four numbers, through the shared primitive.
export function UsageKpiStrip(props: {
  usage: PremiumUsage
  connectedCount: number
  availableModelCount: number
}) {
  // Memoize budget percentage so it's computed once per render, not 5x.
  const budgetPctValue = createMemo(() =>
    budgetPct(props.usage.monthly_spend_micro_usd, props.usage.budget_micro_usd)
  )

  // Build a daily cost series from the task list for the hero sparkline.
  // Each task has a created_at (ISO) and cost_micro_usd. We bucket by day
  // (last 14 days) and sum the cost, so the sparkline shows spend history
  // with peaks where expensive tasks ran.
  const dailyCostSeries = createMemo(() => {
    if (props.usage.tasks.length === 0) return []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const days: number[] = []
    const labels: string[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      days.push(0)
      labels.push(d.toISOString().slice(0, 10))
    }
    for (const task of props.usage.tasks) {
      const dayStr = task.created_at.slice(0, 10)
      const idx = labels.indexOf(dayStr)
      if (idx >= 0) days[idx]! += task.cost_micro_usd
    }
    return days
  })

  return (
    <KpiStrip class="mb-0">
      <KpiCard
        label="Spent this month"
        value={formatUsd(props.usage.monthly_spend_micro_usd)}
        sub={`of ${formatUsd(props.usage.budget_micro_usd)}`}
        tone={budgetPctValue() > 80 ? 'warn' : 'default'}
      />
      <KpiCard label="Connected" value={props.connectedCount} sub="providers" />
      <KpiCard label="Models" value={props.availableModelCount} sub="available" />
      <Card class="p-4">
        <div class="text-xs text-muted-foreground">Tasks run</div>
        <div class="mt-1 text-xl font-bold tabular-nums text-foreground">{props.usage.tasks.length}</div>
        <div class="text-xs text-muted-foreground">in the last 30 days</div>
        <Show when={dailyCostSeries().some(v => v > 0)}>
          <div class="mt-1 h-5 opacity-80">
            <Sparkline data={dailyCostSeries()} width={80} height={20} color={budgetPctValue() > 80 ? 'var(--color-warning)' : 'var(--color-primary)'} />
          </div>
        </Show>
      </Card>
    </KpiStrip>
  )
}

// ─── Connected Premium Models ───────────────────────────────────────────
export function PremiumModelsSection(props: { usage: PremiumUsage }) {
  return (
    <section class="rounded-lg border border-border bg-card p-5">
      <div class="flex items-center justify-between mb-2">
        <h3 class="flex items-center gap-2 m-0 text-base font-semibold text-foreground"><SparkIcon size={16} /> Connected Premium Models</h3>
        <span class="text-xs text-muted-foreground bg-surface-3 border border-border rounded-md px-2 py-0.5">{props.usage.premium_models.length}</span>
      </div>
      <Show
        when={props.usage.premium_models.length > 0}
        fallback={
          <div class="p-4">
            <EmptyState label="No premium models active" hint="Premium AI models provide higher quality output for critical worker tasks. Configure API keys to enable them." />
          </div>
        }
      >
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <For each={props.usage.premium_models}>
            {(model) => (
              <div class="flex flex-col gap-1.5 p-3 rounded-lg border border-border bg-surface-1">
                <div class="flex items-center gap-2">
                  <ModelIcon modelId={model.id} providerId={model.provider} paid size={18} />
                  <span class="font-semibold text-sm text-foreground">{model.name}</span>
                  <Show when={model.agentic}>
                    <span class="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-surface-3 rounded-full px-2 py-0.5">
                      <RobotIcon size={11} /> agentic
                    </span>
                  </Show>
                </div>
                <div class="text-xs text-muted-foreground">{model.best_for}</div>
                <div class="flex gap-3 text-xs text-muted-foreground">
                  <span>${model.price_input_per_mtok}/M in</span>
                  <span>${model.price_output_per_mtok}/M out</span>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </section>
  )
}

// ─── Recent Premium Tasks ───────────────────────────────────────────────
export function PremiumTasksSection(props: { usage: PremiumUsage }) {
  return (
    <section class="rounded-lg border border-border bg-card p-5">
      <div class="flex items-center justify-between mb-2">
        <h3 class="flex items-center gap-2 m-0 text-base font-semibold text-foreground">Recent premium tasks</h3>
        <span class="text-xs text-muted-foreground bg-surface-3 border border-border rounded-md px-2 py-0.5">{props.usage.tasks.length}</span>
      </div>
      <Show
        when={props.usage.tasks.length > 0}
        fallback={
          <div class="p-3 text-sm text-muted-foreground">
            No premium tasks yet. The intelligence routes complex tasks here automatically.
          </div>
        }
      >
        <div class="flex flex-col">
          <For each={props.usage.tasks.slice(0, 10)}>
            {(task) => (
              <div class="flex items-center gap-3 text-sm py-2 border-b border-border last:border-0">
                <StatusBadge status={task.status} tone={taskStatusTone(task.status)} />
                <span class="font-medium text-foreground">{task.template_id}</span>
                <span class="text-muted-foreground">{task.model_provider ?? '—'}</span>
                <Show when={task.cost_micro_usd > 0}>
                  <span class="text-muted-foreground tabular-nums">{formatUsd(task.cost_micro_usd)}</span>
                </Show>
                <span class="text-muted-foreground text-xs">{formatIsoAge(task.created_at)}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </section>
  )
}
