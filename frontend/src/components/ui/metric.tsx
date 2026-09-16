import { Show, type JSX } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * Metric — one measured figure, and `MetricRow`, the rail they sit on.
 *
 * The console had three idioms for the same object. A `KpiCard` drew a
 * rounded bordered box; the runtime tab drew `<Card class="rounded-lg p-3.5">`
 * with a span over a strong; the learning loop drew
 * `<div class="p-3 rounded-md bg-surface-1">` with the same span and strong.
 * Same content, three shapes, so a page that showed two of them read as two
 * unrelated components rather than one kind of thing.
 *
 * This is the one shape, taken from the public site's audit section, where
 * three numbers introduce the map below them:
 *
 *   "as one hairline-divided row rather than three cards: they introduce the
 *    map below, they do not compete with it"
 *
 * That is the whole argument. A strip of figures at the top of a page is not
 * five objects to be inspected; it is one reading, divided. Boxes give each
 * number a border, a fill and a corner radius it has not earned, and the page
 * then has to out-shout its own summary. Hairlines separate without framing.
 *
 * Semantics follow the same source: a `<dl>` of `<dt>`/`<dd>` pairs, so a
 * screen reader hears "Active fans: 20" as a pair rather than as two loose
 * strings.
 *
 * The site reverses the column so the figure sits above its label; here the
 * label stays on top. Its cells carry a third line — what the figure is
 * measured against — and a reversed column cannot put three lines in the
 * order value, label, note without either breaking `dl`'s required
 * `dt`-before-`dd` or fighting it with `order`, which is how the first cut of
 * this rendered the note above the figure.
 */

const VALUE_TONE = {
  default: 'text-foreground',
  good: 'text-success-foreground',
  warn: 'text-warning-foreground',
  bad: 'text-destructive',
  // The headline reading of a strip. Panels used to mark theirs with a tinted
  // fill and a ring — a box drawn around one cell of a row that has no boxes.
  // Colour on the figure does the same job without breaking the rail.
  primary: 'text-primary',
} as const

export type MetricTone = keyof typeof VALUE_TONE

export function Metric(props: {
  label: JSX.Element
  value: JSX.Element
  /** One line under the figure: what it is measured against. */
  sub?: JSX.Element
  tone?: MetricTone
  /**
   * Mark a figure that arrived late — after the section it belongs to had
   * already rendered without it. It fades in once rather than appearing in
   * place, so an operator who has already read the strip notices that one of
   * the numbers has changed under them.
   */
  fresh?: boolean
  class?: string
}) {
  const tone = () => props.tone ?? 'default'
  // An em dash is what every formatter in `lib/format` returns for a reading
  // nobody has: `fmt`, `metric`, `confidencePercent`. At the figure's weight
  // and size it draws as a short thick rule that reads as a filled bar, and a
  // `tone` meant for the number it stands in for coloured it — a green dash
  // claiming health for a value the console does not have. An absent reading
  // is drawn as absent.
  const unknown = () => props.value === '—'
  return (
    <div
      data-metric=""
      data-fresh={props.fresh ? '' : undefined}
      class={cn(
        'flex min-w-0 flex-col gap-1.5 px-4 py-3.5',
        // The rail draws the dividers, so the first cell in each row sheds its
        // left padding and sits flush with the page's text column.
        'first:pl-0',
        props.class,
      )}
    >
      <dt class="text-xs leading-snug text-muted-foreground">{props.label}</dt>
      <dd
        class={cn(
          'm-0 text-2xl font-bold leading-none tracking-tight tabular-nums',
          unknown() ? 'text-muted-foreground/60' : VALUE_TONE[tone()],
        )}
      >
        {props.value}
      </dd>
      <Show when={props.sub}>
        <dd class="m-0 text-xs leading-snug text-muted-foreground">{props.sub}</dd>
      </Show>
    </div>
  )
}

/**
 * The rail: hairlines above and below, one between each pair.
 *
 * `auto-fit` keeps a row of three from leaving a gap where a fourth would go,
 * and wraps to a second line rather than crushing a figure below its label.
 * A wrapped cell keeps its top hairline, so the grid still reads as a table
 * of readings instead of a paragraph of them.
 */
export function MetricRow(props: { children: JSX.Element; class?: string; min?: string }) {
  return (
    <dl
      // `data-kpi-strip` is the name the Playwright selector contract pins —
      // the MetricRow refactor dropped it and css-audit silently lost its
      // KPI coverage. Keep both attributes.
      data-kpi-strip=""
      data-metric-row=""
      class={cn(
        'my-0 grid border-y border-border',
        '[grid-template-columns:repeat(auto-fit,minmax(var(--metric-min),1fr))]',
        // Dividers between cells, drawn by the cell so a wrapped row is still
        // separated from the one above it.
        '[&>[data-metric]]:border-l [&>[data-metric]]:border-border',
        '[&>[data-metric]:first-child]:border-l-0',
        props.class,
      )}
      style={{ '--metric-min': props.min ?? '10rem' }}
    >
      {props.children}
    </dl>
  )
}
