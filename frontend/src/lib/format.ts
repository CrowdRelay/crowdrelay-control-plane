// Small formatting helpers shared by operator surfaces. Kept dependency-free
// so both page read models and panels can use them without cycles.

export const errorMessage = (value: unknown, fallback: string) =>
  value instanceof Error ? value.message : fallback

/// Whether the operator has asked the OS to reduce motion.
///
/// Four animated components each carried a byte-identical copy of this, so a
/// change to how motion preference is read — or a fix to the `window`
/// guard — had to be made in four places or the surfaces would disagree.
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

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

/// Formats an ISO timestamp as a relative age string ("just now", "5m ago", etc.)
export const formatIsoAge = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
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
