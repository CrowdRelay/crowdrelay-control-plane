import { For, Show, createEffect, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api, request, ApiError } from '../lib/api'
import { errorMessage, formatIsoAge } from '../lib/format'
import { refreshQueries } from '../lib/refresh'
import { StatusBadge } from './StatusBadge'
import { Dialog } from './Dialog'
import { TabBar, TabPanel, useTabPanels } from './layout'
import { AgentProvidersPanel } from './AgentProvidersPanel'
import { AIUsagePanel } from './AIUsagePanel'
import { IntelligenceTransparencyPanel } from './IntelligenceTransparencyPanel'
import { EmptyState } from './EmptyState'
import { SkeletonGrid, SkeletonRows } from './Skeleton'
import type { AgentTaskResult, TaskSuggestion, AgentOutcome } from '../lib/types'

// --- Ant icon (agent service mascot) ---
const AntIcon = (props: { size?: number }) => (
  <svg width={props.size ?? 18} height={props.size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <ellipse cx="12" cy="8" rx="3" ry="2.5" />
    <ellipse cx="12" cy="13" rx="2.5" ry="2" />
    <ellipse cx="12" cy="17.5" rx="3.5" ry="2.5" />
    <path d="M9 7L5 4M15 7l4-3" />
    <path d="M9 13L4 11M15 13l5-2" />
    <path d="M12 5.5v-2" />
    <circle cx="12" cy="3" r="1" fill="currentColor" stroke="none" />
  </svg>
)

// --- Intelligence icon (autopilot intelligence → agent suggestions) ---
const IntelligenceIcon = (props: { size?: number }) => (
  <svg width={props.size ?? 18} height={props.size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 7 17a3 3 0 0 0 2 4 3 3 0 0 0 3-3V3a3 3 0 0 0-3 0z" />
    <path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8A3 3 0 0 1 17 17a3 3 0 0 1-2 4 3 3 0 0 1-3-3" opacity="0.5" />
  </svg>
)

const categoryTone = (cat: string): 'good' | 'warn' | 'muted' =>
  cat === 'content' ? 'good' : cat === 'research' ? 'warn' : 'muted'

const statusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'completed' ? 'good' :
  status === 'running' || status === 'queued' ? 'warn' :
  status === 'failed' ? 'bad' : 'muted'

const priorityTone = (p: string): 'good' | 'warn' | 'muted' =>
  p === 'high' ? 'good' : p === 'medium' ? 'warn' : 'muted'

export function AgentPanel(props: { slug: string }) {
  const { activeTab, switchTab, isVisited } = useTabPanels('providers')
  const tab = () => activeTab() as 'providers' | 'tasks' | 'growth' | 'usage' | 'intel'

  const [selectedTemplate, setSelectedTemplate] = createSignal<string | null>(null)
  const [selectedModel, setSelectedModel] = createSignal<string>('laguna-s-2.1-free')
  const [prompt, setPrompt] = createSignal('')
  const [submitting, setSubmitting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [viewingResult, setViewingResult] = createSignal<AgentTaskResult | null>(null)

  // Consolidated Tasks-tab read model — one round-trip replaces the five
  // separate queries (templates, tasks, models, suggestions, schedules).
  // Each section degrades independently: a broken suggestions endpoint
  // cannot blank the task list next to it.
  const tasksOverview = useQuery(() => ({
    queryKey: ['agent-tasks-overview', props.slug],
    queryFn: () => api.agentTasksOverview(props.slug),
    enabled: tab() === 'tasks',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  // Consolidated Providers-tab read model — one round-trip replaces the
  // three separate queries (providers, credentials, models).
  const providersOverview = useQuery(() => ({
    queryKey: ['agent-providers-overview', props.slug],
    queryFn: () => api.agentProvidersOverview(props.slug),
    enabled: tab() === 'providers',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  // Derive individual sections from the consolidated responses. Each
  // section is either the upstream JSON object or `{ __error: string }`
  // when that section's endpoint failed.
  const templates = () => {
    const d = tasksOverview.data?.templates
    return d && !('__error' in d) ? d.templates : []
  }
  const tasks = () => {
    const d = tasksOverview.data?.tasks
    return d && !('__error' in d) ? d.tasks : []
  }
  const modelsData = () => tasksOverview.data?.models ?? providersOverview.data?.models
  const models = () => {
    const d = modelsData()
    return d && !('__error' in d) ? d : null
  }
  const suggestions = () => {
    const d = tasksOverview.data?.suggestions
    return d && !('__error' in d) ? d.suggestions : []
  }
  const schedules = () => {
    const d = tasksOverview.data?.schedules
    return d && !('__error' in d) ? d.schedules : []
  }
  const providers = () => {
    const d = providersOverview.data?.providers
    return d && !('__error' in d) ? d.providers : []
  }
  const credentials = () => {
    const d = providersOverview.data?.credentials
    return d && !('__error' in d) ? d.credentials : []
  }

  // When models load, ensure selectedModel is valid — if the current selection
  // isn't in the list (e.g. it was set by a suggestion using a model that no
  // longer exists), fall back to the first available model.
  createEffect(() => {
    const m = models()?.models
    if (!m || m.length === 0) return
    const current = selectedModel()
    if (!m.some(model => model.id === current)) {
      setSelectedModel(m[0]!.id)
    }
  })

  // Auto-refresh for running/queued tasks is driven by the global refresh
  // tick — one clock for the whole page, no independent timer.

  const submit = async () => {
    const templateId = selectedTemplate()
    if (!templateId || !prompt().trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await request(`/tenants/${props.slug}/agents/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          template_id: templateId,
          model_id: selectedModel(),
          prompt: prompt().trim(),
        }),
      })
      setPrompt('')
      refreshQueries(['agent-tasks-overview', props.slug])
    } catch (err) {
      setError(errorMessage(err, 'Failed to start task'))
    } finally {
      setSubmitting(false)
    }
  }

  const runSuggestion = (s: TaskSuggestion) => {
    setSelectedTemplate(s.template_id)
    setSelectedModel(s.model_id)
    setPrompt(s.prefill_prompt)
  }

  const viewResult = async (taskId: string) => {
    try {
      const result = await request<AgentTaskResult>(`/tenants/${props.slug}/agents/tasks/${taskId}/result`)
      setViewingResult(result)
    } catch (err) {
      setError(errorMessage(err, 'Failed to load result'))
    }
  }

  const [creatingSchedule, setCreatingSchedule] = createSignal(false)
  const [scheduleInterval, setScheduleInterval] = createSignal(1440)
  const [scheduleBusy, setScheduleBusy] = createSignal<string | null>(null)

  const createSchedule = async () => {
    const templateId = selectedTemplate()
    if (!templateId || !prompt().trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await api.agentCreateSchedule(props.slug, {
        template_id: templateId,
        model_id: selectedModel(),
        prompt: prompt().trim(),
        interval_minutes: scheduleInterval(),
      })
      setPrompt('')
      setCreatingSchedule(false)
      refreshQueries(['agent-tasks-overview', props.slug])
    } catch (err) {
      setError(errorMessage(err, 'Failed to create schedule'))
    } finally {
      setSubmitting(false)
    }
  }

  const toggleSchedule = async (id: string, enabled: boolean) => {
    if (scheduleBusy()) return
    setScheduleBusy(id)
    try {
      await api.agentToggleSchedule(props.slug, id, enabled)
      refreshQueries(['agent-tasks-overview', props.slug])
    } catch (err) {
      setError(errorMessage(err, 'Failed to toggle schedule'))
    } finally {
      setScheduleBusy(null)
    }
  }

  const deleteSchedule = async (id: string) => {
    if (scheduleBusy()) return
    setScheduleBusy(id)
    try {
      await api.agentDeleteSchedule(props.slug, id)
      refreshQueries(['agent-tasks-overview', props.slug])
    } catch (err) {
      setError(errorMessage(err, 'Failed to delete schedule'))
    } finally {
      setScheduleBusy(null)
    }
  }

  // Detect agent-service unavailability across the consolidated read models
  const isServiceDown = () => {
    const errs = [tasksOverview.error, providersOverview.error]
    return errs.some(e => {
      if (!e) return false
      if (e instanceof ApiError && e.status === 503) return true
      return e.message.includes('unavailable') || e.message.includes('unreachable')
    })
  }

  return (
    <div class="agent-panel">
      {/* Service-unavailable banner — shown once at the top when the agent
          service is down, instead of repeating errors in each sub-panel. */}
      <Show when={isServiceDown()}>
        <div class="agent-service-down">
          <AntIcon size={20} />
          <div>
            <strong>Agent service is temporarily unavailable</strong>
            <span>Free models continue to work. Premium features and provider management will return shortly.</span>
          </div>
        </div>
      </Show>

      {/* Tab navigation */}
      <TabBar
        active={activeTab()}
        onChange={switchTab}
        tabs={[
          { id: 'providers', label: 'AI Providers' },
          { id: 'tasks', label: 'Tasks' },
          { id: 'usage', label: 'AI Usage' },
          { id: 'intel', label: 'Intelligence' },
        ]}
      />

      {/* Tab panels — lazy-mounted on first visit via TabPanel, then kept
          mounted with display:none. Each TabPanel has its own <Suspense>
          boundary so the first open shows a local skeleton, not a
          page-wide skeleton. Queries are gated by `enabled: tab() === ...`
          so hidden tabs don't refetch on the global refresh tick. */}
      <TabPanel active={activeTab()} id="providers" visited={isVisited('providers')}>
        <AgentProvidersPanel slug={props.slug} providers={providers()} credentials={credentials()} refetchCreds={() => refreshQueries(['agent-providers-overview', props.slug])} active={activeTab() === 'providers'} models={models()} />
      </TabPanel>

      <TabPanel active={activeTab()} id="usage" visited={isVisited('usage')}>
        <AIUsagePanel slug={props.slug} active={activeTab() === 'usage'} />
      </TabPanel>

      <TabPanel active={activeTab()} id="intel" visited={isVisited('intel')}>
        <IntelligenceTransparencyPanel slug={props.slug} active={activeTab() === 'intel'} />
      </TabPanel>

      <TabPanel active={activeTab()} id="tasks" visited={isVisited('tasks')}>
      {/* Autopilot intelligence → agent suggestions — the bridge between operations data and LLM execution */}
      <Show when={tasksOverview.data?.suggestions && '__error' in tasksOverview.data!.suggestions}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Agent suggestions unavailable: {errorMessage(tasksOverview.error, 'Service unreachable')}</div></Show>
      <Show when={suggestions().length > 0}>
        <div class="agent-section">
          <div class="agent-section-head">
            <h3><IntelligenceIcon size={18} /> From the Autopilot Intelligence</h3>
          </div>
          <p class="agent-section-intro">Data-driven task suggestions based on your events, fan growth, and campaign performance. Click to pre-fill and run.</p>
          <div class="agent-suggestions">
            <For each={suggestions().slice(0, 4)}>
              {(s) => (
                <button class="agent-suggestion-card" onClick={() => runSuggestion(s)}>
                  <div class="agent-suggestion-head">
                    <span class="agent-suggestion-title">{s.title}</span>
                    <StatusBadge status={s.priority} tone={priorityTone(s.priority)} />
                  </div>
                  <p class="agent-suggestion-desc">{s.description}</p>
                  <span class="agent-suggestion-reason">{s.reason}</span>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Task templates and execution */}
      <div class="agent-section">
        <div class="agent-section-head">
          <h3>Agent tasks</h3>
          <Show when={templates().length > 0}><span class="text-muted-foreground">{templates().length} templates</span></Show>
        </div>
        <p class="agent-section-intro">A template is a pre-written job — research, drafting, analysis — with the prompt scaffolding already in place. Pick one, choose a model, describe the specific work in your own words, and run it. Results appear under Recent tasks, usually within a minute.</p>
        <Show when={tasksOverview.data} fallback={<SkeletonGrid count={4} minCardHeight='120px' />}>
          <div class="agent-template-grid">
            <For each={templates()}>
              {(template) => (
                <button
                  class={`agent-template-card ${selectedTemplate() === template.id ? 'selected' : ''}`}
                  onClick={() => setSelectedTemplate(template.id)}
                >
                  <div class="agent-template-header">
                    <span class="agent-template-name">{template.name}</span>
                    <StatusBadge status={template.category} tone={categoryTone(template.category)} />
                  </div>
                  <p class="agent-template-desc">{template.description}</p>
                  <div class="agent-template-models">
                    <For each={template.recommendedModels.slice(0, 2)}>
                      {(model) => <span class="agent-model-tag">{model}</span>}
                    </For>
                  </div>
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>


      <Show when={selectedTemplate()}>
        <div class="agent-section">
          <div class="agent-section-head">
            <h3>Run: {templates().find(t => t.id === selectedTemplate())?.name ?? 'task'}</h3>
            <button class="agent-btn" onClick={() => setSelectedTemplate(null)}>Choose another template</button>
          </div>
          <p class="agent-section-intro">Free models cost nothing and are always available; paid models bill against the AI budget on the Usage tab. The prompt is the only thing the template does not already know — name the show, the city, the audience, the deadline.</p>
          <label class="agent-field">
            <span>Model</span>
            <select value={selectedModel()} onChange={(e) => setSelectedModel(e.currentTarget.value)}>
              <For each={models()?.models ?? []}>
                {(model) => (
                  <option value={model.id}>
                    {model.name} {model.paid ? '(paid)' : '(free)'} — {model.providerName}
                  </option>
                )}
              </For>
            </select>
          </label>
          <label class="agent-field">
            <span>Describe what you want the agent to do</span>
            <textarea
              value={prompt()}
              onInput={(e) => setPrompt(e.currentTarget.value)}
              placeholder="e.g. Write a press pitch for the Sep 5 Sanity Check Tour show targeting Polish metal blogs and zines"
              rows={4}
              maxlength={8000}
            />
          </label>
          <div class="agent-actions">
            <button
              class="primary"
              disabled={submitting() || !prompt().trim()}
              onClick={submit}
            >
              {submitting() ? 'Starting…' : 'Run Agent'}
            </button>
            <Show when={error()}>
              <span class="agent-error">{error()}</span>
            </Show>
          </div>
        </div>
      </Show>

      {/* Schedules — recurring agent tasks */}
      <div class="agent-section">
        <div class="agent-section-head">
          <h3>Schedules</h3>
          <Show when={!creatingSchedule()}>
            <button class="agent-btn" onClick={() => { setCreatingSchedule(true); setError(null) }}>
              + New schedule
            </button>
          </Show>
        </div>
        <p class="agent-section-intro">Recurring agent tasks run automatically on the configured interval. Each run is a normal task — results land in Recent Tasks and structured outcomes flow to the opportunity board.</p>
        <Show when={creatingSchedule()}>
          <div class="agent-schedule-form">
            <label class="agent-field">
              <span>Interval (minutes)</span>
              <input type="number" min="60" max="10080" value={scheduleInterval()} onInput={(e) => setScheduleInterval(parseInt(e.currentTarget.value, 10) || 1440)} />
              <small class="agent-field-hint">Between 60 (hourly) and 10080 (weekly). 1440 is once a day.</small>
            </label>
            <Show when={!selectedTemplate() || !prompt().trim()}>
              <p class="agent-field-hint">A schedule repeats the task above, so pick a template and write its prompt first — this form only adds the interval.</p>
            </Show>
            <div class="agent-actions">
              <button class="primary" disabled={submitting() || !selectedTemplate() || !prompt().trim()} onClick={createSchedule}>
                {submitting() ? 'Creating…' : 'Create schedule'}
              </button>
              <button class="link" onClick={() => setCreatingSchedule(false)}>Cancel</button>
            </div>
          </div>
        </Show>
        <Show when={tasksOverview.data?.schedules && '__error' in tasksOverview.data!.schedules}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Agent schedules unavailable: {errorMessage(tasksOverview.error, 'Service unreachable')}</div></Show>
        <Show when={schedules().length > 0}>
          <table class="agent-task-table">
            <thead><tr><th>Template</th><th>Interval</th><th>Enabled</th><th>Last run</th><th>Next run</th><th></th></tr></thead>
            <tbody>
              <For each={schedules()}>
                {(sched) => (
                  <tr>
                    <td>{sched.template_id}</td>
                    <td>{sched.interval_minutes}m</td>
                    <td>
                      <button class="link" disabled={scheduleBusy() === sched.id} onClick={() => toggleSchedule(sched.id, !sched.enabled)}>
                        {scheduleBusy() === sched.id ? '…' : sched.enabled ? '✓ enabled' : 'disabled'}
                      </button>
                    </td>
                    <td class="text-muted-foreground">{sched.last_run_at ? formatIsoAge(sched.last_run_at) : 'never'}</td>
                    <td class="text-muted-foreground">{sched.next_run_at ? formatIsoAge(sched.next_run_at) : '—'}</td>
                    <td><button class="agent-btn-danger" disabled={scheduleBusy() === sched.id} onClick={() => deleteSchedule(sched.id)}>Delete</button></td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
        <Show when={schedules().length === 0}>
          <EmptyState label="No schedules configured" hint="Schedules define when the intelligence dispatches worker agents. Create a schedule to automate intelligence gathering." />
        </Show>
      </div>

      <div class="agent-section">
        <div class="agent-section-head">
          <h3>Recent tasks</h3>
          <Show when={tasks().length > 0}><span class="text-muted-foreground">last {Math.min(tasks().length, 10)}</span></Show>
        </div>
        <p class="agent-section-intro">Every run, whether started here or by a schedule. <strong>Queued</strong> and <strong>running</strong> refresh on their own; <strong>completed</strong> opens the full output with a copy button. A failed run charges nothing — hover it for the reason.</p>
        <Show when={tasksOverview.data} fallback={
          <Show when={tasksOverview.isFetching} fallback={<EmptyState label="No tasks yet" hint="Tasks are individual worker runs. They appear here once the intelligence or a schedule dispatches them." />}>
            <SkeletonRows count={4} />
          </Show>
        }>
          <table class="agent-task-table">
            <thead>
              <tr>
                <th>Template</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <For each={tasks().slice(0, 10)}>
                {(task) => (
                  <tr>
                    <td>{task.template_id}</td>
                    <td><StatusBadge status={task.status} tone={statusTone(task.status)} /></td>
                    <td class="text-muted-foreground">{formatIsoAge(task.created_at)}</td>
                    <td>
                      <Show when={task.status === 'completed'}>
                        <button class="link" onClick={() => viewResult(task.id)}>View →</button>
                      </Show>
                      <Show when={task.status === 'failed'}>
                        <span class="agent-error" title={task.error ?? ''}>failed</span>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>
      </TabPanel>

      <Dialog
        open={viewingResult() !== null}
        onClose={() => setViewingResult(null)}
        label="Agent task result"
        overlayClass="agent-result-overlay"
        class="agent-result-modal"
      >
        <>
            <div class="agent-result-header">
              <h3>Result</h3>
              <button class="link" onClick={() => setViewingResult(null)}>Close</button>
            </div>
            <div class="agent-result-meta">
              <span>Model: {viewingResult()?.model_used}</span>
              <Show when={viewingResult()?.duration_ms}>
                <span>Duration: {Math.round((viewingResult()?.duration_ms ?? 0) / 1000)}s</span>
              </Show>
              <Show when={viewingResult()?.tokens_out}>
                <span>Tokens: {viewingResult()?.tokens_out} out</span>
              </Show>
            </div>
            <Show when={viewingResult()?.outcomes && viewingResult()!.outcomes!.length > 0}>
              <div class="agent-outcomes">
                <h4>Structured outcomes</h4>
                <For each={viewingResult()!.outcomes}>{(outcome: AgentOutcome) => (
                  <div class="agent-outcome-card">
                    <div class="agent-outcome-head">
                      <span class="badge">{outcome.kind.replaceAll('_', ' ')}</span>
                      <span class="badge">confidence {Math.round(outcome.confidence_basis_points / 100)}%</span>
                    </div>
                    <p class="text-muted-foreground">{outcome.rationale}</p>
                    <Show when={outcome.item}>
                      <pre class="agent-outcome-item">{JSON.stringify(outcome.item, null, 2)}</pre>
                    </Show>
                  </div>
                )}</For>
              </div>
            </Show>
            <pre class="agent-result-content">{viewingResult()?.content}</pre>
            <div class="agent-result-actions">
              <button onClick={() => navigator.clipboard.writeText(viewingResult()?.content ?? '')}>
                Copy
              </button>
            </div>
        </>
      </Dialog>
    </div>
  )
}
