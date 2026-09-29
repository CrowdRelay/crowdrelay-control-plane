import { For, Match, Show, Suspense, Switch, createEffect, createSignal, onCleanup, onMount, untrack, type Component, type JSX } from 'solid-js'
import { onTabListKeyDown } from '../lib/roving-tabs'
import { useNavigate, useRouterState } from '@tanstack/solid-router'
import { Card } from './app/card'
import { Metric, MetricRow, type MetricTone } from './ui/metric'
import { CollapsibleSection as UICollapsible } from './app/collapsible'
import { cn } from '../lib/cn'
import { SkeletonTabContent } from './Skeleton'
import { Button } from './app/button'
import { Skeleton } from './ui/skeleton'
import { Dynamic } from 'solid-js/web'
import { CircleAlert, Clock, CloudOff, Hourglass, Lock, RotateCw, SearchX, TriangleAlert, WifiOff } from 'lucide-solid'
import { describeError, type ErrorKind } from '../lib/errors'
import { TechId, TechnicalDetails } from './ui/TechnicalDetails'

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
    <div class={cn('flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6 mb-5', props.class)}>
      <div class="min-w-0">
        <Show when={props.eyebrow}>
          <span data-slot="eyebrow" class="text-xs font-medium uppercase tracking-wider text-muted-foreground">{props.eyebrow}</span>
        </Show>
        <h1 class="text-3xl font-bold tracking-tight text-foreground mt-1 break-words">{props.title}</h1>
        <Show when={props.description}>
          <p class="text-sm text-muted-foreground mt-1.5 leading-relaxed break-words">{props.description}</p>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class="flex items-center gap-2 sm:flex-shrink-0">{props.actions}</div>
      </Show>
    </div>
  )
}

// ─── KpiCard / KpiStrip ─────────────────────────────────────────────────
// Both are now thin names over `Metric` and `MetricRow` (components/ui/metric).
// They stay because ninety-odd call sites read well as "KPI", and because the
// pair carries one rule the primitive cannot enforce on its own: a `KpiCard`
// belongs inside a `KpiStrip`, which is the `<dl>` its `<dt>`/`<dd>` need.
//
// What changed is the drawing. Each figure used to be a rounded, bordered,
// filled box, so a five-number summary arrived as five objects competing with
// the page under it. They are one reading now, divided by hairlines — the
// shape the public site uses for exactly this, and the argument is its own:
// the numbers introduce the section below them, they do not compete with it.

export function KpiCard(props: {
  label: string
  value: JSX.Element
  sub?: JSX.Element
  tone?: MetricTone
  /** The figure arrived after the strip first rendered — fade it in once. */
  fresh?: boolean
  class?: string
}) {
  return (
    <Metric
      label={props.label}
      value={props.value}
      sub={props.sub}
      tone={props.tone}
      fresh={props.fresh}
      class={props.class}
    />
  )
}

