import { For, Show } from 'solid-js'
import type { FanDetail, FanJourneyEntry } from '../lib/types'
import { EmptyState } from './EmptyState'
import { SkeletonRows } from './Skeleton'
import { Dialog } from './Dialog'

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
    overlayClass="fan-drawer-overlay"
    class="fan-drawer"
  >
    <>
        <div class="fan-drawer-head">
          <div>
            <h3>{props.fan!.fan.display_name ?? 'Unknown fan'}</h3>
            <Show when={props.fan!.fan.email}>
              <span class="muted">{props.fan!.fan.email}</span>
            </Show>
          </div>
          <button class="link" onClick={props.onClose}>Close</button>
        </div>
        <div class="fan-drawer-body">
          <div class="fan-drawer-meta">
            <div><span class="muted">Status</span><span class={`badge tone-${props.fan!.fan.status === 'active' ? 'good' : 'muted'}`}>{props.fan!.fan.status}</span></div>
            <div><span class="muted">Locale</span><span>{props.fan!.fan.locale ?? '—'}</span></div>
            <div><span class="muted">Activation</span><span>{props.fan!.fan.activation_state}</span></div>
            <div><span class="muted">Joined</span><span>{formatDateTime(props.fan!.fan.created_at)}</span></div>
            <div><span class="muted">Last activity</span><span>{formatDateTime(props.fan!.fan.last_activity_at)}</span></div>
            <div><span class="muted">Consented</span><span>{props.fan!.fan.consented ? 'Yes' : 'No'}</span></div>
            <div><span class="muted">Qualified referrals</span><span>{props.fan!.fan.qualified_referrals}</span></div>
            <div><span class="muted">Paid ticket orders</span><span>{props.fan!.fan.paid_ticket_orders}</span></div>
          </div>
          <Show when={props.fan!.tags.length > 0}>
            <div class="fan-drawer-tags">
              <h4>Tags</h4>
              <div class="city-chips">
                <For each={props.fan!.tags}>{tag => <span class="badge free-chip">{tag}</span>}</For>
              </div>
            </div>
          </Show>
          <Show when={props.fan!.ticket_purchases.length > 0}>
            <div class="fan-drawer-section">
              <h4>Ticket purchases</h4>
              <For each={props.fan!.ticket_purchases}>{(purchase) => (
                <div class="journey-event">
                  <span class="journey-time">{formatDateTime(purchase.paid_at)}</span>
                  <span class="badge">{purchase.event_title}</span>
                  <span class="muted">{purchase.status} · {purchase.currency} {purchase.amount_gross_minor / 100}</span>
                </div>
              )}</For>
            </div>
          </Show>
          <div class="fan-drawer-journey">
            <h4>Journey</h4>
            <Show when={props.loading}><SkeletonRows count={3} /></Show>
            <Show when={props.error}><div class="error-card">{props.error}</div></Show>
            <Show when={!props.loading && !props.error && props.journey.length === 0}>
              <EmptyState label="No journey events" hint="Journey events track fan interactions over time. They appear here once the fan engages with the platform." />
            </Show>
            <Show when={!props.loading && !props.error && props.journey.length > 0}>
              <div class="journey-timeline">
                <For each={props.journey}>{(event) => (
                  <div class="journey-event">
                    <span class="journey-time">{formatDateTime(event.occurred_at)}</span>
                    <span class="badge">{journeyKindLabel(event.kind)}</span>
                    <span class="muted">{event.title}</span>
                    <Show when={event.detail != null}><span class="muted detail-json">{detailToString(event.detail)}</span></Show>
                  </div>
                )}</For>
              </div>
            </Show>
          </div>
        </div>
    </>
  </Dialog>
}
