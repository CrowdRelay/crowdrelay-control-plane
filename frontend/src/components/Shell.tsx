import { Link, Outlet } from '@tanstack/solid-router'
import type { Component } from 'solid-js'
import { authState } from '../lib/auth'
import { LoginGate } from './LoginGate'

export const Shell: Component = () => (
  <LoginGate>
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">CR</span><div><strong>CrowdRelay</strong><small>Control Plane</small></div></div>
        <nav>
          <Link to="/" activeProps={{ class: 'active' }}>Overview</Link>
          <Link to="/tenants" activeProps={{ class: 'active' }}>Tenants</Link>
        </nav>
        <div class="sidebar-foot"><span class="auth-dot ok" />Operator session</div>
      </aside>
      <main class="content">
        <header class="topbar">
          <div><span class="eyebrow">PLATFORM</span><strong>Operations</strong></div>
          <button class="topbar-logout" type="button" onClick={() => authState.clear()}>Wyloguj</button>
        </header>
        <Outlet />
      </main>
    </div>
  </LoginGate>
)
