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
        'flex h-9 w-full rounded-md border border-border bg-surface-1 px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-45',
        local.class,
      )}
      {...rest}
    />
  )
}
