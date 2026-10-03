import { Show, createSignal, type Component, type JSX } from 'solid-js'
import {
  Dialog as DialogRoot,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './app/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './app/alert-dialog'
import { Button } from './app/button'

// Shared modal shell composed from the vendored ui/dialog primitives
// (canonical shadcn composition) rather than raw Kobalte. Keeps the
// convenience API consumers already use:
//
//   <Dialog open={show()} onClose={() => setShow(false)} label="Title">
//     …content…
//   </Dialog>

type DialogProps = {
  open: boolean
  onClose: () => void
  label: string
  description?: JSX.Element
  /** Visible heading. Defaults to `label`; pass `false` to draw your own. */
  title?: JSX.Element | false
  /** Right-aligned action row, separated from the body by a rule. */
  footer?: JSX.Element
  class?: string
  children: JSX.Element
}

// DialogContent already provides the portal, overlay, X close button and
// focus trap. The content is a flex column whose middle section scrolls —
// the console has forms with eight fields and a hint under each, so a dialog
// taller than the viewport scrolls its body rather than clipping.
export const Dialog: Component<DialogProps> = (props) => (
  <DialogRoot open={props.open} onOpenChange={(open) => { if (!open) props.onClose() }}>
    <DialogContent
      class={`flex max-h-[calc(100vh-4rem)] w-[calc(100vw-2rem)] max-w-md flex-col gap-0 overflow-hidden rounded-lg border-border bg-card p-0 ${props.class ?? ''}`}
      aria-label={props.title === false ? props.label : undefined}
    >
      <Show when={props.title !== false}>
        <DialogHeader class="gap-1.5 border-b border-border px-5 py-4 text-left">
          <DialogTitle class="text-sm">{props.title ?? props.label}</DialogTitle>
          <Show when={props.description}>
            <DialogDescription class="leading-relaxed">{props.description}</DialogDescription>
          </Show>
        </DialogHeader>
      </Show>
      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">{props.children}</div>
      <Show when={props.footer}>
        <DialogFooter class="flex-row flex-wrap items-center justify-end gap-2 space-x-0 border-t border-border px-5 py-4">
          {props.footer}
        </DialogFooter>
      </Show>
    </DialogContent>
  </DialogRoot>
)

// ─── Confirmation ────────────────────────────────────────────────────────
// Destructive actions used native window.confirm(), which blocks the tab and
// looks nothing like the console. Same call shape, awaited:
//
//   if (await confirmAction({ title: 'Delete channel', … })) remove.mutate(id)
//
// Built on the vendored ui/alert-dialog primitives. The action buttons are
// plain Buttons rather than AlertDialogAction/Cancel: CloseButton resolves
// the dialog's open state before our click handler runs, which would settle
// every confirm as cancelled. Resolving from the signal keeps the order.

type ConfirmRequest = {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

const [pending, setPending] = createSignal<(ConfirmRequest & { resolve: (ok: boolean) => void }) | null>(null)

// The dialog opens from an ordinary button, not a Kobalte trigger, so on
// close focus fell to <body> and a keyboard user started over from the top
// of the page. Remember what was focused and go back there — FormDrawer does
// the same.
let returnFocusTo: HTMLElement | null = null

export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    returnFocusTo = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    setPending({ ...request, resolve })
  })
}

function settle(ok: boolean) {
  const current = pending()
  setPending(null)
  current?.resolve(ok)
}

export function ConfirmHost(): JSX.Element {
  return (
    <AlertDialog open={pending() !== null} onOpenChange={(open) => { if (!open) settle(false) }}>
      <AlertDialogContent
        class="max-w-md border-border bg-card"
        onCloseAutoFocus={(event: Event) => {
          if (!returnFocusTo?.isConnected) return
          event.preventDefault()
          returnFocusTo.focus()
          returnFocusTo = null
        }}
      >
        <Show when={pending()} keyed>
          {request => (
            <>
              <AlertDialogHeader class="gap-2 text-left">
                <AlertDialogTitle class="text-sm">{request.title}</AlertDialogTitle>
                <Show when={request.body}>
                  <AlertDialogDescription class="leading-relaxed">
                    {request.body}
                  </AlertDialogDescription>
                </Show>
              </AlertDialogHeader>
              <AlertDialogFooter class="mt-3 flex-row justify-end gap-2 space-x-0">
                <Button type="button" variant="ghost" size="sm" onClick={() => settle(false)}>
                  {request.cancelLabel ?? 'Cancel'}
                </Button>
                <Button
                  writes
                  type="button"
                  variant={request.destructive ? 'destructive' : 'default'}
                  size="sm"
                  onClick={() => settle(true)}
                >
                  {request.confirmLabel ?? 'Confirm'}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </Show>
      </AlertDialogContent>
    </AlertDialog>
  )
}
