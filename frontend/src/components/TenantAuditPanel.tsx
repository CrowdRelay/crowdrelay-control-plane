import { For, Show, createSignal } from 'solid-js'
import { formatTimestamp } from '../lib/format'
import { ActivityHeatmap } from './ActivityHeatmap'
import { EmptyState } from './EmptyState'
import { SectionIcon } from './SectionIcon'
import type { AuditEntry } from '../lib/types'

// Audit is a section of the tenant Overview read model, not its own request.
// The subpage refreshes the whole model on one tick, so these rows are patched
// in place rather than refetched separately.
export function TenantAuditPanel(props: { items: AuditEntry[] }) {
  const [expanded, setExpanded] = createSignal(false)
  const VISIBLE = 10
  const visible = () => expanded() ? props.items : props.items.slice(0, VISIBLE)
  const hasMore = () => props.items.length > VISIBLE

  return <article class="panel">
    <div class="section-title">
      <div><span class="eyebrow">AUDIT</span><h2><SectionIcon name="history" />Recent platform changes</h2></div>
      <Show when={hasMore()}>
        <button type="button" class="ghost" onClick={() => setExpanded(e => !e)}>
          {expanded() ? 'Show less' : `Show all (${props.items.length})`}
        </button>
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
  </article>
}
