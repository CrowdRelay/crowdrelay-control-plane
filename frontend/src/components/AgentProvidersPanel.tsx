import { For, Show, createSignal, createMemo } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api, request } from '../lib/api'
import { errorMessage, formatIsoAge, formatUsd } from '../lib/format'
import { toast } from './ui/toast'
import { StatusBadge } from './StatusBadge'
import { LlmProviderIconWithTier, ModelIcon } from './ProviderIcon'
import { EmptyState } from './ui/empty-state'
import { Sparkline } from './Sparkline'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Spinner } from './Spinner'
import { Card } from './ui/card'
import { Hint } from './ui/hint'
import { KpiCard, ErrorCard } from './layout'
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

// A key can be present, accepted once, and still buy nothing today: the
// account ran out of credit, the card failed, the plan hit its rate ceiling, or
// somebody rotated the key. The panel used to call all of those "Connected"
// with a green tick, so a provider that had silently stopped working looked
// exactly like one that was working.
//
// The provider's own message is the only thing that names the fix, so it is
// matched rather than replaced — and when it matches nothing, it is shown
// verbatim rather than flattened into "unavailable".
export type CredentialHealth =
  | { state: 'working' }
  | { state: 'broken'; headline: string; whatToDo: string }

export const credentialHealth = (credential: AgentCredential | undefined): CredentialHealth => {
  if (!credential) return { state: 'working' }
  const raw = (credential.last_validation_error ?? '').toLowerCase()

  if (credential.status === 'revoked') {
    return { state: 'broken', headline: 'Key was revoked', whatToDo: 'Paste a new key to start using this provider again.' }
  }

  const billing = /insufficient|quota|credit|balance|billing|payment|exceeded your current/.test(raw)
  if (billing) {
    return { state: 'broken', headline: 'Out of credit', whatToDo: 'Top up or add a payment method in the provider\'s own console. The key itself is fine.' }
  }

  const rate = /rate.?limit|too many requests|429/.test(raw)
  if (rate) {
    return { state: 'broken', headline: 'Rate limited', whatToDo: 'The plan is sending more than it allows. It usually clears on its own; raise the tier if it keeps happening.' }
  }

  const badKey = /invalid|unauthor|forbidden|401|403|authentication|api key/.test(raw)
  if (badKey || credential.status === 'invalid') {
    return { state: 'broken', headline: 'Key was rejected', whatToDo: 'The key is wrong, expired, or was rotated. Paste the current one.' }
  }

  if (raw) {
    return { state: 'broken', headline: 'Provider refused the last check', whatToDo: credential.last_validation_error! }
  }

  return { state: 'working' }
}

const budgetPct = (spent: number, budget: number): number => {
  if (budget <= 0) return 0
  return Math.min(100, (spent / budget) * 100)
}

const taskStatusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'completed' ? 'good' :
  status === 'running' ? 'warn' :
  status === 'failed' ? 'bad' : 'muted'

const toneToBadgeVariant = (tone: 'good' | 'warn' | 'bad' | 'muted'): 'success' | 'warning' | 'destructive' | 'muted' =>
  tone === 'good' ? 'success' :
  tone === 'warn' ? 'warning' :
  tone === 'bad' ? 'destructive' : 'muted'

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

