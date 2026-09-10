import { type Component, type JSX, splitProps } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * Card — flat surface with one border colour. No glassmorphism, no shadow
 * by default. One elevation step (shadow-sm) available via the `elevated`
 * prop for popovers and dialogs.
 *
 * Background panels use sharp corners (no radius) so they sit flush against
 * each other and the page edge without visual gaps. Inner elements (buttons,
 * inputs, badges, KPI tiles) keep their own rounded-* classes from the
 * radius tokens.
 */

export const Card: Component<JSX.HTMLAttributes<HTMLDivElement> & { class?: string; elevated?: boolean }> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'elevated'])
  return (
    <div
      data-card=""
      class={cn(
        'border border-border bg-card text-foreground',
        local.elevated && 'shadow-sm rounded-lg',
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

export const CardDescription: Component<JSX.HTMLAttributes<HTMLParagraphElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <p class={cn('text-sm text-muted-foreground leading-relaxed', local.class)} {...rest} />
}

export const CardFooter: Component<JSX.HTMLAttributes<HTMLDivElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <div class={cn('flex items-center gap-2 p-4 pt-0', local.class)} {...rest} />
}
