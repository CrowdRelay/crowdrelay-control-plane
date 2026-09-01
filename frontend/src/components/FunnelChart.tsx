import { For, type Component } from 'solid-js'
import { prefersReducedMotion } from '../lib/format'

// SVG trapezoid funnel — each stage is a trapezoid whose top width
// is proportional to the previous stage and bottom width to the current.
// Animated on mount via CSS (scaleY from 0 to 1). Shows conversion rates
// between stages. Respects prefers-reduced-motion.
//
// Usage:
//   <FunnelChart stages={[{label, value, hint}, ...]} />


export interface FunnelStage {
  label: string
  value: number
  hint?: string
}

export const FunnelChart: Component<{
  stages: FunnelStage[]
  height?: number
  maxWidth?: number
}> = (props) => {
  const W = () => props.maxWidth ?? 480
  const H = () => props.height ?? 280
  const stageH = () => H() / Math.max(1, props.stages.length)
  const pad = 16

  const maxVal = () => Math.max(1, ...props.stages.map(s => s.value))

  // Width of a stage's top edge (proportional to previous stage value,
  // or full width for the first stage).
  const topWidth = (i: number): number => {
    if (i === 0) return W() - pad * 2
    const prev = props.stages[i - 1]!.value
    return Math.max(40, ((prev / maxVal()) * (W() - pad * 2)))
  }

  const bottomWidth = (i: number): number => {
    const v = props.stages[i]!.value
    return Math.max(40, ((v / maxVal()) * (W() - pad * 2)))
  }

  const trapezoid = (i: number): string => {
    const tw = topWidth(i)
    const bw = bottomWidth(i)
    const cx = W() / 2
    const y0 = i * stageH()
    const y1 = (i + 1) * stageH()
    return `M ${cx - tw / 2} ${y0} L ${cx + tw / 2} ${y0} L ${cx + bw / 2} ${y1} L ${cx - bw / 2} ${y1} Z`
  }

  const labelY = (i: number): number => i * stageH() + stageH() / 2

  const conversionRate = (i: number): number | null => {
    if (i === 0) return null
    const prev = props.stages[i - 1]!.value
    const curr = props.stages[i]!.value
    if (prev <= 0) return null
    return Math.round((curr / prev) * 100)
  }

  const animate = !prefersReducedMotion()
  const stageColors = [
    'var(--accent)',
    'var(--accent-2, var(--accent))',
    'var(--good)',
    'var(--warn)',
    'var(--bad)',
  ]

  const gid = `funnel-${Math.random().toString(36).slice(2, 8)}`

  return (
    <svg width={W()} height={H() + 24} viewBox={`0 0 ${W()} ${H() + 24}`} fill="none" style={{ width: '100%', 'max-width': `${W()}px` }}>
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.25" />
          <stop offset="50%" stop-color="var(--accent)" stop-opacity="0.45" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.25" />
        </linearGradient>
      </defs>
      <For each={props.stages}>{(stage, i) => (
        <g
          style={animate ? {
            'transform-origin': `center ${i() * stageH() + stageH() / 2}px`,
            animation: `funnelScaleYIn 400ms ${i() * 80}ms ease-out forwards`,
          } : undefined}
        >
          <path
            d={trapezoid(i())}
            fill={`url(#${gid})`}
            stroke={stageColors[i() % stageColors.length] ?? 'var(--accent)'}
            stroke-width="1"
            stroke-opacity="0.5"
          />
          <text
            x={W() / 2}
            y={labelY(i()) - 4}
            text-anchor="middle"
            fill="var(--text)"
            font-size="13"
            font-weight="700"
          >
            {stage.label}
          </text>
          <text
            x={W() / 2}
            y={labelY(i()) + 12}
            text-anchor="middle"
            fill="var(--muted)"
            font-size="11"
          >
            {stage.value}
            {conversionRate(i()) != null && `  ·  ${conversionRate(i())}% from previous`}
          </text>
        </g>
      )}</For>
    </svg>
  )
}
