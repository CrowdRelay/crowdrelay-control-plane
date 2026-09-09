import type { OperationsSummary, RuntimeHealth } from './types'
import { oldestQueueAge } from './format'

// Shared health/operational tone utilities. Previously duplicated across
// OverviewPage, OperatorAttentionPage, TenantHealthPage, TenantOperationsPage,
// OperationsPanel, RuntimeSwitchesPanel, and Shell — each copy had drifted
// in thresholds and casing.

export type Tone = 'good' | 'warn' | 'bad' | 'muted'

export const healthTone = (health: RuntimeHealth): Tone =>
  health === 'healthy' ? 'good' : health === 'degraded' ? 'bad' : health === 'stale' ? 'warn' : 'muted'

export const healthLabel = (health: RuntimeHealth): string =>
  health === 'healthy' ? 'healthy' : health === 'degraded' ? 'degraded' : health === 'stale' ? 'stale' : 'unknown'

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
