import { Show, createSignal, onMount } from 'solid-js'
import type { Component, JSX } from 'solid-js'
import { authState } from '../lib/auth'
import { LoginHero } from './LoginHero'
import '../login-shell.css'

export const LoginGate: Component<{ children: JSX.Element }> = (props) => {
  const [username, setUsername] = createSignal('')
  const [password, setPassword] = createSignal('')
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

  return <Show when={authState.hydrated()} fallback={
    <main class="login-shell"><section class="login-card" aria-busy="true"><p>Restoring session…</p></section></main>
  }><Show when={authState.profile()} fallback={
    <main class="login-shell">
      <LoginHero />
      <section class="login-card" aria-labelledby="control-plane-login-title">
        {/* Same mark as the hero 40px to the left — the card used to show a
            text "CR" square next to the real logo. */}
        <div class="login-brand"><img class="brand-mark" src="/crowdrelay-brand-mark.png" alt="" width="36" height="36" /><div><strong>CrowdRelay</strong><small>Control Plane</small></div></div>
        <span class="eyebrow">OPERATOR ACCESS</span>
        <h1 id="control-plane-login-title">Welcome back</h1>
        <p>Sign in to manage tenants, deployments and ecosystem health.</p>
        <form class="login-form" onSubmit={submit}>
          <label>Username<input name="username" autocomplete="username" value={username()} onInput={e => setUsername(e.currentTarget.value)} required autofocus /></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" value={password()} onInput={e => setPassword(e.currentTarget.value)} required /></label>
          <Show when={error()}><div class="login-error" role="alert">{error()}</div></Show>
          <button type="submit" disabled={busy() || !username().trim() || !password()}>{busy() ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <div class="login-security"><span class="auth-dot ok"/><span>Session lives in an HttpOnly cookie — credentials never touch browser storage.</span></div>
      </section>
    </main>
  }>{props.children}</Show></Show>
}
