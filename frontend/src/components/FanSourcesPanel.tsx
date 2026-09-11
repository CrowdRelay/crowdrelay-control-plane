import { For, Show, createSignal, createMemo } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import type { FanbaseBlock } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { FanbaseIcon } from './ProviderIcon'
import { SkeletonRows } from './Skeleton'
import { SectionIcon } from './SectionIcon'
import { Spinner } from './Spinner'
import { Dialog } from './Dialog'
import { ErrorCard, Section } from './layout'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'
import { Textarea } from './ui/textarea'
import { NativeSelect } from './ui/native-select'
import { Field, FieldGrid } from './ui/field'

const SOURCE_KINDS = [
  { value: 'http_json_pull', label: 'HTTP JSON (pull)' },
  { value: 'csv_inline', label: 'CSV / inline batch' },
  { value: 'manual_import', label: 'Manual import' },
]

const SOURCE_LABEL: Record<string, string> = Object.fromEntries(
  SOURCE_KINDS.map(kind => [kind.value, kind.label]),
)

// ── Platform specs ──────────────────────────────────────────────────────
//
// Each of the thirteen platforms had its own `createSignal`, its own `Show`
// block, its own two-button footer and its own copy of the same form markup —
// about two hundred lines that differed only in a field name and a placeholder.
// A fourteenth platform meant writing all of it again, and the odds of the
// fourteenth matching the other thirteen were poor.
//
// The difference between them is data: what the provider needs in order to be
// identified. That is what lives here. The form, its validation, its pending
// state and its modal are written once below.

type ConnectField = {
  key: string
  label: string
  hint: string
  placeholder: string
  type?: 'password'
}

type PlatformSpec = {
  value: string
  label: string
  icon: string
  /** What the connection actually gives us, in the operator's terms. */
  provides: string
  /** Redirect-based providers have no form — the provider collects the grant. */
  authorizeUrl?: (slug: string) => string
  fields?: ConnectField[]
  connect?: (slug: string, values: Record<string, string>) => Promise<unknown>
}

const one = (key: string) => (fn: (slug: string, value: string) => Promise<unknown>) =>
  (slug: string, values: Record<string, string>) => fn(slug, (values[key] ?? '').trim())

