import { For, Show } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { capability, capabilityAction } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Badge } from './app/badge'
import { SurfaceAction } from './capabilities/SurfaceAction'

// Tracked links: the short link a post carries so a click can be followed to
// the signup it became. A post published by hand with the bare destination
// can never be credited with the fans it brought — this is where the link
// that can be credited comes from.

type TrackedLink = {
  id: string
  slug: string
  destination_url: string
  active: boolean
  channel_source: string | null
  channel_community: string | null
  channel_creative: string | null
}

export function TrackedLinksPanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const links = useQuery(() => ({
    queryKey: ['surface', props.slug, 'tracked-links'],
    queryFn: () => surface.read<{ items: TrackedLink[] }>(props.slug, capability('smart-links').read!.path),
    staleTime: 60_000,
    retry: 1,
  }))
  return (
    <Section
      title="Tracked links"
      icon={<SectionIcon name="link" />}
      count={links.data?.items.length}
      description="Put one of these in a post instead of the bare address, and the fans it brings are credited to that post."
      action={<SurfaceAction slug={props.slug} action={capabilityAction('smart-links', 'Create a link')} label="New tracked link" onDone={() => void queryClient.invalidateQueries({ queryKey: ['surface', props.slug, 'tracked-links'] })} />}
    >
      <Show when={!links.error} fallback={<p class="text-sm text-muted-foreground">Couldn't check the tracked links.</p>}>
        <Show when={links.data} fallback={<p class="text-sm text-muted-foreground">Checking…</p>}>
          <Show when={links.data!.items.length > 0} fallback={<p class="text-sm text-muted-foreground">No tracked link yet.</p>}>
            <ul class="divide-y divide-border rounded-lg border border-border">
              <For each={links.data!.items}>{link => (
                <li class="flex flex-wrap items-center gap-2 p-3 text-sm">
                  <span class="font-mono text-xs text-foreground">{link.slug}</span>
                  <span class="min-w-0 truncate text-xs text-muted-foreground">→ {link.destination_url}</span>
                  <Show when={link.channel_source}><Badge variant="outline">{link.channel_source}{link.channel_community ? ` · ${link.channel_community}` : ''}</Badge></Show>
                  <Show when={!link.active}><Badge variant="muted">off</Badge></Show>
                </li>
              )}</For>
            </ul>
          </Show>
        </Show>
      </Show>
    </Section>
  )
}
