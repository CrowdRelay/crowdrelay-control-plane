import { Show, createMemo, For, type JSX } from 'solid-js'
import { useQueryClient, useIsFetching } from '@tanstack/solid-query'
import { REFRESH_INTERVALS, refreshInterval, setRefreshInterval, triggerRefresh } from '../lib/refresh'
import { relativeTime } from '../lib/format'
import { NativeSelect } from './ui/native-select'

// Grafana-style refresh control: an interval dropdown + a manual refresh button.
// Sits in the topbar so every page inherits it. The interval drives
// `refetchInterval` on all queries via the `refreshInterval()` signal.
//
// The spinner reflects real query fetching state from the QueryClient, so the
// operator sees when data is actually being loaded — not just when a button
// was clicked. The `loading` prop is kept as an override for pages that want
// to force the spinner for non-query work (e.g. a mutation in flight).

export function RefreshControl(props: {
  updatedAt?: number
  loading?: boolean
}): JSX.Element {
  const queryClient = useQueryClient()
  const currentLabel = createMemo(() => {
    const ms = refreshInterval()
    const found = REFRESH_INTERVALS.find(r => r.ms === ms)
    return found?.label ?? 'Off'
  })
  // Show the spinner when any query is fetching, or when the page explicitly
  // passes loading=true (e.g. for a mutation). This gives the operator real
  // feedback that data is being loaded, not just that a button was pressed.
  // useIsFetching() is reactive — queryClient.isFetching() is not, so the
  // spinner would get stuck without this hook.
  const fetchingCount = useIsFetching()
  const isFetching = () => fetchingCount() > 0
  const loading = () => props.loading || isFetching()

  return <div class="flex items-center gap-2.5 flex-shrink-0">
    <Show when={props.updatedAt != null}>
      <span class="text-sm text-muted-foreground whitespace-nowrap">Updated {relativeTime(props.updatedAt)}</span>
    </Show>
    <div>
      <NativeSelect value={refreshInterval()}
        onChange={(e) => setRefreshInterval(Number(e.currentTarget.value))}
        title="Auto-refresh interval"
        aria-label="Auto-refresh interval"
      >
        <For each={REFRESH_INTERVALS}>{r => (
          <option value={r.ms} selected={refreshInterval() === r.ms}>{r.label}</option>
        )}</For>
      </NativeSelect>
    </div>
    <button
      type="button"
      class="inline-flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:bg-surface-1 hover:text-foreground transition-all duration-150 hover:rotate-180 active:scale-95"
      onClick={() => triggerRefresh()}
      disabled={loading()}
      title="Refresh now"
      aria-label="Refresh"
    >
      <Show when={!loading()} fallback={
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
      }>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
      </Show>
    </button>
  </div>
}
