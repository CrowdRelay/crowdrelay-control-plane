import { For, Show, createSignal } from 'solid-js'
import { failureLine } from '../lib/errors'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { formatIsoAge, relativeTime } from '../lib/format'
import { StatusBadge } from './StatusBadge'
import { FunnelChart } from './FunnelChart'
import { EmptyState } from './ui/empty-state'
import { SkeletonBlock } from './Skeleton'
import { ErrorCard, KpiCard, KpiStrip, Section } from './layout'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './app/table'
import type { FunnelRecentWorkerRun } from '../lib/types'
import { NativeSelect } from './ui/native-select'
import { Funnel } from 'lucide-solid'

const fmt = (n: number | null | undefined): string =>
  n == null ? '—' : n.toLocaleString('en-US')

// --- Funnel icon ---
const FunnelIcon = (props: { size?: number }) => (
  <Funnel size={props.size ?? 18} aria-hidden="true" />
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
        setError(failureLine("Couldn't load growth metrics", err))
        return null
      }
    },
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // Keep the previous range on screen while a new one loads — but only when
    // it belongs to *this* tenant. A tenant switch must never paint the last
    // tenant's funnel under the new slug.
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey?.[1] === props.slug ? prev : undefined,
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
    const platform = authState.isPlatformLevel()
    return [
      { label: 'Communities Discovered', value: data.communities_discovered, hint: platform ? 'Reddit subreddits found by scraper' : 'Subreddits the scanner found' },
      { label: 'Scanner Runs', value: scannerRuns, hint: platform ? 'Intelligence-dispatched reddit-scanner workers' : 'Reddit-scan jobs the brain sent out' },
      { label: 'Engager Runs', value: engagerRuns, hint: platform ? 'Intelligence-dispatched community-engager workers' : 'Community-engagement jobs the brain sent out' },
      { label: 'Inviter Runs', value: inviterRuns, hint: platform ? 'Intelligence-dispatched signal-inviter workers' : 'Signal-invite jobs the brain sent out' },
      // No "Brain Workflows" stage: `agent_service_workflows` is written by
      // nothing, so the stage was always 0 and, as the funnel's last step,
      // the bottleneck finder named it the operator's bottleneck.
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

  return <Section
    title="Agent growth pipeline"
    icon={<span class="text-muted-foreground"><FunnelIcon size={18} /></span>}
    description="The operational path from discovered communities through the agent jobs that act on them. Fan conversion outcomes live in the acquisition and attribution panels."
    action={<Show when={funnel.dataUpdatedAt}><span class="text-xs text-muted-foreground">Updated {relativeTime(funnel.dataUpdatedAt)}</span></Show>}
  >
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
      <Button variant="outline" size="sm" onClick={() => void funnel.refetch()} disabled={funnel.isFetching}>{funnel.isFetching ? 'Refreshing…' : 'Refresh'}</Button>
    </div>

    {/* Changing the time range swaps the query key. The previous result stays
        on screen (global `placeholderData`) so nothing collapses or jumps; this
        marks it as describing the old range until the new one lands. The
        controls sit outside the region and stay usable. */}
    <div data-refreshing={funnel.isFetching && !funnel.isPending} aria-busy={funnel.isFetching}>

    {/* KPI strip — skeleton only for the data values, not the whole panel */}
    <Show when={funnel.data} fallback={<Show when={!error()}><KpiStrip><KpiCard label="Communities" value="—" sub="discovered" /><KpiCard label={authState.isPlatformLevel() ? 'Worker runs' : 'AI jobs'} value="—" sub="loading…" /></KpiStrip></Show>}>
      <KpiStrip>
        <KpiCard label="Communities" value={fmt(funnel.data!.communities_discovered)} sub="discovered" />
        <KpiCard label={authState.isPlatformLevel() ? 'Worker runs' : 'AI jobs'} value={fmt(totalWorkerRuns())} sub={`${completedWorkerRuns()} completed · ${failedWorkerRuns()} failed`} />
      </KpiStrip>
    </Show>

    {/* Funnel visualization — chart waits for data */}
    <div class="mt-6">
      <Show when={funnel.data}>
        {/* Bottleneck highlight */}
        <Show when={bottleneck()}>{(b) => (
          <div class="rounded-lg border border-warning-foreground/30 bg-warning-foreground/10 p-4 text-sm text-warning-foreground mt-3">
            <strong>Pipeline bottleneck: {b().stage.label}</strong><br />
            <span>Only {b().rate}% progressed to {b().nextStage.label}. {b().stage.value} → {b().nextStage.value}.<br />{authState.isPlatformLevel() ? <>Consider dispatching more {b().stage.label.toLowerCase()} or reviewing the intelligence's growth intelligence policy.</> : <>Consider running more {b().stage.label.toLowerCase()} or reviewing what the brain may do.</>}</span>
          </div>
        )}</Show>
      </Show>

      <div class="flex flex-col items-center gap-2.5 mt-4">
        <Show when={funnel.data} fallback={<Show when={!error()}><div class="max-w-[480px] w-full"><SkeletonBlock height="280px" /></div></Show>}>
          <FunnelChart stages={stages()} />
        </Show>
      </div>
    </div>

    {/* Worker run breakdown */}
    <Show when={funnel.data && Object.keys(funnel.data!.worker_runs).length > 0}>
      <div class="mt-6 border-t border-border pt-5">
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-sm font-semibold text-foreground">{authState.isPlatformLevel() ? 'Worker run breakdown' : 'AI job breakdown'}</h3>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">{authState.isPlatformLevel() ? 'Per-template worker run statistics dispatched by the intelligence.' : 'Per-job AI work the brain handed out.'}</p>
        <div class="mt-3">
          <Table>
            <TableHeader><TableRow><TableHead>{authState.isPlatformLevel() ? 'Template' : 'Job'}</TableHead><TableHead class="text-right">Total</TableHead><TableHead class="text-right">Completed</TableHead><TableHead class="text-right">Failed</TableHead><TableHead class="text-right">Running</TableHead><TableHead class="text-right">{authState.isPlatformLevel() ? 'Queued' : 'Waiting'}</TableHead><TableHead>Success rate</TableHead></TableRow></TableHeader>
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
          <h3 class="text-sm font-semibold text-foreground">{authState.isPlatformLevel() ? 'Recent worker runs' : 'Recent AI jobs'}</h3>
          <span class="text-muted-foreground">last {funnel.data!.recent_worker_runs.length}</span>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">{authState.isPlatformLevel() ? 'The most recent worker runs dispatched by the intelligence.' : 'The most recent AI jobs the brain handed out.'}</p>
        {/* A stack of bordered boxes, each holding two rows of a four-field
            record, directly under a table of the same records aggregated.
            Same shape, same table. */}
        <div class="mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{authState.isPlatformLevel() ? 'Template' : 'Job'}</TableHead>
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
        hint={authState.isPlatformLevel() ? 'Make sure the autopilot is enabled and the growth intelligence policy allows dispatching.' : 'Make sure automated work is switched on and the growth rules let it hand out work.'}
      />
    </Show>
    </div>
  </Section>
}
