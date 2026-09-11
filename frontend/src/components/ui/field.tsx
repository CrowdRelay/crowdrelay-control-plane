import { Show, type JSX } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * Field — one labelled form control, with its hint and its error.
 *
 * The console wrote this by hand as `<label>Country code<Input/><small>…</small></label>`
 * roughly thirty times. A bare `<label>` is `display: inline`, and no rule in
 * the stylesheet ever gave it one, so the name, the control and the hint ran
 * together on a single baseline with no gap — which is what "Settings looks
 * ugly" actually was. The `<small>` inherited nothing either, so a hint was the
 * same size and colour as the label naming the field above it.
 *
 * The label stays the wrapping element, so the control is associated with its
 * name implicitly — no id to invent, no `for` to keep in sync.
 *
 * An `error` replaces the hint rather than stacking under it: they occupy the
 * same line, and a field that is wrong needs the correction, not the advice it
 * already failed to follow.
 */
export function Field(props: {
  label: JSX.Element
  /** Explains the field. Shown under the control, muted. */
  hint?: JSX.Element
  /** Shown instead of the hint when the value is rejected. */
  error?: JSX.Element
  /** Right-aligned note beside the name — "optional", "locked", a Hint dot. */
  note?: JSX.Element
  children: JSX.Element
  class?: string
}) {
  return (
    <label class={cn('flex min-w-0 flex-col gap-1.5', props.class)}>
      <span class="flex items-center justify-between gap-2">
        <span class="text-sm font-medium leading-none text-foreground">{props.label}</span>
        <Show when={props.note}><span class="shrink-0 text-xs text-muted-foreground">{props.note}</span></Show>
      </span>
      {props.children}
      <Show
        when={props.error}
        fallback={<Show when={props.hint}><span class="text-xs leading-relaxed text-muted-foreground">{props.hint}</span></Show>}
      >
        <span class="text-xs leading-relaxed text-destructive">{props.error}</span>
      </Show>
    </label>
  )
}

/**
 * FieldGrid — the standard form layout: fields fill the width, wrapping into
 * as many columns as fit. `minmax(0,…)` on the track, so a long value inside a
 * field cannot push the column wider than its share.
 */
export function FieldGrid(props: { children: JSX.Element; class?: string; min?: string }) {
  return (
    <div
      class={cn('grid gap-x-4 gap-y-4', props.class)}
      style={{ 'grid-template-columns': `repeat(auto-fit,minmax(min(100%,${props.min ?? '200px'}),1fr))` }}
    >
      {props.children}
    </div>
  )
}

/**
 * ReadField — the same field, displayed rather than edited.
 *
 * Settings screens that are only occasionally changed should read as a record,
 * not as a form waiting to be submitted. This is the record half; the form half
 * belongs behind an Edit button.
 */
export function ReadField(props: {
  label: JSX.Element
  children: JSX.Element
  hint?: JSX.Element
  class?: string
}) {
  return (
    <div class={cn('flex min-w-0 flex-col gap-1', props.class)}>
      <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">{props.label}</span>
      <span class="break-words text-sm font-medium text-foreground">{props.children}</span>
      <Show when={props.hint}><span class="text-xs leading-relaxed text-muted-foreground">{props.hint}</span></Show>
    </div>
  )
}

/** A value the tenant has not set. Muted, so an absent value never reads as a value. */
export function Unset(props: { children?: JSX.Element }) {
  return <span class="text-muted-foreground">{props.children ?? 'not set'}</span>
}
