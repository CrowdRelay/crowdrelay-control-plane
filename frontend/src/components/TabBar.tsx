import { For, Show, createSignal, type Component, type JSX } from 'solid-js'

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

/// Keep-mounted tab panel: mounts when `visited` is true (either on
/// first open with lazy mounting, or immediately with eager mounting),
/// then stays in the DOM with `display:none` so re-entering is instant
/// — no refetch, no blink. This replaces the old `TabContent` which
/// unmounted/remounted on every switch, causing a full loading cycle
/// + fade-in animation each time.
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
      {props.children}
    </div>
  </Show>
}

/// Tab state manager with mount tracking.
///
/// By default, tabs lazy-mount on first visit (so API requests only fire
/// when the tab is opened). Pass `allTabs` to eager-mount every panel
/// immediately — all queries fire on page load and tab switches are
/// instant because every panel is already in the DOM with its data
/// loaded or loading. Use eager mounting when the tabs share the same
/// route URL and the user expects content to appear without a loading
/// flash on first switch.
export function useTabPanels(initial: string, allTabs?: string[]) {
  const [activeTab, setActiveTab] = createSignal(initial)
  const [visited, setVisited] = createSignal<Set<string>>(
    new Set(allTabs ?? [initial]),
  )
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
