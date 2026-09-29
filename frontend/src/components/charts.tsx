import { For, Show, type JSX } from 'solid-js'
import { Minus, TrendingDown, TrendingUp } from 'lucide-solid'
import { Card } from './app/card'
import { cn } from '../lib/cn'

// Dashboard widgets and the few charts they draw — hand-rolled SVG over the
// theme's `--chart-*` tokens, so dark mode and the palette come for free and
// no chart library ships for a ring, a donut and some bars.

/** A bordered tile with a label on top. The dashboard's unit. */
export function Widget(props: {
  label: string
  icon?: JSX.Element
  action?: JSX.Element
  children: JSX.Element
  class?: string
}) {
  return (
    <Card class={cn('flex min-w-0 flex-col gap-4 p-5', props.class)}>
      <div class="flex items-center justify-between gap-3">
        <span class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Show when={props.icon}><span class="text-muted-foreground">{props.icon}</span></Show>
          {props.label}
        </span>
        <Show when={props.action}><span class="text-sm">{props.action}</span></Show>
      </div>
      {props.children}
    </Card>
  )
}

/** A change against a window: arrow, signed figure, window label. Zero and
 *  unknown are drawn as flat, not as a green nothing. */
export function DeltaBadge(props: { value: number | null | undefined; label: string; class?: string }) {
  const finite = () => typeof props.value === 'number' && Number.isFinite(props.value)
  const dir = () => (!finite() || props.value === 0 ? 0 : props.value! > 0 ? 1 : -1)
  return (
    <span
      class={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        dir() > 0 && 'bg-success text-success-foreground',
        dir() < 0 && 'bg-error text-error-foreground',
        dir() === 0 && 'bg-muted text-muted-foreground',
        props.class,
      )}
    >
      <Show when={dir() > 0} fallback={<Show when={dir() < 0} fallback={<Minus class="size-3" aria-hidden="true" />}><TrendingDown class="size-3" aria-hidden="true" /></Show>}>
        <TrendingUp class="size-3" aria-hidden="true" />
      </Show>
      {!finite() ? '—' : `${props.value! > 0 ? '+' : ''}${props.value!.toLocaleString()}`}
      <span class="font-normal opacity-80">{props.label}</span>
    </span>
  )
}

// A circle of radius 100/2π has a circumference of exactly 100, so a dash
// length is a percentage with no arithmetic.
const R = 15.9155

/** A single share of a whole, with whatever the caller puts in the middle. */
export function Ring(props: {
  /** 0..1; null draws the empty track. */
  value: number | null
  label: string
  class?: string
  arcClass?: string
  children?: JSX.Element
}) {
  const pct = () => Math.max(0, Math.min(1, props.value ?? 0)) * 100
  return (
    <div class={cn('relative size-28 shrink-0', props.class)}>
      <svg viewBox="0 0 36 36" class="size-full -rotate-90" role="img" aria-label={props.label}>
        <circle cx="18" cy="18" r={R} fill="none" stroke-width="3.5" class="stroke-muted" />
        <Show when={pct() > 0}>
          <circle
            cx="18" cy="18" r={R} fill="none" stroke-width="3.5" stroke-linecap="round"
            stroke-dasharray={`${pct()} ${100 - pct()}`}
            class={cn('stroke-chart-2 transition-[stroke-dasharray] duration-500 ease-out', props.arcClass)}
          />
        </Show>
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center text-center">{props.children}</div>
    </div>
  )
}

export type Segment = { key: string; label: string; value: number; class: string }

