import { For, Show } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import type { OpsAlert } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { EmptyState } from './EmptyState'
import { SectionIcon } from './SectionIcon'

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
}

const formatTime = (value: string | null) => {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString()
}
const formatDetail = (value: unknown) => typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
const jumpTo = (anchor: string) => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

export function WatchdogAlertsPanel(props: { alerts: OpsAlert[]; slug: string }) {
  const open = () => props.alerts.filter(alert => alert.active)
  const recovered = () => props.alerts.filter(alert => !alert.active)

  return <>
    <div class="section-title">
      <div>
        <span class="eyebrow">WATCHDOG</span>
        <h3><SectionIcon name="alert-triangle" />Open alerts</h3>
        {/* The counts on this page and on Operations come from these rows, so
            state the cadence: an operator who fixed the cause should not read a
            still-open alert as a second incident. */}
        <p>Evaluated every 5 minutes. An alert closes itself once its condition is false.</p>
      </div>
      <StatusBadge
        status={open().length === 0 ? 'clear' : `${open().length} open`}
        tone={open().some(alert => alert.severity === 'critical') ? 'bad' : open().length > 0 ? 'warn' : 'good'}
      />
    </div>

    <For each={open()}>{alert => {
      const guide = () => GUIDE[alert.alert_key]
      return <div class={alert.severity === 'critical' ? 'error-card' : 'warning-card'}>
        <div class="section-title">
          <div>
            <strong>{guide()?.title ?? alert.summary}</strong>
            <p>{guide()?.cause ?? alert.summary}</p>
          </div>
          <StatusBadge status={alert.severity} tone={alert.severity === 'critical' ? 'bad' : 'warn'} />
        </div>
        <div class="alert-evidence">
          <For each={Object.entries(alert.details)}>{([key, value]) => <span><em>{key}</em> {formatDetail(value)}</span>}</For>
          <span><em>first seen</em> {formatTime(alert.first_seen_at)}</span>
          <span><em>last confirmed</em> {formatTime(alert.last_seen_at)}</span>
        </div>
        <Show when={guide()?.action}>{action => <div class="alert-actions">
          <Show
            when={'operations' in action() ? null : (action() as { anchor: string }).anchor}
            fallback={<Link class="ghost alert-action" to="/tenants/$slug" params={{ slug: props.slug }}>{action().label}</Link>}
          >
            {anchor => <button type="button" class="ghost alert-action" onClick={() => jumpTo(anchor())}>{action().label}</button>}
          </Show>
        </div>}</Show>
      </div>
    }}</For>

    <Show when={open().length === 0}>
      <div class="inherit-card"><EmptyState label="No open alerts" hint="The watchdog monitors runtime health. Open alerts appear here when the system detects issues." /></div>
    </Show>

    {/* Recovered rows stay for 24 hours so a cleared incident is visible as
        cleared rather than as an alert that silently disappeared. */}
    <Show when={recovered().length > 0}>
      <div class="inherit-card watchdog-recovered">
        <p><strong>Recovered in the last 24 hours</strong></p>
        <For each={recovered()}>{alert => {
          const guide = GUIDE[alert.alert_key]
          return <p><strong>{guide?.title ?? alert.summary}</strong> · recovered {formatTime(alert.recovered_at)}</p>
        }}</For>
      </div>
    </Show>
  </>
}
