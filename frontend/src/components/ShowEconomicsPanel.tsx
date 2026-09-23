import { Show } from 'solid-js'
import type { ShowEconomicsResponse, TourEconomicsSummary } from '../lib/types'
import { formatTimestamp } from '../lib/format'
import { Badge } from './app/badge'

// The show's cost ledger entry: what the night was predicted to cost, what it
// actually cost, and where the estimate went wrong — the money half of the
// learning loop. The `the_numbers` timeline step shows the headline; this is
// the ledger underneath it. Nothing renders when no entry exists yet —
// prediction only lands once a fee is offered.
//
// Money arrives in minor units (cents); `/ 100` renders it as the major unit.
// Currency symbol: the ledger is fee-denominated and the tenant's market is
// EUR — the upstream policy prices fuel and rooms in it.

const money = (minor: number | null | undefined) =>
  minor == null ? '—' : `€${(minor / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

const marginTone = (minor: number | null | undefined) =>
  minor == null ? 'text-muted-foreground' : minor >= 0 ? 'text-success-foreground' : 'text-destructive'

export function ShowEconomicsPanel(props: { eventId: string; economics: ShowEconomicsResponse | null; tour: TourEconomicsSummary | null }) {
  const entry = () => props.economics?.shows.find(s => s.event_id === props.eventId)
  const settled = () => entry()?.settled_at != null
  const margin = () => settled() ? entry()!.settled_net_margin_minor : entry()?.predicted_net_margin_minor

  return (
    <Show when={entry()}>{e => (
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
