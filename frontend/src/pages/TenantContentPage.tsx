import { For, Show, createEffect, createMemo, createSignal, createUniqueId, type JSX } from 'solid-js'
import { failureLine, unavailableError } from '../lib/errors'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { Link, useParams } from '@tanstack/solid-router'
import { AlertTriangle, History, Layers } from 'lucide-solid'
import { api, ApiError } from '../lib/api'
import { authState } from '../lib/auth'
import { refreshQueries } from '../lib/refresh'
import { humanizeToken, tokenLabel } from '../lib/format'
import { errorMessage, timestampMillis } from '../lib/format'
import { Spinner } from '../components/Spinner'
import { EmptyState } from '../components/ui/empty-state'
import { SkeletonRows } from '../components/Skeleton'
import { Skeleton } from '../components/ui/skeleton'
import { Button } from '../components/app/button'
import { Input } from '../components/ui/input'
import { toast } from '../components/app/toast'
import { fillPath, surface } from '../lib/surface'
import { capabilityAction } from '../lib/capabilities'
import { TrackedLinksPanel } from '../components/TrackedLinksPanel'
import { HookScorecardPanel } from '../components/HookScorecardPanel'
import { Alert } from '../components/app/alert'
import { PageShell, Section } from '../components/layout'
import { DataTable, type ColumnDef } from '../components/app/data-table'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet'
import { cn } from '../lib/cn'
import { Card, DashHeader, Note, Pill, StatRow, type Tone, SubPagePanel, useSubPage } from '../components/ui/dash'
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
  RESULT_STATUS[status] ?? { label: tokenLabel(status), variant: 'muted' as const }

const COLUMN_DOT: Record<'warn' | 'muted' | 'accent', string> = {
  warn: 'bg-warning-foreground',
  muted: 'bg-muted-foreground/50',
  accent: 'bg-info-foreground',
}

/** One stage of the board: a quiet tinted lane with its name, count and a
 *  line on what happens in it, then its cards — the first five, and the
 *  rest a click away so one busy stage cannot stretch the page. */
function BoardColumn<T>(props: {
  id: string
  title: string
  hint: string
  /** `null` while the stage could not be read — not the same as empty. */
  items: T[] | null
  tone: 'warn' | 'muted' | 'accent'
  empty: string
  children: (item: T) => JSX.Element
}) {
  const LIMIT = 5
  const [all, setAll] = createSignal(false)
  const items = () => props.items ?? []
  const shown = () => all() ? items() : items().slice(0, LIMIT)
  return (
    <section role="listitem" aria-labelledby={props.id} class="flex min-w-0 flex-col gap-3 rounded-xl bg-muted/40 p-3">
      <header class="px-1">
        <h2 id={props.id} class="flex items-center gap-2 text-sm font-medium text-foreground">
          <span class={cn('size-2 shrink-0 rounded-full', COLUMN_DOT[props.tone])} aria-hidden="true" />
          {props.title}
          <span class="ml-auto rounded-full bg-background px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{props.items == null ? '—' : items().length}</span>
        </h2>
        <p class="mt-1 text-xs text-muted-foreground text-pretty">{props.hint}</p>
      </header>
      <Show when={items().length > 0} fallback={
        <p class="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground text-pretty">
          {props.items == null ? "Couldn't load this stage." : props.empty}
        </p>
      }>
        <ul class="flex flex-col gap-2">
          <For each={shown()}>{item => props.children(item)}</For>
        </ul>
        <Show when={items().length > LIMIT}>
          <Button variant="ghost" size="sm" class="self-start" aria-expanded={all()} onClick={() => setAll(v => !v)}>
            {all() ? 'Show fewer' : `Show all ${items().length}`}
          </Button>
        </Show>
      </Show>
    </section>
  )
}

/** A card on the board — a plain surface that lifts its border on hover
 *  and when anything inside it has focus. */
function BoardCard(props: { children: JSX.Element }) {
  return (
    <li class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors duration-150 hover:border-foreground/20 focus-within:border-foreground/30">
      {props.children}
    </li>
  )
}

/** The board's loading shape: three lanes with two cards each. */
function SkeletonBoard() {
  return (
    <div class="grid gap-4 lg:grid-cols-3" role="status">
      <span class="sr-only">Loading…</span>
      <For each={[0, 1, 2]}>{() => (
        <div class="space-y-3 rounded-xl bg-muted/40 p-3">
          <Skeleton class="h-4 w-1/2" />
          <Skeleton class="h-24 w-full" />
          <Skeleton class="h-24 w-full" />
        </div>
      )}</For>
    </div>
  )
}

