import { type Component, type JSX, splitProps } from 'solid-js'
import { Tooltip as TooltipPrimitive } from '@kobalte/core'
import { cn } from '~/lib/cn'

/**
 * Tooltip — Kobalte-based accessible tooltip. Provides delay, positioning,
 * and ARIA roles out of the box.
 */

export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export const TooltipContent: Component<JSX.HTMLAttributes<HTMLDivElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        class={cn(
          'z-50 overflow-hidden rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-foreground shadow-md',
          local.class,
        )}
        {...rest}
      />
    </TooltipPrimitive.Portal>
  )
}
