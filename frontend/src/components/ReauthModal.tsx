import { Show, createSignal } from 'solid-js'
import type { Component } from 'solid-js'
import { reauthState, submitReauth, cancelReauth } from '../lib/reauth'
import { Button } from './ui/button'
import { Input } from './ui/input'

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
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={cancel}>
        <div class="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-xl" role="dialog" aria-modal="true" aria-label="Confirm your identity" onClick={(e) => e.stopPropagation()}>
          <h2 class="text-lg font-semibold text-foreground">Confirm your identity</h2>
          <div class="mt-2">
            <p class="text-sm text-muted-foreground leading-relaxed">{reauthState.pending()?.description}</p>
            <p class="mt-1 text-xs text-muted-foreground">Enter your password to authorize this action from your mobile device.</p>
            <form class="mt-4 flex flex-col gap-3" onSubmit={submit}>
              <Input
                type="password"
                placeholder="Password"
                autocomplete="current-password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                required
                autofocus
              />
              <Show when={reauthState.error()}>
                <div class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{reauthState.error()}</div>
              </Show>
              <div class="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={reauthState.busy()}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={reauthState.busy() || !password().trim()}>
                  {reauthState.busy() ? 'Verifying…' : 'Authorize'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Show>
  )
}
