import { For, Show, createMemo } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { capability, capabilityAction } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Badge } from './app/badge'
import { SurfaceAction } from './capabilities/SurfaceAction'

// Free-reach waves: the agent batches its pitches around one moment (a show,
// a release) and seals the batch so a person reads it once and says yes once
// — approving forty pitches one by one is how a human stops approving. Only a
// sealed wave is approvable; a drafting one can still grow, and a batch that
// grows after somebody read it is a batch nobody read. Silent when nothing is
// sealed: this is a queue, not a report.

type Wave = {
  wave_id: string
  anchor: { kind: string; event_id?: string }
  target_kind: string
  state: 'drafting' | 'sealed' | 'approved' | 'expired'
  pitches: number
  eligible_targets: number
  third_party_budget_remaining: number
  anchor_active: boolean
}

const words = (value: string) => value.replaceAll('_', ' ')

/** What the wave is pitched around, in the act's words. A catalogue wave is
 *  the month's pitch of the act's own records — no show, no release date. */
const anchorLabel = (kind: string) => ({
  event: 'for a show',
  release: 'for a release',
  catalogue: 'your catalogue, this month',
} as Record<string, string>)[kind] ?? `for a ${words(kind)}`

export function OutreachWavesPanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const waves = useQuery(() => ({
    queryKey: ['surface', props.slug, 'outreach-waves'],
    queryFn: () => surface.read<Wave[]>(props.slug, capability('outreach-waves').read!.path),
    staleTime: 30_000,
    retry: 1,
  }))
  const sealed = createMemo(() => (waves.data ?? []).filter(wave => wave.state === 'sealed'))
  // Waves still being written: not approvable yet, but the reason the queue
  // is quiet — the agent is gathering the batch, not idle.
  const drafting = createMemo(() => (waves.data ?? []).filter(wave => wave.state === 'drafting'))

  return (
    <Show when={waves.error || sealed().length > 0 || drafting().length > 0}>
      <Section
        title="Waves waiting for one yes"
        icon={<SectionIcon name="megaphone" />}
        count={sealed().length}
        description="Each wave is every pitch written for one moment. Read the pitches in Needs you, then approve the wave once."
      >
        <Show when={!waves.error} fallback={<p class="text-sm text-muted-foreground">Couldn't check the outreach waves.</p>}>
          <ul class="space-y-2">
            <For each={sealed()}>{wave => (
              <li class="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 text-sm">
                <span class="font-medium text-foreground">{wave.pitches} pitches to {words(wave.target_kind)} contacts</span>
                <Badge variant="muted">{anchorLabel(wave.anchor.kind)}</Badge>
                <Show when={!wave.anchor_active}><Badge variant="warning">its moment has passed</Badge></Show>
                <span class="text-xs text-muted-foreground">{wave.third_party_budget_remaining} sends left in today's ceiling</span>
                <div class="ml-auto flex items-center gap-2">
                  <Link to="/tenants/$slug/attention" params={{ slug: props.slug }} class="text-xs text-muted-foreground underline underline-offset-4">Read the pitches</Link>
                  <Show when={wave.anchor_active}>
                    <SurfaceAction
                      slug={props.slug}
                      size="sm"
                      action={capabilityAction('outreach-waves', 'Approve wave')}
                      fixed={{ wave_id: wave.wave_id }}
                      onDone={() => void queryClient.invalidateQueries({ queryKey: ['surface', props.slug, 'outreach-waves'] })}
                    />
                  </Show>
                </div>
              </li>
            )}</For>
            <For each={drafting()}>{wave => (
              <li class="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                <span>Being written: {wave.pitches} {wave.pitches === 1 ? 'pitch' : 'pitches'} to {words(wave.target_kind)} contacts so far</span>
                <Badge variant="muted">{anchorLabel(wave.anchor.kind)}</Badge>
                <span class="text-xs">it seals for your yes when full or after a week</span>
              </li>
            )}</For>
          </ul>
        </Show>
      </Section>
    </Show>
  )
}
