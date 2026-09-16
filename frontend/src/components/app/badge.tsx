import { type Component, type JSX, splitProps } from 'solid-js'
import { Badge as StockBadge } from '~/components/ui/badge'

/**
 * Badge over the stock solid-ui badge. Legacy variant names map onto the stock
 * set: `destructive` → `error`, `muted` → `secondary`.
 */

type StockVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'error'
export type BadgeVariant = StockVariant | 'destructive' | 'muted'

const VARIANT: Record<BadgeVariant, StockVariant> = {
  default: 'default',
  secondary: 'secondary',
  outline: 'outline',
  success: 'success',
  warning: 'warning',
  error: 'error',
  destructive: 'error',
  muted: 'secondary',
}

export type BadgeProps = JSX.HTMLAttributes<HTMLDivElement> & {
  class?: string
  variant?: BadgeVariant | null
  round?: boolean
}

export const Badge: Component<BadgeProps> = (props) => {
  const [local, rest] = splitProps(props, ['variant'])
  return <StockBadge variant={local.variant ? VARIANT[local.variant] : undefined} {...rest} />
}
