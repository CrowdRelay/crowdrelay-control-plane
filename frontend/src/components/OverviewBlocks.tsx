import { For, Match, Show, Switch, createEffect, createMemo, createSignal, type JSX } from 'solid-js'
import { useQueryClient } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { errorMessage, formatTimestamp } from '../lib/format'
import { platformStatusMessage } from '../lib/health-tone'
import { stillAsking } from '../lib/incomplete'
import { cn } from '../lib/cn'
import type { CommandCenterReadModel, PlatformHealthEntry, RuntimeHealth, TenantSummary } from '../lib/types'
import { CommandBlock, ErrorCard } from './layout'

const formatLatency = (ms: number | null | undefined) => {
  if (ms == null) return null
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** Format an integer with thousands separators, or dash for null/undefined. */
export const fmt = (n: number | null | undefined): string => {
  if (n == null) return '—'
  return n.toLocaleString('en-US')
}

/** Signed delta chip — "+12 this week" / "−3 this week". null stays null:
 * a missing series is "we don't know", not "0 growth". */
export const deltaChip = (delta: number | null | undefined, window: string): JSX.Element | null => {
  if (delta == null) return null
  const cls = delta > 0 ? 'text-success-foreground' : delta < 0 ? 'text-destructive' : 'text-muted-foreground'
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
  return <span class={cls}>{sign}{fmt(Math.abs(delta))} {window}</span>
}

/** Card-grid skeleton — the command blocks share one shape. */
const CommandSkeleton = (props: { count: number }) => (
  <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
    {Array.from({ length: props.count }, () => (
      <div class="rounded-lg border border-border bg-card p-4">
        <div class="h-[11px] w-[80px] rounded-lg bg-muted border border-border mb-2" />
        <div class="h-7 w-[60px] rounded-lg bg-muted border border-border mb-2" />
        <div class="h-[11px] w-full rounded-lg bg-muted border border-border" />
      </div>
    ))}
  </div>
)

type TenantsQuery = { data?: { items: TenantSummary[] } | undefined }
type CommandCenterQuery = { data?: CommandCenterReadModel | undefined }

/** Everything the overview's cards derive from the two queries — fleet
 * counts, command-center projections, and the silent-tenant vocabulary the
 * KPI strips share. */
export const useOverviewModel = (tenants: TenantsQuery, commandCenter: CommandCenterQuery) => {
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

  const cc = (): CommandCenterReadModel | undefined => commandCenter.data

  const platformServices = createMemo<PlatformHealthEntry[]>(() => cc()?.system.platformServices ?? [])
  const healthyServices = createMemo(() => platformServices().filter(service => service.healthy).length)
  const ccTenants = createMemo(() => cc()?.perTenant ?? [])

  // Drafted posts waiting for a person to publish them.
  //
  // Every outbound channel drafts and waits — Reddit is read-only by policy,
  // Telegram, Discord and social default to manual — so this is the one queue
  // where the system is blocked on the operator rather than the reverse, and a
  // draft nobody publishes reaches nobody. The command center already fetches
  // the attention model per tenant and projects the count, so the page reads
  // it from there rather than re-asking each tenant itself.
  const draftTotal = createMemo(() =>
    ccTenants().reduce((sum, t) => sum + (t.attention.unpublishedDrafts ?? 0), 0),
  )
  const firstDraftTenant = createMemo(() => ccTenants().find(t => (t.attention.unpublishedDrafts ?? 0) > 0))
  const draftChannels = createMemo(() => {
    const counts = new Map<string, number>()
    for (const tenant of ccTenants()) {
      for (const channel of tenant.attention.unpublishedDraftChannels ?? []) {
        if (channel.drafts > 0) counts.set(channel.channel, (counts.get(channel.channel) ?? 0) + channel.drafts)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  })

  const firstNeedsYouTenant = createMemo(() => ccTenants().find(t => t.attention.available && t.attention.needsYou > 0))
  const firstAutopilotTenant = createMemo(() => ccTenants().find(t => t.autopilot.available && (t.autopilot.queuedActions > 0 || t.autopilot.processingActions > 0)))
  const firstOutcomesTenant = createMemo(() => ccTenants().find(t => t.outcomes.available && (t.outcomes.unknown > 0 || t.outcomes.waitingForObservation > 0)))
  const firstLearningTenant = createMemo(() => ccTenants().find(t => t.learning.available && t.learning.totalOutcomes > 0))
  const firstFanTenant = createMemo(() => ccTenants().find(t => t.fans.available && t.fans.activeFans != null))
  // The objective most in need of a look, fleet-wide — behind or missed,
  // soonest deadline first (the projection already sorts them).
  const firstAtRiskObjective = createMemo(() =>
    ccTenants()
      .flatMap(t => (t.objectives?.atRisk ?? []).map(o => ({ tenant: t, objective: o })))
      .sort((a, b) => (a.objective.deadline ?? '').localeCompare(b.objective.deadline ?? ''))
      .at(0),
  )

  // Older control-plane builds don't report momentum/objectives — read the
  // blocks as absent rather than crash on deploy skew or a stale page.
  const momentum = createMemo(() => cc()?.momentum)
  const objectives = createMemo(() => cc()?.objectives)

  // Tenants that answered nothing this time round. The dash on a fan KPI is
  // the same glyph whether nobody has any fans, nobody reports them, or the
  // tenant simply did not answer — and only the last of those is going to fix
  // itself. `whileIncomplete` on the query is asking again; this says so,
  // rather than leaving "No audience data yet" on screen over a number that is
  // seconds away.
  const silentTenants = createMemo(() => ccTenants().filter(t => !t.available).length)
  // `whileIncomplete` gives up after a handful of tries; once it has, the
  // copy must stop claiming a retry is still in flight. `stillAsking` reads
  // the same counters the interval check does.
  const qc = useQueryClient()
  const waitingNote = () => {
    const n = silentTenants()
    const subject = n === 1 ? 'the tenant has' : `${n} tenants have`
    // The attempt counters live on the Query's state, not the observer
    // result — read the same numbers the interval check reads.
    const query = qc.getQueryCache().find({ queryKey: ['command-center'] })
    return !query || stillAsking(query.state)
      ? `${subject} not answered yet — still asking`
      : `${subject} not answered — refresh to ask again`
  }
  const fanSub = (value: number | null | undefined, settled: JSX.Element): JSX.Element =>
    value == null && silentTenants() > 0 ? waitingNote() : settled

  // A figure that turned up after the strip had already been read should say
  // so. Once a tenant has gone silent on this page, every fan figure that
  // lands afterwards fades in rather than replacing its dash in silence —
  // otherwise the retry that `whileIncomplete` runs is invisible, and an
  // operator who looked away reads a number they never saw arrive.
  const [wasWaiting, setWasWaiting] = createSignal(false)
  createEffect(() => { if (silentTenants() > 0) setWasWaiting(true) })
  const arrived = (value: number | null | undefined) => wasWaiting() && value != null

  return {
    items, count, activeCount, suspendedCount, needsAttention,
    parkedCount, unknownCount, reportingCount, healthyCount, allHealthy,
    healthyPct, fleetTone, cc, platformServices, healthyServices,
    draftTotal, firstDraftTenant, draftChannels, firstNeedsYouTenant,
    firstAutopilotTenant, firstOutcomesTenant, firstLearningTenant,
    firstFanTenant, firstAtRiskObjective, momentum, objectives, silentTenants,
    waitingNote, fanSub, arrived,
  }
}

export type OverviewModel = ReturnType<typeof useOverviewModel>

/** Aggregate → Engage → Convert — the north-star loop as three drill-ins. */
export function NorthStarBlocks(props: { ov: OverviewModel }) {
  return (
    <Switch>
      <Match when={!props.ov.cc()}>
        <CommandSkeleton count={3} />
      </Match>
      <Match when={props.ov.cc()}>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* AGGREGATE */}
          <Link
            to={props.ov.firstFanTenant() ? '/tenants/$slug/audience' : '/tenants'}
            params={props.ov.firstFanTenant() ? { slug: props.ov.firstFanTenant()!.slug } : {}}
            class="block"
          >
            <CommandBlock
              eyebrow="AGGREGATE"
              metric={fmt(props.ov.cc()!.fans.activeFans)}
              label="active fans"
              detail={
                <>
                  <Show when={props.ov.cc()!.fans.reportingTenants > 0 && props.ov.cc()!.fans.reportingTenants < props.ov.cc()!.tenants.total}>
                    <span>{props.ov.cc()!.tenants.total - props.ov.cc()!.fans.reportingTenants} tenants not reporting audience</span>
                  </Show>
                  <Show when={props.ov.cc()!.fans.reportingTenants === 0}>
                    <span>{props.ov.silentTenants() > 0 ? props.ov.waitingNote() : 'No audience data yet'}</span>
                  </Show>
                  <Show when={props.ov.cc()!.fans.reportingTenants === props.ov.cc()!.tenants.total && props.ov.cc()!.fans.activeFans != null}>
                    <span>All tenants reporting</span>
                  </Show>
                  {/* Which way the north star is moving, per the brain's own
                      60-day verdict — works for aggregate north stars too,
                      which have no single series to diff. */}
                  <Show when={(props.ov.momentum()?.northStarImproving ?? 0) > 0}>
                    <span class="text-success-foreground">north star improving on {props.ov.momentum()!.northStarImproving} {props.ov.momentum()!.northStarImproving === 1 ? 'tenant' : 'tenants'}</span>
                  </Show>
                  <Show when={(props.ov.momentum()?.northStarRegressing ?? 0) > 0}>
                    <span class="text-destructive">north star regressing on {props.ov.momentum()!.northStarRegressing} {props.ov.momentum()!.northStarRegressing === 1 ? 'tenant' : 'tenants'}</span>
                  </Show>
                  {/* Pacing against declared targets — "are we on track",
                      not just "which way did we move". */}
                  <Show when={(props.ov.objectives()?.onTrack ?? 0) > 0}>
                    <span>{props.ov.objectives()!.onTrack} {props.ov.objectives()!.onTrack === 1 ? 'objective' : 'objectives'} on track</span>
                  </Show>
                  <Show when={((props.ov.objectives()?.behind ?? 0) + (props.ov.objectives()?.missed ?? 0)) > 0 && props.ov.firstAtRiskObjective()}>
                    <span class="text-warning-foreground">
                      {(props.ov.objectives()?.behind ?? 0) + (props.ov.objectives()?.missed ?? 0)} {((props.ov.objectives()?.behind ?? 0) + (props.ov.objectives()?.missed ?? 0)) === 1 ? 'objective' : 'objectives'} {(props.ov.objectives()?.missed ?? 0) > 0 ? 'behind/missed' : 'behind'}
                      {props.ov.firstAtRiskObjective()!.objective.metricKey ? ` — ${props.ov.firstAtRiskObjective()!.objective.metricKey} ${fmt(props.ov.firstAtRiskObjective()!.objective.observedValue)}/${fmt(props.ov.firstAtRiskObjective()!.objective.targetValue)}` : ''}
                    </span>
                  </Show>
                </>
              }
            />
          </Link>

          {/* ENGAGE */}
          <Link
            to={props.ov.firstAutopilotTenant() ? '/tenants/$slug/intelligence' : '/tenants'}
            params={props.ov.firstAutopilotTenant() ? { slug: props.ov.firstAutopilotTenant()!.slug } : {}}
            class="block"
          >
            <CommandBlock
              eyebrow="ENGAGE"
              metric={fmt(props.ov.cc()!.autopilot.queuedActions + props.ov.cc()!.autopilot.processingActions)}
              label="in flight"
              tone={(props.ov.cc()!.autopilot.queuedActions + props.ov.cc()!.autopilot.processingActions) > 0 ? 'active' : 'default'}
              detail={
                <>
                  <Show when={props.ov.cc()!.autopilot.succeeded24h > 0}><span class="text-success-foreground">{props.ov.cc()!.autopilot.succeeded24h} succeeded (24h)</span></Show>
                  <Show when={props.ov.cc()!.autopilot.queuedActions === 0 && props.ov.cc()!.autopilot.processingActions === 0}>
                    <span>No engagement actions in flight</span>
                  </Show>
                </>
              }
            />
          </Link>

          {/* CONVERT */}
          <Link
            to={props.ov.firstFanTenant() ? '/tenants/$slug/audience' : '/tenants'}
            params={props.ov.firstFanTenant() ? { slug: props.ov.firstFanTenant()!.slug } : {}}
            class="block"
          >
            <CommandBlock
              eyebrow="CONVERT"
              metric={fmt(props.ov.cc()!.fans.ticketBuyers)}
              label="ticket buyers"
              tone={props.ov.cc()!.fans.ticketBuyers != null && props.ov.cc()!.fans.ticketBuyers! > 0 ? 'good' : 'default'}
              detail={
                <>
                  {/* The funnel rate is same-source first-party math —
                      both counts come from the audience read model, so the
                      ratio is honest where a cross-endpoint ratio would
                      not be. */}
                  <Show when={props.ov.cc()!.fans.activeFans != null && props.ov.cc()!.fans.activeFans! > 0 && props.ov.cc()!.fans.ticketBuyers != null}>
                    <span class="text-success-foreground">{Math.round((props.ov.cc()!.fans.ticketBuyers! / props.ov.cc()!.fans.activeFans!) * 100)}% of active fans bought tickets</span>
                  </Show>
                  <Show when={props.ov.cc()!.fans.attendees != null && props.ov.cc()!.fans.attendees! > 0}><span>{fmt(props.ov.cc()!.fans.attendees)} attendees</span></Show>
                  <Show when={props.ov.cc()!.fans.paidTicketOrders != null && props.ov.cc()!.fans.paidTicketOrders! > 0}><span>{fmt(props.ov.cc()!.fans.paidTicketOrders)} paid orders</span></Show>
                  {/* Conversion movement — summed downstream-tier series
                      deltas, so this is "things that converted this week",
                      not follower-count drift. */}
                  <Show when={props.ov.momentum()?.conversionDelta7d != null && props.ov.momentum()!.conversionDelta7d !== 0}>
                    <span>{deltaChip(props.ov.momentum()!.conversionDelta7d, 'conversions this week')}</span>
                  </Show>
                  <Show when={(props.ov.cc()!.fans.ticketBuyers == null || props.ov.cc()!.fans.ticketBuyers === 0) && (props.ov.cc()!.fans.attendees == null || props.ov.cc()!.fans.attendees === 0)}>
                    <span>No conversion data yet</span>
                  </Show>
                </>
              }
            />
          </Link>
        </div>
      </Match>
    </Switch>
  )
}

/** Attention / autopilot / outcomes / system / learning — the machine half of
 * the fleet signal. */
export function OperationsSignalBlocks(props: { ov: OverviewModel; isError: boolean; error: unknown }) {
  return (
    <Switch>
      <Match when={props.isError}>
        <ErrorCard>{errorMessage(props.error, 'We couldn\'t reach the command center. Try refreshing.')}</ErrorCard>
      </Match>
      <Match when={!props.ov.cc()}>
        <CommandSkeleton count={5} />
      </Match>
      <Match when={props.ov.cc()}>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* ATTENTION */}
          <Link
            to={props.ov.firstNeedsYouTenant() ? '/tenants/$slug/attention' : '/tenants'}
            params={props.ov.firstNeedsYouTenant() ? { slug: props.ov.firstNeedsYouTenant()!.slug } : {}}
            class="block"
          >
            <CommandBlock
              eyebrow="ATTENTION"
              metric={fmt(props.ov.cc()!.attention.needsYou)}
              label="need you"
              tone={(props.ov.cc()!.attention.needsYou + props.ov.cc()!.attention.awaitingApproval + props.ov.cc()!.attention.criticalAlerts) > 0 ? 'warn' : 'default'}
              detail={
                <>
                  <Show when={props.ov.cc()!.attention.awaitingApproval > 0}><span>{fmt(props.ov.cc()!.attention.awaitingApproval)} awaiting approval</span></Show>
                  <Show when={props.ov.cc()!.attention.criticalAlerts > 0}><span class="text-destructive">{fmt(props.ov.cc()!.attention.criticalAlerts)} critical alerts</span></Show>
                  <Show when={props.ov.cc()!.attention.openFindings > 0}><span>{fmt(props.ov.cc()!.attention.openFindings)} open findings</span></Show>
                  <Show when={props.ov.cc()!.attention.deadDeliveries > 0}><span>{fmt(props.ov.cc()!.attention.deadDeliveries)} dead deliveries</span></Show>
                  <Show when={props.ov.cc()!.brainNeedsAttention}><span class="text-destructive">brain needs attention</span></Show>
                  <Show when={props.ov.cc()!.attention.needsYou === 0 && props.ov.cc()!.attention.awaitingApproval === 0 && props.ov.cc()!.attention.criticalAlerts === 0}>
                    <span>Nothing needs you right now</span>
                  </Show>
                </>
              }
            />
          </Link>

          {/* WAITING ON YOU TO PUBLISH — only when there is something. An
              always-present card reading zero is furniture; this one appears
              because there is work sitting still. */}
          <Show when={props.ov.draftTotal() > 0}>
            <Link
              to={props.ov.firstDraftTenant() ? '/tenants/$slug/attention' : '/tenants'}
              params={props.ov.firstDraftTenant() ? { slug: props.ov.firstDraftTenant()!.slug } : {}}
              class="block"
            >
              <CommandBlock
                eyebrow="WAITING ON YOU"
                metric={fmt(props.ov.draftTotal())}
                label={props.ov.draftTotal() === 1 ? 'post to publish' : 'posts to publish'}
                tone="warn"
                detail={
                  <>
                    <For each={props.ov.draftChannels().slice(0, 3)}>
                      {([channel, count]) => <span>{fmt(count)} on {channel}</span>}
                    </For>
                    <span>Written and ready — nobody has posted them.</span>
                  </>
                }
              />
            </Link>
          </Show>

          {/* AUTOPILOT TODAY */}
          <Link
            to={props.ov.firstAutopilotTenant() ? '/tenants/$slug/intelligence' : '/tenants'}
            params={props.ov.firstAutopilotTenant() ? { slug: props.ov.firstAutopilotTenant()!.slug } : {}}
            class="block"
          >
            <CommandBlock
              eyebrow="AUTOPILOT TODAY"
              metric={fmt(props.ov.cc()!.autopilot.queuedActions + props.ov.cc()!.autopilot.processingActions)}
              label="in flight"
              tone={(props.ov.cc()!.autopilot.queuedActions + props.ov.cc()!.autopilot.processingActions) > 0 ? 'active' : 'default'}
              detail={
                <>
                  <Show when={props.ov.cc()!.autopilot.queuedActions > 0}><span>{fmt(props.ov.cc()!.autopilot.queuedActions)} queued</span></Show>
                  <Show when={props.ov.cc()!.autopilot.processingActions > 0}><span>{fmt(props.ov.cc()!.autopilot.processingActions)} processing</span></Show>
                  <Show when={props.ov.cc()!.autopilot.succeeded24h > 0}><span class="text-success-foreground">{fmt(props.ov.cc()!.autopilot.succeeded24h)} succeeded (24h)</span></Show>
                  <Show when={props.ov.cc()!.autopilot.failed24h > 0}><span class="text-destructive">{fmt(props.ov.cc()!.autopilot.failed24h)} failed (24h)</span></Show>
                  {/* "4 unknown" told the operator a count and nothing else.
                      The backend counts recent actions whose outcome has not
                      been measured yet, so say that. */}
                  <Show when={props.ov.cc()!.autopilot.unknownActions > 0}><span>{fmt(props.ov.cc()!.autopilot.unknownActions)} finished, outcome not measured yet</span></Show>
                  <Show when={props.ov.cc()!.autopilot.queuedActions === 0 && props.ov.cc()!.autopilot.processingActions === 0}>
                    <span>No actions in flight</span>
                  </Show>
                </>
              }
            />
          </Link>

          {/* OUTCOMES */}
          <Link
            to={props.ov.firstOutcomesTenant() ? '/tenants/$slug/intelligence' : '/tenants'}
            params={props.ov.firstOutcomesTenant() ? { slug: props.ov.firstOutcomesTenant()!.slug } : {}}
            class="block"
          >
            <CommandBlock
              eyebrow="OUTCOMES"
              metric={fmt(props.ov.cc()!.outcomes.resolved)}
              label="resolved"
              tone={props.ov.cc()!.outcomes.unknown > 0 || props.ov.cc()!.outcomes.waitingForObservation > 0 ? 'warn' : 'default'}
              detail={
                <>
                  <Show when={props.ov.cc()!.outcomes.waitingForObservation > 0}><span>{fmt(props.ov.cc()!.outcomes.waitingForObservation)} waiting for observation</span></Show>
                  <Show when={props.ov.cc()!.outcomes.unknown > 0}><span>{fmt(props.ov.cc()!.outcomes.unknown)} ran with no measurable result</span></Show>
                  <Show when={props.ov.cc()!.outcomes.resolved === 0 && props.ov.cc()!.outcomes.unknown === 0 && props.ov.cc()!.outcomes.waitingForObservation === 0}>
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
              metric={props.ov.platformServices().length === 0 ? '—' : fmt(props.ov.healthyServices())}
              label={`of ${props.ov.platformServices().length || '—'} services healthy`}
              detail={
                <>
                  {/* The metric counts platform services; this line counts
                      tenants. Unlabelled, "1 of 2 services healthy" sitting
                      above "0 healthy · 1 not reporting" read as the block
                      contradicting itself. Name the population. */}
                  <Show when={props.ov.platformServices().length > props.ov.healthyServices()}>
                    <span class="text-destructive">
                      {fmt(props.ov.platformServices().length - props.ov.healthyServices())} service
                      {props.ov.platformServices().length - props.ov.healthyServices() === 1 ? '' : 's'} not answering
                    </span>
                  </Show>
                  <Show when={props.ov.items().length > 0}>
                    <span>Tenants: {fmt(props.ov.healthyCount())} healthy · {fmt(props.ov.needsAttention())} need attention<Show when={props.ov.unknownCount() > 0}> · {fmt(props.ov.unknownCount())} not reporting</Show></span>
                  </Show>
                </>
              }
            />
          </Link>

          {/* LEARNING */}
          <Link
            to={props.ov.firstLearningTenant() ? '/tenants/$slug/intelligence' : '/tenants'}
            params={props.ov.firstLearningTenant() ? { slug: props.ov.firstLearningTenant()!.slug } : {}}
            class="block"
          >
            <CommandBlock
              eyebrow="LEARNING"
              metric={fmt(props.ov.cc()!.learning.totalOutcomes)}
              label="total outcomes"
              detail={
                <>
                  <Show when={props.ov.cc()!.learning.admitted > 0}><span class="text-success-foreground">{fmt(props.ov.cc()!.learning.admitted)} admitted</span></Show>
                  <Show when={props.ov.cc()!.learning.rejected > 0}><span>{fmt(props.ov.cc()!.learning.rejected)} rejected</span></Show>
                  <Show when={props.ov.cc()!.learning.totalOutcomes === 0}>
                    <span>No learning outcomes yet</span>
                  </Show>
                </>
              }
            />
          </Link>
        </div>
      </Match>
    </Switch>
  )
}

/** Platform service probes — reference detail, below the fleet. */
export function PlatformServicesGrid(props: { services: PlatformHealthEntry[] }) {
  return (
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <For each={props.services}>{(svc: PlatformHealthEntry) => (
        <div class={cn('p-4 rounded-lg border', svc.healthy ? 'border-border bg-background' : 'border-destructive/30 bg-destructive/5')}>
          <div class="flex items-center gap-2">
            <span class={cn('inline-block w-2 h-2 rounded-full', svc.healthy ? 'bg-success-foreground' : 'bg-destructive')} />
            <strong class="text-sm text-foreground">{svc.label}</strong>
          </div>
          {/* The probe address is a private container name and helps nobody
              reading this card, so it moves to the title attribute where an
              operator on the phone to an engineer can still read it out. */}
          <div class="mt-2 flex flex-col gap-1 text-xs text-muted-foreground" title={svc.url}>
            {/* On a failed probe the latency is how long the connection took
                to be refused, so printing it read as "Answered in 4ms. Not
                answering." Timing only means something when there was an
                answer to time. */}
            <Show when={svc.healthy && formatLatency(svc.latencyMs)}>{lat => <span class="tabular-nums">Answered in {lat()}</span>}</Show>
            <Show when={!svc.healthy && platformStatusMessage(svc.lastStatus)}>
              {message => <span class="text-destructive leading-snug">{message()}</span>}
            </Show>
            <Show when={svc.lastHealthyAt && !svc.healthy}>
              <span>Last healthy {formatTimestamp(svc.lastHealthyAt!)}</span>
            </Show>
          </div>
        </div>
      )}</For>
    </div>
  )
}
