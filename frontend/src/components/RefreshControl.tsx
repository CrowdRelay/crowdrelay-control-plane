import { Show, createMemo, For, type JSX } from 'solid-js'
import { REFRESH_INTERVALS, refreshInterval, setRefreshInterval, triggerRefresh } from '../lib/refresh'

// Grafana-style refresh control: an interval dropdown + a manual refresh button.
// Sits in the topbar so every page inherits it. The interval drives
// `refetchInterval` on all queries via the `refreshInterval()` signal.

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

export function RefreshControl(props: {
  updatedAt?: number
  loading?: boolean
}): JSX.Element {
  const currentLabel = createMemo(() => {
    const ms = refreshInterval()
    const found = REFRESH_INTERVALS.find(r => r.ms === ms)
    return found?.label ?? 'Off'
  })

  return <div class="refresh-control grafana-refresh">
    <Show when={props.updatedAt != null}>
      <span class="refresh-timestamp">Updated {relativeTime(props.updatedAt)}</span>
    </Show>
    <div class="refresh-interval-select">
      <select
        value={refreshInterval()}
        onChange={(e) => setRefreshInterval(Number(e.currentTarget.value))}
        title="Auto-refresh interval"
        aria-label="Auto-refresh interval"
      >
        <For each={REFRESH_INTERVALS}>{r => (
          <option value={r.ms} selected={refreshInterval() === r.ms}>{r.label}</option>
        )}</For>
      </select>
    </div>
    <button
      type="button"
      class="ghost refresh-btn"
      onClick={() => triggerRefresh()}
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
