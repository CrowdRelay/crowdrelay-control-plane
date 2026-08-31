import { For, Show, createEffect, createResource, createSignal } from 'solid-js'
import { api } from '../lib/api'
import { errorMessage, formatIsoAge } from '../lib/format'
import { refreshTick, triggerRefresh } from '../lib/refresh'
import { StatusBadge } from './StatusBadge'
import { Dialog } from './Dialog'
import { EmptyState } from './EmptyState'
import { SkeletonGrid, SkeletonRows, SkeletonPanel } from './Skeleton'
import type { AutopilotOverview, AutopilotPolicy, AutonomyLevel, PendingAutopilotAction, AgentWorkflow, AgentWorkflowTask } from '../lib/types'

// --- Intelligence icon (deterministic Rust autopilot) ---
const IntelligenceIcon = (props: { size?: number }) => (
  <svg width={props.size ?? 18} height={props.size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 7 17a3 3 0 0 0 2 4 3 3 0 0 0 3-3V3a3 3 0 0 0-3 0z" />
    <path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8A3 3 0 0 1 17 17a3 3 0 0 1-2 4 3 3 0 0 1-3-3" opacity="0.5" />
  </svg>
)

const contextLabel = (context: string) => {
  const labels: Record<string, string> = {
    growth_intelligence: 'Growth Intelligence',
    fan_lifecycle: 'Fan Lifecycle',
    ticket_yield: 'Ticket Yield',
    merchandising: 'Merchandising',
    merch_pricing: 'Merch Pricing',
    booking_opportunity: 'Booking',
    promotion_budget: 'Promotion',
    growth_debt: 'Growth Debt',
  }
  return labels[context] ?? context.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

const workflowStatusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'completed' ? 'good' :
  status === 'running' || status === 'dispatching' || status === 'planning' ? 'warn' :
  status === 'failed' ? 'bad' : 'muted'

const actionKindLabel = (kind: string) =>
  kind.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

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
    return { title: `Worker: ${template}`, detail: prompt.slice(0, 120) + (prompt.length > 120 ? '…' : '') }
  }
  return { title: actionKindLabel(action.action_kind), detail: '' }
}

function PolicyEditor(props: {
  policy: AutopilotPolicy
  pending: boolean
  onSave: (input: Pick<AutopilotPolicy, 'enabled'|'autonomy_level'|'minimum_confidence'|'max_actions_24h'>) => Promise<void>
}) {
  const [enabled, setEnabled] = createSignal(props.policy.enabled)
  const [level, setLevel] = createSignal<AutonomyLevel>(props.policy.autonomy_level)
  const [confidence, setConfidence] = createSignal(props.policy.minimum_confidence / 100)
  const [maxActions, setMaxActions] = createSignal(props.policy.max_actions_24h)

  createEffect(() => {
    const policy = props.policy
    setEnabled(policy.enabled)
    setLevel(policy.autonomy_level)
    setConfidence(policy.minimum_confidence / 100)
    setMaxActions(policy.max_actions_24h)
  })

  const confidenceBasisPoints = () => Math.round(Math.max(0, Math.min(100, confidence())) * 100)
  const valid = () => Number.isFinite(confidence()) && confidence() >= 0 && confidence() <= 100 && Number.isInteger(maxActions()) && maxActions() >= 1 && maxActions() <= 1000
  const dirty = () => enabled() !== props.policy.enabled
    || level() !== props.policy.autonomy_level
    || confidenceBasisPoints() !== props.policy.minimum_confidence
    || maxActions() !== props.policy.max_actions_24h
  const guarded = () => props.policy.guarded_until && new Date(props.policy.guarded_until).getTime() > Date.now()

  return <div class="autopilot-policy-row">
    <div class="policy-name">
      <div class="row-health">
        <strong>{contextLabel(props.policy.context)}</strong>
        <Show when={guarded()}><StatusBadge status="guarded" tone="warn" /></Show>
      </div>
      <small>v{props.policy.version}{props.policy.guardrail_reason ? ` · ${props.policy.guardrail_reason}` : ''}</small>
    </div>
    <label class="compact-field policy-enabled">
      <span>Enabled</span>
      <button
        type="button"
        class={`switch-control ${enabled() ? 'on' : ''}`}
        role="switch"
        aria-checked={enabled()}
        aria-label={`${contextLabel(props.policy.context)} enabled`}
        disabled={props.pending}
        onClick={() => setEnabled((current) => !current)}
      ><span /></button>
    </label>
    <label class="compact-field">
      <span>Mode</span>
      <select disabled={props.pending} value={level()} onChange={(event) => setLevel(event.currentTarget.value as AutonomyLevel)}>
        <option value="observe">Observe</option>
        <option value="recommend">Recommend</option>
        <option value="require_approval">Require approval</option>
        <option value="bounded_auto">Bounded auto</option>
      </select>
    </label>
    <label class="compact-field confidence-field">
      <div class="confidence-field-head">
        <span>Min confidence</span>
        <strong>{Math.round(confidence())}%</strong>
      </div>
      <input
        class="confidence-slider"
        disabled={props.pending}
        type="range"
        min="0"
        max="100"
        step="1"
        value={confidence()}
        onInput={(event) => setConfidence(event.currentTarget.valueAsNumber)}
        aria-label={`${contextLabel(props.policy.context)} minimum confidence`}
      />
    </label>
    <label class="compact-field policy-number">
      <span>Max / 24h</span>
      <input disabled={props.pending} type="number" min="1" max="1000" step="1" value={maxActions()} onInput={(event) => setMaxActions(event.currentTarget.valueAsNumber)} />
    </label>
    <button
      class="ghost policy-save"
      disabled={!dirty() || !valid() || props.pending}
      onClick={() => props.onSave({
        enabled: enabled(),
        autonomy_level: level(),
        minimum_confidence: confidenceBasisPoints(),
        max_actions_24h: maxActions(),
      })}
    >{props.pending ? 'Saving…' : 'Apply'}</button>
  </div>
}

