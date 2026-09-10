import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { errorMessage, formatIsoAge } from '../lib/format'
import { StatusBadge } from './StatusBadge'
import { FunnelChart } from './FunnelChart'
import { EmptyState } from './EmptyState'
import { SkeletonBlock, SkeletonRows } from './Skeleton'
import { KpiStrip, KpiCard } from './layout'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import type { GrowthFunnelData, FunnelRecentWorkerRun } from '../lib/types'

const fmt = (n: number | null | undefined): string =>
  n == null ? '—' : n.toLocaleString('en-US')

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

const badgeVariantFor = (tone: 'good' | 'warn' | 'bad' | 'muted'): 'success' | 'warning' | 'destructive' | 'muted' =>
  tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : tone === 'bad' ? 'destructive' : 'muted'

export function GrowthFunnelPanel(props: { slug: string }) {
  const [error, setError] = createSignal<string | null>(null)
  const [days, setDays] = createSignal(30)
  const [showAllWorkerStats, setShowAllWorkerStats] = createSignal(false)
  const MAX_VISIBLE_WORKER_STATS = 10
  const [showAllRecentRuns, setShowAllRecentRuns] = createSignal(false)
  const MAX_VISIBLE_RECENT_RUNS = 10

  const funnel = useQuery(() => ({
    queryKey: ['growth-funnel', props.slug, days()],
    queryFn: async () => {
      try {
        setError(null)
        return await api.growthFunnel(props.slug, days())
      } catch (err) {
        setError(errorMessage(err, 'Failed to load growth funnel'))
        return null
      }
    },
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  // Build funnel stages from the data we have.
  // The agent service provides: communities_discovered, worker_runs, brain_workflows.
  // The CrowdRelay side (outreach targets, posts, clicks, signups, tickets) is
  // fetched separately via the operations read model — but for the agent-service
  // panel we show what we have here. The full funnel page combines both.
  const stages = () => {
    const data = funnel.data
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
    const data = funnel.data
    if (!data) return 0
    return Object.values(data.worker_runs).reduce((sum, r) => sum + r.total, 0)
  }

  const completedWorkerRuns = () => {
    const data = funnel.data
    if (!data) return 0
    return Object.values(data.worker_runs).reduce((sum, r) => sum + r.completed, 0)
  }

  const failedWorkerRuns = () => {
    const data = funnel.data
    if (!data) return 0
    return Object.values(data.worker_runs).reduce((sum, r) => sum + r.failed, 0)
  }

  return <Card class="p-5 growth-funnel-panel">
    <Show when={error()}>
      <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error()}</div>
    </Show>

    {/* Time range selector */}
    <div class="flex flex-wrap gap-3 items-end mb-5">
      <label class="grid gap-1.5 text-muted-foreground text-sm">
        <span>Time range</span>
        <select class="border border-border-strong text-white px-2.5 py-2 rounded-md" value={days()} onChange={(e) => setDays(Number(e.currentTarget.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>All time</option>
        </select>
      </label>
      <Button variant="ghost" size="sm" onClick={() => void funnel.refetch()} disabled={funnel.isFetching}>{funnel.isFetching ? 'Refreshing…' : 'Refresh'}</Button>
    </div>

    {/* Changing the time range swaps the query key. The previous result stays
        on screen (global `placeholderData`) so nothing collapses or jumps; this
        marks it as describing the old range until the new one lands. The
        controls sit outside the region and stay usable. */}
    <div data-refreshing={funnel.isFetching && !funnel.isPending} aria-busy={funnel.isFetching}>

    {/* KPI strip */}
    <Show when={funnel.data} fallback={<Show when={!error()}><SkeletonBlock height="100px" radius="10px" /></Show>}>
      <KpiStrip>
        <KpiCard label="Communities" value={fmt(funnel.data!.communities_discovered)} sub="discovered" />
        <KpiCard label="Worker runs" value={fmt(totalWorkerRuns())} sub={`${completedWorkerRuns()} completed · ${failedWorkerRuns()} failed`} />
        <KpiCard label="Intelligence workflows" value={fmt(funnel.data!.brain_workflows.total)} sub={`${funnel.data!.brain_workflows.by_status.completed ?? 0} completed`} />
      </KpiStrip>
    </Show>

    {/* Funnel visualization */}
    <Show when={funnel.data}>
      <div class="p-4 mt-6 pt-6 border-t border-border">
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-sm font-semibold text-foreground"><FunnelIcon size={18} /> Growth Funnel</h3>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">The fan growth journey from community discovery to conversion.</p>

        {/* Bottleneck highlight */}
        <Show when={bottleneck()}>{(b) => (
          <div class="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning mt-3">
            <strong>Funnel bottleneck: {b().stage.label}</strong>
            <span>Only {b().rate}% progressed to {b().nextStage.label}. {b().stage.value} → {b().nextStage.value}.<br />Consider dispatching more {b().stage.label.toLowerCase()} or reviewing the intelligence's growth intelligence policy.</span>

          </div>
        )}</Show>

        <div class="flex flex-col gap-2.5 mt-4">
          <FunnelChart stages={stages()} />
        </div>
      </div>
    </Show>

    {/* Worker run breakdown */}
    <Show when={funnel.data && Object.keys(funnel.data!.worker_runs).length > 0}>
      <div class="p-4 mt-6 pt-6 border-t border-border">
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-sm font-semibold text-foreground">Worker run breakdown</h3>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">Per-template worker run statistics dispatched by the intelligence.</p>
        <div class="mt-3 overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr><th class="text-left p-2 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">Template</th><th class="text-left p-2 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">Total</th><th class="text-left p-2 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">Completed</th><th class="text-left p-2 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">Failed</th><th class="text-left p-2 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">Running</th><th class="text-left p-2 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">Queued</th><th class="text-left p-2 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">Success rate</th></tr></thead>
            <tbody>
              <For each={showAllWorkerStats() ? Object.entries(funnel.data!.worker_runs) : Object.entries(funnel.data!.worker_runs).slice(0, MAX_VISIBLE_WORKER_STATS)}>{([tpl, stats]) => {
                const successRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : null
                const tone = successRate == null ? 'muted' : successRate >= 90 ? 'good' : successRate >= 75 ? 'warn' : 'bad'
                return (
                  <tr>
                    <td class="p-2 border-b border-border"><strong>{templateLabel(tpl)}</strong></td>
                    <td class="p-2 border-b border-border">{stats.total}</td>
                    <td class="p-2 border-b border-border">{stats.completed}</td>
                    <td class="p-2 border-b border-border">{stats.failed}</td>
                    <td class="p-2 border-b border-border">{stats.running}</td>
                    <td class="p-2 border-b border-border">{stats.queued}</td>
                    <td class="p-2 border-b border-border"><Show when={successRate != null} fallback={<span class="text-muted-foreground">—</span>}>
                      <Badge variant={badgeVariantFor(tone)}>{successRate}%</Badge>
                    </Show></td>
                  </tr>
                )
              }}</For>
            </tbody>
          </table>
        </div>
        <Show when={Object.keys(funnel.data!.worker_runs).length > MAX_VISIBLE_WORKER_STATS}>
          <Button variant="ghost" size="sm" onClick={() => setShowAllWorkerStats(s => !s)}>
            {showAllWorkerStats() ? 'Show less' : `Show all (${Object.keys(funnel.data!.worker_runs).length})`}
          </Button>
        </Show>
      </div>
    </Show>

    {/* Recent worker runs */}
    <Show when={funnel.data && funnel.data!.recent_worker_runs.length > 0}>
      <div class="p-4 mt-6 pt-6 border-t border-border">
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-sm font-semibold text-foreground">Recent worker runs</h3>
          <span class="text-muted-foreground">last {funnel.data!.recent_worker_runs.length}</span>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">The most recent worker runs dispatched by the intelligence.</p>
        <div class="flex flex-col gap-2 mt-3">
          <For each={showAllRecentRuns() ? funnel.data!.recent_worker_runs : funnel.data!.recent_worker_runs.slice(0, MAX_VISIBLE_RECENT_RUNS)}>{(run: FunnelRecentWorkerRun) => (
            <div class="p-3 md:p-4 border border-border rounded-lg bg-surface-3 transition-colors">
              <div class="flex items-center gap-3">
                <strong class="text-sm flex-shrink-0">{templateLabel(run.template_id)}</strong>
                <StatusBadge status={run.status} tone={runStatusTone(run.status)} />
                <span class="ml-auto text-sm text-muted-foreground">{formatIsoAge(run.created_at)}</span>
              </div>
              <div class="flex items-center gap-3 mt-2 text-sm pl-0.5">
                <Show when={run.has_outcome}>
                  <Badge variant="success">outcome: {run.outcome_kind ?? 'structured'}</Badge>
                </Show>
                <Show when={run.tokens_in > 0 || run.tokens_out > 0}>
                  <span class="ml-auto text-muted-foreground">{run.tokens_in} in · {run.tokens_out} out tokens</span>
                </Show>
              </div>
            </div>
          )}</For>
        </div>
        <Show when={funnel.data!.recent_worker_runs.length > MAX_VISIBLE_RECENT_RUNS}>
          <Button variant="ghost" size="sm" onClick={() => setShowAllRecentRuns(s => !s)}>
            {showAllRecentRuns() ? 'Show less' : `Show all (${funnel.data!.recent_worker_runs.length})`}
          </Button>
        </Show>
      </div>
    </Show>

    {/* Empty state */}
    <Show when={funnel.data && funnel.data!.communities_discovered === 0 && totalWorkerRuns() === 0}>
      <EmptyState
        icon={<FunnelIcon size={28} />}
        label="No growth activity in this period"
        hint="Make sure the autopilot is enabled and the growth intelligence policy allows dispatching."
      />
    </Show>
    </div>
  </Card>
}
