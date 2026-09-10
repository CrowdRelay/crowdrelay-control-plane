import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { PortfolioPanel } from '../components/PortfolioPanel'
import { PortfolioSettingsPanel } from '../components/PortfolioSettingsPanel'
import { FanSourcesPanel } from '../components/FanSourcesPanel'
import { RedditCookieUploader } from '../components/RedditCookieUploader'
import { SkeletonPortfolio, SkeletonSection } from '../components/Skeleton'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { PageShell, PageHeader } from '../components/layout'
import { Alert } from '../components/ui/alert'
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
      <Alert tone="warning" role="status">
        <strong>{SECTION_LABEL[section]}</strong> aren't available on the connected CrowdRelay build right
        now. The rest of the page keeps working; ship a newer CrowdRelay release and this lights up on the
        next refresh.
      </Alert>
    )}</For>
  </Show>
}

export function PortfolioPage() {
  const params = useParams({ from: '/tenants/$slug/portfolio' })
  // One purpose-built read model like every other tenant subpage: one initial
  // request, one refetch every 15 seconds that patches the store in place
  // (`reconcile: 'id'`), so panels don't flash or lose form state mid-cycle.
  const model = useQuery(() => ({
    queryKey: ['tenant-portfolio', params().slug],
    queryFn: () => api.tenantPortfolio(params().slug),
    reconcile: 'id' as const,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  // Mutations stay on their own routes and refresh this one model afterwards.
  const refresh = () => model.refetch()

  return <PageShell>
    <PageHeader
      eyebrow="AUDIENCE"
      title="Label Portfolio"
      description="Roster-wide audience totals, the amplification edges routing one artist's release in front of another artist's consenting fans, and the fan sources feeding both. Fans never leave their home workspace."
    />

    {/* Main portfolio read model — per-panel skeletons while data is
        absent, not a page-wide block. Independent components (Reddit
        cookies) mount immediately and fetch in parallel, so a slow main
        query or a failing agent service never delays them. */}
    <Show when={model.error}>
      <SectionFailureCard error={model.error} fallback="Portfolio channel unavailable" onRetry={() => void refresh()} />
    </Show>
    <Show when={!model.error && !model.data}>
      <SkeletonPortfolio />
    </Show>
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
    </>}</Show>

    {/* Reddit cookie refresh — mounts immediately, has its own query.
        Agent-service failures degrade only this section. */}
    <RedditCookieUploader slug={params().slug} />

    {/* Settings — waits for the main read model like the portfolio panels. */}
    <Show when={!model.error && !model.data}>
      <SkeletonSection titleWidth="140px" lines={3} minHeight="120px" />
    </Show>
    <Show when={model.data} keyed>{(data) =>
      <Show when={!data.degraded.includes('settings')}>
        <PortfolioSettingsPanel
          slug={params().slug}
          model={data.settings ?? undefined}
          onChanged={refresh}
        />
      </Show>
    }</Show>
  </PageShell>
}
