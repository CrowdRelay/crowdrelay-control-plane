import { For, Show, createSignal } from 'solid-js'
import { History } from 'lucide-solid'
import { formatTimestamp, humanizeToken } from '../lib/format'
import { ActivityHeatmap } from './ActivityHeatmap'
import { EmptyState } from './ui/empty-state'
import { SectionIcon } from './SectionIcon'
import { Section } from './layout'
import type { AuditEntry } from '../lib/types'
import { Button } from './app/button'

// Audit is a section of the tenant Overview read model, not its own request.
// The subpage refreshes the whole model on one tick, so these rows are patched
// in place rather than refetched separately.
export function TenantAuditPanel(props: { items: AuditEntry[] }) {
  const [expanded, setExpanded] = createSignal(false)
  const VISIBLE = 10
  const visible = () => expanded() ? props.items : props.items.slice(0, VISIBLE)
  const hasMore = () => props.items.length > VISIBLE

  return <Section
    title="Recent platform changes"
    icon={<SectionIcon name="history" />}
    count={props.items.length}
    description="Deploys, status changes, flag toggles and policy updates made from the control plane."
    action={<Show when={hasMore()}>
      <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(e => !e)}>
        {expanded() ? 'Show fewer' : `Show all ${props.items.length}`}
      </Button>
    </Show>}
  >
    <Show when={props.items.length > 0}>
      <ActivityHeatmap entries={props.items} timestampKey="createdAt" weeks={8} />
    </Show>
    <Show when={props.items.length > 0}>
    <ul class="mt-4 divide-y divide-border rounded-lg border border-border">
      <For each={visible()}>{item => <li class="flex items-center justify-between gap-3 px-4 py-2.5">
        <div class="min-w-0">
          <strong class="block text-sm text-foreground">{humanizeToken(item.action)}</strong>
          <small class="block text-xs text-muted-foreground mt-0.5">{item.actor} · {formatTimestamp(item.createdAt)}</small>
        </div>
        <span class="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-sm flex-shrink-0">{humanizeToken(item.targetKind)}</span>
      </li>}</For>
    </ul>
    </Show>
    <Show when={props.items.length === 0}>
      <EmptyState icon={<History />} label="No recent changes" hint="Platform-level configuration changes are audited here. This includes deploys, flag toggles, and policy updates." />
    </Show>
  </Section>
}
