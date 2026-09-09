import { type Component, type JSX, splitProps } from 'solid-js'
import { DropdownMenu as DropdownMenuPrimitive } from '@kobalte/core'
import { cn } from '~/lib/cn'

/**
 * DropdownMenu — Kobalte-based accessible dropdown menu. Provides keyboard
 * navigation, ARIA roles, positioning, and click-outside dismissal.
 */

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuItem = DropdownMenuPrimitive.Item
export const DropdownMenuSeparator = DropdownMenuPrimitive.Separator
export const DropdownMenuLabel = DropdownMenuPrimitive.ItemLabel

export const DropdownMenuContent: Component<
  JSX.HTMLAttributes<HTMLDivElement> & { class?: string }
> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        class={cn(
          'z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md',
          local.class,
        )}
        {...rest}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

// ─── Styled item ────────────────────────────────────────────────────────
export const DropdownMenuItemStyled: Component<
  JSX.HTMLAttributes<HTMLDivElement> & { class?: string; onSelect?: () => void }
> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <DropdownMenuPrimitive.Item
      class={cn(
        'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-foreground outline-none hover:bg-surface-3 focus-visible:bg-surface-3 data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
        local.class,
      )}
      {...rest}
    />
  )
}
