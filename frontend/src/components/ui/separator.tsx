import { type Component, type JSX, splitProps } from 'solid-js'
import { cn } from '~/lib/cn'

export const Separator: Component<{
  orientation?: 'horizontal' | 'vertical'
  class?: string
} & JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'orientation'])
  return (
    <div
      role="separator"
      aria-orientation={local.orientation ?? 'horizontal'}
      class={cn(
        'shrink-0 bg-border',
        (local.orientation ?? 'horizontal') === 'horizontal' ? 'h-px w-full' : 'w-px h-full',
        local.class,
      )}
      {...rest}
    />
  )
}
