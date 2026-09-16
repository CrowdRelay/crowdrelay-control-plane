// Tenant-scoped nav, grouped by the operator's mental model:
//   CONTROL — what needs your attention right now (overview, incidents)
//   BRAIN — the deterministic autopilot's intelligence and learning
//   EXECUTION — live operations, integrations, and alert channels
//   AUDIENCE — who you're reaching and how (fans, sources, beacons, AREA)
export type NavItem = {
  path: string
  label: string
  exact: boolean
  icon: string
  /// Query the link carries — e.g. a deep link into a page's tab.
  search?: Record<string, string>
  /// Compare the URL query when deciding "active" so two links sharing one
  /// path (Today vs Settings → `/tenants/$slug`) highlight exactly one.
  searchSensitive?: boolean
}
export type NavGroup = { label: string; items: NavItem[]; defaultOpen: boolean }

// Fourteen links, four groups, all expanded, was the whole product laid out
// as a menu. Somebody who books shows opens this to do one thing: work today's
// list. The daily group is always visible; the rest — set-up, deeper reports —
// sits behind one disclosure that remembers whether it was left open.
//
// Nothing was removed. `defaultOpen` decides what an operator has to look at
// before finding the work.
export const TENANT_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Every day',
    defaultOpen: true,
    items: [
      { path: '/tenants/$slug/operations', label: 'Operations', exact: false, icon: 'operations' },
      { path: '/tenants/$slug/attention', label: 'Attention', exact: false, icon: 'attention' },
      { path: '/tenants/$slug/audience', label: 'Audience', exact: false, icon: 'fan-intel' },
      { path: '/tenants/$slug/content', label: 'Content', exact: false, icon: 'content' },
    ],
  },
  {
    label: 'How it is going',
    defaultOpen: false,
    items: [
      { path: '/tenants/$slug/intelligence', label: 'Intelligence', exact: false, icon: 'intelligence' },
      { path: '/tenants/$slug/health', label: 'Health', exact: false, icon: 'sliders' },
    ],
  },
  {
    label: 'Set up once',
    defaultOpen: false,
    items: [
      { path: '/tenants/$slug/beacons', label: 'Beacons', exact: false, icon: 'beacons' },
      { path: '/tenants/$slug/area', label: 'AREA', exact: false, icon: 'area' },
      { path: '/tenants/$slug/notifiers', label: 'Notifiers', exact: false, icon: 'notifiers' },
      { path: '/tenants/$slug/integrations', label: 'AI Integrations', exact: false, icon: 'integrations' },
      { path: '/tenants/$slug/automation', label: 'Automation', exact: false, icon: 'automation' },
      { path: '/tenants/$slug', label: 'Settings', exact: true, icon: 'settings' },
    ],
  },
]

// The band's console is smaller on purpose — six destinations that answer the
// questions a person in the band actually asks, named in the band's language.
// The operator's machinery (queues, tunnels, notifiers, provider wiring,
// automation) is out of the sidebar entirely; platform-level users keep the
// full map because they run that machinery. Pages stay reachable by links —
// this is a focus split, not a permission boundary.
export const BAND_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Every day',
    defaultOpen: true,
    items: [
      { path: '/tenants/$slug', label: 'Today', exact: true, icon: 'operations', searchSensitive: true },
      { path: '/tenants/$slug/shows', label: 'Shows', exact: false, icon: 'area' },
      { path: '/tenants/$slug/attention', label: 'Needs you', exact: false, icon: 'attention' },
      { path: '/tenants/$slug/audience', label: 'Audience', exact: false, icon: 'fan-intel' },
      { path: '/tenants/$slug/content', label: 'Content', exact: false, icon: 'content' },
    ],
  },
  {
    label: 'The rest',
    defaultOpen: false,
    items: [
      { path: '/tenants/$slug/intelligence', label: 'Intelligence', exact: false, icon: 'intelligence' },
      { path: '/tenants/$slug', label: 'Settings', exact: true, icon: 'settings', search: { tab: 'profile' }, searchSensitive: true },
    ],
  },
]

/// The sidebar a session gets: the operator map for platform-level users,
/// the six-destination band map for everyone else.
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
// child route added later. Both nav sets feed the matcher so a band session's
// breadcrumb speaks the band's names (Today, Needs you) rather than the
// operator's.
const ALL_NAV_ITEMS = [...TENANT_NAV_GROUPS, ...BAND_NAV_GROUPS]
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
]

export const currentPageLabel = (pathname: string, slug: string | undefined, platformLevel = true, search?: { tab?: string }) => {
  if (slug) {
    const base = `/tenants/${slug}`
    const suffix = pathname.slice(base.length)
    // Band items match first so the breadcrumb speaks the band's names; a
    // page outside the band map still names itself from the full map rather
    // than falling back to a generic 'Overview'. Search-declaring items
    // (the band's Today/Settings pair shares one path) match only when
    // the location's tab agrees with what they declare.
    const matches = (item: NavItem) => {
      const itemSuffix = item.path.replace('/tenants/$slug', '')
      if (!(itemSuffix ? suffix.startsWith(itemSuffix) : suffix === '')) return false
      if (item.search?.tab != null) return search?.tab === item.search.tab
      if (item.searchSensitive) return search?.tab == null
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
