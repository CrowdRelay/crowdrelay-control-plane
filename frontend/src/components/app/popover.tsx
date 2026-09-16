import { type Component, type ComponentProps, splitProps } from 'solid-js'
import { Anchor, Description, Title } from '@kobalte/core/popover'
import { cn } from '~/lib/cn'

export { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'

/** Parts the stock popover does not ship, styled like the stock dialog's. */
export const PopoverAnchor = Anchor

export const PopoverHeader: Component<ComponentProps<'div'>> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <div class={cn('flex flex-col space-y-2', local.class)} {...rest} />
}

export const PopoverTitle: Component<ComponentProps<typeof Title>> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <Title class={cn('font-semibold leading-none tracking-tight', local.class)} {...rest} />
}

export const PopoverDescription: Component<ComponentProps<typeof Description>> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <Description class={cn('text-sm text-muted-foreground', local.class)} {...rest} />
}
