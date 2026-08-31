import { Show, createSignal, onCleanup, onMount, type Component, type JSX } from 'solid-js'

// Shared modal shell. Overlays used to be plain divs with a click-to-close
// backdrop: no dialog role, no Escape, no focus trap, and focus left behind on
// whatever the operator clicked. Every overlay goes through this instead.
//
// The trap is deliberately simple — it cycles the focusable children on Tab
// rather than hiding the rest of the tree — because the overlay is short-lived
// and the console has no nested modals.
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

type DialogProps = {
  open: boolean
  onClose: () => void
  label: string
  class?: string
  overlayClass?: string
  children: JSX.Element
}

// Mounted only while open, so the key handler and focus restore live exactly
// as long as the dialog does.
const DialogPanel: Component<Omit<DialogProps, 'open'>> = (props) => {
  let panel: HTMLDivElement | undefined

  onMount(() => {
    const previous = document.activeElement as HTMLElement | null

    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        props.onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panel?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey, true)
    // Move focus in so the first Tab lands inside the dialog, not behind it.
    queueMicrotask(() => (focusables()[0] ?? panel)?.focus())

    onCleanup(() => {
      document.removeEventListener('keydown', onKey, true)
      previous?.focus?.()
    })
  })

  return <div class={props.overlayClass ?? 'dialog-overlay'} onClick={() => props.onClose()}>
    <div
      ref={panel}
      class={props.class ?? 'dialog-panel'}
      role="dialog"
      aria-modal="true"
      aria-label={props.label}
      tabindex={-1}
      onClick={(event) => event.stopPropagation()}
    >
      {props.children}
    </div>
  </div>
}

export const Dialog: Component<DialogProps> = (props) => (
  <Show when={props.open}>
    <DialogPanel
      onClose={() => props.onClose()}
      label={props.label}
      class={props.class}
      overlayClass={props.overlayClass}
    >
      {props.children}
    </DialogPanel>
  </Show>
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
  return <Show when={pending()} keyed>
    {request => (
      <Dialog open onClose={() => settle(false)} label={request.title} class="dialog-panel confirm-dialog">
        <h3 class="confirm-dialog-title">{request.title}</h3>
        <Show when={request.body}>
          <p class="confirm-dialog-body">{request.body}</p>
        </Show>
        <div class="confirm-dialog-actions">
          <button type="button" class="ghost" onClick={() => settle(false)}>
            {request.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            class={request.destructive ? 'danger' : ''}
            onClick={() => settle(true)}
          >
            {request.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </Dialog>
    )}
  </Show>
}
