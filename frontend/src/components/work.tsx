import { For, Show, type JSX } from 'solid-js'
import { AlertTriangle, Circle, CircleCheck, Clock } from 'lucide-solid'
import { cn } from '../lib/cn'
import { Ring } from './charts'

// The work-band primitives every redesigned page shares: one ranked row of
// work, the next night's countdown, a promotion checklist, and one line of
// "what it produced". They exist so a page reads as ranked work rather than
// stacked cards — same row shape on Today, Needs you, and Shows.

/** One row of a ranked work list: a badge saying what kind of thing it is,
 *  the title and one line on why it is worth a minute, and the door into
 *  whatever does it (usually a Link styled as a button). */
export function WorkRow(props: {
  badge?: JSX.Element
  title: JSX.Element
  why?: JSX.Element
  action?: JSX.Element
  class?: string
}) {
  return (
    <li class={cn('flex items-start justify-between gap-3 rounded-md border border-border p-3', props.class)}>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <Show when={props.badge}>{props.badge}</Show>
          <span class="text-sm font-medium text-foreground">{props.title}</span>
        </div>
        <Show when={props.why}>
          <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{props.why}</p>
        </Show>
      </div>
      <Show when={props.action}>
        <span class="shrink-0 self-center">{props.action}</span>
      </Show>
    </li>
  )
}

/** The ranked list itself — plain `<ol>` so order is the ranking. */
export function WorkList(props: { children: JSX.Element; class?: string }) {
  return <ol class={cn('flex flex-col gap-2', props.class)}>{props.children}</ol>
}

/** A show's countdown: the ring fills as the night approaches over a
 *  `windowDays` horizon (default a month out). `null` days draws the empty
 *  track — an unknown date is a dash, not a full ring. */
export function CountdownRing(props: {
  days: number | null
  windowDays?: number
  label: string
  class?: string
}) {
  const window = () => props.windowDays ?? 30
  const fill = () =>
    props.days == null ? null : Math.max(0, Math.min(1, 1 - props.days / window()))
  return (
    <Ring value={fill()} label={props.label} class={props.class}>
      <span class="text-3xl font-bold tabular-nums text-foreground">
        {props.days == null ? '—' : props.days}
      </span>
      <span class="text-xs text-muted-foreground">
        {props.days === 1 ? 'day left' : 'days left'}
      </span>
    </Ring>
  )
}

export type ChecklistStep = {
  key: string
  label: string
  /** done / due / active / waiting — the timeline's own states. */
  state: string
  /** Right-hand note: an owner, a date, a count. */
  note?: string
}

/** The next night's promotion steps: done checked, due flagged, the rest in
 *  the timeline's order. Internal step names are the caller's problem — the
 *  `label` prop is already the plain word. */
export function StepChecklist(props: { steps: ChecklistStep[]; class?: string }) {
  const icon = (state: string) =>
    state === 'done' ? (
      <CircleCheck class="size-4 shrink-0 text-success-foreground" aria-hidden="true" />
    ) : state === 'due' ? (
      <AlertTriangle class="size-4 shrink-0 text-warning-foreground" aria-hidden="true" />
    ) : state === 'active' ? (
      <Clock class="size-4 shrink-0 text-warning-foreground" aria-hidden="true" />
    ) : (
      <Circle class="size-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
    )
  return (
    <ol class={cn('flex flex-col gap-1.5', props.class)}>
      <For each={props.steps}>{step => (
        <li class="flex items-center gap-2 text-sm">
          {icon(step.state)}
          <span class={cn('min-w-0 flex-1 truncate', step.state === 'done' ? 'text-muted-foreground' : 'text-foreground')}>
            {step.label}
          </span>
          <Show when={step.note}>
            <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{step.note}</span>
          </Show>
        </li>
      )}</For>
    </ol>
  )
}

/** One line of "what it produced": what the machine did, the honest word
 *  for the result, and when. `resultTone` colours only the verdict word. */
export function OutcomeRow(props: {
  label: JSX.Element
  result: string
  resultTone?: 'good' | 'warn' | 'bad' | 'muted'
  when?: string
  class?: string
}) {
  return (
    <div class={cn('flex items-baseline justify-between gap-3 text-sm', props.class)}>
      <span class="min-w-0 truncate text-foreground">{props.label}</span>
      <span class={cn(
        'shrink-0 text-xs',
        props.resultTone === 'good' ? 'text-success-foreground'
        : props.resultTone === 'bad' ? 'text-destructive'
        : props.resultTone === 'warn' ? 'text-warning-foreground'
        : 'text-muted-foreground',
      )}>
        {props.result}
        <Show when={props.when}>{w => ` · ${w()}`}</Show>
      </span>
    </div>
  )
}
