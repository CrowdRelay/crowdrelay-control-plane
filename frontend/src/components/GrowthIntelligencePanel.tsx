import { For, Show, createSignal } from 'solid-js'
import { failureLine } from '../lib/errors'
import { policySaveFailureLine } from '../lib/policy-conflict'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { formatIsoAge, formatIsoUntil } from '../lib/format'
import { refreshQueries } from '../lib/refresh'
import { StatusBadge } from './StatusBadge'
import { Dialog } from './Dialog'
import { EmptyState } from './ui/empty-state'
import { SkeletonGrid, SkeletonRows, SkeletonPanel } from './Skeleton'
import { Spinner } from './Spinner'
import { PolicyEditor } from './PolicyEditor'
import { Card } from './app/card'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './app/table'
import { ErrorCard } from './layout'
import type { AutopilotPolicy, PendingAutopilotAction, AgentWorkflow, AgentWorkflowTask } from '../lib/types'
import { CAPABILITY_LABELS, DECISION_KIND_LABELS, labelOr } from '../lib/opportunity-labels'
import { Brain, CircleCheck, CloudOff, Sparkles } from 'lucide-solid'

// --- Intelligence icon (deterministic Rust autopilot) ---
const IntelligenceIcon = (props: { size?: number }) => (
  <Brain size={props.size ?? 18} aria-hidden="true" />
)

const actionKindLabel = (kind: string) => labelOr(DECISION_KIND_LABELS, kind)

const workflowStatusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'completed' ? 'good' :
  status === 'running' || status === 'dispatching' || status === 'planning' ? 'warn' :
  status === 'failed' ? 'bad' : 'muted'

/// Extracts a human-readable summary from a pending action payload.
/// For community engagement requests, shows the subreddit and post title.
/// For agent run requests, shows the template and prompt preview.
const payloadSummary = (action: PendingAutopilotAction): { title: string; detail: string } => {
  const p = action.payload
  if (p.kind === 'community.engage.request') {
    const subreddit = typeof p.subreddit === 'string' ? p.subreddit : '—'
    const title = typeof p.title === 'string' ? p.title : 'Untitled post'
    return { title: `r/${subreddit}`, detail: title }
  }
  if (p.kind === 'agent.run.request') {
    const template = typeof p.template_id === 'string' ? p.template_id : 'agent'
    const prompt = typeof p.prompt === 'string' ? p.prompt : ''
    return { title: `${authState.isPlatformLevel() ? 'Worker' : 'AI job'}: ${template}`, detail: prompt.slice(0, 120) + (prompt.length > 120 ? '…' : '') }
  }
  return { title: actionKindLabel(action.action_kind), detail: '' }
}