export function KpiStrip(props: { children: JSX.Element; class?: string; min?: string }) {
  return <MetricRow class={cn('mb-5', props.class)} min={props.min}>{props.children}</MetricRow>
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
//
// `space-y-5`, not `-6`. Tailwind v4 writes `space-y-*` as a zero-specificity
// `:where()` rule, so any child carrying its own `mb-*` beats it — and most of
// the page-level primitives carry `mb-5`. The page therefore ran at 20px
// between the children that set a margin and 24px between the ones that did
// not, which is the mixed vertical rhythm an operator reads as sloppiness.
// Matching the shell to the primitives makes every gap 20px whichever wins.
//
// The bottom padding clears the chat launcher, which stands 59px off the
// viewport floor. It was `pb-24` — 96px, 37px more than the launcher needs,
// and enough to make a short page scroll for nothing.

export function PageShell(props: { children: JSX.Element; class?: string }) {
  return (
    <section class={cn('px-4 md:px-6 py-6 pb-20 space-y-5', props.class)}>
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
  count?: () => number | null
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
  /** The bar carries its own `mb-4`, which is right when it sits directly
   *  above its panels. Inside a flex column that already sets `gap`, that
   *  margin adds to the gap and the tabs float away from their content —
   *  pass `mb-0` there and let the container do the spacing. */
  class?: string
}) {
  return (
    <div class={cn('flex items-center gap-1 border-b border-border overflow-x-auto scrollbar-none mb-4', props.class)} role="tablist">
      <For each={props.tabs}>{(tab, i) => (
        <Button
          type="button"
          variant="ghost"
          class={cn(
            'h-auto items-center gap-1.5 rounded-none whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
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
          tabIndex={props.active === tab.id || (i() === 0 && !props.tabs.some(t => t.id === props.active)) ? 0 : -1}
          onKeyDown={onTabListKeyDown}
        >
          <Show when={tab.icon}>{icon => icon()({})}</Show>
          {tab.label}
          <Show when={tab.count && (tab.count() ?? 0) > 0}>
            <span class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary/15 text-primary text-xs font-bold">{tab.count!()}</span>
          </Show>
        </Button>
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
        // The end-to-end suite counts mounted tab panels to prove the lazy
        // mount. It used to find them by `.page-tab-content`, a presentation
        // class the Tailwind migration deleted — so the assertion stopped
        // finding anything and the tests timed out rather than failing loudly.
        // `data-slot` is not a style hook, so restyling cannot remove it.
        data-slot="tab-panel"
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

export function useTabPanels(initial: string, valid?: string[] | (() => string[]), param = 'tab') {
  // `?<param>=<id>` lets a link or an external redirect (OAuth return) land on
  // a specific tab. Only honored when the caller passes its full id list —
  // without it a stray query param would activate a tab that does not exist
  // and every panel would render hidden. `param` names the query key — a tab
  // set nested inside another page's tab (the communities sub-tabs inside
  // Audience) must take a different name or its writes evict the parent's.
  //
  // `valid` may be an accessor for a tab whose existence depends on a query
  // (Places' AREA tab waits on the entitlement probe). The URL-follow effect
  // then re-reads the list reactively: a `?tab=` that names a tab the probe
  // has now ruled out snaps back to `initial`, and one it has just admitted
  // snaps in.
  const validList = () => (typeof valid === 'function' ? valid() : valid) ?? []
  const requested = new URLSearchParams(window.location.search).get(param)
  const start = requested && validList().includes(requested) ? requested : initial
  const [activeTab, setActiveTab] = createSignal(start)
  const [visited, setVisited] = createSignal<Set<string>>(new Set([start]))
  const visit = (id: string) => setVisited(prev => prev.has(id) ? prev : new Set([...prev, id]))
  const rawSwitch = (id: string) => {
    setActiveTab(id)
    visit(id)
  }
  // When the caller names its tab ids, `?tab=` is the shared source of truth
  // both ways: a sidebar link or a pasted deep link changes the active tab,
  // and a tab switch writes the param back so refresh and shares keep the
  // view. A bare URL means the initial tab — without that fallback, Today →
  // Settings → Today would leave the page on the last tab while the URL and
  // the sidebar both claim the default.
  let switchTab = rawSwitch
  if (valid) {
    const navigate = useNavigate()
    const locationSearch = useRouterState({ select: s => s.location.search })
    // The effect snaps back to `initial` whenever the param is absent or
    // invalid, and switchTab merges its key into the search object — a second
    // param (the nested `subtab`) survives a tab switch instead of evicting
    // the parent's `tab`.
    switchTab = (id: string) => {
      rawSwitch(id)
      // `resetScroll`/`hashScrollIntoView` off: a `?tab=` write is not a page
      // change — without them the default scroll-to-top reads as a reload.
      // `untrack` for the same reason as useWorkAreas.open: navigate's own
      // router reads must not subscribe a calling effect to router updates.
      untrack(() => {
        void navigate({ to: '.', search: (prev: Record<string, unknown>) => ({ ...prev, [param]: id }), replace: true, resetScroll: false, hashScrollIntoView: false } as any)
      })
    }
    // Follow the URL, not the local selection. This effect used to track
    // `activeTab` as well, so a click re-ran it before the router had taken
    // the new `?tab=`: it read the old value and switched straight back. On a
    // page opened with `?tab=` already set, the router's late update never
    // re-triggered it, and every first click left the tab one step behind
    // the URL. Reading the selection untracked keeps a click where it landed
    // while links, back and forward still drive the tab.
    createEffect(() => {
      const t = (locationSearch() as Record<string, unknown>)?.[param]
      const target = typeof t === 'string' && validList().includes(t) ? t : initial
      untrack(() => { if (target !== activeTab()) rawSwitch(target) })
    })
  }
  // Mount the panel without selecting it. `TabPanel` renders a visited panel
  // hidden, so its queries start on hover and the click has nothing left to
  // wait for. A tab the operator never points at still costs nothing.
  const prefetch = (id: string) => visit(id)
  // Jump to something on this page that may be inside another tab.
  //
  // A bare `#anchor` link cannot do this: an unvisited panel is not in the DOM
  // at all, and a visited-but-inactive one is `hidden`, so `scrollIntoView`
  // finds nothing or scrolls to a zero-height box. Switching the tab first is
  // the whole fix — but the panel may be mounting for the first time, so the
  // element still does not exist on this frame. Retry for ~1s (a lazy tab
  // panel mounts its anchor several hundred ms after the switch), then give
  // up rather than spin.
  const revealAnchor = (id: string, anchor?: string) => {
    switchTab(id)
    if (!anchor) return
    let attempts = 0
    const scroll = () => {
      const element = document.getElementById(anchor)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (attempts++ < 60) {
        requestAnimationFrame(scroll)
      }
    }
    requestAnimationFrame(scroll)
  }
  return { activeTab, switchTab, prefetch, revealAnchor, visited, isVisited: (id: string) => visited().has(id) }
}

// ─── ErrorCard ─────────────────────────────────────────────────────────
// The one error surface. It speaks in the reader's words and keeps the
// developer's words one click in:
//
//   <ErrorCard title="Couldn't load growth trends" error={trends.error}
//              onRetry={() => trends.refetch()} />
//
// `title` names what failed from the reader's side. `error` supplies the
// plain-language reason and next step (see `lib/errors.ts`) and fills the
// Technical details disclosure with the raw status, code, detail and request
// id. `children` replaces the reason when the caller knows better. A
// temporary failure (offline, slow, service down) wears the warning tone —
// waiting will fix it — and anything else the destructive one.

const ERROR_ICON: Record<ErrorKind, Component<{ class?: string; 'aria-hidden'?: boolean }>> = {
  offline: WifiOff,
  timeout: Clock,
  unreachable: CloudOff,
  busy: Hourglass,
  session: Lock,
  permission: Lock,
  missing: SearchX,
  conflict: CircleAlert,
  invalid: CircleAlert,
  credentials: Lock,
  server: TriangleAlert,
  unknown: TriangleAlert,
}

const TEMPORARY: ReadonlySet<ErrorKind> = new Set(['offline', 'timeout', 'unreachable', 'busy'])

export function ErrorCard(props: {
  /** What failed, from the reader's side: "Couldn't load growth trends". */
  title?: JSX.Element
  /** The caught error. Supplies the reason, the next step and the
   *  technical details. */
  error?: unknown
  /** Offers a Try again button. May return a promise; the button waits. */
  onRetry?: () => unknown
  /** Overrides the next-step line; `false` hides it when the text already
   *  says what to do. */
  recovery?: JSX.Element | false
  /** Extra diagnosis shown inside Technical details, above the ids. */
  details?: JSX.Element
  children?: JSX.Element
  class?: string
}) {
  const described = () => (props.error ? describeError(props.error) : undefined)
  const kind = (): ErrorKind => described()?.kind ?? 'unknown'
  const temporary = () => TEMPORARY.has(kind())
  const [retrying, setRetrying] = createSignal(false)
  const retry = async () => {
    if (!props.onRetry || retrying()) return
    setRetrying(true)
    try { await props.onRetry() } catch { /* the card re-renders with the new error */ } finally { setRetrying(false) }
  }
  const recovery = () => {
    if (props.recovery === false) return undefined
    if (props.recovery !== undefined) return props.recovery
    // Without a caught error the message is the caller's own sentence
    // ("Choose a file first") — a generic "try again" would be wrong there.
    return described()?.recovery
  }
  // A bare `<ErrorCard>{"Couldn't save. Email is too long."}</ErrorCard>`
  // reads as a heading and a reason: the first sentence takes the heading's
  // weight and the rest sits under it. With a title, children are the
  // description beneath it.
  const split = () => {
    const text = props.children
    if (props.title !== undefined || props.error || typeof text !== 'string') return undefined
    const at = text.search(/[.!?]\s+\S/)
    return at < 0 ? [text, undefined] as const : [text.slice(0, at + 1), text.slice(at + 1).trim()] as const
  }
  const heading = () => props.title ?? (split()?.[0] ?? (props.error ? undefined : props.children))
  const body = () => {
    const text = split()?.[1] ?? (props.title !== undefined || props.error ? props.children ?? described()?.reason : undefined)
    // A reason that only restates the title ("Couldn't load X." under
    // "Couldn't load X") is noise.
    const same = (x: unknown) => typeof x === 'string' ? x.toLowerCase().replace(/[.\s]+$/, '') : undefined
    return same(text) !== undefined && same(text) === same(props.title) ? undefined : text
  }
  const technical = () => described()?.technical ?? []

  return (
    <div
      class={cn(
        'error-card flex gap-3 rounded-lg border bg-card p-4 text-sm break-words',
        temporary() ? 'border-warning-foreground/30' : 'border-destructive/30',
        props.class,
      )}
      role="alert"
    >
      <span
        class={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md',
          temporary() ? 'bg-warning text-warning-foreground' : 'bg-destructive/10 text-destructive',
        )}
      >
        <Dynamic component={ERROR_ICON[kind()]} class="size-4" aria-hidden />
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-1 pt-1">
        <Show when={heading()}>
          <div class="m-0 font-medium text-foreground text-pretty">{heading()}</div>
        </Show>
        <Show when={body()}>
          <div class="m-0 text-muted-foreground text-pretty">{body()}</div>
        </Show>
        <Show when={recovery()}>
          <p class="m-0 text-xs text-muted-foreground text-pretty">{recovery()}</p>
        </Show>
        <Show when={props.onRetry || props.details || technical().length > 0}>
          <div class="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <Show when={props.onRetry}>
              <Button type="button" variant="outline" size="sm" disabled={retrying()} onClick={() => void retry()}>
                <RotateCw class={cn('size-3.5', retrying() && 'animate-spin motion-reduce:animate-none')} aria-hidden />
                {retrying() ? 'Trying again…' : 'Try again'}
              </Button>
            </Show>
            <Show when={props.details || technical().length > 0}>
              <TechnicalDetails class="min-w-0 flex-1 basis-60">
                {props.details}
                <For each={technical()}>{row => <TechId label={row.label} value={row.value} />}</For>
              </TechnicalDetails>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}

// ─── SkeletonBlock ─────────────────────────────────────────────────────
// A single shadcn `Skeleton` sized by class — for one-off loading shapes that
// sit inside a real layout. Composite shapes live in `Skeleton.tsx`.

export function SkeletonBlock(props: { class?: string; style?: JSX.CSSProperties }) {
  return <Skeleton class={props.class} style={props.style} />
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
    <div class={cn('flex items-center justify-between gap-4 mt-6 mb-3 first:mt-0', props.class)}>
      <div class="flex items-center gap-2">
        <Show when={props.icon}>
          <span class="text-muted-foreground">{props.icon}</span>
        </Show>
        <div>
          <Show when={props.eyebrow}>
            <span data-slot="eyebrow" class="text-xs font-medium uppercase tracking-wider text-muted-foreground">{props.eyebrow}</span>
          </Show>
          <h2 class="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">{props.title}</h2>
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
      <Button
        type="button"
        variant="ghost"
        class="mt-2 h-auto w-full rounded-none border-t border-border py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        onClick={() => props.onToggle()}
      >
        {props.expanded
          ? 'Show fewer'
          : `Show ${props.hidden} more${props.noun ? ` ${props.noun}` : ''}`}
      </Button>
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
  /** The one section on the page that answers its question.
   *
   *  Every panel carried the same weight: same heading size, same rule, same
   *  fill. A screen where nothing is emphasised is a screen where the operator
   *  has to read all of it to find the part that matters, every time. A lead
   *  section gets a larger heading and a primary-tinted rule — one per page,
   *  because two of them is none. */
  lead?: boolean
  children: JSX.Element
  class?: string
}) {
  return (
    <section
      class={cn(
        // `Section` and `Card flat` are the console's two panel wrappers and
        // they disagreed about spacing: a flat card is `pt-6` with no top
        // margin, a section was `mt-8 pt-5`. Inside `PageShell`'s `space-y-6`
        // that is 48px of lead-in for one and 76px for the other, so a page
        // mixing them — which every page does — had two rhythms down it. They
        // now produce the same gap, and the first panel on a page drops both
        // the rule and the padding exactly as a flat card does.
        props.flush ? 'pt-1' : 'border-t pt-6 first:border-t-0 first:pt-0',
        !props.flush && (props.lead ? 'border-primary/40' : 'border-border'),
        props.class,
      )}
    >
      <div class="mb-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div class="min-w-0">
          <h2 class={cn('flex items-center gap-2 font-semibold text-foreground', props.lead ? 'text-lg' : 'text-base')}>
            <Show when={props.icon}><span class={props.lead ? 'text-primary' : 'text-muted-foreground'}>{props.icon}</span></Show>
            {props.title}
            <Show when={props.count != null && props.count > 0}>
              <span class="rounded-full bg-muted px-2 py-0.5 text-xs font-bold tabular-nums text-secondary-foreground">{props.count}</span>
            </Show>
          </h2>
          <Show when={props.description}>
            <p class="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{props.description}</p>
          </Show>
        </div>
        <Show when={props.action}><div class="flex shrink-0 items-center gap-2 sm:shrink-0">{props.action}</div></Show>
      </div>
      {props.children}
    </section>
  )
}

// ─── PanelTitle / Eyebrow ──────────────────────────────────────────────
// The heading a panel puts above its own content, and the small uppercase
// label above a value.
//
// The heading class string appeared inline 53 times in four different type
// scales — `text-lg font-bold`, `text-lg font-semibold`, `text-base
// font-semibold`, `text-sm font-semibold` — for the same rank of heading, so
// two adjacent panels routinely disagreed about how big a panel title is.
// The eyebrow appeared 21 times. Both are one line of markup, which is exactly
// why they were copied rather than imported, and exactly how they drifted.
//
// The icon goes in a muted span: at full foreground weight it competes with
// the words it introduces.

export function PanelTitle(props: {
  children: JSX.Element
  icon?: JSX.Element
  /** `h3` for a heading nested under another panel heading. Default `h2`. */
  as?: 'h2' | 'h3'
  class?: string
}) {
  const body = (
    <>
      <Show when={props.icon}><span class="text-muted-foreground">{props.icon}</span></Show>
      {props.children}
    </>
  )
  // `as="h3"` changed the element and not the size, so a sub-heading rendered
  // through this primitive was indistinguishable from the panel heading above
  // it — while the eleven sub-headings still written by hand used `text-sm`.
  // Two ranks, two sizes: h2 is `text-base`, h3 is `text-sm`.
  const cls = cn(
    'flex items-center gap-2 font-semibold text-foreground',
    props.as === 'h3' ? 'text-sm' : 'text-base',
    props.class,
  )
  return (
    <Show when={props.as === 'h3'} fallback={<h2 class={cls}>{body}</h2>}>
      <h3 class={cls}>{body}</h3>
    </Show>
  )
}

export function Eyebrow(props: { children: JSX.Element; class?: string }) {
  return (
    <span class={cn('text-xs font-medium uppercase tracking-wider text-muted-foreground', props.class)}>
      {props.children}
    </span>
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
    warn: 'border-warning-foreground/40',
    good: 'border-success-foreground/40',
  }
  return (
    <Card data-slot="command-block" class={cn('p-4 transition-colors hover:border-input cursor-pointer', toneClass[props.tone ?? 'default'], props.class)}>
      <div data-slot="eyebrow" class="text-xs font-medium uppercase tracking-wider text-muted-foreground">{props.eyebrow}</div>
      <div class="mt-2 flex items-baseline gap-2">
        <span class="text-xl font-bold tabular-nums text-foreground">{props.metric}</span>
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
//                  empty={<EmptyState icon={<Brain />} label="No belief changes yet" />}
//                  isEmpty={d => d.entries.length === 0}>
//     {data => <Table>…</Table>}
//   </QueryBoundary>

export function QueryBoundary<T>(props: {
  query: { data: T | undefined; isPending: boolean; error: unknown }
  skeleton: JSX.Element
  /** Names what failed — "Couldn't load learning proof". The reason and
   *  next step come from the error itself. */
  error: JSX.Element
  /** Offers Try again on the error card — normally `() => query.refetch()`. */
  onRetry?: () => unknown
  /** Shown when the request succeeded but `isEmpty` says there is nothing. */
  empty?: JSX.Element
  isEmpty?: (data: T) => boolean
  children: (data: T) => JSX.Element
}) {
  return (
    <Switch fallback={props.skeleton}>
      <Match when={props.query.error}>
        <ErrorCard title={props.error} error={props.query.error} onRetry={props.onRetry} />
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
    <div class={cn('flex items-center justify-between gap-4 py-3', !props.last && 'border-b border-border', props.class)}>
      {props.children}
    </div>
  )
}



// ─── Deferred ───────────────────────────────────────────────────────────
// A below-fold section should not spend its queries and DOM on first paint —
// four panels mounting together is why a tab used to open slowly. The
// placeholder mounts children when it nears the viewport; an operator who
// never scrolls never pays for the section.

export function Deferred(props: { children: JSX.Element }) {
  let sentinel: HTMLDivElement | undefined
  const [near, setNear] = createSignal(false)
  onMount(() => {
    if (!sentinel) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setNear(true)
          observer.disconnect()
        }
      },
      // Mount a viewport ahead — the section is already there when the
      // scroll arrives, not visibly popping in beneath it.
      { rootMargin: '800px 0px' },
    )
    observer.observe(sentinel)
    // Deferred is a paint-ordering hint, not a lock: an operator who never
    // scrolls still gets the section once the top of the page has landed.
    const timer = setTimeout(() => setNear(true), 1200)
    onCleanup(() => {
      observer.disconnect()
      clearTimeout(timer)
    })
  })
  return <div ref={sentinel}>{near() ? props.children : null}</div>
}
