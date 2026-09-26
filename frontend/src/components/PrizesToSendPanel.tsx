import { For, Show, createMemo } from 'solid-js'
import { Gift } from 'lucide-solid'
import { capabilityAction } from '../lib/capabilities'
import { refreshQueries } from '../lib/refresh'
import type { RewardFulfillment } from '../lib/types'
import { SurfaceAction } from './capabilities/SurfaceAction'
import { Card, ItemRow } from './ui/dash'

// Prizes a draw gave away and nobody has sent yet. A winner who never gets the
// shirt remembers it longer than the draw, so these sit on Today as chores.
// Silent when nothing is owed. The fan's address stays masked here; the draw
// is identified by its slug so the person packing knows which night it was.
//
// The rows arrive inside the today read model (`reward_fulfillments`), so the
// page opens on one call; marking a prize refreshes that model.

export function PrizesToSendPanel(props: { slug: string; rows: RewardFulfillment[] | null | undefined }) {
  const owed = createMemo(() => (props.rows ?? []).filter(p => p.status === 'pending' || p.status === 'prepared'))

  return (
    <Show when={owed().length > 0}>
      <Card title="Prizes to send" icon={<Gift />} aside={`${owed().length} waiting`}>
        <For each={owed()}>{prize => (
          <ItemRow
            pill={prize.status === 'prepared' ? { tone: 'warn', text: 'packed' } : { tone: 'muted', text: 'not packed' }}
            title={`${prize.quantity} × ${prize.prize_name}${prize.prize_variant ? ` (${prize.prize_variant})` : ''}`}
            sub={`for ${prize.fan_display_name ?? prize.fan_email_masked} · ${prize.draw_slug.replaceAll('-', ' ')}`}
            action={
              <SurfaceAction
                slug={props.slug}
                size="sm"
                action={capabilityAction('reward-fulfillments', 'Mark')}
                label="Update"
                fixed={{ winner_id: prize.winner_id }}
                initial={{ status: prize.status === 'prepared' ? 'delivered' : 'prepared' }}
                onDone={() => refreshQueries(['tenant-today', props.slug])}
              />
            }
          />
        )}</For>
      </Card>
    </Show>
  )
}
