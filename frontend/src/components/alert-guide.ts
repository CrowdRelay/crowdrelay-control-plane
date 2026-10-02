import { authState } from '../lib/auth'
import type { OpsAlert } from '../lib/types'

// What each watchdog condition actually observes, and where an operator can act
// on it. The upstream row carries a one-line summary and raw evidence; the
// operator still needs to know which queue or worker produced it, so the
// explanation lives next to the alert instead of in a runbook nobody opens.
export type AlertGuide = {
  title: string
  cause: string
  /// The band's phrasing of the same alert — used where the operator wording
  /// names machinery the band does not run ("the agent", executors, Rekor).
  band?: { title?: string; cause?: string }
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
    band: { cause: 'New events are waiting longer than they should. The part that processes them may be down, busy, or stuck on one problematic message.' },
    action: { label: 'Check system health', operations: true },
  },
  'webhook.dead': {
    title: 'Webhook deliveries permanently failing',
    cause: 'A service that should receive webhooks rejected them (usually a 4xx error) or exhausted all retry attempts. These deliveries are parked and will not be sent again until you intervene.',
    band: {
      title: 'Deliveries permanently failing',
      cause: 'A service that should receive these rejected them or exhausted all retry attempts. These deliveries are parked and will not be sent again until you intervene.',
    },
    action: { label: 'Show failed deliveries', anchor: 'dead-deliveries' },
  },
  'webhook.stalled': {
    title: 'Webhook deliveries running late',
    cause: 'Pending webhook deliveries are older than they should be. The delivery worker is either behind, or one endpoint is timing out on every attempt.',
    band: {
      title: 'Deliveries running late',
      cause: 'Deliveries are older than they should be. The sender is either behind, or one endpoint is timing out on every attempt.',
    },
    action: { label: 'Check system health', operations: true },
  },
  'proof.dead_or_stalled': {
    title: 'Tamper-proof receipts are not being filed',
    cause: 'The system periodically files cryptographic proof that its actions happened. Those proof batches are stuck or dead. Check the Rekor anchor worker on the host.',
    band: { cause: 'The system periodically files cryptographic proof that its actions happened. Those proof batches are stuck or dead — this needs someone with server access to look.' },
  },
  'executor.offline': {
    title: 'No worker available to carry out actions',
    cause: 'The system decided on actions but has nobody to execute them — all executors have gone offline. Actions will queue up until an executor comes back.',
    band: {
      title: 'Nothing available to carry out actions',
      cause: 'It decided on actions but has nothing to run them — the runners are all offline. Actions pile up until one comes back.',
    },
    action: { label: 'Check system health', operations: true },
  },
  'executor.report_lag': {
    title: 'Actions sent but no confirmation received',
    cause: 'The system dispatched actions to a worker, but the worker never reported back whether they succeeded or failed. The worker may have crashed mid-task or lost connectivity.',
    band: { cause: 'It sent actions out, but never heard back whether they succeeded or failed. The runner may have crashed mid-task or lost connectivity.' },
    action: { label: 'Check system health', operations: true },
  },
  'execution.unknown_outcome': {
    title: 'Actions completed but result is unknown',
    cause: 'Some actions were dispatched but the system cannot tell whether they succeeded or failed. The confirmation receipts are missing or could not be reconciled. You need to check the provider manually and file the correct outcome.',
    band: { cause: 'Some actions went out but the system cannot tell whether they succeeded or failed — the confirmations are missing. Someone needs to check the other side and record the outcome.' },
    action: { label: 'Check system health', operations: true },
  },
  'execution.contradicted_outcome': {
    title: 'Action result disagrees with what the worker reported',
    cause: 'The system recorded an action as successful, but the worker later reported it as failed (or vice versa). The system refused to silently pick one side. You need to investigate which source is correct and update the action status manually.',
    band: {
      title: 'Action result disagrees with what came back',
      cause: 'The system recorded an action as successful, but the other side later reported it as failed (or vice versa). It refused to silently pick one side — someone needs to check which is correct and fix the record.',
    },
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
    band: {
      title: 'Nothing the brain did can be checked, so nothing is being kept',
      cause: 'Everything it produced in the last day was refused because no check ran on it. Refusing unchecked work is the correct, safe behaviour — but while it stands nothing downstream works: no post is drafted, nothing is published, and no evidence resolves, so the system stops learning.',
    },
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
    band: { cause: 'The system recorded the publishing action as successful, yet nothing ever produced the post — so the draft exists, the action says it is done, and the audience never saw anything. It means nothing recognises this kind of draft as its work.' },
    action: { label: 'Check system health', operations: true },
  },
  'growth.stuck_ungeocoded_cities': {
    title: 'Fan-requested cities could not be placed on the map',
    cause: 'Geocoding gave up on cities fans asked for, so the fans behind them are unreachable by the nearby-show notification — the one thing that reopens an installed app on its own. Nothing recovers this without a person: either the geocoding worker is disabled, or the provider does not recognise the names.',
    band: { cause: 'Placing cities fans asked for on the map gave up, so the fans behind them are unreachable by the nearby-show notification — the one thing that reopens an installed app on its own. Nothing recovers this without a person.' },
  },
}

/** What an alert means in words, in the reader's vocabulary — the band
 *  gets the band's phrasing where the operator's names machinery. */
export function alertGuide(alert: OpsAlert): AlertGuide | undefined {
  const g = GUIDE[alert.alert_key]
  if (!g) return undefined
  if (authState.isPlatformLevel() || !g.band) return g
  return { ...g, title: g.band.title ?? g.title, cause: g.band.cause ?? g.cause }
}

/** Where a person can act on an alert. Actions that lead to surfaces the
 *  band does not have — the operations page, the platform-gated
 *  reconciliation section, or the dead-queue anchors (their owning Queues
 *  tab is not in the band's tab bar) — hide for the band; the alert itself
 *  still says what is wrong. */
export function alertAction(alert: OpsAlert): AlertGuide['action'] | undefined {
  const a = alertGuide(alert)?.action
  return !a || (!authState.isPlatformLevel() && ('operations' in a || a.anchor === 'reconciliation-findings' || a.anchor?.startsWith('dead-'))) ? undefined : a
}

/** The raw evidence the watchdog attached, as `key value` pairs. */
export const alertDetails = (alert: OpsAlert) =>
  Object.entries(alert.details).map(([key, value]) => `${key} ${typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}`)
