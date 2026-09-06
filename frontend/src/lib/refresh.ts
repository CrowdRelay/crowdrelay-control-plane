import { createSignal, createEffect, createRoot } from 'solid-js'
import { queryClient } from './queryClient'

// Global refresh control — Grafana-style. One interval selector in the topbar
// drives every query on the page. 0 = manual only (no auto-refresh).
//
// A single timer here fires `triggerRefresh()` on the chosen interval, which
// invalidates every TanStack Query cache so all mounted queries refetch in
// lockstep — no per-query timer drift, no independent polling. Refetched data
// is merged structurally (see lib/stable-merge.ts), so an unchanged payload
// touches no DOM.
//
// Writes should not use the global tick — see `refreshQueries()` below.

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

export const setRefreshInterval = (ms: number) => {
  setIntervalMs(ms)
  try { localStorage.setItem(STORAGE_KEY, String(ms)) } catch {}
}

export const refreshInterval = intervalMs

/** Refetch every mounted query — the operator's explicit "refresh everything"
 * gesture and the interval timer's tick. After a write, prefer
 * `refreshQueries()`: a mutation knows which read models it changed.
 *
 * Never put a counter in a query key to force this. Doing so created a new
 * cache entry per tick (120 orphans per query per hour at 30s under the
 * 5-minute gcTime) and split the cache by key identity, so
 * `['tenants', tick]` in one component was a different query from
 * `['tenants']` in another and a mutation invalidating one left the other
 * stale. Stable keys plus invalidation avoid both. */
export function triggerRefresh() {
  void queryClient.invalidateQueries()
}

/** Invalidate only the queries a write actually affects.
 *
 * `triggerRefresh()` is the operator's "refresh everything" gesture and belongs
 * on the topbar control and the interval timer. Calling it after a mutation
 * refetched every mounted query on the page — confirming one outreach candidate
 * re-read the press room, the release campaigns and the beacon network over the
 * tenant tunnel — so a write now names the read models it invalidates.
 *
 * A prefix is enough: `['press-requests', slug]` also matches longer keys that
 * start with it, so a paged or filtered variant of the same read model is
 * covered without listing every permutation. */
export function refreshQueries(...queryKeys: readonly unknown[][]) {
  for (const queryKey of queryKeys) {
    void queryClient.invalidateQueries({ queryKey })
  }
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
