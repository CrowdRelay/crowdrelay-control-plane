import { Link, useNavigate, useParams, useRouter } from '@tanstack/solid-router'
import { Show, type Component } from 'solid-js'

// Bottom tab bar for mobile — the four critical operator actions that are
// genuinely useful on a phone. Everything else stays in the sidebar drawer.
//
// The bar is fixed at the bottom and only visible at ≤560px (CSS controls
// this). Each tab uses the same SVG icon vocabulary as the sidebar nav so
// the visual language is consistent across surfaces.

function TabIcon(props: { name: string }) {
  const icons: Record<string, any> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    attention: <><path d="M12 2L1 21h22L12 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17" r="1"/></>,
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
  const operationsPath = () => slug() ? `/tenants/${slug()}/operations` : '/tenants'
  const cyclePath = () => slug() ? `/tenants/${slug()}/operations` : '/tenants'

  const goCycle = (event: Event) => {
    event.preventDefault()
    navigate({ to: cyclePath() as any })
    // Scroll to the Run Brain Cycle panel after navigation settles. The
    // route is lazy-loaded, so a fixed setTimeout(300) races against chunk
    // loading on slow networks. Poll for the panel up to 2s instead.
    const selector = '.run-brain-cycle-panel, [class*="run-cycle"], [class*="brain-cycle"]'
    const deadline = Date.now() + 2000
    const tryScroll = () => {
      const panel = document.querySelector(selector)
      if (panel) { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); return }
      if (Date.now() < deadline) requestAnimationFrame(tryScroll)
    }
    requestAnimationFrame(tryScroll)
  }

  return (
    <nav class="mobile-tab-bar" aria-label="Quick actions">
      <div class="mobile-tab-bar-inner">
        <Link
          to="/"
          class="mobile-tab"
          classList={{ active: isActive('/', true) }}
          activeOptions={{ exact: true }}
        >
          <TabIcon name="overview" />
          <span>Overview</span>
        </Link>
        <Link
          to="/attention"
          class="mobile-tab"
          classList={{ active: isActive('/attention', false) }}
          activeOptions={{ exact: false }}
        >
          <TabIcon name="attention" />
          <span>Attention</span>
        </Link>
        <Link
          to={operationsPath() as any}
          class="mobile-tab"
          classList={{ active: pathname().includes('/operations') }}
        >
          <TabIcon name="operations" />
          <span>Operations</span>
        </Link>
        <a
          href={cyclePath()}
          class="mobile-tab"
          classList={{ active: false }}
          onClick={goCycle}
        >
          <TabIcon name="cycle" />
          <span>Run Cycle</span>
        </a>
      </div>
    </nav>
  )
}
