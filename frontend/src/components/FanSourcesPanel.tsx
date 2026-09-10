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
import { ErrorCard } from './layout'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'
import { Textarea } from './ui/textarea'
import { NativeSelect } from './ui/native-select'

const SOURCE_KINDS = [
  { value: 'http_json_pull', label: 'HTTP JSON (pull)' },
  { value: 'csv_inline', label: 'CSV / inline batch' },
  { value: 'manual_import', label: 'Manual import' },
]

const SOURCE_LABEL: Record<string, string> = Object.fromEntries(
  SOURCE_KINDS.map(kind => [kind.value, kind.label]),
)

const OAUTH_PLATFORMS = [
  { value: 'reddit', label: 'Reddit', icon: 'reddit' },
  { value: 'tiktok', label: 'TikTok', icon: 'tiktok' },
  { value: 'discord', label: 'Discord', icon: 'discord' },
  { value: 'telegram', label: 'Telegram', icon: 'telegram' },
  { value: 'lastfm', label: 'Last.fm', icon: 'lastfm' },
  { value: 'deezer', label: 'Deezer', icon: 'deezer' },
  { value: 'discogs', label: 'Discogs', icon: 'discogs' },
  { value: 'bluesky', label: 'Bluesky', icon: 'bluesky' },
  { value: 'bandcamp', label: 'Bandcamp', icon: 'bandcamp' },
  { value: 'youtube', label: 'YouTube', icon: 'youtube' },
  { value: 'facebook', label: 'Facebook', icon: 'facebook' },
  { value: 'instagram', label: 'Instagram', icon: 'instagram' },
  { value: 'soundcloud', label: 'SoundCloud', icon: 'soundcloud' },
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

  // Simple-credential connection form state (Discord/Telegram/Last.fm/Deezer/Discogs/Bluesky)
  const [connectingPlatform, setConnectingPlatform] = createSignal<string | null>(null)
  const [discordInviteCode, setDiscordInviteCode] = createSignal('')
  const [telegramChannel, setTelegramChannel] = createSignal('')
  const [telegramBotToken, setTelegramBotToken] = createSignal('')
  const [lastfmArtist, setLastfmArtist] = createSignal('')
  const [deezerArtistId, setDeezerArtistId] = createSignal('')
  const [discogsArtistId, setDiscogsArtistId] = createSignal('')
  const [blueskyHandle, setBlueskyHandle] = createSignal('')
  const [bandcampSubdomain, setBandcampSubdomain] = createSignal('')
  const [youtubeChannelId, setYoutubeChannelId] = createSignal('')
  const [facebookPageId, setFacebookPageId] = createSignal('')
  const [instagramIgUserId, setInstagramIgUserId] = createSignal('')
  const [soundcloudPermalink, setSoundcloudPermalink] = createSignal('')
  const [redditSubreddit, setRedditSubreddit] = createSignal('')
  // Verification result from the provider probe (creation-time diagnostic only).
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

  // --- Fanbase OAuth connections ---
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

  const connectDiscord = useMutation(() => ({
    mutationFn: () => api.createDiscordConnection(props.slug, discordInviteCode().trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      connections.refetch()
      setConnectingPlatform(null)
      setDiscordInviteCode('')
      setErrorText(null)
      setNotice('Discord connection created.')
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'Discord connection failed'),
  }))

  const connectTelegram = useMutation(() => ({
    mutationFn: () => api.createTelegramConnection(props.slug, telegramChannel().trim(), telegramBotToken().trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      connections.refetch()
      setConnectingPlatform(null)
      setTelegramChannel('')
      setTelegramBotToken('')
      setErrorText(null)
      setNotice('Telegram connection created.')
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'Telegram connection failed'),
  }))

  const connectLastfm = useMutation(() => ({
    mutationFn: () => api.createLastfmConnection(props.slug, lastfmArtist().trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      connections.refetch()
      setConnectingPlatform(null)
      setLastfmArtist('')
      setErrorText(null)
      setNotice('Last.fm connection created.')
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'Last.fm connection failed'),
  }))

  const connectDeezer = useMutation(() => ({
    mutationFn: () => api.createDeezerConnection(props.slug, deezerArtistId().trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      connections.refetch()
      setConnectingPlatform(null)
      setDeezerArtistId('')
      setErrorText(null)
      setNotice('Deezer connection created.')
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'Deezer connection failed'),
  }))

  const connectDiscogs = useMutation(() => ({
    mutationFn: () => api.createDiscogsConnection(props.slug, discogsArtistId().trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      connections.refetch()
      setConnectingPlatform(null)
      setDiscogsArtistId('')
      setErrorText(null)
      setNotice('Discogs connection created.')
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'Discogs connection failed'),
  }))

  const connectBluesky = useMutation(() => ({
    mutationFn: () => api.createBlueskyConnection(props.slug, blueskyHandle().trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      connections.refetch()
      setConnectingPlatform(null)
      setBlueskyHandle('')
      setErrorText(null)
      setNotice('Bluesky connection created.')
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'Bluesky connection failed'),
  }))

  const connectBandcamp = useMutation(() => ({
    mutationFn: () => api.createBandcampConnection(props.slug, bandcampSubdomain().trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      connections.refetch()
      setConnectingPlatform(null)
      setBandcampSubdomain('')
      setErrorText(null)
      setNotice('Bandcamp connection created.')
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'Bandcamp connection failed'),
  }))

  const connectYoutube = useMutation(() => ({
    mutationFn: () => api.createYoutubeConnection(props.slug, youtubeChannelId().trim()),
    onSuccess: async (result: { verification?: string; displayName?: string; reason?: string; status?: string }) => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      connections.refetch()
      setConnectingPlatform(null)
      setYoutubeChannelId('')
      setErrorText(null)
      setVerificationNotice(formatVerification(result))
      setNotice('YouTube connection created.')
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'YouTube connection failed'),
  }))

  const connectFacebook = useMutation(() => ({
    mutationFn: () => api.createFacebookConnection(props.slug, facebookPageId().trim()),
    onSuccess: async (result: { verification?: string; displayName?: string; reason?: string; status?: string }) => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      connections.refetch()
      setConnectingPlatform(null)
      setFacebookPageId('')
      setErrorText(null)
      setVerificationNotice(formatVerification(result))
      setNotice('Facebook connection created.')
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'Facebook connection failed'),
  }))

  const connectInstagram = useMutation(() => ({
    mutationFn: () => api.createInstagramConnection(props.slug, instagramIgUserId().trim()),
    onSuccess: async (result: { verification?: string; displayName?: string; reason?: string; status?: string }) => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      connections.refetch()
      setConnectingPlatform(null)
      setInstagramIgUserId('')
      setErrorText(null)
      setVerificationNotice(formatVerification(result))
      setNotice('Instagram connection created.')
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'Instagram connection failed'),
  }))

  const connectSoundcloud = useMutation(() => ({
    mutationFn: () => api.createSoundcloudConnection(props.slug, soundcloudPermalink().trim()),
    onSuccess: async (result: { verification?: string; displayName?: string; reason?: string; status?: string }) => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      connections.refetch()
      setConnectingPlatform(null)
      setSoundcloudPermalink('')
      setErrorText(null)
      setVerificationNotice(formatVerification(result))
      setNotice('SoundCloud connection created.')
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'SoundCloud connection failed'),
  }))

  const connectReddit = useMutation(() => ({
    mutationFn: () => api.createRedditConnection(props.slug, redditSubreddit().trim()),
    onSuccess: async (result: { verification?: string; displayName?: string; reason?: string; status?: string }) => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      connections.refetch()
      setConnectingPlatform(null)
      setRedditSubreddit('')
      setErrorText(null)
      setVerificationNotice(formatVerification(result))
      setNotice('Reddit connection created.')
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'Reddit connection failed'),
  }))

  // `connected` alone is not health. A channel whose last sync failed shows
  // warn, so the badge stops contradicting the error printed beside it.
  const connTone = (status: string, syncFailing = false): 'good' | 'warn' | 'bad' | 'muted' =>
    status === 'connected' ? (syncFailing ? 'warn' : 'good') : status === 'expired' ? 'warn' : status === 'disconnected' || status === 'invalid' ? 'bad' : 'muted'

  const formatVerification = (result: { verification?: string; displayName?: string; reason?: string; status?: string }): string | null => {
    const v = result.verification
    if (v === 'verified') return result.displayName ? `Verified: ${result.displayName}` : 'Verified'
    if (v === 'invalid') return `Invalid: ${result.reason ?? 'identity not found'}`
    if (v === 'unavailable') return `Probe unavailable: ${result.reason ?? 'could not verify'}`
    return null
  }

  return <Card class="p-5">
    <div class="flex items-start justify-between gap-4 mt-6 mb-3">
      <div><h2 class="text-lg font-bold text-foreground flex items-center gap-2"><SectionIcon name="globe" />Fanbases</h2><p class="mt-1 text-sm text-muted-foreground leading-relaxed">First-class audience blocks with a swappable acquisition origin. Every ingest lands candidates as pending double opt-in — active fans are never downgraded and opt-outs are never resurrected.</p></div>
      <div class="flex items-center gap-2 flex-wrap">
        <Show when={!creating}>
          <Button size="sm" onClick={() => { setCreating(true); setNotice(null) }}>+ New fanbase</Button>
        </Show>
        <StatusBadge status={blocks().length > 0 ? `${blocks().length} blocks` : 'none yet'} tone={blocks().length > 0 ? 'good' : 'muted'} />
      </div>
    </div>

    <Show when={notice()}><div class="rounded-lg border border-border bg-surface-1 p-4 text-sm text-foreground" role="status">{notice()}</div></Show>
    <Show when={errorText()}>
      <ErrorCard>{errorText()}</ErrorCard>
    </Show>

    {/* Platform connections used to be a Card inside the Fanbases Card inside
        the page Card, with a fourth Card per connection. Four nested borders
        over one unchanging fill carry no depth information — they only add
        edges to count. This is a titled section with a rule above it. */}
    <section class="mt-6 border-t border-border pt-4">
      <div class="flex items-center justify-between gap-4">
        <h3>Platform connections</h3>
        <Show when={connections.data && connections.data!.length > 0}>
          <span class="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span class="w-2 h-2 rounded-full bg-success inline-block" />
            {connections.data!.length} connected
          </span>
        </Show>
      </div>
      <p class="text-sm text-muted-foreground leading-relaxed mt-1">Connected audience and music platforms. Each connection syncs follower and engagement metrics on the growth schedule. Disconnect to revoke access.</p>
      <Show when={connections.error}><ErrorCard>Fan source connections unavailable: {errorMessage(connections.error, 'We couldn\'t reach the fan source service. Try refreshing — if it persists, the tenant runtime may be down.')}</ErrorCard></Show>
      <Show when={connections.data} fallback={<Show when={connections.isPending}><SkeletonRows count={3} /></Show>}>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <For each={OAUTH_PLATFORMS}>{(plat) => {
          const conn = () => connections.data?.find(c => c.platform === plat.value)
          return (
            <div class="fanbase-connection-card" classList={{ connected: !!conn() }}>
              <div class="w-9 h-9 flex items-center justify-center rounded-md border border-border bg-surface-1">
                <FanbaseIcon sourceKind={plat.icon as never} size={28} />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold break-words [overflow-wrap:anywhere]">{plat.label}</div>
                <Show when={conn() && conn()!.last_sync_at}>
                  <div class="text-sm text-muted-foreground mt-1 break-words">
                    <span class="text-muted-foreground">last sync {formatAge(conn()!.last_sync_at!)}</span>
                  </div>
                </Show>
                {/* A connected channel that never syncs is the failure mode
                    this panel could not show: five of them read `connected`
                    while producing no data at all. The provider's own message
                    goes here, because it names the fix — a wrong page id, a
                    missing API key — and the status badge never can. */}
                <Show when={conn() && conn()!.last_sync_error}>
                  <div class="text-sm text-muted-foreground mt-1 break-words">
                    <span class="text-destructive">
                      {conn()!.last_sync_at ? 'sync failing' : 'never synced'}
                      {conn()!.last_sync_failed_at ? ` (${formatAge(conn()!.last_sync_failed_at!)})` : ''}
                      : {conn()!.last_sync_error}
                    </span>
                  </div>
                </Show>
              </div>
              <div class="flex gap-2 items-center flex-shrink-0 whitespace-nowrap">
                <Show when={conn()}>
                  <StatusBadge status={conn()!.status} tone={connTone(conn()!.status, !!conn()!.last_sync_error)} />
                  <Button variant="destructive-ghost" size="sm" onClick={() => disconnectConnection(conn()!.id)}>Disconnect</Button>
                </Show>
                <Show when={!conn() && plat.value === 'tiktok'}>
                  <Button variant="outline" size="sm" onClick={() => {
                    window.location.href = `https://signal-api.virya.music/v1/public/connections/tiktok/authorize?redirect=/tenants/${props.slug}/portfolio`
                  }}>Connect</Button>
                </Show>
                <Show when={!conn() && plat.value === 'discord'}>
                  <Button variant="outline" size="sm" onClick={() => setConnectingPlatform('discord')}>Connect</Button>
                </Show>
                <Show when={!conn() && plat.value === 'telegram'}>
                  <Button variant="outline" size="sm" onClick={() => setConnectingPlatform('telegram')}>Connect</Button>
                </Show>
                <Show when={!conn() && plat.value === 'lastfm'}>
                  <Button variant="outline" size="sm" onClick={() => setConnectingPlatform('lastfm')}>Connect</Button>
                </Show>
                <Show when={!conn() && plat.value === 'deezer'}>
                  <Button variant="outline" size="sm" onClick={() => setConnectingPlatform('deezer')}>Connect</Button>
                </Show>
                <Show when={!conn() && plat.value === 'discogs'}>
                  <Button variant="outline" size="sm" onClick={() => setConnectingPlatform('discogs')}>Connect</Button>
                </Show>
                <Show when={!conn() && plat.value === 'bluesky'}>
                  <Button variant="outline" size="sm" onClick={() => setConnectingPlatform('bluesky')}>Connect</Button>
                </Show>
                <Show when={!conn() && plat.value === 'bandcamp'}>
                  <Button variant="outline" size="sm" onClick={() => setConnectingPlatform('bandcamp')}>Connect</Button>
                </Show>
                <Show when={!conn() && plat.value === 'youtube'}>
                  <Button variant="outline" size="sm" onClick={() => { setConnectingPlatform('youtube'); setVerificationNotice(null) }}>Connect</Button>
                </Show>
                <Show when={!conn() && plat.value === 'facebook'}>
                  <Button variant="outline" size="sm" onClick={() => { setConnectingPlatform('facebook'); setVerificationNotice(null) }}>Connect</Button>
                </Show>
                <Show when={!conn() && plat.value === 'instagram'}>
                  <Button variant="outline" size="sm" onClick={() => { setConnectingPlatform('instagram'); setVerificationNotice(null) }}>Connect</Button>
                </Show>
                <Show when={!conn() && plat.value === 'soundcloud'}>
                  <Button variant="outline" size="sm" onClick={() => { setConnectingPlatform('soundcloud'); setVerificationNotice(null) }}>Connect</Button>
                </Show>
                <Show when={!conn() && plat.value === 'reddit'}>
                  <Button variant="outline" size="sm" onClick={() => { setConnectingPlatform('reddit'); setVerificationNotice(null) }}>Connect</Button>
                </Show>
              </div>
            </div>
          )
        }}</For>
      </div>
      {/* Discord connection form */}
      <Show when={connectingPlatform() === 'discord'}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3">
          <label>Discord invite code<small>From discord.gg/ link (e.g. BBdDV6gVy)</small><Input value={discordInviteCode()} onInput={e => setDiscordInviteCode(e.currentTarget.value)} placeholder="BBdDV6gVy" /></label>
        </div>
        <div class="flex justify-end gap-2">
          <Button size="sm" disabled={!discordInviteCode().trim() || connectDiscord.isPending} onClick={() => connectDiscord.mutate()}>{connectDiscord.isPending && <Spinner />}{connectDiscord.isPending ? 'Connecting…' : 'Connect Discord'}</Button>
          <Button variant="ghost" size="sm" onClick={() => setConnectingPlatform(null)}>Cancel</Button>
        </div>
      </Show>
      {/* Telegram connection form */}
      <Show when={connectingPlatform() === 'telegram'}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3">
          <label>Telegram channel<small>Public channel username</small><Input value={telegramChannel()} onInput={e => setTelegramChannel(e.currentTarget.value)} placeholder="@virya_music" /></label>
          <label>Bot token<small>From @BotFather</small><Input type="password" value={telegramBotToken()} onInput={e => setTelegramBotToken(e.currentTarget.value)} placeholder="123456:ABC-DEF…" /></label>
        </div>
        <div class="flex justify-end gap-2">
          <Button size="sm" disabled={!telegramChannel().trim() || !telegramBotToken().trim() || connectTelegram.isPending} onClick={() => connectTelegram.mutate()}>{connectTelegram.isPending && <Spinner />}{connectTelegram.isPending ? 'Connecting…' : 'Connect Telegram'}</Button>
          <Button variant="ghost" size="sm" onClick={() => setConnectingPlatform(null)}>Cancel</Button>
        </div>
      </Show>
      {/* Last.fm connection form */}
      <Show when={connectingPlatform() === 'lastfm'}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3">
          <label>Last.fm artist name<small>Canonical spelling as on last.fm</small><Input value={lastfmArtist()} onInput={e => setLastfmArtist(e.currentTarget.value)} placeholder="Iron Maiden" /></label>
        </div>
        <div class="flex justify-end gap-2">
          <Button size="sm" disabled={!lastfmArtist().trim() || connectLastfm.isPending} onClick={() => connectLastfm.mutate()}>{connectLastfm.isPending && <Spinner />}{connectLastfm.isPending ? 'Connecting…' : 'Connect Last.fm'}</Button>
          <Button variant="ghost" size="sm" onClick={() => setConnectingPlatform(null)}>Cancel</Button>
        </div>
      </Show>
      {/* Deezer connection form */}
      <Show when={connectingPlatform() === 'deezer'}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3">
          <label>Deezer artist ID<small>Numeric ID from the Deezer artist page URL</small><Input value={deezerArtistId()} onInput={e => setDeezerArtistId(e.currentTarget.value)} placeholder="13" /></label>
        </div>
        <div class="flex justify-end gap-2">
          <Button size="sm" disabled={!deezerArtistId().trim() || connectDeezer.isPending} onClick={() => connectDeezer.mutate()}>{connectDeezer.isPending && <Spinner />}{connectDeezer.isPending ? 'Connecting…' : 'Connect Deezer'}</Button>
          <Button variant="ghost" size="sm" onClick={() => setConnectingPlatform(null)}>Cancel</Button>
        </div>
      </Show>
      {/* Discogs connection form */}
      <Show when={connectingPlatform() === 'discogs'}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3">
          <label>Discogs artist ID<small>Numeric ID from the Discogs artist page URL</small><Input value={discogsArtistId()} onInput={e => setDiscogsArtistId(e.currentTarget.value)} placeholder="18839" /></label>
        </div>
        <div class="flex justify-end gap-2">
          <Button size="sm" disabled={!discogsArtistId().trim() || connectDiscogs.isPending} onClick={() => connectDiscogs.mutate()}>{connectDiscogs.isPending && <Spinner />}{connectDiscogs.isPending ? 'Connecting…' : 'Connect Discogs'}</Button>
          <Button variant="ghost" size="sm" onClick={() => setConnectingPlatform(null)}>Cancel</Button>
        </div>
      </Show>
      {/* Bluesky connection form */}
      <Show when={connectingPlatform() === 'bluesky'}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3">
          <label>Bluesky handle<small>Full handle including domain</small><Input value={blueskyHandle()} onInput={e => setBlueskyHandle(e.currentTarget.value)} placeholder="virya.bsky.social" /></label>
        </div>
        <div class="flex justify-end gap-2">
          <Button size="sm" disabled={!blueskyHandle().trim() || connectBluesky.isPending} onClick={() => connectBluesky.mutate()}>{connectBluesky.isPending && <Spinner />}{connectBluesky.isPending ? 'Connecting…' : 'Connect Bluesky'}</Button>
          <Button variant="ghost" size="sm" onClick={() => setConnectingPlatform(null)}>Cancel</Button>
        </div>
      </Show>
      {/* Bandcamp connection form */}
      <Show when={connectingPlatform() === 'bandcamp'}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3">
          <label>Bandcamp subdomain<small>The part before .bandcamp.com</small><Input value={bandcampSubdomain()} onInput={e => setBandcampSubdomain(e.currentTarget.value)} placeholder="virya" /></label>
        </div>
        <div class="flex justify-end gap-2">
          <Button size="sm" disabled={!bandcampSubdomain().trim() || connectBandcamp.isPending} onClick={() => connectBandcamp.mutate()}>{connectBandcamp.isPending && <Spinner />}{connectBandcamp.isPending ? 'Connecting…' : 'Connect Bandcamp'}</Button>
          <Button variant="ghost" size="sm" onClick={() => setConnectingPlatform(null)}>Cancel</Button>
        </div>
      </Show>
      {/* YouTube connection form */}
      <Show when={connectingPlatform() === 'youtube'}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3">
          <label>YouTube channel ID<small>Starts with UC… (from the channel URL or API)</small><Input value={youtubeChannelId()} onInput={e => setYoutubeChannelId(e.currentTarget.value)} placeholder="UCxxxxxxxxxxxxxxxxxxxxxx" /></label>
        </div>
        <div class="flex justify-end gap-2">
          <Button size="sm" disabled={!youtubeChannelId().trim() || connectYoutube.isPending} onClick={() => connectYoutube.mutate()}>{connectYoutube.isPending && <Spinner />}{connectYoutube.isPending ? 'Connecting…' : 'Connect YouTube'}</Button>
          <Button variant="ghost" size="sm" onClick={() => { setConnectingPlatform(null); setVerificationNotice(null) }}>Cancel</Button>
        </div>
        <Show when={verificationNotice()}><div class="rounded-lg border border-border bg-surface-1 p-4 text-sm text-foreground" role="status">{verificationNotice()}</div></Show>
      </Show>
      {/* Facebook connection form */}
      <Show when={connectingPlatform() === 'facebook'}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3">
          <label>Facebook Page ID<small>Numeric Page ID (from the page URL or Graph API)</small><Input value={facebookPageId()} onInput={e => setFacebookPageId(e.currentTarget.value)} placeholder="1234567890" /></label>
        </div>
        <div class="flex justify-end gap-2">
          <Button size="sm" disabled={!facebookPageId().trim() || connectFacebook.isPending} onClick={() => connectFacebook.mutate()}>{connectFacebook.isPending && <Spinner />}{connectFacebook.isPending ? 'Connecting…' : 'Connect Facebook'}</Button>
          <Button variant="ghost" size="sm" onClick={() => { setConnectingPlatform(null); setVerificationNotice(null) }}>Cancel</Button>
        </div>
        <Show when={verificationNotice()}><div class="rounded-lg border border-border bg-surface-1 p-4 text-sm text-foreground" role="status">{verificationNotice()}</div></Show>
      </Show>
      {/* Instagram connection form */}
      <Show when={connectingPlatform() === 'instagram'}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3">
          <label>Instagram Business account ID<small>Numeric IG Business account ID (from Graph API)</small><Input value={instagramIgUserId()} onInput={e => setInstagramIgUserId(e.currentTarget.value)} placeholder="178414xxxxxxxxxx" /></label>
        </div>
        <div class="flex justify-end gap-2">
          <Button size="sm" disabled={!instagramIgUserId().trim() || connectInstagram.isPending} onClick={() => connectInstagram.mutate()}>{connectInstagram.isPending && <Spinner />}{connectInstagram.isPending ? 'Connecting…' : 'Connect Instagram'}</Button>
          <Button variant="ghost" size="sm" onClick={() => { setConnectingPlatform(null); setVerificationNotice(null) }}>Cancel</Button>
        </div>
        <Show when={verificationNotice()}><div class="rounded-lg border border-border bg-surface-1 p-4 text-sm text-foreground" role="status">{verificationNotice()}</div></Show>
      </Show>
      {/* SoundCloud connection form */}
      <Show when={connectingPlatform() === 'soundcloud'}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3">
          <label>SoundCloud permalink<small>The artist's permalink (e.g. "virya" or full URL)</small><Input value={soundcloudPermalink()} onInput={e => setSoundcloudPermalink(e.currentTarget.value)} placeholder="virya" /></label>
        </div>
        <div class="flex justify-end gap-2">
          <Button size="sm" disabled={!soundcloudPermalink().trim() || connectSoundcloud.isPending} onClick={() => connectSoundcloud.mutate()}>{connectSoundcloud.isPending && <Spinner />}{connectSoundcloud.isPending ? 'Connecting…' : 'Connect SoundCloud'}</Button>
          <Button variant="ghost" size="sm" onClick={() => { setConnectingPlatform(null); setVerificationNotice(null) }}>Cancel</Button>
        </div>
        <Show when={verificationNotice()}><div class="rounded-lg border border-border bg-surface-1 p-4 text-sm text-foreground" role="status">{verificationNotice()}</div></Show>
      </Show>
      {/* Reddit connection form */}
      <Show when={connectingPlatform() === 'reddit'}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3">
          <label>Subreddit name<small>The subreddit name (e.g. "Metal", "r/Metal")</small><Input value={redditSubreddit()} onInput={e => setRedditSubreddit(e.currentTarget.value)} placeholder="Metal" /></label>
        </div>
        <div class="flex justify-end gap-2">
          <Button size="sm" disabled={!redditSubreddit().trim() || connectReddit.isPending} onClick={() => connectReddit.mutate()}>{connectReddit.isPending && <Spinner />}{connectReddit.isPending ? 'Connecting…' : 'Connect Reddit'}</Button>
          <Button variant="ghost" size="sm" onClick={() => { setConnectingPlatform(null); setVerificationNotice(null) }}>Cancel</Button>
        </div>
        <Show when={verificationNotice()}><div class="rounded-lg border border-border bg-surface-1 p-4 text-sm text-foreground" role="status">{verificationNotice()}</div></Show>
      </Show>
      </Show>
    </section>

    <Show when={creating}>
      <p class="text-sm text-muted-foreground leading-relaxed mt-5">A source is one place fans arrive from. Naming it well matters — the name is what every ingestion row, attribution report and audit entry refers back to.</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <label>
          <span>Name</span>
          <Input value={name()} onInput={e => setName(e.currentTarget.value)} placeholder="e.g. Meta Lead Ads — Warsaw" />
          <small>Yours to choose. Include the platform and the campaign or city, so two similar feeds stay tellable apart later.</small>
        </label>
        <label>
          <span>Source kind</span>
          <NativeSelect value={sourceKind()} onChange={e => setSourceKind(e.currentTarget.value)}>
            <For each={SOURCE_KINDS}>{k => <option value={k.value}>{k.label}</option>}</For>
          </NativeSelect>
          <small>How fans reach the graph: a URL you import from, a batch you paste in, or a platform this tenant is connected to.</small>
        </label>
        <Show when={sourceKind() === 'http_json_pull'}>
          <label>
            <span>Fetch URL</span>
            <Input value={fetchUrl()} onInput={e => setFetchUrl(e.currentTarget.value)} placeholder="https://…/candidates.json" />
            <small>HTTPS endpoint returning the candidate list as JSON. The URL is stored for manual import; automatic polling is not yet wired.</small>
          </label>
        </Show>
        <Show when={needsAttestation()}>
          <label>
            <span>Consent attested by</span>
            <Input value={attestedBy()} onInput={e => setAttestedBy(e.currentTarget.value)} placeholder="operator@label" />
            <small>This kind carries personal data, so a named operator has to attest that the fans consented. The name is stored with every batch it ingests.</small>
          </label>
        </Show>
      </div>
      <div class="flex justify-end gap-2">
        <Button size="sm" disabled={!name() || (needsAttestation() && !attestedBy())}
          onClick={() => create.mutate()}>Create</Button>
        <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
      </div>
      <Show when={!name() || (needsAttestation() && !attestedBy())}>
        <small class="text-muted-foreground block mt-1.5 mb-4 text-sm">
          {needsAttestation() && !attestedBy()
            ? 'Enter a name and consent attestation to enable Create.'
            : 'Enter a name to enable Create.'}
        </small>
      </Show>
    </Show>

    <Show when={blocks().length}>
      <Table aria-label="Fanbases">
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Origin</TableHead><TableHead>Members</TableHead><TableHead>Last ingestion</TableHead><TableHead>Ingest</TableHead><TableHead></TableHead></TableRow></TableHeader>
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
                      <small>+{fb.last_imported_pending} pending</small>
                    </Show>
                  </span>
                </Show>
              </TableCell>
              <TableCell>
                <Show when={ingestingId() === fb.id} fallback={
                  <Button size="sm" variant="outline" disabled={pendingFor() !== null}
                    onClick={() => { setIngestingId(fb.id); setIngestJson(EMPTY_INGEST) }}>
                    Ingest batch…
                  </Button>
                }>
                  <div class="flex flex-col gap-2.5 max-w-[420px]">
                    <Textarea rows="4" placeholder='{"entries":[{"external_id":"x1","email":"a@b.c"}]}'
                      aria-label="Fan batch JSON"
                      value={ingestJson()} onInput={e => setIngestJson(e.currentTarget.value)} />
                    <div class="flex flex-col gap-1">
                      <Show when={ingestJson().trim().length > 0} fallback={
                        <details class="ingest-format-help">
                          <summary>Format help</summary>
                          <pre><code>{'{"entries":[{"external_id":"fan-001","email":"a@b.c","display_name":"Alex","locale":"en"}]}'}</code></pre>
                          <small>Each entry needs <code>external_id</code> (required). Optional: <code>email</code>, <code>display_name</code>, <code>locale</code>.</small>
                        </details>
                      }>
                        <Show when={parseEntries()} fallback={<small class="text-destructive">Invalid JSON — check the format and try again.</small>}>
                          <small class="text-success">✓ Valid — {parseEntries()!.entries.length} entr{parseEntries()!.entries.length === 1 ? 'y' : 'ies'} ready</small>
                        </Show>
                      </Show>
                    </div>
                    <div class="flex justify-end gap-2">
                      <Button size="sm" disabled={!parseEntries()}
                        onClick={() => {
                          const parsed = parseEntries()
                          if (parsed) ingest.mutate({ id: fb.id, entries: parsed.entries as never })
                        }}>Run</Button>
                      <Button variant="ghost" size="sm" onClick={() => setIngestingId(null)}>Cancel</Button>
                    </div>
                  </div>
                </Show>
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
    <Show when={!blocks().length}>
      <Card class="p-4 mt-2.5">
        <p class="m-0 text-sm text-muted-foreground"><strong class="text-foreground">No fanbases created yet.</strong> {connections.data?.length ? 'Your platform connections are ready — create a fanbase to start ingesting candidates from them.' : 'Connect a platform above or create a fanbase with a manual source to start collecting candidates.'}</p>
        <p class="mt-2 m-0 text-sm text-muted-foreground">Each fanbase is an audience block with a swappable acquisition origin. Every ingest lands candidates as pending double opt-in.</p>
      </Card>
    </Show>
  </Card>
}