const PLATFORMS: PlatformSpec[] = [
  {
    value: 'reddit', label: 'Reddit', icon: 'reddit', provides: 'Subreddit members and post engagement',
    fields: [{ key: 'subreddit', label: 'Subreddit name', hint: 'With or without the r/ prefix.', placeholder: 'Metal' }],
    connect: one('subreddit')(api.createRedditConnection),
  },
  {
    value: 'tiktok', label: 'TikTok', icon: 'tiktok', provides: 'Follower count and video engagement',
    authorizeUrl: slug => `https://signal-api.virya.music/v1/public/connections/tiktok/authorize?redirect=/tenants/${slug}/portfolio`,
  },
  {
    value: 'discord', label: 'Discord', icon: 'discord', provides: 'Server member count and presence',
    fields: [{ key: 'inviteCode', label: 'Discord invite code', hint: 'The part after discord.gg/ in your invite link.', placeholder: 'BBdDV6gVy' }],
    connect: one('inviteCode')(api.createDiscordConnection),
  },
  {
    value: 'telegram', label: 'Telegram', icon: 'telegram', provides: 'Channel subscriber count',
    fields: [
      { key: 'channel', label: 'Telegram channel', hint: 'The public channel username.', placeholder: '@virya_music' },
      { key: 'botToken', label: 'Bot token', hint: 'Issued by @BotFather. Stored encrypted; never shown again.', placeholder: '123456:ABC-DEF…', type: 'password' },
    ],
    connect: (slug, v) => api.createTelegramConnection(slug, (v.channel ?? '').trim(), (v.botToken ?? '').trim()),
  },
  {
    value: 'lastfm', label: 'Last.fm', icon: 'lastfm', provides: 'Scrobble counts and listener totals',
    fields: [{ key: 'artist', label: 'Last.fm artist name', hint: 'The canonical spelling as it appears on last.fm.', placeholder: 'Iron Maiden' }],
    connect: one('artist')(api.createLastfmConnection),
  },
  {
    value: 'deezer', label: 'Deezer', icon: 'deezer', provides: 'Fan count and track plays',
    fields: [{ key: 'artistId', label: 'Deezer artist ID', hint: 'The number at the end of the Deezer artist page URL.', placeholder: '13' }],
    connect: one('artistId')(api.createDeezerConnection),
  },
  {
    value: 'discogs', label: 'Discogs', icon: 'discogs', provides: 'Release catalogue and collectors',
    fields: [{ key: 'artistId', label: 'Discogs artist ID', hint: 'The number at the end of the Discogs artist page URL.', placeholder: '18839' }],
    connect: one('artistId')(api.createDiscogsConnection),
  },
  {
    value: 'bluesky', label: 'Bluesky', icon: 'bluesky', provides: 'Follower count and post engagement',
    fields: [{ key: 'handle', label: 'Bluesky handle', hint: 'The full handle including its domain.', placeholder: 'virya.bsky.social' }],
    connect: one('handle')(api.createBlueskyConnection),
  },
  {
    value: 'bandcamp', label: 'Bandcamp', icon: 'bandcamp', provides: 'Supporters and merch sales',
    fields: [{ key: 'subdomain', label: 'Bandcamp subdomain', hint: 'The part before .bandcamp.com.', placeholder: 'virya' }],
    connect: one('subdomain')(api.createBandcampConnection),
  },
  {
    value: 'youtube', label: 'YouTube', icon: 'youtube', provides: 'Subscribers and video views',
    fields: [{ key: 'channelId', label: 'YouTube channel ID', hint: 'Starts with UC…. Found in the channel URL, not the @handle.', placeholder: 'UCxxxxxxxxxxxxxxxxxxxxxx' }],
    connect: one('channelId')(api.createYoutubeConnection),
  },
  {
    value: 'facebook', label: 'Facebook', icon: 'facebook', provides: 'Page followers and post reach',
    fields: [{ key: 'pageId', label: 'Facebook Page ID', hint: 'The numeric Page ID from the page URL or the Graph API.', placeholder: '1234567890' }],
    connect: one('pageId')(api.createFacebookConnection),
  },
  {
    value: 'instagram', label: 'Instagram', icon: 'instagram', provides: 'Followers and post engagement',
    fields: [{ key: 'igUserId', label: 'Instagram Business account ID', hint: 'The numeric IG Business account ID from the Graph API. A personal account will not work.', placeholder: '178414xxxxxxxxxx' }],
    connect: one('igUserId')(api.createInstagramConnection),
  },
  {
    value: 'soundcloud', label: 'SoundCloud', icon: 'soundcloud', provides: 'Followers and track plays',
    fields: [{ key: 'permalink', label: 'SoundCloud permalink', hint: 'The artist\'s permalink — "virya", or the full profile URL.', placeholder: 'virya' }],
    connect: one('permalink')(api.createSoundcloudConnection),
  },
]

const EMPTY_INGEST = ''

const formatAge = (iso: string) => {
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return 'recently'
  const diff = Date.now() - ms
  if (diff < 0) return 'recently'
  const days = Math.floor(diff / 86_400_000)
  if (days < 1) return 'recently'
  return `${days}d ago`
}

const metric = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString()

const ingestionTone = (status: string | null): 'good' | 'warn' | 'bad' | 'muted' => {
  switch (status) {
    case 'completed': return 'good'
    case 'running': return 'warn'
    case 'failed': return 'bad'
    default: return 'muted'
  }
}

const formatVerification = (result: unknown): string | null => {
  const r = result as { verification?: string; displayName?: string; reason?: string } | null
  if (!r) return null
  if (r.verification === 'verified') return r.displayName ? `Verified: ${r.displayName}` : 'Verified'
  if (r.verification === 'invalid') return `Invalid: ${r.reason ?? 'identity not found'}`
  if (r.verification === 'unavailable') return `Probe unavailable: ${r.reason ?? 'could not verify'}`
  return null
}

