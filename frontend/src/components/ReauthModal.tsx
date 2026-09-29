import { createSignal } from 'solid-js'
import { Dialog } from './Dialog'
import { Field } from './ui/field'
import type { Component } from 'solid-js'
import { reauthState, submitReauth, cancelReauth } from '../lib/reauth'
import { Button } from './app/button'
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

  // Built on the shared Dialog: focus moves in and is trapped, Escape and the
  // close button cancel, and focus returns to whatever triggered the action.
  return (
    <Dialog
      open={reauthState.pending() != null}
      onClose={cancel}
      label="Confirm your identity"
      description={reauthState.pending()?.description}
    >
      <form class="flex flex-col gap-3" onSubmit={submit}>
        <p class="m-0 text-xs text-muted-foreground">Enter your password to authorize this action from your mobile device.</p>
        <Field label="Password" error={reauthState.error() ?? undefined}>
          <Input
            type="password"
            name="password"
            autocomplete="current-password"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            aria-invalid={reauthState.error() ? true : undefined}
            required
            autofocus
          />
        </Field>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={reauthState.busy()}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={reauthState.busy()}>
            {reauthState.busy() ? 'Verifying…' : 'Authorize'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
