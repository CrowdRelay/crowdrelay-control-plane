import { Show, For, type JSX } from 'solid-js'
import { useIsFetching } from '@tanstack/solid-query'
import { REFRESH_INTERVALS, refreshInterval, setRefreshInterval, triggerRefresh } from '../lib/refresh'
import { relativeTime } from '../lib/format'
import { NativeSelect } from './ui/native-select'
import { Button } from './app/button'
import { RefreshCw } from 'lucide-solid'

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
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="text-muted-foreground"
      onClick={() => triggerRefresh()}
      disabled={loading()}
      title="Refresh now"
      aria-label="Refresh"
    >
      <Show when={!loading()} fallback={
        <RefreshCw size={16} class="spin" aria-hidden="true" />
      }>
        <RefreshCw size={16} aria-hidden="true" />
      </Show>
    </Button>
  </div>
}
