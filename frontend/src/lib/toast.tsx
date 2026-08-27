import { createSignal, For, Show, onCleanup } from 'solid-js'
import type { JSX } from 'solid-js'

// Global toast system — one source of mutation feedback across all pages.
// Replaces the scattered inline message()/notice() patterns with a unified,
// auto-dismissing toast that appears at the bottom-right.
//
// Usage:
//   import { toast } from '../lib/toast'
//   toast.success('Reconciliation finished: 3 findings')
//   toast.error('Deploy failed: image pull timeout')
//   toast.info('Outbox item is back in the pending queue')

type ToastKind = 'success' | 'error' | 'info'
type ToastItem = { id: number; kind: ToastKind; text: string; createdAt: number }

const [toasts, setToasts] = createSignal<ToastItem[]>([])
let nextId = 0

function dismiss(id: number) {
  setToasts(list => list.filter(t => t.id !== id))
}

function push(kind: ToastKind, text: string, duration = 4000) {
  const id = ++nextId
  setToasts(list => [...list, { id, kind, text, createdAt: Date.now() }])
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration)
  }
}

export const toast = {
  success: (text: string) => push('success', text),
  error: (text: string) => push('error', text, 6000),
  info: (text: string) => push('info', text),
  dismiss,
}

export function ToastContainer(): JSX.Element {
  return <Show when={toasts().length > 0}>
    <div class="toast-container" role="region" aria-label="Notifications" aria-live="polite">
      <For each={toasts()}>{item => (
        <div class={`toast toast-${item.kind}`} role="status">
          <span class="toast-icon" aria-hidden="true">
            <Show when={item.kind === 'success'} fallback={
              <Show when={item.kind === 'error'} fallback={<span>ℹ</span>}>✕</Show>
            }>✓</Show>
          </span>
          <span class="toast-text">{item.text}</span>
          <button class="toast-close" type="button" onClick={() => dismiss(item.id)} aria-label="Dismiss">✕</button>
        </div>
      )}</For>
    </div>
  </Show>
}
