import { type Component, type JSX, splitProps } from 'solid-js'
import { Select as SelectPrimitive } from '@kobalte/core'
import { cn } from '~/lib/cn'

/**
 * Select — Kobalte-based accessible select. Provides keyboard navigation,
 * ARIA roles, and positioning out of the box.
 */

export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value
export const SelectTrigger = SelectPrimitive.Trigger
export const SelectIcon = SelectPrimitive.Icon
export const SelectContent = SelectPrimitive.Content
export const SelectListbox = SelectPrimitive.Listbox
export const SelectItem = SelectPrimitive.Item
export const SelectItemLabel = SelectPrimitive.ItemLabel
export const SelectItemDescription = SelectPrimitive.ItemDescription
export const SelectHiddenSelect = SelectPrimitive.HiddenSelect

// ─── Styled trigger ─────────────────────────────────────────────────────
export const SelectTriggerStyled: Component<
  JSX.ButtonHTMLAttributes<HTMLButtonElement> & { class?: string }
> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <SelectPrimitive.Trigger
      class={cn(
        'flex h-9 w-full items-center justify-between rounded-md border border-border bg-surface-1 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45',
        local.class,
      )}
      {...rest}
    />
  )
}

// ─── Styled content ──────────────────────────────────────────────────────
export const SelectContentStyled: Component<
  JSX.HTMLAttributes<HTMLDivElement> & { class?: string }
> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        class={cn(
          'z-50 max-h-72 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover shadow-md',
          local.class,
        )}
        {...rest}
      />
    </SelectPrimitive.Portal>
  )
}
