import { request } from './api'

// The table-driven operator surface — `crates/control-plane-api/src/surface_routes.rs`.
// One CP route, `/tenants/{slug}/surface/{path}`, proxies every entry of that
// table to `/v1/control-plane/{path}` on the tenant. `path` here is exactly the
// table's path with its parameters filled in.

export type SurfaceMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export function surfaceUrl(slug: string, path: string, query?: Record<string, string>): string {
  const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '')).toString() : ''
  return `/tenants/${encodeURIComponent(slug)}/surface/${path}${qs ? `?${qs}` : ''}`
}

export const surface = {
  read: <T = unknown>(slug: string, path: string, query?: Record<string, string>) =>
    request<T>(surfaceUrl(slug, path, query)),
  /** Every write carries a fresh Idempotency-Key — the proxy refuses one
   *  without, and CrowdRelay replays a retried key instead of acting twice. */
  write: <T = unknown>(slug: string, method: Exclude<SurfaceMethod, 'GET'>, path: string, body?: unknown) =>
    request<T>(surfaceUrl(slug, path), {
      method,
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
}

/** Fill `{name}` segments of a table path. Every value is URI-encoded; a
 *  missing value leaves the template unfilled so the caller can refuse it. */
export function fillPath(template: string, values: Record<string, string>): string | null {
  let missing = false
  const filled = template.replace(/\{([a-z_]+)\}/g, (_, name: string) => {
    const value = values[name]?.trim()
    if (!value) { missing = true; return '' }
    return encodeURIComponent(value)
  })
  return missing ? null : filled
}

/** The `{name}` parameters a table path carries, in order. */
export const pathParams = (template: string): string[] =>
  [...template.matchAll(/\{([a-z_]+)\}/g)].map(match => match[1] ?? '')
