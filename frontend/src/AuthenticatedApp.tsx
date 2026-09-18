import { QueryClientProvider } from '@tanstack/solid-query'
import { RouterProvider, createRootRoute, createRoute, createRouter, lazyRouteComponent, redirect } from '@tanstack/solid-router'
import { Shell } from './components/Shell'
import { queryClient } from './lib/queryClient'
import { api } from './lib/api'
import { authState } from './lib/auth'
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
// PortfolioPage merged into AudiencePage (UX-3.1) — the /portfolio route is
// a redirect kept for old links; the page file is deleted.
const AudiencePage = lazyRouteComponent(() => import('./pages/AudiencePage'), 'AudiencePage')
const BeaconsPage = lazyRouteComponent(() => import('./pages/BeaconsPage'), 'BeaconsPage')
const TenantNotifiersPage = lazyRouteComponent(() => import('./pages/TenantNotifiersPage'), 'TenantNotifiersPage')
const AutomationPage = lazyRouteComponent(() => import('./pages/AutomationPage'), 'AutomationPage')
const TenantCityPage = lazyRouteComponent(() => import('./pages/TenantCityPage'), 'TenantCityPage')
const TenantShowsPage = lazyRouteComponent(() => import('./pages/TenantShowsPage'), 'TenantShowsPage')
const TenantShowPage = lazyRouteComponent(() => import('./pages/TenantShowPage'), 'TenantShowPage')
const TenantShowScanPage = lazyRouteComponent(() => import('./pages/TenantShowScanPage'), 'TenantShowScanPage')
const TenantShowReportPage = lazyRouteComponent(() => import('./pages/TenantShowReportPage'), 'TenantShowReportPage')
const TenantContentPage = lazyRouteComponent(() => import('./pages/TenantContentPage'), 'TenantContentPage')
const TenantContentMaterialPage = lazyRouteComponent(() => import('./pages/TenantContentMaterialPage'), 'TenantContentMaterialPage')

const rootRoute = createRootRoute({ component: Shell })
// The overview is a platform command centre — a tenant operator's console
// is their own tenant, so `/` sends them straight to its Today view before
// the command-centre loader can fire a guaranteed 403.
const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: OverviewPage, beforeLoad: () => {
  const slug = authState.isPlatformLevel() ? undefined : authState.profile()?.tenantSlug
  if (slug) throw redirect({ href: `/tenants/${slug}` })
}, loader: warm(['command-center'], api.commandCenter) })
const flowRoute = createRoute({ getParentRoute: () => rootRoute, path: '/flow', component: FlowPage })
const tenantsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants', component: TenantsPage, loader: warm(['tenants'], api.tenants, 15_000) })
const tenantWizardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/new', component: TenantWizardPage })
const tenantRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug', component: TenantPage, loader: ({ params }) => warm(['tenant-overview', params.slug], () => api.tenantOverview(params.slug))() })
const portfolioRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/portfolio', beforeLoad: ({ params }) => { throw redirect({ href: `/tenants/${params.slug}/audience` }) } })
const audienceRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/audience', component: AudiencePage, loader: ({ params }) => warm(['tenant-audience', params.slug], () => api.audienceModel(params.slug))() })
const beaconsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/beacons', component: BeaconsPage })
const areaRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/area', component: AreaPage, loader: ({ params }) => warm(['area-overview', params.slug], () => api.areaOverview(params.slug), 15_000)() })
const tenantAttentionRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/attention', component: TenantAttentionPage, loader: ({ params }) => { warm(['tenant-operator-attention-snapshot', params.slug], () => fetchOperationsAttention(params.slug))(); warm(['tenant-operations', params.slug], () => api.tenantOperations(params.slug))() } })
const tenantOperationsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/operations', component: TenantOperationsPage, loader: ({ params }) => warm(['tenant-operations', params.slug], () => api.tenantOperations(params.slug))() })
const tenantHealthRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/health', component: TenantHealthPage, loader: ({ params }) => warm(['tenant-operations', params.slug], () => api.tenantOperations(params.slug))() })
const tenantIntelligenceRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/intelligence', component: TenantIntelligencePage, loader: ({ params }) => warm(['tenant-operations', params.slug], () => api.tenantOperations(params.slug))() })
const tenantContentRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/content', component: TenantContentPage, loader: ({ params }) => warm(['content-pipeline', params.slug], () => api.contentPipeline(params.slug))() })
const tenantContentMaterialRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/content/material', component: TenantContentMaterialPage, loader: ({ params }) => warm(['content-sources', params.slug], () => api.contentSources(params.slug))() })
const tenantIntegrationsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/integrations', component: TenantIntegrationsPage })
const tenantNotifiersRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/notifiers', component: TenantNotifiersPage, loader: ({ params }) => warm(['notifiers-overview', params.slug], () => api.notifiersOverview(params.slug), 20_000)() })
const tenantAutomationRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/automation', component: AutomationPage })
// N.12 — a city opens as its own read. Not a nav destination: the funnel
// table, the venue registry and the gig plan link here. The loader warms the
// two datasets that carry the city's identity — the same keys the Places
// tab's panels already hold, so a click through lands on warm data.
const tenantCityRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/cities/$cityId', component: TenantCityPage, loader: ({ params }) => { warm(['city-funnel', params.slug, 'organise'], () => api.cityFunnel(params.slug, 'organise'))(); warm(['city-venues', params.slug], () => api.cityVenues(params.slug))() } })
const tenantShowsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/shows', component: TenantShowsPage, loader: ({ params }) => warm(['tenant-shows', params.slug], () => api.shows(params.slug))() })
const tenantShowRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/shows/$eventSlug', component: TenantShowPage, loader: ({ params }) => warm(['tenant-show-timeline', params.slug, params.eventSlug], () => api.showTimeline(params.slug, params.eventSlug))() })
const tenantShowScanRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/shows/$eventSlug/scan', component: TenantShowScanPage, loader: ({ params }) => warm(['tenant-show-scan', params.slug, params.eventSlug], () => api.showScan(params.slug, params.eventSlug))() })
const tenantShowReportRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/shows/$eventSlug/report', component: TenantShowReportPage, loader: ({ params }) => warm(['tenant-show-report', params.slug, params.eventSlug], () => api.showReport(params.slug, params.eventSlug))() })
const operatorAttentionRedirect = createRoute({ getParentRoute: () => rootRoute, path: '/attention', beforeLoad: () => { throw redirect({ href: '/' }) } })
const automationRedirect = createRoute({ getParentRoute: () => rootRoute, path: '/automation', beforeLoad: () => { throw redirect({ href: '/tenants' }) } })

