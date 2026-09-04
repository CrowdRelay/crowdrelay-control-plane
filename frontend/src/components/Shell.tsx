import { Link, Outlet, useParams, useNavigate, useRouter } from '@tanstack/solid-router'
import { Show, For, createSignal, createEffect, lazy, onMount, onCleanup, Suspense, type Component } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { authState } from '../lib/auth'
import { commandPaletteOpen, toggleCommandPalette } from './command-palette-state'
import { api } from '../lib/api'
import { ToastContainer } from '../lib/toast'
import { RefreshControl } from './RefreshControl'
import { ChatWidget } from './ChatWidget'
import { SkeletonPage } from './Skeleton'
import { ErrorBoundaryPanel } from './ErrorBoundaryPanel'
import { ConfirmHost } from './Dialog'
import { ReauthModal } from './ReauthModal'
import { MobileTabBar } from './MobileTabBar'
import type { TenantSummary } from '../lib/types'

// The palette component loads on first invocation; the shortcut lives here so
// Ctrl/⌘-K works before that chunk exists.
const CommandPalette = lazy(() => import('./CommandPalette').then(m => ({ default: m.CommandPalette })))

const healthDot = (tenant: TenantSummary) => {
  if (tenant.status === 'suspended') return 'bad'
  if (tenant.runtimeHealth === 'healthy') return 'good'
  if (tenant.runtimeHealth === 'degraded') return 'warn'
  if (tenant.runtimeHealth === 'stale') return 'warn'
  return 'muted'
}

const healthLabel = (tenant: TenantSummary) => {
  if (tenant.status === 'suspended') return 'suspended'
  if (tenant.runtimeHealth === 'healthy') return 'healthy'
  if (tenant.runtimeHealth === 'degraded') return 'degraded'
  if (tenant.runtimeHealth === 'stale') return 'stale'
  return 'unknown'
}

// Tenant-scoped nav, grouped by the operator's mental model:
//   CONTROL — what needs your attention right now (overview, incidents)
//   BRAIN — the deterministic autopilot's intelligence and learning
//   EXECUTION — live operations, integrations, and alert channels
//   AUDIENCE — who you're reaching and how (portfolio, fans, communities, growth, AREA)
type NavItem = { path: string; label: string; exact: boolean; icon: string }
type NavGroup = { label: string; items: NavItem[] }

const TENANT_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Control',
    items: [
      { path: '/tenants/$slug', label: 'Overview', exact: true, icon: 'overview' },
      { path: '/tenants/$slug/attention', label: 'Attention', exact: false, icon: 'attention' },
    ],
  },
  {
    label: 'Brain',
    items: [
      { path: '/tenants/$slug/intelligence', label: 'Intelligence', exact: false, icon: 'intelligence' },
      { path: '/tenants/$slug/health', label: 'Autopilot', exact: false, icon: 'health' },
    ],
  },
  {
    label: 'Execution',
    items: [
      { path: '/tenants/$slug/operations', label: 'Operations', exact: false, icon: 'operations' },
      { path: '/tenants/$slug/integrations', label: 'AI Integrations', exact: false, icon: 'integrations' },
      { path: '/tenants/$slug/notifiers', label: 'Notifiers', exact: false, icon: 'notifiers' },
    ],
  },
  {
    label: 'Audience',
    items: [
      { path: '/tenants/$slug/portfolio', label: 'Portfolio', exact: false, icon: 'portfolio' },
      { path: '/tenants/$slug/audience', label: 'Fan Intelligence', exact: false, icon: 'fan-intel' },
      { path: '/tenants/$slug/communities', label: 'Communities', exact: false, icon: 'audience' },
      { path: '/tenants/$slug/beacons', label: 'Beacons', exact: false, icon: 'beacons' },
      { path: '/tenants/$slug/funnel', label: 'Growth', exact: false, icon: 'growth' },
      { path: '/tenants/$slug/area', label: 'AREA', exact: false, icon: 'area' },
    ],
  },
]

