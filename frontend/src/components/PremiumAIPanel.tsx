import { For, Show, createResource, createSignal, createMemo } from 'solid-js'
import { api, request } from '../lib/api'
import { errorMessage, formatIsoAge } from '../lib/format'
import { refreshTick } from '../lib/refresh'
import { toast } from '../lib/toast'
import { StatusBadge } from './StatusBadge'
import { LlmProviderIconWithTier, ModelIcon } from './ProviderIcon'
import { EmptyState } from './EmptyState'
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

export function PremiumAIPanel(props: {
  slug: string
  providers?: AgentProvider[]
  credentials?: AgentCredential[]
  refetchCreds?: () => void
  /** When false (tab hidden), resources don't refetch on global refreshTick. */
  active?: boolean
  /** Shared models resource from parent (avoids duplicate /agents/models fetch). */
  models?: { models: AgentModel[]; connectedProviders: string[] } | null
}) {
  const [localRefresh, setLocalRefresh] = createSignal(0)
  // When the tab is hidden, freeze the refresh source so createResource
  // doesn't refetch on every global refreshTick. Local mutations still
  // trigger a refetch via triggerLocalRefresh() — the source changes from
  // -1 to localRefresh() which is > 0, causing a refetch.
  const refreshSource = () =>
    props.active === false ? -1 : refreshTick() + localRefresh()
  const triggerLocalRefresh = () => setLocalRefresh((v) => v + 1)
  const [error, setError] = createSignal<string | null>(null)
  const [connectingProvider, setConnectingProvider] = createSignal<string | null>(null)
  const [apiKeyInput, setApiKeyInput] = createSignal('')
  const [orgIdInput, setOrgIdInput] = createSignal('')
  const [showKeyInputFor, setShowKeyInputFor] = createSignal<string | null>(null)

  // Premium usage is unique to this panel — always fetch here.
  // The try/catch ensures the error signal is set even when the tab is
  // hidden, so the error card can render outside the usage() guard.
  const [usage] = createResource(refreshSource, async () => {
    try {
      const data = await request<PremiumUsage>(`/tenants/${props.slug}/agents/premium/usage`)
      return data
    } catch (err) {
      setError(errorMessage(err, 'Failed to load premium usage'))
      throw err
    }
  })

  // Models can be passed from the parent AgentPanel (shared resource,
  // avoids duplicate /agents/models fetch) or fetched here as fallback.
  const hasParentModels = () => props.models !== undefined
  const [fallbackModels] = createResource(refreshSource, async () => {
    if (hasParentModels()) return null
    const data = await api.agentModels(props.slug)
    return data
  })
  const models = () => props.models ?? fallbackModels() ?? null

  // Providers and credentials can be passed from the parent AgentPanel
  // (shared resources, no re-fetch on tab switch) or fetched here as fallback
  // for standalone usage. When the parent provides them, the fallback
  // resources return null immediately (no network fetch).
  const [fallbackProviders] = createResource(refreshSource, async () => {
    if (props.providers !== undefined) return null
    const data = await api.agentProviders(props.slug)
    return data.providers
  })
  const [fallbackCreds, { refetch: refetchFallbackCreds }] = createResource(refreshSource, async () => {
    if (props.credentials !== undefined) return null
    const data = await api.agentCredentials(props.slug)
    return data.credentials
  })

  const providers = () => props.providers ?? fallbackProviders() ?? []
  const credentials = () => props.credentials ?? fallbackCreds() ?? []
  const refetchCreds = () => {
    if (props.refetchCreds) props.refetchCreds()
    else refetchFallbackCreds()
  }

  // All providers — show every provider in one unified view.
  // Free models show a "no key needed" badge; paid models get API key connect.
  const allProviders = createMemo(() => providers())
  const freeProviders = createMemo(() =>
    allProviders().filter((p: AgentProvider) => p.freeTier || p.authMethod === 'none')
  )
  const apiKeyProviders = createMemo(() =>
    allProviders().filter((p: AgentProvider) => p.authMethod === 'api_key' && !p.freeTier)
  )

  const connectedCount = createMemo(() =>
    apiKeyProviders().filter((p: AgentProvider) =>
      credentials().some((c: AgentCredential) => c.provider === p.id && c.status === 'active')
    ).length
  )

  const availableModelCount = createMemo(() =>
    (models()?.models ?? []).filter((m: AgentModel) => m.paid).length
  )

  // Memoize budget percentage so it's computed once per render, not 5x.
  const budgetPctValue = createMemo(() => {
    const u = usage()
    if (!u) return 0
    return budgetPct(u.monthly_spend_micro_usd, u.budget_micro_usd)
  })

  // ─── Connect / disconnect handlers ──────────────────────────────────

  const handleConnectApiKey = async (providerId: string) => {
    const key = apiKeyInput().trim()
    if (!key) return
    // Cognition (Devin) requires an org ID in addition to the API key.
    const needsOrgId = providerId === 'cognition'
    const orgId = orgIdInput().trim()
    if (needsOrgId && !orgId) {
      setError('Cognition requires an organization ID (org-...)')
      return
    }
    setConnectingProvider(providerId)
    setError(null)
    try {
      await api.agentPasteCredential(props.slug, {
        provider: providerId,
        api_key: key,
        label: '',
        ...(needsOrgId ? { provider_account: orgId } : {}),
      })
      const provider = apiKeyProviders().find(p => p.id === providerId)
      toast.success(`Connected to ${provider?.name ?? providerId} — ${provider?.modelCount ?? 0} models unlocked`)
      setApiKeyInput('')
      setOrgIdInput('')
      setShowKeyInputFor(null)
      refetchCreds()
      triggerLocalRefresh()
    } catch (e) {
      const msg = errorMessage(e, 'Failed to connect provider')
      setError(msg)
      toast.error(msg)
    } finally {
      setConnectingProvider(null)
    }
  }

  const handleDisconnect = async (providerId: string) => {
    setError(null)
    try {
      await api.agentDeleteCredential(props.slug, providerId)
      const provider = apiKeyProviders().find(p => p.id === providerId)
      toast.info(`Disconnected from ${provider?.name ?? providerId}`)
      refetchCreds()
      triggerLocalRefresh()
    } catch (e) {
      const msg = errorMessage(e, 'Failed to disconnect')
      setError(msg)
      toast.error(msg)
    }
  }

  // Detect service-unavailable errors (agent service down/restarting)
  const isServiceDown = () => {
    const err = error()
    if (!err) return false
    return err.includes('unavailable') || err.includes('unreachable') || err.includes('503')
  }

  return (
    <Show
      when={usage()}
      fallback={
        <div class="premium-panel">
          <Show when={isServiceDown()}>
            <div class="premium-service-down">
              <div class="premium-service-down-icon">
                <SparkIcon size={28} />
              </div>
              <div class="premium-service-down-text">
                <strong>AI service is temporarily unavailable</strong>
                <span>Free models continue to work. Premium features will return shortly — no action needed.</span>
              </div>
            </div>
          </Show>
          <Show when={error() && !isServiceDown()}>
            <div class="premium-error">{error()}</div>
          </Show>
          <Show when={!isServiceDown()}>
            <div class="premium-skeleton-hero" />
            <div class="premium-skeleton-grid">
              <div class="premium-skeleton-card" />
              <div class="premium-skeleton-card" />
              <div class="premium-skeleton-card" />
            </div>
          </Show>
        </div>
      }
    >
      <div class="premium-panel">
        {/* ─── Free models banner ──────────────────────────────────── */}
        <Show when={connectedCount() === 0}>
          <div class="premium-free-banner">
            <div class="premium-free-banner-text">
              <strong>Free models are active</strong>
              <span>The intelligence routes to free models (Laguna, Gemini Flash, Groq) by default. No provider connection needed to start growing fans. Connect a premium provider below to unlock frontier models for deeper reasoning.</span>
            </div>
          </div>
        </Show>

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
                  'tier-ok': budgetPctValue() < 50,
                  'tier-warn': budgetPctValue() >= 50 && budgetPctValue() < 90,
                  'tier-crit': budgetPctValue() >= 90,
                }}
                style={{ width: `${Math.max(2, budgetPctValue())}%` }}
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

        {/* ─── Free Models (no key needed) ───────────────────────── */}
        <Show when={freeProviders().length > 0}>
          <section class="premium-section">
            <div class="premium-section-head">
              <h3><SparkIcon size={16} /> Free Models <span class="badge free-chip">no key needed</span></h3>
            </div>
            <div class="premium-connector-grid">
              <For each={freeProviders()}>
                {(provider) => {
                  const cred = () => credentials().find((c: AgentCredential) => c.provider === provider.id)
                  const isConnected = () => cred()?.status === 'active'
                  return (
                    <div class="premium-connector-card" classList={{ connected: isConnected() }}>
                      <div class="premium-connector-top">
                        <div class="premium-connector-logo">
                          <LlmProviderIconWithTier providerId={provider.id} tier={provider.tier} connected={isConnected()} size={28} />
                        </div>
                        <div class="premium-connector-info">
                          <div class="premium-connector-name">{provider.name}</div>
                          <div class="premium-connector-models">{provider.modelCount} models</div>
                        </div>
                        <Show when={provider.authMethod === 'none'}>
                          <span class="badge free-chip">free</span>
                        </Show>
                      </div>
                      <div class="premium-connector-desc">{provider.description}</div>
                    </div>
                  )
                }}
              </For>
            </div>
          </section>
        </Show>

        {/* ─── API Key Providers ──────────────────────────────────── */}
        <section class="premium-section">
          <div class="premium-section-head">
            <h3><KeyIcon size={16} /> AI Provider API Keys</h3>
            <Show when={connectedCount() > 0}>
              <span class="premium-connection-summary">
                <span class="agent-connection-dot ok" />
                {connectedCount()} of {apiKeyProviders().length} connected
              </span>
            </Show>
          </div>
          <p class="premium-section-intro">
            Connect your AI accounts to unlock models for the autopilot intelligence.
            Paste an API key from each provider's developer console. Keys are encrypted at rest.
          </p>

          <div class="premium-connector-grid">
            <For each={apiKeyProviders()}>
              {(provider) => {
                const cred = () => credentials().find((c: AgentCredential) => c.provider === provider.id)
                const isConnected = () => cred()?.status === 'active'
                return (
                  <div class="premium-connector-card" classList={{ connected: isConnected() }}>
                    <div class="premium-connector-top">
                      <div class="premium-connector-logo">
                        <LlmProviderIconWithTier providerId={provider.id} tier={provider.tier} connected={isConnected()} size={28} />
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

                    {/* Model recommendation — shows which templates benefit from this provider */}
                    <Show when={!isConnected()}>
                      <div class="premium-recommendation">
                        <Show when={provider.id === 'openai'}>
                          <span class="premium-rec-text">Unlocks GPT-4o for press-pitch (deep reasoning) and o3 for campaign-analysis</span>
                        </Show>
                        <Show when={provider.id === 'anthropic'}>
                          <span class="premium-rec-text">Unlocks Claude Sonnet for social-post (nuanced writing) and audience-research</span>
                        </Show>
                        <Show when={provider.id === 'google'}>
                          <span class="premium-rec-text">Unlocks Gemini 2.5 Pro for growth-strategist (long context) and Gemini Flash for fast scanning</span>
                        </Show>
                        <Show when={provider.id === 'xai'}>
                          <span class="premium-rec-text">Unlocks Grok for community-engager (real-time social context)</span>
                        </Show>
                        <Show when={provider.id === 'openrouter'}>
                          <span class="premium-rec-text">Unlocks 100+ models via one API key — flexible routing for all templates</span>
                        </Show>
                        <Show when={provider.id !== 'openai' && provider.id !== 'anthropic' && provider.id !== 'google' && provider.id !== 'xai' && provider.id !== 'openrouter'}>
                          <span class="premium-rec-text">Adds {provider.modelCount} models to the intelligence's routing pool</span>
                        </Show>
                      </div>
                    </Show>

                    {/* Health badge — shows recent task success rate when connected */}
                    <Show when={isConnected() && usage()}>
                      <div class="premium-health-badge">
                        <Show when={usage()!.tasks.filter((t: PremiumTask) => t.model_provider === provider.id).length > 0}
                          fallback={<span class="badge tone-muted">no tasks yet</span>}>
                          {(() => {
                            const providerTasks = usage()!.tasks.filter((t: PremiumTask) => t.model_provider === provider.id)
                            const completed = providerTasks.filter((t: PremiumTask) => t.status === 'completed').length
                            const failed = providerTasks.filter((t: PremiumTask) => t.status === 'failed').length
                            const total = providerTasks.length
                            const successRate = total > 0 ? Math.round((completed / total) * 100) : null
                            const tone = successRate == null ? 'muted' : successRate >= 90 ? 'good' : successRate >= 75 ? 'warn' : 'bad'
                            return <span class={`badge tone-${tone}`}>{successRate ?? '—'}% success · {total} tasks</span>
                          })()}
                        </Show>
                      </div>
                    </Show>

                    {/* Connection method badge — shows how the provider is connected */}
                    <Show when={isConnected()}>
                      <div class="premium-method-badge apikey">
                        <span class="premium-method-icon" title="Connected via API key">API Key</span>
                        <Show when={cred()?.provider_account}>
                          <span class="premium-method-account">{cred()!.provider_account}</span>
                        </Show>
                      </div>
                    </Show>

                    {/* Connection actions — API key is the only connection method */}
                    <div class="premium-connector-actions">
                      <Show when={!isConnected()}>
                        <Show when={provider.supportsApiKeyPaste}>
                          <Show when={showKeyInputFor() === provider.id}>
                            <div class="premium-key-row">
                              <input
                                class="premium-key-input"
                                classList={{ 'premium-key-error': !!error() && connectingProvider() !== provider.id }}
                                type="password"
                                placeholder="Paste API key…"
                                aria-label={`${provider.name} API key`}
                                value={apiKeyInput()}
                                onInput={(e) => setApiKeyInput(e.currentTarget.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleConnectApiKey(provider.id) }}
                              />
                              <Show when={provider.id === 'cognition'}>
                                <input
                                  class="premium-key-input"
                                  classList={{ 'premium-key-error': !!error() && connectingProvider() !== provider.id }}
                                  type="text"
                                  placeholder="Organization ID (org-…)"
                                  aria-label={`${provider.name} organization ID`}
                                  value={orgIdInput()}
                                  onInput={(e) => setOrgIdInput(e.currentTarget.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleConnectApiKey(provider.id) }}
                                />
                              </Show>
                              <button
                                class="premium-btn-connect"
                                disabled={connectingProvider() === provider.id || !apiKeyInput().trim() || (provider.id === 'cognition' && !orgIdInput().trim())}
                                onClick={() => handleConnectApiKey(provider.id)}
                              >
                                <Show when={connectingProvider() === provider.id}>
                                  <span class="premium-spinner" />
                                </Show>
                                {connectingProvider() === provider.id ? 'Validating…' : 'Connect'}
                              </button>
                              <button class="premium-btn-cancel" onClick={() => { setShowKeyInputFor(null); setApiKeyInput(''); setOrgIdInput(''); setError(null) }}>
                                Cancel
                              </button>
                            </div>
                          </Show>
                          <Show when={showKeyInputFor() !== provider.id}>
                            <button class="premium-btn-connect" onClick={() => setShowKeyInputFor(provider.id)}>
                              <KeyIcon size={13} /> Connect with API Key
                            </button>
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
                <EmptyState label="No premium models active" hint="Premium AI models provide higher quality output for critical worker tasks. Configure API keys to enable them." />
              </div>
            }
          >
            <div class="premium-model-grid">
              <For each={usage()!.premium_models}>
                {(model) => (
                  <div class="premium-model-card">
                    <div class="premium-model-header">
                      <ModelIcon modelId={model.id} providerId={model.provider} paid size={18} />
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
                No premium tasks yet. The intelligence routes complex tasks here automatically.
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
                    <span class="premium-task-age">{formatIsoAge(task.created_at)}</span>
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
