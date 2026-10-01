import { For, Show, type JSX } from 'solid-js'
import { Link, useMatchRoute } from '@tanstack/solid-router'
import {
  SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, useSidebar,
} from '~/components/ui/sidebar'
import { cn } from '~/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { NavIcon } from '../NavIcon'
import type { NavGroup, NavItem } from '~/lib/nav'

/**
 * The sidebar's link list — sidebar-07's `NavMain`, fed by `lib/nav`.
 *
 * Each nav group is a sidebar group, always open — groups never fold, so
 * every destination is one glance away. A section with sub-pages (an item
 * with `children`) lands on its overview; once you are in the section its
 * sub-pages list under it, indented, and fold away again when you leave.
 * No flyout and no chevron: the sidebar shows where you are and where you
 * can go next, without a menu to open.
 */

// TanStack's Link marks the current route `data-status="active"`; the stock
// menu button styles `data-active`. Same look, keyed on the router's answer.
const ACTIVE = 'data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-sidebar-accent-foreground data-[status=active]:[&>svg]:stroke-2'

/**
 * One link. The stock `tooltip` prop wraps the button in a `TooltipTrigger`
 * `<button>`, which would put this `<a>` inside a button; here the trigger
 * renders *as* the menu button instead, so the link stays a single element.
 */
export function NavLink(props: {
  item: NavItem
  params?: Record<string, string>
  badge?: number
}) {
  const { state, isMobile } = useSidebar()
  const matchRoute = useMatchRoute()
  const hasPages = () => (props.item.children?.length ?? 0) > 0
  const inSection = matchRoute({ to: props.item.path as any, params: props.params as any, fuzzy: true })
  // A section's own row is lit on its overview only; on a sub-page the
  // sub-page is the lit row and the section reads as its heading.
  const exact = () => props.item.exact || hasPages()
  return (
    <SidebarMenuItem>
      <Tooltip placement="right" openDelay={0}>
        <TooltipTrigger
          as={(trigger: JSX.HTMLAttributes<HTMLAnchorElement>) => (
            <SidebarMenuButton
              {...trigger}
              as={Link}
              to={props.item.path as any}
              params={props.params as any}
              search={props.item.search as any}
              activeOptions={{ exact: exact() }}
              class={cn(ACTIVE, hasPages() && inSection() && 'font-medium')}
            >
              <NavIcon name={props.item.icon} />
              <span>{props.item.label}</span>
            </SidebarMenuButton>
          )}
        />
        <TooltipContent hidden={state() !== 'collapsed' || isMobile()}>{props.item.label}</TooltipContent>
      </Tooltip>
      {/* A quiet count pill — it says "there is something here" without
          shouting a three-digit number at every glance. Capped at 99+. */}
      <Show when={(props.badge ?? 0) > 0}>
        <SidebarMenuBadge
          class="rounded-full bg-sidebar-accent px-1.5 font-normal text-muted-foreground peer-hover/menu-button:text-muted-foreground"
          aria-label={`${props.badge} waiting`}
        >
          {props.badge! > 99 ? '99+' : props.badge}
        </SidebarMenuBadge>
      </Show>
      <Show when={hasPages() && inSection()}>
        <SidebarMenuSub>
          <For each={props.item.children ?? []}>{child => (
            <SidebarMenuSubItem>
              <SidebarMenuSubButton
                as={Link}
                to={`${props.item.path}/${child.segment}` as any}
                params={props.params as any}
                class={ACTIVE}
                title={child.label}
              >
                <span>{child.label}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          )}</For>
        </SidebarMenuSub>
      </Show>
    </SidebarMenuItem>
  )
}

export function NavMain(props: {
  groups: NavGroup[]
  slug: string
  badgeFor?: (item: NavItem) => number
}) {
  return (
    <For each={props.groups}>{group => (
      <SidebarGroup>
        <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
        <SidebarMenu>
          <For each={group.items}>{item => <NavLink item={item} params={{ slug: props.slug }} badge={props.badgeFor?.(item)} />}</For>
        </SidebarMenu>
      </SidebarGroup>
    )}</For>
  )
}
