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
        {/* The chevron owns the right corner on a section with sub-pages,
            so the count sits just left of it. */}
        <SidebarMenuBadge class={hasPages() ? 'right-7' : undefined}>{props.badge}</SidebarMenuBadge>
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

const HOVER_OPEN_MS = 250
const HOVER_CLOSE_MS = 300

/**
 * A section's sub-pages as a flyout beside the sidebar — the account menu's
 * dropdown, opened by the always-visible `>` rather than by hovering
 * anywhere on the row. The `>` opens on click (or focus + Enter/Arrows);
 * row hover can keep an open flyout alive but never opens one, so a pointer
 * sweeping down the list never pops a menu it was only crossing, and a
 * trigger hover can't race the click that toggles it. Leaving the chevron,
 * row and menu closes it after a beat, so the pointer can cross the gaps
 * between them. The collapsed icon rail has no `>` — there the row keeps
 * the hover-open, on a slower fuse. The menu is non-modal so the rest of
 * the sidebar stays live while it is open.
 */
function NavSubPages(props: { item: NavItem; params?: Record<string, string>; link: JSX.Element; children: JSX.Element }) {
  const { state } = useSidebar()
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
  // An already-open menu is only *kept* — cancelling the close must not mark
  // it hover-opened, or a keyboard open that a pointer merely crossed would
  // lose its focus-restore on close.
  const enter = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (open()) { clearTimeout(timer); return }
    schedule(true, HOVER_OPEN_MS)
  }
  const leave = (e: PointerEvent) => { if (e.pointerType !== 'touch') schedule(false, HOVER_CLOSE_MS) }
  // Icon rail: the `>` is hidden, so the row itself is the hover target.
  // Expanded, the row can only *keep* a menu the `>` opened — it can never
  // open one (the pointer reaching back to the row is not a dismiss).
  const rowEnter = (e: PointerEvent) => { if (state() === 'collapsed' || open()) enter(e) }
  const rowLeave = (e: PointerEvent) => { if (state() === 'collapsed' || open()) leave(e) }
  // `matchRoute` hands back an accessor, built once per page here.
  const pages = [{ to: props.item.path, label: 'Overview', exact: true }, ...(props.item.children ?? []).map(c => ({ to: `${props.item.path}/${c.segment}`, label: c.label, exact: false }))]
    .map(page => ({ ...page, current: matchRoute({ to: page.to as any, params: props.params as any, fuzzy: !page.exact }) }))
  return (
    <SidebarMenuItem ref={row} onPointerEnter={rowEnter} onPointerLeave={rowLeave}>
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
          // Reaching the `>` of an open flyout is not a dismiss — cancel a
          // pending close without opening anything (never hover-open: the
          // trigger's own click would toggle it shut mid-flight).
          onPointerEnter={() => clearTimeout(timer)}
          onPointerLeave={leave}
          aria-label={`${props.item.label} pages`}
          class="aria-expanded:bg-sidebar-accent"
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
