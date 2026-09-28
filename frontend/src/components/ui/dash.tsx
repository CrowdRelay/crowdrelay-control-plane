import { For, Show, Suspense, createEffect, createSignal, untrack, type JSX } from 'solid-js'
import { Link, useNavigate, useRouterState } from '@tanstack/solid-router'
import { cn } from '../../lib/cn'
import { httpUrl } from '../../lib/format'
import { SkeletonTabContent } from '../Skeleton'

// The dashboard primitives the approved console mockups are drawn with
// (`~/.devin/plans/console-mockups/*.html`). Each maps one mockup class to
// console tokens so a page reads the same as its mockup:
//
//   mockup        here         console tokens
//   header        DashHeader   title text-xl/medium, date text-xs muted
//   .pill         Pill         tinted chip per tone
//   .m            Tile         bg-muted/55, rounded-lg — a number with context
//   .c            Card         bg-card, border, rounded-xl — one block
//   .h            (Card title) text-sm/medium with an icon
//   .row          Row          divided row, text-sm, py-2
//   .bar          Bar          label, track, value
//   buttons       Act          small outlined control inside a row
//   Work areas    WorkAreas    the page's deeper tabs as one row of buttons
//
// Pages built from a mockup compose these and nothing heavier on their first
// screen; the old panels live behind the work-area buttons.

export type Tone = 'good' | 'warn' | 'bad' | 'muted' | 'accent'

const PILL: Record<Tone, string> = {
  good: 'bg-success-foreground/15 text-success-foreground',
  warn: 'bg-warning-foreground/15 text-warning-foreground',
  bad: 'bg-error-foreground/15 text-error-foreground',
  muted: 'bg-muted text-muted-foreground',
  accent: 'bg-info-foreground/15 text-info-foreground',
}

const TEXT: Record<Tone, string> = {
  good: 'text-success-foreground',
  warn: 'text-warning-foreground',
  bad: 'text-error-foreground',
  muted: 'text-muted-foreground',
  accent: 'text-info-foreground',
}

export const toneText = (tone: Tone) => TEXT[tone]

