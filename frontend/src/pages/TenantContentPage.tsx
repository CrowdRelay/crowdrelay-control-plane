import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { RefreshCw } from 'lucide-solid'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { refreshQueries } from '../lib/refresh'
import { errorMessage, relativeTime } from '../lib/format'
import { cn } from '../lib/cn'
import { ContentSourcesPanel } from '../components/ContentSourcesPanel'
import { Spinner } from '../components/Spinner'
import { EmptyState } from '../components/ui/empty-state'
import { SkeletonKpiStrip, SkeletonRows } from '../components/Skeleton'
import { Badge } from '../components/app/badge'
import { Button } from '../components/app/button'
import { Alert } from '../components/app/alert'
import { PageShell, PageHeader, Section, KpiStrip, KpiCard, ErrorCard } from '../components/layout'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { SectionIcon } from '../components/SectionIcon'
import type { DeliveryResult, PendingAutopilotAction, ContentSourceView } from '../lib/types'

/// The domain `ContentArtifactKind` serde keys → the same names the
/// briefings and emails use. Unknown kinds humanize instead of leaking.
const ARTIFACT_LABEL: Record<string, string> = {
  signal_push: 'Signal push',
  newsletter_block: 'Newsletter block',
  social_feed: 'Social feed',
  social_story: 'Social story',
  live_listing: 'Live listing',
  press_hook: 'Press hook',
  post_show_recap: 'Post-show recap',
}

const artifactLabel = (raw: unknown): string => {
  const key = typeof raw === 'string' ? raw : ''
  return ARTIFACT_LABEL[key] ?? (key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Content piece')
}

/// Where a delivery landed: the platform/subreddit/channel name the
/// upstream row already carries.
const KIND_LABEL: Record<string, string> = {
  social_post: 'Social',
  community_post: 'Community',
  telegram_post: 'Telegram',
  signal_push: 'Signal',
}

const PUBLISHED = { label: 'Published', variant: 'success' as const }

const RESULT_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' }> = {
  posted: PUBLISHED,
  published: PUBLISHED,
  delivered: { label: 'Delivered', variant: 'success' },
  draft: { label: 'Draft — post it yourself', variant: 'muted' },
  awaiting_manual_post: { label: 'Waiting for a manual post', variant: 'warning' },
  failed: { label: 'Failed', variant: 'destructive' },
  pending: { label: 'Queued', variant: 'muted' },
}

const statusBadge = (status: string) =>
  RESULT_STATUS[status] ?? { label: status.replace(/_/g, ' '), variant: 'muted' as const }

/// The `content` JSONB differs per kind — posts carry `text`, pushes a
/// `title`/`body`. First string wins; nothing renders raw JSON.
const contentExcerpt = (content: Record<string, unknown>): string | undefined => {
  for (const key of ['text', 'body', 'caption', 'title', 'message']) {
    const v = content[key]
    if (typeof v === 'string' && v.trim().length > 0) return v
  }
  return undefined
}

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const isContentAction = (a: PendingAutopilotAction) =>
  a.context === 'content_supply' || a.action_kind.startsWith('content.') || a.action_kind.startsWith('agent.content')

/// Artifact requests carry `artifact`; writer-draft requests carry
/// `template_id`. Either way the card gets a human name, never the key.
const draftTitle = (a: PendingAutopilotAction): string => {
  if (typeof a.payload.artifact === 'string' && a.payload.artifact) return artifactLabel(a.payload.artifact)
  const tpl = a.payload.template_id
  return typeof tpl === 'string' && tpl ? tpl.replace(/[._]/g, ' ') : 'Content piece'
}

const isLive = (s: ContentSourceView) => s.active && new Date(s.expires_at) > new Date()

