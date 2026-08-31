import { ErrorBoundary, createEffect, type Component, type JSX } from 'solid-js'

// A render throw anywhere in a page used to blank the whole console: there was
// no boundary between the router outlet and the panels. This keeps the failure
// local, names it, and offers a retry that re-runs the subtree.
//
// `resetKey` re-arms the boundary when it changes (the route path, normally),
// so navigating away from a broken page is enough to recover.
export const ErrorBoundaryPanel: Component<{
  children: JSX.Element
  title?: string
  resetKey?: string
}> = (props) => {
  let reset: (() => void) | null = null
  let lastKey = props.resetKey

  createEffect(() => {
    const key = props.resetKey
    if (key !== lastKey) {
      lastKey = key
      reset?.()
    }
  })

  return <ErrorBoundary fallback={(error, retry) => {
    reset = retry
    const detail = error instanceof Error ? error.message : String(error ?? 'Unknown error')
    return <div class="error-card" role="alert">
      <strong>{props.title ?? 'Something failed to render'}</strong>
      <p>The rest of the Control Plane is unaffected. Retry re-renders this section.</p>
      <small class="mono">{detail}</small>
      <div class="form-actions">
        <button type="button" class="ghost" onClick={() => retry()}>Retry</button>
      </div>
    </div>
  }}>
    {props.children}
  </ErrorBoundary>
}
