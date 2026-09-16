import { Link, Outlet, useParams, useNavigate, useRouter } from '@tanstack/solid-router'
import { Eyebrow } from './layout'
import { Show, For, createSignal, createEffect, lazy, onMount, onCleanup, Suspense, type Component } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { authState } from '../lib/auth'
import { commandPaletteOpen, toggleCommandPalette } from './command-palette-state'
import { api } from '../lib/api'
import { ToastContainer } from './ui/toast'
import { RefreshControl } from './RefreshControl'

import { ErrorBoundaryPanel } from './ErrorBoundaryPanel'
import { ConfirmHost } from './Dialog'
import { ReauthModal } from './ReauthModal'
import { Button } from './ui/button'
import { cn } from '../lib/cn'
import { whileIncomplete, hasUnavailableTenant } from '../lib/incomplete'
import { NavIcon } from './NavIcon'
import { TenantSwitcher } from './TenantSwitcher'
import { tenantNavGroups, currentPageLabel, type NavGroup } from '../lib/nav'

// The palette component loads on first invocation; the shortcut lives here so
// Ctrl/⌘-K works before that chunk exists.
const CommandPalette = lazy(() => import('./CommandPalette').then(m => ({ default: m.CommandPalette })))
// The chat widget is the heaviest component in the shell — 600+ lines plus
// its markdown renderer — and it only exists on tenant pages. Lazy so the
// overview and login do not pay for it.
const ChatWidget = lazy(() => import('./ChatWidget').then(m => ({ default: m.ChatWidget })))

