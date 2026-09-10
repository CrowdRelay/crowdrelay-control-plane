import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { ModelIcon } from './ProviderIcon'
import { Sparkline } from './Sparkline'
import type { TemplateRoi, ModelAnalytics } from '../lib/types'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'

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

const toneVariant = (tone: 'good' | 'warn' | 'bad' | 'muted'): 'success' | 'warning' | 'destructive' | 'muted' =>
  tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : tone === 'bad' ? 'destructive' : 'muted'

export function AIUsagePanel(props: { slug: string; active?: boolean }) {
  const data = useQuery(() => ({
    queryKey: ['ai-usage', props.slug],
    queryFn: () => api.usageAnalytics(props.slug),
    enabled: props.active !== false,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const budget = () => data.data?.budget
  const templateRoi = () => data.data?.template_roi ?? []
  const modelAnalytics = () => data.data?.model_analytics ?? []
  const dailySpend = () => data.data?.daily_spend ?? []

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

  return <Card class="p-5">
    <Show when={data.isError}>
      <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{errorMessage(data.error, 'Failed to load usage analytics')}</div>
    </Show>

    {/* Budget header */}
    <Show when={budget()} fallback={<Show when={!data.isError}><SkeletonRows count={3} /></Show>}>
      <div class="mt-4">
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-sm font-semibold text-foreground flex items-center gap-2"><CrownIcon size={16} /> AI Budget</h3>
          <Button variant="ghost" size="sm" onClick={() => void data.refetch()} disabled={data.isFetching}>{data.isFetching ? 'Refreshing…' : 'Refresh'}</Button>
        </div>
        <div class="mt-3">
          <div class="flex items-center justify-between mb-1.5">
            <span>Monthly spend</span>
            <strong>{formatUsd(budget()!.monthly_spend_micro_usd)} / {formatUsd(budget()!.budget_micro_usd)}</strong>
          </div>
          <div class="h-2.5 rounded-sm bg-surface-3 overflow-hidden">
            <div class="h-full rounded-sm" style={{ width: `${budgetPct()}%`, background: 'linear-gradient(90deg, var(--color-primary), var(--cyan))' }} />
          </div>
          <div class="flex gap-4 mt-1.5 text-sm">
            <span class="text-muted-foreground">{budgetPct()}% used</span>
            <span class="text-muted-foreground">{formatUsd(budget()!.remaining_micro_usd)} remaining</span>
            <span class="text-muted-foreground">projected: {formatUsd(projectedSpend())}</span>
          </div>
          <Show when={dailySpend().length >= 2}>
            <div class="mt-2.5 pt-2.5 border-t border-border flex items-center justify-end">
              <Sparkline
                data={dailySpend().map(d => d.paid_cost_micro_usd + d.free_cost_micro_usd)}
                width={200}
                height={32}
                color={budgetPct() > 80 ? 'var(--color-warning)' : 'var(--color-primary)'}
              />
            </div>
          </Show>
        </div>
      </div>
    </Show>

    {/* Cost-ROI per template */}
    <Show when={templateRoi().length > 0}>
      <div class="mt-6 pt-4 border-t border-border">
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-sm font-semibold text-foreground">Cost vs Outcome ROI</h3>
          <span class="text-muted-foreground">this month</span>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">Cost vs outcome per template. Sorted by cost-per-outcome (best ROI first).</p>
        <Table class="mt-3">
          <TableHeader><TableRow><TableHead>Template</TableHead><TableHead>Tasks</TableHead><TableHead>Completed</TableHead><TableHead>Failed</TableHead><TableHead>Cost</TableHead><TableHead>Outcomes</TableHead><TableHead>Cost/Outcome</TableHead><TableHead>Success</TableHead></TableRow></TableHeader>
          <TableBody>
            <For each={templateRoi()}>{(row: TemplateRoi) => (
              <TableRow>
                <TableCell><strong>{templateLabel(row.template_id)}</strong></TableCell>
                <TableCell>{row.total_tasks}</TableCell>
                <TableCell>{row.completed_tasks}</TableCell>
                <TableCell>{row.failed_tasks}</TableCell>
                <TableCell>{formatUsd(row.total_cost_micro_usd)}</TableCell>
                <TableCell>{row.outcome_count}</TableCell>
                <TableCell>
                  <Show when={row.cost_per_outcome_micro_usd != null} fallback={<span class="text-muted-foreground">—</span>}>
                    {formatUsd(row.cost_per_outcome_micro_usd!)}
                  </Show>
                </TableCell>
                <TableCell>
                  <Show when={row.success_rate != null} fallback={<span class="text-muted-foreground">—</span>}>
                    <Badge variant={toneVariant(successTone(row.success_rate))}>{row.success_rate}%</Badge>
                  </Show>
                </TableCell>
              </TableRow>
            )}</For>
          </TableBody>
        </Table>
      </div>
    </Show>

    {/* Model routing analytics */}
    <Show when={modelAnalytics().length > 0}>
      <div class="mt-6 pt-4 border-t border-border">
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-sm font-semibold text-foreground">Model performance</h3>
          <span class="text-muted-foreground">last 30 days</span>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">Per-model success rate, latency, and cost.</p>
        <Table class="mt-3">
          <TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Provider</TableHead><TableHead>Tasks</TableHead><TableHead>Success</TableHead><TableHead>Avg latency</TableHead><TableHead>Avg cost/task</TableHead><TableHead>Avg tokens</TableHead></TableRow></TableHeader>
          <TableBody>
            <For each={modelAnalytics()}>{(m: ModelAnalytics) => (
              <TableRow>
                <TableCell><ModelIcon modelId={m.model_id} providerId={m.model_provider ?? ''} paid={m.total_cost_micro_usd > 0} size={16} /> <strong>{m.model_id}</strong></TableCell>
                <TableCell class="text-muted-foreground">{m.model_provider ?? '—'}</TableCell>
                <TableCell>{m.total_tasks}</TableCell>
                <TableCell>
                  <Show when={m.success_rate != null} fallback={<span class="text-muted-foreground">—</span>}>
                    <Badge variant={toneVariant(successTone(m.success_rate))}>{m.success_rate}%</Badge>
                  </Show>
                </TableCell>
                <TableCell class="text-muted-foreground">{m.avg_latency_ms > 0 ? `${(m.avg_latency_ms / 1000).toFixed(1)}s` : '—'}</TableCell>
                <TableCell>{formatUsd(m.avg_cost_per_task_micro_usd)}</TableCell>
                <TableCell class="text-muted-foreground">{m.avg_tokens_in > 0 || m.avg_tokens_out > 0 ? `${m.avg_tokens_in}/${m.avg_tokens_out}` : '—'}</TableCell>
              </TableRow>
            )}</For>
          </TableBody>
        </Table>
      </div>
    </Show>

    {/* Daily spend chart */}
    <Show when={dailySpend().length > 0}>
      <div class="mt-6 pt-4 border-t border-border">
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-sm font-semibold text-foreground">Daily spend trend</h3>
          <span class="text-muted-foreground">last 30 days</span>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">Daily AI spend, free vs paid stacked. A flat line at $0 means free models are being used.</p>
        <div class="flex items-end gap-0.5 h-[120px] mt-4 px-1">
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
              <div class="flex-1 flex flex-col items-center justify-end h-full relative min-w-0" title={`${dayLabel}: ${formatUsd(d.paid_cost_micro_usd)} paid, ${d.requests} requests`}>
                <div class="w-full max-w-[14px] rounded-t-sm min-h-[3px]" style={{
                  height: `${heightPct}%`,
                  background: paidPct > 0
                    ? `linear-gradient(to top, var(--color-primary) ${100 - paidPct}%, var(--color-warning) ${100 - paidPct}%)`
                    : 'var(--color-primary)',
                }} />
                <span class="text-xs text-muted-foreground mt-1 whitespace-nowrap overflow-hidden text-ellipsis max-w-full">{dayLabel}</span>
              </div>
            )
          }}</For>
        </div>
      </div>
    </Show>

    {/* Empty state */}
    <Show when={data.data && templateRoi().length === 0 && modelAnalytics().length === 0}>
      <div class="mt-4">
        <EmptyState label="No AI usage data" hint="Data appears once the intelligence dispatches workers." />
      </div>
    </Show>

    {/* Model routing preview — shows the intelligence's fallback chain */}
    <Show when={data.data && (data.data!.available_models.length > 0 || modelAnalytics().length > 0)}>
      <div class="mt-6 pt-4 border-t border-border">
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-sm font-semibold text-foreground">Model routing preview</h3>
          <span class="text-muted-foreground">intelligence fallback chain</span>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">The intelligence routes to free models first, then paid if connected.</p>
        <div class="grid gap-2.5 mt-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
          <For each={data.data?.available_models ?? []}>{(m) => {
            const analytics = () => modelAnalytics().find(a => a.model_id === m.id)
            const tone = () => {
              const a = analytics()
              if (!a || a.success_rate == null) return 'muted' as const
              return a.success_rate >= 90 ? 'good' as const : a.success_rate >= 75 ? 'warn' as const : 'bad' as const
            }
            return (
              <div class="p-3 border rounded-lg bg-surface-3 transition-colors hover:bg-surface-4 hover:-translate-y-px" classList={{ 'border-success': m.paid && m.connected, 'border-primary': !m.paid }}>
                <div class="flex items-center gap-2 flex-wrap">
                  <ModelIcon modelId={m.id} providerId={m.provider} paid={m.paid} size={18} />
                  <strong>{m.name}</strong>
                  <Show when={!m.paid}>
                    <Badge variant="success">free</Badge>
                  </Show>
                  <Show when={m.paid && m.connected}>
                    <Badge variant="success">connected</Badge>
                  </Show>
                  <Show when={m.paid && !m.connected}>
                    <Badge variant="muted">not connected</Badge>
                  </Show>
                </div>
                <div class="flex items-center gap-2 mt-1.5 text-sm flex-wrap">
                  <span class="text-muted-foreground">{m.provider}</span>
                  <Show when={analytics()}>
                    {(a) => (
                      <Badge variant={toneVariant(tone())}>{a().success_rate ?? '—'}% success · {a().total_tasks} tasks</Badge>
                    )}
                  </Show>
                  <Show when={!analytics()}>
                    <span class="text-muted-foreground">not yet used</span>
                  </Show>
                </div>
              </div>
            )
          }}</For>
        </div>
      </div>
    </Show>
  </Card>
}
