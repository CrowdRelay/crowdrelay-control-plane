import { type Component, type ComponentProps, splitProps } from 'solid-js'
import { CloseButton } from '@kobalte/core/alert-dialog'
import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/cn'

export {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger,
} from '~/components/ui/alert-dialog'

/**
 * The stock alert dialog ships without header, footer, action and cancel
 * parts; these use the stock dialog's header/footer layout and stock button
 * variants.
 */
export const AlertDialogHeader: Component<ComponentProps<'div'>> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <div class={cn('flex flex-col space-y-2 text-center sm:text-left', local.class)} {...rest} />
}

export const AlertDialogFooter: Component<ComponentProps<'div'>> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <div class={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', local.class)} {...rest} />
}

export const AlertDialogAction: Component<ComponentProps<typeof CloseButton>> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <CloseButton class={cn(buttonVariants(), local.class)} {...rest} />
}

export const AlertDialogCancel: Component<ComponentProps<typeof CloseButton>> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <CloseButton class={cn(buttonVariants({ variant: 'outline' }), 'mt-2 sm:mt-0', local.class)} {...rest} />
}
