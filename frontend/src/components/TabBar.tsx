import { For, Show, Suspense, createSignal, type Component, type JSX } from 'solid-js'
import { SkeletonTabContent } from './Skeleton'

export type Tab = {
  id: string
  label: string
  count?: () => number
  /// Optional leading glyph. Tabs read fine without one, so this stays
  /// optional rather than forcing an icon on every tab for symmetry.
  icon?: Component
}

export function TabBar(props: {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
}) {
  return <div class="page-tabs" role="tablist">
    <For each={props.tabs}>{tab => (
      <button
        class="page-tab"
        classList={{ active: props.active === tab.id }}
        onClick={() => props.onChange(tab.id)}
        role="tab"
        id={`tab-${tab.id}`}
        aria-selected={props.active === tab.id}
        aria-controls={`tabpanel-${tab.id}`}
      >
        <Show when={tab.icon}>{icon => icon()({})}</Show>
        {tab.label}
        <Show when={tab.count && tab.count() > 0}>
          <span class="page-tab-count">{tab.count!()}</span>
        </Show>
      </button>
    )}</For>
  </div>
}

/// Keep-mounted tab panel with lazy mounting and local Suspense.
///
/// Tabs mount on first visit (so HTTP requests only fire when the tab is
/// opened), then stay in the DOM with `display:none` so re-entering is
/// instant — no refetch, no blink.
///
/// A local `<Suspense>` boundary catches any promise thrown during the
/// panel's initial mount and shows `SkeletonTabContent` inside the tab
/// content area — not the page-level skeleton. This keeps the page
/// header, tab bar, and persistent elements visible while a new tab's
/// data loads. Without this, a child that suspends would bubble up to
/// the Shell's `<Suspense fallback={<SkeletonPage />}>` and replace the
/// entire page with a skeleton, which looks like a full page refresh.
export function TabPanel(props: {
  active: string
  id: string
  visited: boolean
  children: JSX.Element
}) {
  return <Show when={props.visited}>
    <div
      class="page-tab-content"
      classList={{ 'tab-hidden': props.active !== props.id }}
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
}

/// Tab state manager with lazy-mount tracking. The initial tab is
/// marked visited so its panel mounts immediately; subsequent tabs
/// mount on first open. Each `TabPanel` has its own `<Suspense>`
/// boundary so the first open of a tab shows a local skeleton inside
/// the tab content area, not a page-wide skeleton.
export function useTabPanels(initial: string) {
  const [activeTab, setActiveTab] = createSignal(initial)
  const [visited, setVisited] = createSignal<Set<string>>(new Set([initial]))
  const switchTab = (id: string) => {
    setActiveTab(id)
    setVisited(prev => prev.has(id) ? prev : new Set([...prev, id]))
  }
  return { activeTab, switchTab, visited, isVisited: (id: string) => visited().has(id) }
}
