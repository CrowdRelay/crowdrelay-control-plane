import { For, Show, createMemo, createSignal } from 'solid-js'
import { Button } from '../components/app/button'
import { unavailableError } from '../lib/errors'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { AlertTriangle, Plug } from 'lucide-solid'
import { api } from '../lib/api'
import { hasDegradedSections, whileIncomplete } from '../lib/incomplete'
import { formatIsoAge } from '../lib/format'
import type { AgentProviderHealth } from '../lib/types'
import { errorWord } from '../lib/credential-health'
import { AgentPanel, type AgentView } from '../components/AgentPanel'
import { PageShell } from '../components/layout'
import { Card, DashHeader, ItemRow, Pill, Split, StatRow, Tile, Tiles, SubPagePanel, type Tone } from '../components/ui/dash'

// AI integrations (mockup `console-mockups/operator-pages.html`, screen 2):
// are the AI lanes answering, and at what cost? The first screen reads the
// health probes, the service's own alerts and the month's premium spend —
// the same three keys the providers panel uses, so opening that panel costs
// nothing more. Providers, tasks and schedules sit behind the work area.


export type IntegrationsSection = 'overview' | AgentView

const SECTION_TITLE: Record<IntegrationsSection, string> = {
  overview: 'AI integrations',
  providers: 'Providers',
  tasks: 'Tasks and schedules',
  usage: 'Usage and cost',
}

// Each sub-page answers one part of the overview's question.
const SECTION_SUBTITLE: Record<IntegrationsSection, string> = {
  overview: 'Is the AI working, and what does it cost?',
  providers: 'Which AI companies are connected, and whether their models answer',
  tasks: 'Work the autopilot suggests, jobs you run by hand, and what repeats on its own',
  usage: 'What the AI cost this month, and what it bought',
}

export const IntegrationsOverviewPage = () => <TenantIntegrationsPage section="overview" />
export const IntegrationsProvidersPage = () => <TenantIntegrationsPage section="providers" />
export const IntegrationsTasksPage = () => <TenantIntegrationsPage section="tasks" />
export const IntegrationsUsagePage = () => <TenantIntegrationsPage section="usage" />

export function TenantIntegrationsPage(props: { section: IntegrationsSection }) {
  const params = useParams({ strict: false }) as () => { slug: string }
  const section = () => props.section
  // The overview is the one place alerts are listed, so it lists all of them.
  const [showAllAlerts, setShowAllAlerts] = createSignal(false)

  // One read for the first screen. Its three sections seed the keys the
  // providers panel observes, so opening that panel costs nothing more.
  const qc = useQueryClient()
  const overview = useQuery(() => ({
    queryKey: ['agent-integrations', params().slug],
    queryFn: async () => {
      const slug = params().slug
      const model = await api.agentIntegrations(slug)
      if (model.health) qc.setQueryData(['agent-health', slug], model.health)
      if (model.alerts) qc.setQueryData(['agent-health-alerts', slug], model.alerts)
      if (model.usage) qc.setQueryData(['premium-ai-usage', slug], model.usage)
      return model
    },
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))
  const missing = (name: 'health' | 'alerts' | 'usage') =>
    overview.error ?? (overview.data?.degraded.includes(name) ? unavailableError(`${name} didn't load.`) : null)
  const health = { get data() { return overview.data?.health ?? undefined }, get error() { return missing('health') } }
  const alerts = { get data() { return overview.data?.alerts ?? undefined }, get error() { return missing('alerts') } }
  const usage = { get data() { return overview.data?.usage ?? undefined } }


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

  const spend = () => (usage.data ? usage.data.monthly_spend_micro_usd / 1_000_000 : null)
  const budget = () => (usage.data ? usage.data.budget_micro_usd / 1_000_000 : null)

  return <PageShell>
    <DashHeader
      title={SECTION_TITLE[section()]}
      subtitle={SECTION_SUBTITLE[section()]}
    />

    <SubPagePanel when={section() === 'overview'}>
    <Tiles>
      <Tile
        label="Models answering"
        value={health.data ? <>{ok().length}<span class="text-sm font-normal text-muted-foreground"> / {models().length}</span></> : null}
        valueTone={health.data && ok().length === 0 ? 'bad' : undefined}
        sub={health.data ? `${degraded().length} degraded · ${off().length} off` : undefined}
      />
      <Tile label="Failed tasks, 24 h" value={alerts.data ? failed24h() : null} valueTone={failed24h() > 0 ? 'warn' : undefined} sub="agent runs that gave up" />
      <Tile
        label="Slowest model"
        value={slowest() ? `${(slowest()!.latency_ms! / 1000).toFixed(1)} s` : null}
        sub={slowest() ? `${slowest()!.provider} · ${slowest()!.model_id}` : 'no model answering'}
      />
      <Tile
        label="Cost this month"
        value={spend() == null ? null : `$${spend()!.toFixed(2)}`}
        sub={budget() != null ? `of $${budget()!.toFixed(0)} budget` : undefined}
      />
    </Tiles>

    <Split mid>
      <Card title="Providers" icon={<Plug />} aside="models answering">
        <Show when={health.data} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">{health.error ? "Couldn't check which models answer." : ''}</p>}>
          <For each={providers()}>{row => (
            <StatRow
              label={<>{row.provider} <span class="text-muted-foreground">· {row.answering} of {row.total} models</span></>}
              value={<Pill tone={row.tone}>{row.word}</Pill>}
            />
          )}</For>
        </Show>
      </Card>
      <Card title="What went wrong lately" icon={<AlertTriangle />}>
        <Show when={(alerts.data?.alerts ?? []).length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">{alerts.error ? "Couldn't load recent problems." : 'Nothing went wrong lately.'}</p>}>
          <For each={showAllAlerts() ? alerts.data!.alerts : alerts.data!.alerts.slice(0, 4)}>{alert => (
            <ItemRow
              pill={{ tone: alert.severity === 'critical' ? 'bad' : 'warn', text: alert.severity }}
              title={alert.message}
              sub={alert.occurred_at ? formatIsoAge(alert.occurred_at) : undefined}
            />
          )}</For>
          <Show when={alerts.data!.alerts.length > 4}>
            <Button variant="ghost" size="sm" class="mt-2 self-start" onClick={() => setShowAllAlerts(v => !v)}>
              {showAllAlerts() ? 'Show fewer' : `Show all ${alerts.data!.alerts.length}`}
            </Button>
          </Show>
        </Show>
      </Card>
    </Split>
    </SubPagePanel>

    <SubPagePanel when={section() !== 'overview'}>
      <AgentPanel slug={params().slug} view={section() as AgentView} />
    </SubPagePanel>
  </PageShell>
}
