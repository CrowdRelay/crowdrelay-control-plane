import type { JSX } from 'solid-js'
import { Toaster, showToast } from '~/components/ui/toast'

/**
 * The console's toast API over the stock solid-ui toast.
 *
 *   toast.success('Reconciliation finished')
 *   toast.error('Deploy failed')
 *   toast.info('Outbox item re-queued')
 */
export const toast = {
  success: (text: string) => showToast({ description: text, variant: 'success', duration: 4000 }),
  error: (text: string) => showToast({ description: text, variant: 'error', persistent: true }),
  info: (text: string) => showToast({ description: text, duration: 4000 }),
}

export function ToastContainer(): JSX.Element {
  return <Toaster />
}
