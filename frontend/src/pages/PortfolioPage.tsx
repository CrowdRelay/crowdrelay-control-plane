import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { PortfolioPanel } from '../components/PortfolioPanel'
import { PortfolioSettingsPanel } from '../components/PortfolioSettingsPanel'
import { FanSourcesPanel } from '../components/FanSourcesPanel'
import { SkeletonPageHead, SkeletonSection } from '../components/Skeleton'
import { refreshTick } from '../lib/refresh'
import type { TenantPortfolioSection } from '../lib/types'

const SECTION_LABEL: Record<TenantPortfolioSection, string> = {
  overview: 'Roster KPIs',
  amplification: 'Amplification edges',
  fanbases: 'Fan sources',
  settings: 'Brand settings',
}

// A section listed in `degraded` means the connected CrowdRelay build could
// not serve that read model — a deployment-version gap or a channel blip, not
// a failure of this page. It renders as a local notice while the remaining
// sections stay live.
function DegradedSections(props: { degraded: TenantPortfolioSection[] }) {
  return <Show when={props.degraded.length}>
    <For each={props.degraded}>{section => (
      <div class="warning-card" role="status">
        <strong>{SECTION_LABEL[section]}</strong> aren't available on the connected CrowdRelay build right
        now. The rest of the page keeps working; ship a newer CrowdRelay release and this lights up on the
        next refresh.
      </div>
    )}</For>
  </Show>
}

export function PortfolioPage() {
  const params = useParams({ from: '/tenants/$slug/portfolio' })
  // One purpose-built read model like every other tenant subpage: one initial
  // request, one refetch every 15 seconds that patches the store in place
  // (`reconcile: 'id'`), so panels don't flash or lose form state mid-cycle.
  const model = useQuery(() => ({
    queryKey: ['tenant-portfolio', params().slug, refreshTick()],
    queryFn: () => api.tenantPortfolio(params().slug),
    reconcile: 'id' as const,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  // Mutations stay on their own routes and refresh this one model afterwards.
  const refresh = () => model.refetch()

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">AUDIENCE</span>
        <h1>Label Portfolio</h1>
        <p>Roster-wide audience totals, the amplification edges routing one artist's release in front of another artist's consenting fans, and the fan sources feeding both. Fans never leave their home workspace.</p>
      </div>
    </div>
    <Show when={model.error}>
      <div class="error-card" role="alert">{model.error instanceof Error ? model.error.message : 'Portfolio channel unavailable'}</div>
    </Show>
    {/* Skeleton only before the first response; background refreshes keep the
        rendered page exactly like the Operations subpage does. */}
    <Show when={!model.error && model.isPending}><SkeletonPageHead /><SkeletonSection titleWidth="180px" lines={5} minHeight="180px" /><SkeletonSection titleWidth="200px" lines={4} minHeight="160px" /><SkeletonSection titleWidth="140px" lines={3} minHeight="120px" /></Show>
    <Show when={model.data} keyed>{(data) => <>
      <DegradedSections degraded={data.degraded} />
      <Show when={!data.degraded.includes('overview') || !data.degraded.includes('amplification')}>
        <PortfolioPanel
          slug={params().slug}
          overview={data.overview ?? undefined}
          consents={data.amplification?.consents}
          onChanged={refresh}
        />
      </Show>
      <Show when={!data.degraded.includes('fanbases')}>
        <FanSourcesPanel
          slug={params().slug}
          fanbases={data.fanbases?.fanbases}
          onChanged={refresh}
        />
      </Show>
      <Show when={!data.degraded.includes('settings')}>
        <PortfolioSettingsPanel
          slug={params().slug}
          model={data.settings ?? undefined}
          onChanged={refresh}
        />
      </Show>
    </>}</Show>
  </section>
}
