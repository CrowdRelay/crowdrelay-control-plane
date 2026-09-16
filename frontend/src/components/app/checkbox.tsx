import { type Component, type ComponentProps, Show, splitProps } from 'solid-js'
import { Checkbox as StockCheckbox } from '~/components/ui/checkbox'
import { cn } from '~/lib/cn'

/**
 * Checkbox over the stock solid-ui checkbox, with the console's `label` prop.
 * The label wraps the control, so clicking the text toggles it.
 */
export type CheckboxProps = ComponentProps<typeof StockCheckbox> & { label?: string; class?: string }

export const Checkbox: Component<CheckboxProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'label'])
  return (
    <Show when={local.label} fallback={<StockCheckbox class={local.class} {...rest} />}>
      <label class={cn('flex items-center gap-2 text-sm font-medium leading-none', local.class)}>
        <StockCheckbox {...rest} />
        {local.label}
      </label>
    </Show>
  )
}
