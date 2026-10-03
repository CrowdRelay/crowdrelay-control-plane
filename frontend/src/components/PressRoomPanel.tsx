import { For, Show, createMemo, createSignal, type JSX } from 'solid-js'
import { FormDrawer } from './app/form-drawer'
import { failureLine } from '../lib/errors'
import { Field } from './ui/field'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { refreshQueries } from '../lib/refresh'
import { formatTimestamp, httpUrl, relativeTime } from '../lib/format'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { ErrorCard } from './layout'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { DataTable, type ColumnDef } from './app/data-table'
import { NativeSelect } from './ui/native-select'
import { Input } from './ui/input'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'
import type { BeaconEngagementView, BeaconPressRequestView, PressOverviewSection } from '../lib/types'
import { CloudOff, Handshake, Image, Inbox, MoreHorizontal, Newspaper, Plus } from 'lucide-solid'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuGroupLabel, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { READ_ONLY_REASON } from '../lib/read-only'

const statusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' => {
  switch (status) {
    case 'resolved': case 'fulfilled': return 'good'
    case 'pending': case 'open': return 'warn'
    case 'declined': case 'rejected': return 'bad'
    default: return 'muted'
  }
}

const toneToVariant = (tone: 'good' | 'warn' | 'bad' | 'muted'): 'success' | 'warning' | 'destructive' | 'muted' =>
  tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : tone === 'bad' ? 'destructive' : 'muted'

// `BeaconReplyDisposition` in crowdrelay-domain. Ordered by how much the
// answer is worth, with the two that end the relationship last.
const REPLY_DISPOSITIONS = [
  { value: 'received', label: 'Replied' },
  { value: 'interested', label: 'Interested' },
  { value: 'partner', label: 'Partnered' },
  { value: 'declined', label: 'Declined' },
  { value: 'do_not_contact', label: 'Do not contact' },
] as const

/** One line of the press room, whichever of the four sections it came from. */
type PressRow = {
  id: string
  section: PressOverviewSection
  who: string
  whoDetail: string | null
  what: string
  whatDetail: string | null
  event: string | null
  /** `null` where the section has no status — coverage just happened. */
  status: string | null
  at: string
  url: string | null
  request?: BeaconPressRequestView
  engagement?: BeaconEngagementView
}

// Each kind gets its own chart hue and icon so the Type column reads at a
// glance down a mixed list. Chart tokens, not status ones: green/amber/red
// already mean something in the Status column next to it. The label keeps
// the foreground colour for contrast; the hue carries the tint and the icon.
const SECTIONS: { id: PressOverviewSection; label: string; one: string; icon: typeof Inbox; tone: string }[] = [
  { id: 'requests', label: 'Requests', one: 'Request', icon: Inbox, tone: 'border-chart-1/40 bg-chart-1/15 [&>svg]:text-chart-1' },
  { id: 'assets', label: 'Assets', one: 'Asset', icon: Image, tone: 'border-chart-2/40 bg-chart-2/15 [&>svg]:text-chart-2' },
  { id: 'engagements', label: 'Engagements', one: 'Engagement', icon: Handshake, tone: 'border-info-solid/30 bg-info [&>svg]:text-info-foreground' },
  { id: 'coverage', label: 'Coverage', one: 'Coverage', icon: Newspaper, tone: 'border-chart-3/40 bg-chart-3/15 [&>svg]:text-chart-3' },
]
const sectionOf = (id: PressOverviewSection) => SECTIONS.find(s => s.id === id)!
const sectionName = (id: PressOverviewSection) => sectionOf(id).one

const TypeBadge = (props: { section: PressOverviewSection }) => {
  const section = () => sectionOf(props.section)
  return (
    <Badge variant="outline" class={`gap-1.5 px-2.5 py-1 font-semibold text-foreground ${section().tone}`}>
      {(() => { const Icon = section().icon; return <Icon class="size-3.5" stroke-width={2.25} aria-hidden="true" /> })()}
      {section().one}
    </Badge>
  )
}

