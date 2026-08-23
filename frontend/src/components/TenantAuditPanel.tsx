import { For } from 'solid-js'
import type { AuditEntry } from '../lib/types'

const formatTimestamp = (value: string) => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString()
}

// Audit is a section of the tenant Overview read model, not its own request.
// The subpage refreshes the whole model on one tick, so these rows are patched
// in place rather than refetched separately.
export function TenantAuditPanel(props: { items: AuditEntry[] }) {
  return <article class="panel">
    <span class="eyebrow">AUDIT</span><h2>Recent platform changes</h2>
    <div class="audit-list">
      <For each={props.items}>{item => <div class="audit-row">
        <div><strong>{item.action}</strong><small>{item.actor} · {formatTimestamp(item.createdAt)}</small></div>
        <code>{item.targetKind}</code>
      </div>}</For>
    </div>
  </article>
}