export function Pill(props: { tone?: Tone; children: JSX.Element; class?: string }) {
  return (
    <span class={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs', PILL[props.tone ?? 'muted'], props.class)}>
      {props.children}
    </span>
  )
}

/** Title, one line under it, the status pill on the right. `back` is the
 *  small link above the title the sub-pages use ("← Places"). */
export function DashHeader(props: {
  title: JSX.Element
  subtitle?: JSX.Element
  pill?: { tone: Tone; text: string } | null
  back?: { label: string; to: string; params?: Record<string, string>; search?: Record<string, string> }
  actions?: JSX.Element
}) {
  return (
    <div class="mb-3.5 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <Show when={props.back}>
          {back => (
            <Link to={back().to} params={back().params} search={back().search} class="text-xs text-muted-foreground hover:text-foreground">
              ← {back().label}
            </Link>
          )}
        </Show>
        <h1 class="m-0 text-xl font-medium text-foreground">{props.title}</h1>
        <Show when={props.subtitle}>
          <p class="m-0 text-xs text-muted-foreground">{props.subtitle}</p>
        </Show>
      </div>
      <div class="flex shrink-0 flex-wrap items-center justify-end gap-2 pt-1">
        <Show when={props.pill}>{pill => <Pill tone={pill().tone}>{pill().text}</Pill>}</Show>
        {props.actions}
      </div>
    </div>
  )
}

/** The row of numbers under the header — four by default, as the mockups. */
export function Tiles(props: { children: JSX.Element; cols?: 2 | 3 | 4 }) {
  return (
    <div class={cn('mb-3 grid grid-cols-2 gap-2.5', props.cols === 3 ? 'lg:grid-cols-3' : props.cols === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-4')}>
      {props.children}
    </div>
  )
}

/** One number: label, value, one line of context. A missing value is "—". */
export function Tile(props: { label: string; value: JSX.Element | null | undefined; sub?: JSX.Element; valueTone?: Tone }) {
  return (
    <div class="min-w-0 rounded-lg bg-muted/55 px-3.5 py-3">
      <p class="m-0 text-xs text-muted-foreground">{props.label}</p>
      <p class={cn('m-0 mt-0.5 text-2xl font-medium tabular-nums', props.valueTone ? TEXT[props.valueTone] : 'text-foreground')}>
        {props.value ?? '—'}
      </p>
      <Show when={props.sub}>
        <p class="m-0 mt-0.5 text-xs text-muted-foreground/70">{props.sub}</p>
      </Show>
    </div>
  )
}

/** A bordered block with a small title, an optional icon and a right-hand
 *  note ("ranked by fans it can bring"). */
export function Card(props: {
  title?: JSX.Element
  icon?: JSX.Element
  aside?: JSX.Element
  children: JSX.Element
  class?: string
  tone?: 'warn'
}) {
  return (
    <section class={cn('min-w-0 rounded-xl border bg-card px-4 py-3.5', props.tone === 'warn' ? 'border-warning-foreground/50' : 'border-border', props.class)}>
      <Show when={props.title || props.aside}>
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="m-0 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Show when={props.icon}><span class="inline-flex size-4 items-center text-muted-foreground [&>svg]:size-4">{props.icon}</span></Show>
            {props.title}
          </h2>
          <Show when={props.aside}><span class="text-xs text-muted-foreground">{props.aside}</span></Show>
        </div>
      </Show>
      <div class={props.title || props.aside ? 'mt-1.5' : undefined}>{props.children}</div>
    </section>
  )
}

/** Two cards side by side — the work list and the one object the page is
 *  about (wide/narrow), or two equal halves. Stacks on small screens. */
export function Split(props: { children: JSX.Element; even?: boolean; mid?: boolean; class?: string }) {
  return (
    <div class={cn('mb-3 grid gap-2.5', props.even ? 'lg:grid-cols-2' : props.mid ? 'lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]', props.class)}>
      {props.children}
    </div>
  )
}

/** A divided row. Lists end on a rule, as the mockups draw them. */
export function Row(props: { children: JSX.Element; class?: string }) {
  return <div class={cn('flex items-center gap-2.5 border-t border-border py-2 text-sm last:border-b', props.class)}>{props.children}</div>
}

/** The common row: pill, title, one line under it, one control. */
export function ItemRow(props: {
  pill?: { tone?: Tone; text: string } | null
  title: JSX.Element
  sub?: JSX.Element
  action?: JSX.Element
  class?: string
}) {
  return (
    <Row class={props.class}>
      <Show when={props.pill}>{pill => <Pill tone={pill().tone}>{pill().text}</Pill>}</Show>
      <div class="min-w-0 flex-1">
        <p class="m-0 truncate text-sm text-foreground">{props.title}</p>
        <Show when={props.sub}><p class="m-0 mt-0.5 text-xs text-muted-foreground/70">{props.sub}</p></Show>
      </div>
      <Show when={props.action}>{props.action}</Show>
    </Row>
  )
}

/** A label and its value on one row, the value right-aligned — "Paid
 *  tickets · 1", "Tracked ticket link · done". `value` may be a Pill. */
export function StatRow(props: { label: JSX.Element; value: JSX.Element; class?: string }) {
  return (
    <Row class={cn('text-xs', props.class)}>
      <span class="min-w-0 flex-1 text-foreground">{props.label}</span>
      {props.value}
    </Row>
  )
}

/** The last row of a list: how many more, and where they are. */
export function MoreRow(props: { text: JSX.Element; link: JSX.Element }) {
  return (
    <Row>
      <span class="flex-1 text-xs text-muted-foreground">{props.text}</span>
      <span class="text-xs text-info-foreground">{props.link}</span>
    </Row>
  )
}

/** The small outlined control inside a row. Renders a link when `to` is
 *  set, an external anchor for `href`, a button otherwise. */
export function Act(props: {
  children: JSX.Element
  to?: string
  params?: Record<string, string>
  search?: Record<string, string>
  hash?: string
  href?: string
  onClick?: () => void
  disabled?: boolean
  primary?: boolean
}) {
  const cls = () => cn(
    'inline-flex shrink-0 items-center rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-50',
    props.primary ? 'border-foreground bg-foreground text-background hover:bg-foreground/90' : 'border-border text-foreground hover:bg-muted',
  )
  return (
    <Show when={props.to} fallback={
      <Show when={httpUrl(props.href)} fallback={
        <button type="button" class={cls()} disabled={props.disabled} onClick={() => props.onClick?.()}>{props.children}</button>
      }>
        <a href={props.href} target="_blank" rel="noreferrer" class={cls()}>{props.children}</a>
      </Show>
    }>
      <Link to={props.to!} params={props.params} search={props.search} hash={props.hash} class={cls()}>{props.children}</Link>
    </Show>
  )
}

/** A labelled share bar — label, track, value. */
export function Bar(props: { label: JSX.Element; value: number | null | undefined; max: number; tone?: Tone; display?: string; labelWidth?: 'sm' | 'md' }) {
  const width = () => (props.value == null || props.max <= 0 ? 0 : Math.max(2, Math.round((props.value / props.max) * 100)))
  const fill: Record<Tone, string> = {
    good: 'bg-success-foreground', warn: 'bg-warning-foreground', bad: 'bg-error-foreground', muted: 'bg-muted-foreground/60', accent: 'bg-info-foreground/75',
  }
  return (
    <Row class="text-xs">
      <span class={cn('shrink-0 truncate text-foreground', props.labelWidth === 'md' ? 'w-32' : 'w-24')}>{props.label}</span>
      <div class="h-2 flex-1 overflow-hidden rounded bg-muted/55">
        <div class={cn('h-full rounded', fill[props.tone ?? 'accent'])} style={{ width: `${width()}%` }} />
      </div>
      <span class="w-12 shrink-0 text-right tabular-nums text-foreground">{props.display ?? (props.value == null ? '—' : props.value.toLocaleString())}</span>
    </Row>
  )
}

/** The countdown ring of the mockups: a share of a circle and a short label. */
export function Ring(props: { share: number; label: string; tone?: Tone; title?: string }) {
  const pct = () => Math.max(0, Math.min(100, Math.round(props.share * 100)))
  const stroke: Record<Tone, string> = {
    good: 'stroke-success-foreground', warn: 'stroke-warning-foreground', bad: 'stroke-error-foreground', muted: 'stroke-muted-foreground', accent: 'stroke-info-foreground',
  }
  return (
    <svg width="56" height="56" viewBox="0 0 36 36" role="img" aria-label={props.title ?? props.label} class="shrink-0">
      <circle cx="18" cy="18" r="15.9" fill="none" class="stroke-border" stroke-width="3" />
      <circle cx="18" cy="18" r="15.9" fill="none" class={stroke[props.tone ?? 'accent']} stroke-width="3" stroke-dasharray={`${pct()} ${100 - pct()}`} transform="rotate(-90 18 18)" />
      <text x="18" y="21" text-anchor="middle" class="fill-foreground" style={{ 'font-size': '9px' }}>{props.label}</text>
    </svg>
  )
}

/** A step list: done, waiting (with a date), or due. */
export function Steps(props: { steps: { label: JSX.Element; state: 'done' | 'due' | 'waiting' | 'active' | 'skipped' | string; note?: string }[] }) {
  return (
    <ul class="m-0 list-none p-0 text-xs leading-7">
      <For each={props.steps}>{step => (
        <li class="flex items-center gap-2">
          <span class={cn('inline-block size-2.5 shrink-0 rounded-full border',
            step.state === 'done' ? 'border-success-foreground bg-success-foreground'
            : step.state === 'due' ? 'border-warning-foreground bg-warning-foreground/40'
            : step.state === 'active' ? 'border-info-foreground bg-info-foreground/40'
            : 'border-muted-foreground/60')} aria-hidden="true" />
          <span class={cn('min-w-0 flex-1 truncate', step.state === 'done' ? 'text-foreground' : 'text-foreground')}>
            {step.label}{step.note ? <span class="text-muted-foreground"> · {step.note}</span> : null}
          </span>
        </li>
      )}</For>
    </ul>
  )
}

export type WorkArea = { id: string; label: string; count?: number | null }

/** The page's deeper surfaces, as the mockups end: "Work areas" and a row
 *  of buttons. Nothing is open until one is pressed; `?tab=` opens one from
 *  a link and stays in the URL, so every old deep link still lands. */
export function useWorkAreas(ids: string[], param = 'tab') {
  const navigate = useNavigate()
  const search = useRouterState({ select: s => s.location.search as Record<string, unknown> })
  const initial = new URLSearchParams(window.location.search).get(param)
  // A page whose only content sits inside a single work area opens it by
  // default — otherwise the page renders nothing until the toggle is found.
  // Toggling still closes it for the session (explicit choice wins).
  const fallback = ids.length === 1 ? ids[0] ?? null : null
  // Only a *valid* `?tab=` counts as an explicit choice — a stale or mistyped
  // value must fall through to the default, not pin every area shut (a
  // `?tab=junk` link used to render the single-area pages completely empty).
  const [explicit, setExplicit] = createSignal(initial != null && ids.includes(initial))
  const [active, setActive] = createSignal<string | null>(initial && ids.includes(initial) ? initial : fallback)
  createEffect(() => {
    const t = search()?.[param]
    const next = typeof t === 'string' && ids.includes(t) ? t : explicit() ? null : fallback
    untrack(() => { if (next !== active()) setActive(next) })
  })
  const open = (id: string | null) => {
    setExplicit(true)
    setActive(id)
    // `hash: true` keeps `#needs-you&action=<id>`-style deep links in the URL
    // across work-area toggles — the address stays copyable and back/forward
    // navigation still carries the anchor. `resetScroll: false` +
    // `hashScrollIntoView: false` keep the viewport put: a `?tab=` write is not
    // a page change, so the default scroll-to-top (and re-scroll to the kept
    // hash) would read as the page reloading.
    // navigate reads the router's signals synchronously, so an effect that
    // calls `open` would subscribe to every router update and re-run on each
    // navigation it causes (the #149 attention freeze). `untrack` keeps a
    // caller's tracking limited to what it reads itself.
    untrack(() => {
      void navigate({ to: '.', hash: true, resetScroll: false, hashScrollIntoView: false, search: (prev: Record<string, unknown>) => {
        const out = { ...prev }
        if (id) out[param] = id
        else delete out[param]
        return out
      }, replace: true } as never)
    })
  }
  return { active, open, toggle: (id: string) => open(active() === id ? null : id) }
}

export function WorkAreas(props: { areas: WorkArea[]; active: string | null; onToggle: (id: string) => void; label?: string }) {
  return (
    <div class="flex flex-wrap items-center gap-2" role="tablist">
      <span class="mr-1 text-xs text-muted-foreground">{props.label ?? 'Work areas'}</span>
      <For each={props.areas}>{area => (
        <button
          type="button"
          role="tab"
          id={`tab-${area.id}`}
          aria-controls={`tabpanel-${area.id}`}
          aria-selected={props.active === area.id}
          class={cn('rounded-md border px-2.5 py-1 text-xs transition-colors',
            props.active === area.id ? 'border-foreground bg-foreground text-background' : 'border-border text-foreground hover:bg-muted')}
          onClick={() => props.onToggle(area.id)}
        >
          {area.label}{area.count != null ? ` · ${area.count}` : ''}
        </button>
      )}</For>
    </div>
  )
}

/** The open work area's content, under the buttons. The Suspense boundary is
 *  load-bearing: a panel's first `useQuery` mount suspends, and without a
 *  boundary here the fallback it trips is the route-level SkeletonPage — the
 *  whole page, header included, blinks on every tab switch. Keeping it inside
 *  the panel means only the tab's own area shows the skeleton. */
export function WorkAreaPanel(props: { id: string; active: string | null; children: JSX.Element }) {
  return (
    <Show when={props.active === props.id}>
      <div class="mt-4 border-t border-border pt-4" role="tabpanel" id={`tabpanel-${props.id}`} aria-labelledby={`tab-${props.id}`} data-slot="tab-panel">
        <Suspense fallback={<SkeletonTabContent />}>{props.children}</Suspense>
      </div>
    </Show>
  )
}

/** A quiet one-line note under a block — "Arrivals stopped 9 days ago". */
export function Note(props: { children: JSX.Element; class?: string }) {
  return <p class={cn('m-0 mt-2 text-xs text-muted-foreground/70', props.class)}>{props.children}</p>
}

/** A bare icon control — the header's refresh. */
export function IconAct(props: { children: JSX.Element; onClick: () => void; disabled?: boolean; label: string; title?: string }) {
  return (
    <button type="button" class="text-muted-foreground hover:text-foreground disabled:opacity-50" onClick={() => props.onClick()} disabled={props.disabled} aria-label={props.label} title={props.title ?? props.label}>
      {props.children}
    </button>
  )
}

/** A whole row that selects something — the Needs you wave list. */
export function RowButton(props: { children: JSX.Element; selected?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      class={cn('flex w-full items-center gap-2.5 border-t border-border px-2 py-2 text-left last:border-b', props.selected && 'rounded-md border-transparent bg-muted/55')}
      onClick={() => props.onClick()}
    >
      {props.children}
    </button>
  )
}
