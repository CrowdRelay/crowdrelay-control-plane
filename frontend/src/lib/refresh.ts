import { createSignal, onCleanup } from 'solid-js'

// Global refresh control — Grafana-style. One interval selector in the topbar
// drives every query on the page. 0 = manual only (no auto-refresh).
//
// A single timer here fires `triggerRefresh()` on the chosen interval. Every
// query depends on `refreshTick` as part of its query key, so one tick refetches
// all queries in lockstep — no per-query timer drift, no independent polling.

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
const [tick, setTick] = createSignal(0)

export { setIntervalMs as setRefreshInterval }

export const refreshInterval = intervalMs

/** Monotonic tick — increment on every interval fire and on manual refresh.
 * Include in query keys so a tick change triggers refetch. */
export const refreshTick = tick

/** Trigger a global refetch — increments the tick signal. */
export function triggerRefresh() {
  setTick(t => t + 1)
}

// Single global timer. Started once, lives for app lifetime. When interval is
// 0 (Off) the timer is cleared and no ticking happens.
let timerId: ReturnType<typeof setInterval> | null = null

function clearTimer() {
  if (timerId !== null) {
    clearInterval(timerId)
    timerId = null
  }
}

function applyInterval(ms: number) {
  clearTimer()
  if (ms > 0) {
    timerId = setInterval(() => triggerRefresh(), ms)
  }
}

// Reactively apply interval changes. This runs once at module load and again
// whenever setRefreshInterval is called.
import { createEffect } from 'solid-js'
createEffect(() => applyInterval(intervalMs()))

// Clean up on HMR / page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', clearTimer)
}
