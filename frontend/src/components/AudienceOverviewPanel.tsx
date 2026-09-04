import { Show } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import type { AudienceOverview } from '../lib/types'
import { compactNumber } from '../lib/charts'
import { EmptyState } from './EmptyState'

const fmt = (value: number | undefined) => value == null ? '—' : compactNumber(value)

export function AudienceOverviewPanel(props: { slug: string; overview?: AudienceOverview }) {
  // Seven cards reading 0 is a true answer to a question nobody asked. A
  // tenant with no fans yet needs the three places fans actually come from,
  // not a wall of zeros on the page that carries the north star.
  const empty = () => (props.overview?.active_fans ?? 0) === 0

  return <div class="agent-section">
    <div class="agent-section-head">
      <h3>Audience KPIs</h3>
    </div>
    <Show when={props.overview} fallback={<EmptyState label="Audience overview unavailable" hint="The audience overview could not be loaded. This may be a temporary issue — try refreshing." />}>
      <Show when={empty()}>
        <div class="inherit-card audience-start-card">
          <strong>No fans aggregated yet</strong>
          <p>Fans arrive from connected platforms, from the communities the brain scans, and from the people carrying a release into a new city. Start one of those and the counters below fill on the next ingestion.</p>
          <div class="audience-start-links">
            <Link class="ghost" to="/tenants/$slug/portfolio" params={{ slug: props.slug }}>Connect a fan source</Link>
            <Link class="ghost" to="/tenants/$slug/communities" params={{ slug: props.slug }}>Work the communities queue</Link>
            <Link class="ghost" to="/tenants/$slug/beacons" params={{ slug: props.slug }}>Add beacons</Link>
          </div>
        </div>
      </Show>
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