// Small inline nav icons — 16px, currentColor, no external deps.
function NavIcon(props: { name: string }) {
  const icons: Record<string, any> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    operations: <><path d="M3 12h4l2-7 4 14 2-7h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></>,
    intelligence: <><path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 7 17a3 3 0 0 0 2 4 3 3 0 0 0 3-3V3a3 3 0 0 0-3 0z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8A3 3 0 0 1 17 17a3 3 0 0 1-2 4 3 3 0 0 1-3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/></>,
    attention: <><path d="M12 2L1 21h22L12 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17" r="1"/></>,
    portfolio: <><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 9h18M9 9v12" fill="none" stroke="currentColor" stroke-width="2"/></>,
    notifiers: <><path d="M18 8a6 6 0 0 1-12 0M18 8a6 6 0 0 0-12 0M18 8v5a6 6 0 0 1-12 0V8M12 14v3M10 19h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></>,
    area: <><circle cx="12" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></>,
    audience: <><circle cx="9" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="6" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15 14c0-2.2 1.8-4 4-4s4 1.8 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></>,
    'fan-intel': <><path d="M12 3 C9.5 3 7.5 4.2 7 6.5 C5.8 6.8 5 8 5.3 9.5 C4.3 10 4 11.2 4.8 12.2 C4 12.8 4 14 5 14.8 C4.8 16 5.8 17.5 7.5 18 C8.2 19 9.5 19.5 10.5 19.3 L12 19 L12 3 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 8 C8 8.4 9 8.4 9.8 8 M6 11 C7 11.4 8.5 11.4 9.5 11 M6.5 14 C7.5 14.3 8.8 14.3 9.8 14" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.55"/><path d="M12 3 C14.5 3 16.5 4.2 17 6.5 C18.2 6.8 19 8 18.7 9.5 C19.7 10 20 11.2 19.2 12.2 C20 12.8 20 14 19 14.8 C19.2 16 18.2 17.5 16.5 18 C15.8 19 14.5 19.5 13.5 19.3 L12 19 L12 3 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="15.2" cy="10" r="1" fill="currentColor"/><path d="M14 14 C14.8 14.5 15.5 14.5 16 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></>,
    integrations: <><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1l2.1-2.1M17 7l2.1-2.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></>,
    automation: <><circle cx="6" cy="6" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="6" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 6h7M9 8l2 7M15 8l-2 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></>,
    flow: <><circle cx="5" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="19" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 6h4l3 8M17 6h-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></>,
    funnel: <><path d="M3 4h18l-7 8v6l-4 2v-8L3 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></>,
    growth: <><path d="M3 17l5-5 3 3 4-6 3 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 7h4v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></>,
    beacons: <><path d="M9.5 21h5l-.9-10h-3.2zM9.9 11h4.2l-.5-3h-3.2zM8 6.5 5 5M16 6.5 19 5M8 9 5 9.5M16 9l3 .5M7.5 21h9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></>,
    health: <><path d="M3 12h4l2-5 4 10 2-5h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="6" r="1.5" fill="currentColor"/></>,
  }
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" class="nav-icon" aria-hidden="true">{icons[props.name] ?? icons.overview}</svg>
}

function TenantSwitcher(props: {
  tenants: TenantSummary[]
  currentSlug: string | undefined
  onSelect: (slug: string) => void
  open: boolean
  onToggle: () => void
  onClose: () => void
  collapsed: boolean
}) {
  const [search, setSearch] = createSignal('')
  const current = () => props.tenants.find(t => t.slug === props.currentSlug)
  const sorted = () => [...props.tenants].sort((a, b) => a.displayName.localeCompare(b.displayName))
  const filtered = () => {
    const q = search().trim().toLowerCase()
    if (!q) return sorted()
    return sorted().filter(t => t.displayName.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q))
  }

  return <div class="tenant-switcher" classList={{ open: props.open, collapsed: props.collapsed }}>
    <button type="button" class="tenant-switcher-trigger" onClick={() => props.onToggle()} title={current()?.displayName} aria-expanded={props.open} aria-haspopup="listbox" aria-label="Select tenant">
      <Show when={current()} fallback={<span class="tenant-switcher-dot muted" />}>
        {t => <span class={`tenant-switcher-dot ${healthDot(t())}`} />}
      </Show>
      <Show when={!props.collapsed}>
        <span class="tenant-switcher-label">{current()?.displayName ?? 'Select tenant'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="tenant-switcher-chevron" classList={{ rotated: props.open }} aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
      </Show>
    </button>
    <Show when={props.open && !props.collapsed}>
      <div class="tenant-switcher-menu" role="listbox">
        <Show when={props.tenants.length > 5}>
          <input
            class="tenant-switcher-search"
            placeholder="Filter tenants…"
            aria-label="Filter tenants"
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
            onClick={(e) => e.stopPropagation()}
            spellcheck={false}
          />
        </Show>
        <For each={filtered()}>{tenant => (
          <button
            type="button"
            class="tenant-switcher-item"
            classList={{ active: tenant.slug === props.currentSlug }}
            onClick={() => { props.onClose(); props.onSelect(tenant.slug) }}
          >
            <span class={`tenant-switcher-dot ${healthDot(tenant)}`} />
            <span class="tenant-switcher-item-label">
              <strong>{tenant.displayName}</strong>
              <small>{tenant.slug} · {healthLabel(tenant)}</small>
            </span>
          </button>
        )}</For>
        <Show when={filtered().length === 0}>
          <div class="tenant-switcher-empty">No tenants match “{search()}”.</div>
        </Show>
      </div>
    </Show>
  </div>
}

