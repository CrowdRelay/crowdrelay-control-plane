import { type Component, type JSX, splitProps } from 'solid-js'
import { cn } from '~/lib/cn'

export const Label: Component<JSX.LabelHTMLAttributes<HTMLLabelElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <label
      class={cn('text-sm font-medium text-foreground leading-none', local.class)}
      {...rest}
    />
  )
}
