// Small formatting helpers shared by operator surfaces. Kept dependency-free
// so both page read models and panels can use them without cycles.

export const errorMessage = (value: unknown, fallback: string) => {
  if (value instanceof Error) {
    // ApiError carries a code that maps to a better heading than the raw
    // detail. Import lazily to avoid a circular dependency.
    const code = (value as { code?: string }).code
    if (code) {
      switch (code) {
        case 'unauthorized': return 'Session expired — please log in again.'
        case 'forbidden': return "You don't have permission to do that."
        case 'not_found': return 'That item no longer exists.'
        case 'conflict': return 'That name or value is already taken.'
        case 'invalid_input': return 'Check the entered values and try again.'
        case 'unavailable': return 'That service is temporarily unavailable.'
        case 'internal_error': return 'Internal error — check server logs for details.'
        // Typed upstream error variants — preserve the semantic distinction
        // instead of collapsing to generic "unavailable".
        case 'all_sections_failed': return 'Every section of this channel failed — see the per-section diagnosis below.'
        case 'upstream_timeout': return 'The tenant did not respond in time — retry may clear it.'
        case 'upstream_unreachable': return 'The tenant could not be reached — check the runtime and its tunnel.'
        case 'upstream_error': return 'The tenant returned an error — check its logs.'
        case 'contract_mismatch': return 'The tenant answered in an unrecognised shape — treat these numbers as unknown.'
      }
    }
    return value.message
  }
  return fallback
}

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
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return 'recently'
  const diff = Date.now() - ms
  if (diff < 0) return 'just now'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/// Formats a epoch-ms timestamp as a relative age string ("just now", "5m ago").
/// Used for per-panel "Updated Xm ago" labels from query.dataUpdatedAt.
export const relativeTime = (timestamp: number | undefined): string => {
  if (!timestamp) return '—'
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
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

/** Money the operator sees, from the micro-USD the LLM ledger stores.
 *
 *  Sub-cent amounts keep four decimals because a single task genuinely costs
 *  $0.0003 and rounding it to $0.00 would say the work was free. Exactly zero
 *  is not a sub-cent amount, though, and `$0.0000` on a spend tile reads as a
 *  precision no one asked for rather than as "nothing spent yet".
 */
export const formatUsd = (microUsd: number): string => {
  const usd = microUsd / 1_000_000
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

/** Confidence the operator reads, from the basis points the autopilot stores.
 *
 *  The scale is 0–10000, so a percentage is basis points over 100. The naive
 *  `Math.round` collapses everything under half a percent to `0%`, and `0%`
 *  does not mean "very low" — it means "none", which is the one thing the
 *  autopilot never records. Agent proposals in particular are written at
 *  exactly 1 basis point (`AGENT_PROPOSAL_EVIDENCE_BASIS_POINTS`), because
 *  they carry no measured evidence yet; printing that as `0%` told the
 *  operator the brain had no confidence in a suggestion it had just made.
 *
 *  This lived as four separate copies plus two inline ternaries, and one copy
 *  still used `toFixed(0)` — so the same number read `< 1%` on the opportunity
 *  board and `0%` in reply triage.
 */
export const confidencePercent = (basisPoints: number): string => {
  if (!Number.isFinite(basisPoints) || basisPoints <= 0) return '0%'
  const percent = basisPoints / 100
  if (percent < 1) return '< 1%'
  if (percent > 99 && percent < 100) return '> 99%'
  return `${Math.round(percent)}%`
}
