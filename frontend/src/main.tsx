import { render } from 'solid-js/web'
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import { RouterProvider, createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/solid-router'
import { Shell } from './components/Shell'
import './styles.css'

const OverviewPage = lazyRouteComponent(() => import('./pages/OverviewPage'), 'OverviewPage')
const TenantsPage = lazyRouteComponent(() => import('./pages/TenantsPage'), 'TenantsPage')
const TenantPage = lazyRouteComponent(() => import('./pages/TenantPage'), 'TenantPage')
const AreaPage = lazyRouteComponent(() => import('./pages/AreaPage'), 'AreaPage')
const TenantAttentionPage = lazyRouteComponent(() => import('./pages/TenantAttentionPage'), 'TenantAttentionPage')
const TenantOperationsPage = lazyRouteComponent(() => import('./pages/TenantOperationsPage'), 'TenantOperationsPage')
const OperatorAttentionPage = lazyRouteComponent(() => import('./pages/OperatorAttentionPage'), 'OperatorAttentionPage')

const rootRoute = createRootRoute({ component: Shell })
const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: OverviewPage })
const tenantsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants', component: TenantsPage })
const tenantRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug', component: TenantPage })
const areaRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/area', component: AreaPage })
const tenantAttentionRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/attention', component: TenantAttentionPage })
const tenantOperationsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/operations', component: TenantOperationsPage })
const operatorAttentionRoute = createRoute({ getParentRoute: () => rootRoute, path: '/attention', component: OperatorAttentionPage })
const routeTree = rootRoute.addChildren([overviewRoute, tenantsRoute, operatorAttentionRoute, tenantRoute, tenantAttentionRoute, tenantOperationsRoute, areaRoute])
const router = createRouter({ routeTree, defaultPreload: 'intent', defaultPreloadStaleTime: 10_000, scrollRestoration: true })

declare module '@tanstack/solid-router' { interface Register { router: typeof router } }

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, gcTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: true, refetchIntervalInBackground: true } } })

render(() => <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>, document.getElementById('app')!)
