import type { JSX, ValidComponent } from "solid-js"
import { splitProps } from "solid-js"

import * as AlertDialogPrimitive from "@kobalte/core/alert-dialog"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"

import { cn } from "~/lib/utils"
import { returnFocusHandlers } from "~/lib/return-focus"
import { X } from "lucide-solid"

const AlertDialog = AlertDialogPrimitive.Root
const AlertDialogTrigger = AlertDialogPrimitive.Trigger
const AlertDialogPortal = AlertDialogPrimitive.Portal

type AlertDialogOverlayProps<T extends ValidComponent = "div"> =
  AlertDialogPrimitive.AlertDialogOverlayProps<T> & {
    class?: string | undefined
  }

const AlertDialogOverlay = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, AlertDialogOverlayProps<T>>
) => {
  const [local, others] = splitProps(props as AlertDialogOverlayProps, ["class"])
  return (
    <AlertDialogPrimitive.Overlay
      class={cn(
        "fixed inset-0 z-50 bg-scrim backdrop-blur-xs data-[expanded]:animate-overlay-show data-[closed]:animate-overlay-hide",
        local.class
      )}
      {...others}
    />
  )
}

type AlertDialogContentProps<T extends ValidComponent = "div"> =
  AlertDialogPrimitive.AlertDialogContentProps<T> & {
    class?: string | undefined
    children?: JSX.Element
  }

const AlertDialogContent = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, AlertDialogContentProps<T>>
) => {
  const [local, others] = splitProps(props as AlertDialogContentProps, ["class", "children", "onOpenAutoFocus", "onCloseAutoFocus"])
  const focus = returnFocusHandlers(local)
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        class={cn(
          "fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto overscroll-contain rounded-lg border bg-background p-6 shadow-overlay data-[expanded]:animate-content-show data-[closed]:animate-content-hide",
          local.class
        )}
        {...others}
        {...focus}
      >
        {local.children}
        <AlertDialogPrimitive.CloseButton class="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none">
          <X class="size-4" aria-hidden="true" />
          <span class="sr-only">Close</span>
        </AlertDialogPrimitive.CloseButton>
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  )
}

type AlertDialogTitleProps<T extends ValidComponent = "h2"> =
  AlertDialogPrimitive.AlertDialogTitleProps<T> & {
    class?: string | undefined
  }

const AlertDialogTitle = <T extends ValidComponent = "h2">(
  props: PolymorphicProps<T, AlertDialogTitleProps<T>>
) => {
  const [local, others] = splitProps(props as AlertDialogTitleProps, ["class"])
  return <AlertDialogPrimitive.Title class={cn("text-lg font-semibold leading-snug", local.class)} {...others} />
}

type AlertDialogDescriptionProps<T extends ValidComponent = "p"> =
  AlertDialogPrimitive.AlertDialogDescriptionProps<T> & {
    class?: string | undefined
  }

const AlertDialogDescription = <T extends ValidComponent = "p">(
  props: PolymorphicProps<T, AlertDialogDescriptionProps<T>>
) => {
  const [local, others] = splitProps(props as AlertDialogDescriptionProps, ["class"])
  return (
    <AlertDialogPrimitive.Description
      class={cn("text-sm text-muted-foreground", local.class)}
      {...others}
    />
  )
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription
}
