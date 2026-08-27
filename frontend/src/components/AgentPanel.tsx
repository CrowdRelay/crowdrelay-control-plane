import { For, Show, createEffect, createResource, createSignal } from 'solid-js'
import { request } from '../lib/api'
import { errorMessage } from '../lib/format'
import { refreshTick } from '../lib/refresh'
import { StatusBadge } from './StatusBadge'
import { LlmProviderIcon } from './ProviderIcon'

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

// --- Brain icon (autopilot brain → agent suggestions) ---
const BrainIcon = (props: { size?: number }) => (
  <svg width={props.size ?? 18} height={props.size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 7 17a3 3 0 0 0 2 4 3 3 0 0 0 3-3V3a3 3 0 0 0-3 0z" />
    <path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8A3 3 0 0 1 17 17a3 3 0 0 1-2 4 3 3 0 0 1-3-3" opacity="0.5" />
  </svg>
)

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

interface ProviderSummary {
  id: string
  name: string
  description: string
  authMethod: 'api_key' | 'oauth' | 'none'
  freeTier: boolean
  modelCount: number
  oauthScopes: string[]
  oauthAvailable: boolean
}

interface Credential {
  id: string
  provider: string
  label: string
  credential_type: 'api_key' | 'oauth_refresh_token'
  status: 'active' | 'revoked' | 'invalid'
  last_validated_at: string | null
  last_validation_error: string | null
  created_at: string
}

interface AvailableModel {
  id: string
  name: string
  contextWindow: number
  bestFor: string
  paid: boolean
  providerId: string
  providerName: string
}

interface TaskSuggestion {
  id: string
  template_id: string
  model_id: string
  title: string
  description: string
  prefill_prompt: string
  priority: 'high' | 'medium' | 'low'
  reason: string
}

const categoryTone = (cat: string): 'good' | 'warn' | 'muted' =>
  cat === 'content' ? 'good' : cat === 'research' ? 'warn' : 'muted'

const statusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'completed' ? 'good' :
  status === 'running' || status === 'queued' ? 'warn' :
  status === 'failed' ? 'bad' : 'muted'

const credTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'active' ? 'good' : status === 'invalid' ? 'bad' : 'muted'

const priorityTone = (p: string): 'good' | 'warn' | 'muted' =>
  p === 'high' ? 'good' : p === 'medium' ? 'warn' : 'muted'

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
  const [selectedModel, setSelectedModel] = createSignal<string>('laguna-s-2.1-free')
  const [prompt, setPrompt] = createSignal('')
  const [submitting, setSubmitting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [viewingResult, setViewingResult] = createSignal<AgentTaskResult | null>(null)
  const [localRefresh, setLocalRefresh] = createSignal(0)
  const [pastingProvider, setPastingProvider] = createSignal<string | null>(null)
  const [apiKeyInput, setApiKeyInput] = createSignal('')
  const [connecting, setConnecting] = createSignal(false)

  const [templates] = createResource(async () => {
    const data = await request<{ templates: AgentTemplate[] }>(`/tenants/${props.slug}/agents/templates`)
    return data.templates
  })

  // Combine global refresh tick with local refresh (after submit/disconnect).
  // Global tick drives periodic refresh; local forces immediate after mutations.
  const taskRefreshSource = () => refreshTick() + localRefresh()

  const [tasks] = createResource(taskRefreshSource, async () => {
    const data = await request<{ tasks: AgentTask[] }>(`/tenants/${props.slug}/agents/tasks`)
    return data.tasks
  })

  const [providers] = createResource(async () => {
    const data = await request<{ providers: ProviderSummary[] }>(`/tenants/${props.slug}/agents/providers`)
    return data.providers
  })

  const [credentials, { refetch: refetchCreds }] = createResource(async () => {
    const data = await request<{ credentials: Credential[] }>(`/tenants/${props.slug}/agents/credentials`)
    return data.credentials
  })

  const [models, { refetch: refetchModels }] = createResource(async () => {
    const data = await request<{ models: AvailableModel[]; connectedProviders: string[] }>(`/tenants/${props.slug}/agents/models`)
    return data
  })

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

  const [suggestions] = createResource(async () => {
    try {
      const data = await request<{ suggestions: TaskSuggestion[] }>(`/tenants/${props.slug}/agents/suggestions`)
      return data.suggestions
    } catch {
      return null
    }
  })

  // Auto-refresh for running/queued tasks now driven by global refresh tick.
  // When tasks are active, bump local refresh so the resource refetches on the
  // next global tick. No independent timer — one clock for the whole page.

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
      setLocalRefresh(k => k + 1)
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

  const pasteKey = async () => {
    const provider = pastingProvider()
    if (!provider || !apiKeyInput().trim()) return
    setConnecting(true)
    setError(null)
    try {
      await request(`/tenants/${props.slug}/agents/credentials`, {
        method: 'POST',
        body: JSON.stringify({
          provider,
          api_key: apiKeyInput().trim(),
          label: '',
        }),
      })
      setApiKeyInput('')
      setPastingProvider(null)
      refetchCreds()
      refetchModels()
    } catch (err) {
      setError(errorMessage(err, 'Failed to connect provider'))
    } finally {
      setConnecting(false)
    }
  }

  const startGoogleOAuth = async () => {
    setError(null)
    try {
      const data = await request<{ url: string }>(`/tenants/${props.slug}/agents/oauth/google/start`)
      if (!data.url || typeof data.url !== 'string') {
        throw new Error('OAuth start did not return a redirect URL')
      }
      window.location.href = data.url
    } catch (err) {
      setError(errorMessage(err, 'Failed to start Google OAuth'))
    }
  }

  const disconnect = async (provider: string) => {
    try {
      await request(`/tenants/${props.slug}/agents/credentials/${provider}`, { method: 'DELETE' })
      refetchCreds()
      refetchModels()
    } catch (err) {
      setError(errorMessage(err, 'Failed to disconnect'))
    }
  }

  const connectedCount = () => credentials()?.length ?? 0
  const availableModelCount = () => models()?.models.length ?? 0

  return (
    <div class="agent-panel">
      {/* Provider connections — always visible, not behind a toggle */}
      <div class="agent-section">
        <div class="agent-section-head">
          <h3><AntIcon size={20} /> LLM Provider Connections</h3>
          <Show when={connectedCount() > 0}>
            <span class="agent-connection-summary">
              <span class="agent-connection-dot ok" />
              {connectedCount()} connected · {availableModelCount()} models available
            </span>
          </Show>
        </div>
        <p class="agent-section-intro">
          Connect AI providers to power agent tasks. The autopilot brain uses connected models to research audiences, draft content, and analyse campaigns. Free-tier models work without any key.
        </p>

        <div class="agent-providers">
          <For each={providers()}>
            {(provider) => {
              const cred = () => credentials()?.find(c => c.provider === provider.id)
              return (
                <div class="agent-provider-card" classList={{ connected: !!cred() }}>
                  <div class="agent-provider-logo">
                    <LlmProviderIcon providerId={provider.id} size={28} />
                  </div>
                  <div class="agent-provider-info">
                    <div class="agent-provider-name">{provider.name}</div>
                    <div class="agent-provider-desc">{provider.description}</div>
                    <Show when={cred()}>
                      <div class="agent-provider-status">
                        <StatusBadge status={cred()!.status} tone={credTone(cred()!.status)} />
                        <Show when={cred()!.last_validated_at}>
                          <span class="muted">validated {formatAge(cred()!.last_validated_at!)}</span>
                        </Show>
                      </div>
                    </Show>
                  </div>
                  <div class="agent-provider-actions">
                    <Show when={provider.authMethod === 'none'}>
                      <StatusBadge status="free" tone="good" />
                    </Show>
                    <Show when={provider.authMethod === 'api_key' && !cred()}>
                      <button class="agent-btn" onClick={() => setPastingProvider(provider.id)}>
                        Paste API Key
                      </button>
                    </Show>
                    <Show when={provider.authMethod === 'api_key' && cred()}>
                      <button class="agent-btn-danger" onClick={() => disconnect(provider.id)}>
                        Disconnect
                      </button>
                    </Show>
                    <Show when={provider.id === 'google' && provider.oauthAvailable && !cred()}>
                      <button class="agent-btn" onClick={startGoogleOAuth}>
                        Connect with Google
                      </button>
                    </Show>
                    <Show when={provider.id === 'google' && cred()}>
                      <button class="agent-btn-danger" onClick={() => disconnect(provider.id)}>
                        Disconnect
                      </button>
                    </Show>
                  </div>
                </div>
              )
            }}
          </For>
        </div>
      </div>

      {/* Autopilot brain → agent suggestions — the bridge between operations data and LLM execution */}
      <Show when={suggestions() && suggestions()!.length > 0}>
        <div class="agent-section">
          <div class="agent-section-head">
            <h3><BrainIcon size={18} /> From the Autopilot Brain</h3>
          </div>
          <p class="agent-section-intro">Data-driven task suggestions based on your events, fan growth, and campaign performance. Click to pre-fill and run.</p>
          <div class="agent-suggestions">
            <For each={suggestions()!.slice(0, 4)}>
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
          <h3>Agent Tasks</h3>
        </div>
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

      <Show when={pastingProvider()}>
        <div class="agent-result-overlay" onClick={() => setPastingProvider(null)}>
          <div class="agent-result-modal" onClick={(e) => e.stopPropagation()}>
            <div class="agent-result-header">
              <h3>Connect {providers()?.find(p => p.id === pastingProvider())?.name}</h3>
              <button class="link" onClick={() => setPastingProvider(null)}>Close</button>
            </div>
            <div class="agent-paste-body">
              <p class="muted">Paste your API key below. We'll validate it before storing it encrypted.</p>
              <input
                type="password"
                class="agent-key-input"
                placeholder="sk-..."
                value={apiKeyInput()}
                onInput={(e) => setApiKeyInput(e.currentTarget.value)}
              />
              <Show when={error()}>
                <span class="agent-error">{error()}</span>
              </Show>
            </div>
            <div class="agent-result-actions">
              <button
                onClick={pasteKey}
                disabled={connecting() || !apiKeyInput().trim()}
              >
                {connecting() ? 'Validating…' : 'Connect'}
              </button>
              <button class="link" onClick={() => setPastingProvider(null)}>Cancel</button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={selectedTemplate()}>
        <div class="agent-section">
          <h3>Task</h3>
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
