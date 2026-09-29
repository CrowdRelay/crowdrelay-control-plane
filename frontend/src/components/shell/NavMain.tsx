import { For, Show, createEffect, createSignal, onCleanup, type JSX } from 'solid-js'
import { Link, useMatchRoute, useNavigate } from '@tanstack/solid-router'
import { ChevronRight } from 'lucide-solid'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
import {
  SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuAction, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, useSidebar,
} from '~/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { NavIcon } from '../NavIcon'
import type { NavGroup, NavItem } from '~/lib/nav'

/**
 * The sidebar's link list — sidebar-07's `NavMain`, fed by `lib/nav`.
 *
 * Each nav group is a sidebar group, always open — groups never fold, so
 * every destination is one glance away. A section with sub-pages (an item
 * with `children`) opens them in a flyout on hover.
 */

// TanStack's Link marks the current route `data-status="active"`; the stock
// menu button styles `data-active`. Same look, keyed on the router's answer.
const ACTIVE = 'data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-sidebar-accent-foreground data-[status=active]:[&>svg]:stroke-2'

/**
 * One link. The stock `tooltip` prop wraps the button in a `TooltipTrigger`
 * `<button>`, which would put this `<a>` inside a button; here the trigger
 * renders *as* the menu button instead, so the link stays a single element.
 *
 * An item with `children` is a section: the link still lands on its
 * overview, and its sub-pages open in a flyout beside it on hover — see
 * `NavSubPages`. On a phone there is no hover, so they list inline instead.
 */
export function NavLink(props: {
  item: NavItem
  params?: Record<string, string>
  badge?: number
}) {
  const { state, isMobile } = useSidebar()
  const hasPages = () => (props.item.children?.length ?? 0) > 0
  const button = (extra: JSX.HTMLAttributes<HTMLAnchorElement> = {}) => (
    <SidebarMenuButton
      {...extra}
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
  )
  const item = (
    <>
      <Show when={(props.badge ?? 0) > 0}>
        {/* The flyout chevron takes the badge's corner while the row is
            hovered or focused. */}
        <SidebarMenuBadge class={hasPages() && !isMobile() ? 'group-hover/menu-item:opacity-0 group-focus-within/menu-item:opacity-0' : undefined}>{props.badge}</SidebarMenuBadge>
      </Show>
      <Show when={hasPages() && isMobile()}>
        <NavSubPagesInline item={props.item} params={props.params} />
      </Show>
    </>
  )
  return (
    <Show
      when={hasPages() && !isMobile()}
      fallback={
        <SidebarMenuItem>
          <Tooltip placement="right" openDelay={0}>
            <TooltipTrigger as={(trigger: JSX.HTMLAttributes<HTMLAnchorElement>) => button(trigger)} />
            <TooltipContent hidden={state() !== 'collapsed' || isMobile()}>{props.item.label}</TooltipContent>
          </Tooltip>
          {item}
        </SidebarMenuItem>
      }
    >
      <NavSubPages item={props.item} params={props.params} link={button()}>{item}</NavSubPages>
    </Show>
  )
}

const HOVER_OPEN_MS = 120
const HOVER_CLOSE_MS = 180

/**
 * A section's sub-pages as a flyout beside the sidebar — the account menu's
 * dropdown, opened by hover rather than a click. Hovering the row (or the
 * icon in the collapsed rail) opens it; leaving both the row and the menu
 * closes it after a beat, so the pointer can cross the gap. The chevron is
 * the keyboard's way in: it appears on hover and focus, and opens the same
 * menu with arrow-key navigation. The menu is non-modal so the rest of the
 * sidebar stays live while it is open.
 */
