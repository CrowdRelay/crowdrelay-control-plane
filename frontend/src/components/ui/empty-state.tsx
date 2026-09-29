import { Show, type Component, type JSX } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * EmptyState — honest empty/zero-data state. State what is absent, what this
 * place is for, and what action would change it.
 *
 * One contextual icon, muted, in a quiet tile: it tells the eye "this is a
 * placeholder, not data" before the words do. The icon names the thing that
 * is absent (fans, mail, a calendar), never a generic smiley or illustration.
 *
 * Usage:
 *   <EmptyState icon={<Users />} label="No fans reporting" hint="Connect a source to start counting fans." />
 */

export const EmptyState: Component<{
  icon?: JSX.Element
  label: string
  hint?: string
  signal?: string
  class?: string
  /** An action that would change the state — a button or link. */
  children?: JSX.Element
}> = (props) => (
  <div class={cn('flex flex-col items-center justify-center gap-2 py-8 text-center', props.class)}>
    <Show when={props.icon}>
      <div
        class="mb-1 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-5 [&_svg]:stroke-[1.5]"
        aria-hidden="true"
      >
        {props.icon}
      </div>
    </Show>
    <strong class="text-sm font-medium text-foreground text-balance">{props.label}</strong>
    <Show when={props.hint}>
      <p class="m-0 max-w-sm text-xs text-muted-foreground text-pretty">{props.hint}</p>
    </Show>
    <Show when={props.signal}>
      <p class="m-0 text-xs text-muted-foreground">{props.signal}</p>
    </Show>
    <Show when={props.children}>
      <div class="mt-2">{props.children}</div>
    </Show>
  </div>
)
