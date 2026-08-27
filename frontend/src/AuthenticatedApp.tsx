import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import { RouterProvider, createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/solid-router'
import { Shell } from './components/Shell'

const FlowPage = lazyRouteComponent(() => import('./pages/FlowPage'), 'FlowPage')
const OverviewPage = lazyRouteComponent(() => import('./pages/OverviewPage'), 'OverviewPage')
const TenantsPage = lazyRouteComponent(() => import('./pages/TenantsPage'), 'TenantsPage')
const TenantPage = lazyRouteComponent(() => import('./pages/TenantPage'), 'TenantPage')
const AreaPage = lazyRouteComponent(() => import('./pages/AreaPage'), 'AreaPage')
const TenantAttentionPage = lazyRouteComponent(() => import('./pages/TenantAttentionPage'), 'TenantAttentionPage')
const TenantOperationsPage = lazyRouteComponent(() => import('./pages/TenantOperationsPage'), 'TenantOperationsPage')
const PortfolioPage = lazyRouteComponent(() => import('./pages/PortfolioPage'), 'PortfolioPage')
const TenantNotifiersPage = lazyRouteComponent(() => import('./pages/TenantNotifiersPage'), 'TenantNotifiersPage')
const OperatorAttentionPage = lazyRouteComponent(() => import('./pages/OperatorAttentionPage'), 'OperatorAttentionPage')
const AutomationPage = lazyRouteComponent(() => import('./pages/AutomationPage'), 'AutomationPage')

const rootRoute = createRootRoute({ component: Shell })
const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: OverviewPage })
const flowRoute = createRoute({ getParentRoute: () => rootRoute, path: '/flow', component: FlowPage })
const tenantsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants', component: TenantsPage })
const tenantRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug', component: TenantPage })
const portfolioRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/portfolio', component: PortfolioPage })
const areaRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/area', component: AreaPage })
const tenantAttentionRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/attention', component: TenantAttentionPage })
const tenantOperationsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/operations', component: TenantOperationsPage })
const tenantNotifiersRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/notifiers', component: TenantNotifiersPage })
const operatorAttentionRoute = createRoute({ getParentRoute: () => rootRoute, path: '/attention', component: OperatorAttentionPage })
const automationRoute = createRoute({ getParentRoute: () => rootRoute, path: '/automation', component: AutomationPage })
const routeTree = rootRoute.addChildren([overviewRoute, flowRoute, tenantsRoute, operatorAttentionRoute, automationRoute, tenantRoute, tenantAttentionRoute, tenantOperationsRoute, tenantNotifiersRoute, portfolioRoute, areaRoute])
const router = createRouter({ routeTree, defaultPreload: 'intent', defaultPreloadStaleTime: 10_000, scrollRestoration: true })

declare module '@tanstack/solid-router' { interface Register { router: typeof router } }

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, gcTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false, refetchIntervalInBackground: false, placeholderData: (prev: unknown) => prev } } })

export default function AuthenticatedApp() {
  return <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>
}
