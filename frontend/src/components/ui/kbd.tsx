import type { Component, ComponentProps } from "solid-js"
import { splitProps } from "solid-js"

import { cn } from "~/lib/utils"

const Kbd: Component<ComponentProps<"kbd">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <kbd
      data-slot="kbd"
      class={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 select-none items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-medium text-muted-foreground [&_svg:not([class*='size-'])]:size-3",
        local.class
      )}
      {...others}
    />
  )
}

const KbdGroup: Component<ComponentProps<"kbd">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return <kbd data-slot="kbd-group" class={cn("inline-flex items-center gap-1", local.class)} {...others} />
}

export { Kbd, KbdGroup }
