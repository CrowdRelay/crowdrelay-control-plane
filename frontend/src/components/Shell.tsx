import { Link, Outlet, useParams } from '@tanstack/solid-router'
import { Show, type Component } from 'solid-js'
import { authState } from '../lib/auth'
import { LoginGate } from './LoginGate'
import { TenantSubnav } from './TenantSubnav'

export const Shell: Component = () => {
  // Non-strict: only the tenant subpages carry a slug, and the subnav is the
  // one piece of chrome that has to survive scrolling, so it lives in the
  // sticky topbar instead of at the top of each page body.
  const params = useParams({ strict: false })
  const slug = () => (params() as { slug?: string }).slug

  return <LoginGate>
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span style={{ width: '36px', height: '36px', overflow: 'hidden', display: 'block', 'flex-shrink': '0', 'border-radius': '10px' }}><img class="brand-mark" src="/crowdrelay-brand-mark.png" alt="" width="36" height="36" style={{ width: '44px', height: '44px', 'max-width': 'none', margin: '-4px' }} /></span><div><strong>CrowdRelay</strong><small>Control Plane</small></div></div>
        <nav>
          <Link to="/" activeProps={{ class: 'active' }}>Overview</Link>
          <Link to="/tenants" activeProps={{ class: 'active' }}>Tenants</Link>
        </nav>
        <div class="sidebar-foot"><span class="auth-dot ok" />Operator session</div>
      </aside>
      <main class="content">
        <header class="topbar">
          <div><span class="eyebrow">PLATFORM</span><strong>Operations</strong></div>
          <Show when={slug()}>{tenant => <TenantSubnav slug={tenant()} />}</Show>
          <button class="topbar-logout" type="button" onClick={() => authState.clear()}>Wyloguj</button>
        </header>
        <Outlet />
      </main>
    </div>
  </LoginGate>
}
