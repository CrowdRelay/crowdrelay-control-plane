import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api, ApiError } from '../lib/api'
import { PortfolioPanel } from '../components/PortfolioPanel'
import { PortfolioSettingsPanel } from '../components/PortfolioSettingsPanel'
import { FanSourcesPanel } from '../components/FanSourcesPanel'

// A 404 from these read models means the connected CrowdRelay build predates
// the portfolio management routes — a deployment-version gap, not a runtime
// failure. It deserves an explanation, never a raw "not found".
const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404

export function PortfolioPage() {
  const params = useParams({ from: '/tenants/$slug/portfolio' })
  // Both read models come from one upstream tenant per tab; polling stays at
  // human speed because the portfolio changes at campaign speed, not tick speed.
  const overview = useQuery(() => ({
    queryKey: ['portfolio-overview', params().slug],
    queryFn: () => api.portfolioOverview(params().slug),
    refetchInterval: 30_000,
  }))
  const edges = useQuery(() => ({
    queryKey: ['portfolio', params().slug],
    queryFn: () => api.portfolioEdges(params().slug),
    refetchInterval: 30_000,
  }))
  const fanbases = useQuery(() => ({
    queryKey: ['fanbases', params().slug],
    queryFn: () => api.fanbases(params().slug),
  }))
  const settings = useQuery(() => ({
    queryKey: ['portfolio-settings', params().slug],
    queryFn: () => api.portfolioSettings(params().slug),
    staleTime: 60_000,
    retry: false,
  }))
  const refresh = () => {
    void overview.refetch()
    void edges.refetch()
    void settings.refetch()
    void fanbases.refetch()
  }

  const surfaceUnavailable = () =>
    (isNotFound(overview.error) || isNotFound(edges.error))
    && !(overview.data || edges.data)

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">TENANT / {params().slug.toUpperCase()}</span>
        <h1>Label Portfolio</h1>
        <p>Roster-wide audience totals and the amplification edges routing one artist's release or show in front of another artist's consenting fans. Fans never leave their home workspace.</p>
      </div>
    </div>
    <Show when={surfaceUnavailable()}>
      <div class="notice-card">
        <strong>Label Portfolio isn't available on the connected CrowdRelay build yet.</strong><br />
        This tenant's CrowdRelay deployment predates the portfolio management routes, so there is nothing to read here. Ship a CrowdRelay release that includes them and this page lights up automatically.
        <div style={{ 'margin-top': '10px' }}><button class="ghost" onClick={refresh}>Re-check</button></div>
      </div>
    </Show>
    <Show when={!surfaceUnavailable() && (overview.error || edges.error)}>
      <div class="error-card" role="alert">
        {(() => {
          const failure = overview.error ?? edges.error
          return failure instanceof Error ? failure.message : 'Portfolio channel unavailable'
        })()}
      </div>
    </Show>
    <Show when={!surfaceUnavailable() && !overview.isPending && !overview.error}><PortfolioPanel
      slug={params().slug}
      overview={overview.data}
      consents={edges.data?.consents}
      onChanged={refresh}
    /></Show>
    <FanSourcesPanel
      slug={params().slug}
      fanbases={fanbases.data?.fanbases}
      onChanged={refresh}
    />
    <Show when={overview.isPending}><div class="skeleton-block"/></Show>
    {/* A settings 404 simply means the upstream has no overrides yet — stay
        quiet instead of rendering an empty panel with a scary error. */}
    <Show when={!settings.isPending && !isNotFound(settings.error)}>
      <PortfolioSettingsPanel
        slug={params().slug}
        model={settings.data}
        onChanged={refresh}
      />
    </Show>
  </section>
}
