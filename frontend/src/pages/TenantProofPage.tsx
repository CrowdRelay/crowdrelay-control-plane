import { RosterStoryPanel } from '../components/RosterStoryPanel'
import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams, Link } from '@tanstack/solid-router'
import { ChartLine, RefreshCw } from 'lucide-solid'
import { api } from '../lib/api'
import { compareTimestamps, formatTimestamp, humanizeToken, relativeTime } from '../lib/format'
import { humanize } from '../lib/opportunity-labels'
import { cn } from '../lib/cn'
import { ListingPanel } from '../components/ListingPanel'
import { AttestationsPanel } from '../components/AttestationsPanel'
import { SkeletonSection } from '../components/Skeleton'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { EmptyState } from '../components/ui/empty-state'
import { Alert } from '../components/app/alert'
import { PageShell } from '../components/layout'
import { Act, Card, DashHeader, IconAct, ItemRow, Note, Pill, Row, Split, StatRow, Tile, Tiles, WorkAreaPanel, WorkAreas, useWorkAreas } from '../components/ui/dash'
import { BookOpen, Users } from 'lucide-solid'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'
import type { TenantProofReadModel, TenantShow } from '../lib/types'

// The section labels the degraded strip prints — a section the tenant could
// not answer is named, never silently absent.
const SECTION_LABEL: Record<string, string> = {
  listing: 'The listing',
  attestations: 'The proof cards',
  representation: 'The representation contacts',
  shows: 'The shows',
}

// A report exists for a night that happened — past, announced, not
// cancelled. Drafts and announced-upcoming nights have nothing to report.
const reportable = (show: TenantShow) =>
  !show.upcoming && show.status !== 'draft' && show.status !== 'cancelled'

/** `/tenants/$slug/proof` — the "send this to a promoter" drawer: the
 * listing link, the signed attestation cards, who an agent may approach,
 * and the reports the shows produced. One read model feeds every section;
 * organiser links stay per-night — minted on the shared-night panel a show
 * links to, never listed here. */
export function TenantProofPage() {
  const params = useParams({ from: '/tenants/$slug/proof' })
  const model = useQuery(() => ({
    queryKey: ['tenant-proof', params().slug],
    queryFn: () => api.proofModel(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // A section the tenant could not answer lands here as 200 with the
    // section named in `degraded`, so nothing retries it and the panel
    // stays empty for the life of the page. Keep asking until it fills.
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))

  const reports = createMemo(() =>
    (model.data?.shows?.events ?? []).filter(reportable)
      .sort((a, b) => compareTimestamps(b.starts_at, a.starts_at))
  )

  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now()
    return model.dataUpdatedAt ? relativeTime(model.dataUpdatedAt) : null
  })

  const areas = useWorkAreas(['overview', 'listing', 'cards', 'reports', 'story'], 'tab', 'overview')

  return <PageShell>
    <DashHeader
      title="Proof"
      subtitle="What you can show a promoter, an agent or a label"
      pill={model.data ? (model.data.listing?.listing ? { tone: 'good', text: 'Listing is live' } : { tone: 'warn', text: 'No listing yet' }) : null}
      actions={
        <IconAct onClick={() => void model.refetch()} disabled={model.isFetching} label="Refresh" title={updated() ? `Updated ${updated()}` : 'Refresh'}>
          <RefreshCw class={cn('size-3.5', model.isFetching && 'animate-spin')} aria-hidden="true" />
        </IconAct>
      }
    />

    <Show when={model.error}>
      <SectionFailureCard error={model.error} title="Couldn't load proof" onRetry={() => void model.refetch()} />
    </Show>
    <Show when={!model.error && model.data}>{(data: () => TenantProofReadModel) => (
      <For each={data().degraded}>{section => (
        <Alert tone="warning" role="status" class="mb-3">
          <strong>{SECTION_LABEL[section] ?? humanize(section)}</strong> couldn't be checked right now.
          The rest of the page keeps working — it comes back on its own.
        </Alert>
      )}</For>
    )}</Show>

    <WorkAreas
      active={areas.active()}
      onToggle={areas.toggle}
      areas={[
        { id: 'overview', label: 'Overview' },
        { id: 'listing', label: 'Listing and who to approach' },
        { id: 'cards', label: 'Signed proof cards', count: model.data?.attestations?.length ?? null },
        { id: 'reports', label: 'Show reports', count: reports().length || null },
        { id: 'story', label: 'The roster story' },
      ]}
    />

    <WorkAreaPanel id="overview" active={areas.active()}>
      <Show when={!model.error && !model.data}>
        <SkeletonSection titleWidth="160px" lines={4} minHeight="180px" />
      </Show>
      <Show when={!model.error && model.data}>{(data: () => TenantProofReadModel) => (
        <ProofFirstScreen
          data={data()}
          reports={reports().length}
          measuredReports={reports().filter(show => show.scan_count > 0).length}
          onOpen={areas.open}
        />
      )}</Show>
    </WorkAreaPanel>
    <Show when={model.data}>{data => <>
      <WorkAreaPanel id="listing" active={areas.active()}>
        <ListingPanel slug={params().slug} data={data().listing ?? undefined} targets={data().representation ?? undefined} />
      </WorkAreaPanel>
      <WorkAreaPanel id="cards" active={areas.active()}>
        <Show when={data().attestations !== null}>
          <AttestationsPanel slug={params().slug} data={data().attestations!} />
        </Show>
      </WorkAreaPanel>
      <WorkAreaPanel id="reports" active={areas.active()}>
        <Show when={reports().length > 0} fallback={<EmptyState icon={<ChartLine />} label="No reports yet" hint="A night that has happened files its report here." />}>
          <For each={reports()}>{show => (
            <Row>
              <span class="w-24 shrink-0 text-xs text-muted-foreground">{formatTimestamp(show.starts_at)}</span>
              <Link to="/tenants/$slug/shows/$eventSlug/report" params={{ slug: params().slug, eventSlug: show.slug }} class="min-w-0 flex-1 truncate text-sm text-foreground hover:underline">
                {show.title}{show.venue && show.venue !== show.title ? ` · ${show.venue}` : ''}
              </Link>
              <span class="shrink-0 text-xs text-muted-foreground">{show.scan_count} scans</span>
            </Row>
          )}</For>
        </Show>
      </WorkAreaPanel>
    </>}</Show>
    <WorkAreaPanel id="story" active={areas.active()}>
      <RosterStoryPanel slug={params().slug} />
    </WorkAreaPanel>
  </PageShell>
}

