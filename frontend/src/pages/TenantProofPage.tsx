import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams, Link } from '@tanstack/solid-router'
import { RefreshCw } from 'lucide-solid'
import { api } from '../lib/api'
import { relativeTime, formatTimestamp } from '../lib/format'
import { cn } from '../lib/cn'
import { ListingPanel } from '../components/ListingPanel'
import { AttestationsPanel } from '../components/AttestationsPanel'
import { SkeletonSection } from '../components/Skeleton'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { SectionIcon } from '../components/SectionIcon'
import { EmptyState } from '../components/ui/empty-state'
import { Alert } from '../components/app/alert'
import { PageShell, PageHeader, Section } from '../components/layout'
import { Button } from '../components/app/button'
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
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
  )

  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now()
    return model.dataUpdatedAt ? relativeTime(model.dataUpdatedAt) : null
  })

  return <PageShell>
    <PageHeader
      title="Proof"
      description="What you can hand a promoter: the listing link, signed proof cards, and the reports your shows produced."
      actions={
        <>
          <Show when={updated()}><span class="text-sm text-muted-foreground">Updated {updated()}</span></Show>
          <Button variant="outline" size="sm" onClick={() => void model.refetch()} disabled={model.isFetching} aria-label="Refresh">
            <RefreshCw class={cn(model.isFetching && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </>
      }
    />

    <Show when={model.error}>
      <SectionFailureCard error={model.error} fallback="Proof channel unavailable" onRetry={() => void model.refetch()} />
    </Show>

    <Show when={!model.error && !model.data}>
      <SkeletonSection titleWidth="160px" lines={4} minHeight="180px" />
      <SkeletonSection titleWidth="140px" lines={3} minHeight="140px" />
    </Show>

    <Show when={!model.error && model.data}>{(data: () => TenantProofReadModel) => <>
      <For each={data().degraded}>{section => (
        <Alert tone="warning" role="status" class="mb-4">
          <strong>{SECTION_LABEL[section] ?? section}</strong> couldn't be checked right now.
          The rest of the drawer keeps working — it comes back on its own.
        </Alert>
      )}</For>

      {/* The listing — what the share link admits an agent or label to, who
          they may approach, and this month's allowance. A section that did
          not answer leaves the panel to ask for itself rather than mount
          half-fed. */}
      <ListingPanel
        slug={params().slug}
        data={data().listing ?? undefined}
        targets={data().representation ?? undefined}
      />

      {/* The signed cards — measured from the tenant's own ledgers at issue
          time, carried by a link a reader verifies without an account. */}
      <Show when={data().attestations !== null}>
        <AttestationsPanel slug={params().slug} data={data().attestations!} />
      </Show>

      {/* The reports the nights produced — the newest first, each a door
          into the report a promoter reads as the night's receipts. */}
      <Show when={data().shows !== null}>
        <Section
          title="Show reports"
          icon={<SectionIcon name="trending-up" />}
          count={reports().length}
          description="What each night produced once it was over — the numbers a promoter asks for."
        >
          <Show
            when={reports().length > 0}
            fallback={<EmptyState label="No reports yet" hint="A night that has happened files its report here." />}
          >
            <div class="grid gap-2">
              <For each={reports()}>{show => (
                <Link
                  to="/tenants/$slug/shows/$eventSlug/report"
                  params={{ slug: params().slug, eventSlug: show.slug }}
                  class="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:border-foreground/30 transition-colors"
                >
                  <div class="min-w-0">
                    <div class="truncate font-medium text-foreground">{show.title}</div>
                    <div class="text-xs text-muted-foreground mt-0.5">
                      {formatTimestamp(show.starts_at)}{show.venue ? ` · ${show.venue}` : ''}
                    </div>
                  </div>
                  <div class="text-right shrink-0">
                    <div class="text-sm font-medium text-foreground tabular-nums">{show.scan_count}</div>
                    <div class="text-xs text-muted-foreground">scans</div>
                  </div>
                </Link>
              )}</For>
            </div>
          </Show>
        </Section>
      </Show>
    </>}</Show>
  </PageShell>
}
