import { createSignal, For, Show, type JSX } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * Toast — global mutation feedback.
 *
 *   toast.success('Reconciliation finished')
 *   toast.error('Deploy failed')
 *   toast.info('Outbox item re-queued')
 *
 * Deliberately NOT Kobalte's Toast: the signal-based store below already has
 * the exact API the call sites use, and a ToastRegion provider plus toastId
 * bookkeeping would buy nothing here. Flat surface, one border, semantic
 * colour on the icon only — status is a property of the message, not a
 * reason to repaint the whole card.
 */

type ToastKind = 'success' | 'error' | 'info'
type ToastItem = { id: number; kind: ToastKind; text: string; createdAt: number }

const [toasts, setToasts] = createSignal<ToastItem[]>([])
let nextId = 0
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function dismiss(id: number) {
  setToasts(list => list.filter(t => t.id !== id))
  const t = timers.get(id)
  if (t) { clearTimeout(t); timers.delete(id) }
}

function push(kind: ToastKind, text: string, duration = 4000) {
  const id = ++nextId
  setToasts(list => [...list, { id, kind, text, createdAt: Date.now() }])
  if (duration > 0) {
    timers.set(id, setTimeout(() => dismiss(id), duration))
  }
}

export const toast = {
  success: (text: string) => push('success', text),
  error: (text: string) => push('error', text, 6000),
  info: (text: string) => push('info', text),
  dismiss,
}

const kindStyle: Record<ToastKind, { border: string; icon: string }> = {
  success: { border: 'border-success/30', icon: 'text-success' },
  error: { border: 'border-destructive/30', icon: 'text-destructive' },
  info: { border: 'border-border', icon: 'text-muted-foreground' },
}

const Glyph = (props: { kind: ToastKind }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <Show when={props.kind === 'success'}><path d="m8 12 3 3 5-6" /></Show>
    <Show when={props.kind === 'error'}><path d="m15 9-6 6M9 9l6 6" /></Show>
    <Show when={props.kind === 'info'}><path d="M12 11v5M12 8h.01" /></Show>
  </svg>
)

export function ToastContainer(): JSX.Element {
  return (
    <Show when={toasts().length > 0}>
      <div
        class="pointer-events-none fixed bottom-4 right-4 z-[9600] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        <For each={toasts()}>{(item) => (
          <div
            class={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-md border bg-card px-3.5 py-3 shadow-lg',
              kindStyle[item.kind].border,
            )}
            role="status"
          >
            <span class={cn('mt-px shrink-0', kindStyle[item.kind].icon)}>
              <Glyph kind={item.kind} />
            </span>
            <span class="min-w-0 flex-1 break-words text-sm leading-snug text-foreground">{item.text}</span>
            <button
              type="button"
              class="-mr-1 shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss notification"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}</For>
      </div>
    </Show>
  )
}
