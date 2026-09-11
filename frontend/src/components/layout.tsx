import { For, Match, Show, Suspense, Switch, createSignal, type Component, type JSX } from 'solid-js'
import { Card } from './ui/card'
import { CollapsibleSection as UICollapsible } from './ui/collapsible'
import { cn } from '../lib/cn'
import { SkeletonTabContent } from './Skeleton'

// ─── PageHeader ─────────────────────────────────────────────────────────
// Every page starts with the same structure: eyebrow + title + description
// on the left, optional actions on the right. This replaces the
// hand-rolled `<div class="page-head">` pattern with a typed primitive
// that uses Tailwind utilities at operator-console density.

export function PageHeader(props: {
  eyebrow?: string
  title: string
  description?: string
  actions?: JSX.Element
  class?: string
}) {
  return (
    <div class={cn('flex items-start justify-between gap-6 mb-5', props.class)}>
      <div class="min-w-0">
        <Show when={props.eyebrow}>
          <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">{props.eyebrow}</span>
        </Show>
        <h1 class="text-2xl font-bold tracking-tight text-foreground mt-1 break-words">{props.title}</h1>
        <Show when={props.description}>
          <p class="text-sm text-muted-foreground mt-1.5 leading-relaxed break-words">{props.description}</p>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class="flex items-center gap-2 flex-shrink-0">{props.actions}</div>
      </Show>
    </div>
  )
}

// ─── KpiCard / KpiStrip ─────────────────────────────────────────────────
// KPI cards with visual hierarchy: north-star metrics get emphasis,
// supporting metrics are compact. Replaces the hand-rolled `.kpi-card`
// and `.kpi-strip` CSS classes.

export function KpiCard(props: {
  label: string
  value: JSX.Element
  sub?: JSX.Element
  tone?: 'default' | 'good' | 'warn'
  class?: string
}) {
  return (
    <Card class={cn('p-4', props.tone === 'good' && 'border-success/30', props.tone === 'warn' && 'border-warning/30', props.class)}>
      <div class="text-xs text-muted-foreground">{props.label}</div>
      <div class="text-2xl font-bold tabular-nums text-foreground mt-1">{props.value}</div>
      <Show when={props.sub}>
        <div class="text-xs text-muted-foreground mt-1">{props.sub}</div>
      </Show>
    </Card>
  )
}

export function KpiStrip(props: { children: JSX.Element; class?: string }) {
  // `auto-fit` with `minmax(220px, 1fr)` makes the cards stretch to fill the
  // row regardless of how many there are. A 3-card strip no longer leaves a
  // gap in a 4-column grid; a 5-card strip wraps 4 + 1 with the lone card
  // stretching full width instead of hugging the left edge.
  return (
    <div data-kpi-strip="" class={cn('grid gap-3 mb-5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]', props.class)}>
      {props.children}
    </div>
  )
}

// ─── SectionPanel ───────────────────────────────────────────────────────
// A Card wrapper for content sections. Replaces `<div class="panel">`.

export function SectionPanel(props: {
  children: JSX.Element
  class?: string
  elevated?: boolean
  /** Keep the filled, bordered box. For a panel that genuinely sits on a
   *  different surface — inside a dialog, or over a map. */
  boxed?: boolean
}) {
  return (
    <Card elevated={props.elevated} flat={!props.boxed && !props.elevated} class={cn('p-4', props.class)}>
      {props.children}
    </Card>
  )
}

// ─── CollapsiblePanel ───────────────────────────────────────────────────
// Card + collapsible section. Replaces the hand-rolled CollapsibleSection
// (which used CSS max-height transition). Uses the vendored Kobalte-based
// CollapsibleSection from ui/collapsible.tsx.

export function CollapsiblePanel(props: {
  eyebrow?: string
  title: string
  badge?: string
  badgeTone?: 'good' | 'warn' | 'bad' | 'muted'
  defaultOpen?: boolean
  children: JSX.Element
  class?: string
}) {
  return (
    <UICollapsible
      eyebrow={props.eyebrow}
      title={props.title}
      badge={props.badge}
      badgeTone={props.badgeTone}
      defaultOpen={props.defaultOpen}
      class={props.class}
    >
      {props.children}
    </UICollapsible>
  )
}

