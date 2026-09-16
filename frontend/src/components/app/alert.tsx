import { type Component, type JSX, Show, splitProps } from 'solid-js'
import { Alert as StockAlert, AlertDescription, AlertTitle } from '~/components/ui/alert'

/**
 * Alert over the stock solid-ui alert. `tone` maps onto the stock variants:
 * `destructive` → `destructive`, everything else → `default`. Only the tones
 * that mean something went wrong interrupt a screen reader.
 */

export type AlertTone = 'warning' | 'destructive' | 'info' | 'success'

export const Alert: Component<
  JSX.HTMLAttributes<HTMLDivElement> & { class?: string; tone?: AlertTone; title?: string }
> = (props) => {
  const [local, rest] = splitProps(props, ['tone', 'title', 'children', 'role'])
  const tone = () => local.tone ?? 'warning'
  const role = () => local.role ?? (tone() === 'destructive' || tone() === 'warning' ? 'alert' : 'status')
  return (
    <StockAlert variant={tone() === 'destructive' ? 'destructive' : 'default'} role={role()} {...rest}>
      <Show when={local.title}>
        <AlertTitle>{local.title}</AlertTitle>
      </Show>
      <AlertDescription>{local.children}</AlertDescription>
    </StockAlert>
  )
}