export function GrowthIntelligencePanel(props: { slug: string }) {
  const [error, setError] = createSignal<string | null>(null)
  const [pendingMutation, setPendingMutation] = createSignal(false)
  const [confirming, setConfirming] = createSignal<string | null>(null)
  const [viewingWorkflow, setViewingWorkflow] = createSignal<AgentWorkflow | null>(null)
  const [workflowTasks, setWorkflowTasks] = createSignal<AgentWorkflowTask[]>([])

  const refreshSource = () => refreshTick()

  const [overview] = createResource(refreshSource, async () => {
    try {
      return await api.autopilotOverview(props.slug)
    } catch {
      return null
    }
  })

  const [workflows] = createResource(refreshSource, async () => {
    try {
      const data = await api.agentWorkflows(props.slug, 20)
      return data.workflows
    } catch {
      return null
    }
  })

  const growthPolicy = () => overview()?.policies.find(p => p.context === 'growth_intelligence') ?? null
  const pendingGrowthActions = () => (overview()?.needs_you ?? []).filter(a => a.context === 'growth_intelligence')

  const updatePolicy = async (policy: AutopilotPolicy, input: Pick<AutopilotPolicy, 'enabled'|'autonomy_level'|'minimum_confidence'|'max_actions_24h'>) => {
    setPendingMutation(true)
    setError(null)
    try {
      await api.setAutopilotPolicy(props.slug, policy, input)
      triggerRefresh()
    } catch (err) {
      setError(errorMessage(err, 'Failed to update policy'))
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
      triggerRefresh()
    } catch (err) {
      setError(errorMessage(err, 'Failed to approve action'))
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
      triggerRefresh()
    } catch (err) {
      setError(errorMessage(err, 'Failed to reject action'))
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
      setError(errorMessage(err, 'Failed to load workflow detail'))
    }
  }

  return (
    <div class="growth-intelligence-panel">
      <Show when={error()}>
        <div class="error-card">{error()}</div>
      </Show>

      {/* Approval queue — pending growth intelligence actions */}
      <div class="agent-section">
        <div class="agent-section-head">
          <h3><IntelligenceIcon size={18} /> Approval Queue</h3>
          <Show when={pendingGrowthActions().length > 0}>
            <span class="agent-connection-summary">
              <span class="agent-connection-dot warn" />
              {pendingGrowthActions().length} pending
            </span>
          </Show>
        </div>
        <p class="agent-section-intro">Actions the intelligence has queued for your approval. Community posts, press pitches, and other growth actions appear here with rich detail before they're executed.</p>
        <Show when={pendingGrowthActions().length > 0} fallback={
          <Show when={overview.loading} fallback={
            <Show when={overview()} fallback={
              <EmptyState label="Intelligence unavailable" hint="The autopilot overview could not be loaded. This may be a temporary issue." />
            }>
              <EmptyState label="No actions awaiting approval" hint="When the intelligence proposes actions that require human approval, they appear here." />
            </Show>
          }>
            <SkeletonRows count={2} />
          </Show>
        }>
          <div class="growth-approval-list">
            <For each={pendingGrowthActions()}>{(action) => {
              const summary = payloadSummary(action)
              const approveKey = `approve:${action.id}`
              const rejectKey = `reject:${action.id}`
              return (
                <div class="growth-approval-card">
                  <div class="growth-approval-body">
                    <div class="growth-approval-head">
                      <span class="badge">{actionKindLabel(action.action_kind)}</span>
                      <strong>{summary.title}</strong>
                      <Show when={action.approval_expires_at}>
                        <span class="muted">expires {formatIsoAge(action.approval_expires_at!)}</span>
                      </Show>
                    </div>
                    <Show when={summary.detail}>
                      <p class="growth-approval-detail">{summary.detail}</p>
                    </Show>
                    <Show when={action.payload.kind === 'community.engage.request'}>
                      <div class="growth-approval-meta">
                        <Show when={(action.payload as Record<string, unknown>).subreddit}>
                          <span class="badge free-chip">r/{String((action.payload as Record<string, unknown>).subreddit)}</span>
                        </Show>
                        <Show when={(action.payload as Record<string, unknown>).body}>
                          <pre class="growth-approval-body-text">{String((action.payload as Record<string, unknown>).body)}</pre>
                        </Show>
                      </div>
                    </Show>
                    <Show when={!action.executor_ready && action.required_capability}>
                      <div class="warning-card">
                        <strong>Executor not ready</strong>
                        <span>Requires capability "{action.required_capability}" — no live executor advertises it. Approving will queue the action but nothing will execute it.</span>
                      </div>
                    </Show>
                  </div>
                  <div class="growth-approval-actions">
                    <Show when={confirming() === approveKey} fallback={
                      <Show when={confirming() === rejectKey} fallback={
                        <>
                          <button class="primary" disabled={pendingMutation()} onClick={() => setConfirming(approveKey)}>
                            Approve
                          </button>
                          <button class="danger" disabled={pendingMutation()} onClick={() => setConfirming(rejectKey)}>
                            Reject
                          </button>
                        </>
                      }>
                        <button class="confirm-danger" disabled={pendingMutation()} onClick={() => cancelAction(action)}>
                          {pendingMutation() ? 'Rejecting…' : 'Confirm rejection'}
                        </button>
                        <button class="ghost" disabled={pendingMutation()} onClick={() => setConfirming(null)}>Back</button>
                      </Show>
                    }>
                      <button class="confirm-danger" disabled={pendingMutation()} onClick={() => approveAction(action)}>
                        {pendingMutation() ? 'Approving…' : 'Confirm approval'}
                      </button>
                      <button class="ghost" disabled={pendingMutation()} onClick={() => setConfirming(null)}>Cancel</button>
                    </Show>
                  </div>
                </div>
              )
            }}</For>
          </div>
        </Show>
      </div>

      {/* Autonomy controls — growth_intelligence policy */}
      <div class="agent-section">
        <div class="agent-section-head">
          <h3>Autonomy Controls</h3>
        </div>
        <p class="agent-section-intro">Set how much freedom the intelligence has to act on growth intelligence findings. "Require approval" queues every action for your sign-off; "Bounded auto" lets it execute within daily limits.</p>
        <Show when={growthPolicy()} fallback={
          <Show when={overview.loading} fallback={
            <Show when={overview()} fallback={
              <EmptyState label="Policy unavailable" hint="The autopilot overview could not be loaded. This may be a temporary issue." />
            }>
              <EmptyState label="No growth intelligence policy" hint="The growth intelligence policy was not found in the autopilot overview. Ensure the autopilot is configured for this tenant." />
            </Show>
          }>
            <SkeletonPanel lines={4} />
          </Show>
        }>
          <div class="autopilot-policy-list">
            <PolicyEditor
              policy={growthPolicy()!}
              pending={pendingMutation()}
              onSave={(input) => updatePolicy(growthPolicy()!, input) as Promise<void>}
            />
          </div>
        </Show>
      </div>

      {/* Brain-dispatched worker runs */}
      <div class="agent-section">
        <div class="agent-section-head">
          <h3>Worker Runs</h3>
          <Show when={overview()}>
            <span class="agent-connection-summary">
              <span class="agent-connection-dot ok" />
              {overview()!.succeeded_24h} succeeded · {overview()!.failed_24h} failed (24h)
            </span>
          </Show>
        </div>
        <p class="agent-section-intro">Worker runs dispatched by the intelligence. Each workflow is a growth plan: the intelligence decides what to research, draft, or analyse, then dispatches LLM workers to execute.</p>
        <Show when={workflows() && workflows()!.length > 0} fallback={
          <Show when={workflows()} fallback={<SkeletonGrid count={3} minCardHeight='100px' />}>
            <EmptyState label="No worker runs" hint="Worker runs are LLM agent executions dispatched by the intelligence. They appear here once the autopilot starts dispatching." />
          </Show>
        }>
          <div class="growth-workflow-list">
            <For each={workflows()}>{(wf) => (
              <button class="growth-workflow-card" onClick={() => viewWorkflowDetail(wf)}>
                <div class="growth-workflow-head">
                  <strong>{wf.brain_template}</strong>
                  <StatusBadge status={wf.status} tone={workflowStatusTone(wf.status)} />
                </div>
                <div class="growth-workflow-meta">
                  <span class="muted">{formatIsoAge(wf.created_at)}</span>
                  <Show when={wf.plan}>
                    <span class="muted">{wf.plan!.length} sub-tasks</span>
                  </Show>
                </div>
              </button>
            )}</For>
          </div>
        </Show>
      </div>

      {/* Workflow detail modal */}
      <Dialog
        open={viewingWorkflow() !== null}
        onClose={() => setViewingWorkflow(null)}
        label="Workflow detail"
        overlayClass="agent-result-overlay"
        class="agent-result-modal"
      >
        <>
            <div class="agent-result-header">
              <h3>Workflow Detail</h3>
              <button class="link" onClick={() => setViewingWorkflow(null)}>Close</button>
            </div>
            <div class="agent-result-meta">
              <span>Brain: {viewingWorkflow()?.brain_template}</span>
              <Show when={viewingWorkflow()?.brain_model}>
                <span>Model: {viewingWorkflow()?.brain_model}</span>
              </Show>
              <StatusBadge status={viewingWorkflow()?.status ?? ''} tone={workflowStatusTone(viewingWorkflow()?.status ?? '')} />
            </div>
            <Show when={viewingWorkflow()?.plan && viewingWorkflow()!.plan!.length > 0}>
              <div class="agent-outcomes">
                <h4>Growth Plan</h4>
                <For each={viewingWorkflow()!.plan}>{(item, i) => (
                  <div class="agent-outcome-card">
                    <div class="agent-outcome-head">
                      <span class="badge">#{i() + 1} · {item.template}</span>
                      <span class="badge">priority {item.priority}</span>
                    </div>
                    <p class="muted">{item.rationale}</p>
                    <pre class="agent-outcome-item">{item.prompt}</pre>
                  </div>
                )}</For>
              </div>
            </Show>
            <Show when={workflowTasks().length > 0}>
              <div class="agent-outcomes">
                <h4>Sub-tasks</h4>
                <table class="agent-task-table">
                  <thead><tr><th>Slot</th><th>Role</th><th>Template</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    <For each={workflowTasks()}>{(t) => (
                      <tr>
                        <td>{t.slot}</td>
                        <td><span class={`badge ${t.role === 'brain' ? 'free-chip' : 'paid-chip'}`}>{t.role}</span></td>
                        <td>{t.task_template_id}</td>
                        <td><StatusBadge status={t.task_status} tone={workflowStatusTone(t.task_status)} /></td>
                        <td><Show when={t.task_error}><span class="agent-error" title={t.task_error!}>error</span></Show></td>
                      </tr>
                    )}</For>
                  </tbody>
                </table>
              </div>
            </Show>
        </>
      </Dialog>
    </div>
  )
}
