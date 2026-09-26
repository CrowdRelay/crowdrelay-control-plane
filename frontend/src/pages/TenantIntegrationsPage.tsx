import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { AlertTriangle, Plug, RefreshCw } from 'lucide-solid'
import { api, request } from '../lib/api'
import { formatIsoAge, relativeTime } from '../lib/format'
import { cn } from '../lib/cn'
import type { AgentProviderHealth, PremiumUsage } from '../lib/types'
import { AgentPanel } from '../components/AgentPanel'
import { PageShell } from '../components/layout'
import { Card, DashHeader, IconAct, ItemRow, Note, Pill, Split, StatRow, Tile, Tiles, WorkAreaPanel, WorkAreas, useWorkAreas, type Tone } from '../components/ui/dash'

// AI integrations (mockup `console-mockups/operator-pages.html`, screen 2):
// are the AI lanes answering, and at what cost? The first screen reads the
// health probes, the service's own alerts and the month's premium spend —
// the same three keys the providers panel uses, so opening that panel costs
// nothing more. Providers, tasks and schedules sit behind the work area.

// The agent service's read models: providers, tasks, premium usage, analytics.
const AGENT_KEYS = ['agent-', 'premium-ai-', 'ai-usage']

const ERROR_WORDS: Record<string, string> = {
  call_failed: 'calls failing',
  request_invalid: 'key or request refused',
  quota_exhausted: 'quota used up',
  model_unavailable: 'model gone',
  provider_outage: 'provider down',
  rate_limited: 'rate limited',
}
const errorWord = (error: string | null) => {
  if (!error) return null
  const key = Object.keys(ERROR_WORDS).find(k => error.startsWith(k) || error.includes(k))
  if (key) return ERROR_WORDS[key]!
  return error.includes('429') ? 'rate limited' : error.replaceAll('_', ' ')
}

