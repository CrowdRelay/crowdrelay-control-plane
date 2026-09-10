import { Show } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import type { AudienceOverview } from '../lib/types'
import { compactNumber } from '../lib/charts'
import { EmptyState } from './EmptyState'
import { KpiValue } from './KpiValue'
import { KpiStrip, KpiCard } from './layout'
import { Card } from './ui/card'

const fmt = (value: number | undefined) => value == null ? '—' : compactNumber(value)

const ghostLinkClass =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors h-8 px-3 text-xs text-secondary-foreground hover:bg-surface-3 hover:text-foreground'

export function AudienceOverviewPanel(props: { slug: string; overview?: AudienceOverview }) {
  // Seven cards reading 0 is a true answer to a question nobody asked. A
  // tenant with no fans yet needs the three places fans actually come from,
  // not a wall of zeros on the page that carries the north star.
  const empty = () => (props.overview?.active_fans ?? 0) === 0

  return <Card class="p-4">
    <div class="flex items-center justify-between gap-4">
      <h3 class="text-sm font-semibold text-foreground">Audience KPIs</h3>
    </div>
    <div class="mt-4">
      <Show when={props.overview} fallback={<EmptyState label="Audience overview unavailable" hint="The audience overview could not be loaded. This may be a temporary issue — try refreshing." />}>
        <Show when={empty()}>
          <Card class="p-4">
            <strong>No fans aggregated yet</strong>
            <p class="text-sm text-muted-foreground mt-1">Fans arrive from connected platforms, from the communities the brain scans, and from the people carrying a release into a new city. Start one of those and the counters below fill on the next ingestion.</p>
            <div class="flex flex-col gap-2 mt-3">
              <Link class={ghostLinkClass} to="/tenants/$slug/portfolio" params={{ slug: props.slug }}>Connect a fan source</Link>
              <Link class={ghostLinkClass} to="/tenants/$slug/audience" params={{ slug: props.slug }}>Work the communities queue</Link>
              <Link class={ghostLinkClass} to="/tenants/$slug/beacons" params={{ slug: props.slug }}>Add beacons</Link>
            </div>
          </Card>
        </Show>
        <KpiStrip>
          <KpiCard label="Active fans" value={<KpiValue value={fmt(props.overview!.active_fans)} />} />
          <KpiCard label="Marketing consented" value={<KpiValue value={fmt(props.overview!.marketing_consented_fans)} />} />
          <KpiCard label="Ticket buyers" value={<KpiValue value={fmt(props.overview!.ticket_buyers)} />} />
          <KpiCard label="Attendees" value={<KpiValue value={fmt(props.overview!.attendees)} />} />
          <KpiCard label="Synesthesia participants" value={<KpiValue value={fmt(props.overview!.synesthesia_participants)} />} />
          <KpiCard label="Qualified referrals" value={<KpiValue value={fmt(props.overview!.qualified_referrals)} />} />
          <KpiCard label="Paid ticket orders" value={<KpiValue value={fmt(props.overview!.paid_ticket_orders)} />} />
        </KpiStrip>
      </Show>
    </div>
  </Card>
}
