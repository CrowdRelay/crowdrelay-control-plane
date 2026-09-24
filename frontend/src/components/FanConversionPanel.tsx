import { For, Show, type JSX } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { capability } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './app/table'

// "Where did our fans come from" answers the first half; this answers what
// those fans turned into — the convert third of the North Star. Four reads,
// each shown as a sentence or a small table, each degrading on its own: a
// source that could not be read says so rather than rendering as zero.

type FunnelRow = { source: string; acquired_fans: number; active_fans: number; ticket_buyers: number; attendees: number }
type RevenueRow = { currency: string; paid_orders: number; after_refunds_minor: number; refunded_minor: number }
type Referrals = { referrals_sent: number; qualified: number; activated: number; reversed: number }
type Ads = { attributed_fans: number; meta_attributed: number; google_attributed: number; bandsintown_attributed: number; utm_attributed: number }
type AdRow = { platform: string | null; utm_source: string; utm_campaign: string; attributed_fans: number; delivered: number; delivered_ok: number }

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100)

function read<T>(slug: () => string, path: string) {
  return useQuery(() => ({
    queryKey: ['surface', slug(), 'conversion', path],
    queryFn: () => surface.read<T>(slug(), path),
    staleTime: 60_000,
    retry: 1,
  }))
}

function Block(props: { title: string; failed: boolean; loading: boolean; children: JSX.Element }) {
  return (
    <div>
      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{props.title}</p>
      <div class="mt-1">
        <Show when={!props.failed} fallback={<p class="text-sm text-muted-foreground">Couldn't check this.</p>}>
          <Show when={!props.loading} fallback={<p class="text-sm text-muted-foreground">Checking…</p>}>{props.children}</Show>
        </Show>
      </div>
    </div>
  )
}

export function FanConversionPanel(props: { slug: string }) {
  const slug = () => props.slug
  const funnel = read<FunnelRow[]>(slug, capability('funnel').read!.path)
  const revenue = read<RevenueRow[]>(slug, capability('revenue').read!.path)
  const referrals = read<Referrals>(slug, capability('referral-conversion').read!.path)
  const ads = read<Ads>(slug, capability('ad-conversion').read!.path)
  const adRows = read<AdRow[]>(slug, capability('ad-conversion-breakdown').read!.path)

  return (
    <Section
      title="What it turned into"
      icon={<SectionIcon name="trending-up" />}
      description="For each place fans first came from: how many stayed, bought a ticket and walked in — then what that paid, and what referrals and ads converted."
    >
      <div class="space-y-5">
        <Block title="From first touch to the room" failed={!!funnel.error} loading={!funnel.data}>
          <Show when={(funnel.data ?? []).length > 0} fallback={<p class="text-sm text-muted-foreground">No fan has come through a tracked source yet.</p>}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>First came from</TableHead>
                  <TableHead class="text-right">Fans</TableHead>
                  <TableHead class="text-right">Still reachable</TableHead>
                  <TableHead class="text-right">Bought a ticket</TableHead>
                  <TableHead class="text-right">Came to a show</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={funnel.data!}>{row => (
                  <TableRow>
                    <TableCell>{row.source}</TableCell>
                    <TableCell numeric>{row.acquired_fans}</TableCell>
                    <TableCell numeric>{row.active_fans}</TableCell>
                    <TableCell numeric>{row.ticket_buyers}</TableCell>
                    <TableCell numeric>{row.attendees}</TableCell>
                  </TableRow>
                )}</For>
              </TableBody>
            </Table>
          </Show>
        </Block>

        <Block title="What it paid" failed={!!revenue.error} loading={!revenue.data}>
          <Show when={(revenue.data ?? []).length > 0} fallback={<p class="text-sm text-muted-foreground">No paid order yet.</p>}>
            <For each={revenue.data!}>{row => (
              <p class="text-sm text-muted-foreground">
                <strong class="text-foreground">{money(row.after_refunds_minor, row.currency)}</strong> after refunds from {row.paid_orders} paid orders
                <Show when={row.refunded_minor > 0}>{` · ${money(row.refunded_minor, row.currency)} refunded`}</Show>
              </p>
            )}</For>
          </Show>
        </Block>

        <Block title="Fans bringing fans" failed={!!referrals.error} loading={!referrals.data}>
          {(() => {
            const r = () => referrals.data!
            return (
              <Show when={r().referrals_sent > 0} fallback={<p class="text-sm text-muted-foreground">No fan has shared a referral link yet.</p>}>
                <p class="text-sm text-muted-foreground">
                  <strong class="text-foreground">{r().referrals_sent}</strong> referrals shared · {r().qualified} qualified · {r().activated} became active fans
                  <Show when={r().reversed > 0}>{` · ${r().reversed} reversed`}</Show>
                </p>
              </Show>
            )
          })()}
        </Block>

        <Block title="Ads" failed={!!ads.error} loading={!ads.data}>
          <Show when={ads.data!.attributed_fans > 0} fallback={<p class="text-sm text-muted-foreground">No fan has come from an ad.</p>}>
            <p class="text-sm text-muted-foreground">
              <strong class="text-foreground">{ads.data!.attributed_fans}</strong> fans came from ads — Meta {ads.data!.meta_attributed}, Google {ads.data!.google_attributed}, Bandsintown {ads.data!.bandsintown_attributed}, tagged links {ads.data!.utm_attributed}
            </p>
            <Show when={(adRows.data ?? []).length > 0}>
              <Table class="mt-2">
                <TableHeader>
                  <TableRow>
                    <TableHead>Platform</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead class="text-right">Fans</TableHead>
                    <TableHead class="text-right">Conversions reported back</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <For each={adRows.data!}>{row => (
                    <TableRow>
                      <TableCell>{row.platform ?? row.utm_source}</TableCell>
                      <TableCell>{row.utm_campaign}</TableCell>
                      <TableCell numeric>{row.attributed_fans}</TableCell>
                      <TableCell numeric>{row.delivered_ok} of {row.delivered}</TableCell>
                    </TableRow>
                  )}</For>
                </TableBody>
              </Table>
            </Show>
          </Show>
        </Block>
      </div>
    </Section>
  )
}
