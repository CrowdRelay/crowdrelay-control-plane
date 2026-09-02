import { useParams } from '@tanstack/solid-router'
import { GrowthFunnelPanel } from '../components/GrowthFunnelPanel'
import { GrowthMetricsPanel } from '../components/GrowthMetricsPanel'
import { GrowthObjectivesPanel } from '../components/GrowthObjectivesPanel'

export function GrowthFunnelPage() {
  const params = useParams({ from: '/tenants/$slug/funnel' })

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">AUDIENCE</span>
        <h1>Growth</h1>
        <p>Where the audience actually is, how the funnel converts it, and what the brain is aiming at. The single place for growth state — Operations keeps only what you act on.</p>
      </div>
    </div>
    <GrowthMetricsPanel slug={params().slug} />
    <GrowthFunnelPanel slug={params().slug} />
    <GrowthObjectivesPanel slug={params().slug} />
  </section>
}
