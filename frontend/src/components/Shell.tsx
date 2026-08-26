import { Link, Outlet, useParams } from '@tanstack/solid-router'
import { Show, lazy, onMount, onCleanup, type Component } from 'solid-js'
import { authState } from '../lib/auth'
import { commandPaletteOpen, toggleCommandPalette } from './command-palette-state'
import { LoginGate } from './LoginGate'
import { TenantSubnav } from './TenantSubnav'

// The palette component loads on first invocation; the shortcut lives here so
// Ctrl/⌘-K works before that chunk exists.
const CommandPalette = lazy(() => import('./CommandPalette').then(m => ({ default: m.CommandPalette })))

export const Shell: Component = () => {
  // Non-strict: only the tenant subpages carry a slug, and the subnav is the
  // one piece of chrome that has to survive scrolling, so it lives in the
  // sticky topbar instead of at the top of each page body.
  const params = useParams({ strict: false })
  const slug = () => (params() as { slug?: string }).slug
  const profile = () => authState.profile()

  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        toggleCommandPalette()
      }
    }
    document.addEventListener('keydown', onKey)
    onCleanup(() => document.removeEventListener('keydown', onKey))
  })

  return <LoginGate>
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span style={{ width: '36px', height: '36px', overflow: 'hidden', display: 'block', 'flex-shrink': '0', 'border-radius': '10px' }}><img class="brand-mark" src="/crowdrelay-brand-mark.png" alt="" width="36" height="36" style={{ width: '44px', height: '44px', 'max-width': 'none', margin: '-4px' }} /></span><div><strong>CrowdRelay</strong><small>Control Plane</small></div></div>
        <nav>
          <Link to="/" activeProps={{ class: 'active' }}>Overview</Link>
          {/* Tenant operators are scoped to their one tenant; the cross-tenant
              registry and platform attention queue are admin surfaces. */}
          <Show when={profile()?.role === 'platform_admin'}>
            <Link to="/tenants" activeProps={{ class: 'active' }}>Tenants</Link>
            <Link to="/attention" activeProps={{ class: 'active' }}>Attention</Link>
          </Show>
        </nav>
        <div class="sidebar-foot"><span class="auth-dot ok" />{profile()?.username ?? 'operator'} · {profile()?.role === 'tenant_operator' ? `tenant ${profile()?.tenantSlug}` : 'platform admin'}</div>
      </aside>
      <main class="content">
        <header class="topbar">
          <div><span class="eyebrow">PLATFORM</span><strong>Operations</strong></div>
          <Show when={slug()}>{tenant => <TenantSubnav slug={tenant()} />}</Show>
          <button class="topbar-cmdk ghost" type="button" onClick={() => toggleCommandPalette()} title="Command palette (Ctrl+K / ⌘K)">
            <kbd>⌘K</kbd><span class="cmdk-trigger-label">Commands</span>
          </button>
          <button class="topbar-logout" type="button" onClick={() => { void authState.logout() }}>Log out</button>
        </header>
        <Outlet />
        <Show when={commandPaletteOpen()}><CommandPalette /></Show>
      </main>
    </div>
  </LoginGate>
}
