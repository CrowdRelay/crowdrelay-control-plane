import { For, Show, createContext, useContext, type Component, type JSX } from 'solid-js'
import { Skeleton } from './ui/skeleton'
import { cn } from '~/lib/cn'

// Loading placeholders, drawn with the shadcn `Skeleton` (ui/skeleton.tsx:
// `animate-pulse rounded-md bg-muted`) in the exact shape of what loads.
//
// Every skeleton here is assembled from five pieces that mirror the console's
// real building blocks, so data arrives into the same boxes it fills:
//
//   SkHeader  ↔ DashHeader   title, one line, a pill on the right
//   SkTiles   ↔ Tiles/Tile   the row of numbers on a muted fill
//   SkCard    ↔ dash Card    bordered block, small title, divided rows
//   SkRows    ↔ Row/ItemRow  pill · title + meta · action, hairline-divided
//   SkSplit   ↔ Split        work list beside the one object, 1.6 : 1
//
// Line widths cycle through a fixed set so a list never looks like a barcode
// of identical bars, and stay the same on every render (no random widths).
//
// Two behaviours every shape shares, through `Loading`:
// - One polite "Loading…" for screen readers; the bars are aria-hidden.
// - A short delay before anything paints (`.sk-delay` in tailwind.css): a
//   load that finishes inside it never flashes a skeleton at all.

const InsideLoading = createContext(false)
const Loading = (props: { children: JSX.Element }) => (
  // A page skeleton is built from section skeletons; only the outermost one
  // announces, or a reader hears "Loading…" once per section.
  <Show when={!useContext(InsideLoading)} fallback={props.children}>
    <div role="status" class="contents">
      <span class="sr-only">Loading…</span>
      <div aria-hidden="true" class="sk-delay contents">
        <InsideLoading.Provider value={true}>{props.children}</InsideLoading.Provider>
      </div>
    </div>
  </Show>
)

const WIDTHS = ['w-3/5', 'w-2/5', 'w-4/5', 'w-1/2', 'w-2/3', 'w-1/3'] as const
const width = (i: number) => WIDTHS[i % WIDTHS.length]
const range = (n: number) => Array.from({ length: n }, (_, i) => i)

// ── The five pieces ──────────────────────────────────────────────────────

/** DashHeader: text-xl title, text-xs subtitle, status pill on the right. */
const SkHeader: Component = () => (
  <div class="mb-3.5 flex items-start justify-between gap-3">
    <div class="flex min-w-0 flex-col gap-2 pt-1">
      <Skeleton class="h-5 w-44" />
      <Skeleton class="h-3 w-64 max-w-full" />
    </div>
    <Skeleton class="mt-1 h-6 w-20 shrink-0 rounded-full" />
  </div>
)

/** Tiles: a muted tile per number — label, value, one line of context.
 *  The bars sit on the tile's own fill, so they take a foreground tint. */
