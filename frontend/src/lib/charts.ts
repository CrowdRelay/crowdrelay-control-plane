// Lightweight inline SVG chart helpers — no external dependency.
// Each function returns an SVG path string or element string that a
// component can embed in an <svg> element. Values are scaled to the
// given width/height.

/// Build a smooth-ish sparkline path from a series of y-values.
/// Returns a string suitable for the `d` attribute of an SVG <path>.
export const sparkline = (values: number[], width: number, height: number): string => {
  if (values.length === 0) return ''
  if (values.length === 1) return `M 0 ${height / 2} L ${width} ${height / 2}`
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = width / (values.length - 1)
  return values
    .map((v, i) => {
      const x = i * step
      const y = height - ((v - min) / range) * height
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

/// Build an area chart path (closed shape) from {x, y} points.
/// `points` should be pre-scaled to 0..width / 0..height.
export const areaPath = (
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number,
): string => {
  if (points.length === 0) return ''
  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')
  return `${line} L ${width} ${height} L 0 ${height} Z`
}

/// Scale raw {value, label} data points to pixel coordinates for an area chart.
export const scalePoints = (
  data: Array<{ value: number; label?: string }>,
  width: number,
  height: number,
): Array<{ x: number; y: number; value: number; label?: string }> => {
  if (data.length === 0) return []
  const min = Math.min(...data.map((d) => d.value))
  const max = Math.max(...data.map((d) => d.value))
  const range = max - min || 1
  const step = data.length > 1 ? width / (data.length - 1) : width
  return data.map((d, i) => ({
    x: i * step,
    y: height - ((d.value - min) / range) * height,
    value: d.value,
    label: d.label,
  }))
}

/// Progress bar: returns the width percentage for a progress fill.
export const progressWidth = (current: number, target: number, maxWidth: number): number => {
  if (target <= 0) return 0
  const pct = Math.min(1, Math.max(0, current / target))
  return Math.round(pct * maxWidth)
}

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
