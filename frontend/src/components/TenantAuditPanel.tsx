import { Show } from 'solid-js'
import { History } from 'lucide-solid'
import { formatTimestamp, humanizeToken } from '../lib/format'
import { ActivityHeatmap } from './ActivityHeatmap'
import { EmptyState } from './ui/empty-state'
import { SettingsSection } from './ui/settings'
import { DataTable, type ColumnDef } from './app/data-table'
import type { AuditEntry } from '../lib/types'

// Audit is a section of the tenant Overview read model, not its own request.
// The subpage refreshes the whole model on one tick, so these rows are patched
// in place rather than refetched separately.
const columns: ColumnDef<AuditEntry, any>[] = [
  { id: 'action', header: 'Change', accessorFn: a => humanizeToken(a.action), cell: c => <strong class="font-medium text-foreground">{humanizeToken(c.row.original.action)}</strong> },
  { id: 'target', header: 'On', accessorFn: a => humanizeToken(a.targetKind), cell: c => <span class="text-muted-foreground">{humanizeToken(c.row.original.targetKind)}</span> },
  { id: 'actor', header: 'By', accessorFn: a => a.actor },
  { id: 'when', header: 'When', accessorFn: a => a.createdAt, cell: c => <span class="text-muted-foreground">{formatTimestamp(c.row.original.createdAt)}</span> },
]

export function TenantAuditPanel(props: { items: AuditEntry[] }) {
  return <SettingsSection
    plain
    title="Recent platform changes"
    description="Deploys, status changes, flag toggles and policy updates made from the control plane."
  >
    <Show when={props.items.length > 0} fallback={
      <EmptyState icon={<History />} label="No recent changes" hint="Platform-level configuration changes are audited here. This includes deploys, flag toggles, and policy updates." />
    }>
      <ActivityHeatmap entries={props.items} timestampKey="createdAt" weeks={8} />
      <div class="mt-4">
        <DataTable
          data={props.items}
          columns={columns}
          initialSorting={[{ id: 'when', desc: true }]}
          searchText={a => [a.action, a.targetKind, a.actor].join(' ')}
          searchPlaceholder="Search changes or people"
          searchLabel="Search platform changes"
        />
      </div>
    </Show>
  </SettingsSection>
}
