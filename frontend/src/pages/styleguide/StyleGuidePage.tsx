import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js'
import {
  RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter,
} from '@tanstack/solid-router'
import { ChevronLeft, ChevronRight, Search } from 'lucide-solid'
import { Badge } from '~/components/app/badge'
import { Input } from '~/components/ui/input'
import { Kbd } from '~/components/ui/kbd'
import { NativeSelect } from '~/components/ui/native-select'
import { Pill } from '~/components/ui/dash'
import { ModeToggle } from '~/components/ModeToggle'
import { ToastContainer } from '~/components/app/toast'
import { cn } from '~/lib/cn'
import { foundationEntries } from './foundations'
import { layoutEntries, SAMPLE_SLUG } from './layout-docs'
import { coreEntries } from './components-core'
import { dataEntries } from './components-data'
import { overviewEntries, patternEntries } from './patterns'
import { inventoryEntries } from './inventory'
import { Changelog, UpdatedLine } from './history'
import type { DocEntry, Status, TabId } from './types'

/**
 * Style guide — the console's design system, rendered by its own code.
 *
 * Dev-only: `main.tsx` mounts it at `/styleguide` (and `/style-guide`) when
 * `import.meta.env.DEV` is true and the host is localhost, so a production
 * build never includes it. It sits outside the login gate and never issues
 * a query.
 *
 * Navigation is the URL hash — `#components/button` — so every page is
 * linkable and the browser's back button works. Components that need the
 * app router (sidebar links, DashHeader's back link, Act with `to`) get a
 * private in-memory router: clicking them moves that router, never the page.
 *
 * Content lives in one file per tab; each exports `DocEntry[]` (types.ts).
 * To document a new component, add an entry — see Overview → Adding a component.
 */

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'foundations', label: 'Foundations' },
  { id: 'layout', label: 'Layout' },
  { id: 'components', label: 'Components' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'inventory', label: 'Inventory' },
]

const STATIC_ENTRIES: DocEntry[] = [
  ...overviewEntries, ...foundationEntries, ...layoutEntries, ...coreEntries, ...dataEntries, ...patternEntries,
]
const ENTRIES: DocEntry[] = [...STATIC_ENTRIES, ...inventoryEntries(() => STATIC_ENTRIES)]

/** Every entry, for the coverage check and the inventory. */
export const STYLE_GUIDE_ENTRIES = ENTRIES

/** The files a page's changelog follows. */
const historyFiles = (e: DocEntry) => e.history ?? e.sources ?? []

const STATUS_TONE: Record<Status, 'good' | 'warn' | 'accent'> = { stable: 'good', legacy: 'warn', planned: 'accent' }

function parseHash(): { tab: TabId; id: string } {
  const raw = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''))
  const [a, b] = raw.split('/')
  const byPair = ENTRIES.find(e => e.tab === a && e.id === b)
  if (byPair) return { tab: byPair.tab, id: byPair.id }
  // `#colors` (the old one-page anchors) or a bare id.
  const byId = ENTRIES.find(e => e.id === (b ?? a))
  if (byId) return { tab: byId.tab, id: byId.id }
  const tab = TABS.find(t => t.id === a)?.id ?? 'overview'
  return { tab, id: ENTRIES.find(e => e.tab === tab)!.id }
}

