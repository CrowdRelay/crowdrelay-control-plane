import { Show } from 'solid-js'
import type { AudienceOverview } from '../lib/types'
import { compactNumber } from '../lib/charts'

const fmt = (value: number | undefined) => value == null ? '—' : compactNumber(value)

export function AudienceOverviewPanel(props: { overview?: AudienceOverview }) {
  return <div class="agent-section">
    <div class="agent-section-head">
      <h3>Audience KPIs</h3>
    </div>
    <Show when={props.overview} fallback={<p class="muted">Audience overview not available.</p>}>
      <div class="kpi-strip">
        <div class="kpi-card">
          <span class="kpi-label">Active fans</span>
          <strong class="kpi-value">{fmt(props.overview!.active_fans)}</strong>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Marketing consented</span>
          <strong class="kpi-value">{fmt(props.overview!.marketing_consented_fans)}</strong>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Ticket buyers</span>
          <strong class="kpi-value">{fmt(props.overview!.ticket_buyers)}</strong>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Attendees</span>
          <strong class="kpi-value">{fmt(props.overview!.attendees)}</strong>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Synesthesia participants</span>
          <strong class="kpi-value">{fmt(props.overview!.synesthesia_participants)}</strong>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Qualified referrals</span>
          <strong class="kpi-value">{fmt(props.overview!.qualified_referrals)}</strong>
        </div>
        <div class="kpi-card accent">
          <span class="kpi-label">Paid ticket orders</span>
          <strong class="kpi-value">{fmt(props.overview!.paid_ticket_orders)}</strong>
        </div>
      </div>
    </Show>
  </div>
}
