// Tenant-scoped nav, grouped by the operator's mental model:
//   CONTROL — what needs your attention right now (overview, incidents)
//   BRAIN — the deterministic autopilot's intelligence and learning
//   EXECUTION — live operations, integrations, and alert channels
//   AUDIENCE — who you're reaching and how (portfolio, fans, beacons, AREA)
export type NavItem = { path: string; label: string; exact: boolean; icon: string }
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
    ],
  },
  {
    label: 'How it is going',
    defaultOpen: false,
    items: [
      { path: '/tenants/$slug/intelligence', label: 'Intelligence', exact: false, icon: 'intelligence' },
      { path: '/tenants/$slug/health', label: 'Health', exact: false, icon: 'sliders' },
      { path: '/tenants/$slug/portfolio', label: 'Portfolio', exact: false, icon: 'portfolio' },
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
// child route added later.
const TENANT_NAV_ITEMS = TENANT_NAV_GROUPS.flatMap(group => group.items)
  .slice()
  .sort((a, b) => b.path.length - a.path.length)

// Pages that are deliberately not top-level destinations still need a name
// in the breadcrumb — the gig page is reached from the home screen and ⌘K,
// not the sidebar. Longest suffix first, same rule as the nav items.
const TENANT_PAGE_LABELS: Array<{ suffix: string; label: string }> = [
  { suffix: '/shows/', label: 'Show' },
  { suffix: '/shows', label: 'Shows' },
]

export const currentPageLabel = (pathname: string, slug: string | undefined) => {
  if (slug) {
    const base = `/tenants/${slug}`
    const suffix = pathname.slice(base.length)
    const match = TENANT_NAV_ITEMS.find(item => {
      const itemSuffix = item.path.replace('/tenants/$slug', '')
      return itemSuffix ? suffix.startsWith(itemSuffix) : suffix === ''
    })
    const page = suffix.endsWith('/scan')
      ? 'The scan'
      : TENANT_PAGE_LABELS.find(item => suffix.startsWith(item.suffix))?.label
    return match?.label ?? page ?? 'Overview'
  }
  return GLOBAL_NAV.find(item => item.exact ? pathname === item.path : pathname.startsWith(item.path))?.label ?? 'Overview'
}
