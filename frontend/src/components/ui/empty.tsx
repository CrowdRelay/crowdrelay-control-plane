import type { Component, ComponentProps } from "solid-js"
import { splitProps } from "solid-js"

import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~/lib/utils"

const Empty: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <div
      data-slot="empty"
      class={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg border-dashed p-6 text-center text-balance md:p-12",
        local.class
      )}
      {...others}
    />
  )
}

const EmptyHeader: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <div
      data-slot="empty-header"
      class={cn("flex max-w-sm flex-col items-center gap-2 text-center", local.class)}
      {...others}
    />
  )
}

const emptyMediaVariants = cva(
  "mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg:not([class*='size-'])]:size-6"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
)

type EmptyMediaProps = ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>

const EmptyMedia: Component<EmptyMediaProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "variant"])
  return (
    <div
      data-slot="empty-icon"
      data-variant={local.variant ?? "default"}
      class={cn(emptyMediaVariants({ variant: local.variant }), local.class)}
      {...others}
    />
  )
}

const EmptyTitle: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <div
      data-slot="empty-title"
      class={cn("text-lg font-medium tracking-tight", local.class)}
      {...others}
    />
  )
}

const EmptyDescription: Component<ComponentProps<"p">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <div
      data-slot="empty-description"
      class={cn(
        "text-sm/relaxed text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        local.class
      )}
      {...others}
    />
  )
}

const EmptyContent: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <div
      data-slot="empty-content"
      class={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance",
        local.class
      )}
      {...others}
    />
  )
}

export { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia }
