import { type Component, type JSX, splitProps } from 'solid-js'
import { cn } from '~/lib/cn'
import { writeGuard } from '~/lib/read-only'

/**
 * RangeInput — the slider Input cannot be, because `type="range"` draws its
 * own track and the text-input border/height would fight it. `writes` carries
 * the read-only rule like Button and Switch.
 */
export type RangeInputProps = JSX.InputHTMLAttributes<HTMLInputElement> & {
  class?: string
  /** This control changes something on the server. */
  writes?: boolean
}

export const RangeInput: Component<RangeInputProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'writes'])
  return (
    <input
      class={cn('accent-primary', local.class)}
      {...rest}
      type="range"
      {...(local.writes ? writeGuard() : {})}
    />
  )
}
