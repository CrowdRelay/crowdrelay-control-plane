import { type Component } from 'solid-js'
import { prefersReducedMotion } from '../lib/format'

// Inline SVG sparkline — no dependency. Draws a line + gradient fill.
// Animates the line draw on mount via CSS stroke-dashoffset.
//
// Usage:
//   <Sparkline data={[3, 7, 2, 8, 5, 10]} />
//   <Sparkline data={points} width={120} height={32} color="var(--good)" />


export const Sparkline: Component<{
  data: number[]
  width?: number
  height?: number
  color?: string
  fillOpacity?: number
  strokeWidth?: number
}> = (props) => {
  const w = () => props.width ?? 100
  const h = () => props.height ?? 28
  const color = () => props.color ?? 'var(--accent)'
  const fillOpacity = () => props.fillOpacity ?? 0.12
  const strokeWidth = () => props.strokeWidth ?? 1.5
  const pad = 2

  const points = () => {
    const data = props.data
    if (!data || data.length < 2) return []
    const max = Math.max(...data)
    const min = Math.min(...data)
    const range = max - min || 1
    const stepX = (w() - pad * 2) / (data.length - 1)
    return data.map((v, i) => ({
      x: pad + i * stepX,
      y: pad + (h() - pad * 2) * (1 - (v - min) / range),
    }))
  }

  const linePath = () => {
    const pts = points()
    if (pts.length < 2) return ''
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  }

  const fillPath = () => {
    const pts = points()
    if (pts.length < 2) return ''
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    return `${line} L ${pts[pts.length - 1]!.x.toFixed(1)} ${h()} L ${pts[0]!.x.toFixed(1)} ${h()} Z`
  }

  const pathLen = () => {
    const pts = points()
    if (pts.length < 2) return 200
    let len = 0
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i]!.x - pts[i - 1]!.x
      const dy = pts[i]!.y - pts[i - 1]!.y
      len += Math.sqrt(dx * dx + dy * dy)
    }
    return Math.ceil(len)
  }

  const gid = `spark-${Math.random().toString(36).slice(2, 8)}`
  const animate = !prefersReducedMotion()

  return (
    <svg width={w()} height={h()} viewBox={`0 0 ${w()} ${h()}`} fill="none" aria-hidden="true" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color={color()} stop-opacity={fillOpacity()} />
          <stop offset="100%" stop-color={color()} stop-opacity="0" />
        </linearGradient>
      </defs>
      {points().length >= 2 && (
        <>
          <path d={fillPath()} fill={`url(#${gid})`} />
          <path
            d={linePath()}
            stroke={color()}
            stroke-width={strokeWidth()}
            stroke-linecap="round"
            stroke-linejoin="round"
            style={animate ? {
              'stroke-dasharray': `${pathLen()}`,
              'stroke-dashoffset': animate ? `${pathLen()}` : '0',
              animation: `drawLine ${Math.min(800, pathLen() * 3)}ms ease-out forwards`,
              '--len': `${pathLen()}`,
            } : undefined}
          />
        </>
      )}
    </svg>
  )
}
