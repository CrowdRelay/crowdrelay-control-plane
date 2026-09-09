import type { JSX } from 'solid-js'

/** A KPI value rendered with tabular figures for numeric alignment. */
export function KpiValue(props: { value: JSX.Element; class?: string }): JSX.Element {
  return (
    <span
      class={`kpi-value tabular-nums ${props.class ?? ''}`.trim()}
    >
      {props.value}
    </span>
  )
}
