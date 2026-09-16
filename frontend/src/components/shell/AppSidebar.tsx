import { Show } from 'solid-js'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarRail,
} from '~/components/ui/sidebar'
import { TenantBadge, TenantSwitcher } from '../TenantSwitcher'
import { NavLink, NavMain } from './NavMain'
import { NavUser } from './NavUser'
import { GLOBAL_NAV, type NavGroup, type NavItem } from '~/lib/nav'
import type { TenantSummary } from '~/lib/types'

/** The console's sidebar, laid out as shadcn sidebar-07. */
export function AppSidebar(props: {
  platformLevel: boolean
  canCreateTenant: boolean
  tenants: TenantSummary[] | undefined
  navSlug: string | undefined
  ownTenantSlug: string | undefined
  groups: NavGroup[]
  isOpen: (group: NavGroup) => boolean
  onToggle: (group: NavGroup) => void
  onSelectTenant: (slug: string) => void
  badgeFor: (item: NavItem) => number
  user: { name: string; role: string }
  onLogout: () => void
}) {
  // `New tenant` is the Tenants page's action, reached from the switcher.
  const platformItems = GLOBAL_NAV.filter(item => item.path !== '/tenants/new')
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Show
          when={props.platformLevel}
          fallback={<Show when={props.ownTenantSlug}>{slug => <TenantBadge slug={slug()} />}</Show>}
        >
          <TenantSwitcher
            tenants={props.tenants ?? []}
            currentSlug={props.navSlug}
            onSelect={props.onSelectTenant}
            canCreate={props.canCreateTenant}
          />
        </Show>
      </SidebarHeader>
      <SidebarContent>
        <Show when={props.platformLevel}>
          <SidebarGroup>
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
            <SidebarMenu>
              {platformItems.map(item => <NavLink item={item} />)}
            </SidebarMenu>
          </SidebarGroup>
        </Show>
        <Show when={props.navSlug}>
          {slug => (
            <NavMain
              groups={props.groups}
              slug={slug()}
              isOpen={props.isOpen}
              onToggle={props.onToggle}
              badgeFor={props.badgeFor}
            />
          )}
        </Show>
      </SidebarContent>
      <SidebarFooter>
        <NavUser name={props.user.name} role={props.user.role} onLogout={props.onLogout} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