export function PressRoomPanel(props: { slug: string }) {
  const [show, setShow] = createSignal<PressOverviewSection | 'all'>('all')
  const [error, setError] = createSignal<string | null>(null)
  const [resolving, setResolving] = createSignal<string | null>(null)
  const [replying, setReplying] = createSignal<string | null>(null)
  const [adding, setAdding] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [draft, setDraft] = createSignal({
    assetKey: '',
    assetKind: 'photo',
    labelEn: '',
    labelPl: '',
    url: '',
  })

  // One consolidated read model replaces four separate proxy round-trips.
  // The backend fans out to the four beacon endpoints concurrently and
  // projects them with per-section degradation metadata.
  const model = useQuery(() => ({
    queryKey: ['press-overview', props.slug],
    queryFn: () => api.pressOverview(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // A section the tenant could not answer lands here as 200 with the
    // section named in `degraded`, so nothing retries it and the panel
    // stays empty for the life of the tab. Keep asking until it fills.
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))

  const requests = () => model.data?.requests?.requests ?? []
  const assets = () => model.data?.assets?.assets ?? []
  const engagements = () => model.data?.engagements?.engagements ?? []
  const coverage = () => model.data?.coverage?.coverage ?? []
  // A section the tenant could not answer arrives as `null` + a name in
  // `degraded` — that is "not reported", never an empty list. whileIncomplete
  // keeps refetching; the copy below says what is actually happening.
  const degraded = (name: PressOverviewSection) => (model.data?.degraded ?? []).includes(name)
  const sectionFallback = (name: PressOverviewSection, icon: JSX.Element, label: string, hint: string) =>
    degraded(name)
      ? <EmptyState icon={<CloudOff />} label="Couldn't load this section" hint="The tenant did not report it — the console keeps asking and fills it in when it answers." />
      : <EmptyState icon={icon} label={label} hint={hint} />

  // The four sections as one list, so a request, the asset it asked for and
  // the coverage it earned read side by side instead of three tabs apart.
  const rows = createMemo<PressRow[]>(() => [
    ...requests().map((r): PressRow => ({
      id: `request:${r.id}`, section: 'requests',
      who: r.displayName, whoDetail: r.beaconKind,
      what: r.requestKind, whatDetail: r.details,
      event: r.eventTitle, status: r.status, at: r.createdAt, url: null, request: r,
    })),
    ...assets().map((a): PressRow => ({
      id: `asset:${a.id}`, section: 'assets',
      who: a.labelEn, whoDetail: a.labelPl && a.labelPl !== a.labelEn ? a.labelPl : null,
      what: a.assetKind, whatDetail: a.assetKey,
      event: a.eventTitle, status: a.active ? 'active' : 'inactive', at: a.updatedAt, url: a.url,
    })),
    ...engagements().map((e): PressRow => ({
      id: `engagement:${e.beaconId}:${e.eventId}`, section: 'engagements',
      who: e.displayName, whoDetail: e.beaconKind,
      what: e.helpKind ?? 'Engagement',
      whatDetail: `${e.notificationCount} notified · ${e.coverageCount} coverage`,
      event: e.eventTitle, status: e.status, at: e.updatedAt, url: null, engagement: e,
    })),
    ...coverage().map((c): PressRow => ({
      id: `coverage:${c.id}`, section: 'coverage',
      who: c.displayName, whoDetail: null,
      what: c.title ?? c.coverageKind, whatDetail: c.title ? c.coverageKind : null,
      event: c.eventTitle, status: null, at: c.createdAt, url: c.url,
    })),
  ])
  const visible = () => show() === 'all' ? rows() : rows().filter(r => r.section === show())
  const countOf = (id: PressOverviewSection) => rows().filter(r => r.section === id).length
  const missing = () => SECTIONS.filter(s => degraded(s.id))

  const recordReply = async (beaconId: string, eventId: string, disposition: string) => {
    setReplying(`${beaconId}:${eventId}`)
    setError(null)
    try {
      await api.recordBeaconReply(props.slug, beaconId, {
        eventId,
        disposition,
        occurredAt: new Date().toISOString(),
      })
      // A recorded reply changes the engagement and the coverage it rolls up into.
      refreshQueries(['press-overview', props.slug])
    } catch (err) {
      setError(failureLine("Couldn't save the reply", err))
    } finally {
      setReplying(null)
    }
  }

  const resolveRequest = async (requestId: string) => {
    setResolving(requestId)
    setError(null)
    try {
      await api.resolveBeaconPressRequest(props.slug, requestId, { status: 'resolved' })
      refreshQueries(['press-overview', props.slug])
    } catch (err) {
      setError(failureLine("Couldn't resolve the press request", err))
    } finally {
      setResolving(null)
    }
  }

  const saveAsset = async () => {
    const input = draft()
    setSaving(true)
    setError(null)
    try {
      await api.upsertBeaconPressAsset(props.slug, {
        assetKey: input.assetKey.trim(),
        assetKind: input.assetKind,
        labelEn: input.labelEn.trim(),
        // The backend requires both labels. Falling back to the English one
        // keeps a single-language operator from having to type it twice.
        labelPl: (input.labelPl.trim() || input.labelEn.trim()),
        url: input.url.trim(),
      })
      setDraft({ assetKey: '', assetKind: 'photo', labelEn: '', labelPl: '', url: '' })
      setAdding(false)
      refreshQueries(['press-overview', props.slug])
    } catch (err) {
      setError(failureLine("Couldn't save the press asset", err))
    } finally {
      setSaving(false)
    }
  }

  const columns: ColumnDef<PressRow, any>[] = [
    {
      id: 'section', header: 'Type', accessorFn: r => sectionName(r.section), meta: { class: 'whitespace-nowrap' },
      cell: c => <TypeBadge section={c.row.original.section} />,
    },
    {
      id: 'who', header: 'Who / what', accessorFn: r => r.who,
      cell: c => <>
        <span class="font-medium">{c.row.original.who}</span>
        <Show when={c.row.original.whoDetail}><br /><span class="text-muted-foreground">{c.row.original.whoDetail}</span></Show>
      </>,
    },
    {
      id: 'what', header: 'Detail', accessorFn: r => r.what,
      cell: c => <>
        {c.row.original.what}
        <Show when={c.row.original.whatDetail}><br /><span class="text-muted-foreground">{c.row.original.whatDetail}</span></Show>
      </>,
    },
    { id: 'event', header: 'Event', accessorFn: r => r.event ?? '', cell: c => c.row.original.event ?? '—' },
    {
      id: 'status', header: 'Status', accessorFn: r => r.status ?? '', meta: { class: 'whitespace-nowrap' },
      cell: c => <Show when={c.row.original.status} fallback="—">{status => <Badge variant={toneToVariant(statusTone(status()))}>{status()}</Badge>}</Show>,
    },
    { id: 'at', header: 'Date', accessorFn: r => r.at, meta: { class: 'whitespace-nowrap' }, cell: c => formatTimestamp(c.row.original.at) },
    {
      id: 'actions', header: () => <span class="sr-only">Actions</span>, enableSorting: false, enableHiding: false,
      meta: { class: 'w-12 text-right' },
      cell: c => {
        const r = c.row.original
        const req = r.request
        const e = r.engagement
        const url = r.url ? httpUrl(r.url) : null
        const canResolve = req && (req.status === 'pending' || req.status === 'open')
        const busy = () => (req && resolving() === req.id) || (e && replying() === `${e.beaconId}:${e.eventId}`)
        if (!canResolve && !e && !url) return null
        return (
          <DropdownMenu placement="bottom-end">
            <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="size-8" disabled={!!busy()}>
              <span class="sr-only">Open menu for {r.who}</span>
              <MoreHorizontal aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="min-w-44">
              <Show when={canResolve && req}>{request => (
                <DropdownMenuItem disabled={authState.readOnly()} title={authState.readOnly() ? READ_ONLY_REASON : undefined} onSelect={() => void resolveRequest(request().id)}>
                  Resolve request
                </DropdownMenuItem>
              )}</Show>
              {/* The write endpoint existed and nothing called it, so a beacon
                  who declined twice looked the same as one who had never been
                  asked. This row has both ids the reply needs, so it is where
                  the answer gets written down. */}
              <Show when={e}>{engagement => (
                <DropdownMenuGroup>
                  <DropdownMenuGroupLabel class="text-xs font-medium text-muted-foreground">Record reply</DropdownMenuGroupLabel>
                  <For each={REPLY_DISPOSITIONS}>{option => (
                    <DropdownMenuItem
                      disabled={authState.readOnly()}
                      title={authState.readOnly() ? READ_ONLY_REASON : undefined}
                      onSelect={() => void recordReply(engagement().beaconId, engagement().eventId, option.value)}
                    >
                      {option.label}
                    </DropdownMenuItem>
                  )}</For>
                </DropdownMenuGroup>
              )}</Show>
              <Show when={url}>{link => <>
                <Show when={canResolve || e}><DropdownMenuSeparator /></Show>
                <DropdownMenuItem onSelect={() => window.open(link(), '_blank', 'noopener,noreferrer')}>Open link</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(link())}>Copy link</DropdownMenuItem>
              </>}</Show>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return <div class="space-y-4">
    <div class="flex items-start justify-between gap-4">
      <p class="text-sm text-muted-foreground">Requests from amplifiers, assets for distribution, event engagements and earned coverage.</p>
      <Show when={model.dataUpdatedAt}><span class="shrink-0 text-xs text-muted-foreground">Updated {relativeTime(model.dataUpdatedAt)}</span></Show>
    </div>
    <Show when={error() && !adding()}>
      <ErrorCard>{error()}</ErrorCard>
    </Show>
    <Show when={model.error}><ErrorCard title="Couldn't load the press room" error={model.error} onRetry={() => void model.refetch()} /></Show>

    <FormDrawer
      open={adding()}
      onOpenChange={setAdding}
      title="Add press asset"
      description="Photos, logos, bios and EPKs for outreach. Instagram posts pick from the active photos and logos."
      submitLabel="Add asset"
      pendingLabel="Saving…"
      pending={saving()}
      error={error()}
      onSubmit={() => void saveAsset()}
    >
      <Field label="Key" hint="Lowercase letters, digits, - or _, starting with a letter.">
        <Input
          required pattern="[a-z][a-z0-9_\-]{1,63}" title="Lowercase letters, digits, - or _, starting with a letter."
          autocomplete="off" placeholder="band_photo_01"
          value={draft().assetKey}
          onInput={(e) => setDraft(d => ({ ...d, assetKey: e.currentTarget.value }))}
        />
      </Field>
      <Field label="Kind">
        <NativeSelect
          value={draft().assetKind}
          onChange={(e) => setDraft(d => ({ ...d, assetKind: e.currentTarget.value }))}
        >
          <option value="photo">Photo</option>
          <option value="logo">Logo</option>
          <option value="epk">EPK</option>
          <option value="bio">Bio</option>
          <option value="video">Video</option>
        </NativeSelect>
      </Field>
      <Field label="Label">
        <Input
          required autocomplete="off"
          value={draft().labelEn}
          onInput={(e) => setDraft(d => ({ ...d, labelEn: e.currentTarget.value }))}
        />
      </Field>
      <Field label="Label in Polish" note="optional" hint="Leave empty to reuse the English label.">
        <Input
          autocomplete="off"
          value={draft().labelPl}
          onInput={(e) => setDraft(d => ({ ...d, labelPl: e.currentTarget.value }))}
        />
      </Field>
      <Field label="URL" hint="Must be public — Meta fetches it.">
        <Input
          required type="url" pattern="https://.+" title="Use a public https:// link."
          placeholder="https://example.com/photo.jpg"
          value={draft().url}
          onInput={(e) => setDraft(d => ({ ...d, url: e.currentTarget.value }))}
        />
      </Field>
    </FormDrawer>

    <Show when={model.data} fallback={<SkeletonRows count={5} />}>
      <DataTable
        data={visible()}
        columns={columns}
        getRowId={r => r.id}
        initialSorting={[{ id: 'at', desc: true }]}
        searchText={r => [r.who, r.whoDetail, r.what, r.whatDetail, r.event, r.status, sectionName(r.section)].filter(Boolean).join(' ')}
        searchPlaceholder="Search by name, event or title"
        toolbar={
          <>
            <div role="group" aria-label="Show" class="flex flex-wrap items-center gap-1">
              <For each={[{ id: 'all' as const, label: 'All' }, ...SECTIONS]}>{chip => (
                <Button
                  variant={show() === chip.id ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-pressed={show() === chip.id}
                  onClick={() => setShow(chip.id)}
                >
                  {chip.label}
                  <span class="tabular-nums text-muted-foreground">
                    {chip.id === 'all' ? rows().length : degraded(chip.id) ? '—' : countOf(chip.id)}
                  </span>
                </Button>
              )}</For>
            </div>
          </>
        }
        actions={
          <Button writes size="sm" onClick={() => { setError(null); setAdding(true) }}>
            <Plus aria-hidden="true" /> Add asset
          </Button>
        }
        empty={
          show() === 'requests' ? sectionFallback('requests', <Newspaper />, 'No press requests', authState.isPlatformLevel() ? 'Press requests are outreach actions to media contacts. They appear here when the intelligence dispatches press pitches.' : 'Press requests are outreach to media contacts. They appear here when it sends press pitches.')
          : show() === 'assets' ? sectionFallback('assets', <Newspaper />, 'No press assets', 'Photos, logos, bios and EPKs for outreach. Instagram picks its image from the active photo and logo rows, so add at least one to publish there.')
          : show() === 'engagements' ? sectionFallback('engagements', <Newspaper />, 'No event engagements', 'Event engagements track press interactions for specific shows and releases.')
          : show() === 'coverage' ? sectionFallback('coverage', <Newspaper />, 'No earned media coverage', authState.isPlatformLevel() ? 'Earned media coverage tracks press mentions and reviews. They appear here once the intelligence detects coverage.' : 'Earned media coverage tracks press mentions and reviews. They appear here once it detects coverage.')
          : <EmptyState icon={<Newspaper />} label="Nothing in the press room yet" hint="Press requests, assets, event engagements and earned coverage all land here." />
        }
      />
      <Show when={show() === 'assets' || (show() === 'all' && countOf('assets') === 0 && !degraded('assets'))}>
        <p class="text-sm text-muted-foreground">
          Photos and logos here are what Instagram posts use, least recently published first.
          With none active, every Instagram post is held.
        </p>
      </Show>
      <Show when={show() === 'all' && missing().length > 0}>
        <p class="flex items-center gap-2 text-sm text-muted-foreground">
          <CloudOff class="size-4 shrink-0" aria-hidden="true" />
          {missing().map(m => m.label).join(', ')} didn't report — the console keeps asking and fills them in when the tenant answers.
        </p>
      </Show>
    </Show>
  </div>
}
