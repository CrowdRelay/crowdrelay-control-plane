import { Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { PortfolioPanel } from '../components/PortfolioPanel'

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
  const refresh = () => {
    void overview.refetch()
    void edges.refetch()
  }

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">TENANT / {params().slug.toUpperCase()}</span>
        <h1>Label Portfolio</h1>
        <p>Roster-wide audience totals and the amplification edges routing one artist's release or show in front of another artist's consenting fans. Fans never leave their home workspace.</p>
      </div>
    </div>
    <Show when={overview.error || edges.error}>
      <div class="error-card" role="alert">
        {(() => {
          const failure = overview.error ?? edges.error
          return failure instanceof Error ? failure.message : 'Portfolio channel unavailable'
        })()}
      </div>
    </Show>
    <Show when={!overview.isPending}><PortfolioPanel
      slug={params().slug}
      overview={overview.data}
      consents={edges.data?.consents}
      onChanged={refresh}
    /></Show>
    <Show when={overview.isPending}><div class="skeleton-block"/></Show>
  </section>
}
