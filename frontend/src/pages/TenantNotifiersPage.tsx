import { useParams } from '@tanstack/solid-router'
import { PageHeader, PageShell } from '../components/layout'
import { NotifiersPanel } from '../components/NotifiersPanel'

// Kept as a destination: the surface moved to Settings → Destinations, but
// every deep link (process map, palette, overview alerts) still lands here.
export function TenantNotifiersPage() {
  const params = useParams({ from: '/tenants/$slug/notifiers' })
  return <PageShell>
    <PageHeader
      title="Notifiers"
      description="Where this tenant's alerts go: the destinations you own, the ones the platform sets for everybody, and the ones automation routes."
    />
    <NotifiersPanel slug={params().slug} />
  </PageShell>
}
