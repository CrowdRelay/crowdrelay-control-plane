import { QueryClient } from '@tanstack/solid-query'
import { stableMerge } from './stable-merge'

// Singleton QueryClient shared across the authenticated application. Kept in
// its own module so lib/auth.ts can clear the cache on login/logout without a
// circular dependency on AuthenticatedApp.tsx. Without this, a tenant
// operator's cached `['tenants']` result (filtered to their tenant by the
// backend) bleeds into an admin session that logs in next in the same tab —
// the admin sees only the previous user's tenant instead of all of them.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      // The global refresh control (lib/refresh.ts) is the only mechanism that
      // should auto-refetch queries on a cadence. Without this, a momentary
      // network blip triggers TanStack Query's default reconnect refetch,
      // which re-fans-out every stale query on the page — so an operator who
      // set refresh to Off still sees the Operations page flicker from
      // "degraded" to "available" as the reconnect refetch lands. The global
      // timer, manual refresh button, and mutation invalidations still drive
      // intentional refetches.
      refetchOnReconnect: false,
      refetchIntervalInBackground: false,
      placeholderData: (prev: unknown) => prev,
      // Default every query to a structural merge, so a refetch that returns
      // the same data touches no DOM at all. Queries that opt into
      // `reconcile: 'id'` override this and additionally handle reordering.
      //
      // `reconcile` is a solid-query extension to the observer options; the
      // core `QueryObserverOptions` type used by `defaultOptions` does not
      // declare it, but solid-query reads it from the merged options
      // (`observer().options.reconcile`), so a default here does apply.
      reconcile: stableMerge,
    } as never,
  },
})
