import { Show, For, createSignal, type JSX } from 'solid-js'
import { cn } from '../lib/cn'
import type { TenantSummary } from '../lib/types'
import { Popover, PopoverAnchor, PopoverContent } from './ui/popover'
import { ScrollArea } from './ui/scroll-area'
import { Button } from './ui/button'
import { Input } from './ui/input'

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

const dotClass = { good: 'bg-success', warn: 'bg-warning', bad: 'bg-destructive', muted: 'bg-muted-foreground' } as const

/**
 * Tenant picker built on the Kobalte-backed Popover primitive.
 *
 * The previous hand-rolled dropdown had `role="listbox"` on a div of plain
 * buttons and none of what the role promises: no Escape close, no outside
 * dismiss (Shell approximated it with a document click listener), no focus
 * on open and no arrow-key movement. The primitive supplies all of that;
 * the rows stay real buttons, so Enter/Space activates without extra wiring.
 *
 * Open state still lives in the parent (`open`/`onToggle`/`onClose`) because
 * the sidebar collapse shares it — the button is a PopoverAnchor, not a
 * PopoverTrigger, so Kobalte never drives the parent's state twice.
 */
export function TenantSwitcher(props: {
  tenants: TenantSummary[]
  currentSlug: string | undefined
  onSelect: (slug: string) => void
  open: boolean
  onToggle: () => void
  onClose: () => void
  collapsed: boolean
}) {
  const [search, setSearch] = createSignal('')
  const current = () => props.tenants.find(t => t.slug === props.currentSlug)
  const sorted = () => [...props.tenants].sort((a, b) => a.displayName.localeCompare(b.displayName))
  const filtered = () => {
    const q = search().trim().toLowerCase()
    if (!q) return sorted()
    return sorted().filter(t => t.displayName.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q))
  }

  // Arrow keys move focus between the tenant buttons; the list lives inside
  // PopoverContent so Tab order is contained and Escape closes via Kobalte.
  const onListKeyDown: JSX.EventHandler<HTMLElement, KeyboardEvent> = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-tenant-item]'))
    if (items.length === 0) return
    event.preventDefault()
    const active = document.activeElement as HTMLElement | null
    const index = active ? items.indexOf(active) : -1
    const next = event.key === 'ArrowDown'
      ? (index + 1) % items.length
      : (index - 1 + items.length) % items.length
    items[next]?.focus()
  }

  return <Popover
    open={props.open && !props.collapsed}
    onOpenChange={(open) => { if (!open) props.onClose() }}
    placement="bottom-start"
    gutter={4}
    sameWidth
  >
    <PopoverAnchor>
      <Button type="button" variant="ghost" class={cn('h-auto w-full justify-start gap-2 whitespace-normal rounded-md py-2 text-left text-sm font-normal', props.collapsed ? 'justify-center px-0' : 'px-2')} onClick={() => props.onToggle()} title={current()?.displayName} aria-expanded={props.open} aria-haspopup="dialog" aria-label="Select tenant">
        <Show when={current()} fallback={<span class="w-2 h-2 rounded-full bg-muted-foreground flex-shrink-0" />}>
          {t => <span class={cn('w-2 h-2 rounded-full flex-shrink-0', dotClass[healthDot(t())])} />}
        </Show>
        <Show when={!props.collapsed}>
          <span class="flex-1 truncate font-medium text-foreground">{current()?.displayName ?? 'Select tenant'}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class={cn('text-muted-foreground transition-transform', props.open && 'rotate-180')} aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </Show>
      </Button>
    </PopoverAnchor>
    <PopoverContent showClose={false} class="w-[var(--kb-popper-anchor-width)] min-w-56 rounded-md border-border bg-popover p-0 shadow-lg">
      <Show when={props.tenants.length > 5}>
        <Input
          class="h-auto w-full rounded-none border-0 border-b bg-transparent px-3 py-2 focus-visible:ring-0 focus-visible:ring-offset-0"
          placeholder="Filter tenants…"
          aria-label="Filter tenants"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          onKeyDown={onListKeyDown}
          spellcheck={false}
        />
      </Show>
      <ScrollArea class="max-h-80">
        <div role="group" aria-label="Tenants" onKeyDown={onListKeyDown}>
          <For each={filtered()}>{tenant => (
            <Button
              type="button"
              variant="ghost"
              data-tenant-item
              aria-current={tenant.slug === props.currentSlug ? 'true' : undefined}
              class={cn('h-auto w-full justify-start gap-2 whitespace-normal px-3 py-2 text-left text-sm font-normal', tenant.slug === props.currentSlug && 'bg-surface-1')}
              onClick={() => { props.onClose(); props.onSelect(tenant.slug) }}
            >
              <span class={cn('w-2 h-2 rounded-full flex-shrink-0', dotClass[healthDot(tenant)])} />
              <span class="flex flex-col min-w-0">
                <strong class="truncate text-foreground">{tenant.displayName}</strong>
                <small class="text-xs text-muted-foreground">{tenant.slug} · {healthLabel(tenant)}</small>
              </span>
            </Button>
          )}</For>
          <Show when={filtered().length === 0}>
            <div class="px-3 py-4 text-sm text-muted-foreground">No tenants match “{search()}”.</div>
          </Show>
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
}
