import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { AudienceOverviewPanel } from '../components/AudienceOverviewPanel'
import { FanTablePanel } from '../components/FanTablePanel'
import { SegmentPanel } from '../components/SegmentPanel'
import { SkeletonPageHead, SkeletonSection } from '../components/Skeleton'
import { refreshTick } from '../lib/refresh'

const SECTION_LABEL: Record<string, string> = {
  overview: 'Audience KPIs',
  fans: 'Fan list',
  segments: 'Segments',
}

function DegradedSections(props: { degraded: string[] }) {
  return <Show when={props.degraded.length}>
    <For each={props.degraded}>{section => (
      <div class="warning-card" role="status">
        <strong>{SECTION_LABEL[section] ?? section}</strong> aren't available on the connected CrowdRelay build right
        now. The rest of the page keeps working; ship a newer CrowdRelay release and this lights up on the
        next refresh.
      </div>
    )}</For>
  </Show>
}

export function AudiencePage() {
  const params = useParams({ from: '/tenants/$slug/audience' })
  const model = useQuery(() => ({
    queryKey: ['tenant-audience', params().slug, refreshTick()],
    queryFn: () => api.audienceModel(params().slug),
    reconcile: 'id' as const,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const refresh = () => model.refetch()

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">AUDIENCE</span>
        <h1>Fan Intelligence</h1>
        <p>Every fan aggregated from all sides of the internet — Reddit, Meta, Spotify, Bandsintown, forums, press, live shows — in one view. Search, segment, and understand who your fans are and how they found you.</p>
      </div>
    </div>
    <Show when={model.error}>
      <div class="error-card" role="alert">{model.error instanceof Error ? model.error.message : 'Audience channel unavailable'}</div>
    </Show>
    <Show when={!model.error && model.isPending}><SkeletonPageHead /><SkeletonSection titleWidth="160px" lines={4} minHeight="140px" /><SkeletonSection titleWidth="200px" lines={6} minHeight="200px" /><SkeletonSection titleWidth="140px" lines={3} minHeight="120px" /></Show>
    <Show when={model.data} keyed>{(data) => <>
      <DegradedSections degraded={data.degraded} />
      <Show when={!data.degraded.includes('overview')}>
        <AudienceOverviewPanel overview={data.overview ?? undefined} />
      </Show>
      <Show when={!data.degraded.includes('fans')}>
        <FanTablePanel slug={params().slug} fans={data.fans ?? []} />
      </Show>
      <Show when={!data.degraded.includes('segments')}>
        <SegmentPanel slug={params().slug} segments={data.segments ?? []} />
      </Show>
    </>}</Show>
  </section>
}
