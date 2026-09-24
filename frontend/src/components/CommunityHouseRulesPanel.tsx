import { Show } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { capability, capabilityAction } from '../lib/capabilities'
import { fillPath, surface } from '../lib/surface'
import { formatTimestamp } from '../lib/format'
import { Badge } from './app/badge'
import { SurfaceAction } from './capabilities/SurfaceAction'

// A community's house rules and where the band stands with it — the part of
// "where fans already gather" that decides whether posting there is welcome
// or spam. Rules (self-promo ratio, cooldown, who to ask) are what the relay
// ladder obeys; evidence is how we know the place is real and active; the
// outreach stage is the relationship, moved by a person when it moves.

type PlaceDetail = {
  rules: {
    selfPromoRatioPercent: number | null
    contactChannel: string | null
    contactTarget: string | null
    requiresApproval: boolean
    cooldownDays: number | null
    rulesSummary: string | null
    verifiedAt: string | null
  } | null
  outreach: { stage: string; nextEligibleAt: string | null; lastActionAt: string | null } | null
}

const words = (value: string) => value.replaceAll('_', ' ')

export function CommunityHouseRulesPanel(props: { slug: string; placeId: string }) {
  const queryClient = useQueryClient()
  const place = useQuery(() => ({
    queryKey: ['surface', props.slug, 'place-detail', props.placeId],
    queryFn: () => surface.read<PlaceDetail>(props.slug, fillPath(capability('place-detail').read!.path, { place_id: props.placeId })!),
    staleTime: 30_000,
    retry: 1,
  }))
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['surface', props.slug, 'place-detail', props.placeId] })
  const rules = () => place.data?.rules ?? null

  return (
    <div class="mb-4 rounded-lg border border-border bg-background px-4 py-3">
      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">House rules and where we stand</p>
      <Show when={!place.error} fallback={<p class="mt-1 text-xs text-muted-foreground">Couldn't check this community's rules.</p>}>
        <Show when={place.data} fallback={<p class="mt-1 text-xs text-muted-foreground">Checking…</p>}>
          <div class="mt-1.5 space-y-1 text-sm text-muted-foreground">
            <Show when={rules()} fallback={<p class="text-xs">Nobody has written its rules down yet — nothing is posted here until someone does.</p>}>
              {r => (
                <>
                  <Show when={r().rulesSummary}><p class="text-foreground">{r().rulesSummary}</p></Show>
                  <p class="text-xs">
                    {r().selfPromoRatioPercent != null ? `Self-promotion up to ${r().selfPromoRatioPercent}% of posts` : 'Self-promotion ratio not stated'}
                    {r().cooldownDays != null ? ` · ${r().cooldownDays} days between posts` : ''}
                    {r().requiresApproval ? ' · a moderator approves posts' : ''}
                    {r().contactTarget ? ` · ask ${r().contactTarget}${r().contactChannel ? ` on ${r().contactChannel}` : ''}` : ''}
                  </p>
                  <Badge variant={r().verifiedAt ? 'success' : 'muted'}>{r().verifiedAt ? `checked ${formatTimestamp(r().verifiedAt)}` : 'not checked'}</Badge>
                </>
              )}
            </Show>
            <p class="text-xs">
              <Show when={place.data!.outreach} fallback="No outreach recorded.">
                {o => <>We are <strong class="text-foreground">{words(o().stage)}</strong>{o().nextEligibleAt ? ` · next ask from ${formatTimestamp(o().nextEligibleAt)}` : ''}</>}
              </Show>
            </p>
          </div>
          <div class="mt-2 flex flex-wrap gap-2">
            <SurfaceAction
              slug={props.slug}
              size="xs"
              action={capabilityAction('place-detail', 'Set rules')}
              label={rules() ? 'Edit the rules' : 'Write the rules down'}
              fixed={{ place_id: props.placeId }}
              initial={rules() ? {
                selfPromoRatioPercent: rules()!.selfPromoRatioPercent?.toString() ?? '',
                contactChannel: rules()!.contactChannel ?? '',
                contactTarget: rules()!.contactTarget ?? '',
                requiresApproval: rules()!.requiresApproval,
                cooldownDays: rules()!.cooldownDays?.toString() ?? '',
                rulesSummary: rules()!.rulesSummary ?? '',
              } : undefined}
              onDone={refresh}
            />
            <SurfaceAction
              slug={props.slug}
              size="xs"
              action={capabilityAction('place-detail', 'Advance outreach')}
              label="Where we stand changed"
              fixed={{ place_id: props.placeId }}
              initial={place.data!.outreach ? { fromStage: place.data!.outreach.stage } : undefined}
              onDone={refresh}
            />
            <SurfaceAction
              slug={props.slug}
              size="xs"
              variant="ghost"
              action={capabilityAction('place-detail', 'Add evidence')}
              label="Note how we know it is real"
              fixed={{ place_id: props.placeId }}
              initial={{ evidenceKind: 'manual_note', method: 'operator' }}
              onDone={refresh}
            />
          </div>
        </Show>
      </Show>
    </div>
  )
}
