import { QueryClientProvider } from '@tanstack/solid-query'
import { fetchTenantOverview } from './lib/tenantOverview'
import { Link, RouterProvider, createRootRoute, createRoute, createRouter, lazyRouteComponent, redirect } from '@tanstack/solid-router'
import { Shell } from './components/Shell'
import { queryClient } from './lib/queryClient'
import { api } from './lib/api'
import { authState } from './lib/auth'
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

// A page split into sub-pages keeps its old `?tab=` links: each maps onto the
// sub-page that now holds it — '' is the overview, a leading '/' a page of
// its own the tab moved to. An unknown tab falls through to the overview.
// The rest of the query and the hash ride along, so `?tab=inbox#…&action=`
// reveal links and `?tab=contacts&kind=` filters still land.
const subPageTabs = (base: string, tabs: Record<string, string>) => ({ params, search, location }: { params: { slug: string }; search: unknown; location: { hash: string } }) => {
  const { tab, ...rest } = search as Record<string, unknown>
  if (typeof tab !== 'string' || tabs[tab] == null) return
  const to = tabs[tab]
  const path = to.startsWith('/') ? `/tenants/${params.slug}${to}` : `/tenants/${params.slug}/${base}${to ? `/${to}` : ''}`
  const query = new URLSearchParams(Object.entries(rest).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])).toString()
  throw redirect({ href: `${path}${query ? `?${query}` : ''}${location.hash ? `#${location.hash}` : ''}` })
}

const FlowPage = lazyRouteComponent(() => import('./pages/FlowPage'), 'FlowPage')
const OverviewPage = lazyRouteComponent(() => import('./pages/OverviewPage'), 'OverviewPage')
const TenantsPage = lazyRouteComponent(() => import('./pages/TenantsPage'), 'TenantsPage')
const TenantWizardPage = lazyRouteComponent(() => import('./pages/TenantWizardPage'), 'TenantWizardPage')
const SettingsOverviewPage = lazyRouteComponent(() => import('./pages/TenantPage'), 'SettingsOverviewPage')
const SettingsProfilePage = lazyRouteComponent(() => import('./pages/TenantPage'), 'SettingsProfilePage')
const SettingsWorkspacePage = lazyRouteComponent(() => import('./pages/TenantPage'), 'SettingsWorkspacePage')
const SettingsDeploymentPage = lazyRouteComponent(() => import('./pages/TenantPage'), 'SettingsDeploymentPage')
const SettingsBrandPage = lazyRouteComponent(() => import('./pages/TenantPage'), 'SettingsBrandPage')
const SettingsTeamPage = lazyRouteComponent(() => import('./pages/TenantPage'), 'SettingsTeamPage')
const SettingsKeysPage = lazyRouteComponent(() => import('./pages/TenantPage'), 'SettingsKeysPage')
const SettingsNotificationsPage = lazyRouteComponent(() => import('./pages/TenantPage'), 'SettingsNotificationsPage')
const AttentionOverviewPage = lazyRouteComponent(() => import('./pages/TenantAttentionPage'), 'AttentionOverviewPage')
const AttentionDecisionsPage = lazyRouteComponent(() => import('./pages/TenantAttentionPage'), 'AttentionDecisionsPage')
const AttentionInboxPage = lazyRouteComponent(() => import('./pages/TenantAttentionPage'), 'AttentionInboxPage')
const AttentionQueuesPage = lazyRouteComponent(() => import('./pages/TenantAttentionPage'), 'AttentionQueuesPage')
const AttentionRuntimePage = lazyRouteComponent(() => import('./pages/TenantAttentionPage'), 'AttentionRuntimePage')
const AttentionTracePage = lazyRouteComponent(() => import('./pages/TenantAttentionPage'), 'AttentionTracePage')
const TodayOverviewPage = lazyRouteComponent(() => import('./pages/TenantOperationsPage'), 'TodayOverviewPage')
const TodayRepliesPage = lazyRouteComponent(() => import('./pages/TenantOperationsPage'), 'TodayRepliesPage')
const TodayOutreachPage = lazyRouteComponent(() => import('./pages/TenantOperationsPage'), 'TodayOutreachPage')
const TodayNegotiationsPage = lazyRouteComponent(() => import('./pages/TenantOperationsPage'), 'TodayNegotiationsPage')
const TodayPressPage = lazyRouteComponent(() => import('./pages/TenantOperationsPage'), 'TodayPressPage')
const TodayReleasesPage = lazyRouteComponent(() => import('./pages/TenantOperationsPage'), 'TodayReleasesPage')
const TodayPlaysPage = lazyRouteComponent(() => import('./pages/TenantOperationsPage'), 'TodayPlaysPage')
const TodayGrowthPage = lazyRouteComponent(() => import('./pages/TenantOperationsPage'), 'TodayGrowthPage')
const HealthOverviewPage = lazyRouteComponent(() => import('./pages/TenantHealthPage'), 'HealthOverviewPage')
const HealthDeliveryPage = lazyRouteComponent(() => import('./pages/TenantHealthPage'), 'HealthDeliveryPage')
const HealthPoliciesPage = lazyRouteComponent(() => import('./pages/TenantHealthPage'), 'HealthPoliciesPage')
const HealthSwitchesPage = lazyRouteComponent(() => import('./pages/TenantHealthPage'), 'HealthSwitchesPage')
const IntelligenceOverviewPage = lazyRouteComponent(() => import('./pages/TenantIntelligencePage'), 'IntelligenceOverviewPage')
const IntelligenceBriefPage = lazyRouteComponent(() => import('./pages/TenantIntelligencePage'), 'IntelligenceBriefPage')
const IntelligenceStandingPage = lazyRouteComponent(() => import('./pages/TenantIntelligencePage'), 'IntelligenceStandingPage')
const IntelligenceDecisionsPage = lazyRouteComponent(() => import('./pages/TenantIntelligencePage'), 'IntelligenceDecisionsPage')
const IntelligenceLearningPage = lazyRouteComponent(() => import('./pages/TenantIntelligencePage'), 'IntelligenceLearningPage')
const IntegrationsOverviewPage = lazyRouteComponent(() => import('./pages/TenantIntegrationsPage'), 'IntegrationsOverviewPage')
const IntegrationsProvidersPage = lazyRouteComponent(() => import('./pages/TenantIntegrationsPage'), 'IntegrationsProvidersPage')
const IntegrationsTasksPage = lazyRouteComponent(() => import('./pages/TenantIntegrationsPage'), 'IntegrationsTasksPage')
const IntegrationsUsagePage = lazyRouteComponent(() => import('./pages/TenantIntegrationsPage'), 'IntegrationsUsagePage')
// PortfolioPage merged into AudiencePage (UX-3.1) — the /portfolio route is
// a redirect kept for old links; the page file is deleted.
const AudienceOverviewPage = lazyRouteComponent(() => import('./pages/AudiencePage'), 'AudienceOverviewPage')
const AudienceFansPage = lazyRouteComponent(() => import('./pages/AudiencePage'), 'AudienceFansPage')
const AudienceSourcesPage = lazyRouteComponent(() => import('./pages/AudiencePage'), 'AudienceSourcesPage')
const AudienceContactsPage = lazyRouteComponent(() => import('./pages/AudiencePage'), 'AudienceContactsPage')
const AudienceCommunitiesPage = lazyRouteComponent(() => import('./pages/AudiencePage'), 'AudienceCommunitiesPage')
const AudiencePortfolioPage = lazyRouteComponent(() => import('./pages/AudiencePage'), 'AudiencePortfolioPage')
const PlacesOverviewPage = lazyRouteComponent(() => import('./pages/TenantPlacesPage'), 'PlacesOverviewPage')
const PlacesCitiesPage = lazyRouteComponent(() => import('./pages/TenantPlacesPage'), 'PlacesCitiesPage')
const PlacesRoomsPage = lazyRouteComponent(() => import('./pages/TenantPlacesPage'), 'PlacesRoomsPage')
const PlacesOnlinePage = lazyRouteComponent(() => import('./pages/TenantPlacesPage'), 'PlacesOnlinePage')
const PlacesAreaPage = lazyRouteComponent(() => import('./pages/TenantPlacesPage'), 'PlacesAreaPage')
const ProofOverviewPage = lazyRouteComponent(() => import('./pages/TenantProofPage'), 'ProofOverviewPage')
const ProofListingPage = lazyRouteComponent(() => import('./pages/TenantProofPage'), 'ProofListingPage')
const ProofCardsPage = lazyRouteComponent(() => import('./pages/TenantProofPage'), 'ProofCardsPage')
const ProofReportsPage = lazyRouteComponent(() => import('./pages/TenantProofPage'), 'ProofReportsPage')
const ProofStoryPage = lazyRouteComponent(() => import('./pages/TenantProofPage'), 'ProofStoryPage')
const TenantCapabilitiesPage = lazyRouteComponent(() => import('./pages/TenantCapabilitiesPage'), 'TenantCapabilitiesPage')
const AutomationOverviewPage = lazyRouteComponent(() => import('./pages/AutomationPage'), 'AutomationOverviewPage')
const AutomationRoutingPage = lazyRouteComponent(() => import('./pages/AutomationPage'), 'AutomationRoutingPage')
const AutomationEventsPage = lazyRouteComponent(() => import('./pages/AutomationPage'), 'AutomationEventsPage')
const TenantCityPage = lazyRouteComponent(() => import('./pages/TenantCityPage'), 'TenantCityPage')
const ShowsOverviewPage = lazyRouteComponent(() => import('./pages/TenantShowsPage'), 'ShowsOverviewPage')
const ShowsBookingPage = lazyRouteComponent(() => import('./pages/TenantShowsPage'), 'ShowsBookingPage')
const ShowsMerchPage = lazyRouteComponent(() => import('./pages/TenantShowsPage'), 'ShowsMerchPage')
const TenantShowPage = lazyRouteComponent(() => import('./pages/TenantShowPage'), 'TenantShowPage')
const TenantShowScanPage = lazyRouteComponent(() => import('./pages/TenantShowScanPage'), 'TenantShowScanPage')
const TenantShowReportPage = lazyRouteComponent(() => import('./pages/TenantShowReportPage'), 'TenantShowReportPage')
const ContentOverviewPage = lazyRouteComponent(() => import('./pages/TenantContentPage'), 'ContentOverviewPage')
const ContentHooksPage = lazyRouteComponent(() => import('./pages/TenantContentPage'), 'ContentHooksPage')
const ContentLinksPage = lazyRouteComponent(() => import('./pages/TenantContentPage'), 'ContentLinksPage')
const TenantContentMaterialPage = lazyRouteComponent(() => import('./pages/TenantContentMaterialPage'), 'TenantContentMaterialPage')
const InMotionOverviewPage = lazyRouteComponent(() => import('./pages/TenantInMotionPage'), 'InMotionOverviewPage')
const InMotionRelaysPage = lazyRouteComponent(() => import('./pages/TenantInMotionPage'), 'InMotionRelaysPage')

const rootRoute = createRootRoute({ component: Shell })
// The overview is a platform command centre — a tenant operator's console
// is their own tenant, so `/` sends them straight to its Today view before
// the command-centre loader can fire a guaranteed 403. Admins land on the
// first tenant's Today once per session — the redirect lives here, before
// the route loads, so boot never mounts the Overview or pays its fan-out
// only to leave. With the session flag set (cleared on login by auth.ts),
// `/` renders the Overview as its own page.
const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: OverviewPage, beforeLoad: async ({ preload }) => {
  // Hovering a link runs the loaders but must never move the user.
  if (preload) return
  const operatorSlug = authState.isPlatformLevel() ? undefined : authState.profile()?.tenantSlug
  if (operatorSlug) throw redirect({ href: `/tenants/${operatorSlug}/operations` })
  try { if (sessionStorage.getItem('cp-default-tenant')) return } catch { /* storage blocked — land once anyway */ }
  const first = await queryClient
    .ensureQueryData({ queryKey: ['tenants'], queryFn: api.tenants, staleTime: 15_000 })
    .then(list => list.items?.[0]?.slug)
    .catch(() => undefined)
  const target = first ?? authState.profile()?.tenantSlug
  if (!target) return
  try { sessionStorage.setItem('cp-default-tenant', '1') } catch {}
  throw redirect({ href: `/tenants/${target}/operations` })
}, loader: warm(['command-center'], api.commandCenter) })
const flowRoute = createRoute({ getParentRoute: () => rootRoute, path: '/flow', component: FlowPage })
const tenantsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants', component: TenantsPage, loader: warm(['tenants'], api.tenants, 15_000) })
const tenantWizardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/new', component: TenantWizardPage })
// The bare tenant URL is the tenant, not a settings surface — it lands on
// Today (`/operations`), the daily read. Settings is its own section at
// `/settings`: the overview there, and each settings area a sub-page under
// it. The tenant page's old `?tab=` URLs follow their content — the retired
// `about` tab was the Profile, and `?tab=profile` (the old sidebar link) now
// means the Profile page it was named after. A legacy `?tab=today` follows
// the content to its one home.
const SETTINGS_TABS: Record<string, string> = { overview: '', profile: '/profile', about: '/profile', workspace: '/workspace', deployment: '/deployment', access: '/team', destinations: '/notifications', brand: '/brand', team: '/team', keys: '/keys', notifications: '/notifications' }
const tenantRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug', beforeLoad: ({ params, search }) => {
  const tab = (search as { tab?: string }).tab
  if (tab == null || tab === 'today') throw redirect({ href: `/tenants/${params.slug}/operations` })
  throw redirect({ href: `/tenants/${params.slug}/settings${SETTINGS_TABS[tab] ?? ''}` })
} })
const warmSettings = ({ params }: { params: { slug: string } }) => warm(['tenant-overview', params.slug], () => fetchTenantOverview(params.slug))()
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/settings', component: SettingsOverviewPage, loader: warmSettings })
const settingsProfileRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/settings/profile', component: SettingsProfilePage, loader: warmSettings })
const settingsWorkspaceRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/settings/workspace', component: SettingsWorkspacePage, loader: warmSettings })
const settingsDeploymentRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/settings/deployment', component: SettingsDeploymentPage, loader: warmSettings })
const settingsBrandRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/settings/brand', component: SettingsBrandPage, loader: warmSettings })
const settingsTeamRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/settings/team', component: SettingsTeamPage, loader: warmSettings })
const settingsKeysRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/settings/keys', component: SettingsKeysPage, loader: warmSettings })
const settingsNotificationsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/settings/notifications', component: SettingsNotificationsPage, loader: warmSettings })
// Access split into Team (operators) and Profile's Danger zone; Destinations
// is Notifications. Old links follow their content.
const settingsAccessRedirect = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/settings/access', beforeLoad: ({ params }) => { throw redirect({ href: `/tenants/${params.slug}/settings/team` }) } })
const settingsDestinationsRedirect = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/settings/destinations', beforeLoad: ({ params }) => { throw redirect({ href: `/tenants/${params.slug}/settings/notifications` }) } })
const portfolioRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/portfolio', beforeLoad: ({ params }) => { throw redirect({ href: `/tenants/${params.slug}/audience?tab=portfolio` }) } })
// The places tab became a first-class destination — `?tab=places` follows it.
const audienceRouteLoader = ({ params }: { params: { slug: string } }) => warm(['tenant-audience', params.slug], () => api.audienceModel(params.slug))()
const audienceRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/audience', component: AudienceOverviewPage, beforeLoad: subPageTabs('audience', { fans: 'fans', sources: 'sources', contacts: 'contacts', communities: 'communities', portfolio: 'portfolio', places: '/places' }), loader: audienceRouteLoader })
const audienceFansRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/audience/fans', component: AudienceFansPage, loader: audienceRouteLoader })
const audienceSourcesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/audience/sources', component: AudienceSourcesPage, loader: audienceRouteLoader })
const audienceContactsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/audience/contacts', component: AudienceContactsPage, loader: audienceRouteLoader })
const audienceCommunitiesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/audience/communities', component: AudienceCommunitiesPage, loader: audienceRouteLoader })
const audiencePortfolioRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/audience/portfolio', component: AudiencePortfolioPage, loader: audienceRouteLoader })
const placesRouteLoader = ({ params }: { params: { slug: string } }) => warm(['tenant-places', params.slug, 'cities'], () => api.placesCities(params.slug))()
const placesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/places', component: PlacesOverviewPage, beforeLoad: subPageTabs('places', { cities: 'cities', rooms: 'rooms', online: 'online', area: 'area' }), loader: placesRouteLoader })
const placesCitiesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/places/cities', component: PlacesCitiesPage, loader: placesRouteLoader })
const placesRoomsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/places/rooms', component: PlacesRoomsPage, loader: placesRouteLoader })
const placesOnlineRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/places/online', component: PlacesOnlinePage, loader: placesRouteLoader })
const placesAreaRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/places/area', component: PlacesAreaPage, loader: placesRouteLoader })
// Beacons dissolved into Audience → Contacts: every contact surface — the
// roster, the signal funnel, the dual-role list — is a `kind` on that tab.
// The route redirects rather than breaking old links.
const beaconsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/beacons', beforeLoad: ({ params }) => { throw redirect({ href: `/tenants/${params.slug}/audience?tab=contacts` }) } })
// AREA folded into Places as its fourth tab — the route redirects rather
// than breaking old links, the way /portfolio and /beacons did before it.
const areaRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/area', beforeLoad: ({ params }) => { throw redirect({ href: `/tenants/${params.slug}/places?tab=area` }) } })
const tenantAttentionRouteLoader = ({ params }: { params: { slug: string } }) => warm(['tenant-today', params.slug], () => api.tenantToday(params.slug))()
const tenantAttentionRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/attention', component: AttentionOverviewPage, beforeLoad: subPageTabs('attention', { decisions: 'decisions', inbox: 'inbox', queues: 'queues', runtime: 'runtime', trace: 'trace' }), loader: tenantAttentionRouteLoader })
const tenantAttentionDecisionsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/attention/decisions', component: AttentionDecisionsPage, loader: tenantAttentionRouteLoader })
const tenantAttentionInboxRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/attention/inbox', component: AttentionInboxPage, loader: tenantAttentionRouteLoader })
const tenantAttentionQueuesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/attention/queues', component: AttentionQueuesPage, loader: tenantAttentionRouteLoader })
const tenantAttentionRuntimeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/attention/runtime', component: AttentionRuntimePage, loader: tenantAttentionRouteLoader })
const tenantAttentionTraceRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/attention/trace', component: AttentionTracePage, loader: tenantAttentionRouteLoader })
const tenantOperationsRouteLoader = ({ params }: { params: { slug: string } }) => warm(['tenant-today', params.slug], () => api.tenantToday(params.slug))()
const tenantOperationsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/operations', component: TodayOverviewPage, beforeLoad: subPageTabs('operations', { replies: 'replies', outreach: 'outreach', negotiations: 'negotiations', press: 'press', releases: 'releases', plays: 'plays', growth: 'growth', listing: '/proof' }), loader: tenantOperationsRouteLoader })
const tenantOperationsRepliesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/operations/replies', component: TodayRepliesPage, loader: tenantOperationsRouteLoader })
const tenantOperationsOutreachRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/operations/outreach', component: TodayOutreachPage, loader: tenantOperationsRouteLoader })
const tenantOperationsNegotiationsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/operations/negotiations', component: TodayNegotiationsPage, loader: tenantOperationsRouteLoader })
const tenantOperationsPressRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/operations/press', component: TodayPressPage, loader: tenantOperationsRouteLoader })
const tenantOperationsReleasesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/operations/releases', component: TodayReleasesPage, loader: tenantOperationsRouteLoader })
const tenantOperationsPlaysRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/operations/plays', component: TodayPlaysPage, loader: tenantOperationsRouteLoader })
const tenantOperationsGrowthRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/operations/growth', component: TodayGrowthPage, loader: tenantOperationsRouteLoader })
// In motion: the process view — every run the brain is working, each as its
// steps. The list warms on intent like its siblings; a run's forum detail is
// a second query that only fires when the card opens.
const tenantInMotionRouteLoader = ({ params }: { params: { slug: string } }) => warm(['in-motion-model', params.slug], () => api.inMotionModel(params.slug))()
const tenantInMotionRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/in-motion', component: InMotionOverviewPage, beforeLoad: subPageTabs('in-motion', { relays: 'relays' }), loader: tenantInMotionRouteLoader })
const tenantInMotionRelaysRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/in-motion/relays', component: InMotionRelaysPage, loader: tenantInMotionRouteLoader })
// Health, AI integrations and Automation are sections like Intelligence:
// the overview at the bare path, each area a sub-page under it, and the old
// `?tab=` links redirected onto the sub-page (Health's `runtime` tab is the
// Switches page).
const HEALTH_TABS: Record<string, string> = { delivery: 'delivery', policies: 'policies', runtime: 'switches', switches: 'switches' }
const INTEGRATIONS_TABS: Record<string, string> = { providers: 'providers', library: 'providers', tasks: 'tasks', usage: 'usage', intel: '/intelligence/decisions' }
const AUTOMATION_TABS: Record<string, string> = { routing: 'routing', events: 'events' }
const warmToday = ({ params }: { params: { slug: string } }) => warm(['tenant-today', params.slug], () => api.tenantToday(params.slug))()
const tenantHealthRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/health', component: HealthOverviewPage, beforeLoad: ({ params, search }) => {
  const tab = (search as { tab?: string }).tab
  if (tab != null && HEALTH_TABS[tab]) throw redirect({ href: `/tenants/${params.slug}/health/${HEALTH_TABS[tab]}` })
}, loader: warmToday })
const healthDeliveryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/health/delivery', component: HealthDeliveryPage, loader: warmToday })
const healthPoliciesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/health/policies', component: HealthPoliciesPage, loader: warmToday })
const healthSwitchesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/health/switches', component: HealthSwitchesPage, loader: warmToday })
// The default tab reads the brief, not the operations model — warm both so
// intent-hover prefetch reaches the data the first screenful actually shows.
// Intelligence is a section: the overview at /intelligence, each part of the
// loop a sub-page under it. Old `?tab=` links follow their content — the
// current ids by name, the pre-regroup ids onto the page their evidence
// moved to.
const INTELLIGENCE_TABS: Record<string, string> = { brief: 'brief', standing: 'standing', decisions: 'decisions', learning: 'learning', overview: 'standing', growth: 'standing', material: 'standing', funnel: 'decisions', numbers: 'learning' }
const warmBrain = ({ params }: { params: { slug: string } }) => warm(['tenant-brain', params.slug], () => api.brainModel(params.slug))()
const tenantIntelligenceRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/intelligence', component: IntelligenceOverviewPage, beforeLoad: ({ params, search }) => {
  const tab = (search as { tab?: string }).tab
  if (tab != null && INTELLIGENCE_TABS[tab]) throw redirect({ href: `/tenants/${params.slug}/intelligence/${INTELLIGENCE_TABS[tab]}` })
}, loader: warmBrain })
const intelligenceBriefRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/intelligence/brief', component: IntelligenceBriefPage, loader: warmBrain })
const intelligenceStandingRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/intelligence/standing', component: IntelligenceStandingPage, loader: warmBrain })
const intelligenceDecisionsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/intelligence/decisions', component: IntelligenceDecisionsPage, loader: warmBrain })
const intelligenceLearningRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/intelligence/learning', component: IntelligenceLearningPage, loader: warmBrain })
const tenantCapabilitiesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/capabilities', component: TenantCapabilitiesPage })
const tenantProofRouteLoader = ({ params }: { params: { slug: string } }) => warm(['tenant-proof', params.slug], () => api.proofModel(params.slug))()
const tenantProofRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/proof', component: ProofOverviewPage, beforeLoad: subPageTabs('proof', { listing: 'listing', cards: 'cards', reports: 'reports', story: 'story' }), loader: tenantProofRouteLoader })
const tenantProofListingRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/proof/listing', component: ProofListingPage, loader: tenantProofRouteLoader })
const tenantProofCardsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/proof/cards', component: ProofCardsPage, loader: tenantProofRouteLoader })
const tenantProofReportsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/proof/reports', component: ProofReportsPage, loader: tenantProofRouteLoader })
const tenantProofStoryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/proof/story', component: ProofStoryPage, loader: tenantProofRouteLoader })
const tenantContentRouteLoader = ({ params }: { params: { slug: string } }) => warm(['content-model', params.slug], () => api.contentModel(params.slug))()
const tenantContentRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/content', component: ContentOverviewPage, beforeLoad: subPageTabs('content', { hooks: 'hooks', links: 'links', material: 'material' }), loader: tenantContentRouteLoader })
const tenantContentHooksRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/content/hooks', component: ContentHooksPage, loader: tenantContentRouteLoader })
const tenantContentLinksRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/content/links', component: ContentLinksPage, loader: tenantContentRouteLoader })
const tenantContentMaterialRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/content/material', component: TenantContentMaterialPage, loader: ({ params }) => warm(['content-material-view', params.slug], () => api.contentMaterialView(params.slug))() })
const tenantIntegrationsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/integrations', component: IntegrationsOverviewPage, beforeLoad: subPageTabs('integrations', INTEGRATIONS_TABS) })
// Providers held five tabs before Tasks and Usage became sub-pages of their
// own and Intelligence went back to its page; old `?tab=` links follow them.
const integrationsProvidersRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/integrations/providers', component: IntegrationsProvidersPage, beforeLoad: subPageTabs('integrations', { tasks: 'tasks', usage: 'usage', intel: '/intelligence/decisions' }) })
const integrationsTasksRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/integrations/tasks', component: IntegrationsTasksPage })
const integrationsUsageRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/integrations/usage', component: IntegrationsUsagePage })
// Notifiers live on Settings → Destinations — the route redirects rather
// than keep a second copy of the same panel alive.
const tenantNotifiersRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/notifiers', beforeLoad: ({ params }) => { throw redirect({ href: `/tenants/${params.slug}/settings/notifications` }) } })
const tenantAutomationRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/automation', component: AutomationOverviewPage, beforeLoad: ({ params, search }) => {
  const tab = (search as { tab?: string }).tab
  if (tab != null && AUTOMATION_TABS[tab]) throw redirect({ href: `/tenants/${params.slug}/automation/${AUTOMATION_TABS[tab]}` })
} })
const automationRoutingRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/automation/routing', component: AutomationRoutingPage })
const automationEventsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/automation/events', component: AutomationEventsPage })
// N.12 — a city opens as its own read. Not a nav destination: the funnel
// table, the venue registry and the gig plan link here. The loader warms the
// two datasets that carry the city's identity — the same keys the Places
// tab's panels already hold, so a click through lands on warm data.
const tenantCityRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/cities/$cityId', component: TenantCityPage, loader: ({ params }) => warm(['city-view', params.slug, params.cityId], () => api.cityView(params.slug, params.cityId))() })
const tenantShowsRouteLoader = ({ params }: { params: { slug: string } }) => warm(['tenant-shows', params.slug], () => api.shows(params.slug))()
const tenantShowsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/shows', component: ShowsOverviewPage, beforeLoad: subPageTabs('shows', { booking: 'booking', merch: 'merch', nights: '' }), loader: tenantShowsRouteLoader })
const tenantShowsBookingRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/shows/booking', component: ShowsBookingPage, loader: tenantShowsRouteLoader })
const tenantShowsMerchRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/shows/merch', component: ShowsMerchPage, loader: tenantShowsRouteLoader })
const tenantShowRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/shows/$eventSlug', component: TenantShowPage, loader: ({ params }) => warm(['tenant-show-page', params.slug, params.eventSlug], () => api.showModel(params.slug, params.eventSlug))() })
const tenantShowScanRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/shows/$eventSlug/scan', component: TenantShowScanPage, loader: ({ params }) => warm(['tenant-show-scan', params.slug, params.eventSlug], () => api.showScan(params.slug, params.eventSlug))() })
const tenantShowReportRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/shows/$eventSlug/report', component: TenantShowReportPage, loader: ({ params }) => warm(['tenant-show-report', params.slug, params.eventSlug], () => api.showReport(params.slug, params.eventSlug))() })
const operatorAttentionRedirect = createRoute({ getParentRoute: () => rootRoute, path: '/attention', beforeLoad: () => { throw redirect({ href: '/' }) } })
const automationRedirect = createRoute({ getParentRoute: () => rootRoute, path: '/automation', beforeLoad: () => { throw redirect({ href: '/tenants' }) } })

