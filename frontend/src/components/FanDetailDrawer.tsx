import { For, Show } from 'solid-js'
import type { FanDetail, FanJourneyEntry } from '../lib/types'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { Dialog } from './Dialog'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

const formatDateTime = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

const journeyKindLabel = (kind: string) =>
  kind.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const detailToString = (detail: unknown): string => {
  if (detail == null) return ''
  if (typeof detail === 'string') return detail
  try {
    return JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}

export function FanDetailDrawer(props: {
  fan: FanDetail | null
  journey: FanJourneyEntry[]
  loading: boolean
  error: string | null
  onClose: () => void
}) {
  return <Dialog
    open={props.fan !== null}
    onClose={props.onClose}
    label={`Fan detail: ${props.fan?.fan.display_name ?? 'Unknown fan'}`}
    title={props.fan?.fan.display_name ?? 'Unknown fan'}
    description={props.fan?.fan.email ?? undefined}
    footer={<Button variant="ghost" size="sm" onClick={props.onClose}>Close</Button>}
    class="inset-y-0 right-0 left-auto top-0 max-h-none max-w-md translate-x-0 translate-y-0 rounded-none border-0 border-l"
  >
    <>
        <div class="flex flex-col gap-5">
          <div class="fan-drawer-meta flex flex-col gap-2">
            <div class="flex justify-between items-center py-1.5 border-b border-surface-3"><span class="text-muted-foreground">Status</span><Badge variant={props.fan!.fan.status === 'active' ? 'success' : 'muted'}>{props.fan!.fan.status}</Badge></div>
            <div class="flex justify-between items-center py-1.5 border-b border-surface-3"><span class="text-muted-foreground">Locale</span><span>{props.fan!.fan.locale ?? '—'}</span></div>
            <div class="flex justify-between items-center py-1.5 border-b border-surface-3"><span class="text-muted-foreground">Activation</span><span>{props.fan!.fan.activation_state}</span></div>
            <div class="flex justify-between items-center py-1.5 border-b border-surface-3"><span class="text-muted-foreground">Joined</span><span>{formatDateTime(props.fan!.fan.created_at)}</span></div>
            <div class="flex justify-between items-center py-1.5 border-b border-surface-3"><span class="text-muted-foreground">Last activity</span><span>{formatDateTime(props.fan!.fan.last_activity_at)}</span></div>
            <div class="flex justify-between items-center py-1.5 border-b border-surface-3"><span class="text-muted-foreground">Consented</span><span>{props.fan!.fan.consented ? 'Yes' : 'No'}</span></div>
            <div class="flex justify-between items-center py-1.5 border-b border-surface-3"><span class="text-muted-foreground">Qualified referrals</span><span>{props.fan!.fan.qualified_referrals}</span></div>
            <div class="flex justify-between items-center py-1.5 border-b border-surface-3"><span class="text-muted-foreground">Paid ticket orders</span><span>{props.fan!.fan.paid_ticket_orders}</span></div>
          </div>
          <Show when={props.fan!.tags.length > 0}>
            <div class="fan-drawer-tags">
              <h4 class="text-sm text-muted-foreground uppercase tracking-wider mb-2">Tags</h4>
              <div class="flex flex-wrap gap-1.5">
                <For each={props.fan!.tags}>{tag => <Badge class="free-chip text-emerald-300 text-xs px-1 rounded-sm uppercase tracking-wider">{tag}</Badge>}</For>
              </div>
            </div>
          </Show>
          <Show when={props.fan!.ticket_purchases.length > 0}>
            <div class="fan-drawer-section">
              <h4>Ticket purchases</h4>
              <For each={props.fan!.ticket_purchases}>{(purchase) => (
                <div class="flex items-center gap-2.5 px-3 py-2 rounded-sm">
                  <span class="text-sm text-muted-foreground whitespace-nowrap">{formatDateTime(purchase.paid_at)}</span>
                  <Badge>{purchase.event_title}</Badge>
                  <span class="text-muted-foreground">{purchase.status} · {purchase.currency} {purchase.amount_gross_minor / 100}</span>
                </div>
              )}</For>
            </div>
          </Show>
          <div class="fan-drawer-journey">
            <h4 class="text-sm text-muted-foreground uppercase tracking-wider mb-2">Journey</h4>
            <Show when={props.loading}><SkeletonRows count={3} /></Show>
            <Show when={props.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{props.error}</div></Show>
            <Show when={!props.loading && !props.error && props.journey.length === 0}>
              <EmptyState label="No journey events" hint="Journey events track fan interactions over time. They appear here once the fan engages with the platform." />
            </Show>
            <Show when={!props.loading && !props.error && props.journey.length > 0}>
              <div class="flex flex-col gap-2">
                <For each={props.journey}>{(event) => (
                  <div class="flex items-center gap-2.5 px-3 py-2 rounded-sm">
                    <span class="text-sm text-muted-foreground whitespace-nowrap">{formatDateTime(event.occurred_at)}</span>
                    <Badge>{journeyKindLabel(event.kind)}</Badge>
                    <span class="text-muted-foreground">{event.title}</span>
                    <Show when={event.detail != null}><span class="text-muted-foreground detail-json font-mono text-xs block break-all">{detailToString(event.detail)}</span></Show>
                  </div>
                )}</For>
              </div>
            </Show>
          </div>
        </div>
    </>
  </Dialog>
}