/// What kind of post a row is, in words — the raw kind leaked as
/// "warm_leads" when it had no label.
const kindName = (r: DeliveryResult) => KIND_LABEL[r.kind] ?? tokenLabel(r.kind)

/// The draft's own words: its first revisable field, the way it will read.
const draftPreview = (a: PendingAutopilotAction): string | undefined => {
  const values = Object.values(a.revisable ?? {}).filter(v => typeof v === 'string' && v.trim().length > 0)
  return values[0]
}
const firstLine = (text: string | undefined) => text?.split('\n').map(l => l.trim()).find(Boolean)

/** Long words to post: three lines, then the rest on request — never cut
 *  with no way to read what you are about to publish. */
function ExpandableText(props: { text: string; muted?: boolean }) {
  const [open, setOpen] = createSignal(false)
  const long = () => props.text.length > 160 || props.text.split('\n').length > 3
  return <div>
    <p class={cn('whitespace-pre-line text-sm text-pretty break-words', props.muted ? 'text-muted-foreground' : 'text-foreground', !open() && long() && 'line-clamp-3')}>{props.text}</p>
    <Show when={long()}>
      <Button variant="link" class="h-auto p-0 text-xs" aria-expanded={open()} onClick={() => setOpen(o => !o)}>
        {open() ? 'Show less' : 'Show all'}
      </Button>
    </Show>
  </div>
}

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

