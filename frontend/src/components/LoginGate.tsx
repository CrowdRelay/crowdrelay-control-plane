import { Show, createSignal, onMount } from 'solid-js'
import type { Component, JSX } from 'solid-js'
import { authState } from '../lib/auth'
import { SkeletonBlock } from './layout'
import { SignalField } from './SignalField'
import { Button } from './app/button'
import { Input } from './ui/input'
import { Label } from './app/label'
import { Alert } from './app/alert'

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
    // Layout: shadcn "login-02" (ui.shadcn.com/view/new-york-v4/login-02).
    // One column on mobile; from `lg` the form keeps the left half and the
    // right half is a muted panel, here carrying the brand's signal field
    // instead of the block's placeholder image. The block's email, "forgot
    // password", sign-up and GitHub parts are left out: this console signs in
    // by username and has none of those flows.
    <main class="grid min-h-viewport overflow-y-auto bg-background lg:grid-cols-2">
      <div class="flex flex-col gap-4 p-6 md:p-10">
        <div class="flex justify-center gap-2 md:justify-start">
          <a href="https://crowdrelay.music" target="_blank" rel="noreferrer noopener" class="flex items-center gap-2 font-medium">
            <img src="/crowdrelay-logo.svg" alt="" width="24" height="24" class="size-6" />
            CrowdRelay Control Plane
          </a>
        </div>
        <div class="flex flex-1 items-center justify-center">
          <div class="w-full max-w-xs">
            <form class="flex flex-col gap-6" onSubmit={submit} aria-labelledby="control-plane-login-title">
              <div class="flex flex-col items-center gap-1 text-center">
                <h1 id="control-plane-login-title" class="text-2xl font-bold">Sign in to your account</h1>
                <p class="text-balance text-sm text-muted-foreground">
                  Enter your username and password to manage tenants, deployments and ecosystem health.
                </p>
              </div>
              <div class="grid gap-3">
                <Label for="login-username">Username</Label>
                <Input id="login-username" name="username" autocomplete="username" value={username()} onInput={e => setUsername(e.currentTarget.value)} required autofocus />
              </div>
              <div class="grid gap-3">
                <Label for="login-password">Password</Label>
                <div class="relative">
                  <Input id="login-password" name="password" type={showPassword() ? 'text' : 'password'} autocomplete="current-password" value={password()} onInput={e => setPassword(e.currentTarget.value)} required class="pr-10" />
                  <Button type="button" variant="ghost" size="icon" class="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword(s => !s)} aria-label={showPassword() ? 'Hide password' : 'Show password'} tabindex={-1}>
                    <Show when={showPassword()} fallback={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                    </Show>
                  </Button>
                </div>
              </div>
              <Show when={error()}>
                <Alert tone="destructive">{error()}</Alert>
              </Show>
              <Button type="submit" class="w-full" disabled={busy() || !username().trim() || !password()}>{busy() ? 'Signing in…' : 'Sign in'}</Button>
              <p class="text-center text-sm text-muted-foreground">Credentials never touch browser storage.</p>
            </form>
          </div>
        </div>
      </div>
      <div class="relative hidden overflow-hidden bg-muted lg:block" aria-hidden="true">
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
