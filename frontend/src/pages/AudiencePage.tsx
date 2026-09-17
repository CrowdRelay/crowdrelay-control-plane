import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { AudienceOverviewPanel } from '../components/AudienceOverviewPanel'
import { FanTablePanel } from '../components/FanTablePanel'
import { FanSourcesPanel } from '../components/FanSourcesPanel'
import { PortfolioPanel } from '../components/PortfolioPanel'
import { PortfolioSettingsPanel } from '../components/PortfolioSettingsPanel'
import { RedditCookieUploader } from '../components/RedditCookieUploader'
import { SegmentPanel } from '../components/SegmentPanel'
import { DriveContactsPanel } from '../components/DriveContactsPanel'
import { AcquisitionChannelsPanel } from '../components/AcquisitionChannelsPanel'
import { PlacesPanel } from '../components/PlacesPanel'
import { GigPlanPanel } from '../components/GigPlanPanel'
import { SkeletonSection } from '../components/Skeleton'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { TabBar, TabPanel, useTabPanels, PageShell, PageHeader } from '../components/layout'
import { Alert } from '../components/app/alert'
import { CommunityIntelligenceContent } from './CommunityIntelligenceContent'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'

// Each read model names its own sections — 'overview' means audience KPIs in
// the audience model but roster KPIs in the portfolio model, so the label map
// must travel with the model, not the page.
const AUDIENCE_SECTION_LABEL: Record<string, string> = {
  overview: 'Audience KPIs',
  fans: 'Fan list',
  segments: 'Segments',
}

const BAND_AUDIENCE_SECTION_LABEL: Record<string, string> = {
  overview: 'Audience numbers',
  fans: 'Fan list',
  segments: 'Segments',
}

const PORTFOLIO_SECTION_LABEL: Record<string, string> = {
  overview: 'Roster KPIs',
  amplification: 'Amplification edges',
  fanbases: 'Fan sources',
  settings: 'Brand settings',
}

const BAND_PORTFOLIO_SECTION_LABEL: Record<string, string> = {
  overview: 'Roster numbers',
  amplification: 'Amplification',
  fanbases: 'Fan sources',
  settings: 'Settings',
}

function DegradedSections(props: { degraded: string[]; labels: Record<string, string>; bandLabels?: Record<string, string> }) {
  const labelFor = (section: string) =>
    authState.isPlatformLevel()
      ? (props.labels[section] ?? section)
      : (props.bandLabels?.[section] ?? props.labels[section] ?? section)
  return <Show when={props.degraded.length}>
    <For each={props.degraded}>{section => (
      <Alert tone="warning" role="status">
        <Show when={authState.isPlatformLevel()} fallback={
          <>
            <strong>{labelFor(section)}</strong> couldn't be checked right now.
            The rest of the page keeps working — this comes back on its own.
          </>
        }>
          <strong>{labelFor(section)}</strong> aren't available on the connected CrowdRelay build right
          now. The rest of the page keeps working; ship a newer CrowdRelay release and this lights up on the
          next refresh.
        </Show>
      </Alert>
    )}</For>
  </Show>
}

