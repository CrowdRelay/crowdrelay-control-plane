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
  return <div class="page-tabs">
    <For each={props.tabs}>{tab => (
      <button
        class="page-tab"
        classList={{ active: props.active === tab.id }}
        onClick={() => props.onChange(tab.id)}
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

/// Keep-mounted tab panel: lazy-mounts on first visit (so API requests
/// only fire when the tab is opened), then stays in the DOM with
/// `display:none` so re-entering is instant — no refetch, no blink.
/// This replaces the old `TabContent` which unmounted/remounted on
/// every switch, causing a full loading cycle + fade-in animation each
/// time.
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
    >
      <Suspense fallback={<SkeletonTabContent />}>
        {props.children}
      </Suspense>
    </div>
  </Show>
}

/// Tab state manager with lazy-mount tracking. The initial tab is
/// marked visited so its panel mounts immediately; subsequent tabs
/// mount on first open.
export function useTabPanels(initial: string) {
  const [activeTab, setActiveTab] = createSignal(initial)
  const [visited, setVisited] = createSignal<Set<string>>(new Set([initial]))
  const switchTab = (id: string) => {
    setActiveTab(id)
    setVisited(prev => prev.has(id) ? prev : new Set([...prev, id]))
  }
  return { activeTab, switchTab, visited, isVisited: (id: string) => visited().has(id) }
}

export function useTabs(initial: string) {
  const [activeTab, setActiveTab] = createSignal(initial)
  return { activeTab, setActiveTab }
}
