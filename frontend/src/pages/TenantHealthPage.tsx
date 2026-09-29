import { BoundsPanel } from '../components/BoundsPanel'
import { fetchTenantOverview } from '../lib/tenantOverview'
import { PlatformAgreementPanel } from '../components/PlatformAgreementPanel'
import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { RefreshCw } from 'lucide-solid'
import { api } from '../lib/api'
import { relativeTime } from '../lib/format'
import { cn } from '../lib/cn'
import { ChiefOfStaffPanel } from '../components/ChiefOfStaffPanel'
import { DeliveryJourneyPanel } from '../components/DeliveryJourneyPanel'
import { SystemHealthPanel } from '../components/SystemHealthPanel'
import { TenantRuntimePanel } from '../components/TenantRuntimePanel'
import { RuntimeSwitchesPanel } from '../components/RuntimeSwitchesPanel'
import { AuthorityPoliciesPanel } from '../components/AuthorityPoliciesPanel'
import { StandingApprovalsPanel } from '../components/StandingApprovalsPanel'
import { SkeletonSection } from '../components/Skeleton'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { Alert } from '../components/app/alert'
import { PageShell } from '../components/layout'
import { Act, Card, DashHeader, IconAct, ItemRow, Note, Tile, Tiles, WorkAreaPanel, WorkAreas, useWorkAreas, type Tone } from '../components/ui/dash'
import { ListChecks } from 'lucide-solid'
import { operationalLabel } from '../lib/health-tone'
import type { TenantDeliveryReadModel, TenantTodayReadModel } from '../lib/types'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'

const TABS = ['overview', 'delivery', 'policies', 'runtime'] as const

// The section labels the delivery tab's degraded strip prints — a section
// the tenant could not answer is named, never silently absent.
const DELIVERY_SECTION_LABEL: Record<string, string> = {
  summary: 'Queue depths',
  outbox: 'The outbox',
  deliveries: 'The deliveries',
  attention: 'The dead queues',
  delivery_results: 'The landed ledger',
}

