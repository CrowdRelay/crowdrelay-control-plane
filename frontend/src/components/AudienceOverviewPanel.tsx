import { Show } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import { authState } from '../lib/auth'
import type { AudienceOverview } from '../lib/types'
import { compactNumber } from '../lib/charts'
import { EmptyState } from './ui/empty-state'
import { KpiValue } from './KpiValue'
import { KpiStrip, KpiCard, Section } from './layout'
import { Button, buttonVariants } from './app/button'

const fmt = (value: number | undefined) => value == null ? '—' : compactNumber(value)


export function AudienceOverviewPanel(props: { slug: string; overview?: AudienceOverview; onGoSources?: () => void; onGoCommunities?: () => void }) {
  // Seven cards reading 0 is a true answer to a question nobody asked. A
  // tenant with no fans yet needs the three places fans actually come from,
  // not a wall of zeros on the page that carries the north star.
  const empty = () => (props.overview?.active_fans ?? 0) === 0

  return <Section flush title="Audience">
    <div>
      <Show when={props.overview} fallback={<EmptyState label="Audience overview unavailable" hint="The audience overview could not be loaded. This may be a temporary issue — try refreshing." />}>
        {/* The three starting points replace the zeros rather than sitting above
            them. Rendering both said "here is what to do" and then answered the
            unasked question seven times underneath. They are also buttons now:
            as stacked full-width ghosts they read as centred body text, which is
            the one thing a call to action must not look like. */}
        <Show when={empty()} fallback={<KpiStrip>
          <KpiCard label="Active fans" value={<KpiValue value={fmt(props.overview!.active_fans)} />} />
          <KpiCard label="Marketing consented" value={<KpiValue value={fmt(props.overview!.marketing_consented_fans)} />} />
          <KpiCard label="Ticket buyers" value={<KpiValue value={fmt(props.overview!.ticket_buyers)} />} />
          <KpiCard label="Attendees" value={<KpiValue value={fmt(props.overview!.attendees)} />} />
          <KpiCard label="Synesthesia participants" value={<KpiValue value={fmt(props.overview!.synesthesia_participants)} />} />
          <KpiCard label="Qualified referrals" value={<KpiValue value={fmt(props.overview!.qualified_referrals)} />} />
          <KpiCard label="Paid ticket orders" value={<KpiValue value={fmt(props.overview!.paid_ticket_orders)} />} />
        </KpiStrip>}>
          <div class="py-2">
            <strong class="text-foreground">No fans aggregated yet</strong>
            <p class="text-sm text-muted-foreground mt-1 max-w-2xl leading-relaxed">Fans arrive from connected platforms, from the communities the brain scans, and from the people carrying a release into a new city. Start one of those and the counters here fill on the next {authState.isPlatformLevel() ? 'ingestion' : 'import'}.</p>
            <div class="flex flex-wrap gap-2 mt-4">
              {/* Fan sources and communities live on this page's other tabs —
                  in-memory tab state means no href can reach them, so these
                  are buttons wired to the page's switchTab, not Links. */}
              <Button type="button" size="sm" onClick={() => props.onGoSources?.()}>Connect a fan source</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => props.onGoCommunities?.()}>{authState.isPlatformLevel() ? 'Work the communities queue' : 'Work the communities'}</Button>
              <Link class={buttonVariants({ variant: 'outline', size: 'sm' })} to="/tenants/$slug/beacons" params={{ slug: props.slug }}>Add beacons</Link>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  </Section>
}
