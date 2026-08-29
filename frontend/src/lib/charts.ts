// Lightweight inline SVG chart helpers — no external dependency.
// Each function returns an SVG path string or element string that a
// component can embed in an <svg> element. Values are scaled to the
// given width/height.

/// Format a number for compact display (1.2k, 3.4M, etc.)
export const compactNumber = (value: number): string => {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

/// Trend direction derived from a delta value.
export const trendDirection = (delta: number | null | undefined): 'up' | 'down' | 'flat' | 'unknown' => {
  if (delta == null || !Number.isFinite(delta)) return 'unknown'
  if (delta > 0) return 'up'
  if (delta < 0) return 'down'
  return 'flat'
}

/// Trend arrow symbol.
export const trendArrow = (dir: ReturnType<typeof trendDirection>): string => {
  switch (dir) {
    case 'up': return '↑'
    case 'down': return '↓'
    case 'flat': return '→'
    default: return '—'
  }
}
