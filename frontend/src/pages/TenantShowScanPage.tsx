import { createMemo, Show } from 'solid-js'
import { useParams } from '@tanstack/solid-router'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { generateQr } from '../lib/qrCode'
import { PageShell } from '../components/layout'
import { DashHeader, Tile, Tiles } from '../components/ui/dash'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { SkeletonSection } from '../components/Skeleton'
import { formatTimestamp } from '../lib/format'

/** `/tenants/$slug/shows/$eventSlug/scan` — the door. One job: put the
 * night's check-in QR on a phone screen, big enough to scan at arm's length
 * in a dark room, with the live tally underneath. The URL carries the
 * campaign's signed token — it only travels to this page, never to the
 * list or timeline views the console polls broadly. (UX-2.3) */
export function TenantShowScanPage() {
  const params = useParams({ from: '/tenants/$slug/shows/$eventSlug/scan' })
  const model = useQuery(() => ({
    queryKey: ['tenant-show-scan', params().slug, params().eventSlug],
    queryFn: () => api.showScan(params().slug, params().eventSlug),
    staleTime: 10_000,
    // The tally is the page's second job — refresh gently while the door
    // is open so the count on screen is the count at the door.
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
  }))
  const qr = createMemo(() => {
    const url = model.data?.checkin_url
    if (!url) return null
    try {
      return generateQr(url)
    } catch {
      return null
    }
  })
  // Before the campaign's open edge the same QR is a dead scan — say when
  // the door opens rather than hand out a code that rejects. Once the live
  // campaign hits its cap, every further scan rejects too: say "full".
  const notYetOpen = () =>
    model.data?.valid_from != null && new Date(model.data.valid_from).getTime() > Date.now()
  const full = () => {
    const count = model.data?.campaign_checkin_count
    const max = model.data?.max_checkins
    return count != null && max != null && count >= max
  }

  const backLabel = () => {
    const event = model.data?.event
    if (!event) return 'The night'
    return [event.city, shortDate(event.starts_at)].filter(Boolean).join(' · ')
  }
  return (
    <PageShell>
<div class="mx-auto w-full max-w-sm">
      <Show when={model.data} fallback={
        <>
          <Show when={model.error}>
            <DashHeader title="Door" back={{ label: backLabel(), to: '/tenants/$slug/shows/$eventSlug', params: { slug: params().slug, eventSlug: params().eventSlug } }} />
            <SectionFailureCard
              error={model.error}
              title="Couldn't load the door view"
              onRetry={() => void model.refetch()}
            />
          </Show>
          <Show when={!model.error}>
            <SkeletonSection titleWidth="160px" lines={1} minHeight="60px" />
            <SkeletonSection titleWidth="0" lines={0} minHeight="320px" />
          </Show>
        </>
      }>
        {data => (
          <>
            <DashHeader
              title={data().campaign_label ?? 'Door'}
              subtitle={data().valid_until ? `Good until ${formatTimestamp(data().valid_until!)}` : undefined}
              back={{ label: backLabel(), to: '/tenants/$slug/shows/$eventSlug', params: { slug: params().slug, eventSlug: params().eventSlug } }}
            />
            <Show
              when={data().checkin_url && qr() && !full()}
              fallback={
                <div class="rounded-lg border border-border bg-background px-4 py-10 text-center">
                  <p class="text-sm text-foreground">
                    {full() ? 'The list is full' : 'Nothing to scan yet'}
                  </p>
                  <p class="mt-1 text-xs text-muted-foreground">
                    {full()
                      ? `${data().campaign_checkin_count} checked in — the campaign's cap is ${data().max_checkins}`
                      : data().checkin_url
                        ? 'The link could not be rendered as a QR'
                        : 'No live check-in campaign for this night yet — when one exists it shows up here'}
                  </p>
                </div>
              }
            >
              {/* White card, maximum contrast — the room is dark and the
                  phone is the sign. */}
              <div class="mx-auto w-full max-w-sm rounded-xl bg-white p-4">
                <div
                  class="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                  innerHTML={qr()!.svg}
                />
              </div>
              <Show when={notYetOpen()}>
                <p class="mt-3 text-center text-xs font-medium text-warning-foreground">
                  The door opens at {formatTimestamp(data().valid_from!)} — scans before then get turned away
                </p>
              </Show>
              <p class="mt-3 break-all text-center text-xs text-muted-foreground">
                {data().checkin_url}
              </p>
              <div class="mt-4 text-center">
                <span class="text-3xl font-semibold tabular-nums text-foreground">{data().checkin_count}</span>
                <span class="ml-2 text-sm text-muted-foreground">
                  checked in{data().max_checkins != null ? ` · cap ${data().max_checkins}` : ' · no cap'}
                </span>
              </div>
              <p class="mt-1 text-center text-xs text-muted-foreground">The count refreshes while the door is open</p>
            </Show>
            {/* The two questions the door gets asked. Tickets are null on a
                night with no ticket sale — unticketed, not sold out of zero. */}
            <Show when={data().event}>
              {event => (
                <div class="mt-4">
                  <Tiles cols={2}>
                    <Tile
                      label="Tickets"
                      value={event().tickets_sold}
                      sub={event().tickets_sold == null ? 'no ticket sale' : event().capacity != null ? `of ${event().capacity}` : undefined}
                    />
                    <Tile label="Interested" value={event().interested} />
                  </Tiles>
                </div>
              )}
            </Show>
          </>
        )}
      </Show>
    </div>
    </PageShell>
  )
}


const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso))
