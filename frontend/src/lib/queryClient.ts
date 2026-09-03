import { QueryClient } from '@tanstack/solid-query'

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
      refetchIntervalInBackground: false,
      placeholderData: (prev: unknown) => prev,
    },
  },
})