export const Shell: Component = () => {
  const params = useParams({ strict: false })
  const slug = () => (params() as { slug?: string }).slug

  // The tenant nav used to vanish the moment the operator clicked Overview,
  // Tenants or Process map, because it was gated on the route's own `slug`.
  // Leaving a tenant's page is not leaving the tenant — the whole column of
  // links they were working in disappeared and came back only after they had
  // navigated into one again.
  //
  // Remembered per tab rather than globally: two windows open on two tenants
  // should not fight over whose nav is showing.
  const LAST_TENANT_KEY = 'cp-last-tenant'
  const [lastTenant, setLastTenant] = createSignal<string | undefined>(
    (() => {
      try { return sessionStorage.getItem(LAST_TENANT_KEY) ?? undefined } catch { return undefined }
    })(),
  )
  createEffect(() => {
    const current = slug()
    if (!current || current === lastTenant()) return
    setLastTenant(current)
    try { sessionStorage.setItem(LAST_TENANT_KEY, current) } catch {}
  })

  // What the sidebar renders: the tenant the operator is in, or the last one
  // they were in. `Link`'s own active matching runs against the real location,
  // so nothing in this column lights up while they are on a platform page —
  // the links are reachable, not pretending to be where you are.
  const navSlug = () => slug() ?? lastTenant()
  const profile = () => authState.profile()
  const navigate = useNavigate()
  const router = useRouter()
  const pathname = () => router.state.location.pathname
  const searchTab = () => (router.state.location.search as { tab?: string }).tab
  const isPlatformLevel = () => authState.isPlatformLevel()
  const isAdmin = () => authState.isAdmin()
  const [switcherOpen, setSwitcherOpen] = createSignal(false)

  // Which nav groups are open. Remembered, because an operator who opens
  // "Set up once" is usually in the middle of setting something up and should
  // not have to reopen it on every navigation.
  const NAV_GROUP_KEY = 'nav-open-groups'
  const [openGroups, setOpenGroups] = createSignal<Record<string, boolean>>((() => {
    try {
      const raw = localStorage.getItem(NAV_GROUP_KEY)
      return raw ? JSON.parse(raw) as Record<string, boolean> : {}
    } catch { return {} }
  })())
  const groupOpen = (group: NavGroup) => openGroups()[group.label] ?? group.defaultOpen
  const toggleGroup = (label: string) => {
    setOpenGroups(prev => {
      const group = tenantNavGroups(isPlatformLevel()).find(g => g.label === label)
      const next = { ...prev, [label]: !(prev[label] ?? group?.defaultOpen ?? false) }
      try { localStorage.setItem(NAV_GROUP_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }
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
    enabled: isPlatformLevel(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    reconcile: 'id',
  }))

  // Attention count for the nav badge — uses the same query key as OverviewPage
  // so the data is shared, not re-fetched.
  const commandCenter = useQuery(() => ({
    queryKey: ['command-center'],
    queryFn: () => api.commandCenter(),
    // The endpoint is platform-level only — a tenant session would poll a
    // guaranteed 403 every interval for a badge that can never fill.
    enabled: isPlatformLevel(),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    // Same key as OverviewPage, so it must carry the same retry rule —
    // otherwise whichever observer mounts first decides whether an
    // incomplete answer is ever asked about again.
    refetchInterval: whileIncomplete(hasUnavailableTenant),
  }))
  const attentionCount = () => {
    const cc = commandCenter.data
    if (!cc) return 0
    return cc.attention.needsYou + cc.attention.awaitingApproval + cc.attention.criticalAlerts
  }

  const selectTenant = (newSlug: string) => {
    const current = slug()
    if (current) {
      const sub = pathname().replace(`/tenants/${current}`, '')
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
  // tenant-scoped nav is immediately available. Admins land on the first
  // tenant in the registry (Virya in practice, but resolved from the list
  // not hardcoded); tenant operators land on their own tenant. Only
  // redirects once per session (the flag is cleared on login/logout by
  // auth.ts) and only from the bare `/` path.
  createEffect(() => {
    if (!authState.profile()) return
    if (pathname() !== '/') return
    if (sessionStorage.getItem('cp-default-tenant')) return
    const tenantSlug = isPlatformLevel()
      ? (tenants.data?.items?.[0]?.slug ?? profile()?.tenantSlug)
      : profile()?.tenantSlug
    if (!tenantSlug) return
    sessionStorage.setItem('cp-default-tenant', '1')
    navigate({ to: `/tenants/${tenantSlug}/attention` as any })
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
    // Outside-click dismiss for the tenant switcher is owned by the Kobalte
    // Popover now — a document listener cannot see inside the portal and was
    // closing the menu on any interaction with the search box.
    document.addEventListener('keydown', onKey)
    onCleanup(() => {
      document.removeEventListener('keydown', onKey)
    })
  })

  return <>
    <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-foreground">Skip to content</a>
    {/* `min-h-screen` let this wrapper grow past the viewport, so the document
        scrolled at the same time as the pane inside `main` — two scrollbars, and
        a wheel gesture that moved whichever one the pointer happened to be over.
        The pane inside `main` is the only thing that scrolls. */}
    <div class="flex h-viewport overflow-hidden bg-background">
      <Show when={mobileNavOpen()}>
        <div class="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
      </Show>
      <aside class={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-card transition-all duration-200',
        collapsed() ? 'w-16' : 'w-60',
        mobileNavOpen() ? 'translate-x-0' : '-translate-x-full',
        'md:translate-x-0',
      )}>
        <div class="flex flex-col border-b border-border px-3 py-3 gap-2">
          <div class={cn('flex items-center gap-2 min-w-0', collapsed() && 'justify-center')}>
            <a href="https://crowdrelay.music" target="_blank" rel="noreferrer noopener" aria-label="CrowdRelay landing page" class="flex-shrink-0">
              <img src="/crowdrelay-logo.svg" alt="" width="32" height="32" />
            </a>
            {/* Three stacked lines did not fit the 56px header that aligns with
                the topbar, so the third was clipped and the first two read as one
                run-on word. Two lines fit; the tenant's public site already has a
                link in the tenant switcher directly below. */}
            <Show when={!collapsed()}>
              <div class="flex flex-col min-w-0 leading-tight">
                <strong class="truncate text-sm font-bold text-foreground">CrowdRelay</strong>
                <small class="truncate text-xs text-muted-foreground">Control Plane</small>
              </div>
            </Show>
            <Show when={!collapsed()}>
              <Button type="button" variant="ghost" class="hidden md:flex h-auto p-1.5 rounded-md border border-border bg-surface-2 text-muted-foreground hover:bg-surface-1 hover:text-foreground ml-auto" onClick={toggleCollapsed} title="Collapse sidebar" aria-label="Collapse sidebar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
              </Button>
            </Show>
          </div>
          <Show when={collapsed()}>
            <Button type="button" variant="ghost" class="hidden md:flex h-auto p-1.5 rounded-md border border-border bg-surface-2 text-muted-foreground hover:bg-surface-1 hover:text-foreground mx-auto" onClick={toggleCollapsed} title="Expand sidebar" aria-label="Expand sidebar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="rotate-180" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
            </Button>
          </Show>
        </div>

        {/* Global nav */}
        <nav class="flex flex-col gap-0.5 p-2">
          <Show when={isPlatformLevel()}>
            <Link to="/" activeProps={{ class: 'bg-surface-1 text-foreground' }} activeOptions={{ exact: true }} title="Overview" class={cn('flex items-center gap-2.5 rounded-md py-2 text-sm text-muted-foreground hover:bg-surface-1 hover:text-foreground transition-colors', collapsed() ? 'justify-center' : 'px-2.5')}>
              <NavIcon name="overview" />
              <Show when={!collapsed()}><span>Overview</span></Show>
            </Link>
          </Show>
          <Show when={isPlatformLevel()}>
            <Link to="/tenants" activeProps={{ class: 'bg-surface-1 text-foreground' }} activeOptions={{ exact: true }} title="Tenants" class={cn('flex items-center gap-2.5 rounded-md py-2 text-sm text-muted-foreground hover:bg-surface-1 hover:text-foreground transition-colors', collapsed() ? 'justify-center' : 'px-2.5')}>
              <NavIcon name="portfolio" />
              <Show when={!collapsed()}><span>Tenants</span></Show>
            </Link>
          </Show>
          <Show when={isPlatformLevel()}>
            <Link to="/flow" activeProps={{ class: 'bg-surface-1 text-foreground' }} title="Process map" class={cn('flex items-center gap-2.5 rounded-md py-2 text-sm text-muted-foreground hover:bg-surface-1 hover:text-foreground transition-colors', collapsed() ? 'justify-center' : 'px-2.5')}>
              <NavIcon name="flow" />
              <Show when={!collapsed()}><span>Process map</span></Show>
            </Link>
          </Show>
        </nav>

        {/* Tenant switcher + grouped tenant nav */}
        <Show when={navSlug()}>
          <div class="flex-1 overflow-y-auto px-2 pb-2">
            <Show when={isPlatformLevel() && tenants.data}>
              {(data) => <TenantSwitcher
                tenants={data().items}
                currentSlug={navSlug()}
                onSelect={selectTenant}
                open={switcherOpen()}
                onToggle={() => setSwitcherOpen(o => !o)}
                onClose={() => setSwitcherOpen(false)}
                collapsed={collapsed()}
              />}
            </Show>
            <Show when={!isPlatformLevel()}>
              <div class={cn('flex items-center gap-2 rounded-md py-2 text-sm text-muted-foreground', collapsed() ? 'justify-center' : 'px-2')} title={profile()?.tenantSlug ?? 'tenant'}>
                <span class="w-2 h-2 rounded-full bg-success flex-shrink-0" />
                <Show when={!collapsed()}><span class="truncate">{profile()?.tenantSlug ?? 'tenant'}</span></Show>
              </div>
            </Show>

            <For each={tenantNavGroups(isPlatformLevel())}>{group => (
              <div class="mt-2">
                {/* A collapsed sidebar has no room for a label, and hiding the
                    icons behind a disclosure the operator cannot read would
                    hide the nav itself. Groups only fold when there is a label
                    to fold them under. */}
                <Show when={!collapsed()}>
                  <Button
                    type="button"
                    variant="ghost"
                    class="h-auto w-full justify-start gap-1 rounded-md px-2.5 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-secondary-foreground"
                    aria-expanded={groupOpen(group)}
                    onClick={() => toggleGroup(group.label)}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class={cn('transition-transform', groupOpen(group) ? 'rotate-90' : '')}><path d="m9 18 6-6-6-6" /></svg>
                    <span>{group.label}</span>
                  </Button>
                </Show>
                <Show when={collapsed() || groupOpen(group)}>
                <nav class="flex flex-col gap-0.5 mt-0.5" aria-label={group.label}>
                  <For each={group.items}>{item => (
                    <Link
                      to={item.path as any}
                      params={{ slug: navSlug()! } as any}
                      search={item.search as any}
                      activeOptions={{ exact: item.exact, includeSearch: item.searchSensitive ?? false }}
                      activeProps={{ class: 'bg-surface-1 text-foreground' }}
                      title={item.label}
                      class={cn('relative flex items-center gap-2.5 rounded-md py-2 text-sm text-muted-foreground hover:bg-surface-1 hover:text-foreground transition-colors', collapsed() ? 'justify-center' : 'px-2.5')}
                    >
                      <NavIcon name={item.icon} />
                      <Show when={!collapsed()}><span>{item.label}</span></Show>
                      <Show when={!collapsed() && item.icon === 'attention' && attentionCount() > 0}>
                        <span class="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-warning/20 text-warning-light text-xs font-bold">{attentionCount()}</span>
                      </Show>
                      <Show when={collapsed() && item.icon === 'attention' && attentionCount() > 0}>
                        <span class="absolute top-1 right-1 w-2 h-2 rounded-full bg-warning" />
                      </Show>
                    </Link>
                  )}</For>
                </nav>
                </Show>
              </div>
            )}</For>
          </div>
        </Show>

        <div class={cn('border-t border-border px-3 py-2.5 flex items-center gap-2', collapsed() && 'justify-center')}>
          <span class="w-2 h-2 rounded-full bg-success flex-shrink-0" />
          <Show when={!collapsed()}>
            <span class="text-sm text-foreground truncate">{profile()?.username ?? 'operator'}</span>
            <span class="text-xs text-muted-foreground ml-auto">{isAdmin() ? 'admin' : isPlatformLevel() ? 'viewer' : 'tenant'}</span>
          </Show>
        </div>
      </aside>

      <main class={cn('flex-1 flex flex-col h-viewport min-w-0 overflow-hidden md:ml-60', collapsed() && 'md:ml-16')} id="main-content">
        <header class="h-14 border-b border-border bg-card flex items-center gap-3 px-4 flex-shrink-0 z-30">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="md:hidden -ml-2 text-muted-foreground"
            onClick={() => mobileNavOpen() ? setMobileNavOpen(false) : openMobileNav()}
            aria-label={mobileNavOpen() ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileNavOpen()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <Show when={mobileNavOpen()} fallback={<path d="M4 7h16M4 12h16M4 17h16" />}>
                <path d="M6 6l12 12M18 6L6 18" />
              </Show>
            </svg>
          </Button>
          {/* Breadcrumb, not a second copy of the page heading: it says where
              you are, while the page below says what it is. */}
          <div class="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
            <Show when={slug()} fallback={<><Eyebrow>PLATFORM</Eyebrow><strong class="text-sm font-semibold text-foreground truncate">{currentPageLabel(pathname(), undefined)}</strong></>}>
              {s => <>
                <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">{(tenants.data?.items.find(t => t.slug === s())?.displayName ?? s()).toUpperCase()}</span>
                <strong class="text-sm font-semibold text-foreground truncate">{currentPageLabel(pathname(), s(), isPlatformLevel(), { tab: searchTab() })}</strong>
              </>}
            </Show>
          </div>
          <div class="flex items-center gap-2">
            <RefreshControl />
            <Button variant="outline" class="hidden sm:flex h-auto items-center gap-1.5 px-2.5 py-1.5 text-xs font-normal text-muted-foreground hover:text-foreground" type="button" onClick={() => toggleCommandPalette()} title="Command palette (Ctrl+K / ⌘K)" aria-label="Command palette" aria-haspopup="dialog">
              <kbd class="font-mono text-xs">⌘K</kbd><span>Commands</span>
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => { void authState.logout() }}>Log out</Button>
          </div>
        </header>
        {/* A viewer meets a console where most controls are greyed out. Say why
            once, at the top, rather than leaving them to infer it from a
            tooltip on the first button they try. */}
        <Show when={authState.readOnly()}>
          <div class="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning-light" role="status">
            <strong class="font-semibold">Read-only session.</strong>
            <span>This account can look at everything and change nothing. Controls that would write are disabled.</span>
          </div>
        </Show>
        {/* Keyed on the route so a thrown page recovers by navigating away
            instead of leaving the console permanently blank. The key forces
            a remount which resets Suspense + ErrorBoundary state per page. */}
        <div class="flex-1 overflow-auto" data-key={pathname()}>
          <ErrorBoundaryPanel resetKey={pathname()} title="This page failed to render">
            <Suspense fallback={
              <section class="px-4 md:px-6 py-6 pb-20 space-y-5">
                <div class="flex justify-between items-start gap-6">
                  <div>
                    <div class="h-[12px] w-[120px] rounded-lg bg-surface-3 border border-border mb-2.5" />
                    <div class="h-7 w-[280px] rounded-lg bg-surface-3 border border-border mb-2" />
                    <div class="h-[14px] w-[420px] rounded-lg bg-surface-3 border border-border" />
                  </div>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Array.from({ length: 4 }, () => (
                    <div class="border border-border rounded-lg bg-card p-4">
                      <div class="h-[11px] w-[70px] rounded-lg bg-surface-3 border border-border mb-2" />
                      <div class="h-[22px] w-[50px] rounded-lg bg-surface-3 border border-border mb-1.5" />
                      <div class="h-[11px] w-[90px] rounded-lg bg-surface-3 border border-border" />
                    </div>
                  ))}
                </div>
                <div class="border border-border rounded-lg bg-card p-4 h-[180px]" />
              </section>
            }>
              <Outlet />
            </Suspense>
          </ErrorBoundaryPanel>
        </div>
        <Show when={commandPaletteOpen()}><CommandPalette /></Show>
        <ToastContainer />
        <ConfirmHost />
      </main>
      <ReauthModal />
      <Show when={slug()}>{(s) => <ChatWidget slug={s()} />}</Show>
    </div>
  </>
}
