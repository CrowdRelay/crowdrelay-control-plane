import { Show, createSignal, onMount } from 'solid-js'
import type { Component, JSX } from 'solid-js'
import { authState } from '../lib/auth'
import { SkeletonBlock } from './layout'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

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
    <main class="flex min-h-screen items-center justify-center bg-background p-4">
      <section class="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg" aria-labelledby="control-plane-login-title">
        <div class="flex items-center gap-3 mb-6">
          <a href="https://crowdrelay.music" target="_blank" rel="noreferrer noopener" aria-label="CrowdRelay landing page">
            <img src="/crowdrelay-brand-mark.png" alt="" width="36" height="36" class="rounded-lg" />
          </a>
          <div class="flex flex-col">
            <strong class="text-sm font-bold text-foreground leading-tight">CrowdRelay</strong>
            <small class="text-xs text-muted-foreground leading-tight">Control Plane</small>
          </div>
        </div>
        <h1 id="control-plane-login-title" class="text-xl font-bold text-foreground">Welcome back</h1>
        <p class="mt-1 text-sm text-muted-foreground">Sign in to manage tenants, deployments and ecosystem health.</p>
        <form class="mt-5 flex flex-col gap-4" onSubmit={submit}>
          <div class="flex flex-col gap-1.5">
            <Label for="login-username">Username</Label>
            <Input id="login-username" name="username" autocomplete="username" value={username()} onInput={e => setUsername(e.currentTarget.value)} required autofocus />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="login-password">Password</Label>
            <div class="relative">
              <Input id="login-password" name="password" type={showPassword() ? 'text' : 'password'} autocomplete="current-password" value={password()} onInput={e => setPassword(e.currentTarget.value)} required class="pr-9" />
              <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-sm text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowPassword(s => !s)} aria-label={showPassword() ? 'Hide password' : 'Show password'} tabindex={-1}>
                <Show when={showPassword()} fallback={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                </Show>
              </button>
            </div>
          </div>
          <Show when={error()}><div class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error()}</div></Show>
          <Button type="submit" disabled={busy() || !username().trim() || !password()}>{busy() ? 'Signing in…' : 'Sign in'}</Button>
        </form>
        <div class="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
          <span class="w-2 h-2 rounded-full bg-success flex-shrink-0" />
          <span>Session lives in an HttpOnly cookie — credentials never touch browser storage.</span>
        </div>
      </section>
    </main>
    }>
      {/* Hydrating from the HttpOnly session cookie — show a minimal
          loading state so the login form does not flash for authenticated
          operators on page refresh. */}
      <main class="flex min-h-screen items-center justify-center bg-background p-4">
        <div class="flex flex-col items-center gap-3" aria-label="Loading">
          <SkeletonBlock style={{ width: '48px', height: '48px', 'border-radius': '12px' }} />
          <SkeletonBlock style={{ width: '180px', height: '16px', 'border-radius': '8px' }} />
        </div>
      </main>
    </Show>
  }>{props.children}</Show>
}