/** Proof, first screen (mockup `console-mockups/places-proof.html`, screen
 *  2): the numbers a promoter asks for, and — while there is no listing —
 *  what the listing will carry, since every approach waits on it. */
function ProofFirstScreen(props: { data: TenantProofReadModel; reports: number; measuredReports: number; onOpen: (area: string) => void }) {
  const targets = () => (props.data.representation?.targets ?? []).filter(t => t.active && !t.do_not_contact)
  const agents = () => targets().filter(t => t.kind === 'agent').length
  const labels = () => targets().filter(t => t.kind === 'label').length
  const allowance = () => props.data.representation?.monthly_approach_allowance ?? props.data.listing?.monthly_approach_allowance ?? null
  const used = () => props.data.representation?.approaches_used_this_month ?? props.data.listing?.approaches_used_this_month ?? null
  const cards = () => (props.data.attestations ?? []).filter(card => !card.revoked).length
  const hasListing = () => Boolean(props.data.listing?.listing)
  const check = (done: boolean) => <span class={done ? 'text-success-foreground' : 'text-muted-foreground'}>{done ? 'done' : 'not yet'}</span>
  return (
    <>
      <Tiles>
        <Tile label="Shows on record" value={props.data.shows ? props.reports : null} sub={`${props.measuredReports} with a door count`} />
        <Tile label="Signed proof cards" value={props.data.attestations ? cards() : null} sub="verifiable without an account" />
        <Tile label="Agents and labels" value={props.data.representation ? targets().length : null} sub={`${agents()} agents · ${labels()} ${labels() === 1 ? 'label' : 'labels'}`} />
        <Tile
          label="Approaches this month"
          value={used() != null && allowance() != null ? <>{used()}<span class="text-sm font-normal text-muted-foreground"> / {allowance()}</span></> : null}
          sub={used() != null && allowance() != null ? `allowance left: ${allowance()! - used()!}` : undefined}
        />
      </Tiles>
      <Split even>
        <Card title="Your listing" icon={<BookOpen />}>
          <p class="m-0 text-xs text-muted-foreground">One page an agent can read in a minute: sound, shows, fans, links.</p>
          <div class="mt-2">
            <StatRow label="Shows and dates" value={check(props.reports > 0)} />
            <StatRow label="Door counts from a show" value={check(props.measuredReports > 0)} />
            <StatRow label="Signed proof (attestations)" value={check(cards() > 0)} />
            <StatRow label="The listing itself" value={check(hasListing())} />
          </div>
          <div class="mt-3"><Act primary onClick={() => props.onOpen('listing')}>{hasListing() ? 'Open listing' : 'Create listing'}</Act></div>
        </Card>
        <Card title="Who to approach" icon={<Users />}>
          <Show when={targets().length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">No agent or label on the list yet.</p>}>
            <For each={targets().slice(0, 1)}>{target => (
              <ItemRow title={target.display_name} sub={humanizeToken(target.kind)} action={<Pill tone={target.verified ? 'good' : 'muted'}>{target.verified ? 'verified' : 'unverified'}</Pill>} />
            )}</For>
            <Show when={agents() > 1}><StatRow label={`${agents() - (targets()[0]?.kind === 'agent' ? 1 : 0)} more agents`} value={<span class="text-muted-foreground">verified list</span>} /></Show>
            <Show when={labels() > 0}><StatRow label={`${labels()} ${labels() === 1 ? 'label' : 'labels'}`} value={<span class="text-muted-foreground">verified list</span>} /></Show>
            <Show when={!hasListing()}>
              <Note>Approaches wait for a listing — an agent reads the listing, not a letter.</Note>
            </Show>
          </Show>
        </Card>
      </Split>
    </>
  )
}
