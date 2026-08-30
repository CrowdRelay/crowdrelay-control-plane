import { Show, type Component, type JSX } from 'solid-js'

// ─── EmptyState ─────────────────────────────────────────────────────────
// Consistent empty/zero-data state across all panels. Prevents the
// "bare <p class=muted>" anti-pattern that looks unprofessional.
//
// Usage:
//   <EmptyState label="No objectives" hint="Declare a target to start tracking" />
//   <EmptyState icon={<SomeIcon />} label="No feeds connected" hint="Connect Spotify..." />

const DefaultIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 12h8" />
  </svg>
)

export const EmptyState: Component<{
  icon?: JSX.Element
  label: string
  hint?: string
  class?: string
}> = (props) => (
  <div class={`empty-state ${props.class ?? ''}`}>
    <div class="empty-state-icon">{props.icon ?? <DefaultIcon />}</div>
    <strong class="empty-state-label">{props.label}</strong>
    <Show when={props.hint}>
      <p class="empty-state-hint">{props.hint}</p>
    </Show>
  </div>
)
