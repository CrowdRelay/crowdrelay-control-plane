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

// Auto-refresh is Off by default. The operator can opt in from the topbar
// dropdown. The choice is remembered so an operator who deliberately picks
// an interval keeps it across reloads. Users who were on the old 30s default
// are reset to Off — only explicit non-default choices survive.
const DEFAULT_MS = 0
const OLD_DEFAULT = 30_000
const STORAGE_KEY = 'refresh-interval-ms'

const storedInterval = (): number => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return DEFAULT_MS
    const parsed = Number(raw)
    if (parsed === OLD_DEFAULT) {
      localStorage.removeItem(STORAGE_KEY)
      return DEFAULT_MS
    }
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

/** `refreshQueries`, coalesced: calls within `REFRESH_SOON_MS` of each other
 * share one refetch, fired after the last call (and at most
 * `REFRESH_SOON_MAX_MS` after the first).
 *
 * For writes an operator makes in rapid succession — approving a queue of
 * brain suggestions one click after another. Each approval used to invalidate
 * five heavy read models at once; twenty quick approvals put about a hundred
 * aggregate reads on the API in a few seconds. The client cancels a
 * superseded fetch, the server does not: the API's read budget timed out
 * (503) and the burst's memory peak is what OOM-killed it. The approved rows
 * are already hidden locally, so nothing is lost by refetching once, after
 * the operator stops. */
const REFRESH_SOON_MS = 1_200
const REFRESH_SOON_MAX_MS = 5_000
const soonKeys = new Map<string, readonly unknown[]>()
let soonTimer: ReturnType<typeof setTimeout> | null = null
let soonFirstAt = 0

export function refreshQueriesSoon(...queryKeys: readonly unknown[][]) {
  for (const queryKey of queryKeys) soonKeys.set(JSON.stringify(queryKey), queryKey)
  const now = Date.now()
  if (soonTimer === null) soonFirstAt = now
  else clearTimeout(soonTimer)
  const wait = Math.max(0, Math.min(REFRESH_SOON_MS, soonFirstAt + REFRESH_SOON_MAX_MS - now))
  soonTimer = setTimeout(() => {
    soonTimer = null
    const keys = [...soonKeys.values()]
    soonKeys.clear()
    refreshQueries(...keys.map(key => [...key]))
  }, wait)
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
    // `refetchIntervalInBackground: false` already keeps per-query pollers
    // quiet in a hidden tab — the global tick must honor the same rule.
    // Browsers clamp (not stop) timers in the background, so without the
    // check a hidden tab still invalidates everything about once a minute.
    timerId = setInterval(() => {
      if (!document.hidden) triggerRefresh()
    }, ms)
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
