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
 *
 * `flat` is for a panel stacked inside a page. Those used to draw a filled,
 * bordered box on a page whose background is the same fill, so a column of
 * them read as one undifferentiated slab and the borders separated nothing.
 * A flat panel keeps only a top rule; its heading does the separating. Boxes
 * are reserved for surfaces that genuinely sit on a different background —
 * KPI tiles, popovers, dialogs.
 */

export const Card: Component<
  JSX.HTMLAttributes<HTMLDivElement> & { class?: string; elevated?: boolean; flat?: boolean }
> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'elevated', 'flat'])
  return (
    <div
      data-card=""
      data-flat={local.flat ? '' : undefined}
      class={cn(
        'border border-border bg-card text-foreground',
        local.elevated && 'shadow-sm rounded-lg',
        local.class,
        // `flat` is applied last so it beats the caller's own padding, which is
        // the whole point: a stacked page panel should not carry side padding
        // that insets its content from the page's other panels.
        local.flat && 'border-0 border-t border-border bg-transparent px-0 pb-0 pt-6 first:border-t-0 first:pt-0',
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
