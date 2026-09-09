import { Show, createSignal, onMount } from 'solid-js'
import type { Component, JSX } from 'solid-js'
import { authState } from '../lib/auth'
import { SkeletonBlock } from './layout'

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
    <main class="login-shell">
      <section class="login-card" aria-labelledby="control-plane-login-title">
        <div class="login-brand"><a href="https://crowdrelay.music" target="_blank" rel="noreferrer noopener" aria-label="CrowdRelay landing page"><img class="brand-mark" src="/crowdrelay-brand-mark.png" alt="" width="36" height="36" /></a><div><strong>CrowdRelay</strong><small>Control Plane</small></div></div>
        <span class="eyebrow">OPERATOR ACCESS</span>
        <h1 id="control-plane-login-title">Welcome back</h1>
        <p>Sign in to manage tenants, deployments and ecosystem health.</p>
        <form class="login-form" onSubmit={submit}>
          <label>Username<input name="username" autocomplete="username" value={username()} onInput={e => setUsername(e.currentTarget.value)} required autofocus /></label>
          <label class="password-field">
            Password
            <div class="password-input-wrap">
              <input name="password" type={showPassword() ? 'text' : 'password'} autocomplete="current-password" value={password()} onInput={e => setPassword(e.currentTarget.value)} required />
              <button type="button" class="password-toggle" onClick={() => setShowPassword(s => !s)} aria-label={showPassword() ? 'Hide password' : 'Show password'} tabindex={-1}>
                <Show when={showPassword()} fallback={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                </Show>
              </button>
            </div>
          </label>
          <Show when={error()}><div class="login-error" role="alert">{error()}</div></Show>
          <button type="submit" disabled={busy() || !username().trim() || !password()}>{busy() ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <div class="login-security"><span class="auth-dot ok"/><span>Session lives in an HttpOnly cookie — credentials never touch browser storage.</span></div>
      </section>
    </main>
    }>
      {/* Hydrating from the HttpOnly session cookie — show a minimal
          loading state so the login form does not flash for authenticated
          operators on page refresh. */}
      <main class="login-shell">
        <div class="login-hydrating" aria-label="Loading">
          <SkeletonBlock style={{ width: '48px', height: '48px', 'border-radius': '12px' }} />
          <SkeletonBlock style={{ width: '180px', height: '16px', 'border-radius': '8px' }} />
        </div>
      </main>
    </Show>
  }>{props.children}</Show>
}
