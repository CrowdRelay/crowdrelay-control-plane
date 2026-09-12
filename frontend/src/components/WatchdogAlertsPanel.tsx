import { For, Show } from 'solid-js'
import { PanelTitle } from './layout'
import { Link } from '@tanstack/solid-router'
import type { OpsAlert } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { EmptyState } from './ui/empty-state'
import { SectionIcon } from './SectionIcon'
import { Card } from './ui/card'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { buttonVariants } from './ui/button'

// What each watchdog condition actually observes, and where an operator can act
// on it. The upstream row carries a one-line summary and raw evidence; the
// operator still needs to know which queue or worker produced it, so the
// explanation lives next to the alert instead of in a runbook nobody opens.
type AlertGuide = {
  title: string
  cause: string
  action?: { label: string; anchor: string } | { label: string; operations: true }
}

const GUIDE: Record<string, AlertGuide> = {
  'outbox.dead': {
    title: 'Messages stopped reaching their destinations',
    cause: 'Some events (like notifications or data updates) failed too many times and were set aside. They will not be retried automatically until you review them.',
    action: { label: 'Show failed messages', anchor: 'dead-outbox' },
  },
  'outbox.stalled': {
    title: 'Message queue is backing up',
    cause: 'New events are waiting longer than they should. The worker that processes them may be down, overwhelmed, or stuck on a single problematic message.',
    action: { label: 'Check system health', operations: true },
  },
  'webhook.dead': {
    title: 'Webhook deliveries permanently failing',
    cause: 'A service that should receive webhooks rejected them (usually a 4xx error) or exhausted all retry attempts. These deliveries are parked and will not be sent again until you intervene.',
    action: { label: 'Show failed deliveries', anchor: 'dead-deliveries' },
  },
  'webhook.stalled': {
    title: 'Webhook deliveries running late',
    cause: 'Pending webhook deliveries are older than they should be. The delivery worker is either behind, or one endpoint is timing out on every attempt.',
    action: { label: 'Check system health', operations: true },
  },
  'proof.dead_or_stalled': {
    title: 'Tamper-proof receipts are not being filed',
    cause: 'The system periodically files cryptographic proof that its actions happened. Those proof batches are stuck or dead. Check the Rekor anchor worker on the host.',
  },
  'executor.offline': {
    title: 'No worker available to carry out actions',
    cause: 'The system decided on actions but has nobody to execute them — all executors have gone offline. Actions will queue up until an executor comes back.',
    action: { label: 'Check system health', operations: true },
  },
  'executor.report_lag': {
    title: 'Actions sent but no confirmation received',
    cause: 'The system dispatched actions to a worker, but the worker never reported back whether they succeeded or failed. The worker may have crashed mid-task or lost connectivity.',
    action: { label: 'Check system health', operations: true },
  },
  'execution.unknown_outcome': {
    title: 'Actions completed but result is unknown',
    cause: 'Some actions were dispatched but the system cannot tell whether they succeeded or failed. The confirmation receipts are missing or could not be reconciled. You need to check the provider manually and file the correct outcome.',
    action: { label: 'Check system health', operations: true },
  },
  'execution.contradicted_outcome': {
    title: 'Action result disagrees with what the worker reported',
    cause: 'The system recorded an action as successful, but the worker later reported it as failed (or vice versa). The system refused to silently pick one side. You need to investigate which source is correct and update the action status manually.',
    action: { label: 'Check system health', operations: true },
  },
  'autopilot.failure_burst': {
    title: 'Automated actions keep failing',
    cause: 'Multiple actions failed within a short window. This usually means something systematic is broken — a broken integration, a bad template, or a configuration change — rather than a one-off glitch.',
    action: { label: 'Open Autopilot controls', operations: true },
  },
  'reconciliation.critical': {
    title: 'System state does not match expectations',
    cause: 'A routine check found that part of the system is in a state that should not exist — a mismatch between what the records say and what the services report. These findings stay open until the underlying issue is fixed.',
    action: { label: 'Show findings', anchor: 'reconciliation-findings' },
  },
  // Four conditions the tenant raises that had no entry here, so they fell
  // through to the raw upstream summary — accurate, but with nothing telling
  // the operator what it costs or where to act. The learning one matters most:
  // a refused outcome is fail-closed and correct, which is exactly why a broken
  // verifier reads as a quiet system rather than as a stopped one.
  'learning.outcomes_unverified': {
    title: 'Nothing the agent did can be checked, so nothing is being kept',
    cause: 'Every agent outcome in the last day was refused because no grounding check ran on it. Refusing an unchecked outcome is the correct, safe behaviour — but while it stands nothing downstream works: no post is drafted, nothing is published, and no evidence resolves, so the system stops learning. The usual cause is the verifier model failing or being out of quota.',
    action: { label: 'Open Autopilot controls', operations: true },
  },
  'growth.all_feeds_failing': {
    title: 'Every growth feed is failing',
    cause: 'No connected platform is syncing, so the brain has no channel left to discover through and will not plan discovery at all. Fix at least one feed and the top of the funnel restarts.',
    action: { label: 'Check system health', operations: true },
  },
  'growth.feed_failing': {
    title: 'A growth feed stopped syncing',
    cause: 'One platform\'s last sync attempt failed while the others still work. Nothing is lost yet — the brain keeps working through the remaining channels — but that platform contributes nothing until its credential or connection is repaired.',
    action: { label: 'Check system health', operations: true },
  },
  'publishing.orphaned_draft': {
    title: 'A post was approved but nothing published it',
    cause: 'The system recorded the publishing action as successful, yet no executor ever produced the post — so the draft exists, the action says it is done, and the audience never saw anything. It means no executor recognises this kind of draft as its work: the agent task\'s template and the draft\'s platform fall outside every executor\'s claim.',
    action: { label: 'Check system health', operations: true },
  },
  'growth.stuck_ungeocoded_cities': {
    title: 'Fan-requested cities could not be placed on the map',
    cause: 'Geocoding gave up on cities fans asked for, so the fans behind them are unreachable by the nearby-show notification — the one thing that reopens an installed app on its own. Nothing recovers this without a person: either the geocoding worker is disabled, or the provider does not recognise the names.',
  },
}