export function FanSourcesPanel(props: {
  slug: string
  fanbases: FanbaseBlock[] | undefined
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const [creating, setCreating] = createSignal(false)
  const [name, setName] = createSignal('')
  const [sourceKind, setSourceKind] = createSignal('http_json_pull')
  const [fetchUrl, setFetchUrl] = createSignal('')
  const [attestedBy, setAttestedBy] = createSignal('')
  const [ingestingId, setIngestingId] = createSignal<string | null>(null)
  const [ingestJson, setIngestJson] = createSignal('')
  const [notice, setNotice] = createSignal<string | null>(null)
  const [errorText, setErrorText] = createSignal<string | null>(null)
  const [pendingFor, setPendingFor] = createSignal<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = createSignal<string | null>(null)

  // One connect dialog for all thirteen providers. `connecting` names the spec;
  // `values` holds whatever fields that spec declared.
  const [connecting, setConnecting] = createSignal<PlatformSpec | null>(null)
  const [values, setValues] = createSignal<Record<string, string>>({})
  const [verificationNotice, setVerificationNotice] = createSignal<string | null>(null)

  const needsAttestation = createMemo(() => sourceKind() !== 'http_json_pull')

  const refresh = () => props.onChanged()

  const create = useMutation(() => ({
    mutationFn: () =>
      api.createFanbase(props.slug, {
        name: name(),
        sourceKind: sourceKind(),
        fetchUrl: fetchUrl() || undefined,
        consentAttestedBy: attestedBy() || undefined,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      refresh()
      setCreating(false)
      resetForm()
      setErrorText(null)
      setNotice(`Fanbase created: ${result.fanbaseId.slice(0, 8)}…`)
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'Create failed'),
  }))

  const ingest = useMutation(() => ({
    mutationFn: async (input: { id: string; entries: { external_id: string; email?: string; display_name?: string; locale?: string }[] }) => {
      setPendingFor(input.id)
      setErrorText(null)
      return api.ingestFanbase(props.slug, input.id, input.entries)
    },
    onSuccess: async (counters) => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      refresh()
      setPendingFor(null)
      setIngestingId(null)
      setErrorText(null)
      setNotice(
        `Ingestion done — pending: ${counters.importedPending ?? 0}, active skipped: ${counters.alreadyActive ?? 0}, opt-outs: ${counters.skippedSuppressed ?? 0}, invalid: ${counters.invalid ?? 0}`,
      )
    },
    onError: (error) => {
      setPendingFor(null)
      setErrorText(error instanceof Error ? error.message : 'Ingestion failed')
    },
  }))

  const remove = useMutation(() => ({
    mutationFn: (id: string) => api.deleteFanbase(props.slug, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      refresh()
      setConfirmingDelete(null)
      setErrorText(null)
      setNotice('Fanbase deleted.')
    },
    onError: (error) => {
      setConfirmingDelete(null)
      setErrorText(error instanceof Error ? error.message : 'Delete failed')
    },
  }))

  // Track which fanbase is being deleted so the UI can show immediate
  // feedback (faded row + disabled controls) while the mutation is in flight.
  const isDeleting = (id: string) => remove.isPending && remove.variables === id

  const resetForm = () => {
    setName(''); setSourceKind('http_json_pull'); setFetchUrl(''); setAttestedBy('')
  }

  const parseEntries = (): { entries: Record<string, string>[] } | null => {
    try {
      const parsed = JSON.parse(ingestJson()) as { entries?: unknown }
      if (!parsed.entries || !Array.isArray(parsed.entries) || parsed.entries.length === 0) return null
      // Validate every entry is an object with a string external_id, then
      // build a typed array with only string-valued fields.
      const rawEntries = parsed.entries as unknown[]
      const typed: Record<string, string>[] = []
      for (const raw of rawEntries) {
        if (typeof raw !== 'object' || raw === null) return null
        const e = raw as Record<string, unknown>
        if (typeof e.external_id !== 'string') return null
        const entry: Record<string, string> = { external_id: e.external_id }
        for (const [k, v] of Object.entries(e)) {
          if (k === 'external_id') continue
          if (v == null) continue
          if (typeof v !== 'string') return null
          entry[k] = v
        }
        typed.push(entry)
      }
      return { entries: typed }
    } catch {
      return null
    }
  }

  const blocks = () => props.fanbases ?? []

  // --- Fanbase platform connections ---
  const connections = useQuery(() => ({
    queryKey: ['fan-sources-connections', props.slug],
    queryFn: async () => {
      const data = await api.fanbaseConnections(props.slug)
      return data.connections
    },
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const disconnectConnection = async (id: string) => {
    setErrorText(null)
    setNotice(null)
    try {
      await api.deleteFanbaseConnection(props.slug, id)
      connections.refetch()
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Disconnect failed')
    }
  }

  const connect = useMutation(() => ({
    mutationFn: async () => {
      const spec = connecting()
      if (!spec?.connect) throw new Error('This platform does not take credentials here.')
      return spec.connect(props.slug, values())
    },
    onSuccess: async (result) => {
      const label = connecting()?.label ?? 'Platform'
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      connections.refetch()
      setConnecting(null)
      setValues({})
      setErrorText(null)
      setVerificationNotice(formatVerification(result))
      setNotice(`${label} connection created.`)
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'Connection failed'),
  }))

  const openConnect = (spec: PlatformSpec) => {
    setValues({})
    setVerificationNotice(null)
    setErrorText(null)
    setConnecting(spec)
  }

  // Every declared field must carry a value before Connect is live. No spec
  // has an optional field, so "all present" is the whole rule.
  const connectReady = () => {
    const spec = connecting()
    if (!spec?.fields) return false
    return spec.fields.every(field => (values()[field.key] ?? '').trim().length > 0)
  }

  // `connected` alone is not health. A channel whose last sync failed shows
  // warn, so the badge stops contradicting the error printed beside it.
  const connTone = (status: string, syncFailing = false): 'good' | 'warn' | 'bad' | 'muted' =>
    status === 'connected' ? (syncFailing ? 'warn' : 'good') : status === 'expired' ? 'warn' : status === 'disconnected' || status === 'invalid' ? 'bad' : 'muted'

  const connectedCount = () => connections.data?.length ?? 0

  return <>
    <Section
      title="Platform connections"
      icon={<SectionIcon name="globe" />}
      description="Where this tenant's fans already are. Each connection syncs follower and engagement metrics on the growth schedule."
      action={<Show when={connectedCount() > 0}>
        <span class="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span class="inline-block h-2 w-2 rounded-full bg-success" />
          {connectedCount()} connected
        </span>
      </Show>}
    >
      <Show when={notice()}><div class="mb-3 rounded-lg border border-border bg-surface-1 p-4 text-sm text-foreground" role="status">{notice()}</div></Show>
      <Show when={verificationNotice()}><div class="mb-3 rounded-lg border border-border bg-surface-1 p-4 text-sm text-foreground" role="status">{verificationNotice()}</div></Show>
      <Show when={errorText()}><ErrorCard class="mb-3">{errorText()}</ErrorCard></Show>
      <Show when={connections.error}>
        <ErrorCard class="mb-3">Fan source connections unavailable: {errorMessage(connections.error, 'We couldn\'t reach the fan source service. Try refreshing — if it persists, the tenant runtime may be down.')}</ErrorCard>
      </Show>

      <Show when={connections.data} fallback={<Show when={connections.isPending}><SkeletonRows count={3} /></Show>}>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <For each={PLATFORMS}>{spec => {
            const conn = () => connections.data?.find(c => c.platform === spec.value)
            return (
              // The name, its description and the action all competed for one
              // horizontal line, so "SoundCloud" broke across two lines inside
              // its own tile. The name gets the top row; everything that
              // explains it goes underneath at full tile width.
              <div class="flex flex-col gap-2 border p-3.5" classList={{ 'border-success/30': !!conn(), 'border-border': !conn() }}>
                <div class="flex items-center gap-3">
                  <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-1">
                    <FanbaseIcon sourceKind={spec.icon as never} size={28} />
                  </div>
                  <span class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{spec.label}</span>
                  <Show when={conn()} fallback={
                    <Button
                      class="shrink-0"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (spec.authorizeUrl) window.location.href = spec.authorizeUrl(props.slug)
                        else openConnect(spec)
                      }}
                    >Connect</Button>
                  }>
                    <StatusBadge status={conn()!.status} tone={connTone(conn()!.status, !!conn()!.last_sync_error)} />
                  </Show>
                </div>
                {/* An unconnected tile said only its own name, which the icon
                    beside it already said. Saying what connecting would get you
                    is what makes the choice between thirteen tiles possible. */}
                <Show when={!conn()} fallback={
                  <Show when={conn()!.last_sync_at}>
                    <p class="m-0 text-xs text-muted-foreground">last sync {formatAge(conn()!.last_sync_at!)}</p>
                  </Show>
                }>
                  <p class="m-0 text-xs leading-relaxed text-muted-foreground">{spec.provides}</p>
                </Show>
                {/* A connected channel that never syncs is the failure mode
                    this panel could not show: five of them read `connected`
                    while producing no data at all. The provider's own message
                    goes here, because it names the fix — a wrong page id, a
                    missing API key — and the status badge never can. */}
                <Show when={conn() && conn()!.last_sync_error}>
                  <p class="m-0 break-words text-xs leading-relaxed text-destructive">
                    {conn()!.last_sync_at ? 'sync failing' : 'never synced'}
                    {conn()!.last_sync_failed_at ? ` (${formatAge(conn()!.last_sync_failed_at!)})` : ''}
                    : {conn()!.last_sync_error}
                  </p>
                </Show>
                <Show when={conn()}>
                  <div class="mt-auto pt-1">
                    <Button variant="destructive-ghost" size="sm" onClick={() => disconnectConnection(conn()!.id)}>Disconnect</Button>
                  </div>
                </Show>
              </div>
            )
          }}</For>

          {/* The fourteenth tile. A source that is not one of the thirteen
              providers — a lead-ads export, a pasted batch, a URL the label
              publishes — is still a place fans arrive from, and there was
              nowhere in this grid that said so. */}
          <button
            type="button"
            onClick={() => { setCreating(true); setNotice(null); setErrorText(null) }}
            class="flex flex-col gap-2 border border-dashed border-border bg-transparent p-3.5 text-left transition-colors hover:border-border-strong hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              </div>
              <span class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">Add another source</span>
            </div>
            <p class="m-0 text-xs leading-relaxed text-muted-foreground">A URL, a pasted batch, or an import you run by hand</p>
          </button>
        </div>
      </Show>
    </Section>

    <Section
      title="Fanbases"
      icon={<SectionIcon name="users" />}
      count={blocks().length}
      description="An audience block with a swappable acquisition origin. Every ingest lands candidates as pending double opt-in — active fans are never downgraded and opt-outs are never resurrected."
      action={<Button size="sm" onClick={() => { setCreating(true); setNotice(null) }}>New fanbase</Button>}
    >
      <Show when={blocks().length} fallback={
        <p class="text-sm leading-relaxed text-muted-foreground">
          <strong class="text-foreground">No fanbases yet.</strong>{' '}
          {connectedCount()
            ? 'Your platform connections are ready — create a fanbase to start ingesting candidates from them.'
            : 'Connect a platform above, or create a fanbase with a manual source to start collecting candidates.'}
        </p>
      }>
        <Table aria-label="Fanbases">
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Origin</TableHead><TableHead class="text-right">Members</TableHead><TableHead>Last ingestion</TableHead><TableHead>Ingest</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            <For each={blocks()}>{fb => (
              <TableRow classList={{ 'row-pending': isDeleting(fb.id) }}>
                <TableCell>{fb.name}{fb.enabled ? '' : ' (off)'}</TableCell>
                <TableCell><span class="inline-flex items-center gap-1.5"><FanbaseIcon sourceKind={fb.source_kind} size={16} class="flex-shrink-0 opacity-85" /> {SOURCE_LABEL[fb.source_kind] ?? fb.source_kind}</span></TableCell>
                <TableCell numeric>{metric(fb.members)}</TableCell>
                <TableCell>
                  <Show when={fb.last_status} fallback={<span class="text-muted-foreground">never</span>}>
                    <span class="flex items-center gap-2">
                      <StatusBadge status={fb.last_status ?? ''} tone={ingestionTone(fb.last_status)} />
                      <Show when={fb.last_imported_pending != null}>
                        <small class="text-muted-foreground">+{fb.last_imported_pending} pending</small>
                      </Show>
                    </span>
                  </Show>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" disabled={pendingFor() !== null}
                    onClick={() => { setIngestingId(fb.id); setIngestJson(EMPTY_INGEST) }}>
                    Ingest batch…
                  </Button>
                </TableCell>
                <TableCell>
                  <Show when={confirmingDelete() === fb.id} fallback={
                    <Button variant="destructive-ghost" size="sm" disabled={pendingFor() !== null || remove.isPending}
                      onClick={() => setConfirmingDelete(fb.id)}>
                      Delete
                    </Button>
                  }>
                    <div class="flex items-center gap-2">
                      <Button variant="destructive-ghost" size="sm" disabled={remove.isPending}
                        onClick={() => remove.mutate(fb.id)}>
                        {remove.isPending && <Spinner />} {remove.isPending ? 'Deleting…' : 'Confirm'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(null)}>Cancel</Button>
                    </div>
                  </Show>
                </TableCell>
              </TableRow>
            )}</For>
          </TableBody>
        </Table>
      </Show>
    </Section>

    {/* ── Connect a platform ── */}
    <Dialog
      open={connecting() !== null}
      onClose={() => setConnecting(null)}
      label="Connect platform"
      title={`Connect ${connecting()?.label ?? 'platform'}`}
      description={connecting()?.provides}
      footer={<>
        <Button variant="ghost" size="sm" onClick={() => setConnecting(null)}>Cancel</Button>
        <Button size="sm" disabled={!connectReady() || connect.isPending} onClick={() => connect.mutate()}>
          {connect.isPending && <Spinner />} {connect.isPending ? 'Connecting…' : `Connect ${connecting()?.label ?? ''}`}
        </Button>
      </>}
    >
      <Show when={connect.error}>
        <ErrorCard class="mb-4">{connect.error instanceof Error ? connect.error.message : 'Connection failed'}</ErrorCard>
      </Show>
      <div class="flex flex-col gap-4">
        <For each={connecting()?.fields ?? []}>{field => (
          <Field label={field.label} hint={field.hint}>
            <Input
              type={field.type ?? 'text'}
              autocomplete={field.type === 'password' ? 'new-password' : 'off'}
              value={values()[field.key] ?? ''}
              onInput={e => setValues(v => ({ ...v, [field.key]: e.currentTarget.value }))}
              placeholder={field.placeholder}
            />
          </Field>
        )}</For>
      </div>
    </Dialog>

    {/* ── Create a fanbase ── */}
    <Dialog
      open={creating()}
      onClose={() => setCreating(false)}
      label="New fanbase"
      title="New fanbase"
      description="A source is one place fans arrive from. The name is what every ingestion row, attribution report and audit entry refers back to."
      class="max-w-lg"
      footer={<>
        <Show when={!name() || (needsAttestation() && !attestedBy())}>
          <span class="mr-auto text-xs text-muted-foreground">
            {needsAttestation() && !attestedBy() ? 'A name and a consent attestation are required.' : 'A name is required.'}
          </span>
        </Show>
        <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
        <Button size="sm" disabled={!name() || (needsAttestation() && !attestedBy()) || create.isPending} onClick={() => create.mutate()}>
          {create.isPending && <Spinner />} {create.isPending ? 'Creating…' : 'Create fanbase'}
        </Button>
      </>}
    >
      <Show when={create.error}>
        <ErrorCard class="mb-4">{create.error instanceof Error ? create.error.message : 'Create failed'}</ErrorCard>
      </Show>
      <div class="flex flex-col gap-4">
        <Field label="Name" hint="Yours to choose. Include the platform and the campaign or city, so two similar feeds stay tellable apart later.">
          <Input value={name()} onInput={e => setName(e.currentTarget.value)} placeholder="e.g. Meta Lead Ads — Warsaw" />
        </Field>
        <Field label="Source kind" hint="How fans reach the graph: a URL you import from, a batch you paste in, or a platform this tenant is connected to.">
          <NativeSelect value={sourceKind()} onChange={e => setSourceKind(e.currentTarget.value)}>
            <For each={SOURCE_KINDS}>{k => <option value={k.value}>{k.label}</option>}</For>
          </NativeSelect>
        </Field>
        <Show when={sourceKind() === 'http_json_pull'}>
          <Field label="Fetch URL" hint="HTTPS endpoint returning the candidate list as JSON. The URL is stored for manual import; automatic sync is not yet wired.">
            <Input value={fetchUrl()} onInput={e => setFetchUrl(e.currentTarget.value)} placeholder="https://…/candidates.json" />
          </Field>
        </Show>
        <Show when={needsAttestation()}>
          <Field label="Consent attested by" hint="This kind carries personal data, so a named operator has to attest that the fans consented. The name is stored with every batch it ingests.">
            <Input value={attestedBy()} onInput={e => setAttestedBy(e.currentTarget.value)} placeholder="operator@label" />
          </Field>
        </Show>
      </div>
    </Dialog>

    {/* ── Ingest a batch ──
        This was a textarea inside a table cell, which made the row four times
        the height of its neighbours and put a JSON editor in a 200px column. */}
    <Dialog
      open={ingestingId() !== null}
      onClose={() => setIngestingId(null)}
      label="Ingest a batch"
      title="Ingest a batch"
      description={`Candidates land as pending double opt-in in ${blocks().find(b => b.id === ingestingId())?.name ?? 'this fanbase'}. Active fans are never downgraded and opt-outs are never resurrected.`}
      class="max-w-lg"
      footer={<>
        <Button variant="ghost" size="sm" onClick={() => setIngestingId(null)}>Cancel</Button>
        <Button size="sm" disabled={!parseEntries() || ingest.isPending}
          onClick={() => {
            const parsed = parseEntries()
            const id = ingestingId()
            if (parsed && id) ingest.mutate({ id, entries: parsed.entries as never })
          }}>
          {ingest.isPending && <Spinner />} {ingest.isPending ? 'Ingesting…' : 'Run ingestion'}
        </Button>
      </>}
    >
      <div class="flex flex-col gap-2.5">
        <Textarea rows="8" placeholder='{"entries":[{"external_id":"x1","email":"a@b.c"}]}'
          aria-label="Fan batch JSON"
          value={ingestJson()} onInput={e => setIngestJson(e.currentTarget.value)} />
        <Show when={ingestJson().trim().length > 0} fallback={
          <div class="rounded-md border border-border bg-surface-1 p-3">
            <pre class="overflow-x-auto text-xs text-secondary-foreground"><code>{'{"entries":[{"external_id":"fan-001","email":"a@b.c","display_name":"Alex","locale":"en"}]}'}</code></pre>
            <small class="mt-2 block text-xs text-muted-foreground">Each entry needs <code>external_id</code>. Optional: <code>email</code>, <code>display_name</code>, <code>locale</code>.</small>
          </div>
        }>
          <Show when={parseEntries()} fallback={<small class="text-xs text-destructive">Invalid JSON — check the format and try again.</small>}>
            <small class="text-xs text-success">Valid — {parseEntries()!.entries.length} entr{parseEntries()!.entries.length === 1 ? 'y' : 'ies'} ready</small>
          </Show>
        </Show>
      </div>
    </Dialog>
  </>
}
