import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { errorMessage, formatIsoAge, relativeTime } from '../lib/format'
import { StatusBadge } from './StatusBadge'
import { FunnelChart } from './FunnelChart'
import { EmptyState } from './ui/empty-state'
import { SkeletonBlock, SkeletonRows } from './Skeleton'
import { KpiStrip, KpiCard, ErrorCard } from './layout'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'
import type { GrowthFunnelData, FunnelRecentWorkerRun } from '../lib/types'
import { NativeSelect } from './ui/native-select'

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
        setError(errorMessage(err, 'We couldn\'t load the growth metrics. Try refreshing.'))
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

  return <Card flat class="p-5">
    <Show when={error()}>
      <ErrorCard>{error()}</ErrorCard>
    </Show>

    {/* Time range selector */}
    <div class="mb-5 flex flex-wrap items-end gap-3">
      <label class="grid gap-1.5">
        <span class="text-sm font-medium leading-none text-foreground">Time range</span>
        <NativeSelect class="w-auto" value={days()} onChange={(e) => setDays(Number(e.currentTarget.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>All time</option>
        </NativeSelect>
      </label>
      <Button variant="ghost" size="sm" onClick={() => void funnel.refetch()} disabled={funnel.isFetching}>{funnel.isFetching ? 'Refreshing…' : 'Refresh'}</Button>
    </div>

    {/* Changing the time range swaps the query key. The previous result stays
        on screen (global `placeholderData`) so nothing collapses or jumps; this
        marks it as describing the old range until the new one lands. The
        controls sit outside the region and stay usable. */}
    <div data-refreshing={funnel.isFetching && !funnel.isPending} aria-busy={funnel.isFetching}>

    {/* KPI strip — skeleton only for the data values, not the whole panel */}
    <Show when={funnel.data} fallback={<Show when={!error()}><KpiStrip><KpiCard label="Communities" value="—" sub="discovered" /><KpiCard label="Worker runs" value="—" sub="loading…" /><KpiCard label="Intelligence workflows" value="—" sub="loading…" /></KpiStrip></Show>}>
      <KpiStrip>
        <KpiCard label="Communities" value={fmt(funnel.data!.communities_discovered)} sub="discovered" />
        <KpiCard label="Worker runs" value={fmt(totalWorkerRuns())} sub={`${completedWorkerRuns()} completed · ${failedWorkerRuns()} failed`} />
        <KpiCard label="Intelligence workflows" value={fmt(funnel.data!.brain_workflows.total)} sub={`${funnel.data!.brain_workflows.by_status.completed ?? 0} completed`} />
      </KpiStrip>
    </Show>

    {/* Funnel visualization — header is static, chart waits for data */}
    <div class="mt-6 border-t border-border pt-5">
      <div class="flex items-center justify-between gap-4">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-foreground"><span class="text-muted-foreground"><FunnelIcon size={18} /></span>Growth metrics</h3>
        <Show when={funnel.dataUpdatedAt}><span class="text-xs text-muted-foreground">Updated {relativeTime(funnel.dataUpdatedAt)}</span></Show>
      </div>
      <p class="mt-1 text-sm text-muted-foreground">The fan growth journey from community discovery to conversion.</p>

      <Show when={funnel.data}>
        {/* Bottleneck highlight */}
        <Show when={bottleneck()}>{(b) => (
          <div class="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning mt-3">
            <strong>Funnel bottleneck: {b().stage.label}</strong><br />
            <span>Only {b().rate}% progressed to {b().nextStage.label}. {b().stage.value} → {b().nextStage.value}.<br />Consider dispatching more {b().stage.label.toLowerCase()} or reviewing the intelligence's growth intelligence policy.</span>
          </div>
        )}</Show>
      </Show>

      <div class="flex flex-col items-center gap-2.5 mt-4">
        <Show when={funnel.data} fallback={<Show when={!error()}><div class="max-w-[480px] w-full"><SkeletonBlock height="280px" radius="10px" /></div></Show>}>
          <FunnelChart stages={stages()} />
        </Show>
      </div>
    </div>

    {/* Worker run breakdown */}
    <Show when={funnel.data && Object.keys(funnel.data!.worker_runs).length > 0}>
      <div class="mt-6 border-t border-border pt-5">
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-sm font-semibold text-foreground">Worker run breakdown</h3>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">Per-template worker run statistics dispatched by the intelligence.</p>
        <div class="mt-3">
          <Table>
            <TableHeader><TableRow><TableHead>Template</TableHead><TableHead class="text-right">Total</TableHead><TableHead class="text-right">Completed</TableHead><TableHead class="text-right">Failed</TableHead><TableHead class="text-right">Running</TableHead><TableHead class="text-right">Queued</TableHead><TableHead>Success rate</TableHead></TableRow></TableHeader>
            <TableBody>
              <For each={showAllWorkerStats() ? Object.entries(funnel.data!.worker_runs) : Object.entries(funnel.data!.worker_runs).slice(0, MAX_VISIBLE_WORKER_STATS)}>{([tpl, stats]) => {
                const successRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : null
                const tone = successRate == null ? 'muted' : successRate >= 90 ? 'good' : successRate >= 75 ? 'warn' : 'bad'
                return (
                  <TableRow>
                    <TableCell><strong>{templateLabel(tpl)}</strong></TableCell>
                    <TableCell numeric>{stats.total}</TableCell>
                    <TableCell numeric>{stats.completed}</TableCell>
                    <TableCell numeric>{stats.failed}</TableCell>
                    <TableCell numeric>{stats.running}</TableCell>
                    <TableCell numeric>{stats.queued}</TableCell>
                    <TableCell><Show when={successRate != null} fallback={<span class="text-muted-foreground">—</span>}>
                      <Badge variant={badgeVariantFor(tone)}>{successRate}%</Badge>
                    </Show></TableCell>
                  </TableRow>
                )
              }}</For>
            </TableBody>
          </Table>
        </div>
        <Show when={Object.keys(funnel.data!.worker_runs).length > MAX_VISIBLE_WORKER_STATS}>
          <Button variant="ghost" size="sm" onClick={() => setShowAllWorkerStats(s => !s)}>
            {showAllWorkerStats() ? 'Show fewer' : `Show all ${Object.keys(funnel.data!.worker_runs).length}`}
          </Button>
        </Show>
      </div>
    </Show>

    {/* Recent worker runs */}
    <Show when={funnel.data && funnel.data!.recent_worker_runs.length > 0}>
      <div class="mt-6 border-t border-border pt-5">
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-sm font-semibold text-foreground">Recent worker runs</h3>
          <span class="text-muted-foreground">last {funnel.data!.recent_worker_runs.length}</span>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">The most recent worker runs dispatched by the intelligence.</p>
        {/* A stack of bordered boxes, each holding two rows of a four-field
            record, directly under a table of the same records aggregated.
            Same shape, same table. */}
        <div class="mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead class="text-right">Tokens</TableHead>
                <TableHead class="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <For each={showAllRecentRuns() ? funnel.data!.recent_worker_runs : funnel.data!.recent_worker_runs.slice(0, MAX_VISIBLE_RECENT_RUNS)}>{(run: FunnelRecentWorkerRun) => (
                <TableRow>
                  <TableCell><strong>{templateLabel(run.template_id)}</strong></TableCell>
                  <TableCell><StatusBadge status={run.status} tone={runStatusTone(run.status)} /></TableCell>
                  <TableCell>
                    <Show when={run.has_outcome} fallback={<span class="text-muted-foreground">—</span>}>
                      <Badge variant="success">{run.outcome_kind ?? 'structured'}</Badge>
                    </Show>
                  </TableCell>
                  <TableCell numeric class="text-muted-foreground">
                    <Show when={run.tokens_in > 0 || run.tokens_out > 0} fallback="—">
                      {run.tokens_in} in · {run.tokens_out} out
                    </Show>
                  </TableCell>
                  <TableCell numeric class="text-muted-foreground">{formatIsoAge(run.created_at)}</TableCell>
                </TableRow>
              )}</For>
            </TableBody>
          </Table>
        </div>
        <Show when={funnel.data!.recent_worker_runs.length > MAX_VISIBLE_RECENT_RUNS}>
          <Button variant="ghost" size="sm" onClick={() => setShowAllRecentRuns(s => !s)}>
            {showAllRecentRuns() ? 'Show fewer' : `Show all ${funnel.data!.recent_worker_runs.length}`}
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
