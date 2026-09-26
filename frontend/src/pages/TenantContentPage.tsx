import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { useNavigate, useParams } from '@tanstack/solid-router'
import { RefreshCw } from 'lucide-solid'
import { api, ApiError } from '../lib/api'
import { authState } from '../lib/auth'
import { refreshQueries } from '../lib/refresh'
import { CONTENT_TABS } from '../lib/nav'
import { errorMessage, relativeTime, timestampMillis } from '../lib/format'
import { cn } from '../lib/cn'
import { StatusBadge } from '../components/StatusBadge'
import { Spinner } from '../components/Spinner'
import { EmptyState } from '../components/ui/empty-state'
import { SkeletonKpiStrip, SkeletonRows } from '../components/Skeleton'
import { Badge } from '../components/app/badge'
import { Button } from '../components/app/button'
import { Input } from '../components/ui/input'
import { toast } from '../components/app/toast'
import { fillPath, surface } from '../lib/surface'
import { capabilityAction } from '../lib/capabilities'
import { TrackedLinksPanel } from '../components/TrackedLinksPanel'
import { Alert } from '../components/app/alert'
import { Card } from '../components/app/card'
import { PageShell, PageHeader, Section, KpiStrip, KpiCard, TabBar } from '../components/layout'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { SectionIcon } from '../components/SectionIcon'
import { DraftEditor, changedFields, emptiedField } from '../components/DraftEditor'
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
  discord_post: 'Discord',
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

/** Channels as stored carry their own "r/" and the list added another one:
 *  "r/r/melodicdeathmetal". Show the subreddit once. */
