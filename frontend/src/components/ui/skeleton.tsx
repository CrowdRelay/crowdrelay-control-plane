import type { Component, ComponentProps } from "solid-js"
import { splitProps } from "solid-js"

import { cn } from "~/lib/utils"

/**
 * shadcn/ui Skeleton (base registry), ported to Solid:
 * https://ui.shadcn.com/docs/components/base/skeleton
 *
 *   <Skeleton class="h-4 w-[250px]" />
 *   <Skeleton class="size-10 rounded-full" />
 *
 * One addition to the registry classes: `motion-reduce:animate-none`, so the
 * pulse respects the reader's reduced-motion setting.
 */
const Skeleton: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <div
      data-slot="skeleton"
      class={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", local.class)}
      {...others}
    />
  )
}

export { Skeleton }
