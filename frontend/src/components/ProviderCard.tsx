import { Show } from 'solid-js'
import { formatIsoAge } from '../lib/format'
import { credentialHealth, toneToBadgeVariant, type CredentialHealth } from '../lib/credential-health'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Spinner } from './Spinner'
import { LlmProviderIconWithTier } from './ProviderIcon'
import { CheckIcon, KeyIcon } from './provider-icons'
import type { AgentCredential, AgentProvider, PremiumTask } from '../lib/types'

/** Reactive state and callbacks a ProviderCard needs from the panel that owns it. */
export interface ProviderCardContext {
  credentials: () => AgentCredential[]
  usageTasks: () => PremiumTask[] | undefined
  error: () => string | null
  connectingProvider: () => string | null
  testingProvider: () => string | null
  testResult: (providerId: string) => { ok: boolean; message: string } | null | undefined
  apiKeyInput: () => string
  orgIdInput: () => string
  showKeyInputFor: () => string | null
  onApiKeyInput: (value: string) => void
  onOrgIdInput: (value: string) => void
  onShowKeyInput: (providerId: string) => void
  onCancelKeyInput: () => void
  onConnect: (providerId: string) => void
  onTest: (providerId: string) => void
  onDisconnect: (providerId: string) => void
}

// One provider card. It was inlined twice — once in a free-models grid and
// once in an API-key grid — which is why the two drifted apart. One card,
// rendered wherever a provider belongs.
export function ProviderCard(props: { provider: AgentProvider; ctx: ProviderCardContext }) {
  const provider = props.provider
  const ctx = props.ctx
  const cred = () => ctx.credentials().find((c: AgentCredential) => c.provider === provider.id)
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
          <Show when={ctx.usageTasks()}>
            <Show when={ctx.usageTasks()!.filter((t: PremiumTask) => t.model_provider === provider.id).length > 0}
              fallback={<Badge variant="muted">no tasks yet</Badge>}>
              {(() => {
                const providerTasks = ctx.usageTasks()!.filter((t: PremiumTask) => t.model_provider === provider.id)
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
            <Show when={ctx.showKeyInputFor() === provider.id}>
              <div class="flex flex-col gap-2 w-full">
                <Input
                  class={ctx.error() && ctx.connectingProvider() !== provider.id ? 'border-destructive' : ''}
                  type="password"
                  placeholder="Paste API key…"
                  aria-label={`${provider.name} API key`}
                  value={ctx.apiKeyInput()}
                  onInput={(e) => ctx.onApiKeyInput(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') ctx.onConnect(provider.id) }}
                />
                <Show when={provider.id === 'cognition'}>
                  <Input
                    class={ctx.error() && ctx.connectingProvider() !== provider.id ? 'border-destructive' : ''}
                    type="password"
                    placeholder="Organization ID (org-…)"
                    aria-label={`${provider.name} organization ID`}
                    value={ctx.orgIdInput()}
                    onInput={(e) => ctx.onOrgIdInput(e.currentTarget.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') ctx.onConnect(provider.id) }}
                  />
                </Show>
                <Button writes
                  size="sm"
                  disabled={ctx.connectingProvider() === provider.id || !ctx.apiKeyInput().trim() || (provider.id === 'cognition' && !ctx.orgIdInput().trim())}
                  onClick={() => ctx.onConnect(provider.id)}
                >
                  <Show when={ctx.connectingProvider() === provider.id}>
                    <Spinner size={16} />
                  </Show>
                  {ctx.connectingProvider() === provider.id ? 'Validating…' : 'Connect'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => ctx.onCancelKeyInput()}>
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
            <Show when={ctx.showKeyInputFor() !== provider.id}>
              <Button writes variant="outline" size="sm" onClick={() => ctx.onShowKeyInput(provider.id)}>
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
            disabled={ctx.testingProvider() === provider.id}
            onClick={() => ctx.onTest(provider.id)}
          >
            {ctx.testingProvider() === provider.id ? 'Checking…' : 'Test key'}
          </Button>
          <Button writes variant="destructive-ghost" size="sm" onClick={() => ctx.onDisconnect(provider.id)}>
            Disconnect
          </Button>
        </Show>
      </div>
      {/* Inline test result — per-provider, no shared error signal.
          Shows the result of the last "Test key" click, or the
          credential's last_validated_at from the server when no
          test has been run this session. */}
      <Show when={isConnected()}>
        <Show when={ctx.testResult(provider.id)}>
          {(result) => (
            <div class={`text-xs mt-2 ${result().ok ? 'text-success' : 'text-destructive'}`}>
              {result().message}
            </div>
          )}
        </Show>
        <Show when={!ctx.testResult(provider.id) && cred()?.last_validated_at}>
          <div class="text-xs mt-2 text-muted-foreground">
            Last checked {formatIsoAge(cred()!.last_validated_at!)}
            <Show when={cred()?.last_validation_error}>: {cred()!.last_validation_error}</Show>
          </div>
        </Show>
      </Show>
    </div>
  )
}
