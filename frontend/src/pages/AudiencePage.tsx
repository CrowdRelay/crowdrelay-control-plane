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
import { ConnectionHealthPanel } from '../components/ConnectionHealthPanel'
import { FanMessagesPanel } from '../components/FanMessagesPanel'
import { FanConversionPanel } from '../components/FanConversionPanel'
import { ContactsPanel } from '../components/ContactsPanel'
import { AcquisitionChannelsPanel } from '../components/AcquisitionChannelsPanel'
import { SkeletonSection } from '../components/Skeleton'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { PageShell } from '../components/layout'
import { DashHeader, IconAct, SubPagePanel, useSubPage } from '../components/ui/dash'
import { Alert } from '../components/app/alert'
import { Button } from '../components/app/button'
import { RefreshCw } from 'lucide-solid'
import { relativeTime } from '../lib/format'
import { humanize } from '../lib/opportunity-labels'
import { cn } from '../lib/cn'
import { CommunityIntelligenceContent } from './CommunityIntelligenceContent'
import { AudienceFirstScreen } from '../components/AudienceFirstScreen'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'

// Each read model names its own sections — 'overview' means audience KPIs in
// the audience model but roster KPIs in the portfolio model, so the label map
// must travel with the model, not the page.
const AUDIENCE_SECTION_LABEL: Record<string, string> = {
  overview: 'Audience KPIs',
  fans: 'Fan list',
  segments: 'Segments',
  growth_metrics: 'Followers per platform',
  acquisition_sources: 'Arrival sources',
  signal: 'Signal activity',
}