// Global nav, declared once so the topbar breadcrumb can name the current
// page instead of repeating the tenant name the page heading already shows.
// Ordered the way the work is read: what is happening, who it is for, what is
// running, what needs a person, then the map that explains the rest.
// `New tenant` stays beside Tenants — it is that page's action, not a sixth
// destination.
const GLOBAL_NAV: NavItem[] = [
  { path: '/', label: 'Overview', exact: true, icon: 'overview' },
  { path: '/tenants', label: 'Tenants', exact: true, icon: 'portfolio' },
  { path: '/tenants/new', label: 'New tenant', exact: true, icon: 'portfolio' },
  { path: '/automation', label: 'Automation', exact: false, icon: 'automation' },
  { path: '/attention', label: 'Attention', exact: false, icon: 'attention' },
  { path: '/flow', label: 'Process map', exact: false, icon: 'flow' },
]

// Longest tenant suffix wins so `/operations` never matches before a deeper
// child route added later.
const TENANT_NAV_ITEMS = TENANT_NAV_GROUPS.flatMap(group => group.items)
  .slice()
  .sort((a, b) => b.path.length - a.path.length)

const currentPageLabel = (pathname: string, slug: string | undefined) => {
  if (slug) {
    const base = `/tenants/${slug}`
    const suffix = pathname.slice(base.length)
    const match = TENANT_NAV_ITEMS.find(item => {
      const itemSuffix = item.path.replace('/tenants/$slug', '')
      return itemSuffix ? suffix.startsWith(itemSuffix) : suffix === ''
    })
    return match?.label ?? 'Overview'
  }
  return GLOBAL_NAV.find(item => item.exact ? pathname === item.path : pathname.startsWith(item.path))?.label ?? 'Overview'
}

