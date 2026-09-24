import { For, Show, createMemo } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { capability, capabilityAction } from '../../lib/capabilities'
import { surface } from '../../lib/surface'
import { formatTimestamp } from '../../lib/format'
import { Badge } from '../app/badge'
import { SurfaceAction } from '../capabilities/SurfaceAction'

// "At the door" — the two things that turn a room into fans on the night:
// the QR code people scan (where it hangs, whether it was called from the
// stage, what it offers) and the prize draw it can feed. Both are scoped to
// this show; the lists upstream are workspace-wide and are filtered here by
// the show's slug, so a code or draw for another night never appears.

type QrCampaign = {
  id: string
  event_slug: string
  label: string
  valid_from: string
  valid_until: string
  max_checkins: number | null
  checkin_count: number
  placement: string | null
  announced_from_stage: boolean
  incentive: string | null
  active: boolean
  revoked_at: string | null
}

type PrizeDraw = {
  id: string
  name: string
  status: string
  event_slug: string | null
  winner_count: number
  selected_winners: number
  prize_name: string
  pending_fulfillments: number
  delivered_fulfillments: number
  draw_at: string
}

export function ShowDoorPanel(props: { slug: string; eventSlug: string }) {
  const queryClient = useQueryClient()
  const codes = useQuery(() => ({
    queryKey: ['surface', props.slug, 'door-qr'],
    queryFn: () => surface.read<{ campaigns: QrCampaign[] }>(props.slug, capability('event-qr').read!.path, { limit: '100' }),
    staleTime: 30_000,
    retry: 1,
  }))
  const draws = useQuery(() => ({
    queryKey: ['surface', props.slug, 'door-draws'],
    queryFn: () => surface.read<PrizeDraw[]>(props.slug, capability('rewards').read!.path),
    staleTime: 30_000,
    retry: 1,
  }))
  const nightCodes = createMemo(() => (codes.data?.campaigns ?? []).filter(code => code.event_slug === props.eventSlug))
  const nightDraws = createMemo(() => (draws.data ?? []).filter(draw => draw.event_slug === props.eventSlug))
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['surface', props.slug] })

  return (
    <div class="rounded-lg border border-border bg-background px-4 py-3">
      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">At the door</p>

      <p class="mt-2 text-xs font-medium text-foreground">QR codes</p>
      <Show when={!codes.error} fallback={<p class="mt-1 text-xs text-muted-foreground">Couldn't check this night's QR codes.</p>}>
        <Show when={codes.data} fallback={<p class="mt-1 text-xs text-muted-foreground">Checking…</p>}>
          <Show when={nightCodes().length > 0} fallback={
            <p class="mt-1 text-xs text-muted-foreground">No code for this night yet. A code on the merch table or called from the stage is how a room becomes reachable fans.</p>
          }>
            <ul class="mt-1 space-y-1.5">
              <For each={nightCodes()}>{code => (
                <li class="text-xs text-muted-foreground">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-sm text-foreground">{code.label}</span>
                    <Badge variant={code.revoked_at ? 'muted' : code.active ? 'success' : 'muted'}>{code.revoked_at ? 'revoked' : code.active ? 'live' : 'not live'}</Badge>
                    <span class="tabular-nums">{code.checkin_count}{code.max_checkins != null ? ` of ${code.max_checkins}` : ''} scans</span>
                    <Show when={code.placement}><span>· hangs at {code.placement}</span></Show>
                    <Show when={code.announced_from_stage}><span>· called from the stage</span></Show>
                    <Show when={code.incentive}><span>· offers {code.incentive}</span></Show>
                  </div>
                  <p class="mt-0.5">{formatTimestamp(code.valid_from)} → {formatTimestamp(code.valid_until)}</p>
                  <Show when={!code.revoked_at}>
                    <div class="mt-1 flex flex-wrap gap-2">
                      <SurfaceAction
                        slug={props.slug}
                        size="xs"
                        action={capabilityAction('event-qr', 'Context')}
                        label="Where it hangs"
                        fixed={{ campaign_id: code.id }}
                        initial={{ placement: code.placement ?? '', announced_from_stage: code.announced_from_stage, incentive: code.incentive ?? '' }}
                        onDone={refresh}
                      />
                      <SurfaceAction
                        slug={props.slug}
                        size="xs"
                        variant="destructive-ghost"
                        action={capabilityAction('event-qr', 'Revoke')}
                        fixed={{ campaign_id: code.id }}
                        onDone={refresh}
                      />
                    </div>
                  </Show>
                </li>
              )}</For>
            </ul>
          </Show>
          <div class="mt-2">
            <SurfaceAction
              slug={props.slug}
              size="xs"
              action={capabilityAction('event-qr', 'Create')}
              label="New QR code for this night"
              initial={{ event_slug: props.eventSlug }}
              hidden={['event_slug']}
              onDone={refresh}
            />
          </div>
        </Show>
      </Show>

      <p class="mt-4 border-t border-border pt-3 text-xs font-medium text-foreground">Prize draw</p>
      <Show when={!draws.error} fallback={<p class="mt-1 text-xs text-muted-foreground">Couldn't check draws for this night.</p>}>
        <Show when={draws.data} fallback={<p class="mt-1 text-xs text-muted-foreground">Checking…</p>}>
          <Show when={nightDraws().length > 0} fallback={
            <p class="mt-1 text-xs text-muted-foreground">No draw for this night. Fans earn entries by checking in and bringing friends.</p>
          }>
            <ul class="mt-1 space-y-1.5">
              <For each={nightDraws()}>{draw => (
                <li class="text-xs text-muted-foreground">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-sm text-foreground">{draw.name}</span>
                    <Badge variant="muted">{draw.status.replaceAll('_', ' ')}</Badge>
                    <span>{draw.prize_name}</span>
                    <span class="tabular-nums">· {draw.selected_winners} of {draw.winner_count} winners drawn</span>
                    <Show when={draw.pending_fulfillments > 0}><span class="tabular-nums">· {draw.pending_fulfillments} prizes to send</span></Show>
                  </div>
                  <p class="mt-0.5">Draw at {formatTimestamp(draw.draw_at)}</p>
                  <Show when={draw.status === 'draft' || draw.status === 'scheduled'}>
                    <div class="mt-1 flex flex-wrap gap-2">
                      <Show when={draw.status === 'draft'}>
                        <SurfaceAction slug={props.slug} size="xs" action={capabilityAction('rewards', 'Schedule')} fixed={{ draw_id: draw.id }} onDone={refresh} />
                      </Show>
                      <SurfaceAction slug={props.slug} size="xs" variant="destructive-ghost" action={capabilityAction('rewards', 'Cancel')} fixed={{ draw_id: draw.id }} onDone={refresh} />
                    </div>
                  </Show>
                </li>
              )}</For>
            </ul>
          </Show>
          <div class="mt-2">
            <SurfaceAction
              slug={props.slug}
              size="xs"
              action={capabilityAction('rewards', 'Create a draw')}
              label="New draw for this night"
              initial={{ event_slug: props.eventSlug }}
              hidden={['event_slug']}
              onDone={refresh}
            />
          </div>
        </Show>
      </Show>
    </div>
  )
}
