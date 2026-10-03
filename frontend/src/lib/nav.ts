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
  /// Sub-pages nested under the item in the sidebar — each is a real route,
  /// `${path}/${segment}`. The parent link is the section's landing page and
  /// stays lit on every child. Keyed by `segment`, not `path`, on purpose:
  /// a sub-page is part of its parent's destination, not a new one, so the
  /// destination-count ratchet does not count it.
  children?: NavSubItem[]
}
export type NavSubItem = { segment: string; label: string }
export type NavGroup = { label: string; items: NavItem[] }

// The sidebar is grouped by cadence, not by subsystem. 'Every day' is what
// moves daily — today's queue, the shows, the runs in flight, the content
// pipeline. 'Your audience' is who and where — reference views a person
// checks weekly rather than watches. AREA is no longer a destination of its
// own: it lives under Places as the AREA tab, next to the places its drops
// land in; the /area route redirects there. 'The rest' is what remains —
// Intelligence and Settings. The bare tenant URL redirects to /operations,
// and the sections with sub-pages (Intelligence, Settings, and Health, AI
// Integrations and Automation for the operator) each land on their
// overview and each area is a sub-page nested under it.
//
// Both arrays are written out literally on purpose: the destination-count
// ratchet and the label-collision gate parse each declaration's literal body
// — a spread of one list inside the other would parse as zero items and the
// gates would go blind. Keep the shared items in sync by hand.
export const BAND_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Every day',
    items: [
      { path: '/tenants/$slug/operations', label: 'Today', exact: false, icon: 'operations', children: [
        { segment: 'replies', label: 'Replies' },
        { segment: 'outreach', label: 'Outreach' },
        { segment: 'negotiations', label: 'Negotiations' },
        { segment: 'press', label: 'Press' },
        { segment: 'releases', label: 'Releases' },
        { segment: 'plays', label: 'Play ledger' },
        { segment: 'growth', label: 'Fan growth' },
      ] },
      { path: '/tenants/$slug/shows', label: 'Shows', exact: false, icon: 'shows', children: [
        { segment: 'booking', label: 'Get booked' },
        { segment: 'merch', label: 'Merch table' },
      ] },
      // Needs you merged into Today: the strip on the daily page names the
      // parked asks, and the badge lands on this item. The page itself stays
      // reachable by URL — its queue/alerts/findings depth is still there.
      { path: '/tenants/$slug/in-motion', label: 'In motion', exact: false, icon: 'motion', children: [
        { segment: 'relays', label: 'Post relays' },
      ] },
      { path: '/tenants/$slug/content', label: 'Content', exact: false, icon: 'content', children: [
        { segment: 'material', label: 'Material' },
        { segment: 'hooks', label: 'What held attention' },
        { segment: 'links', label: 'Tracked links' },
      ] },
    ],
  },
  {
    label: 'Your audience',
    items: [
      { path: '/tenants/$slug/audience', label: 'Audience', exact: false, icon: 'fan-intel', children: [
        { segment: 'fans', label: 'Fans' },
        { segment: 'sources', label: 'Sources' },
        { segment: 'contacts', label: 'Contacts' },
        { segment: 'communities', label: 'Communities' },
        { segment: 'portfolio', label: 'Portfolio' },
      ] },
      { path: '/tenants/$slug/places', label: 'Places', exact: false, icon: 'places', children: [
        { segment: 'cities', label: 'Cities' },
        { segment: 'rooms', label: 'Rooms' },
        { segment: 'online', label: 'Online' },
      ] },
      { path: '/tenants/$slug/proof', label: 'Proof', exact: false, icon: 'proof', children: [
        { segment: 'listing', label: 'Listing and who to approach' },
        { segment: 'cards', label: 'Signed proof cards' },
        { segment: 'reports', label: 'Show reports' },
        { segment: 'story', label: 'The roster story' },
      ] },
    ],
  },
  {
    label: 'The rest',
    items: [
      { path: '/tenants/$slug/intelligence', label: 'Intelligence', exact: false, icon: 'intelligence', children: [
        { segment: 'brief', label: 'Are we getting anywhere' },
        { segment: 'standing', label: 'Where it stands' },
        { segment: 'decisions', label: 'What it decided' },
        { segment: 'learning', label: 'What it learned' },
      ] },
      { path: '/tenants/$slug/settings', label: 'Settings', exact: false, icon: 'settings', children: [
        { segment: 'profile', label: 'Profile' },
        { segment: 'brand', label: 'Brand and apps' },
        { segment: 'team', label: 'Team' },
        { segment: 'workspace', label: 'Workspace' },
        { segment: 'keys', label: 'API keys' },
      ] },
    ],
  },
]

