import { Show } from 'solid-js'
import { useQueryClient } from '@tanstack/solid-query'
import type { ShowEconomicsResponse, TourEconomicsSummary } from '../lib/types'
import { formatTimestamp } from '../lib/format'
import { capabilityAction } from '../lib/capabilities'
import { Badge } from './app/badge'
import { SurfaceAction } from './capabilities/SurfaceAction'

// The show's cost ledger entry: what the night was predicted to cost, what it
// actually cost, and where the estimate went wrong — the money half of the
// learning loop. The `the_numbers` timeline step shows the headline; this is
// the ledger underneath it. Before a fee is recorded the block is one line
// and one action — the offer is what opens the ledger, and it used to be
// recordable only with the admin credential, so on the console the money
// never appeared at all. After the night, settling the real costs is the
// write that teaches the estimate.
//
// Money arrives in minor units (cents); `/ 100` renders it as the major unit.
// Currency symbol: the ledger is fee-denominated and the tenant's market is
// EUR — the upstream policy prices fuel and rooms in it.

const money = (minor: number | null | undefined) =>
  minor == null ? '—' : `€${(minor / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

const marginTone = (minor: number | null | undefined) =>
  minor == null ? 'text-muted-foreground' : minor >= 0 ? 'text-success-foreground' : 'text-destructive'

export function ShowEconomicsPanel(props: {
  slug: string
  eventSlug: string
  eventId: string
  /** The night has started — settling is offered only after it. */
  played: boolean
  economics: ShowEconomicsResponse | null
  tour: TourEconomicsSummary | null
}) {
  const queryClient = useQueryClient()
  const entry = () => props.economics?.shows.find(s => s.event_id === props.eventId)
  const settled = () => entry()?.settled_at != null
  const margin = () => settled() ? entry()!.settled_net_margin_minor : entry()?.predicted_net_margin_minor
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['tenant-show-page', props.slug, props.eventSlug] })

  return (
    // `economics` null is "couldn't check" — the page's degraded strip names
    // it; offering to record a fee over a ledger we could not read would
    // invite a second entry.
    <Show when={entry()} fallback={
      <Show when={props.economics}>
        <div class="rounded-lg border border-border bg-background px-4 py-3">
          <p class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">The money</p>
          <p class="mt-1 text-xs text-muted-foreground">No fee recorded for this night — the cost estimate starts from the offer.</p>
          <div class="mt-2">
            <SurfaceAction
              slug={props.slug}
              size="xs"
              action={capabilityAction('show-costs', 'Freeze prediction')}
              label="Record the offer"
              fixed={{ event_id: props.eventId }}
              onDone={refresh}
            />
          </div>
        </div>
      </Show>
    }>{e => (
      <div class="rounded-lg border border-border bg-background px-4 py-3">
        <div class="flex items-baseline justify-between gap-2">
          <p class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">The money</p>
          <Badge variant={settled() ? 'success' : 'muted'}>{settled() ? `settled ${formatTimestamp(e().settled_at)}` : 'predicted'}</Badge>
        </div>
        <div class="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span class="text-muted-foreground">Fee <strong class="text-foreground">{money(e().offered_fee_minor)}</strong></span>
          <span class="text-muted-foreground">Cost <strong class="text-foreground">{money(settled() ? e().settled_total_cost_minor : e().predicted_total_cost_minor)}</strong></span>
          <span class="text-muted-foreground">Margin <strong class={marginTone(margin())}>{money(margin())}</strong></span>
        </div>
        <Show when={e().prediction_missing_input}>
          {missing => <p class="mt-1 text-xs text-muted-foreground">Estimate is missing {missing().replaceAll('_', ' ')} — the number reads light.</p>}
        </Show>
        <Show when={settled() && e().accuracy != null}>
          <p class="mt-1 text-xs text-muted-foreground">
            Estimate was <strong class="text-foreground">{e().accuracy!.replaceAll('_', ' ')}</strong>
            <Show when={e().total_variance_basis_points != null}>
              {` · off by ${(Math.abs(e().total_variance_basis_points!) / 100).toFixed(1)}%`}
            </Show>
            <Show when={e().worst_line}>
              {` · worst line: ${e().worst_line!.replaceAll('_', ' ')}${e().worst_line_delta_minor != null ? ` (${money(e().worst_line_delta_minor)})` : ''}`}
            </Show>
          </p>
          <Show when={e().worst_line_remedy}>
            <p class="mt-0.5 text-xs text-muted-foreground italic">Fix: {e().worst_line_remedy}</p>
          </Show>
        </Show>
        <Show when={props.played && !settled()}>
          <div class="mt-2">
            <SurfaceAction
              slug={props.slug}
              size="xs"
              action={capabilityAction('show-costs', 'Settle')}
              label="Settle the night"
              fixed={{ event_id: props.eventId }}
              onDone={refresh}
            />
          </div>
        </Show>
        <Show when={props.tour}>
          <details class="mt-2">
            <summary class="cursor-pointer text-xs text-muted-foreground">What the estimate assumes</summary>
            <p class="mt-1 text-xs text-muted-foreground">
              {`Crew of ${props.tour!.policy.crew_size}, ${props.tour!.policy.max_vehicles} vehicle${props.tour!.policy.max_vehicles === 1 ? '' : 's'}, `}
              {`fuel €${(props.tour!.policy.fuel_price_minor_per_litre / 100).toFixed(2)}/L, `}
              {`rooms €${Math.round(props.tour!.policy.accommodation_minor_per_room_night / 100)}/night, `}
              {`per diem €${Math.round(props.tour!.policy.per_diem_minor_per_person_day / 100)}/person-day, `}
              {`overnight past ${props.tour!.policy.overnight_threshold_km} km, `}
              {`€${Math.round(props.tour!.policy.fixed_overhead_minor / 100)} fixed per show.`}
            </p>
          </details>
        </Show>
      </div>
    )}</Show>
  )
}
