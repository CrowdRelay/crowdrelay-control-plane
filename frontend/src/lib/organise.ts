import type { CityFunnelRow } from './types'

// The city-funnel vocabulary — shared by the Places page's funnel table and
// the city detail page, which render the same verdicts about the same rows.
// The tab-label gate enforces one word per concept across pages: these
// labels are that one word's single home.

/** A missing number reads as "—", never as 0.
 *
 *  This matters more here than on most panels. `typical_draw` is null when no
 *  marked show at a room sold tickets through us — an unmeasured night, not an
 *  empty one — and rendering that as 0 would rank a room nobody has measured
 *  below a room that genuinely draws nobody. */
export const count = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString()

export const draw = (value: number | null) => (value == null ? '—' : Math.round(value).toLocaleString())

/** Months since the last show, with "never" kept distinct from "a long time".
 *
 *  A band that has never played a city and a band that played it two years ago
 *  need opposite things — an introduction versus a reason to come back — so the
 *  two never collapse into one string. */
export const lastPlayed = (row: CityFunnelRow) => {
  if (row.last_show_at == null) return 'never played'
  if (row.months_since_show == null) return 'played, date unclear'
  if (row.months_since_show === 0) return 'this month'
  return `${row.months_since_show} mo ago`
}

/** The organise score as a plain word.
 *
 *  Basis points are how the domain computes it and not how a person reads it.
 *  The bands are coarse because the score's own inputs are coarse; showing
 *  "6,840" would imply a precision the formula does not have. */
export const organiseBand = (bp: number): { label: string; variant: 'success' | 'warning' | 'muted' } => {
  if (bp >= 6_000) return { label: 'organise now', variant: 'success' }
  if (bp >= 3_000) return { label: 'worth a look', variant: 'warning' }
  return { label: 'not yet', variant: 'muted' }
}
