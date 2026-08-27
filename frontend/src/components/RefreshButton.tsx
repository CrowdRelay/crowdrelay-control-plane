import { Show, createMemo, type JSX } from 'solid-js'

// A refresh button with a live "last updated" indicator. Designed to sit in
// the page-head next to the title. Shows a relative timestamp ("3s ago")
// that updates on each render, and a spinner when a refetch is in flight.
//
// Usage:
//   <RefreshButton onClick={() => refetch()} loading={model.isFetching} updatedAt={model.dataUpdatedAt} />

const relativeTime = (timestamp: number | undefined): string => {
  if (!timestamp) return '—'
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

export function RefreshButton(props: {
  onClick: () => void
  loading: boolean
  updatedAt: number | undefined
}): JSX.Element {
  const label = createMemo(() => relativeTime(props.updatedAt))

  return <div class="refresh-control">
    <span class="refresh-timestamp">Updated {label()}</span>
    <button
      type="button"
      class="ghost refresh-btn"
      onClick={() => props.onClick()}
      disabled={props.loading}
      title="Refresh now"
      aria-label="Refresh"
    >
      <Show when={!props.loading} fallback={
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="spin"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
      }>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
      </Show>
    </button>
  </div>
}
