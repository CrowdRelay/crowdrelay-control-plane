import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useNavigate, useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { refreshQueries } from '../lib/refresh'
import { CONTENT_TABS } from '../lib/nav'
import { errorMessage } from '../lib/format'
import { StatusBadge } from '../components/StatusBadge'
import { Spinner } from '../components/Spinner'
import { EmptyState } from '../components/ui/empty-state'
import { SkeletonSection } from '../components/Skeleton'
import { Badge } from '../components/app/badge'
import { Button } from '../components/app/button'
import { Card } from '../components/app/card'
import { PageShell, PageHeader, SectionTitle, TabBar, ErrorCard } from '../components/layout'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { SectionIcon } from '../components/SectionIcon'
import type { DeliveryResult, PendingAutopilotAction } from '../lib/types'

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

/// Artifact requests carry `artifact`; writer-draft requests carry
/// `template_id`. Either way the card gets a human name, never the key.
const draftTitle = (a: PendingAutopilotAction): string => {
  if (typeof a.payload.artifact === 'string' && a.payload.artifact) return artifactLabel(a.payload.artifact)
  const tpl = a.payload.template_id
  return typeof tpl === 'string' && tpl ? tpl.replace(/[._]/g, ' ') : 'Content piece'
}

export function TenantContentPage() {
  const params = useParams({ from: '/tenants/$slug/content' })
  const navigate = useNavigate()
  const [error, setError] = createSignal<string | null>(null)
  const [pendingMutation, setPendingMutation] = createSignal(false)
  const [confirming, setConfirming] = createSignal<string | null>(null)

  const pipeline = useQuery(() => ({
    queryKey: ['content-pipeline', params().slug],
    queryFn: () => api.contentPipeline(params().slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const results = useQuery(() => ({
    queryKey: ['delivery-results', params().slug],
    queryFn: () => api.deliveryResults(params().slug, 25),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  const pending = () => pipeline.data?.pending ?? []
  const published = () => (results.data ?? []).filter(r => r.status === 'posted' || r.status === 'published' || r.status === 'delivered').length
  const sourceTitle = (id: unknown) =>
    typeof id === 'string' ? pipeline.data?.source_titles[id] : undefined

  const approveAction = async (action: PendingAutopilotAction) => {
    setPendingMutation(true); setError(null)
    try {
      await api.approveOpportunityAction(params().slug, action.id)
      setConfirming(null)
      refreshQueries(['content-pipeline', params().slug], ['delivery-results', params().slug])
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
      refreshQueries(['content-pipeline', params().slug])
    } catch (err) {
      setError(errorMessage(err, 'Could not reject it. Try again.'))
    } finally {
      setPendingMutation(false)
    }
  }

  const stages = () => [
    { step: 'Material in', count: pipeline.data?.live_sources, noun: 'piece' },
    { step: 'Waiting for your yes', count: pending().length, noun: 'draft' },
    { step: 'Went out', count: results.data ? published() : undefined, noun: 'post' },
  ]

  return <PageShell>
    <PageHeader
      eyebrow={authState.isPlatformLevel() ? 'CONTENT' : undefined}
      title="Content"
      description="What waits for your yes, and what actually went out. The material it all comes from lives under Real material."
      actions={
        <Show when={pipeline.data}>
          <div class="flex items-center gap-2">
            <Show when={pipeline.data!.runtime_enabled}>
              <StatusBadge status={authState.isPlatformLevel() ? 'autopilot on' : 'drafting on its own'} tone="good" />
            </Show>
            <StatusBadge status={pending().length ? `${pending().length} waiting for you` : 'nothing waiting'} tone={pending().length ? 'warn' : 'muted'} />
          </div>
        </Show>
      }
    />

    <TabBar
      tabs={CONTENT_TABS}
      active="pipeline"
      onChange={(id) => {
        if (id === 'material') void navigate({ to: '/tenants/$slug/content/material', params: { slug: params().slug } })
      }}
    />

    <Show when={error()}><ErrorCard class="mb-4">{error()}</ErrorCard></Show>
    <Show when={pipeline.error}>
      <SectionFailureCard error={pipeline.error} fallback="Approval queue unavailable" onRetry={() => void pipeline.refetch()} />
    </Show>
    <Show when={results.error}>
      <SectionFailureCard error={results.error} fallback="Published list unavailable" onRetry={() => void results.refetch()} />
    </Show>

    {/* Pipeline strip — the work mode, as the system actually runs it:
        material in → the brain drafts → a person says yes → it goes out. */}
    <div class="flex flex-col sm:flex-row items-stretch gap-2 mb-6">
      <For each={stages()}>{(stage, i) => <>
        <div class="flex-1 rounded-lg border border-border bg-card p-3">
          <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">{stage.step}</div>
          <div class="mt-1 flex items-baseline gap-1.5">
            <span class="text-xl font-semibold text-foreground">{stage.count ?? '—'}</span>
            <span class="text-xs text-muted-foreground">{stage.count === 1 ? stage.noun : `${stage.noun}s`}</span>
          </div>
        </div>
        <Show when={i() < stages().length - 1}>
          <div class="self-center text-muted-foreground select-none" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="rotate-90 sm:rotate-0"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </div>
        </Show>
      </>}</For>
    </div>
    <p class="text-xs text-muted-foreground -mt-4 mb-6">
      A video on your YouTube channel lands under Real material on its own; stories and links you add yourself.
      The brain turns material into drafts — nothing publishes until a person says yes here.
      Approved pieces go out by themselves where auto-posting is on; the rest wait as drafts.
    </p>

    {/* Voice signal — how much fixing the drafts still need. Distance should
        fall as the machine learns; a flat or rising line means the same
        corrections keep coming. */}
    <Show when={pipeline.data?.revision_trend}>
      {(trend) => (
        <Card flat class="mb-6">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Voice match</span>
            <span class="text-sm text-foreground">
              {trend().revised_fields_30d} fields fixed in 30 days · ~{trend().avg_distance_chars_30d} chars per fix
            </span>
            <Show when={trend().weekly.length > 1}>
              <span class="text-xs text-muted-foreground">
                weekly: {trend().weekly.map(w => w.avg_distance_chars).join(' → ')} chars
              </span>
            </Show>
            <span class="text-xs text-muted-foreground">falls as drafts get closer to your words</span>
          </div>
        </Card>
      )}
    </Show>

    {/* ── Waiting for your yes ── */}
    <SectionTitle title="Waiting for your yes" icon={<SectionIcon name="bell" />} description="Drafts the brain proposes from your material. Approving starts the work — the piece is written, then published or saved as a draft." />
    <Show when={!pipeline.error && !pipeline.data && pipeline.isFetching}>
      <SkeletonSection titleWidth="140px" lines={2} minHeight="120px" />
    </Show>
    <Show when={pipeline.data}>
      <Show when={pending().length > 0} fallback={
        <Card flat class="mb-6">
          <EmptyState label="Nothing waiting" hint="When the brain drafts a post, a story or a push from your material, it lands here for your yes." />
        </Card>
      }>
        <div class="flex flex-col gap-2.5 mb-6">
          <For each={pending()}>{(action) => {
            const approveKey = `approve:${action.id}`
            const rejectKey = `reject:${action.id}`
            const title = () => draftTitle(action)
            const source = () => sourceTitle(action.payload.source_id)
            return (
              <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 p-4 border border-border rounded-lg bg-card">
                <div class="min-w-0 flex-1 flex flex-col gap-1.5">
                  <div class="flex items-center gap-2 flex-wrap">
                    <Badge>{title()}</Badge>
                    <strong class="text-sm">{source() ?? 'A content piece'}</strong>
                  </div>
                  <p class="m-0 text-sm text-secondary-foreground leading-relaxed">
                    {source()
                      ? `Built from “${source()}”. Approving writes the ${title().toLowerCase()} — it then goes out on its own where auto-posting is on, or waits as a draft.`
                      : 'Approving writes the piece — it then goes out on its own where auto-posting is on, or waits as a draft.'}
                  </p>
                  <Show when={!action.executor_ready && action.required_capability}>
                    <div class="rounded-lg border border-warning-foreground/30 bg-warning-foreground/10 p-3 text-sm text-warning-foreground">
                      <strong>Nothing can run this yet</strong> — approving queues it until a worker starts.
                    </div>
                  </Show>
                  <div class="text-xs text-muted-foreground">asked {fmtDate(action.created_at)}</div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  <Show when={confirming() === approveKey} fallback={
                    <Show when={confirming() === rejectKey} fallback={
                      <>
                        <Button size="sm" writes disabled={pendingMutation()} onClick={() => setConfirming(approveKey)}>Approve</Button>
                        <Button variant="destructive" size="sm" writes disabled={pendingMutation()} onClick={() => setConfirming(rejectKey)}>Reject</Button>
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
              </div>
            )
          }}</For>
        </div>
      </Show>
    </Show>

    {/* ── Went out — the proof stage ── */}
    <SectionTitle title="Went out" icon={<SectionIcon name="megaphone" />} description="What the approved pieces became — where they landed and whether they published." />
    <Show when={!results.error && !results.data && results.isFetching}>
      <SkeletonSection titleWidth="120px" lines={3} minHeight="140px" />
    </Show>
    <Show when={results.data}>
      <Show when={results.data!.length > 0} fallback={
        <Card flat>
          <EmptyState label="Nothing has gone out yet" hint="Approve a draft above and the published post lands here." />
        </Card>
      }>
        <div class="flex flex-col gap-2">
          <For each={results.data!}>{(r: DeliveryResult) => {
            const badge = statusBadge(r.status)
            const excerpt = contentExcerpt(r.content)
            return (
              <div class="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
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
                </div>
              </div>
            )
          }}</For>
        </div>
      </Show>
    </Show>
  </PageShell>
}