export function AgentProvidersPanel(props: {
  slug: string
  providers?: AgentProvider[]
  credentials?: AgentCredential[]
  /** `in-use` shows the pool the router picks from. `library` shows what is
   *  not connected yet. They are separate tabs so an operator opening this
   *  page sees their own providers, not a catalogue. */
  mode?: 'in-use' | 'library'
  refetchCreds?: () => void
  /** When false (tab hidden), resources don't refetch on global refreshTick. */
  active?: boolean
  /** Shared models resource from parent (avoids duplicate /agents/models fetch). */
  models?: { models: AgentModel[]; connectedProviders: string[] } | null
}) {
  const [error, setError] = createSignal<string | null>(null)
  const [connectingProvider, setConnectingProvider] = createSignal<string | null>(null)
  const [testingProvider, setTestingProvider] = createSignal<string | null>(null)
  const [testResult, setTestResult] = createSignal<Record<string, { ok: boolean; message: string } | null>>({})
  const [apiKeyInput, setApiKeyInput] = createSignal('')
  const [orgIdInput, setOrgIdInput] = createSignal('')
  const [showKeyInputFor, setShowKeyInputFor] = createSignal<string | null>(null)

  // Premium usage is unique to this panel — always fetch here.
  // The try/catch ensures the error signal is set even when the tab is
  // hidden, so the error card can render outside the usage() guard.
  const usage = useQuery(() => ({
    queryKey: ['premium-ai-usage', props.slug],
    queryFn: async () => {
      try {
        const data = await request<PremiumUsage>(`/tenants/${props.slug}/agents/premium/usage`)
        return data
      } catch (err) {
        setError(errorMessage(err, 'Failed to load premium usage'))
        throw err
      }
    },
    enabled: props.active !== false,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  // Models can be passed from the parent AgentPanel (shared resource,
  // avoids duplicate /agents/models fetch) or fetched here as fallback.
  const hasParentModels = () => props.models !== undefined
  const fallbackModels = useQuery(() => ({
    queryKey: ['premium-ai-models', props.slug],
    queryFn: async () => {
      if (hasParentModels()) return null
      const data = await api.agentModels(props.slug)
      return data
    },
    enabled: props.active !== false,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const models = () => props.models ?? fallbackModels.data ?? null

  // Providers and credentials can be passed from the parent AgentPanel
  // (shared resources, no re-fetch on tab switch) or fetched here as fallback
  // for standalone usage. When the parent provides them, the fallback
  // resources return null immediately (no network fetch).
  const fallbackProviders = useQuery(() => ({
    queryKey: ['premium-ai-providers', props.slug],
    queryFn: async () => {
      if (props.providers !== undefined) return null
      const data = await api.agentProviders(props.slug)
      return data.providers
    },
    enabled: props.active !== false,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const fallbackCreds = useQuery(() => ({
    queryKey: ['premium-ai-creds', props.slug],
    queryFn: async () => {
      if (props.credentials !== undefined) return null
      const data = await api.agentCredentials(props.slug)
      return data.credentials
    },
    enabled: props.active !== false,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const providers = () => props.providers ?? fallbackProviders.data ?? []
  const credentials = () => props.credentials ?? fallbackCreds.data ?? []
  const refetchCreds = () => {
    if (props.refetchCreds) props.refetchCreds()
    else fallbackCreds.refetch()
  }
  const triggerLocalRefresh = () => {
    usage.refetch()
    fallbackModels.refetch()
    fallbackProviders.refetch()
  }

  // All providers — show every provider in one unified view.
  // Free models show a "no key needed" badge; paid models get API key connect.
  const allProviders = createMemo(() => providers())
  const freeProviders = createMemo(() =>
    allProviders().filter((p: AgentProvider) => p.authMethod === 'none')
  )
  const apiKeyProviders = createMemo(() =>
    allProviders().filter((p: AgentProvider) => p.authMethod === 'api_key')
  )

  const credentialFor = (providerId: string) =>
    credentials().find((c: AgentCredential) => c.provider === providerId)

  // `authMethod` is `api_key` for every provider the service returns, free tier
  // included — the old free-models grid keyed off `authMethod === 'none'` and so
  // never rendered at all. `freeTier`/`tier` is the real signal, and having a
  // credential is what puts a provider in the pool.
  const isConnectedProvider = (provider: AgentProvider) => credentialFor(provider.id) != null

  // Free providers need no key, so they are always in the pool. A paid one is
  // in the pool once it has a credential — working or not, because a broken key
  // is something the operator has to see, not something to hide back in the
  // catalogue.
  const inUseProviders = createMemo(() =>
    props.mode === 'library'
      ? []
      : allProviders().filter(p => isConnectedProvider(p) && credentialHealth(credentialFor(p.id)).state === 'working')
  )

  const libraryProviders = createMemo(() =>
    allProviders()
      .filter((p: AgentProvider) => !isConnectedProvider(p))
      // Free tiers first: they cost nothing to try and they are what keeps the
      // simple work off the paid budget.
      .sort((a, b) => Number(b.freeTier) - Number(a.freeTier))
  )

  const brokenProviders = createMemo(() =>
    allProviders().filter((p: AgentProvider) => credentialHealth(credentialFor(p.id)).state === 'broken')
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
    const u = usage.data
    if (!u) return 0
    return budgetPct(u.monthly_spend_micro_usd, u.budget_micro_usd)
  })

  // Build a daily cost series from the task list for the hero sparkline.
  // Each task has a created_at (ISO) and cost_micro_usd. We bucket by day
  // (last 14 days) and sum the cost, so the sparkline shows spend history
  // with peaks where expensive tasks ran.
  const dailyCostSeries = createMemo(() => {
    const u = usage.data
    if (!u || u.tasks.length === 0) return []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const days: number[] = []
    const labels: string[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      days.push(0)
      labels.push(d.toISOString().slice(0, 10))
    }
    for (const task of u.tasks) {
      const dayStr = task.created_at.slice(0, 10)
      const idx = labels.indexOf(dayStr)
      if (idx >= 0) days[idx]! += task.cost_micro_usd
    }
    return days
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
      // The key was stored and the card said "connected" without anyone
      // asking the provider whether it works, so a typo looked identical to a
      // live key until a task failed hours later. The validate endpoint has
      // been there the whole time.
      let verified = true
      try {
        const result = await api.agentValidateCredential(props.slug, providerId)
        if (!result.valid) {
          verified = false
          const detail = result.error ?? 'the provider rejected it'
          setError(`${provider?.name ?? providerId} rejected that key: ${detail}`)
          toast.error(`${provider?.name ?? providerId} rejected that key`)
        }
      } catch (validationError) {
        verified = false
        const detail = errorMessage(validationError, 'the provider rejected it')
        // A validator that is itself unavailable is not a bad key.
        if (/unavailable|unreachable|503/i.test(detail)) {
          verified = true
          toast.info(`Saved the ${provider?.name ?? providerId} key. It could not be checked right now — the agent service is unavailable.`)
        } else {
          setError(`${provider?.name ?? providerId} rejected that key: ${detail}`)
          toast.error(`${provider?.name ?? providerId} rejected that key`)
        }
      }
      if (verified) {
        toast.success(`Connected to ${provider?.name ?? providerId} — ${provider?.modelCount ?? 0} models unlocked`)
        setApiKeyInput('')
        setOrgIdInput('')
        setShowKeyInputFor(null)
      }
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

  // A stored key can stop working without anything in the console changing:
  // revoked, rotated, out of quota. This asks. The result is shown inline on
  // the provider card — no shared error signal, no unconditional refetch that
  // would flip the card and look like a page refresh.
  const handleTestCredential = async (providerId: string) => {
    setTestingProvider(providerId)
    const provider = apiKeyProviders().find(p => p.id === providerId)
    const name = provider?.name ?? providerId
    try {
      const result = await api.agentValidateCredential(props.slug, providerId)
      if (result.valid) {
        setTestResult(prev => ({ ...prev, [providerId]: { ok: true, message: 'Key valid ✓' } }))
        toast.success(`${name} accepted the stored key.`)
      } else {
        const detail = result.error ?? 'the provider rejected it'
        setTestResult(prev => ({ ...prev, [providerId]: { ok: false, message: `Rejected: ${detail}` } }))
        toast.error(`${name} rejected the stored key`)
        // Status changed to "invalid" upstream — refetch so the card reflects it.
        refetchCreds()
      }
    } catch (e) {
      const msg = errorMessage(e, 'the provider rejected it')
      setTestResult(prev => ({ ...prev, [providerId]: { ok: false, message: msg } }))
      toast.error(`${name} rejected the stored key`)
      // 503/unavailable means the validator itself is down, not a bad key —
      // don't refetch, the credential status hasn't changed.
      if (!/unavailable|unreachable|503/i.test(msg)) refetchCreds()
    } finally {
      setTestingProvider(null)
    }
  }

  const handleDisconnect = async (providerId: string) => {
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

  // One provider card. It was inlined twice — once in a free-models grid and
  // once in an API-key grid — which is why the two drifted apart. One card,
  // rendered wherever a provider belongs.
  function ProviderCard(cardProps: { provider: AgentProvider }) {
    const provider = cardProps.provider
                const cred = () => credentials().find((c: AgentCredential) => c.provider === provider.id)
                const isConnected = () => cred()?.status === 'active'
                return (
                  <div class="flex flex-col gap-2 p-4 rounded-lg border border-border bg-surface-1" classList={{ 'border-primary/40': isConnected() }}>
                    <div class="flex items-center gap-2">
                      <div class="w-9 h-9 flex items-center justify-center rounded-md border border-border bg-surface-1">
                        <LlmProviderIconWithTier providerId={provider.id} tier={provider.tier} connected={isConnected()} size={28} />
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="font-semibold text-sm text-foreground">{provider.name}</div>
                        <div class="text-xs text-muted-foreground">{provider.modelCount} models</div>
                      </div>
                      {/* Which budget this provider spends. The old pill keyed
                          off `authMethod === 'none'`, which no provider is, so
                          it never rendered. */}
                      <Show
                        when={provider.freeTier}
                        fallback={<Badge variant="outline">paid</Badge>}
                      >
                        <Badge variant="success">free</Badge>
                      </Show>
                      {/* "Connected" with a green tick was shown for any key
                          the tenant had ever pasted, including ones the
                          provider now refuses. A provider that has quietly
                          stopped working looked identical to one that works. */}
                      <Show when={isConnected()}>
                        <Show
                          when={credentialHealth(cred()).state === 'working'}
                          fallback={<Badge variant="destructive">not working</Badge>}
                        >
                          <span class="inline-flex items-center gap-1 text-xs font-medium text-success">
                            <CheckIcon size={12} /> Working
                          </span>
                        </Show>
                      </Show>
                    </div>

                    <div class="text-sm text-muted-foreground leading-relaxed">{provider.description}</div>

                    {/* The provider's own message names the fix; the headline
                        says which kind of dead it is. */}
                    <Show when={credentialHealth(cred()).state === 'broken' ? credentialHealth(cred()) : null} keyed>
                      {health => (
                        <div class="border border-destructive/30 bg-destructive/10 p-2.5 text-xs leading-relaxed">
                          <strong class="text-destructive">{(health as Extract<CredentialHealth, { state: 'broken' }>).headline}</strong>
                          <span class="mt-0.5 block text-secondary-foreground">{(health as Extract<CredentialHealth, { state: 'broken' }>).whatToDo}</span>
                        </div>
                      )}
                    </Show>

                    {/* Model recommendation — shows which templates benefit from this provider */}
                    <Show when={!isConnected()}>
                      <div class="mt-1">
                        <Show when={provider.id === 'openai'}>
                          <span class="text-xs text-muted-foreground italic">Unlocks GPT-4o for press-pitch (deep reasoning) and o3 for campaign-analysis</span>
                        </Show>
                        <Show when={provider.id === 'anthropic'}>
                          <span class="text-xs text-muted-foreground italic">Unlocks Claude Sonnet for social-post (nuanced writing) and audience-research</span>
                        </Show>
                        <Show when={provider.id === 'google'}>
                          <span class="text-xs text-muted-foreground italic">Unlocks Gemini 2.5 Pro for growth-strategist (long context) and Gemini Flash for fast scanning</span>
                        </Show>
                        <Show when={provider.id === 'xai'}>
                          <span class="text-xs text-muted-foreground italic">Unlocks Grok for community-engager (real-time social context)</span>
                        </Show>
                        <Show when={provider.id === 'openrouter'}>
                          <span class="text-xs text-muted-foreground italic">Unlocks 100+ models via one API key — flexible routing for all templates</span>
                        </Show>
                        <Show when={provider.id !== 'openai' && provider.id !== 'anthropic' && provider.id !== 'google' && provider.id !== 'xai' && provider.id !== 'openrouter'}>
                          <span class="text-xs text-muted-foreground italic">Adds {provider.modelCount} models to the intelligence's routing pool</span>
                        </Show>
                      </div>
                    </Show>

                    {/* Health + method badges — wrapped for consistent middle height */}
                    <Show when={isConnected()}>
                      <div class="flex items-center gap-2 flex-wrap">
                        <Show when={usage.data}>
                          <Show when={usage.data!.tasks.filter((t: PremiumTask) => t.model_provider === provider.id).length > 0}
                            fallback={<Badge variant="muted">no tasks yet</Badge>}>
                            {(() => {
                              const providerTasks = usage.data!.tasks.filter((t: PremiumTask) => t.model_provider === provider.id)
                              const completed = providerTasks.filter((t: PremiumTask) => t.status === 'completed').length
                              const failed = providerTasks.filter((t: PremiumTask) => t.status === 'failed').length
                              const total = providerTasks.length
                              const successRate = total > 0 ? Math.round((completed / total) * 100) : null
                              const tone = successRate == null ? 'muted' : successRate >= 90 ? 'good' : successRate >= 75 ? 'warn' : 'bad'
                              return <Badge variant={toneToBadgeVariant(tone)}>{successRate ?? '—'}% success · {total} tasks</Badge>
                            })()}
                          </Show>
                        </Show>

                        <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-warning/10 text-warning-light border border-warning/20">
                          <span class="font-bold uppercase tracking-wide text-xs" title="Connected via API key">API Key</span>
                          <Show when={cred()?.provider_account}>
                            <span class="opacity-80 font-normal">{cred()!.provider_account?.slice(0, 8)}…</span>
                          </Show>
                        </div>
                      </div>
                    </Show>

                    {/* Connection actions — API key is the only connection method */}
                    <div class="flex items-center gap-2 flex-wrap mt-2">
                      <Show when={!isConnected()}>
                        <Show when={provider.supportsApiKeyPaste}>
                          <Show when={showKeyInputFor() === provider.id}>
                            <div class="flex flex-col gap-2 w-full">
                              <Input
                                class={error() && connectingProvider() !== provider.id ? 'border-destructive' : ''}
                                type="password"
                                placeholder="Paste API key…"
                                aria-label={`${provider.name} API key`}
                                value={apiKeyInput()}
                                onInput={(e) => setApiKeyInput(e.currentTarget.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleConnectApiKey(provider.id) }}
                              />
                              <Show when={provider.id === 'cognition'}>
                                <Input
                                  class={error() && connectingProvider() !== provider.id ? 'border-destructive' : ''}
                                  type="password"
                                  placeholder="Organization ID (org-…)"
                                  aria-label={`${provider.name} organization ID`}
                                  value={orgIdInput()}
                                  onInput={(e) => setOrgIdInput(e.currentTarget.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleConnectApiKey(provider.id) }}
                                />
                              </Show>
                              <Button writes
                                size="sm"
                                disabled={connectingProvider() === provider.id || !apiKeyInput().trim() || (provider.id === 'cognition' && !orgIdInput().trim())}
                                onClick={() => handleConnectApiKey(provider.id)}
                              >
                                <Show when={connectingProvider() === provider.id}>
                                  <Spinner size={16} />
                                </Show>
                                {connectingProvider() === provider.id ? 'Validating…' : 'Connect'}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => { setShowKeyInputFor(null); setApiKeyInput(''); setOrgIdInput(''); setError(null) }}>
                                Cancel
                              </Button>
                            </div>
                          </Show>
                          {/* Ten provider cards each offered a primary
                              "Connect with API Key". Connecting any one of them
                              is an ordinary choice among ten, not the page's
                              headline action, and ten filled buttons in a grid
                              spend emphasis on nothing. */}
                          {/* A provider whose key the service rejected still
                              has a credential, so "Connect" is the wrong verb —
                              the operator is replacing one, not adding one. */}
                          <Show when={showKeyInputFor() !== provider.id}>
                            <Button writes variant="outline" size="sm" onClick={() => setShowKeyInputFor(provider.id)}>
                              <KeyIcon size={13} /> {cred() ? 'Replace key' : 'Connect with API Key'}
                            </Button>
                          </Show>
                        </Show>
                      </Show>

                      {/* Disconnect when connected */}
                      <Show when={isConnected()}>
                        <Button writes
                          variant="ghost"
                          size="sm"
                          disabled={testingProvider() === provider.id}
                          onClick={() => handleTestCredential(provider.id)}
                        >
                          {testingProvider() === provider.id ? 'Checking…' : 'Test key'}
                        </Button>
                        <Button writes variant="destructive-ghost" size="sm" onClick={() => handleDisconnect(provider.id)}>
                          Disconnect
                        </Button>
                      </Show>
                    </div>
                    {/* Inline test result — per-provider, no shared error signal.
                        Shows the result of the last "Test key" click, or the
                        credential's last_validated_at from the server when no
                        test has been run this session. */}
                    <Show when={isConnected()}>
                      <Show when={testResult()[provider.id]}>
                        {(result) => (
                          <div class={`text-xs mt-2 ${result().ok ? 'text-success' : 'text-destructive'}`}>
                            {result().message}
                          </div>
                        )}
                      </Show>
                      <Show when={!testResult()[provider.id] && cred()?.last_validated_at}>
                        <div class="text-xs mt-2 text-muted-foreground">
                          Last checked {formatIsoAge(cred()!.last_validated_at!)}
                          <Show when={cred()?.last_validation_error}>: {cred()!.last_validation_error}</Show>
                        </div>
                      </Show>
                    </Show>
                  </div>
                )
  }

  return (
    <Show
      when={usage.data}
      fallback={
        <div class="flex flex-col gap-4">
          <Show when={isServiceDown()}>
            <div class="flex items-start gap-3 p-4 rounded-lg border border-warning/30 bg-warning/10 text-warning-light">
              <div class="flex-shrink-0 text-warning mt-0.5">
                <SparkIcon size={28} />
              </div>
              <div class="flex flex-col gap-1">
                <strong class="text-sm text-warning-light">AI service is temporarily unavailable</strong>
                <span class="text-sm text-muted-foreground leading-relaxed">Free models continue to work. Premium features will return shortly — no action needed.</span>
              </div>
            </div>
          </Show>
          <Show when={error() && !isServiceDown()}>
            <ErrorCard class="rounded-md p-3">{error()}</ErrorCard>
          </Show>
          <Show when={!isServiceDown()}>
            <div class="h-20 rounded-lg border border-border bg-surface-1 animate-pulse" />
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              <div class="h-32 rounded-lg border border-border bg-surface-1 animate-pulse" />
              <div class="h-32 rounded-lg border border-border bg-surface-1 animate-pulse" />
              <div class="h-32 rounded-lg border border-border bg-surface-1 animate-pulse" />
            </div>
          </Show>
        </div>
      }
    >
      <div class="flex flex-col gap-4">

        {/* The spend strip, the model list and the task list describe what
            this tenant is doing. The catalogue tab is a list of things it is
            not doing yet, so none of them belong there. */}
        <Show when={props.mode !== 'library'}>
        {/* ─── Compact budget + status strip ─────────────────────── */}
        {/* These were the only KPI tiles in the console still hand-rolled:
            rounded on a page of square panels, with uppercase letter-spaced
            labels where every other strip uses sentence case at the same size.
            Same four numbers, through the shared primitive. */}
        <section class="grid gap-3 mb-6 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          <KpiCard
            label="Spent this month"
            value={formatUsd(usage.data!.monthly_spend_micro_usd)}
            sub={`of ${formatUsd(usage.data!.budget_micro_usd)}`}
            tone={budgetPctValue() > 80 ? 'warn' : 'default'}
          />
          <KpiCard label="Connected" value={connectedCount()} sub="providers" />
          <KpiCard label="Models" value={availableModelCount()} sub="available" />
          <Card class="p-4">
            <div class="text-xs text-muted-foreground">Tasks run</div>
            <div class="mt-1 text-xl font-bold tabular-nums text-foreground">{usage.data!.tasks.length}</div>
            <div class="text-xs text-muted-foreground">in the last 30 days</div>
            <Show when={dailyCostSeries().some(v => v > 0)}>
              <div class="mt-1 h-5 opacity-80">
                <Sparkline data={dailyCostSeries()} width={80} height={20} color={budgetPctValue() > 80 ? 'var(--color-warning)' : 'var(--color-primary)'} />
              </div>
            </Show>
          </Card>
        </section>

        <Show when={error()}>
          <ErrorCard class="rounded-md p-3">{error()}</ErrorCard>
        </Show>

        </Show>

        {/* ─── Not working ─────────────────────────────────────────
            A connected provider that buys nothing is worse than an unconnected
            one: the operator believes it is covered. It leads the page when it
            happens, and does not exist when it does not. */}
        <Show when={props.mode !== 'library' && brokenProviders().length > 0}>
          <section>
            <h3 class="m-0 flex items-center gap-2 text-base font-semibold text-destructive">
              <KeyIcon size={16} /> Connected but not working
            </h3>
            <p class="mb-3 mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {brokenProviders().length === 1 ? 'This provider has' : 'These providers have'} a key,
              but the provider is refusing it. Work that would have used
              {brokenProviders().length === 1 ? ' it' : ' them'} is running on free models instead —
              nothing is being skipped, but the writing an operator sees is not what you paid for.
            </p>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <For each={brokenProviders()}>{provider => <ProviderCard provider={provider} />}</For>
            </div>
          </section>
        </Show>

        {/* ─── What the intelligence is using ─────────────────────
            Connected paid providers and the free ones, together, because that
            is the pool the router actually picks from. Providers the operator
            has not connected are not shown here at all — they live in the
            Add provider tab. A grid of ten cards where two are yours makes the
            operator find their own two every time they open the page. */}
        {/* Nothing connected is a normal starting state, not an error. It
            says what happens meanwhile and where to go. */}
        <Show when={props.mode !== 'library' && inUseProviders().length === 0 && brokenProviders().length === 0}>
          <section>
            <div class="mb-1 flex items-center gap-2">
              <h3 class="m-0 flex items-center gap-2 text-base font-semibold text-foreground">
                <SparkIcon size={16} /> No AI provider connected
              </h3>
              <Hint label="What happens without a provider">
                Work still runs. Everything goes to the free models the platform ships with, which are
                good enough for scanning, sorting and summarising. What suffers is the writing a
                person reads — outreach, press pitches, replies.
              </Hint>
            </div>
            <p class="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Nothing is blocked — the intelligence is running everything on free models. Connect a
              paid provider and it will use that one for anything a person will read.
            </p>
          </section>
        </Show>

        <Show when={inUseProviders().length > 0}>
          <section>
            <div class="mb-1 flex items-center gap-2">
              <h3 class="m-0 flex items-center gap-2 text-base font-semibold text-foreground">
                <SparkIcon size={16} /> In use
              </h3>
              <Hint label="How the intelligence chooses a provider">
                <strong class="text-foreground">Paid first when a person will read it.</strong> Outreach,
                press pitches and anything a fan or a promoter sees goes to a paid model, because the
                wording matters and it is your name on it.
                <br /><br />
                <strong class="text-foreground">Free for the rest.</strong> Scanning, sorting,
                summarising and scoring run on free models — the work is simple and the volume is high.
                <br /><br />
                <strong class="text-foreground">Free is also the fallback.</strong> If a paid provider
                is down, out of budget or has no key, the job runs on a free model rather than not at
                all. Nothing is skipped for want of a paid answer.
              </Hint>
            </div>
            <p class="mb-3 text-sm leading-relaxed text-muted-foreground">
              The pool the intelligence picks from right now.
            </p>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <For each={inUseProviders()}>{provider => <ProviderCard provider={provider} />}</For>
            </div>
          </section>
        </Show>

        {/* ─── Library ─────────────────────────────────────────────
            Only rendered in library mode, which is its own tab. */}
        <Show when={props.mode === 'library'}>
          <section>
            <h3 class="m-0 flex items-center gap-2 text-base font-semibold text-foreground">
              <KeyIcon size={16} /> Providers you have not connected
            </h3>
            <p class="mb-3 mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Paste an API key from the provider's own console to add it to the pool. Keys are
              encrypted at rest. Connecting one does not switch anything off — it gives the
              intelligence one more option for the work that needs a paid model.
            </p>
            <Show
              when={libraryProviders().length > 0}
              fallback={<EmptyState label="Everything is connected" hint="Every provider we support already has a key on this tenant." />}
            >
              <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                <For each={libraryProviders()}>{provider => <ProviderCard provider={provider} />}</For>
              </div>
            </Show>
          </section>
        </Show>


        <Show when={props.mode !== 'library'}>
        {/* ─── Connected Premium Models ──────────────────────────── */}
        <section class="rounded-lg border border-border bg-card p-5">
          <div class="flex items-center justify-between mb-2">
            <h3 class="flex items-center gap-2 m-0 text-base font-semibold text-foreground"><SparkIcon size={16} /> Connected Premium Models</h3>
            <span class="text-xs text-muted-foreground bg-surface-3 border border-border rounded-md px-2 py-0.5">{usage.data!.premium_models.length}</span>
          </div>
          <Show
            when={usage.data!.premium_models.length > 0}
            fallback={
              <div class="p-4">
                <EmptyState label="No premium models active" hint="Premium AI models provide higher quality output for critical worker tasks. Configure API keys to enable them." />
              </div>
            }
          >
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <For each={usage.data!.premium_models}>
                {(model) => (
                  <div class="flex flex-col gap-1.5 p-3 rounded-lg border border-border bg-surface-1">
                    <div class="flex items-center gap-2">
                      <ModelIcon modelId={model.id} providerId={model.provider} paid size={18} />
                      <span class="font-semibold text-sm text-foreground">{model.name}</span>
                      <Show when={model.agentic}>
                        <span class="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-surface-3 rounded-full px-2 py-0.5">
                          <RobotIcon size={11} /> agentic
                        </span>
                      </Show>
                    </div>
                    <div class="text-xs text-muted-foreground">{model.best_for}</div>
                    <div class="flex gap-3 text-xs text-muted-foreground">
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
        <section class="rounded-lg border border-border bg-card p-5">
          <div class="flex items-center justify-between mb-2">
            <h3 class="flex items-center gap-2 m-0 text-base font-semibold text-foreground">Recent premium tasks</h3>
            <span class="text-xs text-muted-foreground bg-surface-3 border border-border rounded-md px-2 py-0.5">{usage.data!.tasks.length}</span>
          </div>
          <Show
            when={usage.data!.tasks.length > 0}
            fallback={
              <div class="p-3 text-sm text-muted-foreground">
                No premium tasks yet. The intelligence routes complex tasks here automatically.
              </div>
            }
          >
            <div class="flex flex-col">
              <For each={usage.data!.tasks.slice(0, 10)}>
                {(task) => (
                  <div class="flex items-center gap-3 text-sm py-2 border-b border-border">
                    <StatusBadge status={task.status} tone={taskStatusTone(task.status)} />
                    <span class="font-medium text-foreground">{task.template_id}</span>
                    <span class="text-muted-foreground">{task.model_provider ?? '—'}</span>
                    <Show when={task.cost_micro_usd > 0}>
                      <span class="text-muted-foreground tabular-nums">{formatUsd(task.cost_micro_usd)}</span>
                    </Show>
                    <span class="text-muted-foreground text-xs">{formatIsoAge(task.created_at)}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </section>
        </Show>
      </div>
    </Show>
  )
}
