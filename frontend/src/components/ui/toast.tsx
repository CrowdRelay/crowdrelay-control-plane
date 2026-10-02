import type { JSX, ValidComponent } from "solid-js"
import { Match, splitProps, Switch } from "solid-js"
import { Portal } from "solid-js/web"

import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import * as ToastPrimitive from "@kobalte/core/toast"
import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

import { cn } from "~/lib/utils"
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-solid"

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border border-border bg-popover py-3 pl-3.5 pr-10 text-popover-foreground shadow-lg transition-[translate] data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--kb-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--kb-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[opened]:animate-in data-[closed]:animate-out data-[swipe=end]:animate-out data-[closed]:fade-out-80 data-[closed]:slide-out-to-right-full data-[opened]:slide-in-from-top-full data-[opened]:sm:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        // One quiet surface for every toast: the tone lives in the leading
        // icon, not a full-bleed fill. A green slab for "exported 6 fans"
        // shouted louder than the page it reported on.
        default: "",
        destructive: "destructive",
        success: "success",
        warning: "warning",
        error: "error"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
)
type ToastVariant = NonNullable<VariantProps<typeof toastVariants>["variant"]>

type ToastListProps<T extends ValidComponent = "ol"> = ToastPrimitive.ToastListProps<T> & {
  class?: string | undefined
}

const Toaster = <T extends ValidComponent = "ol">(
  props: PolymorphicProps<T, ToastListProps<T>>
) => {
  const [local, others] = splitProps(props as ToastListProps, ["class"])
  return (
    <Portal>
      <ToastPrimitive.Region>
        <ToastPrimitive.List
          class={cn(
            "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
            local.class
          )}
          {...others}
        />
      </ToastPrimitive.Region>
    </Portal>
  )
}

type ToastRootProps<T extends ValidComponent = "li"> = ToastPrimitive.ToastRootProps<T> &
  VariantProps<typeof toastVariants> & { class?: string | undefined }

const Toast = <T extends ValidComponent = "li">(props: PolymorphicProps<T, ToastRootProps<T>>) => {
  const [local, others] = splitProps(props as ToastRootProps, ["class", "variant"])
  return (
    <ToastPrimitive.Root
      class={cn(toastVariants({ variant: local.variant }), local.class)}
      {...others}
    />
  )
}

type ToastCloseButtonProps<T extends ValidComponent = "button"> =
  ToastPrimitive.ToastCloseButtonProps<T> & { class?: string | undefined }

const ToastClose = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, ToastCloseButtonProps<T>>
) => {
  const [local, others] = splitProps(props as ToastCloseButtonProps, ["class"])
  return (
    <ToastPrimitive.CloseButton
      class={cn(
        "absolute right-2 top-2.5 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        local.class
      )}
      aria-label="Dismiss"
      {...others}
    >
      <X class="size-4" aria-hidden="true" />
    </ToastPrimitive.CloseButton>
  )
}

type ToastTitleProps<T extends ValidComponent = "div"> = ToastPrimitive.ToastTitleProps<T> & {
  class?: string | undefined
}

const ToastTitle = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, ToastTitleProps<T>>
) => {
  const [local, others] = splitProps(props as ToastTitleProps, ["class"])
  return <ToastPrimitive.Title class={cn("text-sm font-medium text-foreground", local.class)} {...others} />
}

type ToastDescriptionProps<T extends ValidComponent = "div"> =
  ToastPrimitive.ToastDescriptionProps<T> & { class?: string | undefined }

const ToastDescription = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, ToastDescriptionProps<T>>
) => {
  const [local, others] = splitProps(props as ToastDescriptionProps, ["class"])
  return <ToastPrimitive.Description class={cn("text-sm text-muted-foreground text-pretty", local.class)} {...others} />
}

/** The tone, said by a small icon beside the words — the color is never the
 *  only cue, the words still carry the meaning. */
const ICON: Record<ToastVariant, () => JSX.Element> = {
  default: () => <Info class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />,
  success: () => <CircleCheck class="mt-0.5 size-4 shrink-0 text-success-foreground" aria-hidden="true" />,
  warning: () => <TriangleAlert class="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden="true" />,
  error: () => <CircleAlert class="mt-0.5 size-4 shrink-0 text-error-foreground" aria-hidden="true" />,
  destructive: () => <CircleAlert class="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />,
}

function showToast(props: {
  title?: JSX.Element
  description?: JSX.Element
  variant?: ToastVariant
  duration?: number
  /** Stays until dismissed — for errors, which the reader may still need. */
  persistent?: boolean
}) {
  ToastPrimitive.toaster.show((data) => (
    <Toast toastId={data.toastId} variant={props.variant} duration={props.duration} persistent={props.persistent}>
      {ICON[props.variant ?? "default"]()}
      <div class="grid min-w-0 gap-0.5">
        {props.title && <ToastTitle>{props.title}</ToastTitle>}
        {/* Alone, the description is the message and reads at full strength. */}
        {props.description && <ToastDescription class={props.title ? undefined : "text-foreground"}>{props.description}</ToastDescription>}
      </div>
      <ToastClose />
    </Toast>
  ))
}

function showToastPromise<T, U>(
  promise: Promise<T> | (() => Promise<T>),
  options: {
    loading?: JSX.Element
    success?: (data: T) => JSX.Element
    error?: (error: U) => JSX.Element
    duration?: number
  }
) {
  const variant: { [key in ToastPrimitive.ToastPromiseState]: ToastVariant } = {
    pending: "default",
    fulfilled: "success",
    rejected: "error"
  }
  return ToastPrimitive.toaster.promise<T, U>(promise, (props) => (
    <Toast toastId={props.toastId} variant={variant[props.state]} duration={options.duration}>
      <Switch>
        <Match when={props.state === "pending"}>{options.loading}</Match>
        <Match when={props.state === "fulfilled"}>{options.success?.(props.data!)}</Match>
        <Match when={props.state === "rejected"}>{options.error?.(props.error!)}</Match>
      </Switch>
    </Toast>
  ))
}

export { Toaster, Toast, ToastClose, ToastTitle, ToastDescription, showToast, showToastPromise }
