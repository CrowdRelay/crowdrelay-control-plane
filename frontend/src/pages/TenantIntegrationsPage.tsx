import { useParams } from '@tanstack/solid-router'
import { AgentPanel } from '../components/AgentPanel'
import { PageShell, PageHeader } from '../components/layout'

export function TenantIntegrationsPage() {
  const params = useParams({ from: '/tenants/$slug/integrations' })

  return <PageShell>
    <PageHeader eyebrow="SYSTEM" title="AI Integrations" description="Connect LLM providers and delegate tasks to AI agents." />
    <AgentPanel slug={params().slug} />
  </PageShell>
}
