import { type Component, type JSX, splitProps } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * Input — styled text input with focus ring. Flat surface, one border.
 */

export type InputProps = JSX.InputHTMLAttributes<HTMLInputElement> & {
  class?: string
}

export const Input: Component<InputProps> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <input
      class={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        local.class,
      )}
      {...rest}
    />
  )
}
