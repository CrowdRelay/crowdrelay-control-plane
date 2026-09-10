import { Show, createSignal, type Component, type JSX } from 'solid-js'
import { Dialog as DialogPrimitive } from '@kobalte/core'
import { Button } from './ui/button'
import { cn } from '../lib/cn'

// Shared modal shell built on Kobalte's Dialog primitive. Provides focus trap,
// Escape to close, click-outside, and ARIA roles out of the box. Same API as
// the previous hand-rolled Dialog so consumers don't change.
//
//   <Dialog open={show()} onClose={() => setShow(false)} label="Title">
//     …content…
//   </Dialog>

type DialogProps = {
  open: boolean
  onClose: () => void
  label: string
  description?: string
  class?: string
  overlayClass?: string
  children: JSX.Element
}

export const Dialog: Component<DialogProps> = (props) => (
  <DialogPrimitive.Root open={props.open} onOpenChange={(open) => { if (!open) props.onClose() }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        class={cn(
          'fixed inset-0 z-50 bg-black/50',
          props.overlayClass,
        )}
      />
      <DialogPrimitive.Content
        class={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-xl',
          props.class,
        )}
        aria-label={props.label}
        aria-describedby={props.description ? `${props.label}-desc` : undefined}
      >
        {props.children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
)

// ─── Confirmation ────────────────────────────────────────────────────────
// Destructive actions used native window.confirm(), which blocks the tab and
// looks nothing like the console. Same call shape, awaited:
//
//   if (await confirmAction({ title: 'Delete channel', … })) remove.mutate(id)

type ConfirmRequest = {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

const [pending, setPending] = createSignal<(ConfirmRequest & { resolve: (ok: boolean) => void }) | null>(null)

export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  return new Promise<boolean>(resolve => {
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
    <DialogPrimitive.Root open={pending() !== null} onOpenChange={(open) => { if (!open) settle(false) }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay class="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-xl">
          <Show when={pending()} keyed>
            {request => (
              <>
                <DialogPrimitive.Title class="text-lg font-semibold text-foreground">{request.title}</DialogPrimitive.Title>
                <Show when={request.body}>
                  <DialogPrimitive.Description class="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {request.body}
                  </DialogPrimitive.Description>
                </Show>
                <div class="mt-5 flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => settle(false)}>
                    {request.cancelLabel ?? 'Cancel'}
                  </Button>
                  <Button
                    type="button"
                    variant={request.destructive ? 'destructive' : 'default'}
                    size="sm"
                    onClick={() => settle(true)}
                  >
                    {request.confirmLabel ?? 'Confirm'}
                  </Button>
                </div>
              </>
            )}
          </Show>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
