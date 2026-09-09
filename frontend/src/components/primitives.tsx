import { For, Show, type Component, type JSX } from 'solid-js'

// ─── KpiCard ────────────────────────────────────────────────────────────
// The KPI tile was hand-copied at every call site, so the strips drifted:
// two class families, two label sizes, tone classes applied inconsistently.
// This is the one shape. `compact` is the dense 7-across operations strip.

export const KpiCard: Component<{
  label: string
  value: JSX.Element
  sub?: JSX.Element
  subClass?: string
  tone?: 'good' | 'warn' | 'bad' | 'muted'
  compact?: boolean
}> = (props) => (
  <div
    class={props.compact ? 'ops-kpi-card' : 'kpi-card'}
    classList={{ [`tone-${props.tone}`]: !!props.tone }}
  >
    <span class={props.compact ? 'ops-kpi-label' : 'kpi-label'}>{props.label}</span>
    <strong>{props.value}</strong>
    <Show when={props.sub != null}>
      <small class={props.subClass}>{props.sub}</small>
    </Show>
  </div>
)

// ─── DataRow ────────────────────────────────────────────────────────────
// Compact aligned row for dense lists. Label on left, value on right.
// Used for objectives, signals, recent decisions, telemetry rows.

export const DataRow: Component<{
  label: JSX.Element
  value?: JSX.Element
  children?: JSX.Element
  class?: string
}> = (props) => (
  <div class={`ui-data-row ${props.class ?? ''}`}>
    <span class="ui-data-row-label">{props.label}</span>
    <Show when={props.value}>
      <span class="ui-data-row-value">{props.value}</span>
    </Show>
    <Show when={props.children}>
      <div class="ui-data-row-content">{props.children}</div>
    </Show>
  </div>
)

// ─── Tabs ───────────────────────────────────────────────────────────────
// Flat segmented navigation. Not glass — solid surface with active state.

export const Tabs: Component<{
  tabs: Array<{ id: string; label: string }>
  active: string
  onChange: (id: string) => void
  class?: string
}> = (props) => (
  <div class={`ui-tabs ${props.class ?? ''}`}>
    <For each={props.tabs}>{(tab) => (
      <button
        class="ui-tab"
        classList={{ active: props.active === tab.id }}
        onClick={() => props.onChange(tab.id)}
      >
        {tab.label}
      </button>
    )}</For>
  </div>
)

// ─── EmptyState ─────────────────────────────────────────────────────────
// Icon + message + optional CTA. Used for empty/loading/error states.

export const EmptyState: Component<{
  icon?: JSX.Element
  title: string
  message?: string
  action?: JSX.Element
  class?: string
}> = (props) => (
  <div class={`ui-empty-state ${props.class ?? ''}`}>
    <Show when={props.icon}>
      <div class="ui-empty-state-icon">{props.icon}</div>
    </Show>
    <strong class="ui-empty-state-title">{props.title}</strong>
    <Show when={props.message}>
      <p class="ui-empty-state-message">{props.message}</p>
    </Show>
    <Show when={props.action}>
      <div class="ui-empty-state-action">{props.action}</div>
    </Show>
  </div>
)

// ─── Panel ──────────────────────────────────────────────────────────────
// Bordered container for genuinely grouped info. Heavier than Surface,
// lighter than a card. Has optional header.

export const Panel: Component<{
  title?: string
  class?: string
  children: JSX.Element
}> = (props) => (
  <div class={`ui-panel ${props.class ?? ''}`}>
    <Show when={props.title}>
      <div class="ui-panel-head">{props.title}</div>
    </Show>
    <div class="ui-panel-body">{props.children}</div>
  </div>
)
