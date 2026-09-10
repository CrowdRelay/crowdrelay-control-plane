import type { OperationsSummary, RuntimeHealth } from './types'
import { oldestQueueAge } from './format'

// Shared health/operational tone utilities. Previously duplicated across
// OverviewPage, TenantHealthPage, TenantOperationsPage,
// OperationsPanel, RuntimeSwitchesPanel, and Shell — each copy had drifted
// in thresholds and casing.

export type Tone = 'good' | 'warn' | 'bad' | 'muted'

export const healthTone = (health: RuntimeHealth): Tone =>
  health === 'healthy' ? 'good' : health === 'degraded' ? 'bad' : health === 'stale' ? 'warn' : 'muted'

/** "unknown" is the enum's word for "this tenant has never sent us a
 *  heartbeat", and it reads to an operator as "something is wrong and we
 *  cannot say what". "Not reporting" says which of the two it is, and matches
 *  the wording the overview counters already use. "Stale" is the same problem
 *  one step milder: the tenant reported once and then stopped. */
export const healthLabel = (health: RuntimeHealth): string =>
  health === 'healthy' ? 'healthy'
    : health === 'degraded' ? 'degraded'
    : health === 'stale' ? 'stopped reporting'
    : 'not reporting'

export const operationalTone = (summary: OperationsSummary | undefined | null): Tone => {
  if (!summary) return 'muted'
  const dead = summary.outbox.dead + summary.deliveries.dead + summary.push.dead
  if (summary.watchdog.critical_alerts > 0 || dead > 0) return 'bad'
  if (summary.watchdog.active_alerts > 0 || summary.http.p95_ms > 1000 || oldestQueueAge(summary) > 300) return 'warn'
  return 'good'
}

export const operationalLabel = (summary: OperationsSummary | undefined | null): string => {
  const tone = operationalTone(summary)
  return tone === 'good' ? 'healthy' : tone === 'warn' ? 'attention' : tone === 'bad' ? 'degraded' : 'loading'
}

/** Turn a platform probe's raw status into something an operator can act on.
 *
 *  The probe stores whatever the HTTP client said, so the overview was printing
 *  `connect_failed:error sending request for url (http://crowdrelay-api-1:8080/
 *  v1/health/ready)` in the middle of a card. That string names a container the
 *  operator has never heard of, quotes a library's own phrasing, and never says
 *  what to do about it. Each branch below answers three questions instead:
 *  what happened, what it means for the tenant, and what changes it.
 *
 *  Unrecognised statuses fall through unchanged rather than being swallowed —
 *  a failure mode nobody has classified yet is still better read than hidden. */
export const platformStatusMessage = (status: string | null | undefined): string | null => {
  if (!status) return null
  const code = status.split(':', 1)[0]?.trim().toLowerCase() ?? ''

  if (code === 'connect_failed' || code === 'connection_refused') {
    return 'Not answering. The service is down, restarting, or not on this network yet.'
  }
  if (code === 'timeout' || code === 'timed_out') {
    return 'Answered too slowly to count as healthy. Usually load, sometimes a stuck dependency.'
  }
  if (code === 'dns_failed' || code === 'dns_error') {
    return 'Its address does not resolve. The service is not registered under that name.'
  }
  if (code === 'tls_error' || code === 'certificate_error') {
    return 'Its certificate was rejected. Expired or issued for a different hostname.'
  }

  const httpStatus = Number(code)
  if (Number.isInteger(httpStatus) && httpStatus >= 400) {
    if (httpStatus === 401 || httpStatus === 403) return 'Refused our credentials. The probe token needs renewing.'
    if (httpStatus === 404) return 'Answered, but has no health endpoint at that address.'
    if (httpStatus >= 500) return 'Answered with its own error. The service is up but unwell — check its logs.'
    return `Rejected the health check with HTTP ${httpStatus}.`
  }

  return status
}
