import { For, Match, Show, Switch, createMemo } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { healthLabel, healthTone } from '../lib/health-tone'
import { authState } from '../lib/auth'
import { StatusBadge } from '../components/StatusBadge'
import { ProgressRing } from '../components/ProgressRing'
import { EmptyState } from '../components/ui/empty-state'
import { SectionIcon } from '../components/SectionIcon'
import { PageShell, PageHeader, KpiStrip, KpiCard, SectionTitle, ErrorCard } from '../components/layout'
import { SkeletonKpiStrip } from '../components/Skeleton'
import { cn } from '../lib/cn'
import { whileIncomplete, hasUnavailableTenant } from '../lib/incomplete'
import { fmt, deltaChip, useOverviewModel, NorthStarBlocks, OperationsSignalBlocks, PlatformServicesGrid } from '../components/OverviewBlocks'

export function OverviewPage() {
  const tenants = useQuery(() => ({ queryKey: ['tenants'], queryFn: api.tenants, refetchOnWindowFocus: false, reconcile: 'id', staleTime: 15_000 }))
  // A command centre that reports a tenant as unavailable is not an answer,
  // and it arrives as 200 so nothing retries it. Keep asking until the
  // sections land, so the fan counts fill in rather than staying dashes.
  const commandCenter = useQuery(() => ({
    queryKey: ['command-center'],
    queryFn: api.commandCenter,
    // Band sessions redirect away in beforeLoad — but a tenant operator
    // with no tenantSlug on the profile would still mount the page, and
    // this endpoint is platform-only: never fire a guaranteed 403.
    enabled: authState.isPlatformLevel(),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    refetchInterval: whileIncomplete(hasUnavailableTenant),
  }))

  const ov = useOverviewModel(tenants, commandCenter)
  const lastRefresh = createMemo(() => {
    const ts = Math.max(tenants.dataUpdatedAt, commandCenter.dataUpdatedAt)
    if (ts === 0) return null
    return new Date(ts).toLocaleTimeString()
  })

  return <PageShell>
    <PageHeader
      eyebrow="NORTH STAR"
      title="Fan growth command center"
      description="Aggregate real fans, grow them through genuine engagement, convert through tickets, merch and attendance. Each block drills into the page that owns the detail."
      actions={<Show when={lastRefresh()}><span class="text-sm text-muted-foreground">Last refresh {lastRefresh()}</span></Show>}
    />

    {/* ── North Star fan KPI strip ────────────────────────────────── */}
    <Switch>
      <Match when={commandCenter.isError}>
        <ErrorCard>{errorMessage(commandCenter.error, 'We couldn\'t reach the command center. Try refreshing.')}</ErrorCard>
      </Match>
      <Match when={!ov.cc()}>
        <SkeletonKpiStrip count={4} />
      </Match>
      <Match when={ov.cc()}>
        <KpiStrip>
          <KpiCard label="Active fans" value={fmt(ov.cc()!.fans.activeFans)} tone="good" fresh={ov.arrived(ov.cc()!.fans.activeFans)} sub={
            ov.fanSub(ov.cc()!.fans.activeFans,
              <>
                <Show when={ov.cc()!.fans.reportingTenants > 0} fallback="no tenants reporting">
                  across {ov.cc()!.fans.reportingTenants} {ov.cc()!.fans.reportingTenants === 1 ? 'tenant' : 'tenants'}
                </Show>
                {/* Direction, not just magnitude: the brain's verdict on each
                    tenant's north-star series. Improving first because that's
                    the thing the page exists to produce. */}
                <Show when={(ov.momentum()?.northStarImproving ?? 0) > 0}>
                  {' · '}<span class="text-success-foreground">{ov.momentum()!.northStarImproving} improving</span>
                </Show>
                <Show when={(ov.momentum()?.northStarRegressing ?? 0) > 0}>
                  {' · '}<span class="text-destructive">{ov.momentum()!.northStarRegressing} regressing</span>
                </Show>
              </>)
          } />
          <KpiCard label="Ticket buyers" value={fmt(ov.cc()!.fans.ticketBuyers)} fresh={ov.arrived(ov.cc()!.fans.ticketBuyers)} sub={ov.fanSub(ov.cc()!.fans.ticketBuyers, 'conversion signal')} />
          <KpiCard label="Attendees" value={fmt(ov.cc()!.fans.attendees)} fresh={ov.arrived(ov.cc()!.fans.attendees)} sub={ov.fanSub(ov.cc()!.fans.attendees, 'live show conversion')} />
          <KpiCard label="Paid ticket orders" value={fmt(ov.cc()!.fans.paidTicketOrders)} fresh={ov.arrived(ov.cc()!.fans.paidTicketOrders)} sub={
            ov.fanSub(ov.cc()!.fans.paidTicketOrders,
              <>
                revenue signal
                <Show when={ov.momentum()?.conversionDelta7d != null}>
                  {' · '}{deltaChip(ov.momentum()!.conversionDelta7d, 'this week')}
                </Show>
              </>)
          } />
        </KpiStrip>
      </Match>
    </Switch>

    {/* ── North Star command blocks (Aggregate → Engage → Convert) ── */}
    <NorthStarBlocks ov={ov} />

    {/* ── Operations command blocks ──────────────────────────────── */}
    <SectionTitle eyebrow="OPERATIONS" title="Operations signal" icon={<SectionIcon name="activity" />} />
    <OperationsSignalBlocks ov={ov} isError={commandCenter.isError} error={commandCenter.error} />

    {/* ── KPI strip (fleet summary) ──────────────────────────────── */}
    <Switch>
      <Match when={!tenants.data && !tenants.isError}><SkeletonKpiStrip count={4} /></Match>
      <Match when={tenants.isError}><ErrorCard>{errorMessage(tenants.error, 'We couldn\'t reach the tenant registry. Try refreshing.')}</ErrorCard></Match>
      <Match when={tenants.data}>
        <KpiStrip>
          <KpiCard label="Tenants" value={fmt(ov.items().length)} sub={<>{fmt(ov.activeCount())} active<Show when={ov.parkedCount() > 0}> · {fmt(ov.parkedCount())} parked</Show><Show when={ov.suspendedCount() > 0}> · {fmt(ov.suspendedCount())} suspended</Show></>} />
          <KpiCard label="Healthy" value={fmt(ov.healthyCount())} tone={ov.allHealthy() ? 'good' : 'default'} sub={
            <Show when={ov.reportingCount() > 0} fallback="no runtime reports yet">
              {fmt(ov.healthyPct())}% of reporting
            </Show>
          } />
          <KpiCard label="Needs attention" value={fmt(ov.needsAttention())} tone={ov.needsAttention() > 0 ? 'warn' : ov.needsAttention() === 0 && ov.reportingCount() > 0 ? 'good' : 'default'} sub={
            <>{fmt(ov.count('degraded'))} degraded · {fmt(ov.count('stale'))} stale
            <Show when={ov.suspendedCount() > 0}> · {fmt(ov.suspendedCount())} suspended</Show>
            <Show when={ov.unknownCount() > 0}> · {fmt(ov.unknownCount())} not reporting</Show></>
          } />
          <KpiCard label="Platform services" value={ov.platformServices().length === 0 ? '—' : fmt(ov.healthyServices())} sub={`of ${ov.platformServices().length || '—'} monitored`} />
        </KpiStrip>
      </Match>
    </Switch>

    {/* Fleet health ring + Tenant pulse — the fleet at a glance, first */}
    <SectionTitle eyebrow="PULSE" title="Tenant pulse" icon={<SectionIcon name="heartbeat" />} action={<Show when={authState.isPlatformLevel()}><Link to="/tenants" class="text-sm text-primary hover:text-primary/80">Manage tenants →</Link></Show>} />
    <Show when={ov.items().length > 0}>
      <div class="flex items-center gap-4 p-4 rounded-lg border border-border bg-surface-1">
        <div class="flex-shrink-0">
          <ProgressRing value={ov.healthyPct()} size={72} strokeWidth={6} tone={ov.fleetTone()} showValue={ov.reportingCount() > 0} />
        </div>
        <div class="flex flex-col gap-1">
          <strong class="text-sm text-foreground">
            {fmt(ov.healthyCount())} healthy · {fmt(ov.needsAttention())} need attention
            <Show when={ov.unknownCount() > 0}> · {fmt(ov.unknownCount())} not reporting</Show>
            {' '}· {fmt(ov.items().length)} total
          </strong>
          <Show when={ov.reportingCount() === 0}>
            <span class="text-sm text-muted-foreground">No tenant has sent a runtime heartbeat yet, so there is nothing to score.</span>
          </Show>
        </div>
      </div>
    </Show>
    <div class="space-y-2">
      <For each={ov.items()}>{tenant => (
        <Link to="/tenants/$slug" params={{ slug: tenant.slug }} class="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 hover:border-border-strong transition-colors">
          <div class="flex items-center gap-2 min-w-0">
            <span class={cn('inline-block w-2 h-2 rounded-full flex-shrink-0', healthTone(tenant.runtimeHealth) === 'good' ? 'bg-success' : healthTone(tenant.runtimeHealth) === 'bad' ? 'bg-destructive' : healthTone(tenant.runtimeHealth) === 'warn' ? 'bg-warning' : 'bg-muted-foreground')} />
            <strong class="text-sm text-foreground">{tenant.displayName}</strong>
            <span class="text-xs text-muted-foreground">{tenant.slug}</span>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={healthLabel(tenant.runtimeHealth)} tone={healthTone(tenant.runtimeHealth)} />
            <StatusBadge status={tenant.status} tone={tenant.status === 'active' ? 'good' : tenant.status === 'suspended' ? 'bad' : tenant.status === 'parked' ? 'warn' : 'warn'} />
          </div>
        </Link>
      )}</For>
      <Show when={ov.items().length === 0}>
        <EmptyState label="No tenants provisioned" hint="Create your first tenant to start managing fan growth operations." />
      </Show>
    </div>

    {/* Platform services — reference, moved below the fleet so the operator's
        own tenants are the first thing they see. */}
    <Show when={ov.platformServices().length > 0}>
      <SectionTitle eyebrow="SERVICES" title="Platform services" icon={<SectionIcon name="server" />} />
      <PlatformServicesGrid services={ov.platformServices()} />
    </Show>
  </PageShell>
}