// Legacy redirects — old routes that were consolidated into other pages
const tenantActionsRedirect = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/actions', beforeLoad: ({ params }) => { throw redirect({ href: `/tenants/${params.slug}/attention` }) } })
const funnelRedirect = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/funnel', beforeLoad: ({ params }) => { throw redirect({ href: `/tenants/${params.slug}/intelligence/decisions` }) } })
const communityRedirect = createRoute({ getParentRoute: () => rootRoute, path: '/tenants/$slug/communities', beforeLoad: ({ params }) => { throw redirect({ href: `/tenants/${params.slug}/audience?tab=communities` }) } })

const routeTree = rootRoute.addChildren([overviewRoute, flowRoute, tenantsRoute, tenantWizardRoute, operatorAttentionRedirect, automationRedirect, tenantRoute, settingsRoute, settingsProfileRoute, settingsWorkspaceRoute, settingsDeploymentRoute, settingsBrandRoute, settingsTeamRoute, settingsKeysRoute, settingsNotificationsRoute, settingsAccessRedirect, settingsDestinationsRedirect, tenantActionsRedirect, tenantAttentionRoute, tenantAttentionDecisionsRoute, tenantAttentionInboxRoute, tenantAttentionQueuesRoute, tenantAttentionRuntimeRoute, tenantAttentionTraceRoute, tenantOperationsRoute, tenantOperationsRepliesRoute, tenantOperationsOutreachRoute, tenantOperationsNegotiationsRoute, tenantOperationsPressRoute, tenantOperationsReleasesRoute, tenantOperationsPlaysRoute, tenantOperationsGrowthRoute, tenantInMotionRoute, tenantInMotionRelaysRoute, tenantHealthRoute, healthDeliveryRoute, healthPoliciesRoute, healthSwitchesRoute, tenantIntelligenceRoute, intelligenceBriefRoute, intelligenceStandingRoute, intelligenceDecisionsRoute, intelligenceLearningRoute, tenantProofRoute, tenantProofListingRoute, tenantProofCardsRoute, tenantProofReportsRoute, tenantProofStoryRoute, tenantCapabilitiesRoute, tenantContentRoute, tenantContentHooksRoute, tenantContentLinksRoute, tenantContentMaterialRoute, tenantIntegrationsRoute, integrationsProvidersRoute, integrationsTasksRoute, integrationsUsageRoute, tenantNotifiersRoute, tenantAutomationRoute, automationRoutingRoute, automationEventsRoute, communityRedirect, portfolioRoute, audienceRoute, audienceFansRoute, audienceSourcesRoute, audienceContactsRoute, audienceCommunitiesRoute, audiencePortfolioRoute, placesRoute, placesCitiesRoute, placesRoomsRoute, placesOnlineRoute, placesAreaRoute, funnelRedirect, beaconsRoute, areaRoute, tenantCityRoute, tenantShowsRoute, tenantShowsBookingRoute, tenantShowsMerchRoute, tenantShowRoute, tenantShowScanRoute, tenantShowReportRoute])
// `defaultPendingMs: 0` shows the skeleton on the first frame. The default
// (500ms) leaves the previous page frozen on screen while a route chunk loads,
// which reads as a hang rather than as loading — the blank operator screen this
// replaces was exactly that gap.
// Unknown URLs land here instead of a dead end — every retired route above
// redirects, so reaching this means the address was never a page.
const NotFound = () => (
  <div class="mx-auto max-w-md px-4 py-20 text-center">
    <p class="text-lg font-medium text-foreground">This page moved or never existed.</p>
    <p class="mt-1 text-sm text-muted-foreground">Old links redirect on their own; this address is not one of them.</p>
    <Link to="/" class="mt-4 inline-block text-sm font-medium text-foreground underline underline-offset-4">Back to Overview</Link>
  </div>
)

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 10_000,
  // A pointer crossing the sidebar fires every loader it touches — thirteen
  // nav items, each a server-side fan-out. Two hundred milliseconds of dwell
  // is the line between a sweep and an intent.
  defaultPreloadDelay: 200,
  scrollRestoration: true,
  defaultPendingComponent: () => <SkeletonPage />,
  defaultPendingMs: 0,
  defaultPendingMinMs: 0,
  defaultNotFoundComponent: NotFound,
})

declare module '@tanstack/solid-router' { interface Register { router: typeof router } }

export default function AuthenticatedApp() {
  return <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>
}
