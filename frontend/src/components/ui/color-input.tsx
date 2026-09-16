import { type Component, type JSX, splitProps } from 'solid-js'
import { cn } from '~/lib/cn'
import { writeGuard } from '~/lib/read-only'

/**
 * ColorInput — `type="color"` is a swatch, not a text field, so Input's
 * border and height do not apply. `writes` carries the read-only rule.
 */
export type ColorInputProps = JSX.InputHTMLAttributes<HTMLInputElement> & {
  class?: string
  /** This control changes something on the server. */
  writes?: boolean
}

export const ColorInput: Component<ColorInputProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'writes'])
  return (
    <input
      class={cn('h-9 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-surface-1', local.class)}
      {...rest}
      type="color"
      {...(local.writes ? writeGuard() : {})}
    />
  )
}