export function TenantIntegrationsPage() {
  const params = useParams({ from: '/tenants/$slug/integrations' })
  const areas = useWorkAreas(['providers'])

  const health = useQuery(() => ({
    queryKey: ['agent-health', params().slug],
    queryFn: () => api.agentHealth(params().slug),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))
  const alerts = useQuery(() => ({
    queryKey: ['agent-health-alerts', params().slug],
    queryFn: () => api.agentHealthAlerts(params().slug),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))
  const usage = useQuery(() => ({
    queryKey: ['premium-ai-usage', params().slug],
    queryFn: () => request<PremiumUsage>(`/tenants/${params().slug}/agents/premium/usage`),
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  }))

  // The page's refresh reaches every agent query by prefix; "Updated" reads
  // the newest of whatever has loaded.
  const qc = useQueryClient()
  const isAgentQuery = (key: readonly unknown[]) =>
    typeof key[0] === 'string' && AGENT_KEYS.some(prefix => (key[0] as string).startsWith(prefix)) && key[1] === params().slug
  const fetching = useIsFetching(() => ({ predicate: q => isAgentQuery(q.queryKey) }))
  const refresh = () => void qc.invalidateQueries({ predicate: q => isAgentQuery(q.queryKey) })
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now(); fetching()
    const ts = Math.max(0, ...qc.getQueryCache().findAll({ predicate: q => isAgentQuery(q.queryKey) }).map(q => q.state.dataUpdatedAt))
    return ts === 0 ? null : relativeTime(ts)
  })

  // Model probes only — `__provider__` rows describe the account, not a lane.
  const models = () => (health.data?.health ?? []).filter(row => row.model_id !== '__provider__')
  const ok = () => models().filter(row => row.status === 'ok')
  const degraded = () => models().filter(row => row.status === 'degraded' || row.status === 'down' || row.status === 'cooldown')
  const off = () => models().filter(row => row.status === 'disabled')
  const slowest = () => ok().filter(row => row.latency_ms != null).sort((a, b) => b.latency_ms! - a.latency_ms!)[0] ?? null
  const failed24h = () => (alerts.data?.alerts ?? []).filter(a =>
    a.category === 'agent_task_failed' && a.occurred_at && Date.parse(a.occurred_at) > Date.now() - 86_400_000).length

  // One row per provider: how many of its models answer, and the worst word.
  const providers = createMemo(() => {
    const by = new Map<string, AgentProviderHealth[]>()
    for (const row of health.data?.health ?? []) by.set(row.provider, [...(by.get(row.provider) ?? []), row])
    return [...by.entries()].map(([provider, rows]) => {
      const lanes = rows.filter(r => r.model_id !== '__provider__')
      const answering = lanes.filter(r => r.status === 'ok').length
      const account = rows.find(r => r.model_id === '__provider__')
      const worst = rows.find(r => r.status !== 'ok' && r.last_error)
      const tone: Tone = answering === lanes.length && lanes.length > 0 ? 'good' : answering > 0 ? 'warn' : 'bad'
      return {
        provider,
        answering,
        total: lanes.length,
        tone,
        word: answering === lanes.length && lanes.length > 0
          ? 'ok'
          : account?.status === 'disabled' ? 'account off' : errorWord(worst?.last_error ?? null) ?? `${answering} of ${lanes.length} answering`,
      }
    }).sort((a, b) => b.answering - a.answering || a.provider.localeCompare(b.provider))
  })

  const pill = (): { tone: Tone; text: string } | null => {
    if (!health.data) return null
    if (ok().length === 0) return { tone: 'bad', text: 'No lane is answering' }
    if (degraded().length + off().length > ok().length) return { tone: 'warn', text: `${ok().length} of ${models().length} lanes answering` }
    return { tone: 'good', text: 'Answering' }
  }
  const spend = () => (usage.data ? usage.data.monthly_spend_micro_usd / 1_000_000 : null)
  const budget = () => (usage.data ? usage.data.budget_micro_usd / 1_000_000 : null)

  return <PageShell>
    <DashHeader
      title="AI integrations"
      subtitle="Are the AI lanes answering, and at what cost"
      pill={pill()}
      actions={
        <IconAct onClick={refresh} disabled={fetching() > 0} label="Refresh" title={updated() ? `Updated ${updated()}` : 'Refresh'}>
          <RefreshCw class={cn('size-3.5', fetching() > 0 && 'animate-spin')} aria-hidden="true" />
        </IconAct>
      }
    />

    <Tiles>
      <Tile
        label="Lanes answering"
        value={health.data ? <>{ok().length}<span class="text-sm font-normal text-muted-foreground/70"> / {models().length}</span></> : null}
        valueTone={health.data && ok().length === 0 ? 'bad' : undefined}
        sub={health.data ? `${degraded().length} degraded · ${off().length} off` : undefined}
      />
      <Tile label="Failed tasks, 24 h" value={alerts.data ? failed24h() : null} valueTone={failed24h() > 0 ? 'warn' : undefined} sub="agent runs that gave up" />
      <Tile
        label="Slowest lane"
        value={slowest() ? `${(slowest()!.latency_ms! / 1000).toFixed(1)} s` : null}
        sub={slowest() ? `${slowest()!.provider} · ${slowest()!.model_id}` : 'no lane answering'}
      />
      <Tile
        label="Cost this month"
        value={spend() == null ? null : `$${spend()!.toFixed(2)}`}
        sub={budget() != null ? `of $${budget()!.toFixed(0)} budget` : undefined}
      />
    </Tiles>

    <Split mid>
      <Card title="Lanes" icon={<Plug />} aside="per provider">
        <Show when={health.data} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">{health.error ? 'The health probes could not be read.' : ''}</p>}>
          <For each={providers()}>{row => (
            <StatRow
              label={<>{row.provider} <span class="text-muted-foreground/70">· {row.answering} of {row.total} models</span></>}
              value={<Pill tone={row.tone}>{row.word}</Pill>}
            />
          )}</For>
        </Show>
      </Card>
      <Card title="What went wrong lately" icon={<AlertTriangle />}>
        <Show when={(alerts.data?.alerts ?? []).length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">{alerts.error ? 'The alerts could not be read.' : 'Nothing went wrong lately.'}</p>}>
          <For each={alerts.data!.alerts.slice(0, 4)}>{alert => (
            <ItemRow
              pill={{ tone: alert.severity === 'critical' ? 'bad' : 'warn', text: alert.severity }}
              title={alert.message}
              sub={alert.occurred_at ? formatIsoAge(alert.occurred_at) : undefined}
            />
          )}</For>
          <Show when={alerts.data!.alert_count > 4}>
            <Note>{alerts.data!.alert_count - 4} more in the providers panel.</Note>
          </Show>
        </Show>
      </Card>
    </Split>

    <WorkAreas
      active={areas.active()}
      onToggle={areas.toggle}
      areas={[{ id: 'providers', label: 'Providers, tasks and schedules' }]}
    />
    <WorkAreaPanel id="providers" active={areas.active()}>
      <AgentPanel slug={params().slug} />
    </WorkAreaPanel>
  </PageShell>
}
