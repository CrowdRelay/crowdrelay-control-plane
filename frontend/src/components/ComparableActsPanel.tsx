import { For, Show, createMemo } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { capability, capabilityAction } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { authState } from '../lib/auth'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Badge } from './app/badge'
import { SurfaceAction } from './capabilities/SurfaceAction'

// Comparable acts — the peer graph behind the strongest reason in a gig
// letter ("acts like you played this room"). The scanner proposes a peer; a
// person confirms or refuses, and only a confirmed peer is ever watched. This
// is operator curation rather than a band decision (CrowdRelay documents it
// so), so the panel is platform-level only.

type Peer = {
  id: string
  name: string
  tier: string
  why: string
  proposed_by: string
  status: 'proposed' | 'confirmed' | 'rejected'
  rejection_reason?: string
}

export function ComparableActsPanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const peers = useQuery(() => ({
    queryKey: ['surface', props.slug, 'peers'],
    queryFn: () => surface.read<{ peers: Peer[] }>(props.slug, capability('peers').read!.path),
    enabled: authState.isPlatformLevel(),
    staleTime: 60_000,
    retry: 1,
  }))
  const proposed = createMemo(() => (peers.data?.peers ?? []).filter(p => p.status === 'proposed'))
  const confirmed = createMemo(() => (peers.data?.peers ?? []).filter(p => p.status === 'confirmed'))
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['surface', props.slug, 'peers'] })

  return (
    <Show when={authState.isPlatformLevel()}>
      <Section
        title="Comparable acts"
        icon={<SectionIcon name="users" />}
        count={confirmed().length}
        description="Acts whose audiences overlap. A confirmed one is watched, and its shows become the 'acts like you played here' reason in a letter."
        action={<SurfaceAction slug={props.slug} action={capabilityAction('peers', 'Add a peer')} label="Add an act" onDone={refresh} />}
      >
        <Show when={!peers.error} fallback={<p class="text-sm text-muted-foreground">Couldn't check the comparable acts.</p>}>
          <Show when={peers.data} fallback={<p class="text-sm text-muted-foreground">Checking…</p>}>
            <Show when={proposed().length > 0}>
              <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Proposed — confirm or refuse</p>
              <ul class="mt-1 mb-3 space-y-1.5">
                <For each={proposed()}>{peer => (
                  <li class="flex flex-wrap items-center gap-2 text-sm">
                    <span class="font-medium text-foreground">{peer.name}</span>
                    <Badge variant="outline">{peer.tier.replaceAll('_', ' ')}</Badge>
                    <span class="text-xs text-muted-foreground">{peer.why} · proposed by {peer.proposed_by}</span>
                    <SurfaceAction slug={props.slug} size="xs" variant="ghost" action={capabilityAction('peers', 'Resolve')} label="Decide" fixed={{ peer_id: peer.id }} onDone={refresh} />
                  </li>
                )}</For>
              </ul>
            </Show>
            <Show when={confirmed().length > 0} fallback={<p class="text-sm text-muted-foreground">No comparable act confirmed yet, so no letter can cite one.</p>}>
              <ul class="space-y-1 text-sm">
                <For each={confirmed()}>{peer => (
                  <li><span class="text-foreground">{peer.name}</span> <span class="text-xs text-muted-foreground">· {peer.tier.replaceAll('_', ' ')} · {peer.why}</span></li>
                )}</For>
              </ul>
            </Show>
          </Show>
        </Show>
      </Section>
    </Show>
  )
}
