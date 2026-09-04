import type { Component } from 'solid-js'

// Inline button spinner. Sits next to the "Doing…" text so the button
// shows progress instead of just blinking disabled. Reuses the existing
// `spin` keyframe from styles.css.
export const Spinner: Component<{ size?: number }> = (props) => (
  <span
    class="btn-spinner"
    style={{ width: `${props.size ?? 12}px`, height: `${props.size ?? 12}px` }}
    aria-hidden="true"
  />
)