// The platform sidebar is the same cadence map plus two extras: Needs you in
// 'Every day' (the operator's dedicated queue the band map folded into
// Today), and 'Operator', where the machinery (queues, tunnels, provider
// wiring, automation) sits in a group of its own. The operator keeps every
// control. Pages stay
// reachable by URL for everyone — a focus split, not a permission boundary.
export const TENANT_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Every day',
    items: [
      { path: '/tenants/$slug/operations', label: 'Today', exact: false, icon: 'operations', children: [
        { segment: 'replies', label: 'Replies' },
        { segment: 'outreach', label: 'Outreach' },
        { segment: 'negotiations', label: 'Negotiations' },
        { segment: 'press', label: 'Press' },
        { segment: 'releases', label: 'Releases' },
        { segment: 'plays', label: 'Play ledger' },
        { segment: 'growth', label: 'Fan growth' },
      ] },
      { path: '/tenants/$slug/shows', label: 'Shows', exact: false, icon: 'shows', children: [
        { segment: 'booking', label: 'Get booked' },
        { segment: 'merch', label: 'Merch table' },
      ] },
      { path: '/tenants/$slug/attention', label: 'Needs you', exact: false, icon: 'attention', children: [
        { segment: 'decisions', label: 'Decision history' },
        { segment: 'inbox', label: 'Inbox' },
        { segment: 'queues', label: 'Queues' },
        { segment: 'runtime', label: 'Runtime' },
        { segment: 'trace', label: 'Trace' },
      ] },
      { path: '/tenants/$slug/in-motion', label: 'In motion', exact: false, icon: 'motion', children: [
        { segment: 'relays', label: 'Post relays' },
      ] },
      { path: '/tenants/$slug/content', label: 'Content', exact: false, icon: 'content', children: [
        { segment: 'material', label: 'Material' },
        { segment: 'hooks', label: 'What held attention' },
        { segment: 'links', label: 'Tracked links' },
      ] },
    ],
  },
  {
    label: 'Your audience',
    items: [
      { path: '/tenants/$slug/audience', label: 'Audience', exact: false, icon: 'fan-intel', children: [
        { segment: 'fans', label: 'Fans' },
        { segment: 'sources', label: 'Sources' },
        { segment: 'contacts', label: 'Contacts' },
        { segment: 'communities', label: 'Communities' },
        { segment: 'portfolio', label: 'Label portfolio' },
      ] },
      { path: '/tenants/$slug/places', label: 'Places', exact: false, icon: 'places', children: [
        { segment: 'cities', label: 'Cities' },
        { segment: 'rooms', label: 'Rooms' },
        { segment: 'online', label: 'Online' },
        { segment: 'area', label: 'AREA' },
      ] },
      { path: '/tenants/$slug/proof', label: 'Proof', exact: false, icon: 'proof', children: [
        { segment: 'listing', label: 'Listing and who to approach' },
        { segment: 'cards', label: 'Signed proof cards' },
        { segment: 'reports', label: 'Show reports' },
        { segment: 'story', label: 'The roster story' },
      ] },
    ],
  },
  {
    label: 'The rest',
    items: [
      { path: '/tenants/$slug/intelligence', label: 'Intelligence', exact: false, icon: 'intelligence', children: [
        { segment: 'brief', label: 'Are we getting anywhere' },
        { segment: 'standing', label: 'Where it stands' },
        { segment: 'decisions', label: 'What it decided' },
        { segment: 'learning', label: 'What it learned' },
      ] },
      { path: '/tenants/$slug/settings', label: 'Settings', exact: false, icon: 'settings', children: [
        { segment: 'profile', label: 'Profile' },
        { segment: 'brand', label: 'Brand and apps' },
        { segment: 'team', label: 'Team' },
        { segment: 'workspace', label: 'Workspace' },
        { segment: 'keys', label: 'API keys' },
        { segment: 'notifications', label: 'Notifications' },
        { segment: 'deployment', label: 'Deployment' },
      ] },
    ],
  },
  {
    label: 'Operator',
    items: [
      { path: '/tenants/$slug/health', label: 'Health', exact: false, icon: 'sliders', children: [
        { segment: 'delivery', label: 'Delivery' },
        { segment: 'policies', label: 'Policies' },
        { segment: 'switches', label: 'Switches' },
      ] },
      { path: '/tenants/$slug/integrations', label: 'AI Integrations', exact: false, icon: 'integrations', children: [
        { segment: 'providers', label: 'Providers' },
        { segment: 'tasks', label: 'Tasks and schedules' },
        { segment: 'usage', label: 'Usage and cost' },
      ] },
      { path: '/tenants/$slug/automation', label: 'Automation', exact: false, icon: 'automation', children: [
        { segment: 'routing', label: 'Workflow routing' },
        { segment: 'events', label: 'Events' },
      ] },
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
  { suffix: '/cities/', label: 'Place' },
  { suffix: '/capabilities', label: 'Capabilities' },
]

export const currentPageLabel = (pathname: string, slug: string | undefined, platformLevel = true, search?: { tab?: string }) => {
  if (slug) {
    const base = `/tenants/${slug}`
    const suffix = pathname.slice(base.length)
    // The band map is matched first — it is the same map the operator sees,
    // so the names are already shared; for a band session on an operator-only
    // page (a deep link into Health, say) the full map names it instead of
    // falling back to a generic 'Overview'. Search-declaring items match
    // only when the location's tab agrees with what they declare.
    const matches = (item: NavItem) => {
      const itemSuffix = item.path.replace('/tenants/$slug', '')
      if (!(itemSuffix ? suffix.startsWith(itemSuffix) : suffix === '')) return false
      if (item.search?.tab != null) return search?.tab === item.search.tab
      return true
    }
    const match = tenantNavItems(platformLevel).find(matches)
      ?? (!platformLevel ? ALL_NAV_ITEMS.find(matches) : undefined)
    // A sub-page names itself — 'Access', not the section's 'Settings'.
    const child = match?.children?.find(c => suffix.startsWith(`${match.path.replace('/tenants/$slug', '')}/${c.segment}`))
    const page = suffix.endsWith('/scan')
      ? 'The scan'
      : suffix.endsWith('/report')
        ? 'The report'
        : TENANT_PAGE_LABELS.find(item => suffix.startsWith(item.suffix))?.label
    // Page labels name the deeper routes first — the band nav's '/shows'
    // item would otherwise shadow 'Show'/'The scan'/'The report' with the
    // generic 'Shows' on every gig URL.
    // A nav sub-page's own name wins over the generic page labels —
    // /shows/booking is 'Get booked', not the '/shows/' gig page's 'Show'.
    return child?.label ?? page ?? match?.label ?? 'Overview'
  }
  return GLOBAL_NAV.find(item => item.exact ? pathname === item.path : pathname.startsWith(item.path))?.label ?? 'Overview'
}

/// The content section's two pages — the pipeline is the default view, real
/// material is the heavier list kept off the first paint.
export const CONTENT_TABS = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'material', label: 'Real material' },
]