function GuideApp() {
  const [loc, setLoc] = createSignal(parseHash())
  const [query, setQuery] = createSignal('')
  let scroller!: HTMLDivElement
  let search!: HTMLInputElement

  onMount(() => {
    const onHash = () => setLoc(parseHash())
    // `/` focuses search, as on most docs sites.
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.closest('input, textarea, select, [contenteditable]'))
      if (e.key === '/' && !typing) { e.preventDefault(); search.focus() }
    }
    window.addEventListener('hashchange', onHash)
    document.addEventListener('keydown', onKey)
    onCleanup(() => { window.removeEventListener('hashchange', onHash); document.removeEventListener('keydown', onKey) })
  })

  const entry = createMemo(() => ENTRIES.find(e => e.tab === loc().tab && e.id === loc().id)!)
  const tabEntries = createMemo(() => ENTRIES.filter(e => e.tab === loc().tab))
  const groups = createMemo(() => {
    const out: { name: string; items: DocEntry[] }[] = []
    for (const e of tabEntries()) {
      const g = out.find(x => x.name === e.group) ?? (out.push({ name: e.group, items: [] }), out[out.length - 1]!)
      g.items.push(e)
    }
    return out
  })
  const results = createMemo(() => {
    const q = query().trim().toLowerCase()
    if (!q) return []
    return ENTRIES.filter(e => `${e.title} ${e.summary} ${e.keywords ?? ''} ${e.group} ${(e.sources ?? []).join(' ')}`.toLowerCase().includes(q))
  })
  const index = () => tabEntries().findIndex(e => e.id === loc().id)
  const prev = () => tabEntries()[index() - 1]
  const next = () => tabEntries()[index() + 1]
  const href = (e: DocEntry) => `#${e.tab}/${e.id}`
  const tabCount = (t: TabId) => ENTRIES.filter(e => e.tab === t).length

  // The page scrolls inside `scroller`, not the window, so scroll it directly
  // and leave room for the sticky header.
  const showChangelog = () => {
    const el = document.getElementById('sg-changelog')
    if (!el) return
    const top = scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 120
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    scroller.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' })
  }

  createEffect(on(() => `${loc().tab}/${loc().id}`, () => {
    scroller?.scrollTo({ top: 0 })
    document.title = `${entry().title} · Style guide`
  }))

  const NavItem = (p: { e: DocEntry; showTab?: boolean }) => (
    <a
      href={href(p.e)}
      onClick={() => setQuery('')}
      aria-current={p.e.tab === loc().tab && p.e.id === loc().id ? 'page' : undefined}
      class={cn(
        'flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        p.e.tab === loc().tab && p.e.id === loc().id ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      )}
    >
      <span class="min-w-0 truncate">{p.e.title}<Show when={p.showTab}><span class="ml-1.5 text-xs capitalize text-muted-foreground">· {p.e.tab}</span></Show></span>
      <Show when={p.e.status && p.e.status !== 'stable'}><Pill tone={STATUS_TONE[p.e.status!]} class="px-1.5 text-xs">{p.e.status}</Pill></Show>
    </a>
  )

  return (
    <div ref={scroller} class="h-viewport overflow-y-auto bg-background text-foreground">
      <header class="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
        <div class="mx-auto flex h-14 max-w-screen-2xl items-center gap-3 px-4 md:px-6">
          <a href="#overview/introduction" class="flex shrink-0 items-center gap-2">
            <span class="flex size-7 items-center justify-center rounded-md bg-foreground text-xs font-bold text-background">CR</span>
            <span class="hidden text-sm font-semibold sm:inline">Design system</span>
          </a>
          <Badge variant="warning" class="hidden sm:inline-flex">localhost only</Badge>
          <div class="relative ml-auto w-full max-w-xs">
            <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={search}
              type="search"
              placeholder="Search the guide…"
              aria-label="Search the style guide"
              class="h-9 pl-8 pr-8"
              value={query()}
              onInput={e => setQuery(e.currentTarget.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setQuery('')
                if (e.key === 'Enter' && results()[0]) { window.location.hash = href(results()[0]!); setQuery('') }
              }}
            />
            <Kbd class="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 border bg-background sm:inline-flex">/</Kbd>
          </div>
          <ModeToggle />
        </div>
        <nav aria-label="Style guide sections" class="mx-auto max-w-screen-2xl overflow-x-auto px-4 scrollbar-none md:px-6">
          <ul class="m-0 flex list-none gap-1 p-0">
            <For each={TABS}>{t => (
              <li>
                <a
                  href={`#${t.id}`}
                  aria-current={loc().tab === t.id ? 'page' : undefined}
                  class={cn(
                    'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors',
                    loc().tab === t.id ? 'border-foreground font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}<span class="text-xs tabular-nums text-muted-foreground">{tabCount(t.id)}</span>
                </a>
              </li>
            )}</For>
          </ul>
        </nav>
      </header>

      <div class="mx-auto flex max-w-screen-2xl gap-10 px-4 md:px-6">
        <aside class="sticky top-28 hidden max-h-[calc(100dvh-7rem)] w-60 shrink-0 overflow-y-auto py-6 lg:block" aria-label="Pages in this section">
          <Show when={query().trim()} fallback={
            <For each={groups()}>{g => (
              <div class="mb-5">
                <p class="m-0 mb-1 px-2 text-xs font-medium text-muted-foreground">{g.name}</p>
                <For each={g.items}>{e => <NavItem e={e} />}</For>
              </div>
            )}</For>
          }>
            <p class="m-0 mb-1 px-2 text-xs font-medium text-muted-foreground">{results().length} {results().length === 1 ? 'result' : 'results'}</p>
            <For each={results()} fallback={<p class="m-0 px-2 text-sm text-muted-foreground">Nothing matches. Planned components live under Components → Planned.</p>}>
              {e => <NavItem e={e} showTab />}
            </For>
          </Show>
        </aside>

        <main class="min-w-0 flex-1 py-6 pb-24" id="sg-main">
          {/* Phones and tablets: the left nav as a picker; search results as a list. */}
          <div class="mb-6 lg:hidden">
            <Show when={query().trim()} fallback={
              <NativeSelect aria-label="Page" value={loc().id} onChange={e => { window.location.hash = `${loc().tab}/${e.currentTarget.value}` }}>
                <For each={groups()}>{g => <optgroup label={g.name}><For each={g.items}>{e => <option value={e.id}>{e.title}</option>}</For></optgroup>}</For>
              </NativeSelect>
            }>
              <div class="rounded-lg border border-border p-2"><For each={results()}>{e => <NavItem e={e} showTab />}</For></div>
            </Show>
          </div>

          <div class="mb-8 max-w-4xl">
            <p class="m-0 text-xs text-muted-foreground"><span class="capitalize">{entry().tab}</span> · {entry().group}</p>
            <div class="mt-1 flex flex-wrap items-center gap-3">
              <h1 class="m-0 text-2xl font-semibold tracking-tight">{entry().title}</h1>
              <Show when={entry().status}>{s => <Pill tone={STATUS_TONE[s()]} class="capitalize">{s()}</Pill>}</Show>
            </div>
            <div class="mt-2"><Show when={entry()} keyed>{e => (
              <UpdatedLine files={historyFiles(e)} onShowChangelog={showChangelog} />
            )}</Show></div>
            <p class="m-0 mt-2 text-base leading-relaxed text-muted-foreground">{entry().summary}</p>
            <Show when={entry().replacedBy}><p class="m-0 mt-2 text-sm text-warning-foreground">Replaced by {entry().replacedBy}.</p></Show>
            <Show when={entry().sources?.length}>
              <div class="mt-3 flex flex-wrap gap-1.5">
                <For each={entry().sources}>{s => <code class="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground">src/{s}</code>}</For>
              </div>
            </Show>
          </div>

          {/* Keyed so each page mounts fresh — specimens own local state. */}
          <Show when={entry()} keyed>{e => (
            <div class="flex flex-col gap-10">
              {e.render()}
              <Changelog id="sg-changelog" files={historyFiles(e)} />
            </div>
          )}</Show>

          <nav class="mt-16 grid gap-3 border-t border-border pt-6 sm:grid-cols-2" aria-label="Previous and next page">
            <div>
              <Show when={prev()}>{p => (
                <a href={href(p())} class="flex flex-col rounded-lg border border-border p-4 transition-colors hover:bg-muted/40">
                  <span class="flex items-center gap-1 text-xs text-muted-foreground"><ChevronLeft class="size-3.5" /> Previous</span>
                  <span class="mt-1 text-sm font-medium">{p().title}</span>
                </a>
              )}</Show>
            </div>
            <div>
              <Show when={next()}>{n => (
                <a href={href(n())} class="flex flex-col items-end rounded-lg border border-border p-4 text-right transition-colors hover:bg-muted/40">
                  <span class="flex items-center gap-1 text-xs text-muted-foreground">Next <ChevronRight class="size-3.5" /></span>
                  <span class="mt-1 text-sm font-medium">{n().title}</span>
                </a>
              )}</Show>
            </div>
          </nav>
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}

const rootRoute = createRootRoute({ component: GuideApp })
const anyRoute = createRoute({ getParentRoute: () => rootRoute, path: '$', component: () => null })
const router = createRouter({
  routeTree: rootRoute.addChildren([anyRoute]),
  history: createMemoryHistory({ initialEntries: [`/tenants/${SAMPLE_SLUG}/operations`] }),
})

export default function StyleGuidePage() {
  return <RouterProvider router={router} />
}
