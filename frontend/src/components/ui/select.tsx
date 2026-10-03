import type { JSX, ValidComponent } from "solid-js"
import { splitProps } from "solid-js"

import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import * as SelectPrimitive from "@kobalte/core/select"
import { Check, ChevronDown } from "lucide-solid"

import { cn } from "~/lib/utils"

/**
 * Select — shadcn's select (ui.shadcn.com/docs/components/base/select) on
 * Kobalte: a trigger that reads like an input with a chevron, a popup list
 * the width of the trigger, a check on the chosen item, optional group
 * labels. Opens and closes with the shared overlay motion (content-show /
 * content-hide) and floats on shadow-overlay like every other menu.
 */

const Select = SelectPrimitive.Root
const SelectValue = SelectPrimitive.Value
const SelectHiddenSelect = SelectPrimitive.HiddenSelect

type SelectTriggerProps<T extends ValidComponent = "button"> =
  SelectPrimitive.SelectTriggerProps<T> & {
    class?: string | undefined
    children?: JSX.Element
    size?: "sm" | "default"
  }

const SelectTrigger = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, SelectTriggerProps<T>>
) => {
  const [local, others] = splitProps(props as SelectTriggerProps, ["class", "children", "size"])
  return (
    <SelectPrimitive.Trigger
      class={cn(
        "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background pl-3 pr-2.5 text-left ring-offset-background transition-colors",
        "hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "data-[expanded]:ring-2 data-[expanded]:ring-ring data-[expanded]:ring-offset-2",
        "data-[invalid]:border-destructive disabled:cursor-not-allowed disabled:opacity-50",
        "[&>span]:min-w-0 [&>span]:truncate",
        local.size === "sm" ? "h-9 text-xs" : "h-10 text-sm",
        local.class
      )}
      {...others}
    >
      {local.children}
      <SelectPrimitive.Icon class="flex shrink-0 text-muted-foreground transition-transform duration-150 data-[expanded]:rotate-180">
        <ChevronDown class="size-4" aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

type SelectContentProps<T extends ValidComponent = "div"> =
  SelectPrimitive.SelectContentProps<T> & { class?: string | undefined }

const SelectContent = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, SelectContentProps<T>>
) => {
  const [local, others] = splitProps(props as SelectContentProps, ["class"])
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        class={cn(
          "relative z-50 min-w-32 origin-[var(--kb-select-content-transform-origin)] overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-overlay",
          "data-[expanded]:animate-content-show data-[closed]:animate-content-hide",
          local.class
        )}
        {...others}
      >
        <SelectPrimitive.Listbox class="max-h-72 overflow-y-auto overscroll-contain p-1 outline-none" />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

type SelectItemProps<T extends ValidComponent = "li"> = SelectPrimitive.SelectItemProps<T> & {
  class?: string | undefined
  children?: JSX.Element
}

const SelectItem = <T extends ValidComponent = "li">(
  props: PolymorphicProps<T, SelectItemProps<T>>
) => {
  const [local, others] = splitProps(props as SelectItemProps, ["class", "children"])
  return (
    <SelectPrimitive.Item
      class={cn(
        "relative flex w-full cursor-default select-none items-center gap-2 rounded-md py-1.5 pl-2 pr-8 text-sm outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        local.class
      )}
      {...others}
    >
      <SelectPrimitive.ItemLabel class="min-w-0 flex-1 truncate">{local.children}</SelectPrimitive.ItemLabel>
      <SelectPrimitive.ItemIndicator class="absolute right-2 flex size-4 items-center justify-center">
        <Check class="size-4" aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

/** A group heading inside the list (an `<optgroup>`'s label). */
const SelectLabel = (props: { class?: string; children: JSX.Element }) => (
  <SelectPrimitive.Section class={cn("px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground", props.class)}>
    {props.children}
  </SelectPrimitive.Section>
)

export { Select, SelectValue, SelectHiddenSelect, SelectTrigger, SelectContent, SelectItem, SelectLabel }
