import { For, Match, Show, Switch, createMemo } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { healthTone } from '../lib/health-tone'
import { authState } from '../lib/auth'
import type { CommandCenterReadModel, CommandCenterTenantSummary, PlatformHealthEntry, RuntimeHealth, TenantSummary } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { ProgressRing } from '../components/ProgressRing'
import { EmptyState } from '../components/ui/empty-state'
import { SectionIcon } from '../components/SectionIcon'
import { PageShell, PageHeader, KpiStrip, KpiCard, SectionTitle, ErrorCard, CommandBlock, SkeletonBlock } from '../components/layout'
import { cn } from '../lib/cn'

const formatLatency = (ms: number | null | undefined) => {
  if (ms == null) return null
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** Format an integer with thousands separators, or dash for null/undefined. */
const fmt = (n: number | null | undefined): string => {
  if (n == null) return '—'
  return n.toLocaleString('en-US')
}

export function OverviewPage() {
  const tenants = useQuery(() => ({ queryKey: ['tenants'], queryFn: api.tenants, refetchOnWindowFocus: false, reconcile: 'id', staleTime: 15_000 }))
  const commandCenter = useQuery(() => ({ queryKey: ['command-center'], queryFn: api.commandCenter, refetchOnWindowFocus: false, staleTime: 10_000 }))

  const items = createMemo(() => tenants.data?.items ?? [])
  const count = (health: RuntimeHealth) => items().filter(t => t.runtimeHealth === health).length
  const activeItems = createMemo(() => items().filter(t => t.status === 'active'))
  const activeCount = createMemo(() => activeItems().length)
  const suspendedCount = createMemo(() => items().filter(t => t.status === 'suspended').length)
  const needsAttention = createMemo(() => count('degraded') + count('stale') + suspendedCount())
  const parkedCount = createMemo(() => items().filter(t => t.status === 'parked').length)
  const unknownCount = createMemo(() => count('unknown'))
  const reportingCount = createMemo(() => items().length - unknownCount())
  const healthyCount = createMemo(() => count('healthy'))
  const allHealthy = createMemo(() => activeCount() > 0 && healthyCount() === activeCount())
  const healthyPct = createMemo(() => {
    const reporting = reportingCount()
    if (reporting === 0) return 0
    return Math.round((healthyCount() / reporting) * 100)
  })
  const fleetTone = createMemo(() => reportingCount() === 0 ? 'muted' as const : undefined)
  const lastRefresh = createMemo(() => {
    const ts = Math.max(tenants.dataUpdatedAt, commandCenter.dataUpdatedAt)
    if (ts === 0) return null
    return new Date(ts).toLocaleTimeString()
  })

  const cc = (): CommandCenterReadModel | undefined => commandCenter.data
  const platformServices = createMemo<PlatformHealthEntry[]>(() => cc()?.system.platformServices ?? [])
  const healthyServices = createMemo(() => platformServices().filter(service => service.healthy).length)
  const ccTenants = createMemo(() => cc()?.perTenant ?? [])

  const firstNeedsYouTenant = createMemo(() => ccTenants().find(t => t.attention.available && t.attention.needsYou > 0))
  const firstAutopilotTenant = createMemo(() => ccTenants().find(t => t.autopilot.available && (t.autopilot.queuedActions > 0 || t.autopilot.processingActions > 0)))
  const firstOutcomesTenant = createMemo(() => ccTenants().find(t => t.outcomes.available && (t.outcomes.unknown > 0 || t.outcomes.waitingForObservation > 0)))
  const firstLearningTenant = createMemo(() => ccTenants().find(t => t.learning.available && t.learning.totalOutcomes > 0))
  const firstFanTenant = createMemo(() => ccTenants().find(t => t.fans.available && t.fans.activeFans != null))

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
        <ErrorCard>{errorMessage(commandCenter.error, 'Command center unavailable')}</ErrorCard>
      </Match>
      <Match when={!cc()}>
        <KpiStrip>
          {Array.from({ length: 4 }, () => (
            <SkeletonBlock style={{ 'min-height': '80px' }} />
          ))}
        </KpiStrip>
      </Match>
      <Match when={cc()}>
        <KpiStrip>
          <KpiCard label="Active fans" value={fmt(cc()!.fans.activeFans)} tone="good" sub={
            <Show when={cc()!.fans.reportingTenants > 0} fallback="no tenants reporting">
              across {cc()!.fans.reportingTenants} {cc()!.fans.reportingTenants === 1 ? 'tenant' : 'tenants'}
            </Show>
          } />
          <KpiCard label="Ticket buyers" value={fmt(cc()!.fans.ticketBuyers)} sub="conversion signal" />
          <KpiCard label="Attendees" value={fmt(cc()!.fans.attendees)} sub="live show conversion" />
          <KpiCard label="Paid ticket orders" value={fmt(cc()!.fans.paidTicketOrders)} sub="revenue signal" />
        </KpiStrip>
      </Match>
    </Switch>

    {/* ── North Star command blocks (Aggregate → Engage → Convert) ── */}
    <Switch>
      <Match when={!cc()}>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array.from({ length: 3 }, () => (
            <SkeletonBlock style={{ 'min-height': '120px' }} />
          ))}
        </div>
      </Match>
      <Match when={cc()}>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* AGGREGATE */}
          <Link
            to={firstFanTenant() ? '/tenants/$slug/audience' : '/tenants'}
            params={firstFanTenant() ? { slug: firstFanTenant()!.slug } : {}}
            class="block"
          >
            <CommandBlock
              eyebrow="AGGREGATE"
              metric={fmt(cc()!.fans.activeFans)}
              label="active fans"
              detail={
                <>
                  <Show when={cc()!.fans.reportingTenants > 0 && cc()!.fans.reportingTenants < cc()!.tenants.total}>
                    <span>{cc()!.tenants.total - cc()!.fans.reportingTenants} tenants not reporting audience</span>
                  </Show>
                  <Show when={cc()!.fans.reportingTenants === 0}>
                    <span>No audience data yet</span>
                  </Show>
                  <Show when={cc()!.fans.reportingTenants === cc()!.tenants.total && cc()!.fans.activeFans != null}>
                    <span>All tenants reporting</span>
                  </Show>
                </>
              }
            />
          </Link>

          {/* ENGAGE */}
          <Link
            to={firstAutopilotTenant() ? '/tenants/$slug/intelligence' : '/tenants'}
            params={firstAutopilotTenant() ? { slug: firstAutopilotTenant()!.slug } : {}}
            class="block"
          >
            <CommandBlock
              eyebrow="ENGAGE"
              metric={fmt(cc()!.autopilot.queuedActions + cc()!.autopilot.processingActions)}
              label="in flight"
              tone={(cc()!.autopilot.queuedActions + cc()!.autopilot.processingActions) > 0 ? 'active' : 'default'}
              detail={
                <>
                  <Show when={cc()!.autopilot.succeeded24h > 0}><span class="text-success-foreground">{cc()!.autopilot.succeeded24h} succeeded (24h)</span></Show>
                  <Show when={cc()!.autopilot.queuedActions === 0 && cc()!.autopilot.processingActions === 0}>
                    <span>No engagement actions in flight</span>
                  </Show>
                </>
              }
            />
          </Link>

          {/* CONVERT */}
          <Link
            to={firstFanTenant() ? '/tenants/$slug/audience' : '/tenants'}
            params={firstFanTenant() ? { slug: firstFanTenant()!.slug } : {}}
            class="block"
          >
            <CommandBlock
              eyebrow="CONVERT"
              metric={fmt(cc()!.fans.ticketBuyers)}
              label="ticket buyers"
              tone={cc()!.fans.ticketBuyers != null && cc()!.fans.ticketBuyers! > 0 ? 'good' : 'default'}
              detail={
                <>
                  <Show when={cc()!.fans.attendees != null && cc()!.fans.attendees! > 0}><span>{fmt(cc()!.fans.attendees)} attendees</span></Show>
                  <Show when={cc()!.fans.paidTicketOrders != null && cc()!.fans.paidTicketOrders! > 0}><span>{fmt(cc()!.fans.paidTicketOrders)} paid orders</span></Show>
                  <Show when={(cc()!.fans.ticketBuyers == null || cc()!.fans.ticketBuyers === 0) && (cc()!.fans.attendees == null || cc()!.fans.attendees === 0)}>
                    <span>No conversion data yet</span>
                  </Show>
                </>
              }
            />
          </Link>
        </div>
      </Match>
    </Switch>

    {/* ── Operations command blocks ──────────────────────────────── */}
    <SectionTitle eyebrow="OPERATIONS" title="Operations signal" icon={<SectionIcon name="activity" />} />
    <Switch>
      <Match when={commandCenter.isError}>
        <ErrorCard>{errorMessage(commandCenter.error, 'Command center unavailable')}</ErrorCard>
      </Match>
      <Match when={!cc()}>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array.from({ length: 5 }, () => (
            <SkeletonBlock style={{ 'min-height': '120px' }} />
          ))}
        </div>
      </Match>
      <Match when={cc()}>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* ATTENTION */}
          <Link
            to={firstNeedsYouTenant() ? '/tenants/$slug/attention' : '/tenants'}
            params={firstNeedsYouTenant() ? { slug: firstNeedsYouTenant()!.slug } : {}}
            class="block"
          >
            <CommandBlock
              eyebrow="ATTENTION"
              metric={fmt(cc()!.attention.needsYou)}
              label="need you"
              tone={(cc()!.attention.needsYou + cc()!.attention.awaitingApproval + cc()!.attention.criticalAlerts) > 0 ? 'warn' : 'default'}
              detail={
                <>
                  <Show when={cc()!.attention.awaitingApproval > 0}><span>{fmt(cc()!.attention.awaitingApproval)} awaiting approval</span></Show>
                  <Show when={cc()!.attention.criticalAlerts > 0}><span class="text-destructive">{fmt(cc()!.attention.criticalAlerts)} critical alerts</span></Show>
                  <Show when={cc()!.attention.openFindings > 0}><span>{fmt(cc()!.attention.openFindings)} open findings</span></Show>
                  <Show when={cc()!.attention.deadDeliveries > 0}><span>{fmt(cc()!.attention.deadDeliveries)} dead deliveries</span></Show>
                  <Show when={cc()!.brainNeedsAttention}><span class="text-destructive">brain needs attention</span></Show>
                  <Show when={cc()!.attention.needsYou === 0 && cc()!.attention.awaitingApproval === 0 && cc()!.attention.criticalAlerts === 0}>
                    <span>Nothing needs you right now</span>
                  </Show>
                </>
              }
            />
          </Link>

          {/* AUTOPILOT TODAY */}
          <Link
            to={firstAutopilotTenant() ? '/tenants/$slug/intelligence' : '/tenants'}
            params={firstAutopilotTenant() ? { slug: firstAutopilotTenant()!.slug } : {}}
            class="block"
          >
            <CommandBlock
              eyebrow="AUTOPILOT TODAY"
              metric={fmt(cc()!.autopilot.queuedActions + cc()!.autopilot.processingActions)}
              label="in flight"
              tone={(cc()!.autopilot.queuedActions + cc()!.autopilot.processingActions) > 0 ? 'active' : 'default'}
              detail={
                <>
                  <Show when={cc()!.autopilot.queuedActions > 0}><span>{fmt(cc()!.autopilot.queuedActions)} queued</span></Show>
                  <Show when={cc()!.autopilot.processingActions > 0}><span>{fmt(cc()!.autopilot.processingActions)} processing</span></Show>
                  <Show when={cc()!.autopilot.succeeded24h > 0}><span class="text-success-foreground">{fmt(cc()!.autopilot.succeeded24h)} succeeded (24h)</span></Show>
                  <Show when={cc()!.autopilot.failed24h > 0}><span class="text-destructive">{fmt(cc()!.autopilot.failed24h)} failed (24h)</span></Show>
                  <Show when={cc()!.autopilot.unknownActions > 0}><span>{fmt(cc()!.autopilot.unknownActions)} unknown</span></Show>
                  <Show when={cc()!.autopilot.queuedActions === 0 && cc()!.autopilot.processingActions === 0}>
                    <span>No actions in flight</span>
                  </Show>
                </>
              }
            />
          </Link>

          {/* OUTCOMES */}
          <Link
            to={firstOutcomesTenant() ? '/tenants/$slug/intelligence' : '/tenants'}
            params={firstOutcomesTenant() ? { slug: firstOutcomesTenant()!.slug } : {}}
            class="block"
          >
            <CommandBlock
              eyebrow="OUTCOMES"
              metric={fmt(cc()!.outcomes.resolved)}
              label="resolved"
              tone={cc()!.outcomes.unknown > 0 || cc()!.outcomes.waitingForObservation > 0 ? 'warn' : 'default'}
              detail={
                <>
                  <Show when={cc()!.outcomes.waitingForObservation > 0}><span>{fmt(cc()!.outcomes.waitingForObservation)} waiting for observation</span></Show>
                  <Show when={cc()!.outcomes.unknown > 0}><span>{fmt(cc()!.outcomes.unknown)} unknown</span></Show>
                  <Show when={cc()!.outcomes.resolved === 0 && cc()!.outcomes.unknown === 0 && cc()!.outcomes.waitingForObservation === 0}>
                    <span>No outcomes yet</span>
                  </Show>
                </>
              }
            />
          </Link>

          {/* SYSTEM */}
          <Link to="/tenants" class="block">
            <CommandBlock
              eyebrow="SYSTEM"
              metric={platformServices().length === 0 ? '—' : fmt(healthyServices())}
              label={`of ${platformServices().length || '—'} services healthy`}
              detail={
                <Show when={items().length > 0}>
                  <span>{fmt(healthyCount())} healthy · {fmt(needsAttention())} need attention<Show when={unknownCount() > 0}> · {fmt(unknownCount())} not reporting</Show></span>
                </Show>
              }
            />
          </Link>

          {/* LEARNING */}
          <Link
            to={firstLearningTenant() ? '/tenants/$slug/intelligence' : '/tenants'}
            params={firstLearningTenant() ? { slug: firstLearningTenant()!.slug } : {}}
            class="block"
          >
            <CommandBlock
              eyebrow="LEARNING"
              metric={fmt(cc()!.learning.totalOutcomes)}
              label="total outcomes"
              detail={
                <>
                  <Show when={cc()!.learning.admitted > 0}><span class="text-success-foreground">{fmt(cc()!.learning.admitted)} admitted</span></Show>
                  <Show when={cc()!.learning.rejected > 0}><span>{fmt(cc()!.learning.rejected)} rejected</span></Show>
                  <Show when={cc()!.learning.totalOutcomes === 0}>
                    <span>No learning outcomes yet</span>
                  </Show>
                </>
              }
            />
          </Link>
        </div>
      </Match>
    </Switch>

    {/* ── KPI strip (fleet summary) ──────────────────────────────── */}
    <Switch>
      <Match when={!tenants.data && !tenants.isError}><KpiStrip>{Array.from({ length: 4 }, () => <SkeletonBlock style={{ 'min-height': '80px' }} />)}</KpiStrip></Match>
      <Match when={tenants.isError}><ErrorCard>{errorMessage(tenants.error, 'Tenant registry unavailable')}</ErrorCard></Match>
      <Match when={tenants.data}>
        <KpiStrip>
          <KpiCard label="Tenants" value={fmt(items().length)} sub={<>{fmt(activeCount())} active<Show when={parkedCount() > 0}> · {fmt(parkedCount())} parked</Show><Show when={suspendedCount() > 0}> · {fmt(suspendedCount())} suspended</Show></>} />
          <KpiCard label="Healthy" value={fmt(healthyCount())} tone={allHealthy() ? 'good' : 'default'} sub={
            <Show when={reportingCount() > 0} fallback="no runtime reports yet">
              {fmt(healthyPct())}% of reporting
            </Show>
          } />
          <KpiCard label="Needs attention" value={fmt(needsAttention())} tone={needsAttention() > 0 ? 'warn' : needsAttention() === 0 && reportingCount() > 0 ? 'good' : 'default'} sub={
            <>{fmt(count('degraded'))} degraded · {fmt(count('stale'))} stale
            <Show when={suspendedCount() > 0}> · {fmt(suspendedCount())} suspended</Show>
            <Show when={unknownCount() > 0}> · {fmt(unknownCount())} not reporting</Show></>
          } />
          <KpiCard label="Platform services" value={platformServices().length === 0 ? '—' : fmt(healthyServices())} sub={`of ${platformServices().length || '—'} monitored`} />
        </KpiStrip>
      </Match>
    </Switch>

    {/* Fleet health ring + Tenant pulse — the fleet at a glance, first */}
    <SectionTitle eyebrow="PULSE" title="Tenant pulse" icon={<SectionIcon name="heartbeat" />} action={<Show when={authState.isPlatformLevel()}><Link to="/tenants" class="text-sm text-primary hover:text-primary/80">Manage tenants →</Link></Show>} />
    <Show when={items().length > 0}>
      <div class="flex items-center gap-4 p-4 rounded-lg border border-border bg-surface-1">
        <div class="flex-shrink-0">
          <ProgressRing value={healthyPct()} size={72} strokeWidth={6} tone={fleetTone()} showValue={reportingCount() > 0} />
        </div>
        <div class="flex flex-col gap-1">
          <strong class="text-sm text-foreground">
            {fmt(healthyCount())} healthy · {fmt(needsAttention())} need attention
            <Show when={unknownCount() > 0}> · {fmt(unknownCount())} not reporting</Show>
            {' '}· {fmt(items().length)} total
          </strong>
          <Show when={reportingCount() === 0}>
            <span class="text-sm text-muted-foreground">No tenant has sent a runtime heartbeat yet, so there is nothing to score.</span>
          </Show>
        </div>
      </div>
    </Show>
    <div class="space-y-2">
      <For each={items()}>{tenant => (
        <Link to="/tenants/$slug" params={{ slug: tenant.slug }} class="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 hover:border-border-strong transition-colors">
          <div class="flex items-center gap-2 min-w-0">
            <span class={cn('inline-block w-2 h-2 rounded-full flex-shrink-0', healthTone(tenant.runtimeHealth) === 'good' ? 'bg-success' : healthTone(tenant.runtimeHealth) === 'bad' ? 'bg-destructive' : healthTone(tenant.runtimeHealth) === 'warn' ? 'bg-warning' : 'bg-muted-foreground')} />
            <strong class="text-sm text-foreground">{tenant.displayName}</strong>
            <span class="text-xs text-muted-foreground">{tenant.slug}</span>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={tenant.runtimeHealth} tone={healthTone(tenant.runtimeHealth)} />
            <StatusBadge status={tenant.status} tone={tenant.status === 'active' ? 'good' : tenant.status === 'suspended' ? 'bad' : tenant.status === 'parked' ? 'warn' : 'warn'} />
          </div>
        </Link>
      )}</For>
      <Show when={items().length === 0}>
        <EmptyState label="No tenants provisioned" hint="Create your first tenant to start managing fan growth operations." />
      </Show>
    </div>

    {/* Platform services — reference, moved below the fleet so the operator's
        own tenants are the first thing they see. */}
    <Show when={platformServices().length > 0}>
      <SectionTitle eyebrow="SERVICES" title="Platform services" icon={<SectionIcon name="server" />} />
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <For each={platformServices()}>{(svc: PlatformHealthEntry) => (
          <div class={cn('p-4 rounded-lg border', svc.healthy ? 'border-border bg-surface-1' : 'border-destructive/30 bg-destructive/5')}>
            <div class="flex items-center gap-2">
              <span class={cn('inline-block w-2 h-2 rounded-full', svc.healthy ? 'bg-success' : 'bg-destructive')} />
              <strong class="text-sm text-foreground">{svc.label}</strong>
            </div>
            <div class="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <Show when={formatLatency(svc.latencyMs)}>{lat => <span class="tabular-nums">{lat()}</span>}</Show>
              <Show when={!svc.healthy && svc.lastStatus}><span>{svc.lastStatus}</span></Show>
              <span class="break-all">{svc.url.replace(/^https?:\/\//, '')}</span>
            </div>
          </div>
        )}</For>
      </div>
    </Show>
  </PageShell>
}
