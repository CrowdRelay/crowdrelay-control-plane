import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { AudienceOverviewPanel } from '../components/AudienceOverviewPanel'
import { FanTablePanel } from '../components/FanTablePanel'
import { SegmentPanel } from '../components/SegmentPanel'
import { SkeletonSection } from '../components/Skeleton'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { TabBar, TabPanel, useTabPanels, PageShell, PageHeader } from '../components/layout'
import { Alert } from '../components/ui/alert'
import { CommunityIntelligenceContent } from './CommunityIntelligenceContent'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'

const SECTION_LABEL: Record<string, string> = {
  overview: 'Audience KPIs',
  fans: 'Fan list',
  segments: 'Segments',
}

function DegradedSections(props: { degraded: string[] }) {
  return <Show when={props.degraded.length}>
    <For each={props.degraded}>{section => (
      <Alert tone="warning" role="status">
        <strong>{SECTION_LABEL[section] ?? section}</strong> aren't available on the connected CrowdRelay build right
        now. The rest of the page keeps working; ship a newer CrowdRelay release and this lights up on the
        next refresh.
      </Alert>
    )}</For>
  </Show>
}

export function AudiencePage() {
  const params = useParams({ from: '/tenants/$slug/audience' })
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('fans')
  const model = useQuery(() => ({
    queryKey: ['tenant-audience', params().slug],
    queryFn: () => api.audienceModel(params().slug),
    reconcile: 'id' as const,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // A section the tenant could not answer lands here as 200 with the
    // section named in `degraded`, so nothing retries it and the panel
    // stays empty for the life of the tab. Keep asking until it fills.
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))
  const refresh = () => model.refetch()

  return <PageShell>
    <PageHeader eyebrow="AUDIENCE" title="Audience" description="Every fan aggregated from all sides of the internet — Reddit, Meta, Spotify, Bandsintown, forums, press, live shows — in one view. Plus the communities where they already gather." />

    {/* Tab bar */}
    <TabBar
      active={activeTab()}
      onChange={switchTab}
      onPrefetch={prefetch}
      tabs={[
        { id: 'fans', label: 'Fans' },
        { id: 'communities', label: 'Communities' },
      ]}
    />

    {/* ── Fans tab — KPIs, fan list, segments ── */}
    <TabPanel active={activeTab()} id="fans" visited={isVisited('fans')}>
      <Show when={model.error}>
        <SectionFailureCard error={model.error} fallback="Audience channel unavailable" onRetry={() => void refresh()} />
      </Show>
      {/* Per-panel skeletons — page head and tab bar are static and already
          rendered above. Only the panel area is skeletoned. Shows whenever
          the read model is absent, not just on the very first fetch. */}
      <Show when={!model.error && !model.data}>
        <SkeletonSection titleWidth="160px" lines={4} minHeight="140px" />
        <SkeletonSection titleWidth="200px" lines={6} minHeight="200px" />
        <SkeletonSection titleWidth="140px" lines={3} minHeight="120px" />
      </Show>
      <Show when={model.data} keyed>{(data) => <>
        <DegradedSections degraded={data.degraded} />
        <Show when={!data.degraded.includes('overview')}>
          <AudienceOverviewPanel slug={params().slug} overview={data.overview ?? undefined} />
        </Show>
        <Show when={!data.degraded.includes('fans')}>
          <FanTablePanel slug={params().slug} fans={data.fans ?? []} />
        </Show>
        <Show when={!data.degraded.includes('segments')}>
          <SegmentPanel slug={params().slug} segments={data.segments ?? []} />
        </Show>
      </>}</Show>
    </TabPanel>

    {/* ── Communities tab — observation layer ── */}
    <TabPanel active={activeTab()} id="communities" visited={isVisited('communities')}>
      <CommunityIntelligenceContent slug={params().slug} />
    </TabPanel>
  </PageShell>
}
