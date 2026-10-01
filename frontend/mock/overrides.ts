// Corrections to the generated mock answers, for content that has to agree
// with the URL or with another answer. Everything else stays generated.

export const MOCK_TENANTS = [
  { slug: 'nocna-zmiana', displayName: 'Nocna Zmiana' },
  { slug: 'kwiaty-elektryczne', displayName: 'Kwiaty Elektryczne' },
  { slug: 'mgla-nad-wisla', displayName: 'Mgła nad Wisłą' },
  { slug: 'szum-miasta', displayName: 'Szum Miasta' },
  { slug: 'lato-w-betonie', displayName: 'Lato w Betonie' },
  { slug: 'ostatni-tramwaj', displayName: 'Ostatni Tramwaj' },
]

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Give a tenant-shaped object one consistent identity. */
function asTenant(value: unknown, tenant: { slug: string; displayName: string }): unknown {
  if (!isObject(value)) return value
  const out: Json = { ...value }
  if ('slug' in out) out.slug = tenant.slug
  if ('displayName' in out) out.displayName = tenant.displayName
  if ('name' in out && typeof out.name === 'string') out.name = tenant.displayName
  if ('status' in out && typeof out.status === 'string') out.status = 'active'
  return out
}

/** Every `tenantSlug` / `tenant_slug` under a tenant URL points back at it. */
function stampTenantSlug(value: unknown, slug: string): unknown {
  if (Array.isArray(value)) return value.map((v) => stampTenantSlug(v, slug))
  if (!isObject(value)) return value
  const out: Json = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = k === 'tenantSlug' || k === 'tenant_slug' ? slug : stampTenantSlug(v, slug)
  }
  return out
}

export function applyOverrides(method: string, pathname: string, value: unknown): unknown {
  if (pathname === '/auth/session' && method !== 'DELETE') {
    return { username: 'demo.admin', role: 'platform_admin', tenantSlug: null, isMobile: false }
  }

  if (method === 'GET' && pathname === '/tenants' && isObject(value) && Array.isArray(value.items)) {
    const items = value.items as unknown[]
    return { ...value, items: MOCK_TENANTS.map((t, i) => asTenant(items[i % items.length], t)) }
  }

  const tenantMatch = pathname.match(/^\/tenants\/([^/]+)(\/.*)?$/)
  if (tenantMatch) {
    const slug = decodeURIComponent(tenantMatch[1]!)
    const tenant = MOCK_TENANTS.find((t) => t.slug === slug) ?? { slug, displayName: slug }
    if (!tenantMatch[2]) return asTenant(value, tenant)
    let out = stampTenantSlug(value, slug)
    // Read models that embed the tenant summary.
    if (isObject(out) && isObject(out.tenant)) out = { ...out, tenant: asTenant(out.tenant, tenant) }
    return out
  }

  return value
}