// Legacy redirects — old routes that were consolidated into other pages
const tenantActionsRedirect = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/actions', beforeLoad: ({ params }) => { throw redirect({ href: `/tenants/${params.slug}/attention` }) } })
const funnelRedirect = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/funnel', beforeLoad: ({ params }) => { throw redirect({ href: `/tenants/${params.slug}/intelligence` }) } })
const communityRedirect = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/communities', beforeLoad: ({ params }) => { throw redirect({ href: `/tenants/${params.slug}/audience` }) } })

const routeTree = rootRoute.addChildren([overviewRoute, flowRoute, tenantsRoute, tenantWizardRoute, operatorAttentionRedirect, automationRedirect, tenantRoute, tenantActionsRedirect, tenantAttentionRoute, tenantOperationsRoute, tenantHealthRoute, tenantIntelligenceRoute, tenantContentRoute, tenantContentMaterialRoute, tenantIntegrationsRoute, tenantNotifiersRoute, tenantAutomationRoute, communityRedirect, portfolioRoute, audienceRoute, funnelRedirect, beaconsRoute, areaRoute, tenantCityRoute, tenantShowsRoute, tenantShowRoute, tenantShowScanRoute, tenantShowReportRoute])
// `defaultPendingMs: 0` used to show the skeleton on the first frame: a page
// whose chunk is still loading flashed a full-page skeleton for the ~100–250ms
// the import took, which on fast navigation read as the screen blinking on
// every view switch. 200ms keeps the previous view up for quick loads and only
// shows the skeleton when a navigation is genuinely slow; the library default
// (500ms) was the opposite failure — a frozen page that read as a hang.
// `defaultPendingMinMs` holds a shown skeleton long enough to read as a
// loading state instead of a one-frame strobe.
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 10_000,
  scrollRestoration: true,
  defaultPendingComponent: () => <SkeletonPage />,
  defaultPendingMs: 200,
  defaultPendingMinMs: 200,
})

declare module '@tanstack/solid-router' { interface Register { router: typeof router } }

export default function AuthenticatedApp() {
  return <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>
}
