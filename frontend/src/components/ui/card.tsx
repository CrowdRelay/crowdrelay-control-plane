import { type Component, type JSX, splitProps } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * Card — flat surface with one border colour. No glassmorphism, no shadow
 * by default. One elevation step (shadow-sm) available via the `elevated`
 * prop for popovers and dialogs.
 */

export const Card: Component<JSX.HTMLAttributes<HTMLDivElement> & { class?: string; elevated?: boolean }> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'elevated'])
  return (
    <div
      data-card=""
      class={cn(
        'rounded-lg border border-border bg-card text-foreground',
        local.elevated && 'shadow-sm',
        local.class,
      )}
      {...rest}
    />
  )
}

export const CardHeader: Component<JSX.HTMLAttributes<HTMLDivElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <div class={cn('flex flex-col gap-1.5 p-4', local.class)} {...rest} />
}

export const CardTitle: Component<JSX.HTMLAttributes<HTMLHeadingElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <h3 class={cn('text-base font-semibold leading-none tracking-tight', local.class)} {...rest} />
}

export const CardContent: Component<JSX.HTMLAttributes<HTMLDivElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <div class={cn('p-4 pt-0', local.class)} {...rest} />
}
