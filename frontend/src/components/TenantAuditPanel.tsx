import { For, Show, createSignal } from 'solid-js'
import { formatTimestamp } from '../lib/format'
import { ActivityHeatmap } from './ActivityHeatmap'
import { EmptyState } from './ui/empty-state'
import { SectionIcon } from './SectionIcon'
import type { AuditEntry } from '../lib/types'
import { Card } from './ui/card'
import { Button } from './ui/button'

// Audit is a section of the tenant Overview read model, not its own request.
// The subpage refreshes the whole model on one tick, so these rows are patched
// in place rather than refetched separately.
export function TenantAuditPanel(props: { items: AuditEntry[] }) {
  const [expanded, setExpanded] = createSignal(false)
  const VISIBLE = 10
  const visible = () => expanded() ? props.items : props.items.slice(0, VISIBLE)
  const hasMore = () => props.items.length > VISIBLE

  return <Card class="p-4">
    <div class="flex items-center justify-between gap-4 mt-6 mb-3">
      <div><h2 class="text-lg font-semibold text-foreground flex items-center gap-2"><SectionIcon name="history" />Recent platform changes</h2></div>
      <Show when={hasMore()}>
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(e => !e)}>
          {expanded() ? 'Show less' : `Show all (${props.items.length})`}
        </Button>
      </Show>
    </div>
    <Show when={props.items.length > 0}>
      <ActivityHeatmap entries={props.items} timestampKey="createdAt" weeks={8} />
    </Show>
    <div class="audit-list">
      <For each={visible()}>{item => <div class="audit-row">
        <div><strong>{item.action}</strong><small>{item.actor} · {formatTimestamp(item.createdAt)}</small></div>
        <code>{item.targetKind}</code>
      </div>}</For>
    </div>
    <Show when={props.items.length === 0}>
      <EmptyState label="No recent changes" hint="Platform-level configuration changes are audited here. This includes deploys, flag toggles, and policy updates." />
    </Show>
  </Card>
}
