import { Show, createSignal } from 'solid-js'
import type { Component } from 'solid-js'
import { reauthState, submitReauth, cancelReauth } from '../lib/reauth'

/// Modal that prompts for the operator's password before a destructive
/// mutation from a mobile session. Triggered by `requireReauth()` in
/// `lib/reauth.ts`. The Shell renders this once; any component can
/// trigger the flow.
export const ReauthModal: Component = () => {
  const [password, setPassword] = createSignal('')

  const submit = async (event: Event) => {
    event.preventDefault()
    if (!password().trim()) return
    const ok = await submitReauth(password())
    if (ok) setPassword('')
  }

  const cancel = () => {
    setPassword('')
    cancelReauth()
  }

  return (
    <Show when={reauthState.pending()}>
      <div class="dialog-overlay" onClick={cancel}>
        <div class="dialog-panel reauth-panel" onClick={(e) => e.stopPropagation()}>
          <h2 class="confirm-dialog-title">Confirm your identity</h2>
          <div class="confirm-dialog-body">
            <p class="reauth-description">{reauthState.pending()?.description}</p>
            <p class="reauth-hint">Enter your password to authorize this action from your mobile device.</p>
            <form class="reauth-form" onSubmit={submit}>
              <input
                type="password"
                class="reauth-input"
                placeholder="Password"
                autocomplete="current-password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                required
                autofocus
              />
              <Show when={reauthState.error()}>
                <div class="reauth-error" role="alert">{reauthState.error()}</div>
              </Show>
              <div class="confirm-dialog-actions">
                <button type="button" class="ghost" onClick={cancel} disabled={reauthState.busy()}>
                  Cancel
                </button>
                <button type="submit" disabled={reauthState.busy() || !password().trim()}>
                  {reauthState.busy() ? 'Verifying…' : 'Authorize'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Show>
  )
}
