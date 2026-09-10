import { QueryClientProvider } from '@tanstack/solid-query'
import { RouterProvider, createRootRoute, createRoute, createRouter, lazyRouteComponent, redirect } from '@tanstack/solid-router'
import { Shell } from './components/Shell'
import { queryClient } from './lib/queryClient'
import { api } from './lib/api'
import { fetchOperationsAttention } from './lib/attention'
import { SkeletonPage } from './components/Skeleton'

// Each route names the one read model its first screenful needs, and warms it
// through the shared QueryClient. `defaultPreload: 'intent'` runs the loader on
// hover, so by the time the operator's click lands the page usually has its
// data already — and when it does not, the loader has at least started the
// request a few hundred milliseconds earlier than the component could.
//
// `ensureQueryData` is deliberate: it resolves from cache when the entry is
// fresh and never blocks navigation on a refetch. The page still owns the
// query — this only decides when the request starts.
const warm = <T,>(queryKey: readonly unknown[], queryFn: () => Promise<T>, staleTime = 10_000) =>
  () => { void queryClient.ensureQueryData({ queryKey, queryFn, staleTime }); return undefined }

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
const BeaconsPage = lazyRouteComponent(() => import('./pages/BeaconsPage'), 'BeaconsPage')
const TenantNotifiersPage = lazyRouteComponent(() => import('./pages/TenantNotifiersPage'), 'TenantNotifiersPage')
const AutomationPage = lazyRouteComponent(() => import('./pages/AutomationPage'), 'AutomationPage')

const rootRoute = createRootRoute({ component: Shell })
const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: OverviewPage, loader: warm(['command-center'], api.commandCenter) })
const flowRoute = createRoute({ getParentRoute: () => rootRoute, path: '/flow', component: FlowPage })
const tenantsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants', component: TenantsPage, loader: warm(['tenants'], api.tenants, 15_000) })
const tenantWizardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/new', component: TenantWizardPage })
const tenantRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug', component: TenantPage, loader: ({ params }) => warm(['tenant-overview', params.slug], () => api.tenantOverview(params.slug))() })
const portfolioRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/portfolio', component: PortfolioPage, loader: ({ params }) => warm(['tenant-portfolio', params.slug], () => api.tenantPortfolio(params.slug))() })
const audienceRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/audience', component: AudiencePage, loader: ({ params }) => warm(['tenant-audience', params.slug], () => api.audienceModel(params.slug))() })
const beaconsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/beacons', component: BeaconsPage })
const areaRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/area', component: AreaPage, loader: ({ params }) => warm(['area-overview', params.slug], () => api.areaOverview(params.slug), 15_000)() })
const tenantAttentionRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/attention', component: TenantAttentionPage, loader: ({ params }) => warm(['tenant-operator-attention-snapshot', params.slug], () => fetchOperationsAttention(params.slug))() })
const tenantOperationsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/operations', component: TenantOperationsPage, loader: ({ params }) => warm(['tenant-operations', params.slug], () => api.tenantOperations(params.slug))() })
const tenantHealthRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/health', component: TenantHealthPage, loader: ({ params }) => warm(['tenant-operations', params.slug], () => api.tenantOperations(params.slug))() })
const tenantIntelligenceRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/intelligence', component: TenantIntelligencePage, loader: ({ params }) => warm(['tenant-operations', params.slug], () => api.tenantOperations(params.slug))() })
const tenantIntegrationsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/integrations', component: TenantIntegrationsPage })
const tenantNotifiersRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/notifiers', component: TenantNotifiersPage, loader: ({ params }) => warm(['notifiers-overview', params.slug], () => api.notifiersOverview(params.slug), 20_000)() })
const tenantAutomationRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/automation', component: AutomationPage })
const operatorAttentionRedirect = createRoute({ getParentRoute: () => rootRoute, path: '/attention', beforeLoad: () => { throw redirect({ href: '/' }) } })
const automationRedirect = createRoute({ getParentRoute: () => rootRoute, path: '/automation', beforeLoad: () => { throw redirect({ href: '/tenants' }) } })

// Legacy redirects — old routes that were consolidated into other pages
const tenantActionsRedirect = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/actions', beforeLoad: ({ params }) => { throw redirect({ href: `/tenants/${params.slug}/operations` }) } })
const funnelRedirect = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/funnel', beforeLoad: ({ params }) => { throw redirect({ href: `/tenants/${params.slug}/intelligence` }) } })
const communityRedirect = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/communities', beforeLoad: ({ params }) => { throw redirect({ href: `/tenants/${params.slug}/audience` }) } })

const routeTree = rootRoute.addChildren([overviewRoute, flowRoute, tenantsRoute, tenantWizardRoute, operatorAttentionRedirect, automationRedirect, tenantRoute, tenantActionsRedirect, tenantAttentionRoute, tenantOperationsRoute, tenantHealthRoute, tenantIntelligenceRoute, tenantIntegrationsRoute, tenantNotifiersRoute, tenantAutomationRoute, communityRedirect, portfolioRoute, audienceRoute, funnelRedirect, beaconsRoute, areaRoute])
// `defaultPendingMs: 0` shows the skeleton on the first frame. The default
// (500ms) leaves the previous page frozen on screen while a route chunk loads,
// which reads as a hang rather than as loading — the blank operator screen this
// replaces was exactly that gap.
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 10_000,
  scrollRestoration: true,
  defaultPendingComponent: () => <SkeletonPage />,
  defaultPendingMs: 0,
  defaultPendingMinMs: 0,
})

declare module '@tanstack/solid-router' { interface Register { router: typeof router } }

export default function AuthenticatedApp() {
  return <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>
}
