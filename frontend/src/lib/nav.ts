// Tenant-scoped nav, grouped by the questions a person in the act asks —
// not by the subsystems that answer them. The daily map is the same for
// every session; platform-level sessions additionally get the Operator
// group, where the machinery (queues, tunnels, provider wiring, automation)
// lives one level in behind a labelled disclosure. Notification channels
// moved one level further — Settings → Destinations. Every route keeps
// working — this is placement, not permission.
export type NavItem = {
  path: string
  label: string
  exact: boolean
  icon: string
  /// Query the link carries — e.g. a deep link into a page's tab. Matching
  /// stays path-based: one path owns one item, so any `?tab=` on the page
  /// keeps its nav item lit.
  search?: Record<string, string>
  /// Further `?tab=` values the breadcrumb names this item for — the page's
  /// other tabs that belong under the same heading.
  matchTabs?: string[]
}
export type NavGroup = { label: string; items: NavItem[]; defaultOpen: boolean }

// One process map for every session — five destinations a person in the act
// actually asks for, in their order: today, the next night, what needs a
// decision, the audience, the content pipeline. The bare tenant URL used to
// carry a second copy of Today; it now redirects to /operations, and the
// Settings link below points at the tenant page's ?tab= URLs — Deployment
// and Access are named under it in the breadcrumb.
//
// Both arrays are written out literally on purpose: the destination-count
// ratchet and the label-collision gate parse each declaration's literal body
// — a spread of one list inside the other would parse as zero items and the
// gates would go blind. Keep the shared items in sync by hand.
export const BAND_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Every day',
    defaultOpen: true,
    items: [
      { path: '/tenants/$slug/operations', label: 'Today', exact: false, icon: 'operations' },
      { path: '/tenants/$slug/shows', label: 'Shows', exact: false, icon: 'shows' },
      // Needs you merged into Today: the strip on the daily page names the
      // parked asks, and the badge lands on this item. The page itself stays
      // reachable by URL — its queue/alerts/findings depth is still there.
      { path: '/tenants/$slug/places', label: 'Places', exact: false, icon: 'places' },
      { path: '/tenants/$slug/in-motion', label: 'In motion', exact: false, icon: 'motion' },
      { path: '/tenants/$slug/audience', label: 'Audience', exact: false, icon: 'fan-intel' },
      { path: '/tenants/$slug/content', label: 'Content', exact: false, icon: 'content' },
    ],
  },
  {
    label: 'The rest',
    defaultOpen: false,
    items: [
      { path: '/tenants/$slug/intelligence', label: 'Intelligence', exact: false, icon: 'intelligence' },
      { path: '/tenants/$slug', label: 'Settings', exact: true, icon: 'settings', search: { tab: 'profile' }, matchTabs: ['workspace', 'deployment', 'access', 'destinations'] },
    ],
  },
]

// The platform sidebar is the same process map plus one more group: the
// machinery (queues, tunnels, provider wiring, automation) folded one level
// in behind a labelled disclosure. The operator keeps every control — it
// moved a level in, not out. Pages stay reachable by URL for everyone — a
// focus split, not a permission boundary.
export const TENANT_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Every day',
    defaultOpen: true,
    items: [
      { path: '/tenants/$slug/operations', label: 'Today', exact: false, icon: 'operations' },
      { path: '/tenants/$slug/shows', label: 'Shows', exact: false, icon: 'shows' },
      { path: '/tenants/$slug/attention', label: 'Needs you', exact: false, icon: 'attention' },
      { path: '/tenants/$slug/places', label: 'Places', exact: false, icon: 'places' },
      { path: '/tenants/$slug/in-motion', label: 'In motion', exact: false, icon: 'motion' },
      { path: '/tenants/$slug/audience', label: 'Audience', exact: false, icon: 'fan-intel' },
      { path: '/tenants/$slug/content', label: 'Content', exact: false, icon: 'content' },
    ],
  },
  {
    label: 'The rest',
    defaultOpen: false,
    items: [
      { path: '/tenants/$slug/intelligence', label: 'Intelligence', exact: false, icon: 'intelligence' },
      { path: '/tenants/$slug', label: 'Settings', exact: true, icon: 'settings', search: { tab: 'profile' }, matchTabs: ['workspace', 'deployment', 'access', 'destinations'] },
    ],
  },
  {
    label: 'Operator',
    defaultOpen: false,
    items: [
      { path: '/tenants/$slug/health', label: 'Health', exact: false, icon: 'sliders' },
      { path: '/tenants/$slug/area', label: 'AREA', exact: false, icon: 'area' },
      { path: '/tenants/$slug/integrations', label: 'AI Integrations', exact: false, icon: 'integrations' },
      { path: '/tenants/$slug/automation', label: 'Automation', exact: false, icon: 'automation' },
    ],
  },
]

