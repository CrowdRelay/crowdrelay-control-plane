import { Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useIsFetching, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { RefreshCw } from 'lucide-solid'
import { relativeTime } from '../lib/format'
import { cn } from '../lib/cn'
import { AgentPanel } from '../components/AgentPanel'
import { PageShell, PageHeader } from '../components/layout'
import { Button } from '../components/app/button'

// The agent service's read models: providers, tasks, premium usage, analytics.
const AGENT_KEYS = ['agent-', 'premium-ai-', 'ai-usage']

export function TenantIntegrationsPage() {
  const params = useParams({ from: '/tenants/$slug/integrations' })

  // The panel owns its queries. The page's refresh reaches all of them by
  // prefix, and "Updated" reads the newest of whatever has loaded.
  const qc = useQueryClient()
  const isAgentQuery = (key: readonly unknown[]) =>
    typeof key[0] === 'string' && AGENT_KEYS.some(prefix => (key[0] as string).startsWith(prefix)) && key[1] === params().slug
  const fetching = useIsFetching(() => ({ predicate: q => isAgentQuery(q.queryKey) }))
  const refresh = () => void qc.invalidateQueries({ predicate: q => isAgentQuery(q.queryKey) })

  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now(); fetching()
    const ts = Math.max(0, ...qc.getQueryCache().findAll({ predicate: q => isAgentQuery(q.queryKey) }).map(q => q.state.dataUpdatedAt))
    return ts === 0 ? null : relativeTime(ts)
  })

  return <PageShell>
    <PageHeader
      title="AI Integrations"
      description="The AI providers this tenant can use, the tasks you hand to agents, and what they cost."
      actions={
        <>
          <Show when={updated()}><span class="text-sm text-muted-foreground">Updated {updated()}</span></Show>
          <Button variant="outline" size="sm" onClick={refresh} disabled={fetching() > 0} aria-label="Refresh">
            <RefreshCw class={cn(fetching() > 0 && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </>
      }
    />
    <AgentPanel slug={params().slug} />
  </PageShell>
}
