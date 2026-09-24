import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { AudienceOverviewPanel } from '../components/AudienceOverviewPanel'
import { FanTablePanel } from '../components/FanTablePanel'
import { FanSourcesPanel } from '../components/FanSourcesPanel'
import { PortfolioPanel } from '../components/PortfolioPanel'
import { RedditCookieUploader } from '../components/RedditCookieUploader'
import { SegmentPanel } from '../components/SegmentPanel'
import { ContactsPanel } from '../components/ContactsPanel'
import { AcquisitionChannelsPanel } from '../components/AcquisitionChannelsPanel'
import { SkeletonSection } from '../components/Skeleton'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { TabBar, TabPanel, useTabPanels, PageShell, PageHeader } from '../components/layout'
import { Alert } from '../components/app/alert'
import { Button } from '../components/app/button'
import { RefreshCw } from 'lucide-solid'
import { relativeTime } from '../lib/format'
import { cn } from '../lib/cn'
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
}

const BAND_PORTFOLIO_SECTION_LABEL: Record<string, string> = {
  overview: 'Roster numbers',
  amplification: 'Amplification',
  fanbases: 'Fan sources',
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
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('fans', ['fans', 'sources', 'contacts', 'communities', 'portfolio'])
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

  // The merged-in portfolio model — fan sources and amplification consents.
  // The settings it used to carry moved to the tenant page's Workspace tab;
  // the keys it used to mount moved to Access. Lazy: the Fans tab never
  // pays for it.
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
  const refreshAll = () => { void refresh(); if (portfolio.isFetched) void refreshPortfolio() }
  const refreshing = () => model.isFetching || portfolio.isFetching

  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now()
    const ts = Math.max(model.dataUpdatedAt, portfolio.dataUpdatedAt)
    return ts === 0 ? null : relativeTime(ts)
  })

  return <PageShell>
    <PageHeader
      title="Audience"
      description="Every fan from every source in one place, and the communities where they already gather."
      actions={
        <>
          <Show when={updated()}><span class="text-sm text-muted-foreground">Updated {updated()}</span></Show>
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={refreshing()} aria-label="Refresh">
            <RefreshCw class={cn(refreshing() && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </>
      }
    />

    {/* Tab bar */}
    <TabBar
      active={activeTab()}
      onChange={switchTab}
      onPrefetch={prefetch}
      tabs={[
        { id: 'fans', label: 'Fans' },
        { id: 'sources', label: 'Sources' },
        { id: 'contacts', label: 'Contacts' },
        { id: 'communities', label: 'Communities' },
        { id: 'portfolio', label: authState.isPlatformLevel() ? 'Label portfolio' : 'Portfolio' },
      ]}
    />

    {/* ── Fans tab — the funnel (sources → captured → activated →
          retained → converted), then the people and their segments ── */}
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
          <AudienceOverviewPanel slug={params().slug} overview={data.overview ?? undefined} onGoSources={() => switchTab('sources')} onGoCommunities={() => switchTab('communities')} onGoContacts={() => switchTab('contacts')} />
        </Show>
        <Show when={!data.degraded.includes('fans')}>
          <FanTablePanel slug={params().slug} fans={data.fans ?? []} onImported={() => void refresh()} />
        </Show>
        <Show when={!data.degraded.includes('segments')}>
          <SegmentPanel slug={params().slug} segments={data.segments ?? []} />
        </Show>
      </>}</Show>
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

    {/* ── Contacts tab — one directory by kind: booking contacts,
          amplifiers (the beacon roster + funnel), fan channels, and the
          staged imports awaiting review. The old Beacons destination
          redirects here. ── */}
    <TabPanel active={activeTab()} id="contacts" visited={isVisited('contacts')}>
      <ContactsPanel slug={params().slug} />
    </TabPanel>

    {/* ── Communities tab — observation layer ── */}
    <TabPanel active={activeTab()} id="communities" visited={isVisited('communities')}>
      <CommunityIntelligenceContent slug={params().slug} />
    </TabPanel>

    {/* ── Label portfolio tab — roster KPIs and consent edges. Settings and
          keys moved to the tenant page: Workspace holds the editors, Access
          holds the secrets. ── */}
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
      </>}</Show>
    </TabPanel>
  </PageShell>
}
