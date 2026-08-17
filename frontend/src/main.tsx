import { render } from 'solid-js/web'
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import { RouterProvider, createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/solid-router'
import { AuthGate } from './pages/AuthGate'
import { Shell } from './components/Shell'
import './styles.css'

const OverviewPage = lazyRouteComponent(() => import('./pages/OverviewPage'), 'OverviewPage')
const TenantsPage = lazyRouteComponent(() => import('./pages/TenantsPage'), 'TenantsPage')
const TenantPage = lazyRouteComponent(() => import('./pages/TenantPage'), 'TenantPage')

const rootRoute = createRootRoute({ component: () => <AuthGate><Shell /></AuthGate> })
const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: OverviewPage })
const tenantsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants', component: TenantsPage })
const tenantRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug', component: TenantPage })
const routeTree = rootRoute.addChildren([overviewRoute, tenantsRoute, tenantRoute])
const router = createRouter({ routeTree, defaultPreload: 'intent', defaultPreloadStaleTime: 10_000, scrollRestoration: true })

declare module '@tanstack/solid-router' { interface Register { router: typeof router } }

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, gcTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: true } } })

render(() => <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>, document.getElementById('app')!)
