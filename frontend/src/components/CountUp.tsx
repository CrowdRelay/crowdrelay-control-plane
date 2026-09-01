import { createEffect, createSignal, onCleanup, type Component } from 'solid-js'
import { prefersReducedMotion } from '../lib/format'

// Animated number counter — ramps from 0 to target on mount, and
// re-animates from the previous value when the prop changes.
// Uses requestAnimationFrame with ease-out cubic. Respects
// prefers-reduced-motion (jumps to final value instantly).
//
// Usage:
//   <CountUp value={42} />
//   <CountUp value={1337} duration={800} format={(n) => `${n}%`} />


const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

export const CountUp: Component<{
  value: number
  duration?: number
  format?: (n: number) => string
  class?: string
}> = (props) => {
  const duration = () => props.duration ?? 600
  const format = () => props.format ?? ((n: number) => String(Math.round(n)))
  const [display, setDisplay] = createSignal(0)

  let rafId = 0

  // Re-run whenever props.value changes — animates from current display
  // to the new target. Also fires on mount (initial display is 0).
  createEffect(() => {
    const target = props.value
    if (rafId) cancelAnimationFrame(rafId)

    if (prefersReducedMotion() || target === 0) {
      setDisplay(target)
      return
    }

    const startVal = display()
    const delta = target - startVal
    if (delta === 0) return

    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration(), 1)
      setDisplay(startVal + delta * easeOutCubic(progress))
      if (progress < 1) {
        rafId = requestAnimationFrame(tick)
      } else {
        setDisplay(target)
        rafId = 0
      }
    }
    rafId = requestAnimationFrame(tick)
  })

  onCleanup(() => {
    if (rafId) cancelAnimationFrame(rafId)
  })

  return <span class={props.class ?? 'kpi-value'}>{format()(display())}</span>
}