function NavSubPages(props: { item: NavItem; params?: Record<string, string>; link: JSX.Element; children: JSX.Element }) {
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const [open, setOpen] = createSignal(false)
  // Hover opens without taking focus; the chevron's own open moves focus
  // into the menu the way a keyboard user expects.
  const [byHover, setByHover] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (next: boolean, ms: number) => {
    clearTimeout(timer)
    timer = setTimeout(() => { setByHover(next); setOpen(next) }, ms)
  }
  onCleanup(() => clearTimeout(timer))
  // The menu hangs off the whole row, not the small chevron that triggers
  // it, so it clears the sidebar's edge instead of overlapping it.
  let row: HTMLLIElement | undefined
  const enter = (e: PointerEvent) => { if (e.pointerType !== 'touch') schedule(true, HOVER_OPEN_MS) }
  const leave = (e: PointerEvent) => { if (e.pointerType !== 'touch') schedule(false, HOVER_CLOSE_MS) }
  // `matchRoute` hands back an accessor, built once per page here.
  const pages = [{ to: props.item.path, label: 'Overview', exact: true }, ...(props.item.children ?? []).map(c => ({ to: `${props.item.path}/${c.segment}`, label: c.label, exact: false }))]
    .map(page => ({ ...page, current: matchRoute({ to: page.to as any, params: props.params as any, fuzzy: !page.exact }) }))
  return (
    <SidebarMenuItem ref={row} onPointerEnter={enter} onPointerLeave={leave}>
      {props.link}
      <DropdownMenu
        open={open()}
        // A hover-open is echoed back as open — only a real change (the
        // chevron, Escape, a pick) resets it to a keyboard open.
        onOpenChange={next => { if (next === open()) return; clearTimeout(timer); setByHover(false); setOpen(next) }}
        modal={false}
        placement="right-start"
        gutter={12}
        getAnchorRect={() => row?.getBoundingClientRect()}
      >
        <SidebarMenuAction
          as={DropdownMenuTrigger}
          showOnHover
          aria-label={`${props.item.label} pages`}
          class="data-[expanded]:bg-sidebar-accent"
        >
          <ChevronRight />
        </SidebarMenuAction>
        <DropdownMenuContent
          class="min-w-52 rounded-lg"
          onPointerEnter={enter}
          onPointerLeave={leave}
          // Kobalte focuses a controlled menu's container on open, and
          // `onOpenAutoFocus` does not reach that path — so a hover-open
          // would pull focus out of whatever field the operator is typing in.
          // The container skips focusing itself while hover opened it; items
          // still take focus as the pointer or arrow keys move over them.
          ref={(el: HTMLElement) => {
            const focus = el.focus.bind(el)
            el.focus = (options?: FocusOptions) => { if (!byHover()) focus(options) }
          }}
          onCloseAutoFocus={(e: Event) => { if (byHover()) e.preventDefault() }}
        >
          <DropdownMenuLabel class="text-xs font-medium text-muted-foreground">{props.item.label}</DropdownMenuLabel>
          <For each={pages}>{page => (
            <DropdownMenuItem
              onSelect={() => void navigate({ to: page.to as any, params: props.params as any })}
              class={page.current() ? 'bg-accent font-medium text-accent-foreground' : undefined}
              aria-current={page.current() ? 'page' : undefined}
            >
              {page.label}
            </DropdownMenuItem>
          )}</For>
        </DropdownMenuContent>
      </DropdownMenu>
      {props.children}
    </SidebarMenuItem>
  )
}

/**
 * The phone's version: no hover, so the sub-pages list under the link,
 * sidebar-07 style, unfolding when you land in the section.
 */
function NavSubPagesInline(props: { item: NavItem; params?: Record<string, string> }) {
  const matchRoute = useMatchRoute()
  const inSection = matchRoute({ to: props.item.path as any, params: props.params as any, fuzzy: true })
  const [open, setOpen] = createSignal(Boolean(inSection()))
  createEffect(() => { if (inSection()) setOpen(true) })
  return (
    <Collapsible open={open()} onOpenChange={setOpen} class="group/collapsible">
      <SidebarMenuAction
        as={CollapsibleTrigger}
        class="data-[expanded]:rotate-90"
        aria-label={`${open() ? 'Hide' : 'Show'} ${props.item.label} pages`}
      >
        <ChevronRight />
      </SidebarMenuAction>
      <CollapsibleContent>
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
      </CollapsibleContent>
    </Collapsible>
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