export function AudiencePage() {
  const params = useParams({ from: '/tenants/$slug/audience' })
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('fans', ['fans', 'places', 'sources', 'contacts', 'communities', 'portfolio'])
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

  // The merged-in portfolio model — fan sources, amplification consents,
  // brand settings. Lazy: the Fans tab never pays for it.
  const portfolio = useQuery(() => ({
    queryKey: ['tenant-portfolio', params().slug],
    queryFn: () => api.tenantPortfolio(params().slug),
    enabled: isVisited('sources') || isVisited('portfolio'),
    reconcile: 'id' as const,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))
  const refreshPortfolio = () => portfolio.refetch()

  return <PageShell>
    <PageHeader eyebrow={authState.isPlatformLevel() ? 'AUDIENCE' : undefined} title="Audience" description="Every fan aggregated from all sides of the internet — Reddit, Meta, Spotify, Bandsintown, forums, press, live shows — in one view. Plus the communities where they already gather." />

    {/* Tab bar */}
    <TabBar
      active={activeTab()}
      onChange={switchTab}
      onPrefetch={prefetch}
      tabs={[
        { id: 'fans', label: 'Fans' },
        // Place sits next to Fans because it is the same question asked
        // geographically — where the people already are, and what rooms are
        // near them. It is not an operation you run, so it does not belong on
        // Operations, and it is not a report, so it does not belong on
        // Intelligence.
        { id: 'places', label: 'Places' },
        { id: 'sources', label: 'Sources' },
        { id: 'contacts', label: 'Contacts' },
        { id: 'communities', label: 'Communities' },
        { id: 'portfolio', label: authState.isPlatformLevel() ? 'Label portfolio' : 'Portfolio' },
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
        <DegradedSections degraded={data.degraded} labels={AUDIENCE_SECTION_LABEL} bandLabels={BAND_AUDIENCE_SECTION_LABEL} />
        <Show when={!data.degraded.includes('overview')}>
          <AudienceOverviewPanel slug={params().slug} overview={data.overview ?? undefined} onGoSources={() => switchTab('sources')} onGoCommunities={() => switchTab('communities')} />
        </Show>
        <Show when={!data.degraded.includes('fans')}>
          <FanTablePanel slug={params().slug} fans={data.fans ?? []} onImported={() => void refresh()} />
        </Show>
        <Show when={!data.degraded.includes('segments')}>
          <SegmentPanel slug={params().slug} segments={data.segments ?? []} />
        </Show>
      </>}</Show>
    </TabPanel>

    {/* ── Places tab — what to book, then the cities and rooms it reads ── */}
    <TabPanel active={activeTab()} id="places" visited={isVisited('places')}>
      {/* The plan sits above its evidence on purpose: the question the tab
          answers is "what should I book", and the funnel and rooms below are
          what that answer stands on. */}
      <GigPlanPanel slug={params().slug} />
      <PlacesPanel slug={params().slug} />
    </TabPanel>

    {/* ── Sources tab — where the fans come from (merged from Portfolio) ── */}
    <TabPanel active={activeTab()} id="sources" visited={isVisited('sources')}>
      <Show when={portfolio.error}>
        <SectionFailureCard error={portfolio.error} fallback="Fan sources unavailable" onRetry={refreshPortfolio} />
      </Show>
      <Show when={!portfolio.error && !portfolio.data}>
        <SkeletonSection titleWidth="160px" lines={4} minHeight="140px" />
      </Show>
      <Show when={portfolio.data} keyed>{(data) => <>
        <Show when={data.degraded.includes('fanbases')}>
          <DegradedSections degraded={['fanbases']} labels={PORTFOLIO_SECTION_LABEL} bandLabels={BAND_PORTFOLIO_SECTION_LABEL} />
        </Show>
        <Show when={!data.degraded.includes('fanbases')}>
          <FanSourcesPanel slug={params().slug} fanbases={data.fanbases?.fanbases} onChanged={refreshPortfolio} />
        </Show>
      </>}</Show>
      {/* Where they came from *and whether it converted* — the source-ROI
          read is what makes this the one page that answers "where do our
          fans come from". */}
      <AcquisitionChannelsPanel slug={params().slug} />
      {/* Reddit cookie refresh — a fan source enabler, same home it had on
          the portfolio page. The cookies.txt recovery path is crew
          machinery: the account it revives is ours, so the band never sees
          the panel. */}
      <Show when={authState.isPlatformLevel()}>
        <RedditCookieUploader slug={params().slug} />
      </Show>
    </TabPanel>

    {/* ── Contacts tab — Drive/Gmail imports awaiting review ── */}
    <TabPanel active={activeTab()} id="contacts" visited={isVisited('contacts')}>
      <DriveContactsPanel slug={params().slug} />
    </TabPanel>

    {/* ── Communities tab — observation layer ── */}
    <TabPanel active={activeTab()} id="communities" visited={isVisited('communities')}>
      <CommunityIntelligenceContent slug={params().slug} />
    </TabPanel>

    {/* ── Label portfolio tab — roster KPIs, consent edges, settings ── */}
    <TabPanel active={activeTab()} id="portfolio" visited={isVisited('portfolio')}>
      <Show when={portfolio.error}>
        <SectionFailureCard error={portfolio.error} fallback="Portfolio channel unavailable" onRetry={refreshPortfolio} />
      </Show>
      <Show when={!portfolio.error && !portfolio.data}>
        <SkeletonSection titleWidth="140px" lines={3} minHeight="120px" />
      </Show>
      <Show when={portfolio.data} keyed>{(data) => <>
        <DegradedSections degraded={data.degraded} labels={PORTFOLIO_SECTION_LABEL} bandLabels={BAND_PORTFOLIO_SECTION_LABEL} />
        <Show when={!data.degraded.includes('overview') || !data.degraded.includes('amplification')}>
          <PortfolioPanel
            slug={params().slug}
            overview={data.overview ?? undefined}
            consents={data.amplification?.consents}
            consentsUnavailable={data.degraded.includes('amplification')}
            onChanged={refreshPortfolio}
          />
        </Show>
        <Show when={!data.degraded.includes('settings')}>
          <PortfolioSettingsPanel
            slug={params().slug}
            model={data.settings ?? undefined}
            onChanged={refreshPortfolio}
          />
        </Show>
      </>}</Show>
    </TabPanel>
  </PageShell>
}
