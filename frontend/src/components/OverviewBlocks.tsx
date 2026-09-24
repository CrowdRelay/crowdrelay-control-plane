import { For, Show, createEffect, createMemo, createSignal, type JSX } from 'solid-js'
import { useQueryClient } from '@tanstack/solid-query'
import { Link, useNavigate } from '@tanstack/solid-router'
import { AlertTriangle, ChevronRight, CircleCheck, Inbox } from 'lucide-solid'
import { formatIsoAge, formatTimestamp } from '../lib/format'
import { healthLabel, healthTone, platformStatusMessage } from '../lib/health-tone'
import { stillAsking } from '../lib/incomplete'
import { cn } from '../lib/cn'
import type { CommandCenterReadModel, CommandCenterTenantSummary, PlatformHealthEntry, TenantSummary } from '../lib/types'
import { Badge } from './app/badge'
import { Button } from './app/button'
import { Card, CardContent, CardHeader, CardTitle } from './app/card'
import { CollapsibleSection } from './app/collapsible'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './app/table'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { Skeleton } from './ui/skeleton'
import { Metric, MetricRow } from './ui/metric'
import { StatusBadge } from './StatusBadge'

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

const formatLatency = (ms: number | null | undefined) => {
  if (ms == null) return null
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`

// ─── Needs-you items ───────────────────────────────────────────────────
// The page's first block is a ranked list of things a person has to do.
// Every item is derived here from the command-center projection; nothing is
// asked of the backend that it does not already answer.

export type NeedsYouItem = {
  key: string
  /** 0 = broken, 1 = waiting on a person, 2 = worth a look. */
  severity: 0 | 1 | 2
  title: string
  detail?: string
  tenant?: { slug: string; displayName: string }
  to: string
  params?: { slug: string }
}

const tenantItems = (t: CommandCenterTenantSummary): NeedsYouItem[] => {
  const tenant = { slug: t.slug, displayName: t.displayName }
  const attention = (key: string, severity: 0 | 1 | 2, title: string, detail?: string): NeedsYouItem =>
    ({ key: `${t.slug}:${key}`, severity, title, detail, tenant, to: '/tenants/$slug/attention', params: { slug: t.slug } })
  const items: NeedsYouItem[] = []
  const a = t.attention
  if (a.available) {
    if (a.criticalAlerts > 0) items.push(attention('critical', 0, plural(a.criticalAlerts, 'critical alert')))
    if (a.deadDeliveries > 0) items.push({ ...attention('dead', 0, plural(a.deadDeliveries, 'dead delivery', 'dead deliveries'), 'Messages that will not be retried on their own.'), to: '/tenants/$slug/operations' })
    if (a.needsYou > 0) items.push(attention('needs-you', 1, plural(a.needsYou, 'decision needs you', 'decisions need you')))
    if (a.awaitingApproval > 0) items.push(attention('approval', 1, plural(a.awaitingApproval, 'action awaiting approval', 'actions awaiting approval')))
    if ((a.unpublishedDrafts ?? 0) > 0) {
      const channels = (a.unpublishedDraftChannels ?? []).filter(c => c.drafts > 0).map(c => `${fmt(c.drafts)} on ${c.channel}`).join(' · ')
      items.push(attention('drafts', 1, plural(a.unpublishedDrafts!, 'post written, not published', 'posts written, not published'), channels || undefined))
    }
    if (a.openFindings > 0) items.push(attention('findings', 2, plural(a.openFindings, 'open finding')))
  }
  if (t.brain?.needs_attention) {
    items.push({ ...attention('brain', 1, 'The brain needs attention', t.brain.state ? `State: ${t.brain.state}` : undefined), to: '/tenants/$slug/intelligence' })
  }
  if (t.objectives?.available) {
    for (const o of t.objectives.atRisk ?? []) {
      const name = o.metricKey ?? 'objective'
      const pace = o.observedValue != null && o.targetValue != null ? `${fmt(o.observedValue)} of ${fmt(o.targetValue)}` : undefined
      const due = o.deadline ? `due ${formatTimestamp(o.deadline)}` : undefined
      items.push({ ...attention(`objective:${name}`, 2, `${name} is ${o.state === 'missed' ? 'missed' : 'behind'}`, [pace, due].filter(Boolean).join(' · ') || undefined), to: '/tenants/$slug/intelligence' })
    }
  }
  if (t.autopilot.available && t.autopilot.failed24h > 0) {
    items.push({ ...attention('failed', 2, plural(t.autopilot.failed24h, 'autopilot action failed', 'autopilot actions failed'), 'In the last 24 hours.'), to: '/tenants/$slug/intelligence' })
  }
  if (t.runtimeHealth === 'degraded' || t.runtimeHealth === 'stale') {
    items.push({ ...attention('runtime', t.runtimeHealth === 'degraded' ? 0 : 2, `Runtime ${healthLabel(t.runtimeHealth)}`), to: '/tenants/$slug/health' })
  }
  if (t.enabledNotifierChannels === 0) {
    items.push({ ...attention('notifier', 1, 'No notification channel', 'Approvals and alerts fan out to zero channels — nobody is told.'), to: '/tenants/$slug?tab=destinations' })
  }
  return items
}

const serviceItems = (services: PlatformHealthEntry[]): NeedsYouItem[] =>
  services.filter(s => !s.healthy).map(s => ({
    key: `service:${s.service}`,
    severity: 0,
    title: `${s.label} is not answering`,
    detail: platformStatusMessage(s.lastStatus) ?? undefined,
    to: '/tenants',
  }))

// The fleet's own notification outbox. A dead row is a notification — often
// `approvals.pending` — that exhausted every retry, and the channel that
// would report the failure is the one that failed. Overdue pending rows
// mean the dispatcher itself is not running. Either way the operator only
// learns it here.
const outboxItems = (outbox: CommandCenterReadModel['system']['notificationOutbox'] | undefined): NeedsYouItem[] => {
  if (!outbox) return []
  const items: NeedsYouItem[] = []
  if (outbox.dead7d > 0) {
    items.push({
      key: 'outbox:dead',
      severity: 0,
      title: plural(outbox.dead7d, 'notification will never arrive', 'notifications will never arrive'),
      detail: 'Delivery retries were exhausted in the last 7 days — check the notifier channels.',
      to: '/tenants',
    })
  }
  if (outbox.overduePending > 0) {
    items.push({
      key: 'outbox:overdue',
      severity: 0,
      title: plural(outbox.overduePending, 'notification is stuck in the outbox', 'notifications are stuck in the outbox'),
      detail: 'The notifier is not dispatching — pending rows have been due for over 15 minutes.',
      to: '/tenants',
    })
  }
  return items
}

// ─── Model ─────────────────────────────────────────────────────────────

type TenantsQuery = { data?: { items: TenantSummary[] } | undefined }
type CommandCenterQuery = { data?: CommandCenterReadModel | undefined }

export type TenantRow = TenantSummary & { cc?: CommandCenterTenantSummary }

/** Everything the overview derives from the two queries. */
export const useOverviewModel = (tenants: TenantsQuery, commandCenter: CommandCenterQuery) => {
  const cc = (): CommandCenterReadModel | undefined => commandCenter.data
  const items = createMemo(() => tenants.data?.items ?? [])
  const ccTenants = createMemo(() => cc()?.perTenant ?? [])
  const platformServices = createMemo<PlatformHealthEntry[]>(() => cc()?.system.platformServices ?? [])
  const healthyServices = createMemo(() => platformServices().filter(s => s.healthy).length)
  const momentum = createMemo(() => cc()?.momentum)
  const objectives = createMemo(() => cc()?.objectives)

  const rows = createMemo<TenantRow[]>(() => {
    const bySlug = new Map(ccTenants().map(t => [t.slug, t]))
    return items().map(t => ({ ...t, cc: bySlug.get(t.slug) }))
  })

  const needsYou = createMemo<NeedsYouItem[]>(() =>
    [
      ...ccTenants().flatMap(tenantItems),
      ...serviceItems(platformServices()),
      ...outboxItems(cc()?.system.notificationOutbox),
    ]
      .sort((a, b) => a.severity - b.severity),
  )

  // Tenants that answered nothing this time round. The dash on a fan KPI is
  // the same glyph whether nobody has any fans or the tenant did not answer,
  // and only the latter fixes itself: `whileIncomplete` on the query keeps
  // asking, so the strip says so instead of claiming there is no data.
  const silentTenants = createMemo(() => ccTenants().filter(t => !t.available).length)
  const qc = useQueryClient()
  const waitingNote = () => {
    const n = silentTenants()
    const subject = n === 1 ? 'the tenant has' : `${n} tenants have`
    const query = qc.getQueryCache().find({ queryKey: ['command-center'] })
    return !query || stillAsking(query.state)
      ? `${subject} not answered yet — still asking`
      : `${subject} not answered — refresh to ask again`
  }
  const fanSub = (value: number | null | undefined, settled: JSX.Element): JSX.Element =>
    value == null && silentTenants() > 0 ? waitingNote() : settled

  // A figure that lands after the strip was first read fades in once.
  const [wasWaiting, setWasWaiting] = createSignal(false)
  createEffect(() => { if (silentTenants() > 0) setWasWaiting(true) })
  const arrived = (value: number | null | undefined) => wasWaiting() && value != null

  return { cc, items, rows, needsYou, platformServices, healthyServices, momentum, objectives, silentTenants, waitingNote, fanSub, arrived }
}

export type OverviewModel = ReturnType<typeof useOverviewModel>

// ─── Needs you ─────────────────────────────────────────────────────────

const SEVERITY_ICON = {
  0: <AlertTriangle class="size-4 text-destructive" aria-hidden="true" />,
  1: <Inbox class="size-4 text-warning-foreground" aria-hidden="true" />,
  2: <ChevronRight class="size-4 text-muted-foreground" aria-hidden="true" />,
} as const

export function NeedsYouCard(props: { ov: OverviewModel; loading: boolean }) {
  const [showAll, setShowAll] = createSignal(false)
  const LIMIT = 5
  const visible = createMemo(() => showAll() ? props.ov.needsYou() : props.ov.needsYou().slice(0, LIMIT))
  const hidden = createMemo(() => props.ov.needsYou().length - visible().length)
  return (
    <Card data-slot="needs-you">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle class="text-base">Needs you</CardTitle>
        <Show when={!props.loading}>
          <span class="text-xs text-muted-foreground" data-slot="needs-you-count">
            {props.ov.needsYou().length === 0 ? 'nothing open' : plural(props.ov.needsYou().length, 'item')}
          </span>
        </Show>
      </CardHeader>
      <CardContent class="p-0">
        <Show when={props.loading}>
          <div class="space-y-3 px-4 pb-4 pt-2">
            <Skeleton class="h-5 w-3/5" animate />
            <Skeleton class="h-5 w-2/5" animate />
          </div>
        </Show>
        <Show when={!props.loading && props.ov.needsYou().length === 0}>
          <p class="flex items-center gap-2 px-4 pb-4 pt-1 text-sm text-muted-foreground">
            <CircleCheck class="size-4 text-success-foreground" aria-hidden="true" />
            Nothing is waiting on a person right now.
          </p>
        </Show>
        <Show when={!props.loading && props.ov.needsYou().length > 0}>
          <ul class="divide-y divide-border border-t border-border">
            <For each={visible()}>{item => (
              <li>
                <Link
                  to={item.to}
                  params={item.params ?? {}}
                  data-slot="needs-you-item"
                  class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <span class="shrink-0">{SEVERITY_ICON[item.severity]}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-medium text-foreground">{item.title}</span>
                    <Show when={item.detail}><span class="block text-xs text-muted-foreground">{item.detail}</span></Show>
                  </span>
                  <Show when={item.tenant}>{tenant => <Badge variant="outline" class="hidden shrink-0 font-medium sm:inline-flex">{tenant().displayName}</Badge>}</Show>
                  <ChevronRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            )}</For>
          </ul>
          <Show when={hidden() > 0 || showAll()}>
            <div class="border-t border-border px-2 py-1">
              <Button variant="ghost" size="sm" onClick={() => setShowAll(v => !v)}>
                {showAll() ? 'Show fewer' : `Show ${hidden()} more`}
              </Button>
            </div>
          </Show>
        </Show>
      </CardContent>
    </Card>
  )
}

// ─── North star ────────────────────────────────────────────────────────

export function NorthStarStrip(props: { ov: OverviewModel }) {
  const cc = () => props.ov.cc()!
  const rate = createMemo(() => {
    const fans = cc().fans.activeFans
    const buyers = cc().fans.ticketBuyers
    if (fans == null || buyers == null || fans === 0) return null
    return Math.round((buyers / fans) * 100)
  })
  return (
    <MetricRow class="mb-0" min="11rem">
      <Metric label="Active fans" value={fmt(cc().fans.activeFans)} tone="primary" fresh={props.ov.arrived(cc().fans.activeFans)} sub={
        props.ov.fanSub(cc().fans.activeFans, <>
          <Show when={cc().fans.reportingTenants > 0} fallback="no tenants reporting">
            across {plural(cc().fans.reportingTenants, 'tenant')}
          </Show>
          <Show when={(props.ov.momentum()?.northStarImproving ?? 0) > 0}>
            {' · '}<span class="text-success-foreground">{props.ov.momentum()!.northStarImproving} improving</span>
          </Show>
          <Show when={(props.ov.momentum()?.northStarRegressing ?? 0) > 0}>
            {' · '}<span class="text-destructive">{props.ov.momentum()!.northStarRegressing} regressing</span>
          </Show>
        </>)
      } />
      <Metric label="Ticket buyers" value={fmt(cc().fans.ticketBuyers)} fresh={props.ov.arrived(cc().fans.ticketBuyers)} sub={
        props.ov.fanSub(cc().fans.ticketBuyers, rate() != null ? `${rate()}% of active fans` : 'conversion')
      } />
      <Metric label="Attendees" value={fmt(cc().fans.attendees)} fresh={props.ov.arrived(cc().fans.attendees)} sub={
        props.ov.fanSub(cc().fans.attendees, 'came to a show')
      } />
      <Metric label="Paid ticket orders" value={fmt(cc().fans.paidTicketOrders)} fresh={props.ov.arrived(cc().fans.paidTicketOrders)} sub={
        props.ov.fanSub(cc().fans.paidTicketOrders, <>
          revenue
          <Show when={props.ov.momentum()?.conversionDelta7d != null}>
            {' · '}{deltaChip(props.ov.momentum()!.conversionDelta7d, 'this week')}
          </Show>
        </>)
      } />
      <Show when={(props.ov.objectives()?.total ?? 0) > 0}>
        <Metric label="Objectives" value={fmt(props.ov.objectives()!.onTrack + props.ov.objectives()!.met)}
          tone={(props.ov.objectives()!.behind + props.ov.objectives()!.missed) > 0 ? 'warn' : 'good'}
          sub={<>of {props.ov.objectives()!.total} on track
            <Show when={(props.ov.objectives()!.behind + props.ov.objectives()!.missed) > 0}>
              {' · '}<span class="text-warning-foreground">{props.ov.objectives()!.behind + props.ov.objectives()!.missed} behind</span>
            </Show>
          </>} />
      </Show>
    </MetricRow>
  )
}

export function NorthStarSkeleton() {
  return (
    <div data-kpi-strip="" class="grid border-y border-border [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
      {Array.from({ length: 4 }, () => (
        <div class="flex flex-col gap-2 border-l border-border px-4 py-3.5 first:border-l-0 first:pl-0">
          <Skeleton class="h-3 w-20" animate />
          <Skeleton class="h-6 w-14" animate />
          <Skeleton class="h-3 w-28" animate />
        </div>
      ))}
    </div>
  )
}

// ─── Tenants ───────────────────────────────────────────────────────────

const tenantNeedsYou = (t: CommandCenterTenantSummary | undefined) => {
  if (!t?.attention.available) return null
  return t.attention.needsYou + t.attention.awaitingApproval + t.attention.criticalAlerts + (t.attention.unpublishedDrafts ?? 0)
}

const inFlight = (t: CommandCenterTenantSummary | undefined) =>
  t?.autopilot.available ? t.autopilot.queuedActions + t.autopilot.processingActions : null

export function TenantsTable(props: { rows: TenantRow[]; loading: boolean; ccLoading: boolean }) {
  const navigate = useNavigate()
  const open = (slug: string) => navigate({ to: '/tenants/$slug', params: { slug } })
  const cell = (value: number | null | undefined, loading: boolean) =>
    loading ? <Skeleton class="ml-auto h-4 w-8" animate /> : fmt(value)
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tenant</TableHead>
          <TableHead>Health</TableHead>
          <TableHead class="text-right">Active fans</TableHead>
          <TableHead class="text-right">Needs you</TableHead>
          <TableHead class="text-right">In flight</TableHead>
          <TableHead class="hidden md:table-cell">Last heartbeat</TableHead>
          <TableHead class="w-8"><span class="sr-only">Open</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <Show when={props.loading}>
          <For each={[0, 1, 2]}>{() => (
            <TableRow>
              <TableCell><Skeleton class="h-4 w-32" animate /></TableCell>
              <TableCell><Skeleton class="h-4 w-16" animate /></TableCell>
              <TableCell><Skeleton class="ml-auto h-4 w-8" animate /></TableCell>
              <TableCell><Skeleton class="ml-auto h-4 w-8" animate /></TableCell>
              <TableCell><Skeleton class="ml-auto h-4 w-8" animate /></TableCell>
              <TableCell class="hidden md:table-cell"><Skeleton class="h-4 w-20" animate /></TableCell>
              <TableCell />
            </TableRow>
          )}</For>
        </Show>
        <For each={props.rows}>{t => {
          const needs = () => tenantNeedsYou(t.cc)
          return (
            <TableRow data-slot="tenant-row" class="cursor-pointer" onClick={() => open(t.slug)}>
              <TableCell>
                <Link to="/tenants/$slug" params={{ slug: t.slug }} class="font-medium text-foreground hover:underline focus-visible:underline focus-visible:outline-none" onClick={e => e.stopPropagation()}>
                  {t.displayName}
                </Link>
                <span class="ml-2 text-xs text-muted-foreground">{t.slug}</span>
                <Show when={t.status !== 'active'}>
                  <StatusBadge status={t.status} tone={t.status === 'suspended' ? 'bad' : 'warn'} />
                </Show>
              </TableCell>
              <TableCell><StatusBadge status={healthLabel(t.runtimeHealth)} tone={healthTone(t.runtimeHealth)} /></TableCell>
              <TableCell numeric>{cell(t.cc?.fans.activeFans, props.ccLoading)}</TableCell>
              <TableCell numeric class={cn((needs() ?? 0) > 0 && 'font-semibold text-warning-foreground')}>{cell(needs(), props.ccLoading)}</TableCell>
              <TableCell numeric>{cell(inFlight(t.cc), props.ccLoading)}</TableCell>
              <TableCell class="hidden text-muted-foreground md:table-cell">
                {t.runtime?.lastHeartbeatAt ? formatIsoAge(t.runtime.lastHeartbeatAt) : 'never'}
              </TableCell>
              <TableCell><ChevronRight class="size-4 text-muted-foreground" aria-hidden="true" /></TableCell>
            </TableRow>
          )
        }}</For>
      </TableBody>
    </Table>
  )
}

// ─── Autopilot and learning ────────────────────────────────────────────

export function AutopilotSummary(props: { ov: OverviewModel }) {
  const cc = () => props.ov.cc()!
  const flying = () => cc().autopilot.queuedActions + cc().autopilot.processingActions
  return (
    <CollapsibleSection
      title="Autopilot and learning"
      badge={flying() > 0 ? `${plural(flying(), 'action')} in flight` : `${fmt(cc().autopilot.succeeded24h)} succeeded today`}
      badgeTone={flying() > 0 ? 'good' : 'muted'}
    >
      <MetricRow min="9rem">
        <Metric label="Queued" value={fmt(cc().autopilot.queuedActions)} />
        <Metric label="Processing" value={fmt(cc().autopilot.processingActions)} />
        <Metric label="Succeeded" value={fmt(cc().autopilot.succeeded24h)} tone={cc().autopilot.succeeded24h > 0 ? 'good' : 'default'} sub="last 24 hours" />
        <Metric label="Failed" value={fmt(cc().autopilot.failed24h)} tone={cc().autopilot.failed24h > 0 ? 'bad' : 'default'} sub="last 24 hours" />
        <Metric label="Outcomes resolved" value={fmt(cc().outcomes.resolved)} sub={
          cc().outcomes.waitingForObservation > 0 ? `${fmt(cc().outcomes.waitingForObservation)} waiting for observation` : cc().outcomes.unknown > 0 ? `${fmt(cc().outcomes.unknown)} not measurable` : 'all measured'
        } />
        <Metric label="Learning outcomes" value={fmt(cc().learning.totalOutcomes)} sub={`${fmt(cc().learning.admitted)} admitted · ${fmt(cc().learning.rejected)} rejected`} />
      </MetricRow>
    </CollapsibleSection>
  )
}

// ─── Platform services ─────────────────────────────────────────────────

export function ServicesRow(props: { services: PlatformHealthEntry[] }) {
  return (
    <div class="flex flex-wrap items-center gap-2 text-sm">
      <span class="mr-1 text-muted-foreground">Platform services</span>
      <For each={props.services}>{svc => (
        <Tooltip>
          <TooltipTrigger as="span" class="inline-flex">
            <Badge variant={svc.healthy ? 'outline' : 'destructive'} class="gap-1.5 font-medium">
              <span class={cn('size-1.5 rounded-full', svc.healthy ? 'bg-success-foreground' : 'bg-destructive')} aria-hidden="true" />
              {svc.label}
              <span class="sr-only">{svc.healthy ? ', healthy' : ', not answering'}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent class="max-w-xs">
            <Show when={svc.healthy} fallback={
              <>
                <div>{platformStatusMessage(svc.lastStatus) ?? 'Not answering.'}</div>
                <Show when={svc.lastHealthyAt}><div class="mt-1 text-muted-foreground">Last healthy {formatTimestamp(svc.lastHealthyAt!)}</div></Show>
              </>
            }>
              Answered in {formatLatency(svc.latencyMs) ?? '—'}
            </Show>
          </TooltipContent>
        </Tooltip>
      )}</For>
    </div>
  )
}
