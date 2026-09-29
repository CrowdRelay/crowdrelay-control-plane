import { For, Show, createEffect, createSignal } from 'solid-js'
import { Field } from './ui/field'
import { FormDrawer } from './app/form-drawer'
import { failureLine, unavailableError } from '../lib/errors'
import { useQuery } from '@tanstack/solid-query'
import { api, request, ApiError } from '../lib/api'
import { confidencePercent, formatIsoAge } from '../lib/format'
import { refreshQueries } from '../lib/refresh'
import { StatusBadge } from './StatusBadge'
import { Dialog, confirmAction } from './Dialog'
import { TabBar, TabPanel, useTabPanels, ErrorCard, Section } from './layout'
import { Alert } from './app/alert'
import { AgentProvidersPanel } from './AgentProvidersPanel'
import { AIUsagePanel } from './AIUsagePanel'
import { IntelligenceTransparencyPanel } from './IntelligenceTransparencyPanel'
import { EmptyState } from './ui/empty-state'
import { SkeletonGrid, SkeletonRows } from './Skeleton'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { Input } from './ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './app/table'
import { Textarea } from './ui/textarea'
import type { AgentTaskResult, TaskSuggestion, AgentOutcome } from '../lib/types'
import { NativeSelect } from './ui/native-select'
import { writeGuard } from '../lib/read-only'
import { whileIncomplete, hasErrorSections } from '../lib/incomplete'
import { Brain, CloudOff, Workflow, Plus } from 'lucide-solid'

// --- Intelligence icon (autopilot intelligence → agent suggestions) ---
const IntelligenceIcon = (props: { size?: number }) => (
  <Brain size={props.size ?? 18} aria-hidden="true" />
)

const categoryTone = (cat: string): 'good' | 'warn' | 'muted' =>
  cat === 'content' ? 'good' : cat === 'research' ? 'warn' : 'muted'

const statusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'completed' ? 'good' :
  status === 'running' || status === 'queued' ? 'warn' :
  status === 'failed' ? 'bad' : 'muted'

const priorityTone = (p: string): 'good' | 'warn' | 'muted' =>
  p === 'high' ? 'good' : p === 'medium' ? 'warn' : 'muted'

const MAX_VISIBLE_SUGGESTIONS = 4
const MAX_VISIBLE_TASKS = 10

