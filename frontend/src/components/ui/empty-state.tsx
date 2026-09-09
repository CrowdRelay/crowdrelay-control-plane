import { Show, type Component, type JSX } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * EmptyState — honest empty/zero-data state. No decorative icon circle,
 * no encouraging copy. State what is absent and what action would change it.
 *
 * Usage:
 *   <EmptyState label="No fans reporting" hint="Connect a source to start aggregating." />
 */

export const EmptyState: Component<{
  icon?: JSX.Element
  label: string
  hint?: string
  signal?: string
  class?: string
}> = (props) => (
  <div class={cn('flex flex-col items-center justify-center gap-2 py-8 text-center', props.class)}>
    <Show when={props.icon}>
      <div class="text-muted-foreground">{props.icon}</div>
    </Show>
    <strong class="text-sm font-medium text-foreground">{props.label}</strong>
    <Show when={props.hint}>
      <p class="max-w-sm text-xs text-muted-foreground">{props.hint}</p>
    </Show>
    <Show when={props.signal}>
      <p class="text-xs text-muted-foreground">{props.signal}</p>
    </Show>
  </div>
)
