import { createSignal, For, Show, type JSX } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * Toast — global toast system. Same API as the old lib/toast.tsx:
 *   toast.success('Reconciliation finished')
 *   toast.error('Deploy failed')
 *   toast.info('Outbox item re-queued')
 *
 * No animation, no glow. Flat surface, one border, semantic colour for status.
 * Deliberately NOT using Kobalte's Toast — the existing signal-based system
 * is simpler and has the exact API the callers expect. Kobalte's Toast
 * requires a ToastRegion provider and toastId management that adds
 * complexity without value for this use case.
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

const kindBorder: Record<ToastKind, string> = {
  success: 'border-success/30',
  error: 'border-destructive/30',
  info: 'border-border',
}

export function ToastContainer(): JSX.Element {
  return (
    <Show when={toasts().length > 0}>
      <div
        class="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        <For each={toasts()}>{(item) => (
          <div
            class={cn(
              'pointer-events-auto flex items-center gap-3 rounded-md border bg-card px-4 py-3 shadow-md',
              kindBorder[item.kind],
            )}
            role="status"
          >
            <span class="text-sm font-medium text-foreground" aria-hidden="true">
              <Show when={item.kind === 'success'} fallback={
                <Show when={item.kind === 'error'} fallback={'i'}>{'x'}</Show>
              }>{'check'}</Show>
            </span>
            <span class="text-sm text-foreground">{item.text}</span>
            <button
              type="button"
              class="ml-auto text-muted-foreground hover:text-foreground"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss"
            >
              x
            </button>
          </div>
        )}</For>
      </div>
    </Show>
  )
}
