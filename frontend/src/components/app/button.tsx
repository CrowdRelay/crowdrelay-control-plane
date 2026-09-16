import { type Component, type JSX, splitProps } from 'solid-js'
import { Button as StockButton, buttonVariants as stockButtonVariants } from '~/components/ui/button'
import { READ_ONLY_REASON, readOnly } from '~/lib/read-only'

/**
 * Button over the stock solid-ui button. Adds `writes`: a button that changes
 * server state disables itself for a read-only account and says why. The API
 * refuses the write regardless (see `request` in lib/api.ts).
 *
 * Legacy variant/size names map onto the stock set: `success` → `default`,
 * `destructive-ghost` → `outline`, `xs` → `sm`.
 */

type StockVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
type StockSize = 'default' | 'sm' | 'lg' | 'icon'
export type ButtonVariant = StockVariant | 'success' | 'destructive-ghost'
export type ButtonSize = StockSize | 'xs'

const VARIANT: Record<ButtonVariant, StockVariant> = {
  default: 'default',
  destructive: 'destructive',
  outline: 'outline',
  secondary: 'secondary',
  ghost: 'ghost',
  link: 'link',
  success: 'default',
  'destructive-ghost': 'outline',
}
const SIZE: Record<ButtonSize, StockSize> = { default: 'default', sm: 'sm', lg: 'lg', icon: 'icon', xs: 'sm' }

export function buttonVariants(props: { variant?: ButtonVariant | null; size?: ButtonSize | null } = {}) {
  return stockButtonVariants({
    variant: props.variant ? VARIANT[props.variant] : undefined,
    size: props.size ? SIZE[props.size] : undefined,
  })
}

export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  class?: string
  variant?: ButtonVariant | null
  size?: ButtonSize | null
  /** This button changes something on the server. */
  writes?: boolean
}

export const Button: Component<ButtonProps> = (props) => {
  const [local, rest] = splitProps(props, ['variant', 'size', 'writes', 'disabled', 'title'])
  const blocked = () => local.writes === true && readOnly()
  return (
    <StockButton
      variant={local.variant ? VARIANT[local.variant] : undefined}
      size={local.size ? SIZE[local.size] : undefined}
      disabled={blocked() || local.disabled}
      title={blocked() ? READ_ONLY_REASON : local.title}
      {...rest}
    />
  )
}
