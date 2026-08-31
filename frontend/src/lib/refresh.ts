import { createSignal, createEffect, createRoot } from 'solid-js'

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

// An operations console that never refreshes shows yesterday's incident. The
// default is a slow tick rather than Off; the choice is remembered so an
// operator who deliberately parks on Off keeps it across reloads.
const DEFAULT_MS = 30_000
const STORAGE_KEY = 'refresh-interval-ms'

const storedInterval = (): number => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return DEFAULT_MS
    const parsed = Number(raw)
    return REFRESH_INTERVALS.some(option => option.ms === parsed) ? parsed : DEFAULT_MS
  } catch {
    return DEFAULT_MS
  }
}

const [intervalMs, setIntervalMs] = createSignal(storedInterval())
const [tick, setTick] = createSignal(0)

export const setRefreshInterval = (ms: number) => {
  setIntervalMs(ms)
  try { localStorage.setItem(STORAGE_KEY, String(ms)) } catch {}
}

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

// Reactively apply interval changes. Wrapped in createRoot so the effect
// has a proper owner and can be disposed on HMR / page unload.
createRoot(() => {
  createEffect(() => applyInterval(intervalMs()))
})

// Clean up on HMR / page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', clearTimer)
}
