import { For, Show } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { capability, capabilityAction } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { formatTimestamp } from '../lib/format'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Badge } from './app/badge'
import { Alert } from './app/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './app/table'
import { SurfaceAction } from './capabilities/SurfaceAction'

// The merch table — what the band sells at a show and on the site, how much
// of it is really on hand, and whether selling from stock is switched on. A
// count nobody has taken is "not counted", never zero: selling against a
// guess is how a fan pays for a shirt that is not in the box.

type Product = {
  slug: string
  name: string
  description: string | null
  image_url: string | null
  currency: string
  price_gross_minor: number
  active: boolean
  public: boolean
  variants: { sku: string; label: string; attributes: unknown; active: boolean; low_stock_threshold: number; sell_without_stock: boolean }[]
}

type StockItem = {
  product_name: string
  sku: string
  variant_label: string
  counted: boolean
  last_counted_at: string | null
  on_hand: number
  reserved: number
  available_quantity: number
  sold_30d: number
  low_stock_threshold: number
}

type Activation = { ready: boolean; blockers: string[]; can_mark_ready: boolean; missing_skus: string[] }

type Recommendation = { sku: string; product_name: string; variant_label: string; recommendation: string; reason: string; confidence: string }

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100)

/** The catalogue as the upsert expects it — so editing starts from what is
 *  there instead of from an empty document. */
const asUpsert = (products: Product[]) =>
  JSON.stringify(products.map(p => ({
    slug: p.slug, name: p.name, description: p.description, image_url: p.image_url, currency: p.currency,
    price_gross_minor: p.price_gross_minor, active: p.active, public: p.public,
    variants: p.variants.map(v => ({ sku: v.sku, label: v.label, attributes: v.attributes, active: v.active, low_stock_threshold: v.low_stock_threshold, sell_without_stock: v.sell_without_stock })),
  })), null, 2)

