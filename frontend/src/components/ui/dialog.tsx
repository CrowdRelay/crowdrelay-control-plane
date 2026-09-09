import { type Component, type JSX, Show, splitProps } from 'solid-js'
import { Dialog as DialogPrimitive } from '@kobalte/core'
import { cn } from '~/lib/cn'

/**
 * Dialog — Kobalte-based accessible modal. Replaces the hand-rolled Dialog.tsx.
 * Provides focus trap, Escape to close, click-outside, and ARIA roles out of
 * the box. No glassmorphism — flat overlay, one border.
 */

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.CloseButton

export const DialogContent: Component<{
  class?: string
  children: JSX.Element
}> = (props) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      class="fixed inset-0 z-50 bg-black/60 data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0"
    />
    <DialogPrimitive.Content
      class={cn(
        'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-lg',
        props.class,
      )}
    >
      {props.children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
)

export const DialogTitle: Component<JSX.HTMLAttributes<HTMLHeadingElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <DialogPrimitive.Title class={cn('text-lg font-semibold text-foreground', local.class)} {...rest} />
}

export const DialogDescription: Component<JSX.HTMLAttributes<HTMLParagraphElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <DialogPrimitive.Description class={cn('text-sm text-muted-foreground', local.class)} {...rest} />
}

// ─── Confirmation dialog (same API as the old confirmAction) ────────────
import { createSignal } from 'solid-js'
import { Button } from './button'

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
    <Dialog open={pending() !== null} onOpenChange={(open) => { if (!open) settle(false) }}>
      <DialogContent class="max-w-md">
        <Show when={pending()} keyed>
          {(request) => (
            <>
              <DialogTitle>{request.title}</DialogTitle>
              <Show when={request.body}>
                <DialogDescription class="mt-2">{request.body}</DialogDescription>
              </Show>
              <div class="mt-6 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => settle(false)}>
                  {request.cancelLabel ?? 'Cancel'}
                </Button>
                <Button
                  variant={request.destructive ? 'destructive' : 'default'}
                  onClick={() => settle(true)}
                >
                  {request.confirmLabel ?? 'Confirm'}
                </Button>
              </div>
            </>
          )}
        </Show>
      </DialogContent>
    </Dialog>
  )
}
