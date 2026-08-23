import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'

const formatTimestamp = (value: string) => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString()
}

export function TenantAuditPanel(props: { slug: string }) {
  // Audit is telemetry, so its 15s tick belongs to this panel and not to the
  // tenant page. `reconcile` keeps the existing rows and patches only the
  // fields that actually changed; without it every poll replaced the whole
  // list and rebuilt its DOM.
  const audit = useQuery(() => ({
    queryKey: ['tenant-audit', props.slug],
    queryFn: () => api.audit(props.slug),
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    reconcile: 'id',
  }))

  return <article class="panel">
    <span class="eyebrow">AUDIT</span><h2>Recent platform changes</h2>
    <Show when={audit.error}><div class="inline-stale-note" role="status">Live refresh failed. Showing the last known audit entries.</div></Show>
    <Show when={audit.data} fallback={!audit.error ? <div class="mini-skeleton"/> : null}>{data => <div class="audit-list">
      <For each={data().items}>{item => <div class="audit-row">
        <div><strong>{item.action}</strong><small>{item.actor} · {formatTimestamp(item.createdAt)}</small></div>
        <code>{item.targetKind}</code>
      </div>}</For>
    </div>}</Show>
  </article>
}
