import { type Component, type JSX, splitProps } from 'solid-js'
import { Card as StockCard } from '~/components/ui/card'
import { cn } from '~/lib/cn'

export { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/components/ui/card'

/**
 * Card over the stock solid-ui card.
 *
 * `flat` is a panel stacked inside a page: no box, only a top rule, the first
 * one without. `elevated` is accepted for older call sites; the stock card
 * already carries its shadow, so it changes nothing.
 */
export const Card: Component<
  JSX.HTMLAttributes<HTMLDivElement> & { class?: string; elevated?: boolean; flat?: boolean }
> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'elevated', 'flat'])
  return (
    <StockCard
      data-card=""
      data-flat={local.flat ? '' : undefined}
      class={cn(
        local.class,
        local.flat && 'rounded-none border-0 border-t bg-transparent px-0 pb-0 pt-6 shadow-none first:border-t-0 first:pt-0',
      )}
      {...rest}
    />
  )
}
