import { Show } from 'solid-js'
import { useParams } from '@tanstack/solid-router'
import { AgentPanel } from '../components/AgentPanel'

export function TenantIntegrationsPage() {
  const params = useParams({ from: '/tenants/$slug/integrations' })

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">SYSTEM</span>
        <h1>AI Integrations</h1>
        <p>Connect LLM providers and delegate tasks to AI agents. The autopilot brain uses these models to research audiences, draft content, and analyse campaigns.</p>
      </div>
    </div>
    <AgentPanel slug={params().slug} />
  </section>
}