export function AgentPanel(props: { slug: string }) {
  // The id list makes `?tab=` deep links land on the right tab.
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('providers', ['providers', 'library', 'tasks', 'usage', 'intel'])
  const tab = () => activeTab() as 'providers' | 'library' | 'tasks' | 'growth' | 'usage' | 'intel'

  const [selectedTemplate, setSelectedTemplate] = createSignal<string | null>(null)
  const [selectedModel, setSelectedModel] = createSignal<string>('laguna-s-2.1-free')
  const [prompt, setPrompt] = createSignal('')
  const [submitting, setSubmitting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [viewingResult, setViewingResult] = createSignal<AgentTaskResult | null>(null)
  const [showAllSuggestions, setShowAllSuggestions] = createSignal(false)
  const [showAllTasks, setShowAllTasks] = createSignal(false)

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
    // A failed section arrives as `{ __error: … }` inside a 200 — cached and
    // never retried without this. Same rule as the `degraded[]` models.
    refetchInterval: whileIncomplete(hasErrorSections),
  }))

  // Consolidated Providers-tab read model — one round-trip replaces the
  // three separate queries (providers, credentials, models).
  // The service's own "what is broken right now" roll-up: failed tasks,
  // dead webhook deliveries, down providers. Lives above the tabs — an
  // operator should not have to open the right tab to learn a model is down.
  const serviceAlerts = useQuery(() => ({
    queryKey: ['agent-health-alerts', props.slug],
    queryFn: () => api.agentHealthAlerts(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  }))
  const alerts = () => serviceAlerts.data?.alerts ?? []

  const providersOverview = useQuery(() => ({
    queryKey: ['agent-providers-overview', props.slug],
    queryFn: () => api.agentProvidersOverview(props.slug),
    // The library tab renders the same provider data — keep the query live
    // there so a degraded section keeps retrying instead of freezing.
    enabled: tab() === 'providers' || tab() === 'library',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    refetchInterval: whileIncomplete(hasErrorSections),
  }))

  // Derive individual sections from the consolidated responses. Each
  // section is either the upstream JSON object or `{ __error: string }`
  // when that section's endpoint failed. `sectionErr` surfaces that failure —
  // a section that errored must render as degraded, never as an empty list:
  // "no providers" and "cannot reach providers" are different facts.
  const sectionErr = (d: unknown): string | null => {
    if (d && typeof d === 'object' && '__error' in d) {
      return String((d as Record<string, unknown>).__error)
    }
    return null
  }
  const templates = () => {
    const d = tasksOverview.data?.templates
    return d && !('__error' in d) ? d.templates : []
  }
  const tasks = () => {
    const d = tasksOverview.data?.tasks
    return d && !('__error' in d) ? d.tasks : []
  }
  // Both consolidated models carry a `models` section. `??` does not fall
  // through on a truthy `__error` object, so a failed tasks-section would
  // mask a healthy providers-section copy — prefer whichever is not an error.
  const modelsData = () => {
    const a = tasksOverview.data?.models
    if (a && !('__error' in a)) return a
    return providersOverview.data?.models
  }
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
  const providersSectionError = () => sectionErr(providersOverview.data?.providers)
  const credentialsSectionError = () => sectionErr(providersOverview.data?.credentials)
  const templatesSectionError = () => sectionErr(tasksOverview.data?.templates)
  const tasksSectionError = () => sectionErr(tasksOverview.data?.tasks)
  // A models error only matters when both copies failed — the dropdown is
  // populated from whichever section answered, so flagging one dead copy while
  // the list renders would be an error card over working data.
  const modelsSectionError = () =>
    models() === null
      ? (sectionErr(tasksOverview.data?.models) ?? sectionErr(providersOverview.data?.models))
      : null
  const suggestionsSectionError = () => sectionErr(tasksOverview.data?.suggestions)
  const schedulesSectionError = () => sectionErr(tasksOverview.data?.schedules)

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
      setError(failureLine("Couldn't start the task", err))
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
      setError(failureLine("Couldn't load the result", err))
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
      setError(failureLine("Couldn't create the schedule", err))
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
      setError(failureLine("Couldn't change the schedule", err))
    } finally {
      setScheduleBusy(null)
    }
  }

  const deleteSchedule = async (id: string, name: string) => {
    if (scheduleBusy()) return
    const ok = await confirmAction({
      title: `Delete the “${name}” schedule?`,
      body: 'It stops running on its interval. Past runs stay in the history.',
      confirmLabel: 'Delete schedule',
      destructive: true,
    })
    if (!ok) return
    setScheduleBusy(id)
    try {
      await api.agentDeleteSchedule(props.slug, id)
      refreshQueries(['agent-tasks-overview', props.slug])
    } catch (err) {
      setError(failureLine("Couldn't delete the schedule", err))
    } finally {
      setScheduleBusy(null)
    }
  }

  // Detect agent-service unavailability across the consolidated read models.
  // The service being down arrives two ways: as a failed request, or as a 200
  // whose every section carries the same "unavailable" error. The second used
  // to render as one error card per section, all saying the same thing, under
  // a banner nobody could read. One notice now says it once.
  const downWords = (m: string) => m.includes('unavailable') || m.includes('unreachable') || m.includes('not configured')
  const isServiceDown = () => {
    const errs = [tasksOverview.error, providersOverview.error]
    if (errs.some(e => e && ((e instanceof ApiError && e.status === 503) || downWords(e.message)))) return true
    const sections = [providersSectionError(), credentialsSectionError(), templatesSectionError(), tasksSectionError()]
    return sections.some(m => m != null && downWords(m))
  }
  // A section error only earns its own card when the service as a whole is up.
  const sectionError = (m: string | null) => isServiceDown() ? null : m

  const templateName = (id: string) => templates().find(t => t.id === id)?.name ?? id

  return (
    <div class="flex flex-col gap-4">
      {/* Service-unavailable banner — shown once at the top when the agent
          service is down, instead of repeating errors in each sub-panel. */}
      <Show when={isServiceDown()}>
        <Alert tone="warning" role="status" title="The agent service is unavailable">
          Free models keep working. Provider management, tasks and premium features return when the service answers again. This page retries on its own.
        </Alert>
      </Show>

      {/* Reliability alerts the service rolled up itself — failed tasks,
          dead webhook deliveries, down providers — worst first, the way the
          upstream list already orders them by recency. */}
      <For each={alerts().slice(0, 5)}>{a =>
        <Alert tone={a.severity === 'critical' ? 'destructive' : a.severity === 'warning' ? 'warning' : 'info'} role="status" title={a.category.replaceAll('_', ' ')}>
          {a.message}
          <Show when={a.occurred_at}>
            <span class="ml-1.5 text-xs opacity-80">{formatIsoAge(a.occurred_at!)}</span>
          </Show>
        </Alert>
      }</For>
      <Show when={alerts().length > 5}>
        <p class="text-xs text-muted-foreground">…and {alerts().length - 5} more service alert{alerts().length - 5 === 1 ? '' : 's'}.</p>
      </Show>

      {/* Tab navigation */}
      <TabBar
        class="mb-0"
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
        <AgentProvidersPanel mode="in-use" slug={props.slug} providers={providers()} credentials={credentials()} providersError={sectionError(providersSectionError())} credentialsError={sectionError(credentialsSectionError())} serviceDown={isServiceDown()} sectionsLoading={providersOverview.isPending} refetchCreds={() => refreshQueries(['agent-providers-overview', props.slug])} active={activeTab() === 'providers'} models={models()} />
      </TabPanel>

      {/* The catalogue is its own tab. Ten cards where two are yours makes an
          operator find their own two every time they open the page. */}
      <TabPanel active={activeTab()} id="library" visited={isVisited('library')}>
        <AgentProvidersPanel mode="library" slug={props.slug} providers={providers()} credentials={credentials()} providersError={sectionError(providersSectionError())} credentialsError={sectionError(credentialsSectionError())} serviceDown={isServiceDown()} sectionsLoading={providersOverview.isPending} refetchCreds={() => refreshQueries(['agent-providers-overview', props.slug])} active={activeTab() === 'library'} models={models()} />
      </TabPanel>

      <TabPanel active={activeTab()} id="usage" visited={isVisited('usage')}>
        <AIUsagePanel slug={props.slug} active={activeTab() === 'usage'} />
      </TabPanel>

      <TabPanel active={activeTab()} id="intel" visited={isVisited('intel')}>
        <IntelligenceTransparencyPanel slug={props.slug} active={activeTab() === 'intel'} />
      </TabPanel>

      <TabPanel active={activeTab()} id="tasks" visited={isVisited('tasks')}>
      {/* Autopilot intelligence → agent suggestions — the bridge between operations data and LLM execution */}
      <div class="space-y-8">
      <Show when={sectionError(suggestionsSectionError())}>{msg => <ErrorCard title="Couldn't load agent suggestions" error={unavailableError(msg())} recovery={false}>This part didn't respond. It retries on its own.</ErrorCard>}</Show>
      <Show when={suggestions().length > 0}>
        <Section flush title="Suggested by the autopilot" icon={<IntelligenceIcon size={18} />} count={suggestions().length} description="Built from your events and campaign performance. Pick one to run it.">
          <div class="grid gap-2.5 grid-cols-1 md:grid-cols-2">
            <For each={showAllSuggestions() ? suggestions() : suggestions().slice(0, MAX_VISIBLE_SUGGESTIONS)}>
              {(s) => (
                <Button writes type="button" variant="outline" class="h-auto w-full flex-col items-stretch justify-start gap-1 whitespace-normal px-3 py-2 text-left text-sm font-normal text-muted-foreground hover:text-foreground" onClick={() => runSuggestion(s)}>
                  <div class="flex items-center justify-between gap-2 mb-1">
                    <span class="font-semibold text-sm text-foreground text-left">{s.title}</span>
                    <StatusBadge status={s.priority} tone={priorityTone(s.priority)} />
                  </div>
                  <p class="text-sm text-muted-foreground text-left leading-snug">{s.description}</p>
                  <Show when={s.reason}>
                    <span class="text-xs text-muted-foreground italic mt-1.5 block text-left">{s.reason}</span>
                  </Show>
                </Button>
              )}
            </For>
          </div>
          <Show when={suggestions().length > MAX_VISIBLE_SUGGESTIONS}>
            <Button variant="ghost" size="sm" class="mt-2" onClick={() => setShowAllSuggestions(s => !s)}>
              {showAllSuggestions() ? 'Show fewer' : `Show all ${suggestions().length}`}
            </Button>
          </Show>
        </Section>
      </Show>

      {/* Task templates and execution */}
      <Section flush={suggestions().length === 0} title="Run a task" count={templates().length} description="Pick a template, choose a model, and describe the work.">
        <Show when={sectionError(templatesSectionError())}>{msg => <ErrorCard title="Couldn't load task templates" error={unavailableError(msg())} recovery={false}>This part didn't respond. It retries on its own.</ErrorCard>}</Show>
        <Show when={sectionError(modelsSectionError())}>{msg => <ErrorCard title="Couldn't load the model list" error={unavailableError(msg())} recovery={false}>This part didn't respond. It retries on its own.</ErrorCard>}</Show>
        <Show when={tasksOverview.data && !templatesSectionError()} fallback={
          <Show when={!tasksOverview.data} fallback={<EmptyState icon={<CloudOff />} label="Templates aren't available right now" hint="They'll show up here as soon as the agent service responds." />}>
            <SkeletonGrid count={4} minCardHeight='120px' />
          </Show>
        }>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <For each={templates()}>
              {(template) => (
                <Button
                  type="button"
                  variant="outline"
                  class={`h-auto w-full flex-col items-stretch justify-start whitespace-normal rounded-lg bg-card p-4 text-left font-normal ${selectedTemplate() === template.id ? 'border-primary/40 bg-primary/5' : ''}`}
                  onClick={() => setSelectedTemplate(template.id)}
                >
                  <div class="flex items-center justify-between gap-2 mb-1">
                    <span class="font-semibold text-base text-foreground">{template.name}</span>
                    <StatusBadge status={template.category} tone={categoryTone(template.category)} />
                  </div>
                  <p class="text-sm text-muted-foreground leading-relaxed mb-2">{template.description}</p>
                  <div class="flex gap-1 flex-wrap">
                    <For each={template.recommendedModels.slice(0, 2)}>
                      {(model) => <span class="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">{model}</span>}
                    </For>
                  </div>
                </Button>
              )}
            </For>
          </div>
        </Show>
      </Section>


      <Show when={selectedTemplate()}>
        <Section
          title={`Run: ${templates().find(t => t.id === selectedTemplate())?.name ?? 'task'}`}
          description="Free models cost nothing; paid models bill against the AI budget."
          action={<Button variant="outline" size="sm" onClick={() => setSelectedTemplate(null)}>Choose another template</Button>}
          class="[&_label]:mt-3"
        >
          <label class="flex flex-col gap-1 text-sm text-muted-foreground">
            <span>Model</span>
            <NativeSelect value={selectedModel()} onChange={(e) => setSelectedModel(e.currentTarget.value)} {...writeGuard()}>
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
              {...writeGuard()}
            />
          </label>
          <div class="flex items-center gap-2 mt-2">
            <Button writes
              size="sm"
              disabled={submitting() || !prompt().trim()}
              onClick={submit}
            >
              {submitting() ? 'Starting…' : 'Run agent'}
            </Button>
            <Show when={error()}>
              <span class="text-sm text-destructive">{error()}</span>
            </Show>
          </div>
        </Section>
      </Show>

      {/* Schedules — recurring agent tasks */}
      <Section
        title="Schedules"
        count={schedules().length}
        description="Recurring tasks run automatically. Results land in Recent tasks."
        action={<Button writes variant="outline" size="sm" onClick={() => { setCreatingSchedule(true); setError(null) }}><Plus aria-hidden="true" /> New schedule</Button>}
      >
        <FormDrawer
          open={creatingSchedule()}
          onOpenChange={setCreatingSchedule}
          title="New schedule"
          description="A task that repeats on its own. Results land in Recent tasks."
          submitLabel="Create schedule"
          pendingLabel="Creating…"
          pending={submitting()}
          error={error()}
          onSubmit={() => void createSchedule()}
        >
          <Field label="Template">
            <NativeSelect required value={selectedTemplate() ?? ''} onChange={(e) => setSelectedTemplate(e.currentTarget.value || null)}>
              <option value="">Choose…</option>
              <For each={templates()}>{template => <option value={template.id}>{template.name}</option>}</For>
            </NativeSelect>
          </Field>
          <Field label="Model" hint="Free models cost nothing; paid models bill against the AI budget.">
            <NativeSelect value={selectedModel()} onChange={(e) => setSelectedModel(e.currentTarget.value)}>
              <For each={models()?.models ?? []}>
                {(model) => <option value={model.id}>{model.name} {model.paid ? '(paid)' : '(free)'} — {model.providerName}</option>}
              </For>
            </NativeSelect>
          </Field>
          <Field label="What the agent should do">
            <Textarea
              required rows={5} maxlength={8000}
              value={prompt()}
              onInput={(e) => setPrompt(e.currentTarget.value)}
              placeholder="Write a weekly round-up of new press mentions"
            />
          </Field>
          <Field label="Interval (minutes)" hint="Between 60 (hourly) and 10080 (weekly). 1440 is once a day.">
            <Input required type="number" min="60" max="10080" step="1" inputmode="numeric" value={scheduleInterval()} onInput={(e) => setScheduleInterval(parseInt(e.currentTarget.value, 10) || 1440)} />
          </Field>
        </FormDrawer>
        <Show when={sectionError(schedulesSectionError())}>{msg => <ErrorCard title="Couldn't load agent schedules" error={unavailableError(msg())} recovery={false}>This part didn't respond. It retries on its own.</ErrorCard>}</Show>
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
                      <Button writes variant="ghost" size="sm" disabled={scheduleBusy() === sched.id} onClick={() => toggleSchedule(sched.id, !sched.enabled)}>
                        {scheduleBusy() === sched.id ? '…' : sched.enabled ? 'Enabled' : 'Disabled'}
                      </Button>
                    </TableCell>
                    <TableCell class="text-muted-foreground">{sched.last_run_at ? formatIsoAge(sched.last_run_at) : 'never'}</TableCell>
                    <TableCell class="text-muted-foreground">{sched.next_run_at ? formatIsoAge(sched.next_run_at) : '—'}</TableCell>
                    <TableCell><Button writes variant="destructive-ghost" size="sm" disabled={scheduleBusy() === sched.id} onClick={() => deleteSchedule(sched.id, templateName(sched.template_id))}>Delete</Button></TableCell>
                  </TableRow>
                )}
              </For>
            </TableBody>
          </Table>
        </Show>
        <Show when={schedules().length === 0 && !schedulesSectionError()}>
          <EmptyState icon={<Workflow />} label="No schedules configured" hint="Automate recurring intelligence tasks." />
        </Show>
      </Section>

      <Section title="Recent tasks" count={tasks().length} description="Every run, started here or by a schedule. Completed tasks show full output.">
        <Show when={sectionError(tasksSectionError())}>{msg => <ErrorCard title="Couldn't load the task list" error={unavailableError(msg())} recovery={false}>This part didn't respond. It retries on its own.</ErrorCard>}</Show>
        <Show when={tasksOverview.data && !tasksSectionError()} fallback={
          <Show when={!tasksOverview.data} fallback={<EmptyState icon={<CloudOff />} label="Tasks aren't available right now" hint="They'll show up here as soon as the agent service responds." />}>
            <SkeletonRows count={4} />
          </Show>
        }>
          <Show when={tasks().length > 0} fallback={<EmptyState icon={<Workflow />} label="No tasks yet" hint="Tasks appear once the intelligence or a schedule dispatches them." />}>
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
              <For each={showAllTasks() ? tasks() : tasks().slice(0, MAX_VISIBLE_TASKS)}>
                {(task) => (
                  <TableRow>
                    <TableCell>{templateName(task.template_id)}</TableCell>
                    <TableCell><StatusBadge status={task.status} tone={statusTone(task.status)} /></TableCell>
                    <TableCell class="text-muted-foreground">{formatIsoAge(task.created_at)}</TableCell>
                    <TableCell>
                      <Show when={task.status === 'completed'}>
                        <Button variant="ghost" size="sm" onClick={() => viewResult(task.id)}>View result</Button>
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
          <Show when={tasks().length > MAX_VISIBLE_TASKS}>
            <Button variant="ghost" size="sm" class="mt-2" onClick={() => setShowAllTasks(s => !s)}>
              {showAllTasks() ? 'Show fewer' : `Show all ${tasks().length}`}
            </Button>
          </Show>
          </Show>
        </Show>
      </Section>
      </div>
      </TabPanel>

      <Dialog
        open={viewingResult() !== null}
        onClose={() => setViewingResult(null)}
        label="Agent task result"
        title="Result"
        class="max-w-2xl"
        footer={<>
          <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard.writeText(viewingResult()?.content ?? '').catch(() => {}) }}>Copy</Button>
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
                  <div class="p-3 rounded-lg border border-border bg-background">
                    <div class="flex items-center gap-2 mb-2">
                      <Badge>{outcome.kind.replaceAll('_', ' ')}</Badge>
                      <Badge>confidence {confidencePercent(outcome.confidence_basis_points)}</Badge>
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
