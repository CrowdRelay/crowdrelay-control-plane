import { For, Show, createEffect, createResource, createSignal } from 'solid-js'
import { request } from '../lib/api'
import { errorMessage } from '../lib/format'
import { StatusBadge } from './StatusBadge'

interface AgentTemplate {
  id: string
  name: string
  description: string
  category: 'content' | 'research' | 'analysis'
  recommendedModels: string[]
  dataScope: string[]
}

interface AgentTask {
  id: string
  template_id: string
  model_id: string
  prompt: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  error: string | null
  created_at: string
  completed_at: string | null
}

interface AgentTaskResult {
  id: string
  task_id: string
  content: string
  format: string
  model_used: string
  tokens_in: number | null
  tokens_out: number | null
  duration_ms: number | null
}

interface ProviderHealth {
  models: Array<{
    id: string
    provider: string
    name: string
    free_limit: { requestsPerDay?: number; rateLimitRpm?: number }
    context_window: number
    best_for: string
    requires_key: boolean
  }>
  health: Array<{
    provider: string
    model_id: string
    status: string
    requests_remaining: number | null
    last_error: string | null
  }>
}

const categoryTone = (cat: string): 'good' | 'warn' | 'muted' =>
  cat === 'content' ? 'good' : cat === 'research' ? 'warn' : 'muted'

const statusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'completed' ? 'good' :
  status === 'running' || status === 'queued' ? 'warn' :
  status === 'failed' ? 'bad' : 'muted'

const formatAge = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function AgentPanel(props: { slug: string }) {
  const [selectedTemplate, setSelectedTemplate] = createSignal<string | null>(null)
  const [selectedModel, setSelectedModel] = createSignal<string>('zen-default')
  const [prompt, setPrompt] = createSignal('')
  const [submitting, setSubmitting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [viewingResult, setViewingResult] = createSignal<AgentTaskResult | null>(null)
  const [refreshKey, setRefreshKey] = createSignal(0)

  const [templates] = createResource(async () => {
    const data = await request<{ templates: AgentTemplate[] }>(`/tenants/${props.slug}/agents/templates`)
    return data.templates
  })

  const [tasks, { refetch: refetchTasks }] = createResource(refreshKey, async () => {
    const data = await request<{ tasks: AgentTask[] }>(`/tenants/${props.slug}/agents/tasks`)
    return data.tasks
  })

  const [health] = createResource(async () => {
    try {
      return await request<ProviderHealth>(`/tenants/${props.slug}/agents/health`)
    } catch {
      return null
    }
  })

  // Auto-refresh tasks every 5s when there are running/queued tasks
  createEffect(() => {
    const current = tasks()
    if (!current) return
    const hasActive = current.some(t => t.status === 'running' || t.status === 'queued')
    if (hasActive) {
      const timer = setInterval(() => setRefreshKey(k => k + 1), 5000)
      return () => clearInterval(timer)
    }
  })

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
      setRefreshKey(k => k + 1)
    } catch (err) {
      setError(errorMessage(err, 'Failed to start task'))
    } finally {
      setSubmitting(false)
    }
  }

  const viewResult = async (taskId: string) => {
    try {
      const result = await request<AgentTaskResult>(`/tenants/${props.slug}/agents/tasks/${taskId}/result`)
      setViewingResult(result)
    } catch (err) {
      setError(errorMessage(err, 'Failed to load result'))
    }
  }

  return (
    <div class="agent-panel">
      <div class="agent-section">
        <h3>Available Agents</h3>
        <Show when={templates()} fallback={<p class="muted">Loading templates…</p>}>
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
          <h3>Task</h3>
          <label class="agent-field">
            <span>Model</span>
            <select value={selectedModel()} onChange={(e) => setSelectedModel(e.currentTarget.value)}>
              <option value="zen-default">Zen Default (128K, 100 req/day free)</option>
              <option value="zen-fast">Zen Fast (32K, very fast)</option>
              <option value="deepseek-v4-flash-free">DeepSeek V4 Flash Free (200K)</option>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash (250 req/day free)</option>
              <option value="groq/llama-3.3-70b">Groq Llama 3.3 70B (fast)</option>
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

      <div class="agent-section">
        <h3>Recent Tasks</h3>
        <Show when={tasks()} fallback={<p class="muted">No tasks yet.</p>}>
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
              <For each={tasks()?.slice(0, 10)}>
                {(task) => (
                  <tr>
                    <td>{task.template_id}</td>
                    <td><StatusBadge status={task.status} tone={statusTone(task.status)} /></td>
                    <td class="muted">{formatAge(task.created_at)}</td>
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

      <Show when={health()}>
        <div class="agent-section">
          <h3>Provider Health</h3>
          <div class="agent-health-grid">
            <For each={health()?.models}>
              {(model) => {
                const modelHealth = health()?.health.find((h) => h.model_id === model.id)
                const remaining = modelHealth?.requests_remaining
                const limit = model.free_limit.requestsPerDay
                return (
                  <div class="agent-health-card">
                    <div class="agent-health-name">{model.name}</div>
                    <div class="agent-health-status">
                      <StatusBadge
                        status={modelHealth?.status ?? 'unknown'}
                        tone={modelHealth?.status === 'healthy' ? 'good' : modelHealth?.status === 'degraded' ? 'warn' : 'muted'}
                      />
                    </div>
                    <div class="agent-health-quota">
                      {remaining != null && limit != null ? `${remaining}/${limit} requests left` : model.best_for}
                    </div>
                  </div>
                )
              }}
            </For>
          </div>
        </div>
      </Show>

      <Show when={viewingResult()}>
        <div class="agent-result-overlay" onClick={() => setViewingResult(null)}>
          <div class="agent-result-modal" onClick={(e) => e.stopPropagation()}>
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
            <pre class="agent-result-content">{viewingResult()?.content}</pre>
            <div class="agent-result-actions">
              <button onClick={() => navigator.clipboard.writeText(viewingResult()?.content ?? '')}>
                Copy
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
