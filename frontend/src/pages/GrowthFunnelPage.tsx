import { useParams } from '@tanstack/solid-router'
import { GrowthFunnelPanel } from '../components/GrowthFunnelPanel'
import { GrowthMetricsPanel } from '../components/GrowthMetricsPanel'
import { GrowthObjectivesPanel } from '../components/GrowthObjectivesPanel'

export function GrowthFunnelPage() {
  const params = useParams({ from: '/tenants/$slug/funnel' })

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">TENANT / {params().slug.toUpperCase()}</span>
        <h1>Growth Funnel</h1>
        <p>The full fan growth journey — from community discovery through outreach, engagement, and conversion. See where fans drop off and what to act on.</p>
      </div>
    </div>
    <GrowthFunnelPanel slug={params().slug} />
    <GrowthMetricsPanel slug={params().slug} />
    <GrowthObjectivesPanel slug={params().slug} />
  </section>
}
