import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { failureLine, unavailableError } from '../lib/errors'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { Link, useParams } from '@tanstack/solid-router'
import { Bell, CircleCheck, History, Layers, RefreshCw, Send } from 'lucide-solid'
import { api, ApiError } from '../lib/api'
import { authState } from '../lib/auth'
import { refreshQueries } from '../lib/refresh'
import { humanizeToken } from '../lib/format'
import { errorMessage, relativeTime, timestampMillis } from '../lib/format'
import { cn } from '../lib/cn'
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
import { HookScorecardPanel } from '../components/HookScorecardPanel'
import { Alert } from '../components/app/alert'
import { PageShell } from '../components/layout'
import { Act, Card, DashHeader, IconAct, Note, Pill, Split, StatRow, Tile, Tiles, type Tone, SubPagePanel, useSubPage } from '../components/ui/dash'
import { SectionFailureCard } from '../components/SectionFailureCard'
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
const MATERIAL_LABEL: Record<string, string> = {
  social_post: 'Your social posts', release: 'Songs', video: 'Videos', event: 'Show dates', show_completed: 'Shows played', story: 'Stories',
}

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
  posting: { label: 'Posting', variant: 'muted' },
  rate_limited: { label: 'Rate-limited — retrying', variant: 'warning' },
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


export type ContentSection = 'overview' | 'hooks' | 'links'

const SECTION_TITLE: Record<ContentSection, string> = {
  overview: 'Content',
  hooks: 'What held attention',
  links: 'Tracked links',
}

export const ContentOverviewPage = () => <TenantContentPage section="overview" />
export const ContentHooksPage = () => <TenantContentPage section="hooks" />
export const ContentLinksPage = () => <TenantContentPage section="links" />

