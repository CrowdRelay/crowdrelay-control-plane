/**
 * Read models that came back incomplete, and how the console recovers.
 *
 * Every tenant-scoped read model is a fan-out: the Control Plane asks the
 * tenant for each section and assembles what it gets. A section the tenant
 * could not answer is reported as unavailable rather than guessed, which is
 * right — "we don't know how many fans" and "zero fans" are different facts
 * and the API must not conflate them.
 *
 * What was missing is what happens next. That answer arrives as HTTP 200, so
 * it is not an error and `retry` never fires; it is then cached, and with
 * `refetchOnWindowFocus` and `refetchOnReconnect` both off, nothing asks
 * again. One cold connection at the wrong moment and the operator reads a
 * dash where the number should be, for as long as the tab stays open.
 *
 * Observed in production: a `command-center` request seconds after a deploy
 * came back with all five sections unavailable for both tenants — and it
 * came back in 0.5s, so nothing timed out and nothing was logged. Six
 * seconds later the same request returned `activeFans: 20`. The data was
 * there the whole time; the console had simply stopped asking.
 *
 * `whileIncomplete` keeps asking. It drives `refetchInterval`, so the page
 * renders immediately with whatever it has and fills the gaps in as the
 * sections land, which is the behaviour an operator expects from a number
 * that is missing: not an error, not a spinner over the whole page, just a
 * value that shows up.
 */

/** TanStack passes the query; only its last data is needed here. */
type QueryLike<T> = { state: { data?: T; dataUpdateCount: number; fetchFailureCount?: number } }

/**
 * How long to wait before the first retry while a model is still incomplete.
 * Each subsequent attempt doubles it — a tenant that is down or rate-limiting
 * us gets asked again more slowly, not more often. Without the backoff every
 * open page retrying a degraded model feeds the very overload that degraded
 * it: upstream starts rejecting, every section reads incomplete, and every
 * observer piles on at a fixed four seconds.
 */
const RETRY_AFTER_MS = 4_000
const RETRY_MAX_MS = 30_000

/**
 * Stop after this many successful fetches have still come back incomplete.
 *
 * A tenant whose runtime is genuinely down will never fill in, and polling it
 * forever costs requests per open tab for nothing. Six tries with the backoff
 * above is about two minutes of a section being absent, which is long enough
 * to outlast a restart and short enough not to become a load source. The
 * count only matters while incomplete — a complete model stops the interval
 * on its own, whatever the count says.
 */
const GIVE_UP_AFTER = 6

/**
 * Whether the give-up window is still open — the interval is actually armed.
 * Counts fetch attempts, not just successes: `dataUpdateCount` only grows on
 * a 200, so without `fetchFailureCount` a query whose every retry throws
 * would poll forever.
 *
 * Both counters live on `Query.state`, not the `useQuery` result — a page
 * reaches them through the cache:
 * `qc.getQueryCache().find({ queryKey })?.state`. The overview model's
 * `waitingNote` does exactly that to keep "still asking" copy honest.
 */
export const stillAsking = (state: { dataUpdateCount: number; fetchFailureCount?: number }): boolean =>
  state.dataUpdateCount + (state.fetchFailureCount ?? 0) <= GIVE_UP_AFTER

/** How long until the next attempt, backing off per failed attempt. */
export const retryDelay = (state: { dataUpdateCount: number; fetchFailureCount?: number }): number => {
  const attempts = state.dataUpdateCount + (state.fetchFailureCount ?? 0)
  return Math.min(RETRY_AFTER_MS * 2 ** Math.max(0, attempts - 1), RETRY_MAX_MS)
}

/**
 * Build a `refetchInterval` that polls until `isIncomplete` returns false.
 *
 *   const ops = useQuery(() => ({
 *     queryKey: ['tenant-operations', slug()],
 *     queryFn: () => api.tenantOperations(slug()),
 *     refetchInterval: whileIncomplete(model => model.degraded.length > 0),
 *   }))
 *
 * Written against the query's own state rather than a captured clock: the
 * options factory re-runs on every reactive read, so a closure over
 * `Date.now()` would reset its deadline on each render and poll forever.
 */
export function whileIncomplete<T>(isIncomplete: (data: T) => boolean) {
  return (query: QueryLike<T>): number | false => {
    const data = query.state.data
    if (data === undefined) return false // still loading; the fetch is in flight
    if (!isIncomplete(data)) return false
    if (!stillAsking(query.state)) return false
    return retryDelay(query.state)
  }
}

/**
 * The shared shape: a read model that names the sections it could not get.
 *
 * `degraded` is empty on a complete answer, so this is the whole test for
 * every model that carries one.
 */
export const hasDegradedSections = (model: { degraded: readonly unknown[] }) => model.degraded.length > 0

/**
 * The command centre reports availability per tenant rather than a `degraded`
 * list. A tenant that answered nothing is the same condition.
 */
export const hasUnavailableTenant = (model: { perTenant: readonly { available: boolean }[] }) =>
  model.perTenant.some(tenant => !tenant.available)

/**
 * The consolidated agent read models use a different degraded channel: a
 * section the agent service could not answer arrives as `{ __error: string }`
 * where the section object would be (`agent_routes.rs` `section()` helper).
 * It is still a 200 and it is still incomplete — scan the top-level sections
 * for the marker.
 */
export const hasErrorSections = (model: object) =>
  Object.values(model).some(
    section => typeof section === 'object' && section !== null && '__error' in section,
  )
