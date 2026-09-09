import type { JSX } from 'solid-js'
import { cn } from '../lib/cn'

/** A KPI value rendered with tabular figures for numeric alignment. */
export function KpiValue(props: { value: JSX.Element; class?: string }): JSX.Element {
  return (
    <span
      class={cn('text-2xl font-bold tabular-nums tracking-tight leading-none text-foreground', props.class)}
    >
      {props.value}
    </span>
  )
}
