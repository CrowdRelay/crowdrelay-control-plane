import { type Component, type JSX, splitProps } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '~/lib/cn'
import { READ_ONLY_REASON, readOnly } from '~/lib/read-only'

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
        // `destructive` and `success` are light fills: white lands at 2.88:1 and
        // 1.78:1 on them, under the 4.5:1 body minimum, so both take the page's
        // own near-black instead, at 6.8:1 and 11:1.
        //
        // `primary` used to be in that list — a light lavender that forced the
        // same inversion, so the console's main button read as a pale chip with
        // dark text on it. It is now violet-600 from the public site's ramp,
        // which is a fill: near-white sits on it at 8:1 and the button looks
        // like a button. See the accent block in tailwind.css for why there are
        // two primaries.
        default: 'bg-primary-solid text-primary-on hover:bg-primary-solid-hover active:bg-primary-solid-active',
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
    /**
     * This button changes something on the server.
     *
     * Marked buttons disable themselves for a read-only account and say why.
     * The API refuses the write regardless — see `request` in lib/api.ts — so
     * an unmarked write button is a cosmetic miss, not a hole: the viewer gets
     * an error toast instead of a control that was never offered.
     */
    writes?: boolean
  }

export const Button: Component<ButtonProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'variant', 'size', 'writes', 'disabled', 'title'])
  const blocked = () => local.writes === true && readOnly()
  return (
    <button
      class={cn(buttonVariants({ variant: local.variant, size: local.size }), local.class)}
      disabled={blocked() || local.disabled}
      title={blocked() ? READ_ONLY_REASON : local.title}
      {...rest}
    />
  )
}

export { buttonVariants }
