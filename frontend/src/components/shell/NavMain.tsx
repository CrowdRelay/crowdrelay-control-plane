import { For, Show, type JSX } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import { ChevronRight } from 'lucide-solid'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible'
import {
  SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '~/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { NavIcon } from '../NavIcon'
import type { NavGroup, NavItem } from '~/lib/nav'

/**
 * The sidebar's link list — sidebar-07's `NavMain`, fed by `lib/nav`.
 *
 * sidebar-07 folds sub-items under a parent. The console's items have no
 * parents, so each nav group is a sidebar group instead, and a group whose
 * `defaultOpen` is false folds under its label. In icon mode every group is
 * shown: a folded group of invisible labels would hide the links themselves.
 */

// TanStack's Link marks the current route `data-status="active"`; the stock
// menu button styles `data-active`. Same look, keyed on the router's answer.
const ACTIVE = 'data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-sidebar-accent-foreground'

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
              activeOptions={{ exact: props.item.exact }}
              class={ACTIVE}
            >
              <NavIcon name={props.item.icon} />
              <span>{props.item.label}</span>
            </SidebarMenuButton>
          )}
        />
        <TooltipContent hidden={state() !== 'collapsed' || isMobile()}>{props.item.label}</TooltipContent>
      </Tooltip>
      <Show when={(props.badge ?? 0) > 0}>
        <SidebarMenuBadge>{props.badge}</SidebarMenuBadge>
      </Show>
    </SidebarMenuItem>
  )
}

export function NavMain(props: {
  groups: NavGroup[]
  slug: string
  isOpen: (group: NavGroup) => boolean
  onToggle: (group: NavGroup) => void
  badgeFor?: (item: NavItem) => number
}) {
  const { state } = useSidebar()
  return (
    <For each={props.groups}>{group => (
      <Show
        when={!group.defaultOpen}
        fallback={
          <SidebarGroup>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              <For each={group.items}>{item => <NavLink item={item} params={{ slug: props.slug }} badge={props.badgeFor?.(item)} />}</For>
            </SidebarMenu>
          </SidebarGroup>
        }
      >
        <Collapsible
          open={props.isOpen(group) || state() === 'collapsed'}
          onOpenChange={() => props.onToggle(group)}
          class="group/collapsible"
        >
          <SidebarGroup>
            <SidebarGroupLabel
              as={CollapsibleTrigger}
              class="w-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              {group.label}
              <ChevronRight class="ml-auto transition-transform duration-200 group-data-[expanded]/collapsible:rotate-90" />
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarMenu>
                <For each={group.items}>{item => <NavLink item={item} params={{ slug: props.slug }} badge={props.badgeFor?.(item)} />}</For>
              </SidebarMenu>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </Show>
    )}</For>
  )
}
