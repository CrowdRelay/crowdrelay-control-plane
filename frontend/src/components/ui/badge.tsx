import { type Component, type JSX, splitProps } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '~/lib/cn'

/**
 * Badge — status indicator. Semantic colours only: success, warning,
 * destructive for status; default and outline for neutral labels.
 */

const badgeVariants = cva(
  // `whitespace-nowrap`: a badge is one token. Without it, a two-word status in
  // a `flex-wrap` header shrank to its minimum content width and broke across
  // two lines inside its own pill — "none yet" rendered as a squashed block.
  'inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium tabular-nums transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-surface-4 text-primary-foreground',
        success: 'bg-success/15 text-success border border-success/30',
        warning: 'bg-warning/15 text-warning border border-warning/30',
        destructive: 'bg-destructive/15 text-destructive border border-destructive/30',
        muted: 'bg-surface-3 text-muted-foreground',
        outline: 'border border-border text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export type BadgeProps = JSX.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & {
    class?: string
  }

export const Badge: Component<BadgeProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'variant'])
  return (
    <span
      class={cn(badgeVariants({ variant: local.variant }), local.class)}
      {...rest}
    />
  )
}

export { badgeVariants }
