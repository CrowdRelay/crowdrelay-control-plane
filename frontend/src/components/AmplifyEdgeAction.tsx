import { Show, createSignal } from 'solid-js'
import { failureLine } from '../lib/errors'
import { capability, capabilityAction } from '../lib/capabilities'
import { fillPath, surface } from '../lib/surface'
import { Button } from './app/button'
import { SurfaceAction } from './capabilities/SurfaceAction'

/** "Send to their fans" on one live agreement. The reach is read first and
 * shown as a count — fans never leave home, so the beneficiary sees how many
 * people a send would reach and never who they are. The send itself goes out
 * through the audience owner's channel and carries the confirm step. */
export function AmplifyEdgeAction(props: { slug: string; consentId: string; onDone: () => void }) {
  const [reach, setReach] = createSignal<number | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [busy, setBusy] = createSignal(false)
  const preview = async () => {
    setBusy(true)
    setError(null)
    try {
      const path = fillPath(capability('amplification-preview').read!.path, { consent_id: props.consentId })!
      const result = await surface.read<{ reachableFans: number }>(props.slug, path)
      setReach(result.reachableFans)
    } catch (caught) {
      setError(failureLine("Couldn't count who this reaches", caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Show when={reach() !== null} fallback={
      <span class="inline-flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy()} onClick={() => void preview()}>{busy() ? 'Counting…' : 'Send to their fans'}</Button>
        <Show when={error()}><small class="text-xs text-destructive">{error()}</small></Show>
      </span>
    }>
      <SurfaceAction
        slug={props.slug}
        size="sm"
        action={capabilityAction('amplification', 'Run campaign')}
        label={`Write to ${reach()} fans`}
        fixed={{ consent_id: props.consentId }}
        onDone={() => { setReach(null); props.onDone() }}
      >
        <p class="mb-2 text-xs text-muted-foreground">Reaches {reach()} fans through their own channel. You see the count, never the people.</p>
      </SurfaceAction>
    </Show>
  )
}