// ─── PageShell ──────────────────────────────────────────────────────────
// The outer page wrapper. Replaces `<section class="page">`.
//
// This carried `overflow-hidden`, which cut the bottom off every page taller
// than the viewport: the content was clipped instead of scrolled, because the
// element that scrolls is this section's parent.
//
// `overflow-x-hidden` is not the fix either. Setting one axis to `hidden`
// makes the other compute to `auto`, so the section became a second scroll
// container nested inside the pane that already scrolls — two scrollbars, and
// a wheel gesture that moved whichever one the pointer was over.
//
// No overflow property here at all. `main` guards the horizontal axis, and the
// two elements that are genuinely wider than the page — the fan table and the
// process map — carry their own `overflow-auto`.

export function PageShell(props: { children: JSX.Element; class?: string }) {
  return (
    <section class={cn('px-4 md:px-6 py-6 pb-24 space-y-6', props.class)}>
      {props.children}
    </section>
  )
}

// ─── TabBar (Tailwind rewrite, same API) ───────────────────────────────
// Keeps the useTabPanels lazy-mount pattern (good for performance) but
// uses Tailwind utilities instead of CSS classes.

export type Tab = {
  id: string
  label: string
  count?: () => number
  icon?: Component
}

export function TabBar(props: {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
  /** Mount a tab's panel hidden before it is selected. Wire this to
   *  `useTabPanels().prefetch` so pointing at a tab starts its queries; the
   *  click then reveals data instead of starting the wait. */
  onPrefetch?: (id: string) => void
}) {
  return (
    <div class="flex items-center gap-1 border-b border-border overflow-x-auto scrollbar-none mb-4" role="tablist">
      <For each={props.tabs}>{tab => (
        <button
          class={cn(
            'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            props.active === tab.id
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
          onClick={() => props.onChange(tab.id)}
          onPointerEnter={() => props.onPrefetch?.(tab.id)}
          onFocus={() => props.onPrefetch?.(tab.id)}
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={props.active === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
        >
          <Show when={tab.icon}>{icon => icon()({})}</Show>
          {tab.label}
          <Show when={tab.count && tab.count() > 0}>
            <span class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary/15 text-primary-light text-xs font-bold">{tab.count!()}</span>
          </Show>
        </button>
      )}</For>
    </div>
  )
}

export function TabPanel(props: {
  active: string
  id: string
  visited: boolean
  children: JSX.Element
}) {
  return (
    <Show when={props.visited}>
      <div
        classList={{ hidden: props.active !== props.id }}
        role="tabpanel"
        aria-labelledby={`tab-${props.id}`}
        id={`tabpanel-${props.id}`}
        tabindex={props.active === props.id ? 0 : -1}
      >
        <Suspense fallback={<SkeletonTabContent />}>
          {props.children}
        </Suspense>
      </div>
    </Show>
  )
}

export function useTabPanels(initial: string) {
  const [activeTab, setActiveTab] = createSignal(initial)
  const [visited, setVisited] = createSignal<Set<string>>(new Set([initial]))
  const visit = (id: string) => setVisited(prev => prev.has(id) ? prev : new Set([...prev, id]))
  const switchTab = (id: string) => {
    setActiveTab(id)
    visit(id)
  }
  // Mount the panel without selecting it. `TabPanel` renders a visited panel
  // hidden, so its queries start on hover and the click has nothing left to
  // wait for. A tab the operator never points at still costs nothing.
  const prefetch = (id: string) => visit(id)
  return { activeTab, switchTab, prefetch, visited, isVisited: (id: string) => visited().has(id) }
}

// ─── ErrorCard ─────────────────────────────────────────────────────────
// Replaces the hand-rolled `.error-card` CSS class.

export function ErrorCard(props: { children: JSX.Element; class?: string }) {
  return (
    <div class={cn('error-card rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive break-words', props.class)} role="alert">
      {props.children}
    </div>
  )
}

// ─── SkeletonBlock ─────────────────────────────────────────────────────
// Replaces the hand-rolled `.skeleton-block` CSS class. Static gradient
// (no shimmer animation — this is an operator console, not a marketing site).

export function SkeletonBlock(props: { class?: string; style?: JSX.CSSProperties }) {
  return (
    <div
      class={cn('rounded-lg bg-surface-3 border border-border', props.class)}
      style={props.style}
    />
  )
}

// ─── SectionTitle ───────────────────────────────────────────────────────
// Replaces `<div class="section-title">`. A section header with optional
// eyebrow, icon, and action link.

export function SectionTitle(props: {
  eyebrow?: string
  title: string
  description?: JSX.Element
  icon?: JSX.Element
  action?: JSX.Element
  class?: string
}) {
  return (
    <div class={cn('flex items-center justify-between gap-4 mt-6 mb-3', props.class)}>
      <div class="flex items-center gap-2">
        <Show when={props.icon}>
          <span class="text-muted-foreground">{props.icon}</span>
        </Show>
        <div>
          <Show when={props.eyebrow}>
            <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">{props.eyebrow}</span>
          </Show>
          <h2 class="text-lg font-semibold text-foreground">{props.title}</h2>
          <Show when={props.description}>
            <p class="text-sm text-muted-foreground mt-1">{props.description}</p>
          </Show>
        </div>
      </div>
      <Show when={props.action}>
        {props.action}
      </Show>
    </div>
  )
}

// ─── useShowMore / ShowMore ────────────────────────────────────────────
// A long list is a scroll cost paid by everyone to serve the few who wanted
// row forty. Show the first screenful, say how many are behind it, and let the
// operator ask for the rest.
//
// The limit defaults to 12: enough that most lists never truncate at all, few
// enough that the ones that do stay a screenful.

export function useShowMore<T>(items: () => T[], limit = 12) {
  const [expanded, setExpanded] = createSignal(false)
  return {
    visible: () => (expanded() ? items() : items().slice(0, limit)),
    hidden: () => Math.max(0, items().length - limit),
    expanded,
    toggle: () => setExpanded(v => !v),
  }
}

export function ShowMore(props: {
  hidden: number
  expanded: boolean
  onToggle: () => void
  /** Plural noun for the hidden rows, e.g. "profiles". */
  noun?: string
}) {
  return (
    <Show when={props.hidden > 0}>
      <button
        type="button"
        class="mt-2 w-full border-t border-border py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => props.onToggle()}
      >
        {props.expanded
          ? 'Show fewer'
          : `Show ${props.hidden} more${props.noun ? ` ${props.noun}` : ''}`}
      </button>
    </Show>
  )
}

// ─── Section ───────────────────────────────────────────────────────────
// A titled band inside a page, separated by a heading and a hairline rule
// rather than by another box.
//
// Panels used to be `Card`s stacked inside the page's own `Card`: same fill,
// same width, one hairline between them. Adjacent panels read as a single
// undifferentiated slab, and a rounded corner in the middle of that slab reads
// as a hole rather than as an edge. Nesting a box inside a box of the same
// colour cannot express hierarchy — only a heading can.
//
// `count` is for "how many are in here", which is the question a collapsed
// section has to answer before the operator decides to open it.

export function Section(props: {
  title: string
  description?: JSX.Element
  icon?: JSX.Element
  count?: number
  /** Right-aligned controls that act on the whole section. */
  action?: JSX.Element
  /** Drop the top rule — for the first section under a tab bar. */
  flush?: boolean
  children: JSX.Element
  class?: string
}) {
  return (
    <section class={cn(props.flush ? 'pt-1' : 'mt-8 border-t border-border pt-5', props.class)}>
      <div class="mb-3 flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="flex items-center gap-2 text-base font-semibold text-foreground">
            <Show when={props.icon}><span class="text-muted-foreground">{props.icon}</span></Show>
            {props.title}
            <Show when={props.count != null && props.count > 0}>
              <span class="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-bold tabular-nums text-secondary-foreground">{props.count}</span>
            </Show>
          </h2>
          <Show when={props.description}>
            <p class="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{props.description}</p>
          </Show>
        </div>
        <Show when={props.action}><div class="flex shrink-0 items-center gap-2">{props.action}</div></Show>
      </div>
      {props.children}
    </section>
  )
}

// ─── CommandBlock ──────────────────────────────────────────────────────
// Replaces the hand-rolled `.command-block` CSS class. A card-like link
// with an eyebrow, a big metric, and detail text. Used on the overview page
// for the Aggregate → Engage → Convert flow and the operations signal blocks.

export function CommandBlock(props: {
  eyebrow: string
  metric: JSX.Element
  label: string
  detail?: JSX.Element
  tone?: 'default' | 'active' | 'warn' | 'good'
  class?: string
}) {
  const toneClass = {
    default: 'border-border',
    active: 'border-primary/40',
    warn: 'border-warning/40',
    good: 'border-success/40',
  }
  return (
    <Card class={cn('p-4 transition-colors hover:border-border-strong cursor-pointer', toneClass[props.tone ?? 'default'], props.class)}>
      <div class="text-xs font-medium uppercase tracking-wider text-muted-foreground">{props.eyebrow}</div>
      <div class="mt-2 flex items-baseline gap-2">
        <span class="text-2xl font-bold tabular-nums text-foreground">{props.metric}</span>
        <span class="text-xs text-muted-foreground">{props.label}</span>
      </div>
      {/* Callers pass a fragment of sibling `<span>`s. `space-y-*` sets margins
          on block children only, so inline spans ran together into one string —
          "4 unknownNo actions in flight". Flex makes every child its own line
          whatever element the caller chose. */}
      <Show when={props.detail}>
        <div class="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">{props.detail}</div>
      </Show>
    </Card>
  )
}

// ─── QueryBoundary ─────────────────────────────────────────────────────
// A panel that guards its body with `<Show when={query.data}>` and no fallback
// renders its heading over an empty rectangle for as long as the request takes.
// On a tunnelled tenant read that is routinely a second or more, and an empty
// card is indistinguishable from a card whose answer is "nothing" — the two
// readings lead an operator to opposite actions.
//
// This states all four outcomes explicitly: pending, failed, empty, loaded.
//
//   <QueryBoundary query={model} skeleton={<SkeletonRows count={3} />}
//                  error="Learning proof is unavailable"
//                  empty={<EmptyState label="No belief changes yet" />}
//                  isEmpty={d => d.entries.length === 0}>
//     {data => <Table>…</Table>}
//   </QueryBoundary>

export function QueryBoundary<T>(props: {
  query: { data: T | undefined; isPending: boolean; error: unknown }
  skeleton: JSX.Element
  /** Shown instead of the body when the request failed. */
  error: JSX.Element
  /** Shown when the request succeeded but `isEmpty` says there is nothing. */
  empty?: JSX.Element
  isEmpty?: (data: T) => boolean
  children: (data: T) => JSX.Element
}) {
  return (
    <Switch fallback={props.skeleton}>
      <Match when={props.query.error}>
        <ErrorCard>{props.error}</ErrorCard>
      </Match>
      <Match when={props.query.data !== undefined}>
        {(() => {
          const data = props.query.data as T
          const blank = props.empty && props.isEmpty?.(data)
          return blank ? props.empty : props.children(data)
        })()}
      </Match>
    </Switch>
  )
}

// ─── DataRow ───────────────────────────────────────────────────────────
// A horizontal key-value row with a bottom border. Replaces `.product-row`,
// `.audit-row`, `.flag-row` patterns.

export function DataRow(props: {
  children: JSX.Element
  class?: string
  last?: boolean
}) {
  return (
    <div class={cn('flex items-center justify-between gap-3.5 py-3', !props.last && 'border-b border-border', props.class)}>
      {props.children}
    </div>
  )
}

// ─── FormGrid ──────────────────────────────────────────────────────────
// A responsive 2-column form grid. Replaces `.form-grid`.

export function FormGrid(props: { children: JSX.Element; class?: string }) {
  return (
    <div class={cn('grid grid-cols-1 md:grid-cols-2 gap-3.5', props.class)}>
      {props.children}
    </div>
  )
}

// ─── KeyValueList ──────────────────────────────────────────────────────
// A definition list with 2-column grid. Replaces `.panel dl`.

export function KeyValueList(props: { children: JSX.Element; class?: string }) {
  return (
    <dl class={cn('grid grid-cols-2 gap-2.5 m-0', props.class)}>
      {props.children}
    </dl>
  )
}

export function KeyValueTerm(props: { children: JSX.Element; class?: string }) {
  return <dt class={cn('text-muted-foreground text-sm', props.class)}>{props.children}</dt>
}

export function KeyValueDesc(props: { children: JSX.Element; class?: string }) {
  return <dd class={cn('text-right text-foreground text-sm break-words', props.class)}>{props.children}</dd>
}