export function GrowthIntelligencePanel(props: { slug: string; active?: boolean }) {
  const [error, setError] = createSignal<string | null>(null)
  const [pendingMutation, setPendingMutation] = createSignal(false)
  const [confirming, setConfirming] = createSignal<string | null>(null)
  const [viewingWorkflow, setViewingWorkflow] = createSignal<AgentWorkflow | null>(null)
  const [workflowTasks, setWorkflowTasks] = createSignal<AgentWorkflowTask[]>([])
  const [showAllApprovals, setShowAllApprovals] = createSignal(false)
  const MAX_VISIBLE_APPROVALS = 6
  const [showAllWorkflows, setShowAllWorkflows] = createSignal(false)
  const MAX_VISIBLE_WORKFLOWS = 10
  const [showAllPlan, setShowAllPlan] = createSignal(false)
  const MAX_VISIBLE_PLAN = 10
  const [showAllSubTasks, setShowAllSubTasks] = createSignal(false)
  const MAX_VISIBLE_SUB_TASKS = 10

  const overview = useQuery(() => ({
    queryKey: ['autopilot-overview', props.slug],
    queryFn: () => api.autopilotOverview(props.slug),
    enabled: props.active !== false,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  // The worker runs themselves. `workflows` above reads multi-step plans that
  // nothing writes, so on its own this section said "No AI work yet" while
  // the autopilot dispatched hundreds of runs; the runs are what it did.
  const workerRuns = useQuery(() => ({
    queryKey: ['growth-intelligence-worker-runs', props.slug],
    queryFn: async () => (await api.agentTasks(props.slug, 20)).tasks,
    enabled: props.active !== false,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const workflows = useQuery(() => ({
    queryKey: ['growth-intelligence-workflows', props.slug],
    queryFn: async () => {
      const data = await api.agentWorkflows(props.slug, 20)
      return data.workflows
    },
    enabled: props.active !== false,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const growthPolicy = () => overview.data?.policies.find(p => p.context === 'growth_intelligence') ?? null
  const pendingGrowthActions = () => (overview.data?.needs_you ?? []).filter(a => a.context === 'growth_intelligence')

  const updatePolicy = async (policy: AutopilotPolicy, input: Pick<AutopilotPolicy, 'enabled'|'autonomy_level'|'minimum_confidence'|'max_actions_24h'>) => {
    setPendingMutation(true)
    setError(null)
    try {
      await api.setAutopilotPolicy(props.slug, policy, input)
      refreshQueries(['autopilot-overview', props.slug], ['tenant-brain', props.slug])
    } catch (err) {
      setError(await policySaveFailureLine("Couldn't update the policy", props.slug, policy, input, err))
    } finally {
      setPendingMutation(false)
    }
  }

  const approveAction = async (action: PendingAutopilotAction) => {
    setPendingMutation(true)
    setError(null)
    try {
      await api.approveOpportunityAction(props.slug, action.id)
      setConfirming(null)
      refreshQueries(['autopilot-overview', props.slug], ['growth-intelligence-workflows', props.slug], ['tenant-brain', props.slug], ['tenant-delivery', props.slug])
    } catch (err) {
      setError(failureLine("Couldn't approve the action", err))
    } finally {
      setPendingMutation(false)
    }
  }

  const cancelAction = async (action: PendingAutopilotAction) => {
    setPendingMutation(true)
    setError(null)
    try {
      await api.cancelOpportunityAction(props.slug, action.id)
      setConfirming(null)
      refreshQueries(['autopilot-overview', props.slug], ['growth-intelligence-workflows', props.slug], ['tenant-brain', props.slug])
    } catch (err) {
      setError(failureLine("Couldn't reject the action", err))
    } finally {
      setPendingMutation(false)
    }
  }

  const viewWorkflowDetail = async (wf: AgentWorkflow) => {
    try {
      const data = await api.agentWorkflow(props.slug, wf.id)
      setViewingWorkflow(data.workflow)
      setWorkflowTasks(data.tasks)
    } catch (err) {
      setError(failureLine("Couldn't load the workflow details", err))
    }
  }

  return (
    <div class="border-t border-border pt-6">
      <Show when={error()}>
        <ErrorCard>{error()}</ErrorCard>
      </Show>

      {/* Approval queue — pending growth intelligence actions */}
      <section>
        <div class="flex items-center justify-between gap-4">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-foreground"><IntelligenceIcon size={18} /> {authState.isPlatformLevel() ? 'Approval Queue' : 'Waiting for approval'}</h3>
          <Show when={pendingGrowthActions().length > 0}>
            <span class="text-muted-foreground text-sm flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-warning-solid" />
              {pendingGrowthActions().length} pending
            </span>
          </Show>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">{authState.isPlatformLevel() ? "Actions the intelligence has queued for your approval. Community posts, press pitches, and other growth actions appear here with rich detail before they're executed." : 'Actions it has lined up for your approval. Community posts, press pitches, and other growth work appear here with the full text before anything is sent.'}</p>
        <Show when={overview.error}><ErrorCard title="Couldn't load the growth intelligence overview" error={overview.error} onRetry={() => void overview.refetch()} /></Show>
        <Show when={pendingGrowthActions().length > 0} fallback={
          <Show when={overview.isFetching} fallback={
            <Show when={overview.data} fallback={
              <EmptyState icon={<CloudOff />} label="Couldn't load the overview" hint="This is usually temporary. Try again in a few minutes." />
            }>
              <EmptyState icon={<CircleCheck />} label="No actions awaiting approval" hint={authState.isPlatformLevel() ? 'When the intelligence proposes actions that require human approval, they appear here.' : 'When it proposes actions that need your approval, they appear here.'} />
            </Show>
          }>
            <SkeletonRows count={2} />
          </Show>
        }>
          <div class="flex flex-col gap-2.5 mt-3">
            <For each={showAllApprovals() ? pendingGrowthActions() : pendingGrowthActions().slice(0, MAX_VISIBLE_APPROVALS)}>{(action) => {
              const summary = payloadSummary(action)
              const approveKey = `approve:${action.id}`
              const rejectKey = `reject:${action.id}`
              return (
                <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 p-4 border border-border rounded-lg bg-card">
                  <div class="min-w-0 flex-1 flex flex-col gap-1.5">
                    <div class="flex items-center gap-2 flex-wrap">
                      <Badge>{actionKindLabel(action.action_kind)}</Badge>
                      <strong>{summary.title}</strong>
                      <Show when={action.approval_expires_at}>
                        <span class="text-muted-foreground">lapses {formatIsoUntil(action.approval_expires_at!)}</span>
                      </Show>
                    </div>
                    <Show when={summary.detail}>
                      <p class="m-0 text-sm text-secondary-foreground leading-relaxed">{summary.detail}</p>
                    </Show>
                    <Show when={action.payload.kind === 'community.engage.request'}>
                      <div class="flex flex-col gap-1.5 mt-1">
                        <Show when={(action.payload as Record<string, unknown>).subreddit}>
                          <Badge variant="success">r/{String((action.payload as Record<string, unknown>).subreddit)}</Badge>
                        </Show>
                        <Show when={(action.payload as Record<string, unknown>).body}>
                          <pre class="text-xs text-muted-foreground whitespace-pre-wrap m-0">{String((action.payload as Record<string, unknown>).body)}</pre>
                        </Show>
                      </div>
                    </Show>
                    {/* "Executor not ready — requires capability
                        \"community.engage\"" told the operator two machine
                        words and left them to guess whether approving was safe.
                        Say what is missing and what approving will actually do. */}
                    <Show when={!action.executor_ready && action.required_capability}>
                      <div class="flex flex-col gap-1 rounded-lg border border-warning-solid/30 bg-warning-solid/10 p-4 text-sm text-warning-foreground" title={action.required_capability ?? undefined}>
                        <strong>Nothing can run this yet</strong>
                        <span>{authState.isPlatformLevel()
                          ? <>“{labelOr(CAPABILITY_LABELS, action.required_capability!)}” has no worker running. You can approve it — it will wait in the queue until one starts.</>
                          : <>“{labelOr(CAPABILITY_LABELS, action.required_capability!)}” has nothing running that can do it. You can approve it — it waits until one starts.</>}</span>
                      </div>
                    </Show>
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    <Show when={confirming() === approveKey} fallback={
                      <Show when={confirming() === rejectKey} fallback={
                        <>
                          <Button size="sm" writes disabled={pendingMutation()} onClick={() => setConfirming(approveKey)}>
                            Approve
                          </Button>
                          <Button variant="destructive" size="sm" writes disabled={pendingMutation()} onClick={() => setConfirming(rejectKey)}>
                            Reject
                          </Button>
                        </>
                      }>
                        <Button variant="destructive" size="sm" writes disabled={pendingMutation()} onClick={() => cancelAction(action)}>
                          {pendingMutation() && <Spinner />} {pendingMutation() ? 'Rejecting…' : 'Confirm rejection'}
                        </Button>
                        <Button variant="ghost" size="sm" disabled={pendingMutation()} onClick={() => setConfirming(null)}>Back</Button>
                      </Show>
                    }>
                      <Button size="sm" writes disabled={pendingMutation()} onClick={() => approveAction(action)}>
                        {pendingMutation() && <Spinner />} {pendingMutation() ? 'Approving…' : 'Confirm approval'}
                      </Button>
                      <Button variant="ghost" size="sm" disabled={pendingMutation()} onClick={() => setConfirming(null)}>Cancel</Button>
                    </Show>
                  </div>
                </div>
              )
            }}</For>
          </div>
          <Show when={pendingGrowthActions().length > MAX_VISIBLE_APPROVALS}>
            <Button variant="ghost" size="sm" class="mt-3 w-full" onClick={() => setShowAllApprovals(s => !s)}>
              {showAllApprovals() ? 'Show fewer' : `Show all ${pendingGrowthActions().length}`}
            </Button>
          </Show>
        </Show>
      </section>

      {/* Autonomy controls — growth_intelligence policy */}
      <section class="mt-6 pt-4 border-t border-border">
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-sm font-semibold text-foreground">Autonomy controls</h3>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">How much freedom {authState.isPlatformLevel() ? 'the intelligence has' : 'it has'} to act on what it finds. <strong>Watch</strong> only records the decision, <strong>Suggest</strong> puts it on {authState.isPlatformLevel() ? 'the opportunity board' : 'the decisions board'}, <strong>Ask</strong> queues every action for your sign-off, <strong>Alone</strong> executes without asking. <strong>Min confidence</strong> is the floor an action has to clear before any of that happens, and <strong>Max / 24h</strong> caps how many run in a rolling day. Apply saves the row; {authState.isPlatformLevel() ? 'the next cycle uses it' : 'the next run uses it'}.</p>
        <Show when={growthPolicy()} fallback={
          <Show when={overview.isFetching} fallback={
            <Show when={overview.data} fallback={
              <EmptyState icon={<CloudOff />} label="Couldn't load the policy" hint="This is usually temporary. Try again in a few minutes." />
            }>
              <EmptyState icon={<Brain />} label="No growth intelligence policy" hint={authState.isPlatformLevel() ? 'The growth intelligence policy was not found in the autopilot overview. Ensure the autopilot is configured for this tenant.' : 'No growth policy is set for your act yet.'} />
            </Show>
          }>
            <SkeletonPanel lines={4} />
          </Show>
        }>
          <div class="mt-3">
            <PolicyEditor
              policy={growthPolicy()!}
              pending={pendingMutation()}
              onSave={(input) => updatePolicy(growthPolicy()!, input) as Promise<void>}
            />
          </div>
        </Show>
      </section>

      {/* Brain-dispatched worker runs */}
      <section class="mt-6 pt-4 border-t border-border">
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-sm font-semibold text-foreground">{authState.isPlatformLevel() ? 'Worker runs' : 'AI job runs'}</h3>
          <Show when={overview.data}>
            <span class="text-muted-foreground text-sm flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-success-solid" />
              {overview.data!.succeeded_24h} succeeded · {overview.data!.failed_24h} failed (24h)
            </span>
          </Show>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">{authState.isPlatformLevel() ? 'Each of these is a growth plan the autopilot decided on: what to research, draft or analyse. It then hands the work to an AI worker and records what came back.' : 'Each of these is a growth plan it decided on: what to research, draft or analyse. It then hands the work to an AI worker and records what came back.'}</p>
        <Show when={workflows.error}><ErrorCard title="Couldn't load growth workflows" error={workflows.error} onRetry={() => void workflows.refetch()} /></Show>
        <Show when={workflows.data && workflows.data!.length > 0} fallback={
          <Show when={workflows.data} fallback={<SkeletonGrid count={3} minCardHeight='100px' />}>
            <Show when={(workerRuns.data ?? []).length > 0} fallback={
            <EmptyState icon={<Sparkles />} label="No AI work yet" hint={authState.isPlatformLevel() ? 'When the autopilot decides something needs researching, drafting or analysing, it hands the job to an AI worker and the run appears here.' : 'When it decides something needs researching, drafting or analysing, it hands the job to an AI worker and the run appears here.'} />
            }>
              <Table class="mt-3">
                <TableHeader>
                  <TableRow>
                    <TableHead>Worker</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Why it stopped</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <For each={workerRuns.data!}>{(run) => (
                    <TableRow>
                      <TableCell>{run.template_id.replaceAll('-', ' ')}</TableCell>
                      <TableCell class="whitespace-nowrap">{formatIsoAge(run.created_at)}</TableCell>
                      <TableCell><StatusBadge status={run.status} tone={workflowStatusTone(run.status)} /></TableCell>
                      <TableCell class="text-xs text-muted-foreground">{run.error ? run.error.slice(0, 160) : '—'}</TableCell>
                    </TableRow>
                  )}</For>
                </TableBody>
              </Table>
            </Show>
          </Show>
        }>
          <div class="grid gap-2.5 mt-3">
            <For each={showAllWorkflows() ? workflows.data : workflows.data!.slice(0, MAX_VISIBLE_WORKFLOWS)}>{(wf) => (
              <Button variant="outline" size="sm" class="w-full flex flex-col gap-1.5 items-start text-left h-auto py-3" onClick={() => viewWorkflowDetail(wf)}>
                <div class="flex items-center justify-between gap-2 w-full">
                  <strong>{wf.brain_template}</strong>
                  <StatusBadge status={wf.status} tone={workflowStatusTone(wf.status)} />
                </div>
                <div class="flex items-center gap-2 text-sm">
                  <span class="text-muted-foreground">{formatIsoAge(wf.created_at)}</span>
                  <Show when={wf.plan}>
                    <span class="text-muted-foreground">{wf.plan!.length} sub-tasks</span>
                  </Show>
                </div>
              </Button>
            )}</For>
          </div>
          <Show when={workflows.data!.length > MAX_VISIBLE_WORKFLOWS}>
            <Button variant="ghost" size="sm" class="mt-3 w-full" onClick={() => setShowAllWorkflows(s => !s)}>
              {showAllWorkflows() ? 'Show fewer' : `Show all ${workflows.data!.length}`}
            </Button>
          </Show>
        </Show>
      </section>

      {/* Workflow detail modal */}
      <Dialog
        open={viewingWorkflow() !== null}
        onClose={() => setViewingWorkflow(null)}
        label="Workflow detail"
        class="max-w-2xl"
        footer={<Button variant="ghost" size="sm" onClick={() => setViewingWorkflow(null)}>Close</Button>}
      >
        <>
            <div class="flex flex-wrap gap-4 pb-2 text-sm border-b border-border">
              <span>Brain: {viewingWorkflow()?.brain_template}</span>
              <Show when={viewingWorkflow()?.brain_model}>
                <span>Model: {viewingWorkflow()?.brain_model}</span>
              </Show>
              <StatusBadge status={viewingWorkflow()?.status ?? ''} tone={workflowStatusTone(viewingWorkflow()?.status ?? '')} />
            </div>
            <Show when={viewingWorkflow()?.plan && viewingWorkflow()!.plan!.length > 0}>
              <div class="py-3 border-b border-border">
                <h4 class="text-sm font-semibold text-muted-foreground mb-2">Growth Plan</h4>
                <For each={showAllPlan() ? viewingWorkflow()!.plan : viewingWorkflow()!.plan!.slice(0, MAX_VISIBLE_PLAN)}>{(item, i) => (
                  <Card class="p-4 mb-2">
                    <div class="flex gap-1.5 mb-1">
                      <Badge>#{i() + 1} · {item.template}</Badge>
                      <Badge>priority {item.priority}</Badge>
                    </div>
                    <p class="text-muted-foreground">{item.rationale}</p>
                    <pre class="text-sm text-muted-foreground whitespace-pre-wrap max-h-[200px] overflow-auto mt-1 m-0">{item.prompt}</pre>
                  </Card>
                )}</For>
              </div>
              <Show when={viewingWorkflow()!.plan!.length > MAX_VISIBLE_PLAN}>
                <Button variant="ghost" size="sm" class="mt-3 w-full" onClick={() => setShowAllPlan(s => !s)}>
                  {showAllPlan() ? 'Show fewer' : `Show all ${viewingWorkflow()!.plan!.length}`}
                </Button>
              </Show>
            </Show>
            <Show when={workflowTasks().length > 0}>
              <div class="py-3 border-b border-border">
                <h4 class="text-sm font-semibold text-muted-foreground mb-2">Sub-tasks</h4>
                <Table>
                  <TableHeader><TableRow><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    <For each={showAllSubTasks() ? workflowTasks() : workflowTasks().slice(0, MAX_VISIBLE_SUB_TASKS)}>{(t) => (
                      <TableRow>
                        <TableCell><Badge variant={t.role === 'brain' ? 'success' : 'destructive'}>{t.role}</Badge></TableCell>
                        <TableCell><StatusBadge status={t.task_status} tone={workflowStatusTone(t.task_status)} /></TableCell>
                        <TableCell><Show when={t.task_error}><span class="inline-block rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs text-destructive" title={t.task_error!}>error</span></Show></TableCell>
                      </TableRow>
                    )}</For>
                  </TableBody>
                </Table>
                <Show when={workflowTasks().length > MAX_VISIBLE_SUB_TASKS}>
                  <Button variant="ghost" size="sm" class="mt-3 w-full" onClick={() => setShowAllSubTasks(s => !s)}>
                    {showAllSubTasks() ? 'Show fewer' : `Show all ${workflowTasks().length}`}
                  </Button>
                </Show>
              </div>
            </Show>
        </>
      </Dialog>
    </div>
  )
}
