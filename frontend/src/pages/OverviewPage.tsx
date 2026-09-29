import { Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { RefreshCw } from 'lucide-solid'
import { api } from '../lib/api'
import { errorMessage, relativeTime } from '../lib/format'
import { authState } from '../lib/auth'
import { whileIncomplete, hasUnavailableTenant } from '../lib/incomplete'
import { cn } from '../lib/cn'
import { EmptyState } from '../components/ui/empty-state'
import { PageShell, ErrorCard } from '../components/layout'
import { DashHeader, IconAct, Tile, Tiles, WorkAreaPanel, WorkAreas, useWorkAreas } from '../components/ui/dash'
import { FleetList } from '../components/FleetList'
import { useOverviewModel, NeedsYouCard, NorthStarStrip, NorthStarSkeleton, TenantsTable, AutopilotSummary, ServicesRow } from '../components/OverviewBlocks'

// The overview answers three questions in order: what needs a person, are we
// getting more fans, and how is each tenant doing. Everything the machine
// does on its own sits below, closed.
export function OverviewPage() {
  const qc = useQueryClient()
  const tenants = useQuery(() => ({ queryKey: ['tenants'], queryFn: api.tenants, refetchOnWindowFocus: false, reconcile: 'id', staleTime: 15_000 }))
  // A command centre that reports a tenant as unavailable is not an answer,
  // and it arrives as 200 so nothing retries it. Keep asking until the
  // sections land, so the fan counts fill in rather than staying dashes.
  const commandCenter = useQuery(() => ({
    queryKey: ['command-center'],
    queryFn: api.commandCenter,
    // Band sessions redirect away in beforeLoad — but a tenant operator
    // with no tenantSlug on the profile would still mount the page, and
    // this endpoint is platform-only: never fire a guaranteed 403.
    enabled: authState.isPlatformLevel(),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    refetchInterval: whileIncomplete(hasUnavailableTenant),
  }))

  const ov = useOverviewModel(tenants, commandCenter)
  const ccLoading = () => !commandCenter.data && !commandCenter.isError

  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now()
    const ts = Math.max(tenants.dataUpdatedAt, commandCenter.dataUpdatedAt)
    return ts === 0 ? null : relativeTime(ts)
  })
  const refreshing = () => tenants.isFetching || commandCenter.isFetching
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['tenants'] })
    void qc.invalidateQueries({ queryKey: ['command-center'] })
  }

  const areas = useWorkAreas(['needs', 'northstar', 'autopilot', 'table'])
  const t = () => ov.cc()?.tenants ?? null
  const notReporting = () => ov.silentTenants() + (t()?.unknown ?? 0) + (t()?.stale ?? 0)
  const pill = (): { tone: 'good' | 'warn' | 'bad' | 'muted'; text: string } | null => {
    const cc = ov.cc()
    if (!cc) return null
    if (cc.attention.criticalAlerts > 0) return { tone: 'bad', text: `${cc.attention.criticalAlerts} critical alert${cc.attention.criticalAlerts === 1 ? '' : 's'}` }
    if (notReporting() > 0) return { tone: 'warn', text: `${notReporting()} ${notReporting() === 1 ? 'tenant' : 'tenants'} not reporting` }
    return { tone: 'good', text: 'Fleet healthy' }
  }
  const northStar = () => {
    const values = (ov.cc()?.perTenant ?? []).map(p => p.momentum.northStarLatest).filter((v): v is number => v != null)
    return values.length ? values.reduce((a, b) => a + b, 0) : null
  }
  const waitingTenants = () => (ov.cc()?.perTenant ?? []).filter(p => (p.attention.needsYou ?? 0) > 0)

  return <PageShell>
    <DashHeader
      title="Overview"
      subtitle="The fleet, and who needs attention first"
      pill={pill()}
      actions={
        <IconAct onClick={refresh} disabled={refreshing()} label="Refresh" title={updated() ? `Updated ${updated()}` : 'Refresh'}>
          <RefreshCw class={cn('size-3.5', refreshing() && 'animate-spin')} aria-hidden="true" />
        </IconAct>
      }
    />

    <Show when={commandCenter.isError}>
      <ErrorCard>{errorMessage(commandCenter.error, 'We couldn\'t reach the command center. Try refreshing.')}</ErrorCard>
    </Show>
    <Show when={tenants.isError}>
      <ErrorCard>{errorMessage(tenants.error, 'We couldn\'t reach the tenant registry. Try refreshing.')}</ErrorCard>
    </Show>

    <Tiles>
      <Tile label="Tenants" value={t()?.total ?? tenants.data?.items.length} sub={t() ? `${t()!.healthy} healthy · ${t()!.unknown + t()!.stale} unknown` : undefined} />
      <Tile
        label="Services"
        value={ov.platformServices().length ? <>{ov.healthyServices()}<span class="text-sm font-normal text-muted-foreground"> / {ov.platformServices().length}</span></> : null}
        sub={ov.platformServices().map(s => s.label).join(' · ') || undefined}
      />
      <Tile label="North star, all tenants" value={northStar()} sub="each tenant's own measure, added" />
      <Tile label="Waiting on people" value={ov.cc()?.attention.needsYou} sub={waitingTenants().length === 1 ? `all in ${waitingTenants()[0]!.displayName}` : `in ${waitingTenants().length} tenants`} />
    </Tiles>

    <FleetList rows={ov.rows()} canCreate={authState.isAdmin()} />

    <WorkAreas
      active={areas.active()}
      onToggle={areas.toggle}
      areas={[
        { id: 'needs', label: 'What needs a person', count: ov.needsYou().length || null },
        { id: 'northstar', label: 'North star' },
        { id: 'autopilot', label: 'Autopilot' },
        { id: 'table', label: 'Tenant table' },
      ]}
    />
    <WorkAreaPanel id="needs" active={areas.active()}>
      <NeedsYouCard ov={ov} loading={ccLoading()} />
    </WorkAreaPanel>
    <WorkAreaPanel id="northstar" active={areas.active()}>
      <Show when={!ccLoading()} fallback={<NorthStarSkeleton />}>
        <Show when={ov.cc()}><NorthStarStrip ov={ov} /></Show>
      </Show>
    </WorkAreaPanel>
    <WorkAreaPanel id="autopilot" active={areas.active()}>
      <Show when={ov.cc()}><AutopilotSummary ov={ov} /></Show>
      <Show when={ov.platformServices().length > 0}><ServicesRow services={ov.platformServices()} /></Show>
    </WorkAreaPanel>
    <WorkAreaPanel id="table" active={areas.active()}>
      <Show when={tenants.data && ov.rows().length === 0}>
        <EmptyState label="No tenants provisioned" hint="Create your first tenant to start managing fan growth operations." />
      </Show>
      <Show when={!tenants.data || ov.rows().length > 0}>
        <TenantsTable rows={ov.rows()} loading={!tenants.data} ccLoading={ccLoading()} />
      </Show>
    </WorkAreaPanel>
  </PageShell>
}
