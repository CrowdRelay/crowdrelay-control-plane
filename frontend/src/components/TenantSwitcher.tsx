import { For, Show } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import { ChevronsUpDown, LayoutGrid, Plus } from 'lucide-solid'
import { cn } from '../lib/cn'
import type { TenantSummary } from '../lib/types'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from './ui/sidebar'

const healthDot = (tenant: TenantSummary) => {
  if (tenant.status === 'suspended') return 'bad'
  if (tenant.status === 'parked') return 'warn'
  if (tenant.runtimeHealth === 'healthy') return 'good'
  if (tenant.runtimeHealth === 'degraded') return 'warn'
  if (tenant.runtimeHealth === 'stale') return 'warn'
  return 'muted'
}

const healthLabel = (tenant: TenantSummary) => {
  if (tenant.status === 'suspended') return 'suspended'
  if (tenant.status === 'parked') return 'parked'
  if (tenant.runtimeHealth === 'healthy') return 'healthy'
  if (tenant.runtimeHealth === 'degraded') return 'degraded'
  if (tenant.runtimeHealth === 'stale') return 'stopped reporting'
  return 'not reporting'
}

const dotClass = { good: 'bg-success-foreground', warn: 'bg-warning-foreground', bad: 'bg-destructive', muted: 'bg-muted-foreground' } as const

/** A tenant's mark: its initial on the sidebar primary, health as a corner dot. */
function TenantMark(props: { tenant?: TenantSummary; name: string; small?: boolean }) {
  return (
    <div class={cn(
      'relative flex aspect-square shrink-0 items-center justify-center font-semibold',
      props.small ? 'size-6 rounded-md border text-xs' : 'size-8 rounded-lg bg-sidebar-primary text-sm text-sidebar-primary-foreground',
    )}>
      {props.name.slice(0, 1).toUpperCase()}
      <Show when={props.tenant}>
        {t => <span class={cn('absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-sidebar', dotClass[healthDot(t())])} />}
      </Show>
    </div>
  )
}

/**
 * Tenant picker — sidebar-07's team switcher. Platform users choose among
 * tenants (typeahead: start typing a name with the menu open); a tenant
 * operator sees their own tenant, not a menu.
 */
export function TenantSwitcher(props: {
  tenants: TenantSummary[]
  currentSlug: string | undefined
  onSelect: (slug: string) => void
  canCreate: boolean
}) {
  const { isMobile } = useSidebar()
  const current = () => props.tenants.find(t => t.slug === props.currentSlug)
  const sorted = () => [...props.tenants].sort((a, b) => a.displayName.localeCompare(b.displayName))
  const name = () => current()?.displayName ?? props.currentSlug ?? 'Select tenant'

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu placement={isMobile() ? 'bottom' : 'right-start'}>
          <DropdownMenuTrigger
            as={SidebarMenuButton}
            size="lg"
            aria-label="Select tenant"
            class="data-[expanded]:bg-sidebar-accent data-[expanded]:text-sidebar-accent-foreground"
          >
            <TenantMark tenant={current()} name={name()} />
            <div class="grid flex-1 text-left text-sm leading-tight">
              <span class="truncate font-medium">{name()}</span>
              <span class="truncate text-xs">{current() ? healthLabel(current()!) : 'CrowdRelay Control Plane'}</span>
            </div>
            <ChevronsUpDown class="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent class="min-w-56 rounded-lg">
            <DropdownMenuLabel class="text-xs font-normal text-muted-foreground">Tenants</DropdownMenuLabel>
            <For each={sorted()}>{tenant => (
              <DropdownMenuItem
                onSelect={() => props.onSelect(tenant.slug)}
                textValue={tenant.displayName}
                class={cn('gap-2 p-2', tenant.slug === props.currentSlug && 'bg-accent')}
              >
                <TenantMark tenant={tenant} name={tenant.displayName} small />
                <span class="flex min-w-0 flex-col">
                  <span class="truncate">{tenant.displayName}</span>
                  <span class="truncate text-xs text-muted-foreground">{tenant.slug} · {healthLabel(tenant)}</span>
                </span>
              </DropdownMenuItem>
            )}</For>
            <DropdownMenuSeparator />
            <DropdownMenuItem as={Link} to="/tenants" class="gap-2 p-2">
              <div class="flex size-6 items-center justify-center rounded-md border bg-transparent">
                <LayoutGrid class="size-4" />
              </div>
              <div class="font-medium text-muted-foreground">All tenants</div>
            </DropdownMenuItem>
            <Show when={props.canCreate}>
              <DropdownMenuItem as={Link} to="/tenants/new" class="gap-2 p-2">
                <div class="flex size-6 items-center justify-center rounded-md border bg-transparent">
                  <Plus class="size-4" />
                </div>
                <div class="font-medium text-muted-foreground">New tenant</div>
              </DropdownMenuItem>
            </Show>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/** A tenant operator's header: their tenant, no menu. */
export function TenantBadge(props: { slug: string }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" as="div" class="hover:bg-transparent">
          <TenantMark name={props.slug} />
          <div class="grid flex-1 text-left text-sm leading-tight">
            <span class="truncate font-medium">{props.slug}</span>
            <span class="truncate text-xs">CrowdRelay Control Plane</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
