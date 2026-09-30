import { For, createEffect, createSignal } from 'solid-js'
import { FormDrawer } from './app/form-drawer'
import { Checkbox } from './app/checkbox'
import { api } from '../lib/api'
import { capabilityAction } from '../lib/capabilities'
import { failureLine } from '../lib/errors'
import { refreshQueries } from '../lib/refresh'
import type { ContentSourceView } from '../lib/types'

const PLATFORMS = ['reddit', 'forum', 'lemmy', 'telegram', 'discord', 'facebook', 'instagram', 'x', 'email', 'signal_push']
const LABELS: Record<string, string> = { forum: 'Forums', lemmy: 'Lemmy', reddit: 'Reddit', telegram: 'Telegram', discord: 'Discord', facebook: 'Facebook', instagram: 'Instagram', x: 'X', email: 'Email', signal_push: 'Signal push' }

export function PromotionRequestDrawer(props: { slug: string; source: ContentSourceView | null; onClose: () => void }) {
  const action = capabilityAction('content-promotion', 'Request promotion')
  const [excluded, setExcluded] = createSignal<string[]>([])
  const [pending, setPending] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  createEffect(() => {
    const source = props.source
    if (!source) return
    const policy = source.metadata?.promotion_excluded_platforms
    setExcluded(policy === undefined
      ? source.source_kind === 'video' ? ['facebook', 'instagram'] : []
      : Array.isArray(policy) && policy.every(value => typeof value === 'string' && PLATFORMS.includes(value))
        ? policy as string[] : [...PLATFORMS])
    setError(null)
  })
  const submit = async () => {
    const source = props.source
    if (!source || pending()) return
    setPending(true); setError(null)
    try {
      await api.promoteContentSource(props.slug, source.source_id, excluded())
      refreshQueries(['content-sources', props.slug])
      props.onClose()
    } catch (err) {
      setError(failureLine("Couldn't request promotion", err))
    } finally { setPending(false) }
  }
  return <FormDrawer
    open={props.source !== null}
    onOpenChange={open => { if (!open && !pending()) props.onClose() }}
    title="Request promotion"
    description="Choose permitted platforms. This requests the existing guarded promotion cycle; it does not prove that a post was published or override an approval or moderation hold."
    submitLabel={action.label}
    pendingLabel="Requesting…"
    pending={pending()}
    error={error()}
    onSubmit={() => void submit()}
  >
    <p class="text-sm">{props.source?.title}</p>
    <For each={PLATFORMS}>{platform => <Checkbox
      checked={!excluded().includes(platform)}
      onChange={allowed => setExcluded(previous => allowed ? previous.filter(value => value !== platform) : [...previous, platform])}
      label={LABELS[platform] ?? platform}
    />}</For>
    <p class="text-xs text-muted-foreground">Only admitted communities with suitable membership are drafted. Missing credentials, unverified rules, and Discord community posts require a person. Reddit moderator holds remain in force.</p>
  </FormDrawer>
}