/// Where a post goes, as a person names it: a subreddit stays "r/…", a
/// platform is capitalised ("instagram" → "Instagram").
const placeName = (r: DeliveryResult) => {
  const channel = channelName(r.channel)
  if (!channel) return KIND_LABEL[r.kind] ?? tokenLabel(r.kind)
  return channel.startsWith('r/') ? channel : tokenLabel(channel)
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


export type ContentSection = 'overview' | 'hooks' | 'links'

const SECTION_TITLE: Record<ContentSection, string> = {
  overview: 'Content',
  hooks: 'What held attention',
  links: 'Tracked links',
}

const SECTION_SUBTITLE: Record<ContentSection, string> = {
  overview: 'What is ready to post, and what went out',
  hooks: 'Which of your posts held attention, and which made fans',
  links: 'Share these instead of the bare address, so each post is credited with the fans it brings',
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

  // ── Tables ─────────────────────────────────────────────────────────
  const [reviewing, setReviewing] = createSignal<PendingAutopilotAction | null>(null)

  /// Approve and reject, each a two-step confirm. Shared by the row and the
  /// draft sheet so both ask the same way.
  const decisionButtons = (action: PendingAutopilotAction) => {
    const approveKey = `approve:${action.id}`
    const rejectKey = `reject:${action.id}`
    const busyHere = () => pendingId() === action.id
    const other = () => pendingId() !== null && pendingId() !== action.id
    // A function, not one node: Solid places a node once, so a shared span
    // ended up on the last button and the rest lost their names.
    const name = () => <span class="sr-only">: {draftName(action)}</span>
    return <Show when={confirming() === approveKey} fallback={
      <Show when={confirming() === rejectKey} fallback={
        <>
          <Button size="sm" writes disabled={other() || busyHere()} onClick={() => setConfirming(approveKey)}>Approve{name()}</Button>
          <Button variant="outline" size="sm" writes disabled={other() || busyHere()} onClick={() => setConfirming(rejectKey)}>Reject{name()}</Button>
        </>
      }>
        <Button variant="destructive" size="sm" writes disabled={busyHere()} onClick={() => void rejectAction(action).then(() => { if (!errors()[action.id]) setReviewing(null) })}>
          {busyHere() && <Spinner />} {busyHere() ? 'Rejecting…' : 'Confirm rejection'}{name()}
        </Button>
        <Button variant="ghost" size="sm" disabled={busyHere()} onClick={() => setConfirming(null)}>Back</Button>
      </Show>
    }>
      <Button size="sm" writes disabled={busyHere()} onClick={() => void approveAction(action).then(() => { if (!errors()[action.id]) setReviewing(null) })}>
        {busyHere() && <Spinner />} {busyHere() ? 'Approving…' : revisionFor(action) ? 'Confirm approval as edited' : 'Confirm approval'}{name()}
      </Button>
      <Button variant="ghost" size="sm" disabled={busyHere()} onClick={() => setConfirming(null)}>Cancel</Button>
    </Show>
  }

  /// A row's name: the material it came from, else the draft's own words —
  /// six rows of "Content piece · A content piece" told the drafts apart by
  /// nothing.
  const draftName = (action: PendingAutopilotAction) =>
    sourceTitle(action.payload.source_id) ?? firstLine(draftPreview(action)) ?? `${draftTitle(action)} from ${fmtDate(action.created_at)}`

  type WentOut = { row: DeliveryResult; count: number }
  const wentOutColumns: ColumnDef<WentOut, any>[] = [
    {
      id: 'what', header: 'What', accessorFn: g => contentExcerpt(g.row.content) ?? kindName(g.row), meta: { class: 'min-w-64' },
      cell: c => <span class="block max-w-xl text-pretty">{contentExcerpt(c.row.original.row.content) ?? kindName(c.row.original.row)}</span>,
    },
    {
      id: 'where', header: 'Where', accessorFn: g => g.row.kind === 'signal_push' ? 'Signal fans' : channelName(g.row.channel),
      cell: c => <span class="text-muted-foreground">{c.row.original.row.kind === 'signal_push'
        ? `Signal fans${c.row.original.count > 1 ? ` · ${c.row.original.count}` : ''}`
        : placeName(c.row.original.row)}</span>,
    },
    {
      id: 'status', header: 'Status', accessorFn: g => statusBadge(g.row.status).label, meta: { class: 'whitespace-nowrap' },
      cell: c => {
        const badge = statusBadge(c.row.original.row.status)
        const tone: Tone = badge.variant === 'success' ? 'good' : badge.variant === 'destructive' ? 'bad' : badge.variant === 'warning' ? 'warn' : 'muted'
        return <Pill tone={tone}>{badge.label}</Pill>
      },
    },
    {
      id: 'when', header: 'When', accessorFn: g => timestampMillis(g.row.posted_at ?? g.row.created_at) || 0, meta: { class: 'whitespace-nowrap' },
      cell: c => <span class="text-muted-foreground">{fmtDate(c.row.original.row.posted_at ?? c.row.original.row.created_at)}</span>,
    },
  ]

  // ── The board ─────────────────────────────────────────────────────
  // Content moves one way — your yes, then out by itself or by your hand —
  // so the work in progress is three columns and each card carries its own
  // next step as a button. No dragging: every move here either sends
  // something or needs a link, and both deserve a click, not a drop.
  const isAuto = (r: DeliveryResult) => ['pending', 'posting', 'rate_limited'].includes(r.status)
  const isPublished = (r: DeliveryResult) => ['posted', 'published', 'delivered'].includes(r.status)
  /// Pushes land once per fan; a card is one push, with how many fans.
  const groupPushes = (rows: DeliveryResult[]) => {
    const groups = new Map<string, { row: DeliveryResult; count: number }>()
    for (const row of rows) {
      const day = (row.posted_at ?? row.created_at).slice(0, 10)
      const key = row.kind === 'signal_push' ? `${row.kind}|${contentExcerpt(row.content) ?? ''}|${day}|${row.status}` : row.id
      const group = groups.get(key)
      if (group) group.count += 1
      else groups.set(key, { row, count: 1 })
    }
    return [...groups.values()]
  }
  const going = createMemo(() => groupPushes((results.data ?? []).filter(isAuto)))
  const publishedGroups = createMemo(() => wentOutGroups().filter(g => isPublished(g.row)))

  const placeLine = (g: { row: DeliveryResult; count: number }) =>
    g.row.kind === 'signal_push' ? `Signal fans${g.count > 1 ? ` · ${g.count}` : ''}` : placeName(g.row)

  return <PageShell>
    <DashHeader
      title={SECTION_TITLE[props.section]}
      subtitle={SECTION_SUBTITLE[props.section]}
    />

    <Show when={pipeline.error}>
      <SectionFailureCard error={pipeline.error} title="Couldn't load the approval list" onRetry={() => void pipeline.refetch()} />
    </Show>
    <Show when={results.error}>
      <SectionFailureCard error={results.error} title="Couldn't load the published list" onRetry={() => void results.refetch()} />
    </Show>


    <SubPagePanel when={areas.active() === 'overview'}>
    <div class="space-y-6">
    <Show when={model.data} fallback={<SkeletonBoard />}>
      {/* Failures lead, and only when there are any: they are the one thing
          on this page that did not go where it was meant to. */}
      <Show when={failed().length > 0}>
        <section aria-labelledby="content-failed" class="rounded-xl border border-error-foreground/30 bg-error-foreground/5 p-4">
          <h2 id="content-failed" class="flex items-center gap-2 text-sm font-medium text-foreground">
            <AlertTriangle class="size-4 text-error-foreground" aria-hidden="true" />
            Didn't land <span class="tabular-nums text-muted-foreground">{failed().length}</span>
          </h2>
          <ul class="mt-2 space-y-2">
            <For each={failed()}>{r => (
              <li class="text-sm">
                <span class="font-medium text-foreground">{placeName(r)}</span>
                <span class="text-muted-foreground"> · {fmtDate(r.posted_at ?? r.created_at)}</span>
                <Show when={contentExcerpt(r.content)}>{t => <span class="block text-muted-foreground text-pretty">{t()}</span>}</Show>
                <Show when={r.error_message}>{e => <span class="block text-xs text-error-foreground text-pretty">{e()}</span>}</Show>
              </li>
            )}</For>
          </ul>
        </section>
      </Show>

      <div class="grid items-start gap-4 lg:grid-cols-3" role="list" aria-label="Content in progress">
        <BoardColumn
          id="col-yes"
          title="Needs your yes"
          hint="Drafts from your material. Read, edit if you like, then approve."
          items={pipeline.data ? pending() : null}
          tone="warn"
          empty="Nothing waiting. New drafts land here."
        >
          {action => (
            <BoardCard>
              <div class="flex items-start justify-between gap-2">
                <Pill tone="muted">{draftTitle(action)}</Pill>
                <span class="shrink-0 text-xs text-muted-foreground">{fmtDate(action.created_at)}</span>
              </div>
              <p class="text-sm font-medium text-foreground text-pretty">{draftName(action)}</p>
              <Show when={draftPreview(action) && draftPreview(action) !== draftName(action)}>
                {/* Three lines here; the whole draft opens with Review. */}
                <p class="line-clamp-3 text-sm text-muted-foreground text-pretty">{draftPreview(action)}</p>
              </Show>
              <Show when={!action.executor_ready && action.required_capability}>
                <p class="text-xs font-medium text-warning-foreground">Nothing can run this yet — approving queues it.</p>
              </Show>
              <Show when={errors()[action.id]}>
                <p class="text-xs font-medium text-error-foreground">{errors()[action.id]}</p>
              </Show>
              <div class="flex flex-wrap items-center gap-1.5 pt-1">
                <Show when={action.revisable && Object.keys(action.revisable).length > 0}>
                  <Button variant="ghost" size="sm" onClick={() => setReviewing(action)}>Review<span class="sr-only">: {draftName(action)}</span></Button>
                </Show>
                {decisionButtons(action)}
              </div>
            </BoardCard>
          )}
        </BoardColumn>

        <BoardColumn
          id="col-auto"
          title="Posting automatically"
          hint="Approved and on its way. Nothing to do here."
          items={results.data ? going() : null}
          tone="muted"
          empty="Nothing in flight. Approved posts appear here while they go out."
        >
          {g => (
            <BoardCard>
              <div class="flex items-start justify-between gap-2">
                <span class="text-sm font-medium text-foreground">{placeLine(g)}</span>
                <Pill tone={g.row.status === 'rate_limited' ? 'warn' : 'muted'}>{statusBadge(g.row.status).label}</Pill>
              </div>
              <Show when={contentExcerpt(g.row.content)}>{t => <ExpandableText text={t()} muted />}</Show>
              <span class="text-xs text-muted-foreground">{fmtDate(g.row.created_at)}</span>
            </BoardCard>
          )}
        </BoardColumn>

        <BoardColumn
          id="col-hand"
          title="Post by hand"
          hint="Copy the words, post them, then add the link so they can be measured."
          items={results.data ? ready() : null}
          tone="accent"
          empty="Nothing to post by hand."
        >
          {r => (
            <BoardCard>
              <div class="flex items-start justify-between gap-2">
                <span class="text-sm font-medium text-foreground">{placeName(r)}</span>
                <Show when={kindName(r).toLowerCase() !== placeName(r).toLowerCase()}>
                  <Pill tone="muted">{kindName(r)}</Pill>
                </Show>
              </div>
              <Show when={contentExcerpt(r.content)} fallback={<p class="text-sm text-muted-foreground">No words recorded</p>}>
                {t => <ExpandableText text={t()} />}
              </Show>
              <div class="flex flex-col items-start gap-2 pt-1">
                <Show when={contentExcerpt(r.content)}>
                  {t => <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(t()).then(() => toast.success('Copied')).catch(() => toast.error('Copy failed — select the text by hand.')); if (r.url) window.open(r.url, '_blank', 'noopener') }}>
                    {r.url ? 'Copy and open' : 'Copy the words'}<Show when={r.url}><span class="sr-only"> (opens in a new tab)</span></Show>
                  </Button>}
                </Show>
                <Show when={r.kind === 'social_post'}>
                  <ManualSocialPostRegister slug={params().slug} post={r} onDone={() => void model.refetch()} />
                </Show>
                <Show when={r.kind === 'telegram_post' || r.kind === 'discord_post'}>
                  <ManualMessageRegister slug={params().slug} post={r} onDone={() => void model.refetch()} />
                </Show>
              </div>
            </BoardCard>
          )}
        </BoardColumn>
      </div>

      <Show when={pipeline.data?.revision_trend}>
        {trend => (
          <p class="text-xs text-muted-foreground text-pretty">
            Voice match: {trend().revised_fields_30d} fields fixed in 30 days, about {trend().avg_distance_chars_30d} characters per fix. It falls as drafts get closer to your words.
          </p>
        )}
      </Show>

      {/* What already went out is a record, not work — a searchable table
          under the board rather than a column that only ever grows. */}
      <div class="grid items-start gap-6 xl:grid-cols-3">
        <section class="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5 xl:col-span-2">
          <Section
            flush
            title="Published"
            icon={<History />}
            count={publishedGroups().length}
            description={`Newest first; ${wentOutWeek().length - pushFans() + pushGroups()} in the last 7 days. A push to many fans counts once. Likes and comments appear once a platform reports them.`}
          >
            <Show when={!results.error && !results.data}><SkeletonRows count={3} /></Show>
            <Show when={results.data}>
              <DataTable
                data={publishedGroups()}
                columns={wentOutColumns}
                getRowId={g => g.row.id}
                bordered={false}
                pageSize={8}
                initialSorting={[{ id: 'when', desc: true }]}
                searchText={g => [contentExcerpt(g.row.content), kindName(g.row), channelName(g.row.channel)].filter(Boolean).join(' ')}
                searchPlaceholder="Search what was published"
                empty={<EmptyState icon={<History />} label="Nothing published yet" hint="Approved drafts and posts you publish by hand show up here." />}
              />
            </Show>
          </Section>
        </section>
        <Card title="Material it works from" icon={<Layers />} aside={<Link to="/tenants/$slug/content/material" params={{ slug: params().slug }} class="hover:text-foreground">Material →</Link>}>
          <Show when={material.data} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">{material.error ? "Couldn't load the material." : ''}</p>}>
            <For each={(material.data?.by_kind ?? []).slice().sort((a, b) => b.total - a.total)}>{kind => (
              <StatRow label={MATERIAL_LABEL[kind.kind] ?? humanizeToken(kind.kind)} value={<span class="tabular-nums text-foreground">{kind.kind === 'release' ? `~${kind.distinct_titles}` : kind.total}</span>} />
            )}</For>
            <Note>{pipeline.data?.live_sources ?? '—'} sources watched. New posts on Facebook and Instagram sync by themselves.</Note>
          </Show>
        </Card>
      </div>
    </Show>
    </div>

    {/* The draft an approve sends, read and edited beside the table. */}
    <Sheet open={reviewing() !== null} onOpenChange={open => { if (!open) setReviewing(null) }}>
      <SheetContent class="flex w-full flex-col gap-0 overscroll-contain p-0 sm:max-w-lg">
        <Show when={reviewing()} keyed>{action => {
          const fields = () => action.revisable ?? {}
          return <>
            <SheetHeader class="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
              <SheetTitle class="text-base text-pretty">{draftName(action)}</SheetTitle>
              <SheetDescription class="text-pretty">{draftTitle(action)} · asked {fmtDate(action.created_at)}</SheetDescription>
            </SheetHeader>
            <div class="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4">
              <Show when={!action.executor_ready && action.required_capability}>
                <Alert tone="warning" role="status"><strong>Nothing can run this yet.</strong> {authState.isPlatformLevel() ? 'Approving queues it until a worker starts.' : 'Approving keeps it waiting until the poster is up.'}</Alert>
              </Show>
              <DraftEditor
                fields={fields()}
                value={edits()[action.id] ?? fields()}
                onChange={(field, value) => editField(action, field, value)}
                editing={editing().has(action.id)}
                onToggle={() => toggleEdit(action.id)}
              />
              <Show when={errors()[action.id]}>
                <p class="text-xs font-medium text-error-foreground">{errors()[action.id]}</p>
              </Show>
            </div>
            <div class="flex shrink-0 flex-row flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Show when={!editing().has(action.id)}>
                <Button variant="ghost" size="sm" writes disabled={pendingId() !== null} onClick={() => toggleEdit(action.id)}>Edit</Button>
              </Show>
              {decisionButtons(action)}
            </div>
          </>
        }}</Show>
      </SheetContent>
    </Sheet>
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
  const [problem, setProblem] = createSignal<string | null>(null)
  const id = createUniqueId()
  // Checked on submit and said under the field — a Register button that
  // just stayed grey never told anyone why.
  const register = async () => {
    if (busy()) return
    if (!/^https:\/\/\S+\.\S+/.test(url().trim())) { setProblem('Paste the full link where the post is live, starting with https://'); return }
    setProblem(null)
    setBusy(true)
    try {
      await api.registerManualSocialPost(props.slug, props.post.id, url().trim())
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
        <Button variant="link" class="h-auto p-0 text-xs font-normal" writes onClick={() => setOpen(true)}>
          I posted it — add the link
        </Button>
      }
    >
      <form class="flex w-full max-w-xs flex-col gap-1 text-left" noValidate onSubmit={e => { e.preventDefault(); void register() }}>
        <span class="flex items-center gap-2">
          <Input
            id={id}
            type="url"
            class="h-8 min-w-0 flex-1 text-xs"
            aria-label="Link to the live post"
            aria-invalid={problem() ? 'true' : undefined}
            aria-describedby={problem() ? `${id}-problem` : undefined}
            placeholder="https://… where the post landed"
            value={url()}
            onInput={e => setUrl(e.currentTarget.value)}
          />
          <Button type="submit" size="sm" variant="outline" writes disabled={busy()}>
            <Show when={busy()}><Spinner /></Show>
            Add
          </Button>
        </span>
        <Show when={problem()}><span id={`${id}-problem`} class="text-xs text-error-foreground">{problem()}</span></Show>
      </form>
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
  const [problem, setProblem] = createSignal<string | null>(null)
  const fieldId = createUniqueId()
  const register = async () => {
    if (busy()) return
    if (!valid()) {
      setProblem(telegram() ? 'Use the message id: digits only, as Telegram shows it.' : 'Use the message id: the long number Discord copies with "Copy Message ID".')
      return
    }
    setProblem(null)
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
        <Button variant="link" class="h-auto p-0 text-xs font-normal" writes onClick={() => setOpen(true)}>
          I posted it — add the message id
        </Button>
      }
    >
      <form class="flex w-full max-w-xs flex-col gap-1 text-left" noValidate onSubmit={e => { e.preventDefault(); void register() }}>
        <span class="flex items-center gap-2">
          <Input
            class="h-8 min-w-0 flex-1 text-xs"
            inputMode="numeric"
            aria-label={telegram() ? 'Telegram message id' : 'Discord message id'}
            aria-invalid={problem() ? 'true' : undefined}
            aria-describedby={problem() ? `${fieldId}-problem` : undefined}
            placeholder={telegram() ? 'Telegram message id' : 'Discord message id'}
            value={messageId()}
            onInput={e => setMessageId(e.currentTarget.value)}
          />
          <Button type="submit" size="sm" variant="outline" writes disabled={busy()}>
            <Show when={busy()}><Spinner /></Show>
            Add
          </Button>
        </span>
        <Show when={problem()}><span id={`${fieldId}-problem`} class="text-xs text-error-foreground">{problem()}</span></Show>
      </form>
    </Show>
  )
}