// Is the tenant's machine well, and what may the autopilot do. Three tabs:
// status, the authority policies, and the runtime switches. This is the only
// place the autopilot's switches and sliders live; Operations links here.
export function TenantHealthPage() {
  const params = useParams({ from: '/tenants/$slug/health' })
  // The id list makes `?tab=` deep links land on the right tab.
  const areas = useWorkAreas([...TABS], 'tab', 'overview')
  const isVisited = (id: string) => areas.active() === id
  const model = useQuery(() => ({
    queryKey: ['tenant-today', params().slug],
    queryFn: () => api.tenantToday(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // A section the tenant could not answer lands here as 200 with the
    // section named in `degraded`, so nothing retries it and the panel
    // stays empty for the life of the tab. Keep asking until it fills.
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))
  const overview = useQuery(() => ({
    queryKey: ['tenant-overview', params().slug],
    queryFn: () => fetchTenantOverview(params().slug),
    // Only the Switches area reads it (`canRedeploy`); the first screen is
    // the today model alone.
    enabled: isVisited('runtime'),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))
  const delivery = useQuery(() => ({
    queryKey: ['tenant-delivery', params().slug],
    queryFn: () => api.deliveryModel(params().slug),
    // The delivery model is a 5-call upstream fan-out consumed only inside
    // the Delivery tab — the default Status tab must not pay for it.
    enabled: isVisited('delivery'),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // A dead section lands here as 200 with the section named in `degraded`
    // — nothing retries it, so the queue view stays empty for the life of
    // the page. Keep asking until it fills.
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))
  // The panels this feeds mutate queues and switches the delivery model
  // also reads — a today-only refetch would leave the sibling tab stale.
  // `refetch()` on a disabled query fires anyway — `enabled` only gates
  // automatic fetching. Gate the delivery fan-out on isFetched so a
  // Status-tab Refresh or a queue mutation does not pay the 5-call
  // upstream cost for a tab never visited (same idiom as AudiencePage).
  const refresh = () => Promise.all([model.refetch(), ...(delivery.isFetched ? [delivery.refetch()] : [])])
  const refreshAll = () => { void model.refetch(); if (overview.isFetched) void overview.refetch(); if (delivery.isFetched) void delivery.refetch() }
  const refreshing = () => model.isFetching || overview.isFetching || delivery.isFetching
  const d = (): TenantTodayReadModel | undefined => model.data
  const summary = () => d()?.summary
  const deadJobs = () => {
    const s = summary()
    return s ? s.outbox.dead + s.deliveries.dead + s.push.dead : 0
  }

  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now()
    return model.dataUpdatedAt ? relativeTime(model.dataUpdatedAt) : null
  })

  const alerts = () => d()?.attention?.alerts ?? []
  const delivered = () => {
    const x = summary()
    return x ? x.outbox.delivered_24h + x.deliveries.delivered_24h + x.push.delivered_24h : null
  }
  const pill = (): { tone: Tone; text: string } | null => {
    const x = summary()
    if (!x) return null
    const crit = x.watchdog.critical_alerts
    const warn = x.watchdog.active_alerts - crit
    if (x.worker && !x.worker.alive) return { tone: 'bad', text: 'The worker is down' }
    if (crit > 0) return { tone: 'bad', text: `${crit} critical · ${warn} ${warn === 1 ? 'warning' : 'warnings'}` }
    if (warn > 0) return { tone: 'warn', text: `${warn} ${warn === 1 ? 'warning' : 'warnings'} · nothing down` }
    return { tone: 'good', text: 'All well' }
  }
  // Where each alert is cleared — the one page or setting that fixes it.
  const fixFor = (key: string): { to: string; search?: Record<string, string> } => {
    if (key.startsWith('approval.')) return { to: '/tenants/$slug/attention' }
    if (key.startsWith('executor.')) return { to: '/tenants/$slug/intelligence', search: { tab: 'standing' } }
    if (key.startsWith('publishing.')) return { to: '/tenants/$slug/content' }
    if (key.startsWith('learning.')) return { to: '/tenants/$slug/intelligence', search: { tab: 'learning' } }
    return { to: '/tenants/$slug/health', search: { tab: 'overview' } }
  }
  const ago = (seconds: number) => (seconds < 90 ? `${seconds} s` : `${Math.round(seconds / 60)} min`)

  return <PageShell>
    <DashHeader
      title="Health"
      subtitle="Is anything broken, and what to do"
      pill={pill()}
      actions={
        <IconAct onClick={refreshAll} disabled={refreshing()} label="Refresh" title={updated() ? `Updated ${updated()}` : 'Refresh'}>
          <RefreshCw class={cn('size-3.5', refreshing() && 'animate-spin')} aria-hidden="true" />
        </IconAct>
      }
    />

    <Show when={model.error}>
      <SectionFailureCard error={model.error} title="Couldn't load operations" onRetry={() => void refresh()} />
    </Show>
    {/* The tabs render regardless of the today model — every tab's content
        answers from its own channel except the two panels that take today's
        summary as a prop, and those gate on it alone. A dead today read
        must not hide a working delivery view. */}
    <WorkAreas
      active={areas.active()}
      onToggle={areas.toggle}
      areas={[
        { id: 'overview', label: 'Overview' },
        { id: 'delivery', label: 'Delivery' },
        { id: 'policies', label: 'Policies' },
        { id: 'runtime', label: 'Switches' },
      ]}
    />

      <WorkAreaPanel id="overview" active={areas.active()}>
        <Show when={!model.error && !model.data}>
          <SkeletonSection titleWidth="180px" lines={4} minHeight="200px" />
        </Show>

        <Show when={model.data && !model.error}>
          <Tiles>
            <Tile label="Services" value={operationalLabel(summary())} sub={summary() ? `API p95 ${summary()!.http.p95_ms} ms · ${summary()!.http.errors_5xx} errors` : 'no summary yet'} />
            <Tile label="Sent, 24 h" value={delivered()} sub={summary() ? `${deadJobs()} dead` : undefined} valueTone={deadJobs() > 0 ? 'warn' : undefined} />
            <Tile
              label="Worker"
              value={summary()?.worker ? (summary()!.worker!.alive ? 'Alive' : 'Down') : null}
              valueTone={summary()?.worker && !summary()!.worker!.alive ? 'bad' : undefined}
              sub={summary()?.worker?.cycle_age_seconds != null ? `last cycle ${ago(summary()!.worker!.cycle_age_seconds!)} ago` : undefined}
            />
            <Tile
              label="Database"
              value={summary() ? 'Fine' : null}
              sub={summary() ? `pool ${summary()!.database.pool_idle} of ${summary()!.database.pool_size} idle` : undefined}
            />
          </Tiles>

          <Card title="What needs a look" icon={<ListChecks />} class="mb-3">
            <Show when={alerts().length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">Nothing needs a look.</p>}>
              <For each={alerts()}>{alert => (
                <ItemRow
                  pill={{ tone: alert.severity === 'critical' ? 'bad' : 'warn', text: alert.severity }}
                  title={alert.summary}
                  action={<Act to={fixFor(alert.alert_key).to} params={{ slug: params().slug }} search={fixFor(alert.alert_key).search}>Fix</Act>}
                />
              )}</For>
              <Note>Each Fix opens the one page or setting that clears it. Delivery, policies and switches stay below.</Note>
            </Show>
          </Card>
        </Show>

        {/* The tenant-pushed heartbeat first, then what needs a hand, then the
            autopilot's own report. */}
        <TenantRuntimePanel slug={params().slug} />
        <Show when={model.data}>{data => (
          <SystemHealthPanel
            slug={params().slug}
            summary={data().summary ?? undefined}
            onChanged={refresh}
          />
        )}</Show>
        <ChiefOfStaffPanel slug={params().slug} />
        <PlatformAgreementPanel slug={params().slug} />
      </WorkAreaPanel>

      {/* ── Delivery — the pipe as a journey: drafted → queued → wire →
            landed, with the dead queues leading because they are the ask.
            One read model feeds every row; retries invalidate it. ── */}
      <WorkAreaPanel id="delivery" active={areas.active()}>
        <Show when={delivery.error}>
          <SectionFailureCard error={delivery.error} title="Couldn't load delivery status" onRetry={() => void delivery.refetch()} />
        </Show>
        <Show when={delivery.data}>{(data: () => TenantDeliveryReadModel) => <>
          <For each={data().degraded}>{section => (
            <Alert tone="warning" role="status" class="mb-4">
              <strong>{DELIVERY_SECTION_LABEL[section] ?? section}</strong> isn't available on the
              connected tenant right now. The rest of the page keeps working — it recovers on the next poll.
            </Alert>
          )}</For>
          <DeliveryJourneyPanel
            slug={params().slug}
            model={() => data()}
            onRefresh={() => { void delivery.refetch(); void model.refetch() }}
          />
        </>}</Show>
      </WorkAreaPanel>

      <WorkAreaPanel id="policies" active={areas.active()}>
        <AuthorityPoliciesPanel slug={params().slug} />
        {/* The policies say how much it may do; the standing grants say where
            it never has to ask — same question, so same tab. */}
        <StandingApprovalsPanel slug={params().slug} />
        <BoundsPanel slug={params().slug} />
      </WorkAreaPanel>

      <WorkAreaPanel id="runtime" active={areas.active()}>
        <Show when={model.data}>{data => (
          <RuntimeSwitchesPanel
            slug={params().slug}
            summary={data().summary ?? null}
            refresh={refresh}
            canRedeploy={overview.data?.platform?.capabilities?.canRedeploy}
          />
        )}</Show>
      </WorkAreaPanel>
  </PageShell>
}