const formatTime = (value: string | null) => {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString()
}
const formatDetail = (value: unknown) => typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)

export function WatchdogAlertsPanel(props: {
  alerts: OpsAlert[]
  slug: string
  /// Show the section an alert points at. This used to be a local
  /// `scrollIntoView` by element id, which found nothing whenever the target
  /// sat in another tab — the failed-queue anchors all do, and an inactive tab
  /// panel is hidden or not mounted. The page knows which tab owns which
  /// anchor, so it does the reveal.
  onReveal: (anchor: string) => void
}) {
  const open = () => props.alerts.filter(alert => alert.active)
  const recovered = () => props.alerts.filter(alert => !alert.active)

  return <>
    <div id="watchdog-alerts" class="flex items-start justify-between gap-4 mb-3">
      <div>
        <PanelTitle as="h3" icon={<SectionIcon name="alert-triangle" />}>Open alerts</PanelTitle>
        <p class="mt-1 text-sm text-muted-foreground leading-relaxed">Checked every 5 minutes. An alert closes itself as soon as the problem it is watching goes away — you do not have to dismiss it.</p>
      </div>
      <StatusBadge
        status={open().length === 0 ? 'clear' : `${open().length} open`}
        tone={open().some(alert => alert.severity === 'critical') ? 'bad' : open().length > 0 ? 'warn' : 'good'}
      />
    </div>

    <For each={open()}>{alert => {
      const guide = () => GUIDE[alert.alert_key]
      return <Alert tone={alert.severity === 'critical' ? 'destructive' : 'warning'}>
        <div class="flex items-start justify-between gap-4 mb-3">
          <div>
            <strong class="text-foreground">{guide()?.title ?? alert.summary}</strong>
            <p class="mt-1 text-sm text-secondary-foreground leading-relaxed">{guide()?.cause ?? alert.summary}</p>
          </div>
          <StatusBadge status={alert.severity} tone={alert.severity === 'critical' ? 'bad' : 'warn'} />
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
          <For each={Object.entries(alert.details)}>{([key, value]) => <span><em class="not-italic font-medium">{key}</em> {formatDetail(value)}</span>}</For>
          <span><em class="not-italic font-medium">first seen</em> {formatTime(alert.first_seen_at)}</span>
          <span><em class="not-italic font-medium">last confirmed</em> {formatTime(alert.last_seen_at)}</span>
        </div>
        <Show when={guide()?.action}>{action => <div class="flex items-center gap-2 mt-3">
          <Show
            when={'operations' in action() ? null : (action() as { anchor: string }).anchor}
            fallback={<Link class={buttonVariants({ variant: 'ghost', size: 'sm' })} to="/tenants/$slug" params={{ slug: props.slug }}>{action().label}</Link>}
          >
            {anchor => <Button variant="ghost" size="sm" onClick={() => props.onReveal(anchor())}>{action().label}</Button>}
          </Show>
        </div>}</Show>
      </Alert>
    }}</For>

    <Show when={open().length === 0}>
      <div class="p-4 mt-2.5"><EmptyState label="No open alerts" hint="The watchdog monitors runtime health and shows open alerts here." /></div>
    </Show>

    {/* Recovered rows stay for 24 hours so a cleared incident is visible as
        cleared rather than as an alert that silently disappeared. */}
    <Show when={recovered().length > 0}>
      <Card class="p-4 mt-2.5">
        <p class="m-0 text-sm text-foreground font-semibold">Recovered in the last 24 hours</p>
        <For each={recovered()}>{alert => {
          const guide = GUIDE[alert.alert_key]
          return <p class="mt-1 text-sm text-muted-foreground"><strong class="text-secondary-foreground">{guide?.title ?? alert.summary}</strong> · recovered {formatTime(alert.recovered_at)}</p>
        }}</For>
      </Card>
    </Show>
  </>
}
