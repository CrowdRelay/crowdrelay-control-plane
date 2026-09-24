import { For, Show, createMemo } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { capability, capabilityAction } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Badge } from './app/badge'
import { SurfaceAction } from './capabilities/SurfaceAction'

// Prizes a draw gave away and nobody has sent yet. A winner who never gets the
// shirt remembers it longer than the draw, so these sit on Today as chores.
// Silent when nothing is owed. The fan's address stays masked here; the draw
// is identified by its slug so the person packing knows which night it was.

type Fulfillment = {
  winner_id: string
  draw_slug: string
  winner_rank: number
  fan_display_name: string | null
  fan_email_masked: string
  prize_name: string
  prize_variant: string
  quantity: number
  status: 'pending' | 'prepared' | 'delivered' | 'cancelled'
}

export function PrizesToSendPanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const prizes = useQuery(() => ({
    queryKey: ['surface', props.slug, 'prizes-to-send'],
    queryFn: () => surface.read<Fulfillment[]>(props.slug, capability('reward-fulfillments').read!.path),
    staleTime: 60_000,
    retry: 1,
  }))
  const owed = createMemo(() => (prizes.data ?? []).filter(p => p.status === 'pending' || p.status === 'prepared'))

  return (
    <Show when={owed().length > 0}>
      <Section title="Prizes to send" icon={<SectionIcon name="inbox" />} count={owed().length} description="Draw winners still waiting for their prize.">
        <ul class="space-y-2">
          <For each={owed()}>{prize => (
            <li class="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 text-sm">
              <span class="font-medium text-foreground">{prize.quantity} × {prize.prize_name}{prize.prize_variant ? ` (${prize.prize_variant})` : ''}</span>
              <span class="text-muted-foreground">for {prize.fan_display_name ?? prize.fan_email_masked}</span>
              <Badge variant="muted">{prize.draw_slug.replaceAll('-', ' ')}</Badge>
              <Badge variant={prize.status === 'prepared' ? 'warning' : 'muted'}>{prize.status === 'prepared' ? 'packed' : 'not packed'}</Badge>
              <div class="ml-auto">
                <SurfaceAction
                  slug={props.slug}
                  size="sm"
                  action={capabilityAction('reward-fulfillments', 'Mark')}
                  label="Update"
                  fixed={{ winner_id: prize.winner_id }}
                  initial={{ status: prize.status === 'prepared' ? 'delivered' : 'prepared' }}
                  onDone={() => void queryClient.invalidateQueries({ queryKey: ['surface', props.slug, 'prizes-to-send'] })}
                />
              </div>
            </li>
          )}</For>
        </ul>
      </Section>
    </Show>
  )
}
