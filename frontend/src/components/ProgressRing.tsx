import { createEffect, createSignal, onCleanup, type Component } from 'solid-js'

// SVG progress ring with animated stroke-dashoffset.
// Re-animates from the previous value when the prop changes.
// Color thresholds: green < warn < bad. Glow on active.
//
// Usage:
//   <ProgressRing value={75} size={48} />
//   <ProgressRing value={92} size={64} label="health" />

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

const toneForValue = (v: number): 'good' | 'warn' | 'bad' => {
  if (v >= 75) return 'good'
  if (v >= 50) return 'warn'
  return 'bad'
}

const toneColor: Record<string, string> = {
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  // "We have no reading" is not "everything is on fire": a fleet that has
  // never reported must not render in the same red as a failing one.
  muted: 'var(--text-muted)',
}

// Map tone to a concrete RGBA for drop-shadow (CSS var() doesn't work inside filter).
const toneGlow: Record<string, string> = {
  good: 'rgba(34,197,94,0.35)',
  warn: 'rgba(245,158,11,0.35)',
  bad: 'rgba(239,68,68,0.35)',
  muted: 'rgba(139,146,160,0.25)',
}

export const ProgressRing: Component<{
  value: number
  size?: number
  strokeWidth?: number
  label?: string
  showValue?: boolean
  tone?: 'good' | 'warn' | 'bad' | 'muted'
}> = (props) => {
  const size = () => props.size ?? 48
  const sw = () => props.strokeWidth ?? 4
  const r = () => (size() - sw()) / 2
  const circumference = () => 2 * Math.PI * r()
  const clamped = () => Math.max(0, Math.min(100, props.value))
  const tone = () => props.tone ?? toneForValue(clamped())
  const color = () => toneColor[tone()] ?? 'var(--accent)'
  const glow = () => toneGlow[tone()] ?? 'rgba(155,135,245,0.3)'
  const showValue = () => props.showValue ?? true

  const [animatedValue, setAnimatedValue] = createSignal(0)
  let rafId = 0

  // Re-run whenever props.value changes — animates from current value
  // to the new target. Also fires on mount (initial value is 0).
  createEffect(() => {
    const target = clamped()
    if (rafId) cancelAnimationFrame(rafId)

    if (prefersReducedMotion()) {
      setAnimatedValue(target)
      return
    }

    const startVal = animatedValue()
    const delta = target - startVal
    if (delta === 0) return

    const start = performance.now()
    const duration = 800
    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      setAnimatedValue(startVal + delta * easeOutCubic(progress))
      if (progress < 1) rafId = requestAnimationFrame(tick)
      else { setAnimatedValue(target); rafId = 0 }
    }
    rafId = requestAnimationFrame(tick)
  })

  onCleanup(() => { if (rafId) cancelAnimationFrame(rafId) })

  const offset = () => circumference() - (animatedValue() / 100) * circumference()

  return (
    <div class="progress-ring" style={{ width: `${size()}px`, height: `${size()}px`, position: 'relative' }}>
      <svg width={size()} height={size()} viewBox={`0 0 ${size()} ${size()}`}>
        <circle
          cx={size() / 2}
          cy={size() / 2}
          r={r()}
          fill="none"
          stroke="var(--glass-border)"
          stroke-width={sw()}
        />
        <circle
          cx={size() / 2}
          cy={size() / 2}
          r={r()}
          fill="none"
          stroke={color()}
          stroke-width={sw()}
          stroke-linecap="round"
          stroke-dasharray={`${circumference()}`}
          stroke-dashoffset={`${offset()}`}
          transform={`rotate(-90 ${size() / 2} ${size() / 2})`}
          style={{ filter: `drop-shadow(0 0 4px ${glow()})` }}
        />
      </svg>
      {/* An empty ring reads as broken. With no value to show, say so. */}
      <span class="progress-ring-value" style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        'font-size': `${size() * (showValue() ? 0.22 : 0.26)}px`,
        'font-weight': '800',
        'font-variant-numeric': 'tabular-nums',
        color: color(),
      }}>
        {showValue() ? `${Math.round(animatedValue())}${props.label ? '' : '%'}` : '—'}
      </span>
      {props.label && (
        <span class="progress-ring-label" style={{
          position: 'absolute',
          bottom: '-18px',
          left: '50%',
          transform: 'translateX(-50%)',
          'font-size': '0.65rem',
          color: 'var(--muted)',
          'white-space': 'nowrap',
        }}>
          {props.label}
        </span>
      )}
    </div>
  )
}
