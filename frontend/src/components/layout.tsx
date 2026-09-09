import { For, Show, Suspense, createSignal, type Component, type JSX } from 'solid-js'
import { Card } from './ui/card'
import { CollapsibleSection as UICollapsible } from './ui/collapsible'
import { cn } from '../lib/cn'

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
        <h1 class="text-2xl font-bold tracking-tight text-foreground mt-1">{props.title}</h1>
        <Show when={props.description}>
          <p class="text-sm text-muted-foreground mt-1.5 leading-relaxed">{props.description}</p>
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
  tone?: 'default' | 'good'
  class?: string
}) {
  return (
    <Card class={cn('p-4', props.tone === 'good' && 'border-success/30', props.class)}>
      <div class="text-xs text-muted-foreground">{props.label}</div>
      <div class="text-2xl font-bold tabular-nums text-foreground mt-1">{props.value}</div>
      <Show when={props.sub}>
        <div class="text-xs text-muted-foreground mt-1">{props.sub}</div>
      </Show>
    </Card>
  )
}

export function KpiStrip(props: { children: JSX.Element; class?: string }) {
  return (
    <div class={cn('grid grid-cols-2 md:grid-cols-4 gap-3 mb-5', props.class)}>
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
}) {
  return (
    <Card elevated={props.elevated} class={cn('p-4', props.class)}>
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

export function PageShell(props: { children: JSX.Element; class?: string }) {
  return (
    <section class={cn('mx-auto max-w-7xl px-6 py-6 pb-24', props.class)}>
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
        <Suspense fallback={<div class="py-8 text-sm text-muted-foreground">Loading…</div>}>
          {props.children}
        </Suspense>
      </div>
    </Show>
  )
}

export function useTabPanels(initial: string) {
  const [activeTab, setActiveTab] = createSignal(initial)
  const [visited, setVisited] = createSignal<Set<string>>(new Set([initial]))
  const switchTab = (id: string) => {
    setActiveTab(id)
    setVisited(prev => prev.has(id) ? prev : new Set([...prev, id]))
  }
  return { activeTab, switchTab, visited, isVisited: (id: string) => visited().has(id) }
}

// ─── ErrorCard ─────────────────────────────────────────────────────────
// Replaces the hand-rolled `.error-card` CSS class.

export function ErrorCard(props: { children: JSX.Element; class?: string }) {
  return (
    <div class={cn('rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive', props.class)} role="alert">
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
        </div>
      </div>
      <Show when={props.action}>
        {props.action}
      </Show>
    </div>
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
      <Show when={props.detail}>
        <div class="mt-2 text-xs text-muted-foreground space-y-0.5">{props.detail}</div>
      </Show>
    </Card>
  )
}