export const Shell: Component = () => {
  const params = useParams({ strict: false })
  const slug = () => (params() as { slug?: string }).slug
  const profile = () => authState.profile()
  const navigate = useNavigate()
  const router = useRouter()
  const pathname = () => router.state.location.pathname
  const isAdmin = () => profile()?.role === 'platform_admin'
  const [switcherOpen, setSwitcherOpen] = createSignal(false)
  // Mobile drawer. Desktop ignores it; the media query does the hiding.
  const [mobileNavOpen, setMobileNavOpen] = createSignal(false)
  // Sidebar collapse state — persisted in localStorage so it survives refresh.
  const [collapsed, setCollapsed] = createSignal(
    typeof localStorage !== 'undefined' && localStorage.getItem('sidebar-collapsed') === '1'
  )
  const toggleCollapsed = () => {
    const next = !collapsed()
    setCollapsed(next)
    try { localStorage.setItem('sidebar-collapsed', next ? '1' : '0') } catch {}
  }

  // Opening the mobile drawer must show labels — a collapsed sidebar
  // (persisted from desktop) hides them via <Show when={!collapsed()}> in
  // JSX, which CSS cannot override. Reset to expanded on mobile open.
  const openMobileNav = () => {
    if (collapsed()) {
      setCollapsed(false)
      try { localStorage.setItem('sidebar-collapsed', '0') } catch {}
    }
    setMobileNavOpen(true)
  }

  const tenants = useQuery(() => ({
    queryKey: ['tenants'],
    queryFn: () => api.tenants(),
    enabled: isAdmin(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    reconcile: 'id',
  }))
  const attentionCount = () =>
    (tenants.data?.items ?? []).filter(t => t.runtimeHealth === 'degraded' || t.runtimeHealth === 'stale').length

  const selectTenant = (newSlug: string) => {
    const current = slug()
    if (current) {
      const sub = location.pathname.replace(`/tenants/${current}`, '')
      navigate({ to: `/tenants/${newSlug}${sub}` as any })
    } else {
      navigate({ to: `/tenants/${newSlug}` as any })
    }
  }

  // A tap on a nav link navigates; the drawer must not stay over the page it
  // just moved to.
  createEffect(() => {
    pathname()
    setMobileNavOpen(false)
  })

  // After login, redirect the operator to their default tenant so the
  // tenant-scoped nav is immediately available. Admins land on Virya (the
  // first tenant and the one the crew works on); tenant operators land on
  // their own tenant. Only redirects once per session (the flag is cleared
  // on login/logout by auth.ts) and only from the bare `/` path.
  createEffect(() => {
    if (!authState.profile()) return
    if (pathname() !== '/') return
    if (sessionStorage.getItem('cp-default-tenant')) return
    const targetSlug = isAdmin() ? 'virya' : profile()?.tenantSlug
    if (!targetSlug) return
    sessionStorage.setItem('cp-default-tenant', '1')
    navigate({ to: `/tenants/${targetSlug}` as any })
  })

  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        toggleCommandPalette()
      }
      if (event.key === 'Escape' && mobileNavOpen()) setMobileNavOpen(false)
      // Left/Right arrow collapses/expands sidebar (desktop only, not in inputs).
      if (window.innerWidth > 780) {
        const target = event.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
        if (event.metaKey || event.ctrlKey || event.altKey) return
        if (event.key === 'ArrowLeft' && !collapsed()) {
          event.preventDefault()
          toggleCollapsed()
        } else if (event.key === 'ArrowRight' && collapsed()) {
          event.preventDefault()
          toggleCollapsed()
        }
      }
    }
    const onDocClick = (event: MouseEvent) => {
      const el = event.target as HTMLElement
      if (!el.closest('.tenant-switcher')) setSwitcherOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onDocClick)
    onCleanup(() => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onDocClick)
    })
  })

  return <>
    <a href="#main-content" class="skip-link">Skip to content</a>
    <div class="app-shell" classList={{ collapsed: collapsed() }}>
      <Show when={mobileNavOpen()}>
        <div class="nav-backdrop" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
      </Show>
      <aside class="sidebar" classList={{ collapsed: collapsed(), 'mobile-open': mobileNavOpen() }}>
        <div class="sidebar-head">
          <div class="brand">
            <span class="brand-mark-wrap">
              <img class="brand-mark" src="/crowdrelay-brand-mark.png" alt="" width="36" height="36" />
            </span>
            <Show when={!collapsed()}>
              <div><strong>CrowdRelay</strong><small>Control Plane</small></div>
            </Show>
          </div>
          <button type="button" class="sidebar-toggle" onClick={toggleCollapsed} title={collapsed() ? 'Expand sidebar' : 'Collapse sidebar'} aria-label="Toggle sidebar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" classList={{ rotated: collapsed() }} aria-hidden="true">              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
        </div>

        {/* Global nav */}
        <nav class="sidebar-nav-global">
          <Link to="/" activeProps={{ class: 'active' }} activeOptions={{ exact: true }} title="Overview">
            <NavIcon name="overview" />
            <Show when={!collapsed()}><span>Overview</span></Show>
          </Link>
          <Show when={isAdmin()}>
            <Link to="/tenants" activeProps={{ class: 'active' }} activeOptions={{ exact: true }} title="Tenants">
              <NavIcon name="portfolio" />
              <Show when={!collapsed()}><span>Tenants</span></Show>
            </Link>
            <Link to="/attention" activeProps={{ class: 'active' }} title="Attention">
              <NavIcon name="attention" />
              <Show when={!collapsed()}><span>Attention</span></Show>
              <Show when={attentionCount() > 0}><span class="nav-badge" aria-label={`${attentionCount()} tenants need attention`}>{attentionCount()}</span></Show>
            </Link>
            <Link to="/automation" activeProps={{ class: 'active' }} title="Automation">
              <NavIcon name="automation" />
              <Show when={!collapsed()}><span>Automation</span></Show>
            </Link>
          </Show>
          <Link to="/flow" activeProps={{ class: 'active' }} title="Process map">
            <NavIcon name="flow" />
            <Show when={!collapsed()}><span>Process map</span></Show>
          </Link>
        </nav>

        {/* Tenant switcher + grouped tenant nav */}
        <Show when={slug()}>
          <div class="sidebar-tenant-section">
            <Show when={isAdmin() && tenants.data} keyed>
              {(data) => <TenantSwitcher
                tenants={data.items}
                currentSlug={slug()}
                onSelect={selectTenant}
                open={switcherOpen()}
                onToggle={() => setSwitcherOpen(o => !o)}
                onClose={() => setSwitcherOpen(false)}
                collapsed={collapsed()}
              />}
            </Show>
            <Show when={!isAdmin()}>
              <div class="sidebar-tenant-static" title={profile()?.tenantSlug ?? 'tenant'}>
                <span class="auth-dot ok" />
                <Show when={!collapsed()}><span>{profile()?.tenantSlug ?? 'tenant'}</span></Show>
              </div>
            </Show>

            <For each={TENANT_NAV_GROUPS}>{group => (
              <div class="sidebar-nav-group">
                <Show when={!collapsed()}>
                  <span class="sidebar-nav-group-label">{group.label}</span>
                </Show>
                <nav class="sidebar-nav-tenant" aria-label={group.label}>
                  <For each={group.items}>{item => (
                    <Link
                      to={item.path as any}
                      params={{ slug: slug()! } as any}
                      activeOptions={{ exact: item.exact }}
                      activeProps={{ class: 'active' }}
                      title={item.label}
                    >
                      <NavIcon name={item.icon} />
                      <Show when={!collapsed()}><span>{item.label}</span></Show>
                    </Link>
                  )}</For>
                </nav>
              </div>
            )}</For>
          </div>
        </Show>

        <div class="sidebar-foot" classList={{ collapsed: collapsed() }}>
          <span class={`auth-dot ok`} />
          <Show when={!collapsed()}>
            <span class="sidebar-foot-user">{profile()?.username ?? 'operator'}</span>
            <span class="sidebar-foot-role">{isAdmin() ? 'admin' : 'tenant'}</span>
          </Show>
        </div>
      </aside>

      <main class="content" id="main-content">
        <header class="topbar">
          <button
            type="button"
            class="topbar-menu"
            onClick={() => mobileNavOpen() ? setMobileNavOpen(false) : openMobileNav()}
            aria-label={mobileNavOpen() ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileNavOpen()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <Show when={mobileNavOpen()} fallback={<path d="M4 7h16M4 12h16M4 17h16" />}>
                <path d="M6 6l12 12M18 6L6 18" />
              </Show>
            </svg>
          </button>
          {/* Breadcrumb, not a second copy of the page heading: it says where
              you are, while the page below says what it is. */}
          <div class="topbar-context">
            <Show when={slug()} fallback={<><span class="eyebrow">PLATFORM</span><strong>{currentPageLabel(pathname(), undefined)}</strong></>}>
              {s => <>
                <span class="eyebrow">{(tenants.data?.items.find(t => t.slug === s())?.displayName ?? s()).toUpperCase()}</span>
                <strong>{currentPageLabel(pathname(), s())}</strong>
              </>}
            </Show>
          </div>
          <div class="topbar-actions">
            <RefreshControl />
            <button class="topbar-cmdk ghost" type="button" onClick={() => toggleCommandPalette()} title="Command palette (Ctrl+K / ⌘K)">
              <kbd>⌘K</kbd><span class="cmdk-trigger-label">Commands</span>
            </button>
            <button class="topbar-logout" type="button" onClick={() => { void authState.logout() }}>Log out</button>
          </div>
        </header>
        {/* Keyed on the route so a thrown page recovers by navigating away
            instead of leaving the console permanently blank. The key forces
            a remount which resets Suspense + ErrorBoundary state per page. */}
        <div class="page-content" data-key={pathname()}>
          <ErrorBoundaryPanel resetKey={pathname()} title="This page failed to render">
            <Suspense fallback={<SkeletonPage />}>
              <Outlet />
            </Suspense>
          </ErrorBoundaryPanel>
        </div>
        <Show when={commandPaletteOpen()}><CommandPalette /></Show>
        <ToastContainer />
        <ConfirmHost />
      </main>
      <MobileTabBar />
      <ReauthModal />
      <Show when={slug()}>{(s) => <ChatWidget slug={s()} />}</Show>
    </div>
  </>
}
