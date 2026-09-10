import { type Component, type JSX, splitProps } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '~/lib/cn'

/**
 * Button — vendored from the shadcn-solid pattern, adapted to Tailwind v4.
 * Uses CVA for variant management. No Kobalte dependency for the base button;
 * Kobalte's Button is used only where polymorphic semantics are needed.
 */

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        // White on these fills is unreadable: measured against the tokens this
        // app actually paints, white lands at 2.93:1 on `primary`, 2.88:1 on
        // `destructive` and 1.78:1 on `success` — all under the 4.5:1 body
        // minimum, and the success case is barely visible at all. The same
        // fills take the page's own near-black at 6.7:1, 6.8:1 and 11:1.
        default: 'bg-primary text-background hover:bg-primary-hover active:bg-primary-active',
        destructive: 'bg-destructive text-background hover:bg-destructive/90',
        'destructive-ghost': 'border border-destructive/30 text-destructive hover:bg-destructive/10',
        outline: 'border border-border bg-transparent text-foreground hover:bg-surface-3',
        ghost: 'text-secondary-foreground hover:bg-surface-3 hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        success: 'bg-success text-background hover:bg-success/90',
      },
      size: {
        default: 'h-9 px-4 text-sm',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6 text-base',
        icon: 'h-9 w-9',
        xs: 'h-7 px-2.5 text-xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    class?: string
  }

export const Button: Component<ButtonProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'variant', 'size'])
  return (
    <button
      class={cn(buttonVariants({ variant: local.variant, size: local.size }), local.class)}
      {...rest}
    />
  )
}

export { buttonVariants }
