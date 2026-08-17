import { Show, createSignal, type ParentComponent } from 'solid-js'
import { adminToken, setAdminToken } from '../lib/auth'

export const AuthGate: ParentComponent = (props) => {
  const [draft, setDraft] = createSignal('')
  return <Show when={adminToken()} fallback={
    <div class="auth-page"><form class="auth-card" onSubmit={(event) => { event.preventDefault(); if (draft().trim().length >= 32) setAdminToken(draft()) }}>
      <span class="eyebrow">CROWDRELAY PLATFORM</span>
      <h1>Control Plane</h1>
      <p>Platform-superadmin access only. The token is kept in session storage and never persisted by the backend.</p>
      <label>Admin bearer token<input type="password" autocomplete="current-password" value={draft()} onInput={(e) => setDraft(e.currentTarget.value)} placeholder="••••••••••••••••" /></label>
      <button type="submit" disabled={draft().trim().length < 32}>Unlock dashboard</button>
    </form></div>
  }>{props.children}</Show>
}
