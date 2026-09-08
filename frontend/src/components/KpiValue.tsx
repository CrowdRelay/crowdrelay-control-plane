import { createEffect, createSignal, on, type JSX } from 'solid-js'

/** A KPI value that briefly flashes when it changes, drawing the
 *  operator's eye to fresh data on refresh. Respects reduced-motion
 *  via the CSS `@media(prefers-reduced-motion)` guard on the
 *  `kpi-flash` animation. */
export function KpiValue(props: { value: JSX.Element; class?: string }): JSX.Element {
  const [flash, setFlash] = createSignal(false)
  let firstRun = true

  // Trigger the flash class whenever the value changes. The `on`
  // comparator skips the initial render so the first appearance
  // doesn't flash — only subsequent updates do.
  createEffect(
    on(
      () => props.value,
      () => {
        if (firstRun) {
          firstRun = false
          return
        }
        setFlash(true)
        const timer = setTimeout(() => setFlash(false), 600)
        return () => clearTimeout(timer)
      },
      { defer: true },
    ),
  )

  return (
    <span
      class={`kpi-value ${flash() ? 'kpi-flash' : ''} ${props.class ?? ''}`.trim()}
    >
      {props.value}
    </span>
  )
}
