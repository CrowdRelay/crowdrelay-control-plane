import { For, Show } from 'solid-js'
import { failureLine } from '../lib/errors'
import { useMutation, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { ShowGrowthLadderView, ShowLadderRung } from '../lib/types'
import { readOnly } from '../lib/read-only'
import { formatTimestamp, humanizeToken } from '../lib/format'
import { Button } from './ui/button'
import { Badge } from './app/badge'

/** The show's approve-once growth ladder (P.4): one yes covers the whole
 * T-21 → T+7 sequence — each rung still needs its own evidence gates, and a
 * revoke stops only the rungs not yet running. The panel reports the ladder
 * as upstream stores it: the approval row's state plus every rung's own
 * status, in due order. */

const LEVER_LABEL: Record<string, string> = {
  canonical_link_setup: 'Tracked link',
  free_listing_sweep: 'Free listings',
  audience_capture_setup: 'Audience capture',
  partner_cross_promo: 'Partner cross-promo',
  grassroots_scene_relay: 'Scene relay',
  fan_ambassadors: 'Fan ambassadors',
  social_proof_relay: 'Social proof',
  free_fan_channel_push: 'Fan channels',
  merch_buyer_offer: 'Merch offer',
  high_intent_last_mile: 'Last-mile tickets',
  post_show_merch_follow_up: 'Post-show merch',
  post_show_recap: 'Post-show recap',
  post_show_follow_ask: 'Follow ask',
}

function leverLabel(lever: string): string {
  return LEVER_LABEL[lever] ?? lever.replaceAll('_', ' ')
}

const RUNG_BADGE: Record<string, 'default' | 'muted' | 'success' | 'outline'> = {
  awaiting_approval: 'outline',
  queued: 'default',
  processing: 'default',
  succeeded: 'success',
  failed: 'muted',
  cancelled: 'muted',
}

function rungState(rung: ShowLadderRung): string {
  return rung.status.replaceAll('_', ' ')
}

export function ShowGrowthLadderPanel(props: { slug: string; eventId: string; ladder: ShowGrowthLadderView | null }) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['tenant-show-page', props.slug] })

  const approve = useMutation(() => ({
    mutationFn: () => api.approveShowGrowthLadder(props.slug, props.eventId),
    onSettled: invalidate,
  }))
  const revoke = useMutation(() => ({
    mutationFn: () => api.revokeShowGrowthLadder(props.slug, props.eventId),
    onSettled: invalidate,
  }))
  const mutationError = () => approve.error ?? revoke.error

  return (
    <div class="mb-3 rounded-lg border border-border bg-background px-4 py-2.5">
      <div class="flex items-center justify-between gap-3">
        <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Growth ladder
        </p>
        <Show when={props.ladder}>
          {view => (
            <Badge
              variant={
                view().ladder_state === 'approved'
                  ? 'success'
                  : view().ladder_state === 'revoked'
                    ? 'muted'
                    : 'outline'
              }
            >
              {view().ladder_state === 'none' ? 'not approved' : humanizeToken(view().ladder_state)}
            </Badge>
          )}
        </Show>
      </div>

      <Show when={props.ladder === null}>
        <p class="mt-1 text-xs text-muted-foreground">Couldn't check the ladder — it fills in on its own.</p>
      </Show>

      <Show when={props.ladder}>
        {view => (
          <>
            <p class="mt-1 text-xs text-muted-foreground">
              {view().ladder_state === 'approved'
                ? `Approved ${formatTimestamp(view().approved_at)}${view().approved_by ? ` by ${view().approved_by}` : ''} — every rung whose own gates pass runs on schedule.`
                : view().ladder_state === 'revoked'
                  ? `Stopped ${formatTimestamp(view().revoked_at)} — rungs still waiting stay stopped. Approving again restarts them.`
                  : 'One approval covers the whole announce-to-recap sequence — each rung still needs its own evidence.'}
            </p>

            <Show when={view().rungs.length > 0}>
              <div class="mt-2 flex flex-col gap-1">
                <For each={view().rungs}>
                  {rung => (
                    <div class="flex items-baseline gap-2 text-xs">
                      <Badge variant={RUNG_BADGE[rung.status] ?? 'muted'}>{rungState(rung)}</Badge>
                      <span class="text-foreground">{leverLabel(rung.lever)}</span>
                      <span class="ml-auto shrink-0 text-muted-foreground tabular-nums">
                        {formatTimestamp(rung.available_at)}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <div class="mt-2 flex gap-2">
              <Show when={view().ladder_state !== 'approved'}>
                <Button
                  size="sm"
                  disabled={readOnly() || approve.isPending || revoke.isPending}
                  onClick={() => approve.mutate()}
                >
                  Approve the ladder
                </Button>
              </Show>
              <Show when={view().ladder_state === 'approved'}>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={readOnly() || approve.isPending || revoke.isPending}
                  onClick={() => revoke.mutate()}
                >
                  Stop the remaining rungs
                </Button>
              </Show>
            </div>
          </>
        )}
      </Show>

      <Show when={mutationError()}>
        {error => <p class="mt-2 text-xs text-destructive-foreground">{failureLine("Couldn't save that", error())}</p>}
      </Show>
    </div>
  )
}
