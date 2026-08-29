import { Show, For, createSignal } from 'solid-js'
import { LlmProviderIconWithTier } from './ProviderIcon'
import type { AgentProvider } from '../lib/types'

// ─── Connect Wizard ─────────────────────────────────────────────────────
// Guided onboarding for first-time provider setup.
// Shown when no providers are connected. 3 steps:
// 1. Pick a provider
// 2. Choose method (OAuth vs API key)
// 3. Authenticate (redirects or shows input)

type WizardStep = 'pick' | 'method'

export function ConnectWizard(props: {
  providers: AgentProvider[]
  onStartOauth: (providerId: string) => void
  onPasteKey: (providerId: string) => void
  onDismiss: () => void
}) {
  const [step, setStep] = createSignal<WizardStep>('pick')
  const [selected, setSelected] = createSignal<string | null>(null)

  // Show only premium providers with OAuth or API key support
  const wizardProviders = () =>
    props.providers.filter(p =>
      p.tier === 'premium' || (!p.tier && !p.freeTier && p.authMethod !== 'none')
    )

  const selectedProvider = () =>
    wizardProviders().find(p => p.id === selected())

  const reset = () => {
    setStep('pick')
    setSelected(null)
  }

  return (
    <div class="connect-wizard">
      <div class="connect-wizard-head">
        <h3>Connect your first AI provider</h3>
        <button class="premium-btn-cancel" onClick={props.onDismiss}>Skip</button>
      </div>
      <p class="connect-wizard-intro">
        Unlock frontier models for the autopilot brain. Pick a provider to get started —
        you can always connect more later.
      </p>

      {/* Step indicator */}
      <div class="connect-wizard-steps" aria-label="Onboarding progress">
        <span class="wizard-step-dot" classList={{ active: step() === 'pick', done: step() !== 'pick' }}>1</span>
        <span class="wizard-step-line" classList={{ done: step() !== 'pick' }} />
        <span class="wizard-step-dot" classList={{ active: step() === 'method' }}>2</span>
      </div>

      {/* Step 1: Pick provider */}
      <Show when={step() === 'pick'}>
        <Show when={wizardProviders().length > 0} fallback={
          <div class="premium-empty">
            <p>No connectable providers are configured.</p>
            <span>Contact your administrator to enable AI provider connections.</span>
          </div>
        }>
          <div class="wizard-provider-grid">
            <For each={wizardProviders()}>
              {(provider) => (
                <button
                  class="wizard-provider-card"
                  onClick={() => { setSelected(provider.id); setStep('method') }}
                >
                  <div class="wizard-provider-logo">
                    <LlmProviderIconWithTier providerId={provider.id} tier={provider.tier} beta={provider.oauth?.experimental} size={32} />
                  </div>
                  <div class="wizard-provider-info">
                    <div class="wizard-provider-name">{provider.name}</div>
                    <div class="wizard-provider-models">{provider.modelCount} models</div>
                  </div>
                </button>
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* Step 2: Choose method */}
      <Show when={step() === 'method'}>
        <Show when={selectedProvider()}>
          {(p) => (
            <div class="wizard-method-section">
              <div class="wizard-selected-provider">
                <LlmProviderIconWithTier providerId={p().id} tier={p().tier} size={24} />
                <span>{p().name}</span>
                <button class="wizard-back" onClick={() => setStep('pick')}>Change</button>
              </div>

              <div class="wizard-method-grid">
                {/* OAuth — primary path */}
                <Show when={p().oauth && p().oauthAvailable}>
                  <button class="wizard-method-card wizard-method-primary" onClick={() => props.onStartOauth(p().id)}>
                    <div class="wizard-method-icon">
                      <LlmProviderIconWithTier providerId={p().id} tier={p().tier} size={28} />
                    </div>
                    <div class="wizard-method-text">
                      <strong>Sign in with {p().name}</strong>
                      <span>Fastest — redirects to {p().name} for authorization</span>
                    </div>
                    <Show when={p().oauth?.experimental}>
                      <span class="premium-beta-chip">beta</span>
                    </Show>
                  </button>
                </Show>

                {/* API key — fallback */}
                <Show when={p().supportsApiKeyPaste}>
                  <button class="wizard-method-card" onClick={() => { props.onPasteKey(p().id); reset() }}>
                    <div class="wizard-method-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="8" cy="15" r="4" />
                        <path d="M10.85 12.15L19 4M18 5l2 2M15 8l2 2" />
                      </svg>
                    </div>
                    <div class="wizard-method-text">
                      <strong>Use API key</strong>
                      <span>Paste a key from {p().name}'s developer console</span>
                    </div>
                  </button>
                </Show>
              </div>
            </div>
          )}
        </Show>
      </Show>
    </div>
  )
}
