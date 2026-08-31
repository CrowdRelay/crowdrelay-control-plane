import { For, Show, createSignal, type Component, type JSX } from 'solid-js'

export type Tab = {
  id: string
  label: string
  count?: () => number
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
        {tab.label}
        <Show when={tab.count && tab.count() > 0}>
          <span class="page-tab-count">{tab.count!()}</span>
        </Show>
      </button>
    )}</For>
  </div>
}

export function TabContent(props: { active: string; id: string; children: JSX.Element }) {
  return <Show when={props.active === props.id}>
    <div class="page-tab-content">{props.children}</div>
  </Show>
}

export function useTabs(initial: string) {
  const [activeTab, setActiveTab] = createSignal(initial)
  return { activeTab, setActiveTab }
}
