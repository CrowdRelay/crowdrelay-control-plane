import { For, Show, createEffect, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api, request, ApiError } from '../lib/api'
import { errorMessage, formatIsoAge } from '../lib/format'
import { refreshQueries } from '../lib/refresh'
import { StatusBadge } from './StatusBadge'
import { Dialog } from './Dialog'
import { TabBar, TabPanel, useTabPanels, ErrorCard } from './layout'
import { AgentProvidersPanel } from './AgentProvidersPanel'
import { AIUsagePanel } from './AIUsagePanel'
import { IntelligenceTransparencyPanel } from './IntelligenceTransparencyPanel'
import { EmptyState } from './ui/empty-state'
import { SkeletonGrid, SkeletonRows } from './Skeleton'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'
import { Textarea } from './ui/textarea'
import type { AgentTaskResult, TaskSuggestion, AgentOutcome } from '../lib/types'
import { NativeSelect } from './ui/native-select'

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
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('providers')
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

  const templateName = (id: string) => templates().find(t => t.id === id)?.name ?? id

  return (
    <div class="flex flex-col gap-4">
      {/* Service-unavailable banner — shown once at the top when the agent
          service is down, instead of repeating errors in each sub-panel. */}
      <Show when={isServiceDown()}>
        <div class="flex items-start gap-3 p-4 rounded-lg border border-warning/30 bg-warning/10 text-warning-light">
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
      onPrefetch={prefetch}
        tabs={[
          { id: 'providers', label: 'AI Providers' },
          { id: 'library', label: 'Add a provider' },
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
        <AgentProvidersPanel mode="in-use" slug={props.slug} providers={providers()} credentials={credentials()} refetchCreds={() => refreshQueries(['agent-providers-overview', props.slug])} active={activeTab() === 'providers'} models={models()} />
      </TabPanel>

      {/* The catalogue is its own tab. Ten cards where two are yours makes an
          operator find their own two every time they open the page. */}
      <TabPanel active={activeTab()} id="library" visited={isVisited('library')}>
        <AgentProvidersPanel mode="library" slug={props.slug} providers={providers()} credentials={credentials()} refetchCreds={() => refreshQueries(['agent-providers-overview', props.slug])} active={activeTab() === 'library'} models={models()} />
      </TabPanel>

      <TabPanel active={activeTab()} id="usage" visited={isVisited('usage')}>
        <AIUsagePanel slug={props.slug} active={activeTab() === 'usage'} />
      </TabPanel>

      <TabPanel active={activeTab()} id="intel" visited={isVisited('intel')}>
        <IntelligenceTransparencyPanel slug={props.slug} active={activeTab() === 'intel'} />
      </TabPanel>

      <TabPanel active={activeTab()} id="tasks" visited={isVisited('tasks')}>
      {/* Autopilot intelligence → agent suggestions — the bridge between operations data and LLM execution */}
      <Show when={tasksOverview.data?.suggestions && '__error' in tasksOverview.data!.suggestions}><ErrorCard>Agent suggestions unavailable: {errorMessage(tasksOverview.error, 'We couldn\'t reach the agent service. Try refreshing.')}</ErrorCard></Show>
      <Show when={suggestions().length > 0}>
        <Card class="p-4">
          <div class="flex items-center justify-between gap-4">
            <h3><IntelligenceIcon size={18} /> Autopilot Intelligence</h3>
          </div>
          <p class="text-sm text-muted-foreground mt-1">Data-driven suggestions based on your events and campaign performance. Click to run.</p>
          <div class="grid gap-2.5 mt-3 grid-cols-1 md:grid-cols-2">
            <For each={suggestions().slice(0, 4)}>
              {(s) => (
                <button type="button" class="text-left text-sm rounded-md border border-border px-3 py-2 text-muted-foreground hover:bg-surface-1 hover:text-foreground hover:border-border-strong transition-colors w-full" onClick={() => runSuggestion(s)}>
                  <div class="flex items-center justify-between gap-2 mb-1">
                    <span class="font-semibold text-sm text-foreground text-left">{s.title}</span>
                    <StatusBadge status={s.priority} tone={priorityTone(s.priority)} />
                  </div>
                  <p class="text-sm text-muted-foreground text-left leading-snug">{s.description}</p>
                  <Show when={s.reason}>
                    <span class="text-xs text-muted-foreground italic mt-1.5 block text-left">{s.reason}</span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Card>
      </Show>

      {/* Task templates and execution */}
      <Card class="p-4">
        <div class="flex items-center justify-between gap-4">
          <h3>Agent tasks</h3>
          <Show when={templates().length > 0}><span class="text-muted-foreground">{templates().length} templates</span></Show>
        </div>
        <p class="text-sm text-muted-foreground mt-1">Pick a template, choose a model, and describe the work.</p>
        <Show when={tasksOverview.data} fallback={<SkeletonGrid count={4} minCardHeight='120px' />}>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <For each={templates()}>
              {(template) => (
                <button
                  type="button"
                  class={`rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-border-strong cursor-pointer ${selectedTemplate() === template.id ? 'border-primary/40 bg-primary/5' : ''}`}
                  onClick={() => setSelectedTemplate(template.id)}
                >
                  <div class="flex items-center justify-between gap-2 mb-1">
                    <span class="font-semibold text-base text-foreground">{template.name}</span>
                    <StatusBadge status={template.category} tone={categoryTone(template.category)} />
                  </div>
                  <p class="text-sm text-muted-foreground leading-relaxed mb-2">{template.description}</p>
                  <div class="flex gap-1 flex-wrap">
                    <For each={template.recommendedModels.slice(0, 2)}>
                      {(model) => <span class="text-xs px-2 py-0.5 rounded-full bg-surface-3 text-muted-foreground border border-border">{model}</span>}
                    </For>
                  </div>
                </button>
              )}
            </For>
          </div>
        </Show>
      </Card>


      <Show when={selectedTemplate()}>
        <Card class="p-4">
          <div class="flex items-center justify-between gap-4">
            <h3>Run: {templates().find(t => t.id === selectedTemplate())?.name ?? 'task'}</h3>
            <Button variant="ghost" size="sm" onClick={() => setSelectedTemplate(null)}>Choose another template</Button>
          </div>
          <p class="text-sm text-muted-foreground mt-1">Free models cost nothing; paid models bill against the AI budget.</p>
          <label class="flex flex-col gap-1 text-sm text-muted-foreground">
            <span>Model</span>
            <NativeSelect value={selectedModel()} onChange={(e) => setSelectedModel(e.currentTarget.value)}>
              <For each={models()?.models ?? []}>
                {(model) => (
                  <option value={model.id}>
                    {model.name} {model.paid ? '(paid)' : '(free)'} — {model.providerName}
                  </option>
                )}
              </For>
            </NativeSelect>
          </label>
          <label class="flex flex-col gap-1 text-sm text-muted-foreground">
            <span>Describe what you want the agent to do</span>
            <Textarea
              value={prompt()}
              onInput={(e) => setPrompt(e.currentTarget.value)}
              placeholder="e.g. Write a press pitch for the Sep 5 Sanity Check Tour show targeting Polish metal blogs and zines"
              rows={4}
              maxlength={8000}
            />
          </label>
          <div class="flex items-center gap-2 mt-2">
            <Button
              size="sm"
              disabled={submitting() || !prompt().trim()}
              onClick={submit}
            >
              {submitting() ? 'Starting…' : 'Run Agent'}
            </Button>
            <Show when={error()}>
              <span class="text-sm text-destructive">{error()}</span>
            </Show>
          </div>
        </Card>
      </Show>

      {/* Schedules — recurring agent tasks */}
      <Card class="p-4">
        <div class="flex items-center justify-between gap-4">
          <h3>Schedules</h3>
          <Show when={!creatingSchedule()}>
            <Button variant="ghost" size="sm" onClick={() => { setCreatingSchedule(true); setError(null) }}>
              + New schedule
            </Button>
          </Show>
        </div>
        <p class="text-sm text-muted-foreground mt-1">Recurring tasks run automatically. Results land in Recent tasks.</p>
        <Show when={creatingSchedule()}>
          <div class="flex flex-col gap-3 mt-4 p-4 rounded-lg border border-border bg-surface-1">
            <label class="flex flex-col gap-1 text-sm text-muted-foreground">
              <span>Interval (minutes)</span>
              <Input type="number" min="60" max="10080" value={scheduleInterval()} onInput={(e) => setScheduleInterval(parseInt(e.currentTarget.value, 10) || 1440)} />
              <small class="text-xs text-muted-foreground">Between 60 (hourly) and 10080 (weekly). 1440 is once a day.</small>
            </label>
            <Show when={!selectedTemplate() || !prompt().trim()}>
              <p class="text-xs text-muted-foreground">A schedule repeats the task above, so pick a template and write its prompt first — this form only adds the interval.</p>
            </Show>
            <div class="flex items-center gap-2 mt-2">
              <Button size="sm" disabled={submitting() || !selectedTemplate() || !prompt().trim()} onClick={createSchedule}>
                {submitting() ? 'Creating…' : 'Create schedule'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCreatingSchedule(false)}>Cancel</Button>
            </div>
          </div>
        </Show>
        <Show when={tasksOverview.data?.schedules && '__error' in tasksOverview.data!.schedules}><ErrorCard>Agent schedules unavailable: {errorMessage(tasksOverview.error, 'We couldn\'t reach the agent service. Try refreshing.')}</ErrorCard></Show>
        <Show when={schedules().length > 0}>
          <Table class="mt-4">
            <TableHeader><TableRow><TableHead>Template</TableHead><TableHead>Interval</TableHead><TableHead>Enabled</TableHead><TableHead>Last run</TableHead><TableHead>Next run</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              <For each={schedules()}>
                {(sched) => (
                  <TableRow>
                    <TableCell>{templateName(sched.template_id)}</TableCell>
                    <TableCell>{sched.interval_minutes}m</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" disabled={scheduleBusy() === sched.id} onClick={() => toggleSchedule(sched.id, !sched.enabled)}>
                        {scheduleBusy() === sched.id ? '…' : sched.enabled ? '✓ enabled' : 'disabled'}
                      </Button>
                    </TableCell>
                    <TableCell class="text-muted-foreground">{sched.last_run_at ? formatIsoAge(sched.last_run_at) : 'never'}</TableCell>
                    <TableCell class="text-muted-foreground">{sched.next_run_at ? formatIsoAge(sched.next_run_at) : '—'}</TableCell>
                    <TableCell><Button variant="destructive-ghost" size="sm" disabled={scheduleBusy() === sched.id} onClick={() => deleteSchedule(sched.id)}>Delete</Button></TableCell>
                  </TableRow>
                )}
              </For>
            </TableBody>
          </Table>
        </Show>
        <Show when={schedules().length === 0}>
          <EmptyState label="No schedules configured" hint="Automate recurring intelligence tasks." />
        </Show>
      </Card>

      <Card class="p-4">
        <div class="flex items-center justify-between gap-4">
          <h3>Recent tasks</h3>
          <Show when={tasks().length > 0}><span class="text-muted-foreground">last {Math.min(tasks().length, 10)}</span></Show>
        </div>
        <p class="text-sm text-muted-foreground mt-1">Every run, started here or by a schedule. Completed tasks show full output.</p>
        <Show when={tasksOverview.data} fallback={
          <Show when={tasksOverview.isFetching} fallback={<EmptyState label="No tasks yet" hint="Tasks appear once the intelligence or a schedule dispatches them." />}>
            <SkeletonRows count={4} />
          </Show>
        }>
          <Table class="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <For each={tasks().slice(0, 10)}>
                {(task) => (
                  <TableRow>
                    <TableCell>{templateName(task.template_id)}</TableCell>
                    <TableCell><StatusBadge status={task.status} tone={statusTone(task.status)} /></TableCell>
                    <TableCell class="text-muted-foreground">{formatIsoAge(task.created_at)}</TableCell>
                    <TableCell>
                      <Show when={task.status === 'completed'}>
                        <Button variant="ghost" size="sm" onClick={() => viewResult(task.id)}>View →</Button>
                      </Show>
                      <Show when={task.status === 'failed'}>
                        <span class="text-sm text-destructive" title={task.error ?? ''}>failed</span>
                      </Show>
                    </TableCell>
                  </TableRow>
                )}
              </For>
            </TableBody>
          </Table>
        </Show>
      </Card>
      </TabPanel>

      <Dialog
        open={viewingResult() !== null}
        onClose={() => setViewingResult(null)}
        label="Agent task result"
        title="Result"
        class="max-w-2xl"
        footer={<>
          <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(viewingResult()?.content ?? '')}>Copy</Button>
          <Button variant="ghost" size="sm" onClick={() => setViewingResult(null)}>Close</Button>
        </>}
      >
        <>
            <div class="flex gap-4 pb-2 text-sm text-muted-foreground border-b border-border">
              <span>Model: {viewingResult()?.model_used}</span>
              <Show when={viewingResult()?.duration_ms}>
                <span>Duration: {Math.round((viewingResult()?.duration_ms ?? 0) / 1000)}s</span>
              </Show>
              <Show when={viewingResult()?.tokens_out}>
                <span>Tokens: {viewingResult()?.tokens_out} out</span>
              </Show>
            </div>
            <Show when={viewingResult()?.outcomes && viewingResult()!.outcomes!.length > 0}>
              <div class="flex flex-col gap-2 py-4">
                <h4>Structured outcomes</h4>
                <For each={viewingResult()!.outcomes}>{(outcome: AgentOutcome) => (
                  <div class="p-3 rounded-lg border border-border bg-surface-1">
                    <div class="flex items-center gap-2 mb-2">
                      <Badge>{outcome.kind.replaceAll('_', ' ')}</Badge>
                      <Badge>confidence {outcome.confidence_basis_points > 0 && outcome.confidence_basis_points < 100 ? '< 1%' : `${Math.round(outcome.confidence_basis_points / 100)}%`}</Badge>
                    </div>
                    <p class="text-muted-foreground">{outcome.rationale}</p>
                    <Show when={outcome.item}>
                      <pre class="text-xs text-muted-foreground whitespace-pre-wrap font-mono m-0">{JSON.stringify(outcome.item, null, 2)}</pre>
                    </Show>
                  </div>
                )}</For>
              </div>
            </Show>
            <pre class="whitespace-pre-wrap pt-4 text-sm text-foreground leading-relaxed m-0">{viewingResult()?.content}</pre>
        </>
      </Dialog>
    </div>
  )
}
