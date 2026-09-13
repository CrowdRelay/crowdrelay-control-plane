import { For, Show, createSignal, createMemo } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api, request } from '../lib/api'
import { errorMessage } from '../lib/format'
import { toast } from './ui/toast'
import { EmptyState } from './ui/empty-state'
import { Hint } from './ui/hint'
import { ErrorCard } from './layout'
import { credentialHealth } from '../lib/credential-health'
import { ProviderCard, type ProviderCardContext } from './ProviderCard'
import { UsageKpiStrip, PremiumModelsSection, PremiumTasksSection } from './PremiumUsageSections'
import { KeyIcon, SparkIcon } from './provider-icons'
import type { AgentProvider, AgentCredential, AgentModel, PremiumUsage } from '../lib/types'

// ─── Component ──────────────────────────────────────────────────────────

export function AgentProvidersPanel(props: {
  slug: string
  providers?: AgentProvider[]
  credentials?: AgentCredential[]
  /** Section failure from the consolidated read model, when that section
   *  could not be answered at all. While set, the panel shows a degraded
   *  card instead of an empty state — "cannot reach the provider list" must
   *  never render as "no providers connected". */
  providersError?: string | null
  credentialsError?: string | null
  /** Parent query still in flight — the sections below render skeletons, not
   *  the "nothing connected" empty state, until the first answer arrives. */
  sectionsLoading?: boolean
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
    // Disabled when the parent supplies models — a disabled query never
    // caches a null under this key for a later standalone mount to trip on.
    enabled: props.active !== false && props.models === undefined,
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
    enabled: props.active !== false && props.providers === undefined,
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
    enabled: props.active !== false && props.credentials === undefined,
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

  const availableModelCount = createMemo(() => {
    const all = models()?.models ?? []
    // `available` means dispatchable right now — its provider is connected or
    // platform-keyed. Older agent-service builds omit the flag; there the
    // honest proxy is "provider has a credential in the response".
    if (all.every(m => m.available === undefined)) {
      const connected = new Set(models()?.connectedProviders ?? [])
      return all.filter(m => connected.has(m.providerId)).length
    }
    return all.filter(m => m.available === true).length
  })

  // Memoize budget percentage so it's computed once per render, not 5x.
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
  const cardCtx: ProviderCardContext = {
    credentials,
    usageTasks: () => usage.data?.tasks,
    error,
    connectingProvider,
    testingProvider,
    testResult: (providerId) => testResult()[providerId],
    apiKeyInput,
    orgIdInput,
    showKeyInputFor,
    onApiKeyInput: setApiKeyInput,
    onOrgIdInput: setOrgIdInput,
    onShowKeyInput: setShowKeyInputFor,
    onCancelKeyInput: () => { setShowKeyInputFor(null); setApiKeyInput(''); setOrgIdInput(''); setError(null) },
    onConnect: (id) => { void handleConnectApiKey(id) },
    onTest: (id) => { void handleTestCredential(id) },
    onDisconnect: (id) => { void handleDisconnect(id) },
  }

  // Whether the provider/credential sections have a verdict at all — a
  // resolved list or a section error. Neither yet means still loading.
  const providersResolved = () =>
    !props.sectionsLoading &&
    (props.providersError != null || props.providers !== undefined || fallbackProviders.data !== undefined)

  return (
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

      {/* A failed read-model section is a degraded surface, not an empty
          one — name it, and let whileIncomplete refill it. */}
      <Show when={props.providersError}>{msg => <ErrorCard>Provider list unavailable: {msg()}. Retrying automatically.</ErrorCard>}</Show>
      <Show when={props.credentialsError}>{msg => <ErrorCard>Credential status unavailable: {msg()}. Retrying automatically.</ErrorCard>}</Show>

      {/* The spend strip describes what this tenant is doing. It gates only
          itself — a failed usage read must not hide the provider controls. */}
      <Show when={props.mode !== 'library'}>
        <Show when={usage.data} fallback={
          <Show when={!isServiceDown() && !error()}>
            <div class="h-20 rounded-lg border border-border bg-surface-3" />
          </Show>
        }>
          <UsageKpiStrip usage={usage.data!} connectedCount={connectedCount()} availableModelCount={availableModelCount()} />
        </Show>
      </Show>

      <Show when={providersResolved()} fallback={
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="h-32 rounded-lg border border-border bg-surface-3" />
          <div class="h-32 rounded-lg border border-border bg-surface-3" />
          <div class="h-32 rounded-lg border border-border bg-surface-3" />
        </div>
      }>
      <div class="flex flex-col gap-4">

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
              <For each={brokenProviders()}>{provider => <ProviderCard provider={provider} ctx={cardCtx} />}</For>
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
        <Show when={props.mode !== 'library' && inUseProviders().length === 0 && brokenProviders().length === 0 && !props.providersError && !props.credentialsError}>
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
              <For each={inUseProviders()}>{provider => <ProviderCard provider={provider} ctx={cardCtx} />}</For>
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
              fallback={props.providersError ? null : <EmptyState label="Everything is connected" hint="Every provider we support already has a key on this tenant." />}
            >
              <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                <For each={libraryProviders()}>{provider => <ProviderCard provider={provider} ctx={cardCtx} />}</For>
              </div>
            </Show>
          </section>
        </Show>


        <Show when={props.mode !== 'library' && usage.data}>
        <PremiumModelsSection usage={usage.data!} />
        <PremiumTasksSection usage={usage.data!} />
        </Show>
      </div>
      </Show>
    </div>
  )
}