// Material in → the brain drafts → a person says yes → it goes out. The page
// is those three stages in order: the queue that waits for a person first,
// the material it draws from, then what went out.
export function TenantContentPage(props: { section: ContentSection }) {
  const params = useParams({ strict: false }) as () => { slug: string }
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
    get error() { return model.error ?? (model.data && !model.data.pipeline ? unavailableError("The approval list didn't load.") : null) },
    get isFetching() { return model.isFetching },
    get dataUpdatedAt() { return model.dataUpdatedAt },
    refetch: () => model.refetch(),
  }
  const results = {
    get data() { return model.data?.delivery_results?.results ?? undefined },
    get error() { return model.error ?? (model.data && !model.data.delivery_results ? unavailableError("The sent list didn't load.") : null) },
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
  // "Material" is its own page (/content/material) and sits beside these
  // sub-pages in the sidebar; `?tab=material` redirects there.
  const areas = useSubPage(() => props.section, '/tenants/$slug/content')
  // "Material it works from": the material page's own one-statement view,
  // carried inside the content model. Seeding the material page's key with it
  // means opening that page costs no second read.
  const queryClient = useQueryClient()
  const material = {
    get data() { return model.data?.material ?? undefined },
    get error() { return model.error ?? (model.data && !model.data.material ? unavailableError("The material didn't load.") : null) },
  }
  createEffect(() => {
    const view = model.data?.material
    if (view) queryClient.setQueryData(['content-material-view', params().slug], view, { updatedAt: model.dataUpdatedAt })
  })
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
      if (err instanceof ApiError && err.status === 409) setItemError(action.id, errorMessage(err, ""))
      else setItemError(action.id, failureLine("Couldn't approve it", err))
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
      setItemError(action.id, failureLine("Couldn't reject it", err))
    } finally {
      setPendingId(null)
    }
  }

  return <PageShell>
    <DashHeader
      title={SECTION_TITLE[props.section]}
      subtitle="What is ready to post, and what went out"
      pill={status()}
      actions={
        <IconAct onClick={refresh} disabled={refreshing()} label="Refresh" title={updated() ? `Updated ${updated()}` : 'Refresh'}>
          <RefreshCw class={cn('size-3.5', refreshing() && 'animate-spin')} aria-hidden="true" />
        </IconAct>
      }
    />

    <Show when={pipeline.error}>
      <SectionFailureCard error={pipeline.error} title="Couldn't load the approval list" onRetry={() => void pipeline.refetch()} />
    </Show>
    <Show when={results.error}>
      <SectionFailureCard error={results.error} title="Couldn't load the published list" onRetry={() => void results.refetch()} />
    </Show>


    <SubPagePanel when={areas.active() === 'overview'}>
    <Show when={model.data} fallback={<SkeletonKpiStrip count={4} />}>
      <Tiles>
        <Tile label="Ready to post" value={results.data ? ready().length : null} sub={results.data ? `${readyForums()} forums · ${ready().length - readyForums()} social` : undefined} />
        <Tile
          label="Went out, 7 days"
          value={results.data ? wentOutWeek().length - pushFans() + pushGroups() : null}
          sub={results.data ? `${pushGroups()} fan pushes · ${wentOutWeek().filter(r => r.kind !== 'signal_push').length} channels` : undefined}
        />
        <Tile label="Didn't land" value={results.data ? failed().length : null} valueTone={failed().length > 0 ? 'bad' : undefined} sub={failed().length > 0 ? 'failed to publish' : 'nothing failed'} />
        <Tile label="Material watched" value={pipeline.data?.live_sources} sub="posts, videos, releases, shows" />
      </Tiles>
    </Show>

    <Show when={ready().length > 0}>
      <Card title="Ready to post" icon={<Send />} aside="copy, open, mark posted" class="mb-3">
        <div class="mt-1 grid gap-2.5 md:grid-cols-3">
          <For each={ready().slice(0, 3)}>{(r: DeliveryResult) => (
            <div class="min-w-0 rounded-lg border border-border px-3 py-2.5">
              <p class="m-0 text-xs text-muted-foreground">{channelName(r.channel) || (KIND_LABEL[r.kind] ?? r.kind.replace(/_/g, ' '))}</p>
              <Show when={contentExcerpt(r.content)}>
                {text => <p class="m-0 mt-1.5 line-clamp-3 whitespace-pre-line text-sm text-foreground">{text()}</p>}
              </Show>
              <div class="mt-2.5 flex flex-wrap gap-1.5">
                <Show when={contentExcerpt(r.content)}>
                  {text => <Act onClick={() => { void navigator.clipboard.writeText(text()).then(() => toast.success('Copied')).catch(() => toast.error('Copy failed — select the text by hand.')); if (r.url) window.open(r.url, '_blank', 'noopener') }}>{r.url ? 'Copy and open' : 'Copy'}</Act>}
                </Show>
                <Show when={r.kind === 'social_post'}>
                  <ManualSocialPostRegister slug={params().slug} post={r} onDone={() => void model.refetch()} />
                </Show>
                <Show when={r.kind === 'telegram_post' || r.kind === 'discord_post'}>
                  <ManualMessageRegister slug={params().slug} post={r} onDone={() => void model.refetch()} />
                </Show>
              </div>
            </div>
          )}</For>
        </div>
        <Show when={ready().length > 3}>
          <Note>+{ready().length - 3} more waiting to be posted by hand.</Note>
        </Show>
      </Card>
    </Show>

    {/* ── Waiting for your yes ── */}
    <Show when={pending().length > 0}>
    <Card title="Waiting for your yes" icon={<Bell />} aside={`${pending().length} ${pending().length === 1 ? 'draft' : 'drafts'} from your material`} class="mb-3">
      <Show when={!pipeline.error && !pipeline.data}>
        <SkeletonRows count={2} />
      </Show>
      <Show when={pipeline.data}>
        <Show when={pending().length > 0} fallback={
          <EmptyState icon={<CircleCheck />} label="Nothing waiting" hint="When the brain drafts a post, a story or a push from your material, it lands here for your yes." />
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
    </Card>
    </Show>
    <Show when={pipeline.data?.revision_trend}>
      {trend => (
        <p class="m-0 mb-3 text-xs text-muted-foreground">
          Voice match: {trend().revised_fields_30d} fields fixed in 30 days · about {trend().avg_distance_chars_30d} characters per fix — falls as drafts get closer to your words.
        </p>
      )}
    </Show>

    <Split mid>
      <Card title="Went out" icon={<History />}>
        <Show when={!results.error && !results.data}><SkeletonRows count={3} /></Show>
        <Show when={results.data}>
          <Show when={wentOutGroups().length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">Nothing has gone out yet.</p>}>
            <For each={wentOutGroups().slice(0, 6)}>{({ row: r, count }) => {
              const badge = statusBadge(r.status)
              const tone: Tone = badge.variant === 'success' ? 'good' : badge.variant === 'destructive' ? 'bad' : badge.variant === 'warning' ? 'warn' : 'muted'
              return (
                <StatRow
                  label={[contentExcerpt(r.content)?.slice(0, 60) ?? (KIND_LABEL[r.kind] ?? r.kind), r.kind === 'signal_push' ? 'to Signal fans' : channelName(r.channel)].filter(Boolean).join(' · ')}
                  value={<Pill tone={tone}>{badge.label.toLowerCase()}{r.kind === 'signal_push' ? ` · ${count}` : ''}</Pill>}
                />
              )
            }}</For>
            <Note>Likes and comments appear here once a platform reports them.</Note>
          </Show>
        </Show>
      </Card>
      <Card title="Material it works from" icon={<Layers />} aside={<Link to="/tenants/$slug/content/material" params={{ slug: params().slug }} class="hover:text-foreground">Material →</Link>}>
        <Show when={material.data} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">{material.error ? "Couldn't load the material." : ''}</p>}>
          <For each={(material.data?.by_kind ?? []).slice().sort((a, b) => b.total - a.total)}>{kind => (
            <StatRow label={MATERIAL_LABEL[kind.kind] ?? humanizeToken(kind.kind)} value={<span class="tabular-nums text-foreground">{kind.kind === 'release' ? `~${kind.distinct_titles}` : kind.total}</span>} />
          )}</For>
          <Note>New posts on Facebook and Instagram sync by themselves.</Note>
        </Show>
      </Card>
    </Split>
    </SubPagePanel>

    <SubPagePanel when={areas.active() === 'hooks'}>
      <HookScorecardPanel slug={params().slug} />
    </SubPagePanel>
    <SubPagePanel when={areas.active() === 'links'}>
      <TrackedLinksPanel slug={params().slug} />
    </SubPagePanel>
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
      toast.error("Couldn't register the post", error)
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
          aria-label="Link to the live post"
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
      toast.error("Couldn't register the post", error)
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
          aria-label={telegram() ? 'Telegram message id' : 'Discord message id'}
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
