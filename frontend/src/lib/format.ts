// Small formatting helpers shared by operator surfaces. Kept dependency-free
// so both page read models and panels can use them without cycles.

/** Backend error codes → the heading a person reads. One map for both
 *  consumers: `errorMessage` here duck-types `.code` (no ApiError import —
 *  api.ts is a heavier module and used to sit on a cycle) and `errorHeading`
 *  in api.ts delegates to this map for its typed ApiError switch. */
export const errorCodeMessage = (code: string): string | undefined => {
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
  return undefined
}

export const errorMessage = (value: unknown, fallback: string) => {
  if (value instanceof Error) {
    const code = (value as { code?: string }).code
    if (code) {
      const mapped = errorCodeMessage(code)
      if (mapped) return mapped
    }
    return value.message
  }
  return fallback
}

/** A stored enum token becomes the words a person would say:
 *  `awaiting_approval` → "awaiting approval", `membershipState` →
 *  "membership state", `crowdrelay.fan_lifecycle` → "crowdrelay fan
 *  lifecycle". A label map beats this when one exists — this is the floor
 *  that keeps an unmapped token from rendering as code. */
export const humanizeToken = (token: string): string => {
  // A string that already contains spaces is prose, not a token — pass it
  // through untouched so intentional casing ("async I/O active",
  // "Provisioner connected") survives.
  if (token.includes(' ')) return token
  return token
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.\-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/// Whether the operator has asked the OS to reduce motion.
///
/// Four animated components each carried a byte-identical copy of this, so a
/// change to how motion preference is read — or a fix to the `window`
/// guard — had to be made in four places or the surfaces would disagree.
/** A beacon's kind is stored as a lowercase enum token (`local_press`), and
 *  a folded entity wears several (`community · creator`). The list cell says
 *  the words a person would. */
export const beaconKindLabel = (kind: string) =>
  kind.split('·').map(token => token.trim().replace(/_/g, ' ')).join(' · ')

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/// Epoch milliseconds for a timestamp that may arrive as RFC 3339 text or a
/// `time` tuple; NaN for anything absent or unparseable — callers sort NaN
/// last via `compareTimestamps`, never let it decay into epoch 0.
export const timestampMillis = (value: string | number[] | null | undefined): number => {
  if (value == null) return NaN
  if (Array.isArray(value)) {
    if (isOffsetDateTimeTuple(value)) return timeArrayToDate(value).getTime()
    if (isDateTuple(value)) return Date.UTC(value[0] ?? 0, 0, value[1] ?? 1)
    return NaN
  }
  return Date.parse(value)
}

/// Upstream-provided URLs are scraped data, not trusted chrome: only http(s)
/// values may become an `href` — `javascript:`/`data:`/relative junk renders
/// as plain text via the caller's `Show` fallback instead of executing.
export const httpUrl = (value: string | null | undefined): string | null =>
  typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null

/// Ascending comparator with the unparseable at the end — a row whose
/// timestamp cannot be read sorts after real dates instead of pretending to
/// be 1970.
export const compareTimestamps = (
  a: string | number[] | null | undefined,
  b: string | number[] | null | undefined,
): number => {
  const ta = timestampMillis(a)
  const tb = timestampMillis(b)
  if (!Number.isFinite(ta)) return Number.isFinite(tb) ? 1 : 0
  if (!Number.isFinite(tb)) return -1
  return ta - tb
}

export const formatTimestamp = (value: string | number[] | null | undefined) => {
  if (!value) return '—'
  // A bare number[] is only a timestamp when it matches the OffsetDateTime
  // tuple shape — a 2-element Date tuple or stray array used to render a
  // plausible-but-wrong date (year 1901 and the like).
  const parsed = Array.isArray(value)
    ? (isOffsetDateTimeTuple(value) ? timeArrayToDate(value) : new Date(NaN))
    : new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString()
}

/** The `time` crate's serde form for `OffsetDateTime` — upstream artifacts
 * carry it verbatim: [year, ordinal, hour, minute, second, ns, offH, offM, offS]. */
const timeArrayToDate = (v: number[]) => {
  const [year = 0, ordinal = 1, hour = 0, minute = 0, second = 0, , offH = 0, offM = 0, offS = 0] = v
  return new Date(Date.UTC(year, 0, ordinal, hour, minute, second) - ((offH * 3600 + offM * 60 + offS) * 1000))
}

/** The `time` crate's serde form for `Date`: [year, ordinal]. */
const dateArrayToIsoDay = (v: number[]) =>
  new Date(Date.UTC(v[0] ?? 0, 0, v[1] ?? 1)).toISOString().slice(0, 10)

/** Range-checked so a plain integer array is never reformatted. The bounds
 * mirror what `OffsetDateTime` can serialize: real timezone offsets only
 * (±14h), and serde signs every offset component together — a 9-integer
 * vector that fails either rule is data, not a timestamp. */
const isOffsetDateTimeTuple = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length === 9 && v.every((n) => Number.isInteger(n)) &&
  v[0] >= 2000 && v[0] <= 2100 && v[1] >= 1 && v[1] <= 366 &&
  v[2] >= 0 && v[2] <= 23 && v[3] >= 0 && v[3] <= 59 && v[4] >= 0 && v[4] <= 60 &&
  v[5] >= 0 && v[6] >= -14 && v[6] <= 14 && v[7] >= -59 && v[7] <= 59 && v[8] >= -59 && v[8] <= 59 &&
  ((v[6] >= 0 && v[7] >= 0 && v[8] >= 0) || (v[6] <= 0 && v[7] <= 0 && v[8] <= 0))

const isDateTuple = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length === 2 &&
  Number.isInteger(v[0]) && Number.isInteger(v[1]) &&
  v[0] >= 2000 && v[0] <= 2100 && v[1] >= 1 && v[1] <= 366

/** A `JSON.stringify` replacer that renders stored `time` tuples as text.
 *
 *  Decision and outcome records written before wire-time formatting still
 *  hold `[2026, 268, 7, 0, 0, 0, 0, 0, 0]` inside `input_snapshot`,
 *  `policy_snapshot` and `recommendation` — hundreds of `content_supply`
 *  rows alone — and the evidence view showed them raw. Rows written now
 *  carry RFC 3339 text, which passes straight through. */
export const wireJsonReplacer = (_key: string, value: unknown): unknown => {
  if (isOffsetDateTimeTuple(value)) return timeArrayToDate(value).toISOString()
  if (isDateTuple(value)) return dateArrayToIsoDay(value)
  return value
}

export const formatAge = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
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

/// Formats an ISO timestamp as a countdown ("in 3d", "in 5h", "now").
/// Past timestamps render as the age — a deadline that already passed is
/// "3d ago", not a negative countdown.
export const formatIsoUntil = (iso: string) => {
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return '—'
  const diff = ms - Date.now()
  if (diff <= 0) return formatIsoAge(iso)
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `in ${Math.max(1, mins)}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `in ${hours}h`
  return `in ${Math.floor(hours / 24)}d`
}

/// '45s' / '12m' / '3h' / '2d' — a compact duration for live surfaces.
/// Distinct from `formatAge`, which never reaches days.
export const compactDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

/// Seconds between an ISO timestamp and `nowMs` — null when the timestamp
/// is unparseable or lands in the future (a clock-skewed row is not a zero
/// age, it is no reading at all).
export const ageSeconds = (iso: string, nowMs: number): number | null => {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  const seconds = Math.floor((nowMs - ms) / 1000)
  return seconds < 0 ? null : seconds
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

/// Oldest pending item across the async lanes that actually reported.
/// All three absent means nobody answered — null, not a confident 0s.
export const oldestQueueAge = (summary: {
  outbox?: { oldest_pending_seconds: number } | null
  deliveries?: { oldest_pending_seconds: number } | null
  push?: { oldest_pending_seconds: number } | null
}) => {
  const ages = [summary.outbox, summary.deliveries, summary.push]
    .map(lane => lane?.oldest_pending_seconds)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  return ages.length > 0 ? Math.max(...ages) : null
}

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

export const currencyFractionDigits = (currency: string) => {
  try {
    return (
      new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

export const money = (minor: number, currency: string) =>
  (minor / 10 ** currencyFractionDigits(currency)).toLocaleString(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  })