/** Parts of a whole as arcs. `class` on a segment is its stroke colour. */
export function Donut(props: { segments: Segment[]; label: string; class?: string; children?: JSX.Element }) {
  const total = () => props.segments.reduce((sum, s) => sum + s.value, 0)
  // Each arc starts where the previous ended; a small gap separates them
  // when there is more than one. Non-finite or negative segments cannot
  // draw an arc — leaving them in writes "NaN" into stroke-dasharray.
  const arcs = () => {
    const t = total()
    if (!(t > 0) || !Number.isFinite(t)) return []
    const visible = props.segments.filter(s => s.value > 0 && Number.isFinite(s.value))
    const gap = visible.length > 1 ? 1.2 : 0
    let offset = 0
    return visible.map(s => {
      const len = (s.value / t) * 100
      const arc = { ...s, dash: Math.max(len - gap, 0.1), offset }
      offset += len
      return arc
    })
  }
  return (
    <div class={cn('relative size-32 shrink-0', props.class)}>
      <svg viewBox="0 0 36 36" class="size-full -rotate-90" role="img" aria-label={props.label}>
        <circle cx="18" cy="18" r={R} fill="none" stroke-width="4" class="stroke-muted" />
        <For each={arcs()}>{a => (
          <circle
            cx="18" cy="18" r={R} fill="none" stroke-width="4"
            stroke-dasharray={`${a.dash} ${100 - a.dash}`}
            stroke-dashoffset={-a.offset}
            class={a.class}
          >
            <title>{`${a.label}: ${a.value.toLocaleString()}`}</title>
          </circle>
        )}</For>
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center text-center">{props.children}</div>
    </div>
  )
}

/** Parts of a whole as one bar. `class` on a segment is its fill. An empty
 *  total draws the bare track. */
export function StackBar(props: { segments: Segment[]; label: string; class?: string }) {
  const total = () => props.segments.reduce((sum, s) => sum + s.value, 0)
  return (
    <div
      role="img"
      aria-label={props.label}
      class={cn('flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted', props.class)}
    >
      <For each={props.segments.filter(s => s.value > 0 && Number.isFinite(s.value))}>{s => (
        <div
          class={cn('h-full transition-[width] duration-500 ease-out', s.class)}
          style={{ width: `${total() > 0 && Number.isFinite(total()) ? (s.value / total()) * 100 : 0}%` }}
          title={`${s.label}: ${s.value.toLocaleString()}`}
        />
      )}</For>
    </div>
  )
}

/** Legend for a StackBar or Donut: dot, label, figure. A Donut's segments
 *  carry stroke classes, so they name their dot's fill in `dot`. */
export function Legend(props: { segments: Array<Segment & { note?: string; dot?: string }>; class?: string }) {
  return (
    <ul class={cn('flex flex-col gap-1.5 text-sm', props.class)}>
      <For each={props.segments}>{s => (
        <li class="flex items-center gap-2">
          <span class={cn('size-2 shrink-0 rounded-full', s.dot ?? s.class)} aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate text-muted-foreground">{s.label}</span>
          <span class="tabular-nums font-medium text-foreground">{s.value.toLocaleString()}</span>
          <Show when={s.note}><span class="text-xs tabular-nums text-success-foreground">{s.note}</span></Show>
        </li>
      )}</For>
    </ul>
  )
}

/** Horizontal bars against a shared maximum, each labelled with its figure
 *  and an optional note (a share, a rate). */
export function BarList(props: {
  rows: Array<{ label: string; value: number | null | undefined; note?: string; class?: string }>
  format?: (value: number) => string
  class?: string
}) {
  const max = () => Math.max(...props.rows.map(r => r.value ?? 0)) || 1
  return (
    <ul class={cn('flex flex-col gap-3', props.class)}>
      <For each={props.rows}>{row => (
        <li class="flex flex-col gap-1.5">
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span class="text-muted-foreground">{row.label}</span>
            <span class="flex items-baseline gap-2">
              <Show when={row.note}><span class="text-xs tabular-nums text-muted-foreground">{row.note}</span></Show>
              <span class="font-semibold tabular-nums text-foreground">{row.value == null ? '—' : props.format ? props.format(row.value) : row.value.toLocaleString()}</span>
            </span>
          </div>
          <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              class={cn('h-full rounded-full transition-[width] duration-500 ease-out', row.class ?? 'bg-chart-2')}
              style={{ width: `${((row.value ?? 0) / max()) * 100}%` }}
            />
          </div>
        </li>
      )}</For>
    </ul>
  )
}