const BAND_AUDIENCE_SECTION_LABEL: Record<string, string> = {
  overview: 'Audience numbers',
  fans: 'Fan list',
  segments: 'Segments',
  growth_metrics: 'Followers per platform',
  acquisition_sources: 'Where fans came from',
  signal: 'New fans',
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
      ? (props.labels[section] ?? humanize(section))
      : (props.bandLabels?.[section] ?? props.labels[section] ?? humanize(section))
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

export type AudienceSection = 'overview' | 'fans' | 'sources' | 'contacts' | 'communities' | 'portfolio'

const SECTION_TITLE: Record<AudienceSection, string> = {
  overview: 'Audience',
  fans: 'Fans',
  sources: 'Sources',
  contacts: 'Contacts',
  communities: 'Communities',
  portfolio: 'Portfolio',
}

export const AudienceOverviewPage = () => <AudiencePage section="overview" />
export const AudienceFansPage = () => <AudiencePage section="fans" />
export const AudienceSourcesPage = () => <AudiencePage section="sources" />
export const AudienceContactsPage = () => <AudiencePage section="contacts" />
export const AudienceCommunitiesPage = () => <AudiencePage section="communities" />
export const AudiencePortfolioPage = () => <AudiencePage section="portfolio" />

export function AudiencePage(props: { section: AudienceSection }) {
  const params = useParams({ strict: false }) as () => { slug: string }
  const areas = useSubPage(() => props.section, '/tenants/$slug/audience')
  const switchTab = (id: string) => areas.open(id)
  const isVisited = (id: string) => areas.active() === id
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
  const [showMessages, setShowMessages] = createSignal(window.location.hash.includes('message'))

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
    <DashHeader
      title={props.section === 'portfolio' && authState.isPlatformLevel() ? 'Label portfolio' : SECTION_TITLE[props.section]}
      subtitle="Who follows you, and who you can reach"
      pill={model.data?.signal?.activity
        ? (model.data.signal.activity.new_fans_7d > 0
          ? { tone: 'good', text: `+${model.data.signal.activity.new_fans_7d} fans this week` }
          : { tone: 'warn', text: 'No new fans this week' })
        : null}
      actions={
        <IconAct onClick={refreshAll} disabled={refreshing()} label="Refresh" title={updated() ? `Updated ${updated()}` : 'Refresh'}>
          <RefreshCw class={cn('size-3.5', refreshing() && 'animate-spin')} aria-hidden="true" />
        </IconAct>
      }
    />


    <SubPagePanel when={areas.active() === 'overview'}>
      <Show when={model.data}>{data => <AudienceFirstScreen slug={params().slug} model={data()} />}</Show>
    </SubPagePanel>

    {/* ── Fans tab — the funnel (sources → captured → activated →
          retained → converted), then the people and their segments ── */}
    <SubPagePanel when={areas.active() === 'fans'}>
      <Show when={model.error}>
        <SectionFailureCard error={model.error} title="Couldn't load your audience" onRetry={() => void refresh()} />
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
        {/* The funnel itself is on the first screen now; the panel stays for
            its empty state — the three ways to get a first fan in. */}
        <Show when={!data.degraded.includes('overview') && (data.overview?.active_fans ?? 0) === 0}>
          <AudienceOverviewPanel slug={params().slug} overview={data.overview ?? undefined} onGoSources={() => switchTab('sources')} onGoCommunities={() => switchTab('communities')} onGoContacts={() => switchTab('contacts')} />
        </Show>
        <Show when={!data.degraded.includes('fans')}>
          <FanTablePanel slug={params().slug} fans={data.fans ?? []} onImported={() => void refresh()} />
        </Show>
        <Show when={!data.degraded.includes('segments')}>
          <SegmentPanel slug={params().slug} segments={data.segments ?? []} />
        </Show>
        {/* Messages to fans read their own campaign list; it loads when
            opened so the page opens on the audience read alone. */}
        <Show when={showMessages()} fallback={
          <div class="mt-6 border-t border-border pt-6">
            <Button variant="outline" size="sm" onClick={() => setShowMessages(true)}>Messages to fans</Button>
          </div>
        }>
          <FanMessagesPanel slug={params().slug} />
        </Show>
      </>}</Show>
    </SubPagePanel>

    {/* ── Sources tab — where the fans come from (merged from Portfolio) ── */}
    <SubPagePanel when={areas.active() === 'sources'}>
      <Show when={portfolio.error}>
        <SectionFailureCard error={portfolio.error} title="Couldn't load fan sources" onRetry={refreshPortfolio} />
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
        <ConnectionHealthPanel slug={params().slug} />
      </>}</Show>
      {/* Where they came from *and whether it converted* — the source-ROI
          read is what makes this the one page that answers "where do our
          fans come from". */}
      <AcquisitionChannelsPanel slug={params().slug} />
      <FanConversionPanel slug={params().slug} />
      {/* Reddit cookie refresh — a fan source enabler, same home it had on
          the portfolio page. The cookies.txt recovery path is crew
          machinery: the account it revives is ours, so the band never sees
          the panel. */}
      <Show when={authState.isPlatformLevel()}>
        <RedditCookieUploader slug={params().slug} />
      </Show>
    </SubPagePanel>

    {/* ── Contacts tab — one directory by kind: booking contacts,
          amplifiers (the beacon roster + funnel), fan channels, and the
          staged imports awaiting review. The old Beacons destination
          redirects here. ── */}
    <SubPagePanel when={areas.active() === 'contacts'}>
      <ContactsPanel slug={params().slug} />
    </SubPagePanel>

    {/* ── Communities tab — observation layer ── */}
    <SubPagePanel when={areas.active() === 'communities'}>
      <CommunityIntelligenceContent slug={params().slug} />
    </SubPagePanel>

    {/* ── Label portfolio tab — roster KPIs and consent edges. Settings and
          keys moved to the tenant page: Workspace holds the editors, Access
          holds the secrets. ── */}
    <SubPagePanel when={areas.active() === 'portfolio'}>
      <Show when={portfolio.error}>
        <SectionFailureCard error={portfolio.error} title="Couldn't load the portfolio" onRetry={refreshPortfolio} />
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
    </SubPagePanel>
  </PageShell>
}
