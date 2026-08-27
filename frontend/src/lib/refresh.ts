import { createSignal } from 'solid-js'

// Global refresh control — Grafana-style. One interval selector in the topbar
// drives every query on the page. 0 = manual only (no auto-refresh).
//
// `tick` increments on every interval fire and on manual refresh, so queries
// can use it as a dependency to trigger refetch without per-query polling.
//
// `refetchInterval` returns the ms value for TanStack Query's refetchInterval,
// or `false` when auto-refresh is off.

export const REFRESH_INTERVALS: readonly { label: string; ms: number }[] = [
  { label: 'Off', ms: 0 },
  { label: '5s', ms: 5_000 },
  { label: '10s', ms: 10_000 },
  { label: '15s', ms: 15_000 },
  { label: '30s', ms: 30_000 },
  { label: '1m', ms: 60_000 },
  { label: '5m', ms: 300_000 },
] as const

const DEFAULT_MS = 0

const [intervalMs, setIntervalMs] = createSignal(DEFAULT_MS)
const [manualTick, setManualTick] = createSignal(0)

export { setIntervalMs as setRefreshInterval }

export const refreshInterval = intervalMs

export const refreshTick = manualTick

/** Trigger a global refetch — increments the tick signal. */
export function triggerRefresh() {
  setManualTick(t => t + 1)
}
