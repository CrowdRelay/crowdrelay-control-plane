import { QueryClientProvider } from '@tanstack/solid-query'
import { RouterProvider, createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/solid-router'
import { Shell } from './components/Shell'
import { queryClient } from './lib/queryClient'
import './styles.css'

const FlowPage = lazyRouteComponent(() => import('./pages/FlowPage'), 'FlowPage')
const OverviewPage = lazyRouteComponent(() => import('./pages/OverviewPage'), 'OverviewPage')
const TenantsPage = lazyRouteComponent(() => import('./pages/TenantsPage'), 'TenantsPage')
const TenantWizardPage = lazyRouteComponent(() => import('./pages/TenantWizardPage'), 'TenantWizardPage')
const TenantPage = lazyRouteComponent(() => import('./pages/TenantPage'), 'TenantPage')
const AreaPage = lazyRouteComponent(() => import('./pages/AreaPage'), 'AreaPage')
const TenantAttentionPage = lazyRouteComponent(() => import('./pages/TenantAttentionPage'), 'TenantAttentionPage')
const TenantOperationsPage = lazyRouteComponent(() => import('./pages/TenantOperationsPage'), 'TenantOperationsPage')
const TenantHealthPage = lazyRouteComponent(() => import('./pages/TenantHealthPage'), 'TenantHealthPage')
const TenantIntelligencePage = lazyRouteComponent(() => import('./pages/TenantIntelligencePage'), 'TenantIntelligencePage')
const TenantIntegrationsPage = lazyRouteComponent(() => import('./pages/TenantIntegrationsPage'), 'TenantIntegrationsPage')
const PortfolioPage = lazyRouteComponent(() => import('./pages/PortfolioPage'), 'PortfolioPage')
const AudiencePage = lazyRouteComponent(() => import('./pages/AudiencePage'), 'AudiencePage')
const GrowthFunnelPage = lazyRouteComponent(() => import('./pages/GrowthFunnelPage'), 'GrowthFunnelPage')
const BeaconsPage = lazyRouteComponent(() => import('./pages/BeaconsPage'), 'BeaconsPage')
const TenantNotifiersPage = lazyRouteComponent(() => import('./pages/TenantNotifiersPage'), 'TenantNotifiersPage')
const CommunityIntelligencePage = lazyRouteComponent(() => import('./pages/CommunityIntelligencePage'), 'CommunityIntelligencePage')
const OperatorAttentionPage = lazyRouteComponent(() => import('./pages/OperatorAttentionPage'), 'OperatorAttentionPage')
const AutomationPage = lazyRouteComponent(() => import('./pages/AutomationPage'), 'AutomationPage')

const rootRoute = createRootRoute({ component: Shell })
const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: OverviewPage })
const flowRoute = createRoute({ getParentRoute: () => rootRoute, path: '/flow', component: FlowPage })
const tenantsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants', component: TenantsPage })
const tenantWizardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/new', component: TenantWizardPage })
const tenantRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug', component: TenantPage })
const portfolioRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/portfolio', component: PortfolioPage })
const audienceRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/audience', component: AudiencePage })
const funnelRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/funnel', component: GrowthFunnelPage })
const beaconsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/beacons', component: BeaconsPage })
const areaRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/area', component: AreaPage })
const tenantAttentionRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/attention', component: TenantAttentionPage })
const tenantOperationsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/operations', component: TenantOperationsPage })
const tenantHealthRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/health', component: TenantHealthPage })
const tenantIntelligenceRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/intelligence', component: TenantIntelligencePage })
const tenantIntegrationsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/integrations', component: TenantIntegrationsPage })
const tenantNotifiersRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/notifiers', component: TenantNotifiersPage })
const communityIntelligenceRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/communities', component: CommunityIntelligencePage })
const operatorAttentionRoute = createRoute({ getParentRoute: () => rootRoute, path: '/attention', component: OperatorAttentionPage })
const automationRoute = createRoute({ getParentRoute: () => rootRoute, path: '/automation', component: AutomationPage })
const routeTree = rootRoute.addChildren([overviewRoute, flowRoute, tenantsRoute, tenantWizardRoute, operatorAttentionRoute, automationRoute, tenantRoute, tenantAttentionRoute, tenantOperationsRoute, tenantHealthRoute, tenantIntelligenceRoute, tenantIntegrationsRoute, tenantNotifiersRoute, communityIntelligenceRoute, portfolioRoute, audienceRoute, funnelRoute, beaconsRoute, areaRoute])
const router = createRouter({ routeTree, defaultPreload: 'intent', defaultPreloadStaleTime: 10_000, scrollRestoration: true })

declare module '@tanstack/solid-router' { interface Register { router: typeof router } }

export default function AuthenticatedApp() {
  return <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>
}
