import { Link, useNavigate, useParams, useRouter } from '@tanstack/solid-router'
import { Show, type Component, type JSX, onCleanup } from 'solid-js'
import { cn } from '../lib/cn'

// Bottom tab bar for mobile — the three critical operator actions that are
// genuinely useful on a phone. Everything else stays in the sidebar drawer.
//
// The bar is fixed at the bottom and only visible at ≤560px (CSS controls
// this). Each tab uses the same SVG icon vocabulary as the sidebar nav so
// the visual language is consistent across surfaces.

function TabIcon(props: { name: string }) {
  const icons: Record<string, JSX.Element> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    operations: <><path d="M3 12h4l2-7 4 14 2-7h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></>,
    cycle: <><path d="M21 12a9 9 0 1 1-2.64-6.36" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 3v6h-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></>,
  }
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{icons[props.name] ?? icons.overview}</svg>
}

export const MobileTabBar: Component = () => {
  const params = useParams({ strict: false })
  const slug = () => (params() as { slug?: string }).slug
  const router = useRouter()
  const pathname = () => router.state.location.pathname
  const navigate = useNavigate()

  const isActive = (path: string, exact: boolean) => {
    const current = pathname()
    if (exact) return current === path
    return current === path || current.startsWith(path + '/') || current.startsWith(path)
  }

  // The operations and cycle tabs are tenant-scoped. If no tenant is
  // selected, they navigate to the tenant list so the operator can pick one.
  const opsPath = () => slug() ? `/tenants/${slug()}/operations` : '/tenants'
  const cyclePath = () => slug() ? `/tenants/${slug()}/intelligence` : '/tenants'

  const goCycle = (event: Event) => {
    event.preventDefault()
    navigate({ to: cyclePath() as any })
    // Scroll to the Run Brain Cycle panel after navigation settles. The
    // route is lazy-loaded, so a fixed setTimeout(300) races against chunk
    // loading on slow networks. Poll for the panel up to 2s instead.
    const selector = '.run-brain-cycle-panel, [class*="run-cycle"], [class*="brain-cycle"]'
    const deadline = Date.now() + 2000
    let rafId = 0
    const tryScroll = () => {
      const panel = document.querySelector(selector)
      if (panel) { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); return }
      if (Date.now() < deadline) rafId = requestAnimationFrame(tryScroll)
    }
    rafId = requestAnimationFrame(tryScroll)
    onCleanup(() => cancelAnimationFrame(rafId))
  }

  return (
    <nav class="hidden max-[560px]:block fixed bottom-0 left-0 right-0 z-20 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]" aria-label="Quick actions">
      <div class="flex w-full max-w-[600px] mx-auto px-1">
        <Link
          to="/"
          class={cn(
            'flex-1 flex flex-col items-center gap-[3px] py-2.5 px-1 bg-transparent border-0 rounded-none cursor-pointer transition-colors min-h-[52px] text-xs font-semibold tracking-tight',
            isActive('/', true) ? 'text-primary' : 'text-muted-foreground hover:text-secondary-foreground',
          )}
          activeOptions={{ exact: true }}
          aria-current={isActive('/', true) ? 'page' : undefined}
        >
          <TabIcon name="overview" />
          <span>Overview</span>
        </Link>
        <Link
          to={opsPath() as any}
          class={cn(
            'flex-1 flex flex-col items-center gap-[3px] py-2.5 px-1 bg-transparent border-0 rounded-none cursor-pointer transition-colors min-h-[52px] text-xs font-semibold tracking-tight',
            pathname().includes('/operations') ? 'text-primary' : 'text-muted-foreground hover:text-secondary-foreground',
          )}
          aria-current={pathname().includes('/operations') ? 'page' : undefined}
        >
          <TabIcon name="operations" />
          <span>Operations</span>
        </Link>
        <a
          href={cyclePath()}
          class="flex-1 flex flex-col items-center gap-[3px] py-2.5 px-1 bg-transparent text-muted-foreground border-0 rounded-none cursor-pointer transition-colors min-h-[52px] text-xs font-semibold tracking-tight hover:text-secondary-foreground"
          onClick={goCycle}
        >
          <TabIcon name="cycle" />
          <span>Run Cycle</span>
        </a>
      </div>
    </nav>
  )
}
