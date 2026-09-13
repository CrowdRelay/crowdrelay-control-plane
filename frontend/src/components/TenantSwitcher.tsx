import { Show, For, createSignal } from 'solid-js'
import { cn } from '../lib/cn'
import type { TenantSummary } from '../lib/types'

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

  return <div class="relative">
    <button type="button" class={cn('flex w-full items-center gap-2 rounded-md py-2 text-left text-sm hover:bg-surface-1 transition-colors', props.collapsed ? 'justify-center' : 'px-2')} onClick={() => props.onToggle()} title={current()?.displayName} aria-expanded={props.open} aria-haspopup="listbox" aria-label="Select tenant">
      <Show when={current()} fallback={<span class="w-2 h-2 rounded-full bg-muted-foreground flex-shrink-0" />}>
        {t => <span class={cn('w-2 h-2 rounded-full flex-shrink-0', dotClass[healthDot(t())])} />}
      </Show>
      <Show when={!props.collapsed}>
        <span class="flex-1 truncate font-medium text-foreground">{current()?.displayName ?? 'Select tenant'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class={cn('text-muted-foreground transition-transform', props.open && 'rotate-180')} aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
      </Show>
    </button>
    <Show when={props.open && !props.collapsed}>
      <div class="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-popover shadow-lg max-h-80 overflow-auto" role="listbox">
        <Show when={props.tenants.length > 5}>
          <input
            class="w-full border-b border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Filter tenants…"
            aria-label="Filter tenants"
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
            onClick={(e) => e.stopPropagation()}
            spellcheck={false}
          />
        </Show>
        <For each={filtered()}>{tenant => (
          <button
            type="button"
            class={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-1 transition-colors', tenant.slug === props.currentSlug && 'bg-surface-1')}
            onClick={() => { props.onClose(); props.onSelect(tenant.slug) }}
          >
            <span class={cn('w-2 h-2 rounded-full flex-shrink-0', dotClass[healthDot(tenant)])} />
            <span class="flex flex-col min-w-0">
              <strong class="truncate text-foreground">{tenant.displayName}</strong>
              <small class="text-xs text-muted-foreground">{tenant.slug} · {healthLabel(tenant)}</small>
            </span>
          </button>
        )}</For>
        <Show when={filtered().length === 0}>
          <div class="px-3 py-4 text-sm text-muted-foreground">No tenants match “{search()}”.</div>
        </Show>
      </div>
    </Show>
  </div>
}