export function MerchTablePanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const read = <T,>(key: string, path: string) => useQuery(() => ({
    queryKey: ['surface', props.slug, 'merch', key],
    queryFn: () => surface.read<T>(props.slug, path),
    staleTime: 30_000,
    retry: 1,
  }))
  const catalog = read<{ products: Product[] }>('catalog', capability('merch').read!.path)
  const stock = read<{ items: StockItem[] }>('stock', capability('inventory').read!.path)
  const activation = read<Activation>('activation', capability('inventory-activation').read!.path)
  const recommendations = read<Recommendation[]>('recommendations', capability('merch-recommendations').read!.path)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['surface', props.slug, 'merch'] })

  return (
    <>
      <Section title="Stock" icon={<SectionIcon name="database" />} description="What is really in the box, what orders and draws have claimed, and what is left to sell.">
        <Show when={activation.data && !activation.data.ready}>
          <Alert tone="warning" title="Selling from stock is not on yet">
            {(activation.data!.blockers.length > 0 ? activation.data!.blockers : ['nothing counted yet']).map(b => b.replaceAll('_', ' ')).join(' · ')}
            <Show when={activation.data!.can_mark_ready}>
              <div class="mt-2">
                <SurfaceAction slug={props.slug} size="sm" action={capabilityAction('inventory', 'Mark ready')} label="Stock is counted — start selling from it" onDone={refresh} />
              </div>
            </Show>
          </Alert>
        </Show>
        <Show when={!stock.error} fallback={<p class="text-sm text-muted-foreground">Couldn't check the stock.</p>}>
          <Show when={stock.data} fallback={<p class="text-sm text-muted-foreground">Checking…</p>}>
            <Show when={stock.data!.items.length > 0} fallback={<p class="text-sm text-muted-foreground">No merch in the catalogue yet.</p>}>
              <Table class="mt-2">
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead class="text-right">In the box</TableHead>
                    <TableHead class="text-right">Claimed</TableHead>
                    <TableHead class="text-right">Left to sell</TableHead>
                    <TableHead class="text-right">Sold, 30 days</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <For each={stock.data!.items}>{item => (
                    <TableRow>
                      <TableCell>
                        {item.product_name} <span class="text-muted-foreground">{item.variant_label}</span>
                        <Show when={item.counted && item.available_quantity <= item.low_stock_threshold}> <Badge variant="warning">low</Badge></Show>
                      </TableCell>
                      <TableCell numeric>{item.counted ? item.on_hand : <span class="text-muted-foreground" title="Nobody has counted this yet">not counted</span>}</TableCell>
                      <TableCell numeric>{item.reserved}</TableCell>
                      <TableCell numeric>{item.counted ? item.available_quantity : '—'}</TableCell>
                      <TableCell numeric>{item.sold_30d}</TableCell>
                      <TableCell>
                        <SurfaceAction
                          slug={props.slug}
                          size="xs"
                          variant="ghost"
                          action={capabilityAction('inventory', 'Adjust')}
                          label="Adjust"
                          initial={{ sku: item.sku }}
                          hidden={['sku']}
                          onDone={refresh}
                        />
                      </TableCell>
                    </TableRow>
                  )}</For>
                </TableBody>
              </Table>
              <div class="mt-2">
                <SurfaceAction
                  slug={props.slug}
                  size="sm"
                  action={capabilityAction('inventory', 'Stocktake')}
                  label="Count everything"
                  initial={{ items: JSON.stringify(stock.data!.items.map(i => ({ sku: i.sku, on_hand: i.counted ? i.on_hand : 0 })), null, 2) }}
                  onDone={refresh}
                >
                  <p class="mb-2 text-xs text-muted-foreground">Edit each on_hand to what is in the box now. Last counts: {stock.data!.items.filter(i => i.last_counted_at).length ? formatTimestamp(stock.data!.items.map(i => i.last_counted_at).filter(Boolean).sort().at(-1)!) : 'never'}.</p>
                </SurfaceAction>
              </div>
            </Show>
          </Show>
        </Show>
      </Section>

      <Show when={(recommendations.data ?? []).length > 0}>
        <Section title="Worth pushing" icon={<SectionIcon name="trending-up" />} description="What the stock and the sales history say to promote or give away — and how sure that is.">
          <ul class="space-y-1.5 text-sm">
            <For each={recommendations.data!}>{rec => (
              <li class="text-muted-foreground">
                <span class="text-foreground">{rec.product_name} {rec.variant_label}</span> — {rec.recommendation.replaceAll('_', ' ')}: {rec.reason} <Badge variant="muted">{rec.confidence}</Badge>
              </li>
            )}</For>
          </ul>
        </Section>
      </Show>

      <Section
        title="Catalogue"
        icon={<SectionIcon name="list-checks" />}
        description="Products, sizes and prices. Public products appear on the site; the rest sell only at the table."
        action={
          <Show when={catalog.data}>
            <SurfaceAction
              slug={props.slug}
              action={capabilityAction('merch', 'Upsert products')}
              label="Edit the catalogue"
              initial={{ products: asUpsert(catalog.data!.products) }}
              onDone={refresh}
            />
          </Show>
        }
      >
        <Show when={!catalog.error} fallback={<p class="text-sm text-muted-foreground">Couldn't check the catalogue.</p>}>
          <Show when={catalog.data} fallback={<p class="text-sm text-muted-foreground">Checking…</p>}>
            <Show when={catalog.data!.products.length > 0} fallback={<p class="text-sm text-muted-foreground">Nothing in the catalogue.</p>}>
              <ul class="divide-y divide-border rounded-lg border border-border">
                <For each={catalog.data!.products}>{p => (
                  <li class="flex flex-wrap items-center gap-2 p-3 text-sm">
                    <span class="font-medium text-foreground">{p.name}</span>
                    <span class="text-muted-foreground">{money(p.price_gross_minor, p.currency)}</span>
                    <span class="text-xs text-muted-foreground">{p.variants.map(v => v.label).join(' · ')}</span>
                    <Show when={!p.public}><Badge variant="muted">table only</Badge></Show>
                    <Show when={!p.active}><Badge variant="muted">off</Badge></Show>
                  </li>
                )}</For>
              </ul>
            </Show>
          </Show>
        </Show>
      </Section>
    </>
  )
}