// Material in → the brain drafts → a person says yes → it goes out. The page
// is those three stages in order: the queue that waits for a person first,
// the material it draws from, then what went out.
export function TenantContentPage() {
  const params = useParams({ from: '/tenants/$slug/content' })
  const [error, setError] = createSignal<string | null>(null)
  const [pendingMutation, setPendingMutation] = createSignal(false)
  const [confirming, setConfirming] = createSignal<string | null>(null)

  const overview = useQuery(() => ({
    queryKey: ['autopilot-overview', params().slug],
    queryFn: () => api.autopilotOverview(params().slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const sources = useQuery(() => ({
    queryKey: ['content-sources', params().slug],
    queryFn: () => api.contentSources(params().slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const results = useQuery(() => ({
    queryKey: ['delivery-results', params().slug],
    queryFn: () => api.deliveryResults(params().slug, 25),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  const pending = () => (overview.data?.needs_you ?? []).filter(isContentAction)
  const liveSourceCount = () => (sources.data ?? []).filter(isLive).length
  const published = () => (results.data ?? []).filter(r => r.status === 'posted' || r.status === 'published' || r.status === 'delivered').length
  const sourceTitle = (id: unknown) =>
    typeof id === 'string' ? sources.data?.find(s => s.source_id === id)?.title : undefined

  const refreshing = () => overview.isFetching || sources.isFetching || results.isFetching
  const refresh = () => refreshQueries(['autopilot-overview', params().slug], ['content-sources', params().slug], ['delivery-results', params().slug])

  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now()
    const ts = Math.max(overview.dataUpdatedAt, sources.dataUpdatedAt, results.dataUpdatedAt)
    return ts === 0 ? null : relativeTime(ts)
  })

  const approveAction = async (action: PendingAutopilotAction) => {
    setPendingMutation(true); setError(null)
    try {
      await api.approveOpportunityAction(params().slug, action.id)
      setConfirming(null)
      refreshQueries(['autopilot-overview', params().slug], ['delivery-results', params().slug])
    } catch (err) {
      setError(errorMessage(err, 'Could not approve it. Try again.'))
    } finally {
      setPendingMutation(false)
    }
  }

  const rejectAction = async (action: PendingAutopilotAction) => {
    setPendingMutation(true); setError(null)
    try {
      await api.cancelOpportunityAction(params().slug, action.id)
      setConfirming(null)
      refreshQueries(['autopilot-overview', params().slug])
    } catch (err) {
      setError(errorMessage(err, 'Could not reject it. Try again.'))
    } finally {
      setPendingMutation(false)
    }
  }

  return <PageShell>
    <PageHeader
      title="Content"
      description="Real material goes in, the brain drafts, a person says yes, and it goes out. Nothing publishes without that yes."
      actions={
        <>
          <Show when={updated()}><span class="text-sm text-muted-foreground">Updated {updated()}</span></Show>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing()} aria-label="Refresh">
            <RefreshCw class={cn(refreshing() && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </>
      }
    />

    <Show when={error()}><ErrorCard>{error()}</ErrorCard></Show>
    <Show when={overview.error}>
      <SectionFailureCard error={overview.error} fallback="Approval queue unavailable" onRetry={() => void overview.refetch()} />
    </Show>
    <Show when={results.error}>
      <SectionFailureCard error={results.error} fallback="Published list unavailable" onRetry={() => void results.refetch()} />
    </Show>

    {/* The pipeline as three figures on the shared rail. These were three
        boxed cards joined by arrows, over a three-line explainer; the
        header now carries the one sentence that explainer needed. */}
    <Show when={overview.data || sources.data || results.data} fallback={<SkeletonKpiStrip count={3} />}>
      <KpiStrip>
        <KpiCard label="Material in" value={liveSourceCount()} sub={liveSourceCount() === 1 ? 'live piece' : 'live pieces'} />
        <KpiCard label="Waiting for your yes" value={pending().length} tone={pending().length > 0 ? 'warn' : 'default'} sub={pending().length === 1 ? 'draft to approve' : 'drafts to approve'} />
        <KpiCard label="Went out" value={published()} tone={published() > 0 ? 'good' : 'default'} sub={published() === 1 ? 'post published' : 'posts published'} />
        <Show when={overview.data}>
          <KpiCard label="Drafting" value={overview.data!.runtime_enabled ? 'on' : 'off'} tone={overview.data!.runtime_enabled ? 'good' : 'default'} sub={overview.data!.runtime_enabled ? (authState.isPlatformLevel() ? 'autopilot proposes drafts' : 'drafts on its own') : 'nothing is drafted'} />
        </Show>
      </KpiStrip>
    </Show>

    {/* ── Waiting for your yes ── */}
    <Section
      flush
      lead
      title="Waiting for your yes"
      icon={<SectionIcon name="bell" />}
      count={pending().length}
      description="Drafts the brain proposes from your material. Approving writes the piece; it then goes out on its own where auto-posting is on, or waits as a draft."
    >
      <Show when={!overview.error && !overview.data}>
        <SkeletonRows count={2} />
      </Show>
      <Show when={overview.data}>
        <Show when={pending().length > 0} fallback={
          <EmptyState label="Nothing waiting" hint="When the brain drafts a post, a story or a push from your material, it lands here for your yes." />
        }>
          <ul class="divide-y divide-border rounded-lg border border-border">
            <For each={pending()}>{(action) => {
              const approveKey = `approve:${action.id}`
              const rejectKey = `reject:${action.id}`
              const title = () => draftTitle(action)
              const source = () => sourceTitle(action.payload.source_id)
              return (
                <li class="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div class="flex flex-wrap items-center gap-2">
                      <Badge>{title()}</Badge>
                      <strong class="text-sm">{source() ?? 'A content piece'}</strong>
                    </div>
                    <Show when={source()}>
                      <p class="m-0 text-sm text-muted-foreground">Built from “{source()}”.</p>
                    </Show>
                    <Show when={!action.executor_ready && action.required_capability}>
                      <Alert tone="warning" role="status"><strong>Nothing can run this yet.</strong> Approving queues it until a worker starts.</Alert>
                    </Show>
                    <div class="text-xs text-muted-foreground">asked {fmtDate(action.created_at)}</div>
                  </div>
                  <div class="flex shrink-0 flex-wrap items-center gap-2">
                    <Show when={confirming() === approveKey} fallback={
                      <Show when={confirming() === rejectKey} fallback={
                        <>
                          <Button size="sm" writes disabled={pendingMutation()} onClick={() => setConfirming(approveKey)}>Approve</Button>
                          <Button variant="outline" size="sm" writes disabled={pendingMutation()} onClick={() => setConfirming(rejectKey)}>Reject</Button>
                        </>
                      }>
                        <Button variant="destructive" size="sm" writes disabled={pendingMutation()} onClick={() => rejectAction(action)}>
                          {pendingMutation() && <Spinner />} {pendingMutation() ? 'Rejecting…' : 'Confirm rejection'}
                        </Button>
                        <Button variant="ghost" size="sm" disabled={pendingMutation()} onClick={() => setConfirming(null)}>Back</Button>
                      </Show>
                    }>
                      <Button size="sm" writes disabled={pendingMutation()} onClick={() => approveAction(action)}>
                        {pendingMutation() && <Spinner />} {pendingMutation() ? 'Approving…' : 'Confirm approval'}
                      </Button>
                      <Button variant="ghost" size="sm" disabled={pendingMutation()} onClick={() => setConfirming(null)}>Cancel</Button>
                    </Show>
                  </div>
                </li>
              )
            }}</For>
          </ul>
        </Show>
      </Show>
    </Section>

    {/* ── Real material — the input stage. The panel draws its own heading. ── */}
    <ContentSourcesPanel slug={params().slug} />

    {/* ── Went out — the proof stage ── */}
    <Section
      title="Went out"
      icon={<SectionIcon name="megaphone" />}
      count={results.data?.length}
      description="What the approved pieces became: where they landed and whether they published."
    >
      <Show when={!results.error && !results.data}>
        <SkeletonRows count={3} />
      </Show>
      <Show when={results.data}>
        <Show when={results.data!.length > 0} fallback={
          <EmptyState label="Nothing has gone out yet" hint="Approve a draft above and the published post lands here." />
        }>
          <ul class="divide-y divide-border rounded-lg border border-border">
            <For each={results.data!}>{(r: DeliveryResult) => {
              const badge = statusBadge(r.status)
              const excerpt = contentExcerpt(r.content)
              return (
                <li class="p-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{KIND_LABEL[r.kind] ?? r.kind.replace(/_/g, ' ')}</Badge>
                    <Show when={r.channel}><span class="text-xs font-medium text-foreground">{r.channel}</span></Show>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  <Show when={excerpt}>
                    <p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{excerpt}</p>
                  </Show>
                  <Show when={r.error_message}>
                    <p class="mt-1 text-xs text-destructive">{r.error_message}</p>
                  </Show>
                  <div class="mt-1 text-xs text-muted-foreground">
                    {r.posted_at ? `published ${fmtDate(r.posted_at)}` : `created ${fmtDate(r.created_at)}`}
                    <Show when={r.url}> · <a class="text-primary hover:underline" href={r.url!} target="_blank" rel="noreferrer">open post</a></Show>
                    <Show when={r.score != null}> · score {r.score}</Show>
                    <Show when={r.num_comments != null}> · {r.num_comments} comments</Show>
                  </div>
                </li>
              )
            }}</For>
          </ul>
        </Show>
      </Show>
    </Section>
  </PageShell>
}
