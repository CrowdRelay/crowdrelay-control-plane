import { ErrorBoundary, createEffect, type Component, type JSX } from 'solid-js'
import { Button } from './ui/button'
import { ErrorCard } from './layout'

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
    return <ErrorCard>
      <strong>{props.title ?? 'Something failed to render'}</strong>
      <p>The rest of the Control Plane is unaffected. Retry re-renders this section.</p>
      <small class="font-mono">{detail}</small>
      <div class="mt-6 pt-4 border-t border-border-subtle flex items-center">
        <Button type="button" variant="ghost" size="sm" onClick={() => retry()}>Retry</Button>
      </div>
    </ErrorCard>
  }}>
    {props.children}
  </ErrorBoundary>
}
