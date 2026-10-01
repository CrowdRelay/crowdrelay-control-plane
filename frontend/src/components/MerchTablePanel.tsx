import { For, Show, createSignal } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { Gift, MoreHorizontal, Package, PackagePlus, Pencil, ScanLine, Sparkles, TrendingDown, TrendingUp } from 'lucide-solid'
import { capability, capabilityAction } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { authState } from '../lib/auth'
import { READ_ONLY_REASON } from '../lib/read-only'
import { formatTimestamp } from '../lib/format'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Badge } from './app/badge'
import { Alert } from './app/alert'
import { Button } from './app/button'
import { DataTable, type ColumnDef } from './app/data-table'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { SectionFailureCard } from './SectionFailureCard'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { SurfaceAction } from './capabilities/SurfaceAction'
import { ActionSheet, type OpenWrite } from './capabilities/ActionSheet'
import { cn } from '../lib/cn'

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

const humanize = (value: string) => value.replaceAll('_', ' ')

/** A recommendation's verb picks its icon, so the list scans like a feed. */
const recIcon = (recommendation: string) => {
  const r = recommendation.toLowerCase()
  if (r.includes('give') || r.includes('draw') || r.includes('bundle')) return Gift
  if (r.includes('restock') || r.includes('reorder')) return PackagePlus
  if (r.includes('discount') || r.includes('clear') || r.includes('slow')) return TrendingDown
  if (r.includes('promote') || r.includes('push') || r.includes('feature')) return TrendingUp
  return Sparkles
}

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
  // Adjust, Count everything and Edit the catalogue open beside the tables
  // instead of expanding inside them.
  const [write, setWrite] = createSignal<OpenWrite | null>(null)
  const readOnly = () => authState.readOnly()

  const items = () => stock.data?.items ?? []
  const products = () => catalog.data?.products ?? []
  const lastCounted = () => {
    const at = items().map(i => i.last_counted_at).filter((v): v is string => !!v).sort().at(-1)
    return at ? formatTimestamp(at) : 'never'
  }
  const stocktake = (): OpenWrite => ({
    title: 'Count everything',
    description: `Last count: ${lastCounted()}.`,
    intro: 'Set each on_hand to what is in the box right now. Items nobody has counted start at 0.',
    action: capabilityAction('inventory', 'Stocktake'),
    initial: { items: JSON.stringify(items().map(i => ({ sku: i.sku, on_hand: i.counted ? i.on_hand : 0 })), null, 2) },
    size: 'lg',
  })
  const adjust = (item: StockItem): OpenWrite => ({
    title: 'Adjust stock',
    description: `${item.product_name} ${item.variant_label}`,
    action: capabilityAction('inventory', 'Adjust'),
    initial: { sku: item.sku },
    hidden: ['sku'],
  })
  const editCatalogue = (): OpenWrite => ({
    title: 'Edit the catalogue',
    description: 'Products, sizes and prices. Public products appear on your site; the rest sell only at the table.',
    intro: 'Prices are in the smallest unit of the currency — 8000 is 80.00. Saving replaces the whole catalogue with what is here.',
    action: capabilityAction('merch', 'Upsert products'),
    initial: { products: asUpsert(products()) },
    size: 'lg',
  })

  const stockColumns: ColumnDef<StockItem, any>[] = [
    {
      id: 'item', header: 'Item', accessorFn: i => `${i.product_name} ${i.variant_label}`,
      cell: c => {
        const i = c.row.original
        return <span class="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span class="font-medium text-foreground">{i.product_name}</span>
          <span class="text-muted-foreground">{i.variant_label}</span>
          <Show when={i.counted && i.available_quantity <= i.low_stock_threshold}><Badge variant="warning">Low</Badge></Show>
        </span>
      },
    },
    {
      id: 'on_hand', header: 'In the box', accessorFn: i => i.counted ? i.on_hand : -1, meta: { numeric: true },
      cell: c => c.row.original.counted
        ? c.row.original.on_hand
        : <span class="text-muted-foreground" title="Nobody has counted this yet">Not counted</span>,
    },
    { id: 'reserved', header: 'Claimed', accessorFn: i => i.reserved, meta: { numeric: true } },
    {
      id: 'available', header: 'Left to sell', accessorFn: i => i.counted ? i.available_quantity : -1, meta: { numeric: true },
      cell: c => c.row.original.counted ? c.row.original.available_quantity : '—',
    },
    { id: 'sold_30d', header: 'Sold, 30 days', accessorFn: i => i.sold_30d, meta: { numeric: true } },
    {
      id: 'actions', header: () => <span class="sr-only">Actions</span>, enableSorting: false, enableHiding: false,
      meta: { class: 'w-12 text-right' },
      cell: c => (
        <DropdownMenu placement="bottom-end">
          <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="size-8">
            <span class="sr-only">Open menu for {c.row.original.product_name} {c.row.original.variant_label}</span>
            <MoreHorizontal aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent class="min-w-40">
            <DropdownMenuItem disabled={readOnly()} title={readOnly() ? READ_ONLY_REASON : undefined} onSelect={() => setWrite(adjust(c.row.original))}>
              Adjust stock
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const catalogueColumns: ColumnDef<Product, any>[] = [
    {
      id: 'product', header: 'Product', accessorFn: p => p.name,
      cell: c => <>
        <span class="font-medium text-foreground">{c.row.original.name}</span>
        <Show when={c.row.original.description}><span class="block max-w-md text-muted-foreground text-pretty">{c.row.original.description}</span></Show>
      </>,
    },
    {
      id: 'price', header: 'Price', accessorFn: p => p.price_gross_minor, meta: { numeric: true, class: 'whitespace-nowrap' },
      cell: c => money(c.row.original.price_gross_minor, c.row.original.currency),
    },
    {
      id: 'sizes', header: 'Sizes', accessorFn: p => p.variants.length, meta: { label: 'Sizes' },
      cell: c => <Show when={c.row.original.variants.length > 0} fallback="—">
        <span class="flex flex-wrap gap-1">
          <For each={c.row.original.variants}>{v => <Badge variant="outline" class={cn(!v.active && 'opacity-50')}>{v.label}</Badge>}</For>
        </span>
      </Show>,
    },
    {
      id: 'where', header: 'Sold at', accessorFn: p => p.public ? 'Site and table' : 'Table only', meta: { class: 'whitespace-nowrap' },
    },
    {
      id: 'status', header: 'Status', accessorFn: p => p.active ? 'On sale' : 'Off', meta: { class: 'whitespace-nowrap' },
      cell: c => <Badge variant={c.row.original.active ? 'success' : 'muted'}>{c.row.original.active ? 'On sale' : 'Off'}</Badge>,
    },
  ]

  const stockBlock = (
    <Section
      flush
      title="Stock"
      icon={<SectionIcon name="database" />}
      count={items().length}
      description="What is really in the box, what orders and draws have claimed, and what is left to sell."
    >
      <Show when={activation.data && !activation.data.ready}>
        <Alert tone="warning" title="Selling from stock is not on yet" class="mb-4 border-0 bg-warning text-warning-foreground">
          {(activation.data!.blockers.length > 0 ? activation.data!.blockers : ['nothing counted yet']).map(humanize).join(' · ')}
          <Show when={activation.data!.can_mark_ready}>
            <div class="mt-2 text-foreground">
              <SurfaceAction slug={props.slug} size="sm" action={capabilityAction('inventory', 'Mark ready')} label="Stock is counted — start selling from it" onDone={refresh} />
            </div>
          </Show>
        </Alert>
      </Show>
      <Show when={!stock.error} fallback={<SectionFailureCard error={stock.error} title="Couldn't load the stock" onRetry={() => void stock.refetch()} />}>
        <Show when={stock.data} fallback={<SkeletonRows count={3} />}>
          <DataTable
            data={items()}
            columns={stockColumns}
            getRowId={i => i.sku}
            bordered={false}
            searchText={i => `${i.product_name} ${i.variant_label} ${i.sku}`}
            searchPlaceholder="Search by item or size"
            actions={
              <Button writes variant="outline" size="sm" onClick={() => setWrite(stocktake())}>
                <ScanLine aria-hidden="true" /> Count everything
              </Button>
            }
            empty={<EmptyState icon={<Package />} label="No merch in the catalogue yet" hint="Add products to the catalogue below, then count what is in the box." />}
          />
        </Show>
      </Show>
    </Section>
  )

  const catalogueBlock = (
    <Section
      flush
      title="Catalogue"
      icon={<SectionIcon name="list-checks" />}
      count={products().length}
      description="Products, sizes and prices. Public products appear on your site; the rest sell only at the table."
    >
      <Show when={!catalog.error} fallback={<SectionFailureCard error={catalog.error} title="Couldn't load the catalogue" onRetry={() => void catalog.refetch()} />}>
        <Show when={catalog.data} fallback={<SkeletonRows count={3} />}>
          <DataTable
            data={products()}
            columns={catalogueColumns}
            getRowId={p => p.slug}
            bordered={false}
            searchText={p => [p.name, p.description, ...p.variants.map(v => v.label)].filter(Boolean).join(' ')}
            searchPlaceholder="Search products"
            actions={
              <Button writes size="sm" onClick={() => setWrite(editCatalogue())}>
                <Pencil aria-hidden="true" /> Edit the catalogue
              </Button>
            }
            empty={<EmptyState icon={<Package />} label="Nothing in the catalogue" hint="Add your first product — a shirt, a record, a tote — with its sizes and price." />}
          />
        </Show>
      </Show>
    </Section>
  )

  const hasRecommendations = () => (recommendations.data ?? []).length > 0

  return (
    <>
      <div class={cn('grid items-start gap-6', hasRecommendations() && 'xl:grid-cols-5')}>
        {/* Stock and catalogue side by side in one column, each its own card;
            the tables inside drop their own border so a card holds one edge. */}
        <div class="min-w-0 space-y-6 xl:col-span-4">
          <div class="rounded-xl border border-border bg-card p-4 sm:p-5">{stockBlock}</div>
          <div class="rounded-xl border border-border bg-card p-4 sm:p-5">{catalogueBlock}</div>
        </div>
        <Show when={hasRecommendations()}>
          <WorthPushing items={recommendations.data!} />
        </Show>
      </div>
      <ActionSheet
        slug={props.slug}
        write={write()}
        onClose={() => setWrite(null)}
        onDone={() => { setWrite(null); refresh() }}
      />
    </>
  )
}

/** The recommendations as a feed beside the tables — one card per item,
 *  what to do with it, why, and how sure the call is. */
function WorthPushing(props: { items: Recommendation[]; class?: string }) {
  return (
    <aside class={cn('min-w-0 rounded-xl border border-border bg-card', props.class)} aria-labelledby="worth-pushing-title">
      <div class="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 id="worth-pushing-title" class="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles class="size-4 text-muted-foreground" aria-hidden="true" />
          Worth pushing
        </h2>
        <span class="rounded-full bg-muted px-2 py-0.5 text-xs font-bold tabular-nums text-secondary-foreground">{props.items.length}</span>
      </div>
      <ul class="divide-y divide-border">
        <For each={props.items}>{rec => {
          const Icon = recIcon(rec.recommendation)
          return (
            <li class="flex gap-3 px-4 py-3">
              <span class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                <Icon class="size-3.5" aria-hidden="true" />
              </span>
              <div class="min-w-0 space-y-1">
                <p class="text-sm font-medium leading-snug text-foreground">
                  {rec.product_name} <span class="font-normal text-muted-foreground">{rec.variant_label}</span>
                </p>
                <p class="text-xs font-medium text-foreground first-letter:uppercase">{humanize(rec.recommendation)}</p>
                <p class="text-xs leading-relaxed text-muted-foreground text-pretty">{rec.reason}</p>
                <Badge variant="outline" class="font-normal text-muted-foreground first-letter:uppercase">{rec.confidence} confidence</Badge>
              </div>
            </li>
          )
        }}</For>
      </ul>
    </aside>
  )
}