const SkTiles: Component<{ count?: number; class?: string }> = (props) => (
  <div class={cn('mb-3 grid grid-cols-2 gap-2.5', (props.count ?? 4) === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4', props.class)}>
    <For each={range(props.count ?? 4)}>{i => (
      <div class="flex min-w-0 flex-col gap-2 rounded-lg bg-muted/55 px-3.5 py-3">
        <Skeleton class="h-3 w-20 bg-foreground/10" />
        <Skeleton class="h-6 w-14 bg-foreground/10" />
        <Skeleton class={cn('h-3 bg-foreground/10', i % 2 ? 'w-16' : 'w-24')} />
      </div>
    )}</For>
  </div>
)

/** Row / ItemRow: pill · title over meta · action, divided by hairlines. */
const SkRows: Component<{ count?: number; action?: boolean; pill?: boolean }> = (props) => (
  <div>
    <For each={range(props.count ?? 4)}>{i => (
      <div class="flex items-center gap-2.5 border-t border-border py-2.5 last:border-b">
        <Show when={props.pill !== false}><Skeleton class="h-5 w-12 shrink-0 rounded-full" /></Show>
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton class={cn('h-3.5', width(i))} />
          <Skeleton class={cn('h-3', width(i + 3))} />
        </div>
        <Show when={props.action !== false}><Skeleton class="h-7 w-16 shrink-0" /></Show>
      </div>
    )}</For>
  </div>
)

/** dash Card: bordered block, small title (and a note on the right), rows. */
const SkCard: Component<{ rows?: number; class?: string; minHeight?: string; plain?: boolean }> = (props) => (
  <section class={cn('min-w-0 rounded-xl border border-border bg-card px-4 py-3.5', props.class)} style={props.minHeight ? { 'min-height': props.minHeight } : undefined}>
    <div class="mb-3 flex items-center justify-between gap-3">
      <Skeleton class="h-4 w-32" />
      <Skeleton class="h-3 w-24" />
    </div>
    <Show when={!props.plain} fallback={
      <div class="flex flex-col gap-2.5">
        <For each={range(props.rows ?? 3)}>{i => <Skeleton class={cn('h-3.5', i === 0 ? 'w-full' : width(i + 1))} />}</For>
      </div>
    }>
      <SkRows count={props.rows ?? 3} />
    </Show>
  </section>
)

/** Split: the work list (wide) beside the object the page is about. */
const SkSplit: Component<{ left?: number; right?: number }> = (props) => (
  <div class="mb-3 grid gap-2.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
    <SkCard rows={props.left ?? 4} />
    <SkCard rows={props.right ?? 3} plain />
  </div>
)

// ── Shapes the console uses (names kept; every one is drawn from the pieces) ──

/** A block of a given size — charts, maps, media. */
export const SkeletonBlock: Component<{ height?: string; width?: string }> = (props) => (
  <Loading>
    <Skeleton class="rounded-lg" style={{ height: props.height ?? '120px', width: props.width ?? '100%' }} />
  </Loading>
)

/** A grid of cards. */
export const SkeletonGrid: Component<{ count?: number; minCardHeight?: string }> = (props) => (
  <Loading>
    <div class="mb-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      <For each={range(props.count ?? 3)}>{() => <SkCard rows={3} minHeight={props.minCardHeight} />}</For>
    </div>
  </Loading>
)

/** A list loading: divided rows, the shape of ItemRow and DataTable rows. */
export const SkeletonRows: Component<{ count?: number }> = (props) => (
  <Loading>
    <div class="mt-2"><SkRows count={props.count ?? 4} /></div>
  </Loading>
)

/** One card of text. */
export const SkeletonPanel: Component<{ lines?: number }> = (props) => (
  <Loading><SkCard rows={props.lines ?? 3} plain /></Loading>
)

/** The row of numbers at the top of a page. */
export const SkeletonKpiStrip: Component<{ count?: number }> = (props) => (
  <Loading><SkTiles count={props.count ?? 4} /></Loading>
)

/** A titled card with rows. `titleWidth` is accepted for old call sites. */
export const SkeletonSection: Component<{ titleWidth?: string; lines?: number; minHeight?: string }> = (props) => (
  <Loading><SkCard rows={props.lines ?? 3} minHeight={props.minHeight} class="mb-3" /></Loading>
)

/** Intelligence sections. */
export const SkeletonBrainGroup: Component = () => (
  <Loading><SkCard rows={3} plain class="mb-3" /></Loading>
)

/** A tenant's detail page: header, numbers, split, a section. */
export const SkeletonTenantPage: Component = () => (
  <Loading>
    <SkHeader />
    <SkTiles />
    <SkSplit />
    <SkCard rows={4} />
  </Loading>
)

/** Notifiers: header and two cards. */
export const SkeletonNotifiersPage: Component = () => (
  <Loading>
    <SkHeader />
    <SkCard rows={3} class="mb-3" />
    <SkCard rows={2} />
  </Loading>
)

/** Any page while its route chunk loads — the dashboard template every page
 *  follows (PageShell → DashHeader → Tiles → Split → a section). */
export const SkeletonPage: Component = () => (
  <Loading>
    <section class="px-4 py-6 pb-20 md:px-6">
      <SkHeader />
      <SkTiles />
      <SkSplit />
      <SkCard rows={4} />
    </section>
  </Loading>
)

// ── Panel-shaped skeletons ─────────────────────────────────────────────────

export const SkeletonScorecard: Component = () => (
  <Loading>
    <SkTiles count={3} />
    <div class="grid gap-2.5 lg:grid-cols-2">
      <SkCard rows={3} plain />
      <SkCard rows={3} plain />
    </div>
  </Loading>
)

export const SkeletonReplyTriage: Component = () => (
  <Loading>
    <SkTiles count={3} />
    <SkRows count={3} />
  </Loading>
)

export const SkeletonLearningLoop: Component = () => (
  <Loading>
    <SkTiles count={4} />
    <SkRows count={4} action={false} />
  </Loading>
)

export const SkeletonOpportunityBoard: Component = () => (
  <Loading><SkRows count={3} pill={false} /></Loading>
)

/** Switch rows: name and hint, a switch on the right. */
export const SkeletonFlagList: Component = () => (
  <Loading>
    <div class="mt-2">
      <For each={range(4)}>{i => (
        <div class="flex items-center justify-between gap-3 border-t border-border py-2.5 last:border-b">
          <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton class={cn('h-3.5', width(i))} />
            <Skeleton class={cn('h-3', width(i + 2))} />
          </div>
          <Skeleton class="h-5 w-9 shrink-0 rounded-full" />
        </div>
      )}</For>
    </div>
  </Loading>
)

export const SkeletonAutopilotKpis: Component = () => (
  <Loading><SkTiles count={4} /></Loading>
)

/** A sub-page or tab body loading under a header that is already there. */
export const SkeletonTabContent: Component = () => (
  <Loading>
    <SkTiles />
    <SkCard rows={4} />
  </Loading>
)

export const SkeletonSignalOverview: Component = () => (
  <Loading>
    <SkTiles count={4} class="mb-2.5" />
    <SkTiles count={4} />
  </Loading>
)
