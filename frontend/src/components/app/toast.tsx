import type { JSX } from 'solid-js'
import { Toaster, showToast } from '~/components/ui/toast'
import { describeErrorLine } from '~/lib/errors'

/**
 * The console's toast API over the stock solid-ui toast.
 *
 *   toast.success('Reconciliation finished')
 *   toast.error("Couldn't start the deploy", error)
 *   toast.info('Outbox item re-queued')
 *
 * `toast.error` takes what failed as its title and, optionally, the caught
 * error — which becomes a plain-language reason and next step underneath.
 * Never pass `error.message` as the text: that is developer language.
 */
export const toast = {
  success: (text: string) => showToast({ description: text, variant: 'success', duration: 4000 }),
  error: (text: string, cause?: unknown) => showToast(
    cause === undefined
      ? { description: text, variant: 'error', persistent: true }
      : { title: text, description: describeErrorLine(cause), variant: 'error', persistent: true },
  ),
  info: (text: string) => showToast({ description: text, duration: 4000 }),
}

export function ToastContainer(): JSX.Element {
  return <Toaster />
}
