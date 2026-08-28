import { For, Show, createResource, createSignal, createMemo } from 'solid-js'
import { api, request } from '../lib/api'
import { errorMessage } from '../lib/format'
import { refreshTick } from '../lib/refresh'
import { StatusBadge } from './StatusBadge'
import { LlmProviderIcon } from './ProviderIcon'
import type { AgentProvider, AgentCredential, AgentModel } from '../lib/types'

// ─── Types ──────────────────────────────────────────────────────────────

interface PremiumModel {
  id: string
  provider: string
  name: string
  best_for: string
  agentic: boolean
  price_input_per_mtok: number
  price_output_per_mtok: number
}

interface PremiumTask {
  id: string
  template_id: string
  model_id: string
  model_provider: string | null
  tier: string
  cost_micro_usd: number
  status: string
  created_at: string
  completed_at: string | null
}

interface PremiumUsage {
  connected_providers: string[]
  premium_models: PremiumModel[]
  monthly_spend_micro_usd: number
  budget_micro_usd: number
  tasks: PremiumTask[]
}

// ─── Helpers ────────────────────────────────────────────────────────────

const formatUsd = (microUsd: number): string => {
  const usd = microUsd / 1_000_000
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

const budgetPct = (spent: number, budget: number): number => {
  if (budget <= 0) return 0
  return Math.min(100, (spent / budget) * 100)
}

const taskStatusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'completed' ? 'good' :
  status === 'running' ? 'warn' :
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

const credTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'active' ? 'good' : status === 'invalid' ? 'bad' : 'muted'

// ─── Icons ──────────────────────────────────────────────────────────────

const CrownIcon = (props: { size?: number }) => (
  <svg width={props.size ?? 16} height={props.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 18h18M3 18l2-10 5 5 2-8 2 8 5-5 2 10" />
  </svg>
)

const RobotIcon = (props: { size?: number }) => (
  <svg width={props.size ?? 14} height={props.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="4" y="8" width="16" height="12" rx="2" />
    <path d="M12 8V4M8 14h.01M16 14h.01" />
    <circle cx="12" cy="3" r="1" fill="currentColor" stroke="none" />
  </svg>
)

const SparkIcon = (props: { size?: number }) => (
  <svg width={props.size ?? 14} height={props.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
  </svg>
)

const KeyIcon = (props: { size?: number }) => (
  <svg width={props.size ?? 14} height={props.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="8" cy="15" r="4" />
    <path d="M10.85 12.15L19 4M18 5l2 2M15 8l2 2" />
  </svg>
)

const CheckIcon = (props: { size?: number }) => (
  <svg width={props.size ?? 14} height={props.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

// ─── Component ──────────────────────────────────────────────────────────

export function PremiumAIPanel(props: { slug: string }) {
  const [localRefresh, setLocalRefresh] = createSignal(0)
  const refreshSource = () => refreshTick() + localRefresh()
  const [error, setError] = createSignal<string | null>(null)
  const [connectingProvider, setConnectingProvider] = createSignal<string | null>(null)
  const [apiKeyInput, setApiKeyInput] = createSignal('')
  const [showKeyInputFor, setShowKeyInputFor] = createSignal<string | null>(null)
  const [oauthDevice, setOauthDevice] = createSignal<{ provider: string; state: string; user_code?: string; verification_uri?: string } | null>(null)

  // Fetch premium usage, providers, credentials, and models in parallel
  const [usage] = createResource(refreshSource, async () => {
    const data = await request<PremiumUsage>(`/tenants/${props.slug}/agents/premium/usage`)
    return data
  })

  const [providers] = createResource(refreshSource, async () => {
    const data = await api.agentProviders(props.slug)
    return data.providers
  })

  const [credentials, { refetch: refetchCreds }] = createResource(refreshSource, async () => {
    const data = await api.agentCredentials(props.slug)
    return data.credentials
  })

  const [models] = createResource(refreshSource, async () => {
    const data = await api.agentModels(props.slug)
    return data
  })

  // Only show paid providers (the premium ones)
  const premiumProviders = createMemo(() =>
    (providers() ?? []).filter((p: AgentProvider) => !p.freeTier && p.authMethod !== 'none')
  )

  const connectedCount = createMemo(() =>
    premiumProviders().filter((p: AgentProvider) =>
      (credentials() ?? []).some((c: AgentCredential) => c.provider === p.id && c.status === 'active')
    ).length
  )

  const availableModelCount = createMemo(() =>
    (models()?.models ?? []).filter((m: AgentModel) => m.paid).length
  )

  // ─── Connect / disconnect handlers ──────────────────────────────────

  const handleConnectApiKey = async (providerId: string) => {
    const key = apiKeyInput().trim()
    if (!key) return
    setConnectingProvider(providerId)
    setError(null)
    try {
      await api.agentPasteCredential(props.slug, { provider: providerId, api_key: key, label: '' })
      setApiKeyInput('')
      setShowKeyInputFor(null)
      refetchCreds()
    } catch (e) {
      setError(errorMessage(e, 'Failed to connect provider'))
    } finally {
      setConnectingProvider(null)
    }
  }

  const handleStartOauth = async (providerId: string) => {
    setConnectingProvider(providerId)
    setError(null)
    try {
      const redirectUri = `${window.location.origin}/tenants/${encodeURIComponent(props.slug)}/agents/oauth/${encodeURIComponent(providerId)}/callback`
      const result = await api.startAgentOauth(props.slug, providerId, redirectUri)
      if (result.mode === 'device' && result.state) {
        setOauthDevice({ provider: providerId, state: result.state, user_code: result.user_code, verification_uri: result.verification_uri })
      } else if (result.url) {
        window.location.href = result.url
      } else {
        throw new Error('OAuth did not return a redirect URL or device code')
      }
    } catch (e) {
      setError(errorMessage(e, `Failed to start ${providerId} OAuth`))
    } finally {
      setConnectingProvider(null)
    }
  }

  const handlePollOauth = async () => {
    const device = oauthDevice()
    if (!device) return
    try {
      const result = await api.pollAgentOauth(props.slug, device.provider, device.state)
      if (result.status === 'complete') {
        setOauthDevice(null)
        refetchCreds()
      } else if (result.status === 'failed') {
        setError(result.error ?? 'OAuth device flow failed')
        setOauthDevice(null)
      }
    } catch (e) {
      setError(errorMessage(e, 'OAuth poll failed'))
      setOauthDevice(null)
    }
  }

  const handleDisconnect = async (providerId: string) => {
    setError(null)
    try {
      await api.agentDeleteCredential(props.slug, providerId)
      refetchCreds()
    } catch (e) {
      setError(errorMessage(e, 'Failed to disconnect'))
    }
  }

  return (
    <Show
      when={usage() && providers()}
      fallback={<div class="premium-loading">Loading premium AI dashboard…</div>}
    >
      <div class="premium-panel">
        {/* ─── Hero: Budget + Status ─────────────────────────────── */}
        <section class="premium-hero">
          <div class="premium-hero-left">
            <div class="premium-hero-badge">
              <CrownIcon size={16} />
              <span>Premium AI</span>
            </div>
            <div class="premium-budget-amount">
              <span class="premium-budget-spent">{formatUsd(usage()!.monthly_spend_micro_usd)}</span>
              <span class="premium-budget-limit">of {formatUsd(usage()!.budget_micro_usd)} / mo</span>
            </div>
            <div class="premium-budget-bar">
              <div
                class="premium-budget-fill"
                classList={{
                  'tier-ok': budgetPct(usage()!.monthly_spend_micro_usd, usage()!.budget_micro_usd) < 50,
                  'tier-warn': budgetPct(usage()!.monthly_spend_micro_usd, usage()!.budget_micro_usd) >= 50 && budgetPct(usage()!.monthly_spend_micro_usd, usage()!.budget_micro_usd) < 90,
                  'tier-crit': budgetPct(usage()!.monthly_spend_micro_usd, usage()!.budget_micro_usd) >= 90,
                }}
                style={{ width: `${Math.max(2, budgetPct(usage()!.monthly_spend_micro_usd, usage()!.budget_micro_usd))}%` }}
              />
            </div>
          </div>
          <div class="premium-hero-right">
            <div class="premium-stat">
              <span class="premium-stat-value">{connectedCount()}</span>
              <span class="premium-stat-label">Connected</span>
            </div>
            <div class="premium-stat">
              <span class="premium-stat-value">{availableModelCount()}</span>
              <span class="premium-stat-label">Models</span>
            </div>
            <div class="premium-stat">
              <span class="premium-stat-value">{usage()!.tasks.length}</span>
              <span class="premium-stat-label">Tasks (30d)</span>
            </div>
          </div>
        </section>

        <Show when={error()}>
          <div class="premium-error">{error()}</div>
        </Show>

        {/* ─── OAuth2 / API Key Connectors ───────────────────────── */}
        <section class="premium-section">
          <div class="premium-section-head">
            <h3><KeyIcon size={16} /> Premium Provider Connectors</h3>
            <Show when={connectedCount() > 0}>
              <span class="premium-connection-summary">
                <span class="agent-connection-dot ok" />
                {connectedCount()} of {premiumProviders().length} connected
              </span>
            </Show>
          </div>
          <p class="premium-section-intro">
            Connect your own paid AI accounts to unlock frontier models for the autopilot brain.
            API keys are encrypted at rest. OAuth2 sign-in is available for select providers.
          </p>

          <div class="premium-connector-grid">
            <For each={premiumProviders()}>
              {(provider) => {
                const cred = () => (credentials() ?? []).find((c: AgentCredential) => c.provider === provider.id)
                const isConnected = () => cred()?.status === 'active'
                return (
                  <div class="premium-connector-card" classList={{ connected: isConnected() }}>
                    <div class="premium-connector-top">
                      <div class="premium-connector-logo">
                        <LlmProviderIcon providerId={provider.id} size={28} />
                      </div>
                      <div class="premium-connector-info">
                        <div class="premium-connector-name">{provider.name}</div>
                        <div class="premium-connector-models">{provider.modelCount} models</div>
                      </div>
                      <Show when={isConnected()}>
                        <span class="premium-connected-badge">
                          <CheckIcon size={12} /> Connected
                        </span>
                      </Show>
                    </div>

                    <div class="premium-connector-desc">{provider.description}</div>

                    {/* Connection actions */}
                    <div class="premium-connector-actions">
                      <Show when={!isConnected()}>
                        {/* API key input */}
                        <Show when={provider.authMethod === 'api_key'}>
                          <Show when={showKeyInputFor() === provider.id}>
                            <div class="premium-key-row">
                              <input
                                class="premium-key-input"
                                type="password"
                                placeholder="Paste API key…"
                                value={apiKeyInput()}
                                onInput={(e) => setApiKeyInput(e.currentTarget.value)}
                              />
                              <button
                                class="premium-btn-connect"
                                disabled={connectingProvider() === provider.id || !apiKeyInput().trim()}
                                onClick={() => handleConnectApiKey(provider.id)}
                              >
                                {connectingProvider() === provider.id ? '…' : 'Connect'}
                              </button>
                              <button class="premium-btn-cancel" onClick={() => { setShowKeyInputFor(null); setApiKeyInput('') }}>
                                Cancel
                              </button>
                            </div>
                          </Show>
                          <Show when={showKeyInputFor() !== provider.id}>
                            <button class="premium-btn-key" onClick={() => setShowKeyInputFor(provider.id)}>
                              <KeyIcon size={13} /> Add API Key
                            </button>
                          </Show>
                        </Show>

                        {/* OAuth button */}
                        <Show when={provider.authMethod === 'oauth'}>
                          <button
                            class={`oauth-btn oauth-btn-${provider.id}`}
                            disabled={connectingProvider() === provider.id}
                            onClick={() => handleStartOauth(provider.id)}
                          >
                            <LlmProviderIcon providerId={provider.id} size={16} />
                            Sign in with {provider.name}
                          </button>
                          <Show when={provider.oauth?.experimental}>
                            <span class="premium-beta-chip">beta</span>
                          </Show>
                        </Show>
                      </Show>

                      {/* Disconnect when connected */}
                      <Show when={isConnected()}>
                        <button class="agent-btn-danger" onClick={() => handleDisconnect(provider.id)}>
                          Disconnect
                        </button>
                      </Show>
                    </div>
                  </div>
                )
              }}
            </For>
          </div>

          {/* OAuth device flow modal */}
          <Show when={oauthDevice()}>
            {(device) => (
              <div class="premium-device-overlay" onClick={() => setOauthDevice(null)}>
                <div class="premium-device-modal" onClick={(e) => e.stopPropagation()}>
                  <h4>Sign in to {device().provider}</h4>
                  <Show when={device().verification_uri}>
                    <p class="premium-device-instructions">
                      Visit <a href={device().verification_uri} target="_blank" rel="noopener">{device().verification_uri}</a>
                      {' '}and enter the code:
                    </p>
                    <div class="premium-device-code">{device().user_code ?? '—'}</div>
                  </Show>
                  <Show when={!device().verification_uri}>
                    <p class="premium-device-instructions">Waiting for authorization…</p>
                  </Show>
                  <div class="premium-device-actions">
                    <button class="premium-btn-connect" onClick={handlePollOauth}>Check Status</button>
                    <button class="premium-btn-cancel" onClick={() => setOauthDevice(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </Show>
        </section>

        {/* ─── Connected Premium Models ──────────────────────────── */}
        <section class="premium-section">
          <div class="premium-section-head">
            <h3><SparkIcon size={16} /> Connected Premium Models</h3>
            <span class="premium-count-chip">{usage()!.premium_models.length}</span>
          </div>
          <Show
            when={usage()!.premium_models.length > 0}
            fallback={
              <div class="premium-empty">
                <div class="premium-empty-icon"><SparkIcon size={28} /></div>
                <p>No premium models active yet.</p>
                <span>Connect a provider above to unlock frontier models for the autopilot brain.</span>
              </div>
            }
          >
            <div class="premium-model-grid">
              <For each={usage()!.premium_models}>
                {(model) => (
                  <div class="premium-model-card">
                    <div class="premium-model-header">
                      <span class="premium-model-name">{model.name}</span>
                      <Show when={model.agentic}>
                        <span class="premium-agentic-chip">
                          <RobotIcon size={11} /> agentic
                        </span>
                      </Show>
                    </div>
                    <div class="premium-model-best">{model.best_for}</div>
                    <div class="premium-model-pricing">
                      <span>${model.price_input_per_mtok}/M in</span>
                      <span>${model.price_output_per_mtok}/M out</span>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </section>

        {/* ─── Recent Premium Tasks ──────────────────────────────── */}
        <section class="premium-section">
          <div class="premium-section-head">
            <h3>Recent Premium Tasks</h3>
            <span class="premium-count-chip">{usage()!.tasks.length}</span>
          </div>
          <Show
            when={usage()!.tasks.length > 0}
            fallback={
              <div class="premium-empty-sm">
                No premium tasks yet. The brain routes complex tasks here automatically.
              </div>
            }
          >
            <div class="premium-task-list">
              <For each={usage()!.tasks.slice(0, 10)}>
                {(task) => (
                  <div class="premium-task-row">
                    <StatusBadge status={task.status} tone={taskStatusTone(task.status)} />
                    <span class="premium-task-template">{task.template_id}</span>
                    <span class="premium-task-provider">{task.model_provider ?? '—'}</span>
                    <Show when={task.cost_micro_usd > 0}>
                      <span class="premium-task-cost">{formatUsd(task.cost_micro_usd)}</span>
                    </Show>
                    <span class="premium-task-age">{formatAge(task.created_at)}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </section>
      </div>
    </Show>
  )
}
