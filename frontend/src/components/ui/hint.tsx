import { Show, createSignal, createUniqueId, type JSX } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * Hint — a "?" beside a label that explains the thing next to it.
 *
 * The console has rules an operator cannot infer from the screen: which
 * provider the router reaches for first, why a free model is not a downgrade.
 * Those explanations are too long for a caption and too important to leave in
 * a doc nobody opens, so they hang off the label they belong to.
 *
 * `title` was the cheap option and is the wrong one: it waits a second, cannot
 * be styled, is invisible to touch, and a screen reader may or may not read it.
 * This opens on hover *and* on focus, is reachable by keyboard, closes on
 * Escape, and is wired with `aria-describedby` so the text is announced as the
 * description of the control rather than as loose prose.
 *
 * No Kobalte popover: this needs no portal, no collision detection and no
 * focus trap — it is a paragraph pinned under a button.
 */
export function Hint(props: {
  /** What the "?" explains. Announced as the description of the trigger. */
  children: JSX.Element
  /** Accessible name for the trigger, e.g. "About paid providers". */
  label: string
  class?: string
  /** Pin the panel to the right edge instead of the left. */
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = createSignal(false)
  const id = createUniqueId()
  return (
    <span
      class={cn('relative inline-flex', props.class)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={props.label}
        aria-describedby={open() ? id : undefined}
        aria-expanded={open()}
        class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-bold leading-none text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(v => !v)}
        onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}
      >
        ?
      </button>
      <Show when={open()}>
        <span
          id={id}
          role="tooltip"
          class={cn(
            'absolute top-6 z-50 w-64 rounded-lg border border-border bg-popover p-3 text-xs font-normal leading-relaxed text-secondary-foreground shadow-lg',
            props.align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {props.children}
        </span>
      </Show>
    </span>
  )
}
