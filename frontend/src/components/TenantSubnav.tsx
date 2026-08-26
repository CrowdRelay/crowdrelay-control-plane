import { Link } from '@tanstack/solid-router'

// Tenant subpages are separate routes on purpose: each one loads its own
// purpose-built read model with a single request, so switching tabs never
// leaves a half-populated screen and no tab pays for another tab's data.
export function TenantSubnav(props: { slug: string }) {
  return <nav class="tenant-subnav" aria-label="Tenant sections">
    <Link to="/tenants/$slug" params={{ slug: props.slug }} activeOptions={{ exact: true }} activeProps={{ class: 'active' }}>Overview</Link>
    <Link to="/tenants/$slug/attention" params={{ slug: props.slug }} activeProps={{ class: 'active' }}>Attention</Link>
    <Link to="/tenants/$slug/operations" params={{ slug: props.slug }} activeProps={{ class: 'active' }}>Operations</Link>
    <Link to="/tenants/$slug/portfolio" params={{ slug: props.slug }} activeProps={{ class: 'active' }}>Portfolio</Link>
    <Link to="/tenants/$slug/area" params={{ slug: props.slug }} activeProps={{ class: 'active' }}>AREA</Link>
  </nav>
}
