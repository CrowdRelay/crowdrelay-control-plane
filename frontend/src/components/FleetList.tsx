import { For, Show } from 'solid-js'
import type { CommandCenterTenantSummary, TenantSummary } from '../lib/types'
import { Act, Card, ItemRow } from './ui/dash'
import { Building2 } from 'lucide-solid'

// "Tenants, most urgent first" (mockup `console-mockups/platform-pages.html`):
// the tenants that stopped reporting, then the ones with people waiting, then
// the healthy rest. Shared by Overview and Tenants so both read the same.

type Row = TenantSummary & { cc?: CommandCenterTenantSummary }

const urgency = (row: Row) => {
  if (row.status === 'suspended') return 0
  if (row.cc && !row.cc.available) return 1
  if (row.runtimeHealth === 'unknown' || row.runtimeHealth === 'stale') return 2
  if ((row.cc?.attention.needsYou ?? 0) > 0) return 3
  if (row.runtimeHealth === 'degraded') return 4
  return 5
}

const pillFor = (row: Row): { tone: 'good' | 'warn' | 'bad' | 'muted' | 'accent'; text: string } => {
  if (row.status === 'suspended') return { tone: 'bad', text: 'suspended' }
  if (row.status === 'parked') return { tone: 'muted', text: 'parked' }
  if (row.cc && !row.cc.available) return { tone: 'warn', text: 'not reporting' }
  if (row.runtimeHealth === 'unknown' || row.runtimeHealth === 'stale') return { tone: 'warn', text: `runtime ${row.runtimeHealth}` }
  const waiting = row.cc?.attention.needsYou ?? 0
  if (waiting > 0) return { tone: 'accent', text: `${waiting} waiting` }
  if (row.runtimeHealth === 'degraded') return { tone: 'warn', text: 'degraded' }
  return { tone: 'good', text: 'healthy' }
}

const subFor = (row: Row) => {
  const m = row.cc?.momentum
  return [
    m?.northStarLatest != null ? `${m.northStarLatest.toLocaleString()} ${m.northStarDisplayName?.toLowerCase() ?? 'north star'}` : null,
    `${row.fanbaseSources.length} ${row.fanbaseSources.length === 1 ? 'source' : 'sources'}`,
    row.runtimeHealth !== 'healthy' ? `runtime ${row.runtimeHealth}` : null,
  ].filter(Boolean).join(' · ')
}

export function FleetList(props: { rows: Row[]; canCreate: boolean; limit?: number }) {
  const sorted = () => [...props.rows].sort((a, b) => urgency(a) - urgency(b) || a.displayName.localeCompare(b.displayName))
  return (
    <Card title="Tenants, most urgent first" icon={<Building2 />} class="mb-3">
      <Show when={sorted().length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">No tenants yet.</p>}>
        <For each={sorted().slice(0, props.limit ?? 50)}>{row => (
          <ItemRow
            pill={pillFor(row)}
            title={`${row.displayName} · ${row.archetype.replace('_', ' ')}`}
            sub={subFor(row)}
            action={<Act to="/tenants/$slug/operations" params={{ slug: row.slug }}>Open</Act>}
          />
        )}</For>
      </Show>
      <Show when={props.canCreate}>
        <div class="mt-3"><Act to="/tenants/new">+ New tenant</Act></div>
      </Show>
    </Card>
  )
}
