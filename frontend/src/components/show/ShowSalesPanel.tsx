import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { ApiError } from '../../lib/api'
import { capability } from '../../lib/capabilities'
import { fillPath, surface } from '../../lib/surface'
import { authState } from '../../lib/auth'
import { Badge } from '../app/badge'

// Tickets and merch for one night — the "sales pace" rung of the ladder, read
// from the sale itself rather than inferred. Price and capacity are set by the
// box office (`configure_sale` stays on the admin credential), so this block
// reads and never edits. A night with no sale configured answers 404 upstream,
// which here is a sentence, not an error: most nights are sold by the venue.

type TicketSale = {
  sale: {
    currency: string
    capacity: number
    sold: number
    reserved: number
    available: number
    sales_state: string
    ticket_types: { name: string; price_gross_minor: number; sold?: number }[]
  }
  paid_tickets: number
  gross_sales_minor: number
  refunded_minor: number
}

type MerchAtTheNight = {
  order_count: number
  pickup_order_count: number
  pickup_unit_count: number
  gross_minor: number
  currency: string
}

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100)

const notFound = (error: unknown) => error instanceof ApiError && error.status === 404

export function ShowSalesPanel(props: { slug: string; eventSlug: string; eventId: string }) {
  const tickets = useQuery(() => ({
    queryKey: ['surface', props.slug, 'show-tickets', props.eventSlug],
    queryFn: () => surface.read<TicketSale>(props.slug, fillPath(capability('ticketing').read!.path, { event_slug: props.eventSlug })!),
    staleTime: 30_000,
    retry: (count: number, error: unknown) => !notFound(error) && count < 1,
  }))
  const merch = useQuery(() => ({
    queryKey: ['surface', props.slug, 'show-merch', props.eventId],
    queryFn: () => surface.read<MerchAtTheNight>(props.slug, fillPath(capability('show-merch').read!.path, { event_id: props.eventId })!),
    staleTime: 30_000,
    retry: 1,
  }))

  return (
    <div class="rounded-lg border border-border bg-background px-4 py-3">
      <p class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tickets and merch</p>
      <div class="mt-1.5 space-y-1 text-sm">
        <Show when={tickets.data} fallback={
          <p class="text-xs text-muted-foreground">
            <Show when={notFound(tickets.error)} fallback={
              <Show when={tickets.error} fallback="Checking the ticket sale…">Couldn't check the ticket sale.</Show>
            }>
              No ticket sale runs through us for this night{authState.isPlatformLevel() ? ' — the box office configures one with the admin credential.' : '.'}
            </Show>
          </p>
        }>
          {t => (
            <div class="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <Badge variant="muted">{t().sale.sales_state.replaceAll('_', ' ')}</Badge>
              <span class="text-muted-foreground">Sold <strong class="text-foreground tabular-nums">{t().sale.sold}</strong> of {t().sale.capacity}</span>
              <Show when={t().sale.reserved > 0}>
                <span class="text-muted-foreground">Held in checkout <strong class="text-foreground tabular-nums">{t().sale.reserved}</strong></span>
              </Show>
              <span class="text-muted-foreground">Taken <strong class="text-foreground">{money(t().gross_sales_minor, t().sale.currency)}</strong></span>
              <Show when={t().refunded_minor > 0}>
                <span class="text-muted-foreground">Refunded {money(t().refunded_minor, t().sale.currency)}</span>
              </Show>
            </div>
          )}
        </Show>
        <Show when={merch.data} fallback={
          <p class="text-xs text-muted-foreground"><Show when={merch.error} fallback="Checking merch…">Couldn't check merch for this night.</Show></p>
        }>
          {m => (
            <Show when={m().order_count > 0} fallback={<p class="text-xs text-muted-foreground">No merch orders tied to this night yet.</p>}>
              <div class="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                <span class="text-muted-foreground">Merch orders <strong class="text-foreground tabular-nums">{m().order_count}</strong></span>
                <Show when={m().pickup_order_count > 0}>
                  <span class="text-muted-foreground">To hand out at the table <strong class="text-foreground tabular-nums">{m().pickup_unit_count}</strong> items</span>
                </Show>
                <span class="text-muted-foreground">Merch taken <strong class="text-foreground">{money(m().gross_minor, m().currency)}</strong></span>
              </div>
            </Show>
          )}
        </Show>
      </div>
    </div>
  )
}
