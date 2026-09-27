import { Outlet, useParams, useNavigate, useRouter } from '@tanstack/solid-router'
import { Show, createSignal, createEffect, lazy, onMount, onCleanup, Suspense, type Component } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { authState } from '../lib/auth'
import { commandPaletteOpen, toggleCommandPalette } from './command-palette-state'
import { api } from '../lib/api'
import { ToastContainer } from './app/toast'
import { RefreshControl } from './RefreshControl'

import { ErrorBoundaryPanel } from './ErrorBoundaryPanel'
import { ConfirmHost } from './Dialog'
import { ReauthModal } from './ReauthModal'
import { whileIncomplete, hasUnavailableTenant, hasDegradedSections } from '../lib/incomplete'
import { SidebarInset, SidebarProvider, useSidebar } from './ui/sidebar'
import { AppSidebar } from './shell/AppSidebar'
import { SiteHeader } from './shell/SiteHeader'
import { CommandTrigger } from './shell/CommandTrigger'
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
  const [paletteLoaded, setPaletteLoaded] = createSignal(false)
  createEffect(() => { if (commandPaletteOpen()) setPaletteLoaded(true) })
  const router = useRouter()
  const pathname = () => router.state.location.pathname
  const searchTab = () => (router.state.location.search as { tab?: string }).tab
  const isPlatformLevel = () => authState.isPlatformLevel()
  const isAdmin = () => authState.isAdmin()

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
  const toggleGroup = (group: NavGroup) => {
    setOpenGroups(prev => {
      const next = { ...prev, [group.label]: !(prev[group.label] ?? group.defaultOpen) }
      try { localStorage.setItem(NAV_GROUP_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }
  // Desktop expanded/collapsed (icon rail), remembered across reloads. The
  // stock provider stores a cookie; this console already kept the choice in
  // localStorage, so the provider is controlled from here instead.
  const [sidebarOpen, setSidebarOpen] = createSignal(
    typeof localStorage === 'undefined' || localStorage.getItem('sidebar-collapsed') !== '1'
  )
  const onSidebarOpenChange = (open: boolean) => {
    setSidebarOpen(open)
    try { localStorage.setItem('sidebar-collapsed', open ? '0' : '1') } catch {}
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
  // Tenant sessions get no command-center — the platform endpoint would
  // 403 on every nav render. Their badge reads the today model's attention
  // section when a page has already fetched it: `enabled: false` mounts a
  // cache subscriber only, so the badge fills after the first Today or
  // Needs-you visit and never fires a request of its own just to light a
  // number. No cached model means no badge — honest absence, not a zero.
  const tenantToday = useQuery(() => ({
    queryKey: ['tenant-today', navSlug()],
    queryFn: () => api.tenantToday(navSlug()!),
    enabled: false,
    // Option-identical to the enabled observers on this key — a disabled
    // observer never fetches, but the shared-key rule holds if that ever
    // changes.
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))
  const attentionCount = () => {
    if (isPlatformLevel()) {
      const cc = commandCenter.data
      if (!cc) return 0
      return cc.attention.needsYou + cc.attention.awaitingApproval + cc.attention.criticalAlerts
    }
    const a = tenantToday.data?.attention
    if (!a) return 0
    const notReported = (name: string) => (a.not_reported ?? []).includes(name)
    const approvals = notReported('awaiting_approval') ? 0 : (a.awaiting_approval ?? a.needs_you?.length ?? 0)
    const drafts = notReported('unpublished_drafts') ? 0 : (a.unpublished_drafts ?? []).reduce((n, c) => n + c.drafts, 0)
    return approvals + drafts
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

  onMount(() => {
    // ⌘B / Ctrl+B toggles the sidebar — the stock provider owns that shortcut.
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        toggleCommandPalette()
      }
    }
    document.addEventListener('keydown', onKey)
    onCleanup(() => document.removeEventListener('keydown', onKey))
  })

  const roleLabel = () => isAdmin() ? 'Platform admin' : isPlatformLevel() ? 'Platform viewer' : 'Tenant operator'
  const tenantName = (s: string) => tenants.data?.items.find(t => t.slug === s)?.displayName ?? s
  // The tenant crumb goes where the sidebar's first link goes.
  const tenantHome = () => tenantNavGroups(isPlatformLevel())[0]?.items[0]?.path

  return <>
    <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-foreground">Skip to content</a>
    {/* One scroller: the content pane inside the inset. The provider and the
        inset are pinned to the viewport so the document itself never scrolls. */}
    <SidebarProvider open={sidebarOpen()} onOpenChange={onSidebarOpenChange} class="h-viewport min-h-0 overflow-hidden">
      <CloseMobileOnNavigate pathname={pathname()} />
      <AppSidebar
        platformLevel={isPlatformLevel()}
        canCreateTenant={isAdmin()}
        tenants={tenants.data?.items}
        navSlug={navSlug()}
        ownTenantSlug={profile()?.tenantSlug ?? undefined}
        groups={tenantNavGroups(isPlatformLevel())}
        isOpen={groupOpen}
        onToggle={toggleGroup}
        onSelectTenant={selectTenant}
        badgeFor={item =>
          // Platform sessions carry the estate-wide count on Needs you.
          // Band nav merged that item into Today — their count lands on
          // the daily page's icon instead, same number, same source.
          item.icon === 'attention' || (!isPlatformLevel() && item.icon === 'operations')
            ? attentionCount()
            : 0
        }
        user={{ name: profile()?.username ?? 'operator', role: roleLabel() }}
        onLogout={() => { void authState.logout() }}
      />
      <SidebarInset class="h-viewport min-h-0 overflow-hidden" id="main-content">
        <SiteHeader
          section={slug()
            ? { label: tenantName(slug()!), to: tenantHome(), params: { slug: slug()! } }
            : { label: 'Platform' }}
          page={currentPageLabel(pathname(), slug(), isPlatformLevel(), { tab: searchTab() })}
          actions={<>
            {/* Hidden for now, not removed: the auto-refresh interval and the
                manual refresh button. The interval chosen earlier (stored in
                localStorage) still applies. Drop `hidden` to bring them back. */}
            <div class="hidden"><RefreshControl /></div>
            <CommandTrigger />
          </>}
        />
        {/* A viewer meets a console where most controls are greyed out. Say why
            once, at the top, rather than leaving them to infer it from a
            tooltip on the first button they try. */}
        <Show when={authState.readOnly()}>
          <div class="flex items-center gap-2 border-b border-warning-foreground/30 bg-warning px-4 py-2 text-xs text-warning-foreground" role="status">
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
                    <div class="h-3 w-30 rounded-lg bg-muted mb-2.5" />
                    <div class="h-7 w-70 rounded-lg bg-muted mb-2" />
                    <div class="h-3.5 w-105 max-w-full rounded-lg bg-muted" />
                  </div>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Array.from({ length: 4 }, () => (
                    <div class="rounded-lg border bg-card p-4">
                      <div class="h-3 w-18 rounded-lg bg-muted mb-2" />
                      <div class="h-5 w-12 rounded-lg bg-muted mb-1.5" />
                      <div class="h-3 w-22 rounded-lg bg-muted" />
                    </div>
                  ))}
                </div>
                <div class="rounded-lg border bg-card p-4 h-45" />
              </section>
            }>
              <Outlet />
            </Suspense>
          </ErrorBoundaryPanel>
        </div>
        {/* Loaded on first open, then kept mounted so the dialog can animate out. */}
        <Show when={paletteLoaded()}><CommandPalette /></Show>
        <ToastContainer />
        <ConfirmHost />
      </SidebarInset>
      <ReauthModal />
      <Show when={slug()}>{(s) => <ChatWidget slug={s()} />}</Show>
    </SidebarProvider>
  </>
}

/** On a phone the sidebar is a sheet; a tap on a link must not leave it open over the page it opened. */
function CloseMobileOnNavigate(props: { pathname: string }) {
  const { setOpenMobile } = useSidebar()
  createEffect(() => {
    props.pathname
    setOpenMobile(false)
  })
  return null
}
