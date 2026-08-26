// Small formatting helpers shared by operator surfaces. Kept dependency-free
// so both page read models and panels can use them without cycles.

export const errorMessage = (value: unknown, fallback: string) =>
  value instanceof Error ? value.message : fallback

export const formatTimestamp = (value: string | null | undefined) => {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString()
}

export const formatAge = (seconds: number) => {
  if (seconds <= 0) return '—'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(seconds < 36_000 ? 1 : 0)}h`
}

export const oldestQueueAge = (summary: {
  outbox: { oldest_pending_seconds: number }
  deliveries: { oldest_pending_seconds: number }
  push: { oldest_pending_seconds: number }
}) => Math.max(
  summary.outbox.oldest_pending_seconds,
  summary.deliveries.oldest_pending_seconds,
  summary.push.oldest_pending_seconds,
)
