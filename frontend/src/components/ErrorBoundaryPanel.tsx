import { ErrorBoundary, createEffect, type Component, type JSX } from 'solid-js'
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
    console.error('[boundary]', error instanceof Error ? error.stack : error)
    return <ErrorCard
      title={props.title ?? "This section couldn't be displayed"}
      error={error}
      onRetry={() => retry()}
      recovery="The rest of the page still works. Try again to reload this section."
    >
      Something went wrong while showing it.
    </ErrorCard>
  }}>
    {props.children}
  </ErrorBoundary>
}
