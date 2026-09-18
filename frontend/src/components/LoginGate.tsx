import { Show, createSignal, onMount } from 'solid-js'
import type { Component, JSX } from 'solid-js'
import { authState } from '../lib/auth'
import { SkeletonBlock } from './layout'
import { SignalField } from './SignalField'
import { Button } from './ui/button'
import { TextField, TextFieldDescription, TextFieldInput, TextFieldLabel } from './ui/text-field'

/**
 * Sign-in — the shadcn `login-02` block (form column + visual column), built
 * from solid-ui primitives. The block's email, "forgot password", GitHub and
 * sign-up affordances are left out: operator accounts are usernames issued by
 * a platform admin, and a link to a flow that does not exist is worse than no
 * link. The block's placeholder image is the SignalField.
 */
export const LoginGate: Component<{ children: JSX.Element }> = (props) => {
  const [username, setUsername] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [showPassword, setShowPassword] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')

  // The HttpOnly session cookie may still be alive after a refresh; hydrate
  // the in-memory profile from it before deciding to show the form.
  onMount(() => { void authState.hydrate() })

  const submit: JSX.EventHandlerUnion<HTMLFormElement, SubmitEvent> = async (event) => {
    event.preventDefault()
    if (busy()) return
    const user = username().trim()
    if (!user || !password()) return
    setBusy(true)
    setError('')
    try {
      await authState.login(user, password())
      setPassword('')
    } catch {
      setError('Sign-in failed. Check your username and password.')
    } finally {
      setBusy(false)
    }
  }

  return <Show when={authState.profile()} fallback={
    <Show when={!authState.hydrated()} fallback={
    <main class="grid min-h-viewport bg-background lg:grid-cols-2">
      <div class="flex flex-col gap-4 p-6 md:p-10">
        <div class="flex justify-center md:justify-start">
          <a href="https://crowdrelay.music" target="_blank" rel="noreferrer noopener" class="flex items-center gap-2.5" aria-label="CrowdRelay landing page">
            <img src="/crowdrelay-logo.svg" alt="" width="28" height="28" />
            <span class="flex flex-col">
              <strong class="text-sm font-bold leading-tight text-foreground">CrowdRelay</strong>
              <small class="text-xs leading-tight text-muted-foreground">Control Plane</small>
            </span>
          </a>
        </div>
        <div class="flex flex-1 items-center justify-center">
          <form class="flex w-full max-w-xs flex-col gap-6" onSubmit={submit} aria-labelledby="control-plane-login-title">
            <div class="flex flex-col items-center gap-1 text-center">
              <h1 id="control-plane-login-title" class="text-2xl font-bold text-foreground">Welcome back</h1>
              <p class="text-balance text-sm text-muted-foreground">Sign in to manage tenants, deployments and ecosystem health.</p>
            </div>
            <TextField class="gap-2" name="username" value={username()} onChange={setUsername} required>
              <TextFieldLabel>Username</TextFieldLabel>
              <TextFieldInput id="login-username" autocomplete="username" autofocus />
            </TextField>
            <TextField class="gap-2" name="password" value={password()} onChange={setPassword} required>
              <TextFieldLabel>Password</TextFieldLabel>
              <div class="relative">
                <TextFieldInput id="login-password" type={showPassword() ? 'text' : 'password'} autocomplete="current-password" class="pr-9" />
                <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground" onClick={() => setShowPassword(s => !s)} aria-label={showPassword() ? 'Hide password' : 'Show password'} tabindex={-1}>
                  <Show when={showPassword()} fallback={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                  </Show>
                </button>
              </div>
            </TextField>
            <Show when={error()}><div class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error()}</div></Show>
            <Button type="submit" size="lg" class="w-full" disabled={busy() || !username().trim() || !password()}>{busy() ? 'Signing in…' : 'Sign in'}</Button>
            <TextField class="items-center">
              <TextFieldDescription class="flex items-center gap-2 text-xs">
                <span class="h-2 w-2 flex-shrink-0 rounded-full bg-success" />
                Credentials never touch browser storage.
              </TextFieldDescription>
            </TextField>
          </form>
        </div>
      </div>
      <div class="relative hidden overflow-hidden border-l border-border bg-surface-1 lg:block" aria-hidden="true">
        <SignalField />
      </div>
    </main>
    }>
      {/* Hydrating from the HttpOnly session cookie — show a minimal
          loading state so the login form does not flash for authenticated
          operators on page refresh. */}
      <main class="flex min-h-viewport items-center justify-center bg-background p-4">
        <div class="flex flex-col items-center gap-3" aria-label="Loading">
          <SkeletonBlock style={{ width: '48px', height: '48px', 'border-radius': '12px' }} />
          <SkeletonBlock style={{ width: '180px', height: '16px', 'border-radius': '8px' }} />
        </div>
      </main>
    </Show>
  }>{props.children}</Show>
}
