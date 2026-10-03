import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { whileIncomplete, hasUnavailableTenant } from '../lib/incomplete'
import { PageShell, ErrorCard } from '../components/layout'
import { DashHeader, Tile, Tiles } from '../components/ui/dash'
import { FleetList } from '../components/FleetList'
import {
  useOverviewModel,
  NeedsYouCard,
  NorthStarStrip,
  NorthStarSkeleton,
  AutopilotSummary,
  ServicesRow,
} from '../components/OverviewBlocks'

// The platform overview is a command centre, not a dashboard builder.
// It answers, in one scroll: what needs a person, are fans growing, and which
// tenant deserves attention next. Deeper operational machinery stays collapsed
// or on its dedicated pages rather than behind five mutually exclusive tabs.
export function OverviewPage() {
  const tenants = useQuery(() => ({
    queryKey: ['tenants'],
    queryFn: api.tenants,
    refetchOnWindowFocus: false,
    reconcile: 'id',
    staleTime: 15_000,
  }))

  // A command centre that reports a tenant as unavailable is not an answer,
  // and it arrives as 200 so nothing retries it. Keep asking until the
  // sections land, so the fan counts fill in rather than staying dashes.
  const commandCenter = useQuery(() => ({
    queryKey: ['command-center'],
    queryFn: api.commandCenter,
    enabled: authState.isPlatformLevel(),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    refetchInterval: whileIncomplete(hasUnavailableTenant),
  }))

  const ov = useOverviewModel(tenants, commandCenter)
  const ccLoading = () => !commandCenter.data && !commandCenter.isError
  const t = () => ov.cc()?.tenants ?? null
  const waitingTenants = () =>
    (ov.cc()?.perTenant ?? []).filter(p => (p.attention.needsYou ?? 0) > 0)

  return (
    <PageShell>
      <DashHeader
        title="Overview"
        subtitle="What needs a person, whether fans are growing, and which tenant to open next"
      />

      <Show when={commandCenter.isError}>
        <ErrorCard
          title="Couldn't load the command center"
          error={commandCenter.error}
          onRetry={() => void commandCenter.refetch()}
        />
      </Show>
      <Show when={tenants.isError}>
        <ErrorCard
          title="Couldn't load tenants"
          error={tenants.error}
          onRetry={() => void tenants.refetch()}
        />
      </Show>

      <Tiles>
        <Tile
          label="Tenants"
          value={t()?.total ?? tenants.data?.items.length}
          sub={t() ? `${t()!.healthy} healthy · ${t()!.unknown + t()!.stale} unknown` : undefined}
        />
        <Tile
          label="Waiting on people"
          value={ov.cc()?.attention.needsYou}
          sub={waitingTenants().length === 1
            ? `all in ${waitingTenants()[0]!.displayName}`
            : `in ${waitingTenants().length} tenants`}
        />
        <Tile
          label="Services"
          value={ov.platformServices().length
            ? <>{ov.healthyServices()}<span class="text-sm font-normal text-muted-foreground"> / {ov.platformServices().length}</span></>
            : null}
          sub={ov.platformServices().map(s => s.label).join(' · ') || undefined}
        />
      </Tiles>

      <NeedsYouCard ov={ov} loading={ccLoading()} />

      <Show when={!ccLoading()} fallback={<NorthStarSkeleton />}>
        <Show when={ov.cc()}>
          <NorthStarStrip ov={ov} />
        </Show>
      </Show>

      {/* Overview only needs the urgent slice. The full tenant inventory lives
          at /tenants; capping this list keeps the platform hot path bounded. */}
      <FleetList
        rows={ov.rows()}
        canCreate={authState.isAdmin()}
        limit={8}
        showAllLink
      />

      <Show when={ov.cc()}>
        <AutopilotSummary ov={ov} />
      </Show>
      <Show when={ov.platformServices().length > 0}>
        <ServicesRow services={ov.platformServices()} />
      </Show>
    </PageShell>
  )
}