const channelName = (channel: string) => channel.replace(/^r\/r\//, 'r/')

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


// Material in → the brain drafts → a person says yes → it goes out. The page
// is those three stages in order: the queue that waits for a person first,
// the material it draws from, then what went out.
export function TenantContentPage() {
  const params = useParams({ from: '/tenants/$slug/content' })
  const navigate = useNavigate()
  // Per-item, on purpose: a refusal on one draft must not grey out or
  // shadow the rest of the queue, and one item's error used to float to the
  // top of the page far from the button that earned it.
  const [errors, setErrors] = createSignal<Record<string, string>>({})
  const [pendingId, setPendingId] = createSignal<string | null>(null)
  const [confirming, setConfirming] = createSignal<string | null>(null)
  const [edits, setEdits] = createSignal<Record<string, Record<string, string>>>({})
  const [editing, setEditing] = createSignal<Set<string>>(new Set())

  const setItemError = (actionId: string, message: string | null) =>
    setErrors(prev => {
      const next = { ...prev }
      if (message == null) delete next[actionId]
      else next[actionId] = message
      return next
    })
  const editField = (action: PendingAutopilotAction, field: string, value: string) =>
    setEdits(prev => ({
      ...prev,
      [action.id]: { ...(action.revisable ?? {}), ...prev[action.id], [field]: value },
    }))
  const toggleEdit = (actionId: string) =>
    setEditing(prev => {
      const next = new Set(prev)
      if (next.has(actionId)) next.delete(actionId)
      else next.add(actionId)
      return next
    })
  const revisionFor = (action: PendingAutopilotAction) =>
    action.revisable ? changedFields(action.revisable, edits()[action.id] ?? {}) : undefined

  // One read for the page: the drafting pipeline and what went out.
  const model = useQuery(() => ({
    queryKey: ['content-model', params().slug],
    queryFn: () => api.contentModel(params().slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  // The two sections under the names the page was written against.
  const pipeline = {
    get data() { return model.data?.pipeline ?? undefined },
    get error() { return model.error ?? (model.data && !model.data.pipeline ? new Error('The approval list could not be read') : null) },
    get isFetching() { return model.isFetching },
    get dataUpdatedAt() { return model.dataUpdatedAt },
    refetch: () => model.refetch(),
  }
  const results = {
    get data() { return model.data?.delivery_results?.results ?? undefined },
    get error() { return model.error ?? (model.data && !model.data.delivery_results ? new Error('What went out could not be read') : null) },
    get isFetching() { return model.isFetching },
    get dataUpdatedAt() { return model.dataUpdatedAt },
    refetch: () => model.refetch(),
  }

  const pending = () => pipeline.data?.pending ?? []
  // What waits for a person to publish by hand — the band's to-do, first.
  const ready = () => (results.data ?? []).filter(r => r.status === 'awaiting_manual_post' || r.status === 'draft')
  const weekAgo = Date.now() - 7 * 86_400_000
  const wentOutWeek = () => (results.data ?? []).filter(r =>
    ['posted', 'published', 'delivered'].includes(r.status) && timestampMillis(r.posted_at ?? r.created_at) >= weekAgo)
  const failed = () => (results.data ?? []).filter(r => r.status === 'failed')
  const readyForums = () => ready().filter(r => r.kind === 'community_post').length
  // A push lands once per fan, so the ledger lists one row per fan. The
  // page counts pushes: same kind, same text, same day is one push.
  const wentOutGroups = createMemo(() => {
    const groups = new Map<string, { row: DeliveryResult; count: number }>()
    for (const row of (results.data ?? []).filter(r => !['awaiting_manual_post', 'draft'].includes(r.status))) {
      const day = (row.posted_at ?? row.created_at).slice(0, 10)
      const key = row.kind === 'signal_push' ? `${row.kind}|${contentExcerpt(row.content) ?? ''}|${day}|${row.status}` : row.id
      const group = groups.get(key)
      if (group) group.count += 1
      else groups.set(key, { row, count: 1 })
    }
    return [...groups.values()]
  })
  const pushFans = () => wentOutWeek().filter(r => r.kind === 'signal_push').length
  const pushGroups = () => wentOutGroups().filter(g => g.row.kind === 'signal_push' && ['posted', 'published', 'delivered'].includes(g.row.status) && timestampMillis(g.row.posted_at ?? g.row.created_at) >= weekAgo).length
  const status = (): { tone: 'good' | 'warn' | 'bad' | 'muted'; text: string } | null => {
    if (!model.data) return null
    if (ready().length > 0) return { tone: 'warn', text: `${ready().length} ${ready().length === 1 ? 'post' : 'posts'} ready for you to publish` }
    if (pending().length > 0) return { tone: 'warn', text: `${pending().length} ${pending().length === 1 ? 'draft waits' : 'drafts wait'} for your yes` }
    if (failed().length > 0) return { tone: 'bad', text: `${failed().length} didn't land` }
    return { tone: 'good', text: 'Nothing waits on you' }
  }
  const [showLinks, setShowLinks] = createSignal(window.location.hash.includes('link'))
  const sourceTitle = (id: unknown) =>
    typeof id === 'string' ? pipeline.data?.source_titles[id] : undefined

  const refreshing = () => pipeline.isFetching || results.isFetching
  const refresh = () => refreshQueries(['content-model', params().slug], ['tenant-delivery', params().slug])

  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now()
    const ts = Math.max(pipeline.dataUpdatedAt, results.dataUpdatedAt)
    return ts === 0 ? null : relativeTime(ts)
  })

  const approveAction = async (action: PendingAutopilotAction) => {
    // A blanked field is refused upstream — name it here instead of
    // shipping a write that is known to fail.
    const empty = emptiedField(edits()[action.id] ?? {})
    if (empty) {
      setItemError(action.id, `${empty} can't be empty — refuse the draft instead.`)
      setConfirming(null)
      return
    }
    const revision = revisionFor(action)
    setPendingId(action.id); setItemError(action.id, null)
    try {
      await api.approveOpportunityAction(params().slug, action.id, revision ? { revision } : undefined)
      setConfirming(null)
      if (revision) toast.success('Approved with your edits')
      refreshQueries(['content-model', params().slug], ['tenant-delivery', params().slug])
    } catch (err) {
      // A 409's problem body is a sentence for a person — on the item,
      // where the refusal belongs.
      if (err instanceof ApiError && err.status === 409) setItemError(action.id, err.message)
      else setItemError(action.id, errorMessage(err, 'Could not approve it. Try again.'))
    } finally {
      setPendingId(null)
    }
  }

  const rejectAction = async (action: PendingAutopilotAction) => {
    setPendingId(action.id); setItemError(action.id, null)
    try {
      await api.cancelOpportunityAction(params().slug, action.id)
      setConfirming(null)
      refreshQueries(['content-model', params().slug])
    } catch (err) {
      setItemError(action.id, errorMessage(err, 'Could not reject it. Try again.'))
    } finally {
      setPendingId(null)
    }
  }

  return <PageShell>
    <PageHeader
      title="Content"
      description="What is ready to post, and what went out."
      actions={
        <>
          <Show when={status()}>{pill => <StatusBadge status={pill().text} tone={pill().tone} />}</Show>
          <Show when={updated()}><span class="text-sm text-muted-foreground">Updated {updated()}</span></Show>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing()} aria-label="Refresh">
            <RefreshCw class={cn(refreshing() && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </>
      }
    />

    {/* The material stage keeps its own page; the tab bar is how you reach it. */}
    <TabBar
      tabs={CONTENT_TABS}
      active="pipeline"
      onChange={(id) => {
        if (id === 'material') void navigate({ to: '/tenants/$slug/content/material', params: { slug: params().slug } })
      }}
    />

    <Show when={pipeline.error}>
      <SectionFailureCard error={pipeline.error} fallback={authState.isPlatformLevel() ? 'Approval queue unavailable' : 'The approval list'} onRetry={() => void pipeline.refetch()} />
    </Show>
    <Show when={results.error}>
      <SectionFailureCard error={results.error} fallback="Published list unavailable" onRetry={() => void results.refetch()} />
    </Show>

    {/* The pipeline as three figures on the shared rail. These were three
        boxed cards joined by arrows, over a three-line explainer; the
        header now carries the one sentence that explainer needed. */}
    <Show when={model.data} fallback={<SkeletonKpiStrip count={4} />}>
      <KpiStrip>
        <KpiCard
          label="Ready to post"
          value={results.data ? ready().length : '—'}
          sub={results.data ? `${readyForums()} forums · ${ready().length - readyForums()} social` : undefined}
          tone={ready().length > 0 ? 'warn' : undefined}
        />
        <KpiCard label="Waiting for your yes" value={pipeline.data ? pending().length : '—'} tone={pending().length > 0 ? 'warn' : undefined} sub={pipeline.data == null ? 'not reported' : pending().length === 1 ? 'draft to approve' : 'drafts to approve'} />
        <KpiCard
          label="Went out, 7 days"
          value={results.data ? wentOutWeek().length - pushFans() + pushGroups() : '—'}
          sub={results.data ? `${pushGroups()} fan pushes · ${wentOutWeek().filter(r => r.kind !== 'signal_push').length} posts` : undefined}
          tone="good"
        />
        <KpiCard label="Didn't land" value={results.data ? failed().length : '—'} tone={failed().length > 0 ? 'bad' : undefined} sub={results.data == null ? 'not reported' : failed().length > 0 ? 'failed to publish' : 'nothing failed'} />
      </KpiStrip>
    </Show>

    <Show when={ready().length > 0}>
      <Section
        flush
        lead
        title="Ready to post"
        icon={<SectionIcon name="megaphone" />}
        count={ready().length}
        description="Written and waiting for you to publish by hand. Copy it, post it, then mark it posted — measurement picks it up from there."
      >
        <div class="grid gap-3 md:grid-cols-2">
          <For each={ready()}>{(r: DeliveryResult) => (
            <div class="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div class="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{KIND_LABEL[r.kind] ?? r.kind.replace(/_/g, ' ')}</Badge>
                <span class="text-sm font-medium text-foreground">{channelName(r.channel)}</span>
              </div>
              <Show when={contentExcerpt(r.content)}>
                {text => <p class="whitespace-pre-line text-sm text-foreground">{text()}</p>}
              </Show>
              <div class="flex flex-wrap items-center gap-2">
                <Show when={contentExcerpt(r.content)}>
                  {text => <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(text()); toast.success('Copied') }}>Copy</Button>}
                </Show>
                <Show when={r.url}><a class="text-xs text-primary hover:underline" href={r.url!} target="_blank" rel="noreferrer">Open</a></Show>
              </div>
              <Show when={r.kind === 'social_post'}>
                <ManualSocialPostRegister slug={params().slug} post={r} onDone={() => void model.refetch()} />
              </Show>
              <Show when={r.kind === 'telegram_post' || r.kind === 'discord_post'}>
                <ManualMessageRegister slug={params().slug} post={r} onDone={() => void model.refetch()} />
              </Show>
            </div>
          )}</For>
        </div>
      </Section>
    </Show>

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
    <Section
      title="Waiting for your yes"
      icon={<SectionIcon name="bell" />}
      count={pending().length}
      description="Drafts the brain proposes from your material. Approving writes the piece; it then goes out on its own where auto-posting is on, or waits as a draft."
    >
      <Show when={!pipeline.error && !pipeline.data}>
        <SkeletonRows count={2} />
      </Show>
      <Show when={pipeline.data}>
        <Show when={pending().length > 0} fallback={
          <EmptyState label="Nothing waiting" hint="When the brain drafts a post, a story or a push from your material, it lands here for your yes." />
        }>
          <ul class="divide-y divide-border rounded-lg border border-border">
            <For each={pending()}>{(action) => {
              const approveKey = `approve:${action.id}`
              const rejectKey = `reject:${action.id}`
              const title = () => draftTitle(action)
              const source = () => sourceTitle(action.payload.source_id)
              const fields = () => action.revisable && Object.keys(action.revisable).length > 0 ? action.revisable : undefined
              const pendingItem = () => pendingId() === action.id
              const anotherPending = () => pendingId() !== null && pendingId() !== action.id
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
                      <Alert tone="warning" role="status"><strong>Nothing can run this yet.</strong> {authState.isPlatformLevel() ? 'Approving queues it until a worker starts.' : 'Approving keeps it waiting until the poster is up.'}</Alert>
                    </Show>
                    <Show when={fields()}>{f =>
                      <DraftEditor
                        fields={f()}
                        value={edits()[action.id] ?? f()}
                        onChange={(field, value) => editField(action, field, value)}
                        editing={editing().has(action.id)}
                        onToggle={() => toggleEdit(action.id)}
                      />
                    }</Show>
                    <Show when={errors()[action.id]}>
                      <p class="m-0 text-xs text-destructive font-medium">{errors()[action.id]}</p>
                    </Show>
                    <div class="text-xs text-muted-foreground">asked {fmtDate(action.created_at)}</div>
                  </div>
                  <div class="flex shrink-0 flex-wrap items-center gap-2">
                    <Show when={confirming() === approveKey} fallback={
                      <Show when={confirming() === rejectKey} fallback={
                        <>
                          <Show when={fields() && !editing().has(action.id)}>
                            <Button variant="ghost" size="sm" writes disabled={anotherPending() || pendingItem()} onClick={() => toggleEdit(action.id)}>Edit</Button>
                          </Show>
                          <Button size="sm" writes disabled={anotherPending() || pendingItem()} onClick={() => setConfirming(approveKey)}>Approve</Button>
                          <Button variant="outline" size="sm" writes disabled={anotherPending() || pendingItem()} onClick={() => setConfirming(rejectKey)}>Reject</Button>
                        </>
                      }>
                        <Button variant="destructive" size="sm" writes disabled={pendingItem()} onClick={() => rejectAction(action)}>
                          {pendingItem() && <Spinner />} {pendingItem() ? 'Rejecting…' : 'Confirm rejection'}
                        </Button>
                        <Button variant="ghost" size="sm" disabled={pendingItem()} onClick={() => setConfirming(null)}>Back</Button>
                      </Show>
                    }>
                      <Button size="sm" writes disabled={pendingItem()} onClick={() => approveAction(action)}>
                        {pendingItem() && <Spinner />} {pendingItem() ? 'Approving…' : revisionFor(action) ? 'Confirm approval as edited' : 'Confirm approval'}
                      </Button>
                      <Button variant="ghost" size="sm" disabled={pendingItem()} onClick={() => setConfirming(null)}>Cancel</Button>
                    </Show>
                  </div>
                </li>
              )
            }}</For>
          </ul>
        </Show>
      </Show>
    </Section>

    {/* ── Went out — the proof stage ── */}
    <Section
      title="Went out"
      icon={<SectionIcon name="megaphone" />}
      count={wentOutGroups().length}
      description="What the approved pieces became: where they landed and whether they published. A push to many fans is one row."
    >
      <Show when={!results.error && !results.data}>
        <SkeletonRows count={3} />
      </Show>
      <Show when={results.data}>
        <Show when={wentOutGroups().length > 0} fallback={
          <EmptyState label="Nothing has gone out yet" hint="Approve a draft above and the published post lands here." />
        }>
          <ul class="divide-y divide-border rounded-lg border border-border">
            <For each={wentOutGroups()}>{({ row: r, count }) => {
              const badge = statusBadge(r.status)
              const excerpt = contentExcerpt(r.content)
              return (
                <li class="p-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{KIND_LABEL[r.kind] ?? r.kind.replace(/_/g, ' ')}</Badge>
                    <Show when={r.channel}><span class="text-xs font-medium text-foreground">{channelName(r.channel)}</span></Show>
                    <Badge variant={badge.variant}>{badge.label}{r.kind === 'signal_push' ? ` · ${count} ${count === 1 ? 'fan' : 'fans'}` : ''}</Badge>
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
    <Section title="Tracked links" icon={<SectionIcon name="link" />} description="Links that count who clicked through to tickets and releases.">
      <Show when={showLinks()} fallback={
        <Button variant="outline" size="sm" onClick={() => setShowLinks(true)}>Open tracked links</Button>
      }>
        <TrackedLinksPanel slug={params().slug} />
      </Show>
    </Section>
  </PageShell>
}

/// The close-out for a social post the operator published by hand: paste the
/// URL where it landed and the row stops waiting — measurement picks it up
/// from there. Without this the row sits at `awaiting_manual_post` forever
/// and counts as live work the cadence never finishes.
function ManualSocialPostRegister(props: { slug: string; post: DeliveryResult; onDone: () => void }) {
  const [open, setOpen] = createSignal(false)
  const [url, setUrl] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const register = async () => {
    if (busy()) return
    setBusy(true)
    try {
      await api.registerManualSocialPost(props.slug, props.post.id, url())
      toast.success('Registered — the post is being measured')
      props.onDone()
    } catch (error) {
      toast.error(errorMessage(error, 'That did not register'))
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }
  return (
    <Show
      when={open()}
      fallback={
        <Button variant="link" class="mt-1 h-auto p-0 text-xs font-normal" writes onClick={() => setOpen(true)}>
          posted it by hand? register the link
        </Button>
      }
    >
      <span class="mt-1 flex items-center gap-2">
        <Input
          type="url"
          class="h-7 w-64 max-w-full text-xs"
          placeholder="https://… where the post landed"
          value={url()}
          onInput={e => setUrl(e.currentTarget.value)}
        />
        <Button size="sm" variant="outline" writes disabled={busy() || !url().startsWith('https://')} onClick={() => void register()}>
          <Show when={busy()}><Spinner /></Show>
          Register
        </Button>
      </span>
    </Show>
  )
}

/// The same close-out for Telegram and Discord, which record the message id
/// rather than a URL. Both drafted and waited with no way to finish them from
/// the console: the attention board counted them, the delivery list showed a
/// Telegram row without its words, and a Discord row not at all.
function ManualMessageRegister(props: { slug: string; post: DeliveryResult; onDone: () => void }) {
  const [open, setOpen] = createSignal(false)
  const [messageId, setMessageId] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const telegram = () => props.post.kind === 'telegram_post'
  // Telegram message ids are integers; Discord's are snowflakes, which
  // overflow a JS number and travel as strings.
  const valid = () => (telegram() ? /^\d{1,15}$/ : /^\d{5,25}$/).test(messageId().trim())
  const register = async () => {
    if (busy() || !valid()) return
    setBusy(true)
    try {
      const id = messageId().trim()
      const action = telegram()
        ? capabilityAction('manual-posts', 'Telegram posted')
        : capabilityAction('manual-posts', 'Discord posted')
      await surface.write(
        props.slug,
        'POST',
        fillPath(action.path, { telegram_post_id: props.post.id, discord_post_id: props.post.id })!,
        { message_id: telegram() ? Number(id) : id },
      )
      toast.success('Registered — the post is being measured')
      props.onDone()
    } catch (error) {
      toast.error(errorMessage(error, 'That did not register'))
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }
  return (
    <Show
      when={open()}
      fallback={
        <Button variant="link" class="mt-1 h-auto p-0 text-xs font-normal" writes onClick={() => setOpen(true)}>
          posted it by hand? register the message
        </Button>
      }
    >
      <span class="mt-1 flex items-center gap-2">
        <Input
          class="h-7 w-64 max-w-full text-xs"
          inputMode="numeric"
          placeholder={telegram() ? 'Telegram message id' : 'Discord message id'}
          value={messageId()}
          onInput={e => setMessageId(e.currentTarget.value)}
        />
        <Button size="sm" variant="outline" writes disabled={busy() || !valid()} onClick={() => void register()}>
          <Show when={busy()}><Spinner /></Show>
          Register
        </Button>
      </span>
    </Show>
  )
}
