import type { Component, ComponentProps, JSX, ParentProps, VoidProps } from "solid-js"
import { splitProps } from "solid-js"

import type { DialogRootProps } from "@kobalte/core/dialog"
import * as CommandPrimitive from "cmdk-solid"

import { cn } from "~/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog"
import { Search } from "lucide-solid"

// solid-ui's `command` (registry/ui/command.json), restyled to the current
// shadcn Command: an inset search field, `data-selected` rows with muted
// icons, and a dialog with no close button (Escape closes it) that rises a
// few pixels from below as it fades in. The dialog also carries a
// screen-reader title and description, which the registry copy omits.

const Command: Component<ParentProps<CommandPrimitive.CommandRootProps>> = (props) => {
  const [local, others] = splitProps(props, ["class"])

  return (
    <CommandPrimitive.CommandRoot
      class={cn(
        "flex size-full flex-col overflow-hidden rounded-xl bg-popover p-1 text-popover-foreground",
        local.class
      )}
      {...others}
    />
  )
}

type CommandDialogProps = ParentProps<DialogRootProps> & {
  title?: string
  description?: string
  class?: string
  commandProps?: CommandPrimitive.CommandRootProps
  footer?: JSX.Element
}

const CommandDialog: Component<CommandDialogProps> = (props) => {
  const [local, others] = splitProps(props, ["children", "title", "description", "class", "commandProps", "footer"])

  return (
    <Dialog {...others}>
      <DialogContent
        showCloseButton={false}
        class={cn("top-1/3 w-[calc(100vw-2rem)] max-w-lg gap-0 overflow-hidden rounded-xl p-0 ease-out data-[expanded]:slide-in-from-bottom-2 data-[closed]:slide-out-to-bottom-2 sm:rounded-xl", local.class)}
      >
        <DialogTitle class="sr-only">{local.title ?? "Command palette"}</DialogTitle>
        <DialogDescription class="sr-only">{local.description ?? "Search for a command to run…"}</DialogDescription>
        <Command {...local.commandProps}>{local.children}</Command>
        {local.footer}
      </DialogContent>
    </Dialog>
  )
}

const CommandInput: Component<VoidProps<CommandPrimitive.CommandInputProps>> = (props) => {
  const [local, others] = splitProps(props, ["class"])

  return (
    <div class="p-1 pb-0" cmdk-input-wrapper="">
      <div class="flex h-9 items-center gap-2 rounded-lg bg-muted/60 px-2.5 focus-within:ring-2 focus-within:ring-ring">
        <Search class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <CommandPrimitive.CommandInput
          class={cn(
            "flex h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
            local.class
          )}
          {...others}
        />
      </div>
    </div>
  )
}

const CommandList: Component<ParentProps<CommandPrimitive.CommandListProps>> = (props) => {
  const [local, others] = splitProps(props, ["class"])

  return (
    <CommandPrimitive.CommandList
      class={cn("max-h-80 scroll-py-1 overflow-y-auto overflow-x-hidden overscroll-contain outline-none", local.class)}
      {...others}
    />
  )
}

const CommandEmpty: Component<ParentProps<CommandPrimitive.CommandEmptyProps>> = (props) => {
  const [local, others] = splitProps(props, ["class"])

  return (
    <CommandPrimitive.CommandEmpty
      class={cn("py-6 text-center text-sm text-muted-foreground", local.class)}
      {...others}
    />
  )
}

const CommandGroup: Component<ParentProps<CommandPrimitive.CommandGroupProps>> = (props) => {
  const [local, others] = splitProps(props, ["class"])

  return (
    <CommandPrimitive.CommandGroup
      class={cn(
        "overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground",
        local.class
      )}
      {...others}
    />
  )
}

const CommandSeparator: Component<VoidProps<CommandPrimitive.CommandSeparatorProps>> = (props) => {
  const [local, others] = splitProps(props, ["class"])

  return <CommandPrimitive.CommandSeparator class={cn("-mx-1 h-px bg-border", local.class)} {...others} />
}

const CommandItem: Component<ParentProps<CommandPrimitive.CommandItemProps>> = (props) => {
  const [local, others] = splitProps(props, ["class"])

  return (
    <CommandPrimitive.CommandItem
      cmdk-item=""
      class={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-muted data-[selected=true]:text-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg:not([class*='text-'])]:text-muted-foreground",
        local.class
      )}
      {...others}
    />
  )
}

const CommandShortcut: Component<ComponentProps<"span">> = (props) => {
  const [local, others] = splitProps(props, ["class"])

  return (
    <span
      class={cn("ml-auto text-xs tracking-widest text-muted-foreground", local.class)}
      {...others}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator
}