/// The sidebar a session gets: the shared process map for everyone, plus the
/// Operator group for platform-level users who run the machinery.
export const tenantNavGroups = (platformLevel: boolean): NavGroup[] =>
  platformLevel ? TENANT_NAV_GROUPS : BAND_NAV_GROUPS

// Global nav, declared once so the topbar breadcrumb can name the current
// page instead of repeating the tenant name the page heading already shows.
// Ordered the way the work is read: what is happening, who it is for, what is
// running, what needs a person, then the map that explains the rest.
// `New tenant` stays beside Tenants — it is that page's action, not a sixth
// destination.
export const GLOBAL_NAV: NavItem[] = [
  { path: '/', label: 'Overview', exact: true, icon: 'overview' },
  { path: '/tenants', label: 'Tenants', exact: true, icon: 'portfolio' },
  { path: '/tenants/new', label: 'New tenant', exact: true, icon: 'portfolio' },
  { path: '/flow', label: 'Process map', exact: false, icon: 'flow' },
]

// Longest tenant suffix wins so `/operations` never matches before a deeper
// child route added later. TENANT_NAV_GROUPS is the superset — it shares the
// process map's items with BAND_NAV_GROUPS — so flattening it alone covers
// every destination either session can name.
const ALL_NAV_ITEMS = TENANT_NAV_GROUPS
  .flatMap(group => group.items)
  .slice()
  .sort((a, b) => b.path.length - a.path.length)

export const tenantNavItems = (platformLevel: boolean) =>
  platformLevel ? ALL_NAV_ITEMS : BAND_NAV_GROUPS.flatMap(g => g.items)

// Pages that are deliberately not top-level destinations still need a name
// in the breadcrumb — the gig page is reached from the home screen and ⌘K,
// not the sidebar. Longest suffix first, same rule as the nav items.
const TENANT_PAGE_LABELS: Array<{ suffix: string; label: string }> = [
  { suffix: '/shows/', label: 'Show' },
  { suffix: '/shows', label: 'Shows' },
  // Off-nav destinations that stay reachable: deep links from the process
  // map, palette and overview alerts land here and still need a name.
  { suffix: '/notifiers', label: 'Notifiers' },
]

export const currentPageLabel = (pathname: string, slug: string | undefined, platformLevel = true, search?: { tab?: string }) => {
  if (slug) {
    const base = `/tenants/${slug}`
    const suffix = pathname.slice(base.length)
    // The band map is matched first — it is the same map the operator sees,
    // so the names are already shared; for a band session on an operator-only
    // page (a deep link into Health, say) the full map names it instead of
    // falling back to a generic 'Overview'. Search-declaring items (the
    // Settings link carries ?tab=profile) match only when the location's tab
    // agrees with what they declare.
    const matches = (item: NavItem) => {
      const itemSuffix = item.path.replace('/tenants/$slug', '')
      if (!(itemSuffix ? suffix.startsWith(itemSuffix) : suffix === '')) return false
      if (item.search?.tab != null) return search?.tab === item.search.tab || (search?.tab != null && (item.matchTabs ?? []).includes(search.tab))
      return true
    }
    const match = tenantNavItems(platformLevel).find(matches)
      ?? (!platformLevel ? ALL_NAV_ITEMS.find(matches) : undefined)
    const page = suffix.endsWith('/scan')
      ? 'The scan'
      : suffix.endsWith('/report')
        ? 'The report'
        : TENANT_PAGE_LABELS.find(item => suffix.startsWith(item.suffix))?.label
    // Page labels name the deeper routes first — the band nav's '/shows'
    // item would otherwise shadow 'Show'/'The scan'/'The report' with the
    // generic 'Shows' on every gig URL.
    return page ?? match?.label ?? 'Overview'
  }
  return GLOBAL_NAV.find(item => item.exact ? pathname === item.path : pathname.startsWith(item.path))?.label ?? 'Overview'
}

/// The content section's two pages — the pipeline is the default view, real
/// material is the heavier list kept off the first paint.
export const CONTENT_TABS = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'material', label: 'Real material' },
]
