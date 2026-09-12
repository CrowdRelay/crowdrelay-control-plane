import { For, Show } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * AuthorityScale — the four rungs of autonomy, shown as a ladder.
 *
 * This was a `<select>`. A dropdown shows one option at a time, so an operator
 * deciding how much to trust a context could not see that there are four
 * levels, which one is the cautious end, or how far along it they already are.
 * The public site draws the same four as a scale for exactly that reason, and a
 * trust ladder should look like a ladder.
 *
 * The wording stays the console's. "Observe / Recommend / Approval / Bounded
 * auto" is the authority model's own vocabulary; "Only watch / Suggest it / Ask
 * me first / Do it alone" is what the operator is actually agreeing to, and
 * that is the thing being chosen.
 *
 * Rendered as a radiogroup rather than buttons: arrow keys move between rungs,
 * which is how a scale is expected to behave, and screen readers announce it as
 * one choice of four rather than four unrelated controls.
 */

export type AuthorityRung<T extends string> = {
  value: T
  /** What the operator is agreeing to. Kept short — four of these share a
   *  column, and a truncated label is worse than a terse one. */
  label: string
  /** One line on what it means in practice. Shown under the scale. */
  detail: string
}

export function AuthorityScale<T extends string>(props: {
  rungs: readonly AuthorityRung<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  /** Names the group for assistive tech, e.g. "Outreach — how far it may go". */
  label: string
  /** Show the selected rung's detail underneath. Off in a table: twenty-two
   *  rows each repeating "Prepares the action and waits for your approval" is
   *  noise, and the column header already says what the scale measures. */
  showDetail?: boolean
  class?: string
}) {
  const index = () => props.rungs.findIndex(rung => rung.value === props.value)
  const current = () => props.rungs[index()]

  const move = (delta: number) => {
    if (props.disabled) return
    const next = props.rungs[Math.min(props.rungs.length - 1, Math.max(0, index() + delta))]
    if (next && next.value !== props.value) props.onChange(next.value)
  }

  return (
    <div class={cn('flex flex-col gap-1', props.class)}>
      <div
        role="radiogroup"
        aria-label={props.label}
        class={cn('flex overflow-hidden rounded-md border border-border', props.disabled && 'opacity-45')}
        onKeyDown={event => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); move(1) }
          if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); move(-1) }
        }}
      >
        <For each={props.rungs}>{(rung, i) => {
          // Everything up to and including the selected rung is filled, so the
          // control reads as "how far along" rather than as one lit checkbox
          // among four. That is the question it answers.
          const reached = () => i() <= index()
          const selected = () => rung.value === props.value
          return (
            <button
              type="button"
              role="radio"
              aria-checked={selected()}
              aria-label={`${rung.label} — ${rung.detail}`}
              title={rung.detail}
              tabIndex={selected() ? 0 : -1}
              disabled={props.disabled}
              onClick={() => !props.disabled && props.onChange(rung.value)}
              class={cn(
                // `min-w-0` let a rung shrink below its own label, so the
                // longest word overflowed its button and ran into the next
                // one. The rungs size to their content and share the slack
                // evenly instead.
                'flex-1 whitespace-nowrap border-r border-border px-2 py-1 text-xs font-medium transition-colors last:border-r-0',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                reached() ? 'bg-primary/15 text-primary-light' : 'text-muted-foreground',
                selected() && 'bg-primary/30 font-semibold text-foreground',
                !props.disabled && !selected() && 'hover:text-foreground',
              )}
            >
              {rung.label}
            </button>
          )
        }}</For>
      </div>
      <Show when={props.showDetail && current()}>
        <span class="text-xs leading-relaxed text-muted-foreground">{current()!.detail}</span>
      </Show>
    </div>
  )
}
