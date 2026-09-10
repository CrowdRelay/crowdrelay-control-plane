import { type Component, type JSX, splitProps } from 'solid-js'
import { cn } from '~/lib/cn'

export type TextareaProps = JSX.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  class?: string
}

export const Textarea: Component<TextareaProps> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <textarea
      class={cn(
        'flex w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-45 resize-y',
        local.class,
      )}
      {...rest}
    />
  )
}
