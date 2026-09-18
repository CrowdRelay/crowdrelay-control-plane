import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { errorMessage, formatIsoAge } from '../lib/format'
import { StatusBadge } from './StatusBadge'
import { EmptyState } from './ui/empty-state'
import { ErrorCard, KpiCard, KpiStrip, Section } from './layout'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './app/table'
import type { IntelligenceDecision, IntelligenceDecisionTask } from '../lib/types'
import { NativeSelect } from './ui/native-select'
import { Brain, ChevronDown } from 'lucide-solid'

// --- Intelligence icon (deterministic Rust autopilot) ---
const IntelligenceIcon = (props: { size?: number }) => (
  <Brain size={props.size ?? 18} aria-hidden="true" />
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

const toneToBadgeVariant = (tone: 'good' | 'warn' | 'bad' | 'muted'): 'success' | 'warning' | 'destructive' | 'muted' =>
  tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : tone === 'bad' ? 'destructive' : 'muted'

export function IntelligenceTransparencyPanel(props: { slug: string; active?: boolean }) {
  const [error, setError] = createSignal<string | null>(null)
  const [expanded, setExpanded] = createSignal<string | null>(null)
  const [days, setDays] = createSignal(30)
  const [showAllDecisions, setShowAllDecisions] = createSignal(false)
  const MAX_VISIBLE_DECISIONS = 10
  const [expandedPlans, setExpandedPlans] = createSignal<Set<string>>(new Set())
  const MAX_VISIBLE_PLAN = 10
  const [expandedTasks, setExpandedTasks] = createSignal<Set<string>>(new Set())
  const MAX_VISIBLE_TASKS = 10

  const togglePlan = (id: string) => {
    setExpandedPlans((curr) => {
      const next = new Set(curr)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleTasks = (id: string) => {
    setExpandedTasks((curr) => {
      const next = new Set(curr)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const data = useQuery(() => ({
    queryKey: ['intelligence-transparency', props.slug, days()],
    queryFn: async () => {
      try {
        setError(null)
        return await api.intelligenceDecisions(props.slug, 30, days())
      } catch (err) {
        setError(errorMessage(err, 'Failed to load intelligence decisions'))
        return null
      }
    },
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const summary = () => data.data?.summary
  const decisions = () => data.data?.decisions ?? []

  const toggleExpand = (id: string) => {
    setExpanded((curr) => (curr === id ? null : id))
  }

  return <Section
    flush
    title="Decision timeline"
    icon={<IntelligenceIcon size={18} />}
    count={decisions().length}
    description={authState.isPlatformLevel() ? 'Every decision the autopilot reached: what it decided, why, and what workers found.' : 'Every decision it reached: what it decided, why, and what workers found.'}
    class="flex flex-col gap-4"
  >
    <Show when={error()}>
      <ErrorCard>{error()}</ErrorCard>
    </Show>

    {/* Time range selector */}
    <div class="flex flex-wrap gap-3 items-end">
      <label class="grid gap-1.5 text-muted-foreground text-sm">
        <span>Time range</span>
        <NativeSelect value={days()} onChange={(e) => setDays(Number(e.currentTarget.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>All time</option>
        </NativeSelect>
      </label>
      <Button variant="outline" size="sm" onClick={() => void data.refetch()} disabled={data.isFetching}>{data.isFetching ? 'Refreshing…' : 'Refresh'}</Button>
    </div>

    {/* Same as the funnel: the range selector changes the query key, the old
        result stays put, and this says so without moving anything. */}
    <div data-refreshing={data.isFetching && !data.isPending} aria-busy={data.isFetching}>

    {/* Summary KPIs */}
    <Show when={summary()} fallback={
      <Show when={!error()} fallback={
        <KpiStrip>
          <KpiCard label={authState.isPlatformLevel() ? 'Intelligence decisions' : 'Decisions'} value="—" />
          <KpiCard label="Running" value="—" />
          <KpiCard label={authState.isPlatformLevel() ? 'Worker tasks' : 'AI jobs'} value="—" />
        </KpiStrip>
      }>
        <KpiStrip>
          <KpiCard label="" value="" class="overflow-hidden" />
          <KpiCard label="" value="" class="overflow-hidden" />
          <KpiCard label="" value="" class="overflow-hidden" />
        </KpiStrip>
      </Show>
    }>
      <KpiStrip>
        <KpiCard label={authState.isPlatformLevel() ? 'Intelligence decisions' : 'Decisions'} value={summary()!.total_decisions} sub={`${summary()!.completed_decisions} completed · ${summary()!.failed_decisions} failed`} />
        <KpiCard label="Running" value={summary()!.running_decisions} sub="in progress now" />
        <KpiCard label={authState.isPlatformLevel() ? 'Worker tasks' : 'AI jobs'} value={summary()!.total_tasks} sub={`${summary()!.completed_tasks} completed`} />
      </KpiStrip>
    </Show>

    {/* Decision timeline */}
    <div class="mt-4">

      <Show when={data.data && decisions().length === 0} fallback={
        <Show when={error()} fallback={
          <Show when={data.data} fallback={
            <div class="flex flex-col gap-2.5 mt-4">
              {Array.from({ length: 3 }, () => (
                <div class="p-4 rounded-lg border border-border">
                  <div class="rounded-lg bg-muted border border-border h-5 w-2/5 mb-3" />
                  <div class="rounded-lg bg-muted border border-border h-[14px] w-full mb-2" />
                  <div class="rounded-lg bg-muted border border-border h-[14px] w-4/5" />
                </div>
              ))}
            </div>
          }>
            <div class="flex flex-col gap-2.5 mt-4">
              <For each={showAllDecisions() ? decisions() : decisions().slice(0, MAX_VISIBLE_DECISIONS)}>{(decision: IntelligenceDecision) => (
                <div class="rounded-lg border border-border transition-colors hover:border-input">
                  <Button variant="ghost" size="sm" class="w-full h-auto p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3" onClick={() => toggleExpand(decision.id)}>
                    <div class="flex items-center gap-2.5">
                      <strong>{templateLabel(decision.brain_template)}</strong>
                      <span class="text-muted-foreground">{formatIsoAge(decision.created_at)}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <StatusBadge status={decision.status} tone={decisionStatusTone(decision.status)} />
                      <Show when={decision.plan.length > 0}>
                        <Badge>{decision.plan.length} plan items</Badge>
                      </Show>
                      <Show when={decision.tasks.length > 0}>
                        <Badge>{decision.tasks.length} {authState.isPlatformLevel() ? 'workers' : 'AI jobs'}</Badge>
                      </Show>
                      <ChevronDown size={14} class="transition-transform" classList={{ 'rotate-180': expanded() === decision.id }} aria-hidden="true" />
                    </div>
                  </Button>

                  {/* Quick summary (always visible) */}
                  <div class="px-4 pb-2.5">
                    <Show when={decision.plan.length > 0}>
                      <p class="m-0 text-sm text-secondary-foreground leading-relaxed">
                        <Show when={decision.plan[0]?.rationale != null} fallback={<span class="text-muted-foreground">No rationale recorded</span>}>
                          {decision.plan[0]!.rationale}
                        </Show>
                      </p>
                    </Show>
                  </div>

                  {/* Expanded detail */}
                  <Show when={expanded() === decision.id}>
                    <div class="px-4 pb-4 border-t border-border">
                      {/* Plan items (the intelligence's reasoning) */}
                      <Show when={decision.plan.length > 0}>
                        <div class="mt-4">
                          <h4 class="text-sm font-semibold text-foreground m-0 mb-1.5">Growth Plan</h4>
                          <p class="text-sm text-muted-foreground m-0 mb-2.5">{authState.isPlatformLevel() ? 'The deterministic plan — each item shows the template, priority, and rationale.' : 'The plan — each item shows the job, its priority, and the reason.'}</p>
                          <For each={expandedPlans().has(decision.id) ? decision.plan : decision.plan.slice(0, MAX_VISIBLE_PLAN)}>{(item, i) => (
                            <div class="p-3 border border-border rounded-lg bg-muted mb-2">
                              <div class="flex gap-2 items-center mb-1.5">
                                <Badge>#{i() + 1} · {templateLabel(item.template)}</Badge>
                                <Badge variant="success">priority {item.priority}</Badge>
                              </div>
                              <p class="text-sm m-0 mb-1.5 leading-relaxed text-foreground"><strong>Why:</strong> {item.rationale}</p>
                              <pre class="text-sm text-muted-foreground bg-background p-2 rounded-lg overflow-auto max-h-[120px] m-0 whitespace-pre-wrap">{item.prompt}</pre>
                            </div>
                          )}</For>
                        </div>
                        <Show when={decision.plan.length > MAX_VISIBLE_PLAN}>
                          <Button variant="ghost" size="sm" class="mt-2" onClick={() => togglePlan(decision.id)}>
                            {expandedPlans().has(decision.id) ? 'Show fewer' : `Show all ${decision.plan.length}`}
                          </Button>
                        </Show>
                      </Show>

                      {/* Dispatched worker tasks */}
                      <Show when={decision.tasks.length > 0}>
                        <div class="mt-4">
                          <h4 class="text-sm font-semibold text-foreground m-0 mb-1.5">{authState.isPlatformLevel() ? 'Dispatched Workers' : 'AI jobs sent out'}</h4>
                          <p class="text-sm text-muted-foreground m-0 mb-2.5">{authState.isPlatformLevel() ? 'The AI jobs this plan handed out. Each one returns a result the autopilot reads back before it decides anything else.' : 'The AI jobs this plan handed out. Each one returns a result it reads back before deciding anything else.'}</p>
                          <Table>
                            <TableHeader><TableRow><TableHead>Slot</TableHead><TableHead>Role</TableHead><TableHead>{authState.isPlatformLevel() ? 'Template' : 'Job'}</TableHead><TableHead>Status</TableHead><TableHead>Outcome</TableHead><TableHead>Tokens</TableHead><TableHead></TableHead></TableRow></TableHeader>
                            <TableBody>
                              <For each={expandedTasks().has(decision.id) ? decision.tasks : decision.tasks.slice(0, MAX_VISIBLE_TASKS)}>{(task: IntelligenceDecisionTask) => (
                                <TableRow>
                                  <TableCell>{String(task.slot).replace(/_/g, ' ')}</TableCell>
                                  <TableCell><Badge variant={task.role === 'brain' ? 'success' : 'warning'}>{authState.isPlatformLevel() ? task.role : (task.role === 'brain' ? 'brain' : 'AI job')}</Badge></TableCell>
                                  <TableCell>{templateLabel(task.template_id)}</TableCell>
                                  <TableCell><StatusBadge status={task.status} tone={taskStatusTone(task.status)} /></TableCell>
                                  <TableCell>
                                    <Show when={task.has_outcome} fallback={<span class="text-muted-foreground">—</span>}>
                                      <Badge variant="success">{task.outcome_kind ?? 'structured'}</Badge>
                                    </Show>
                                  </TableCell>
                                  <TableCell class="text-muted-foreground">{task.tokens_in > 0 || task.tokens_out > 0 ? `${task.tokens_in}/${task.tokens_out}` : '—'}</TableCell>
                                  <TableCell><Show when={task.error}><span class="inline-flex items-center rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive" title={task.error!}>error</span></Show></TableCell>
                                </TableRow>
                              )}</For>
                            </TableBody>
                          </Table>
                          <Show when={decision.tasks.length > MAX_VISIBLE_TASKS}>
                            <Button variant="ghost" size="sm" class="mt-2" onClick={() => toggleTasks(decision.id)}>
                              {expandedTasks().has(decision.id) ? 'Show fewer' : `Show all ${decision.tasks.length}`}
                            </Button>
                          </Show>
                        </div>
                      </Show>

                      {/* Decision chain visualization */}
                      <div class="mt-4">
                        <h4 class="text-sm font-semibold text-foreground m-0 mb-1.5">{authState.isPlatformLevel() ? 'Decision Chain' : 'How it ran'}</h4>
                        <div class="flex flex-col gap-1 mt-2">
                          <div class="flex items-center gap-2.5 py-1.5">
                            <Badge variant="success">{authState.isPlatformLevel() ? 'Intelligence decides' : 'The brain decides'}</Badge>
                            <span class="text-muted-foreground">{templateLabel(decision.brain_template)}</span>
                          </div>
                          <Show when={decision.plan.length > 0}>
                            <div class="text-muted-foreground text-sm pl-1.5">↓</div>
                            <div class="flex items-center gap-2.5 py-1.5">
                              <Badge>Plan</Badge>
                              <span class="text-muted-foreground">{decision.plan.length} items with rationale</span>
                            </div>
                          </Show>
                          <Show when={decision.tasks.length > 0}>
                            <div class="text-muted-foreground text-sm pl-1.5">↓</div>
                            <div class="flex items-center gap-2.5 py-1.5">
                              <Badge>{authState.isPlatformLevel() ? 'Workers dispatched' : 'Jobs sent out'}</Badge>
                              <span class="text-muted-foreground">{decision.tasks.length} {authState.isPlatformLevel() ? 'LLM tasks' : 'AI jobs'}</span>
                            </div>
                          </Show>
                          <Show when={decision.tasks.some(t => t.has_outcome)}>
                            <div class="text-muted-foreground text-sm pl-1.5">↓</div>
                            <div class="flex items-center gap-2.5 py-1.5">
                              <Badge>{authState.isPlatformLevel() ? 'Outcomes emitted' : 'Results back'}</Badge>
                              <span class="text-muted-foreground">{decision.tasks.filter(t => t.has_outcome).length} {authState.isPlatformLevel() ? 'structured results' : 'results'}</span>
                            </div>
                          </Show>
                          <div class="text-muted-foreground text-sm pl-1.5">↓</div>
                          <div class="flex items-center gap-2.5 py-1.5">
                            <Badge variant={toneToBadgeVariant(decisionStatusTone(decision.status))}>{decision.status}</Badge>
                            <span class="text-muted-foreground">
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
            <Show when={decisions().length > MAX_VISIBLE_DECISIONS}>
              <Button variant="ghost" size="sm" class="mt-2" onClick={() => setShowAllDecisions(s => !s)}>
                {showAllDecisions() ? 'Show fewer' : `Show all ${decisions().length}`}
              </Button>
            </Show>
          </Show>
        }>
          <div class="p-4"><EmptyState label="Intelligence data unavailable" hint={error()!} /></div>
        </Show>
      }>
        <div class="p-4">
          <EmptyState label="No intelligence decisions" hint={authState.isPlatformLevel() ? 'Decisions appear here once the deterministic autopilot starts running.' : 'Decisions appear here once it starts running.'} />
        </div>
      </Show>
    </div>
    </div>
  </Section>
}
