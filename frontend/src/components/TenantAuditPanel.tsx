import { For, Show, createSignal } from 'solid-js'
import { formatTimestamp } from '../lib/format'
import { ActivityHeatmap } from './ActivityHeatmap'
import { EmptyState } from './ui/empty-state'
import { SectionIcon } from './SectionIcon'
import { SectionTitle } from './layout'
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

  return <Card flat class="p-4">
    <SectionTitle
      title="Recent platform changes"
      icon={<SectionIcon name="history" />}
      action={<Show when={hasMore()}>
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(e => !e)}>
          {expanded() ? 'Show less' : `Show all (${props.items.length})`}
        </Button>
      </Show>}
    />
    <Show when={props.items.length > 0}>
      <ActivityHeatmap entries={props.items} timestampKey="createdAt" weeks={8} />
    </Show>
    <div class="grid gap-2 mt-4">
      <For each={visible()}>{item => <div class="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-border bg-card">
        <div class="min-w-0">
          <strong class="block text-sm text-foreground">{item.action}</strong>
          <small class="block text-xs text-muted-foreground mt-0.5">{item.actor} · {formatTimestamp(item.createdAt)}</small>
        </div>
        <code class="text-xs text-muted-foreground bg-surface-2 px-2 py-1 rounded-sm border border-border-subtle flex-shrink-0">{item.targetKind}</code>
      </div>}</For>
    </div>
    <Show when={props.items.length === 0}>
      <EmptyState label="No recent changes" hint="Platform-level configuration changes are audited here. This includes deploys, flag toggles, and policy updates." />
    </Show>
  </Card>
}
