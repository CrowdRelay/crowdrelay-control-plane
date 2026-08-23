import { For, Show } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import type { OpsAlert } from '../lib/types'
import { StatusBadge } from './StatusBadge'

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
    title: 'Domain events stopped retrying',
    cause: 'Outbox events reached max_attempts and were parked as dead. Nothing downstream will see them until an operator retries.',
    action: { label: 'Show dead events', anchor: 'dead-outbox' },
  },
  'outbox.stalled': {
    title: 'Outbox queue is not draining',
    cause: 'The oldest pending event is past its stall threshold, so the CrowdRelay worker is either down, saturated or stuck on one event.',
    action: { label: 'Open runtime health', operations: true },
  },
  'webhook.dead': {
    title: 'Webhook deliveries stopped retrying',
    cause: 'A subscriber answered with a permanent failure (typically 4xx) or exhausted its attempts, so the delivery is parked as dead.',
    action: { label: 'Show dead deliveries', anchor: 'dead-deliveries' },
  },
  'webhook.stalled': {
    title: 'Webhook queue is not draining',
    cause: 'Pending deliveries are older than the stall threshold: the delivery worker is behind, or one endpoint is timing out on every attempt.',
    action: { label: 'Open runtime health', operations: true },
  },
  'proof.dead_or_stalled': {
    title: 'Proof anchoring needs attention',
    cause: 'External proof batches are dead or queued past their threshold. The Rekor anchor worker is the component to check on the host.',
  },
  'executor.offline': {
    title: 'No live ViryaOS executor',
    cause: 'Executors are registered but every lease has expired, so emitted Autopilot actions have nobody to run them.',
    action: { label: 'Open runtime health', operations: true },
  },
  'executor.report_lag': {
    title: 'Executor receipts are missing',
    cause: 'Actions were emitted and accepted but no execution report came back inside the window. The executor took work and went quiet.',
    action: { label: 'Open runtime health', operations: true },
  },
  'autopilot.failure_burst': {
    title: 'Autopilot is failing repeatedly',
    cause: 'Failed Autopilot actions crossed the burst threshold inside a 15 minute window, which usually means one action kind is broken rather than one action.',
    action: { label: 'Open Autopilot controls', operations: true },
  },
  'reconciliation.critical': {
    title: 'Unresolved critical findings',
    cause: 'The ecosystem reconciliation pass left critical findings open. They stay open until the underlying state is fixed and a new pass runs.',
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
        <h3>Open alerts</h3>
        {/* The counts on this page and on Operations come from these rows, so
            state the cadence: an operator who fixed the cause should not read a
            still-open alert as a second incident. */}
        <p>Every alert is one condition the CrowdRelay watchdog evaluates every 5 minutes. An alert closes itself on the next cycle once its condition is false.</p>
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
            <small class="mono">{alert.alert_key}</small>
            <p>{alert.summary}. {guide()?.cause}</p>
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
            fallback={<Link class="ghost alert-action" to="/tenants/$slug/operations" params={{ slug: props.slug }}>{action().label}</Link>}
          >
            {anchor => <button type="button" class="ghost alert-action" onClick={() => jumpTo(anchor())}>{action().label}</button>}
          </Show>
        </div>}</Show>
      </div>
    }}</For>

    <Show when={open().length === 0}>
      <div class="inherit-card"><p>No open watchdog alerts.</p></div>
    </Show>

    {/* Recovered rows stay for 24 hours so a cleared incident is visible as
        cleared rather than as an alert that silently disappeared. */}
    <Show when={recovered().length > 0}>
      <div class="inherit-card">
        <p><strong>Recovered in the last 24 hours</strong></p>
        <For each={recovered()}>{alert => <p><span class="mono">{alert.alert_key}</span> · {alert.summary} · recovered {formatTime(alert.recovered_at)}</p>}</For>
      </div>
    </Show>
  </>
}
