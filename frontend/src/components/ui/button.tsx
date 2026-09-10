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
        default: 'bg-primary text-white hover:bg-primary-hover active:bg-primary-active',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
        'destructive-ghost': 'border border-destructive/30 text-destructive hover:bg-destructive/10',
        outline: 'border border-border bg-transparent text-foreground hover:bg-surface-3',
        ghost: 'text-secondary-foreground hover:bg-surface-3 hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        success: 'bg-success text-white hover:bg-success/90',
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
