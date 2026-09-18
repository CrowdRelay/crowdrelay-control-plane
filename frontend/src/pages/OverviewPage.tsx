import { Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { RefreshCw } from 'lucide-solid'
import { api } from '../lib/api'
import { errorMessage, relativeTime } from '../lib/format'
import { authState } from '../lib/auth'
import { whileIncomplete, hasUnavailableTenant } from '../lib/incomplete'
import { cn } from '../lib/cn'
import { EmptyState } from '../components/ui/empty-state'
import { Button, buttonVariants } from '../components/app/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/app/card'
import { PageShell, PageHeader, ErrorCard } from '../components/layout'
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

  return <PageShell>
    <PageHeader
      title="Overview"
      description="What needs a person, whether the fans are growing, and how each tenant is doing."
      actions={
        <>
          <Show when={updated()}><span class="text-sm text-muted-foreground">Updated {updated()}</span></Show>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing()} aria-label="Refresh">
            <RefreshCw class={cn(refreshing() && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </>
      }
    />

    <Show when={commandCenter.isError}>
      <ErrorCard>{errorMessage(commandCenter.error, 'We couldn\'t reach the command center. Try refreshing.')}</ErrorCard>
    </Show>

    {/* 1. What needs a person, ranked. */}
    <NeedsYouCard ov={ov} loading={ccLoading()} />

    {/* 2. Are we getting more fans. */}
    <section aria-labelledby="north-star-heading" class="space-y-3">
      <h2 id="north-star-heading" class="text-base font-semibold text-foreground">North star</h2>
      <Show when={!ccLoading()} fallback={<NorthStarSkeleton />}>
        <Show when={ov.cc()}><NorthStarStrip ov={ov} /></Show>
      </Show>
    </section>

    {/* 3. How each tenant is doing. */}
    <Card>
      <CardHeader class="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle class="text-base">Tenants</CardTitle>
        <Show when={authState.isPlatformLevel()}>
          <Link to="/tenants" class={buttonVariants({ variant: 'ghost', size: 'sm' })}>Manage tenants</Link>
        </Show>
      </CardHeader>
      <CardContent class="p-0">
        <Show when={tenants.isError}>
          <div class="p-4"><ErrorCard>{errorMessage(tenants.error, 'We couldn\'t reach the tenant registry. Try refreshing.')}</ErrorCard></div>
        </Show>
        <Show when={!tenants.isError}>
          <Show when={tenants.data && ov.rows().length === 0}>
            <EmptyState label="No tenants provisioned" hint="Create your first tenant to start managing fan growth operations." />
          </Show>
          <Show when={!tenants.data || ov.rows().length > 0}>
            <TenantsTable rows={ov.rows()} loading={!tenants.data} ccLoading={ccLoading()} />
          </Show>
        </Show>
      </CardContent>
    </Card>

    {/* 4. What the machine is doing on its own, closed by default. */}
    <Show when={ov.cc()}><AutopilotSummary ov={ov} /></Show>

    {/* 5. Platform services, one line. A failing one is already listed above. */}
    <Show when={ov.platformServices().length > 0}>
      <ServicesRow services={ov.platformServices()} />
    </Show>
  </PageShell>
}
