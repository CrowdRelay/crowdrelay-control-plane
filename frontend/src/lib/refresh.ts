import { createSignal, createEffect, createRoot } from 'solid-js'
import { queryClient } from './queryClient'

// Global refresh control — Grafana-style. One interval selector in the topbar
// drives every query on the page. 0 = manual only (no auto-refresh).
//
// A single timer here fires `triggerRefresh()` on the chosen interval. The
// tick increments the `refreshTick` signal (used as a source by SolidJS
// `createResource` calls) and invalidates all TanStack Query caches, which
// refetches every mounted query in lockstep — no per-query timer drift, no
// independent polling.
//
// The tick is deliberately NOT part of any TanStack Query cache key. Embedding
// a monotonic counter in a query key created a new cache entry on every tick,
// and the 5-minute gcTime let them pile up: at 30s refresh over an hour that
// is 120 orphaned entries per query. It also split the cache by key identity
// — `['tenants', refreshTick()]` in OverviewPage was a different query from
// `['tenants']` in Shell, so a mutation that invalidated one left the other
// stale. Stable keys + global invalidation fixes both.

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
 * Used as the source signal for SolidJS `createResource` calls, which have no
 * cache and therefore no growth problem. Never embed this in a TanStack Query
 * cache key — use `triggerRefresh()` or `queryClient.invalidateQueries()` to
 * refetch those. */
export const refreshTick = tick

/** Trigger a global refetch — increments the tick signal (for `createResource`
 * consumers) and invalidates all TanStack Query caches (for `useQuery`
 * consumers). Both happen in lockstep so the whole page stays consistent. */
export function triggerRefresh() {
  setTick(t => t + 1)
  queryClient.invalidateQueries()
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
