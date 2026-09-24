import { Show, createSignal } from 'solid-js'
import { capabilityAction } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { errorHeading } from '../lib/api'
import { Button } from './app/button'
import { toast } from './app/toast'

/** One yes for every item already open on screen. The rows above show each
 * draft in full, so the whole set is read before this is pressed; the second
 * press is the confirmation, and it names the count because some of these
 * reach real people. */
export function ApproveAllButton(props: { slug: string; actionIds: string[]; onDone: () => void }) {
  const [armed, setArmed] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const run = async () => {
    if (!armed()) { setArmed(true); return }
    setBusy(true)
    try {
      await surface.write(props.slug, 'POST', capabilityAction('approvals', 'Approve several').path, { action_ids: props.actionIds })
      toast.success(`Approved ${props.actionIds.length}`)
      props.onDone()
    } catch (error) {
      toast.error(errorHeading(error, 'Approving them all failed'))
    } finally {
      setBusy(false)
      setArmed(false)
    }
  }
  return (
    <span class="inline-flex items-center gap-2">
      <Button size="sm" variant={armed() ? 'default' : 'outline'} writes disabled={busy()} onClick={() => void run()}>
        {busy() ? 'Approving…' : armed() ? `Yes, approve all ${props.actionIds.length}` : `Approve all ${props.actionIds.length}`}
      </Button>
      <Show when={armed() && !busy()}>
        <Button size="sm" variant="ghost" onClick={() => setArmed(false)}>Not yet</Button>
      </Show>
    </span>
  )
}
