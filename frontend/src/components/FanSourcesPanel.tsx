import { For, Show, createSignal, createMemo, createResource } from 'solid-js'
import { useMutation, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { FanbaseBlock, FanbaseConnection } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { FanbaseIcon } from './ProviderIcon'
import { SkeletonRows } from './Skeleton'

const SOURCE_KINDS = [
  { value: 'http_json_pull', label: 'HTTP JSON (pull)' },
  { value: 'csv_inline', label: 'CSV / inline batch' },
  { value: 'manual_import', label: 'Manual import' },
  { value: 'meta_lead_ads', label: 'Meta Lead Ads' },
  { value: 'bandsintown_followers', label: 'Bandsintown followers' },
  { value: 'google_customer_match', label: 'Google Customer Match' },
  { value: 'reddit_community', label: 'Reddit community' },
]

const SOURCE_LABEL: Record<string, string> = Object.fromEntries(
  SOURCE_KINDS.map(kind => [kind.value, kind.label]),
)

const OAUTH_PLATFORMS = [
  { value: 'meta', label: 'Meta (Facebook/Instagram)', icon: 'meta' },
  { value: 'google_ads', label: 'Google Ads', icon: 'google_ads' },
  { value: 'spotify', label: 'Spotify', icon: 'spotify' },
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
  { value: 'x', label: 'X (Twitter)', icon: 'x' },
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

  const resetForm = () => {
    setName(''); setSourceKind('http_json_pull'); setFetchUrl(''); setAttestedBy('')
  }

  const parseEntries = (): { entries: Record<string, string>[] } | null => {
    try {
      const parsed = JSON.parse(ingestJson()) as { entries?: unknown }
      if (!parsed.entries || !Array.isArray(parsed.entries) || parsed.entries.length === 0) return null
      // Validate every entry is an object with a string external_id
      const entries = parsed.entries as unknown[]
      if (!entries.every(e => typeof e === 'object' && e !== null && typeof (e as Record<string, unknown>).external_id === 'string')) {
        return null
      }
      return { entries: entries as Record<string, string>[] }
    } catch {
      return null
    }
  }

  const blocks = () => props.fanbases ?? []

  // --- Fanbase OAuth connections ---
  const [connections, { refetch: refetchConnections }] = createResource(async () => {
    try {
      const data = await api.fanbaseConnections(props.slug)
      return data.connections
    } catch {
      return null
    }
  })

  const disconnectConnection = async (id: string) => {
    setErrorText(null)
    try {
      await api.deleteFanbaseConnection(props.slug, id)
      refetchConnections()
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Disconnect failed')
    }
  }

  const connectDiscord = useMutation(() => ({
    mutationFn: () => api.createDiscordConnection(props.slug, discordInviteCode().trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
      refetchConnections()
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
      refetchConnections()
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
      refetchConnections()
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
      refetchConnections()
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
      refetchConnections()
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
      refetchConnections()
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
      refetchConnections()
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
      refetchConnections()
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
      refetchConnections()
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
      refetchConnections()
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
      refetchConnections()
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
      refetchConnections()
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

  return <article class="panel">
    <div class="section-title">
      <div><span class="eyebrow">FAN SOURCES</span><h2>Fanbases</h2><p>First-class audience blocks with a swappable acquisition origin. Every ingest lands candidates as pending double opt-in — active fans are never downgraded and opt-outs are never resurrected.</p></div>
      <div class="row-health">
        <Show when={!creating}>
          <button onClick={() => { setCreating(true); setNotice(null) }}>+ New fanbase</button>
        </Show>
        <StatusBadge status={blocks().length > 0 ? `${blocks().length} blocks` : 'none yet'} tone={blocks().length > 0 ? 'good' : 'muted'} />
      </div>
    </div>

    <Show when={notice()}><div class="notice-card" role="status">{notice()}</div></Show>
    <Show when={errorText()}>
      <div class="error-card" role="alert">{errorText()}</div>
    </Show>

    {/* Platform connections — OAuth-based fanbase sources */}
    <div class="agent-section">
      <div class="agent-section-head">
        <h3>Platform connections</h3>
        <Show when={connections() && connections()!.length > 0}>
          <span class="agent-connection-summary">
            <span class="agent-connection-dot ok" />
            {connections()!.length} connected
          </span>
        </Show>
      </div>
      <p class="agent-section-intro">Connected ad and music platforms. Disconnect to revoke access.</p>
      <Show when={!connections.loading} fallback={<SkeletonRows count={3} />}>
      <div class="agent-providers">
        <For each={OAUTH_PLATFORMS}>{(plat) => {
          const conn = () => connections()?.find(c => c.platform === plat.value)
          return (
            <div class="fanbase-connection-card" classList={{ connected: !!conn() }}>
              <div class="agent-provider-logo">
                <FanbaseIcon sourceKind={plat.icon as never} size={28} />
              </div>
              <div class="fanbase-connection-info">
                <div class="fanbase-connection-name">{plat.label}</div>
                <Show when={conn() && conn()!.last_sync_at}>
                  <div class="fanbase-connection-meta">
                    <span class="muted">last sync {formatAge(conn()!.last_sync_at!)}</span>
                  </div>
                </Show>
                {/* A connected channel that never syncs is the failure mode
                    this panel could not show: five of them read `connected`
                    while producing no data at all. The provider's own message
                    goes here, because it names the fix — a wrong page id, a
                    missing API key — and the status badge never can. */}
                <Show when={conn() && conn()!.last_sync_error}>
                  <div class="fanbase-connection-meta">
                    <span class="notifier-test-bad">
                      {conn()!.last_sync_at ? 'sync failing' : 'never synced'}
                      {conn()!.last_sync_failed_at ? ` (${formatAge(conn()!.last_sync_failed_at!)})` : ''}
                      : {conn()!.last_sync_error}
                    </span>
                  </div>
                </Show>
              </div>
              <div class="fanbase-connection-actions">
                <Show when={conn()}>
                  <StatusBadge status={conn()!.status} tone={connTone(conn()!.status, !!conn()!.last_sync_error)} />
                  <button class="agent-btn-danger" onClick={() => disconnectConnection(conn()!.id)}>Disconnect</button>
                </Show>
                <Show when={!conn() && plat.value === 'tiktok'}>
                  <button onClick={() => {
                    window.location.href = `https://signal-api.virya.music/v1/public/connections/tiktok/authorize?redirect=/tenants/${props.slug}/portfolio`
                  }}>Connect</button>
                </Show>
                <Show when={!conn() && plat.value === 'discord'}>
                  <button onClick={() => setConnectingPlatform('discord')}>Connect</button>
                </Show>
                <Show when={!conn() && plat.value === 'telegram'}>
                  <button onClick={() => setConnectingPlatform('telegram')}>Connect</button>
                </Show>
                <Show when={!conn() && plat.value === 'lastfm'}>
                  <button onClick={() => setConnectingPlatform('lastfm')}>Connect</button>
                </Show>
                <Show when={!conn() && plat.value === 'deezer'}>
                  <button onClick={() => setConnectingPlatform('deezer')}>Connect</button>
                </Show>
                <Show when={!conn() && plat.value === 'discogs'}>
                  <button onClick={() => setConnectingPlatform('discogs')}>Connect</button>
                </Show>
                <Show when={!conn() && plat.value === 'bluesky'}>
                  <button onClick={() => setConnectingPlatform('bluesky')}>Connect</button>
                </Show>
                <Show when={!conn() && plat.value === 'bandcamp'}>
                  <button onClick={() => setConnectingPlatform('bandcamp')}>Connect</button>
                </Show>
                <Show when={!conn() && plat.value === 'youtube'}>
                  <button onClick={() => { setConnectingPlatform('youtube'); setVerificationNotice(null) }}>Connect</button>
                </Show>
                <Show when={!conn() && plat.value === 'facebook'}>
                  <button onClick={() => { setConnectingPlatform('facebook'); setVerificationNotice(null) }}>Connect</button>
                </Show>
                <Show when={!conn() && plat.value === 'instagram'}>
                  <button onClick={() => { setConnectingPlatform('instagram'); setVerificationNotice(null) }}>Connect</button>
                </Show>
                <Show when={!conn() && plat.value === 'soundcloud'}>
                  <button onClick={() => { setConnectingPlatform('soundcloud'); setVerificationNotice(null) }}>Connect</button>
                </Show>
                <Show when={!conn() && plat.value === 'reddit'}>
                  <button onClick={() => { setConnectingPlatform('reddit'); setVerificationNotice(null) }}>Connect</button>
                </Show>
              </div>
            </div>
          )
        }}</For>
      </div>
      {/* Discord connection form */}
      <Show when={connectingPlatform() === 'discord'}>
        <div class="form-grid" style={{ 'margin-top': '12px' }}>
          <label>Discord invite code<small>From discord.gg/ link (e.g. BBdDV6gVy)</small><input value={discordInviteCode()} onInput={e => setDiscordInviteCode(e.currentTarget.value)} placeholder="BBdDV6gVy" /></label>
        </div>
        <div class="form-actions">
          <button disabled={!discordInviteCode().trim() || connectDiscord.isPending}
            onClick={() => connectDiscord.mutate()}>
            {connectDiscord.isPending ? 'Connecting…' : 'Connect Discord'}
          </button>
          <button class="ghost" onClick={() => setConnectingPlatform(null)}>Cancel</button>
        </div>
      </Show>
      {/* Telegram connection form */}
      <Show when={connectingPlatform() === 'telegram'}>
        <div class="form-grid" style={{ 'margin-top': '12px' }}>
          <label>Telegram channel<small>Public channel username</small><input value={telegramChannel()} onInput={e => setTelegramChannel(e.currentTarget.value)} placeholder="@virya_music" /></label>
          <label>Bot token<small>From @BotFather</small><input type="password" value={telegramBotToken()} onInput={e => setTelegramBotToken(e.currentTarget.value)} placeholder="123456:ABC-DEF…" /></label>
        </div>
        <div class="form-actions">
          <button disabled={!telegramChannel().trim() || !telegramBotToken().trim() || connectTelegram.isPending}
            onClick={() => connectTelegram.mutate()}>
            {connectTelegram.isPending ? 'Connecting…' : 'Connect Telegram'}
          </button>
          <button class="ghost" onClick={() => setConnectingPlatform(null)}>Cancel</button>
        </div>
      </Show>
      {/* Last.fm connection form */}
      <Show when={connectingPlatform() === 'lastfm'}>
        <div class="form-grid" style={{ 'margin-top': '12px' }}>
          <label>Last.fm artist name<small>Canonical spelling as on last.fm</small><input value={lastfmArtist()} onInput={e => setLastfmArtist(e.currentTarget.value)} placeholder="Iron Maiden" /></label>
        </div>
        <div class="form-actions">
          <button disabled={!lastfmArtist().trim() || connectLastfm.isPending}
            onClick={() => connectLastfm.mutate()}>
            {connectLastfm.isPending ? 'Connecting…' : 'Connect Last.fm'}
          </button>
          <button class="ghost" onClick={() => setConnectingPlatform(null)}>Cancel</button>
        </div>
      </Show>
      {/* Deezer connection form */}
      <Show when={connectingPlatform() === 'deezer'}>
        <div class="form-grid" style={{ 'margin-top': '12px' }}>
          <label>Deezer artist ID<small>Numeric ID from the Deezer artist page URL</small><input value={deezerArtistId()} onInput={e => setDeezerArtistId(e.currentTarget.value)} placeholder="13" /></label>
        </div>
        <div class="form-actions">
          <button disabled={!deezerArtistId().trim() || connectDeezer.isPending}
            onClick={() => connectDeezer.mutate()}>
            {connectDeezer.isPending ? 'Connecting…' : 'Connect Deezer'}
          </button>
          <button class="ghost" onClick={() => setConnectingPlatform(null)}>Cancel</button>
        </div>
      </Show>
      {/* Discogs connection form */}
      <Show when={connectingPlatform() === 'discogs'}>
        <div class="form-grid" style={{ 'margin-top': '12px' }}>
          <label>Discogs artist ID<small>Numeric ID from the Discogs artist page URL</small><input value={discogsArtistId()} onInput={e => setDiscogsArtistId(e.currentTarget.value)} placeholder="18839" /></label>
        </div>
        <div class="form-actions">
          <button disabled={!discogsArtistId().trim() || connectDiscogs.isPending}
            onClick={() => connectDiscogs.mutate()}>
            {connectDiscogs.isPending ? 'Connecting…' : 'Connect Discogs'}
          </button>
          <button class="ghost" onClick={() => setConnectingPlatform(null)}>Cancel</button>
        </div>
      </Show>
      {/* Bluesky connection form */}
      <Show when={connectingPlatform() === 'bluesky'}>
        <div class="form-grid" style={{ 'margin-top': '12px' }}>
          <label>Bluesky handle<small>Full handle including domain</small><input value={blueskyHandle()} onInput={e => setBlueskyHandle(e.currentTarget.value)} placeholder="virya.bsky.social" /></label>
        </div>
        <div class="form-actions">
          <button disabled={!blueskyHandle().trim() || connectBluesky.isPending}
            onClick={() => connectBluesky.mutate()}>
            {connectBluesky.isPending ? 'Connecting…' : 'Connect Bluesky'}
          </button>
          <button class="ghost" onClick={() => setConnectingPlatform(null)}>Cancel</button>
        </div>
      </Show>
      {/* Bandcamp connection form */}
      <Show when={connectingPlatform() === 'bandcamp'}>
        <div class="form-grid" style={{ 'margin-top': '12px' }}>
          <label>Bandcamp subdomain<small>The part before .bandcamp.com</small><input value={bandcampSubdomain()} onInput={e => setBandcampSubdomain(e.currentTarget.value)} placeholder="virya" /></label>
        </div>
        <div class="form-actions">
          <button disabled={!bandcampSubdomain().trim() || connectBandcamp.isPending}
            onClick={() => connectBandcamp.mutate()}>
            {connectBandcamp.isPending ? 'Connecting…' : 'Connect Bandcamp'}
          </button>
          <button class="ghost" onClick={() => setConnectingPlatform(null)}>Cancel</button>
        </div>
      </Show>
      {/* YouTube connection form */}
      <Show when={connectingPlatform() === 'youtube'}>
        <div class="form-grid" style={{ 'margin-top': '12px' }}>
          <label>YouTube channel ID<small>Starts with UC… (from the channel URL or API)</small><input value={youtubeChannelId()} onInput={e => setYoutubeChannelId(e.currentTarget.value)} placeholder="UCxxxxxxxxxxxxxxxxxxxxxx" /></label>
        </div>
        <div class="form-actions">
          <button disabled={!youtubeChannelId().trim() || connectYoutube.isPending}
            onClick={() => connectYoutube.mutate()}>
            {connectYoutube.isPending ? 'Connecting…' : 'Connect YouTube'}
          </button>
          <button class="ghost" onClick={() => { setConnectingPlatform(null); setVerificationNotice(null) }}>Cancel</button>
        </div>
        <Show when={verificationNotice()}><div class="notice-card" role="status">{verificationNotice()}</div></Show>
      </Show>
      {/* Facebook connection form */}
      <Show when={connectingPlatform() === 'facebook'}>
        <div class="form-grid" style={{ 'margin-top': '12px' }}>
          <label>Facebook Page ID<small>Numeric Page ID (from the page URL or Graph API)</small><input value={facebookPageId()} onInput={e => setFacebookPageId(e.currentTarget.value)} placeholder="1234567890" /></label>
        </div>
        <div class="form-actions">
          <button disabled={!facebookPageId().trim() || connectFacebook.isPending}
            onClick={() => connectFacebook.mutate()}>
            {connectFacebook.isPending ? 'Connecting…' : 'Connect Facebook'}
          </button>
          <button class="ghost" onClick={() => { setConnectingPlatform(null); setVerificationNotice(null) }}>Cancel</button>
        </div>
        <Show when={verificationNotice()}><div class="notice-card" role="status">{verificationNotice()}</div></Show>
      </Show>
      {/* Instagram connection form */}
      <Show when={connectingPlatform() === 'instagram'}>
        <div class="form-grid" style={{ 'margin-top': '12px' }}>
          <label>Instagram Business account ID<small>Numeric IG Business account ID (from Graph API)</small><input value={instagramIgUserId()} onInput={e => setInstagramIgUserId(e.currentTarget.value)} placeholder="178414xxxxxxxxxx" /></label>
        </div>
        <div class="form-actions">
          <button disabled={!instagramIgUserId().trim() || connectInstagram.isPending}
            onClick={() => connectInstagram.mutate()}>
            {connectInstagram.isPending ? 'Connecting…' : 'Connect Instagram'}
          </button>
          <button class="ghost" onClick={() => { setConnectingPlatform(null); setVerificationNotice(null) }}>Cancel</button>
        </div>
        <Show when={verificationNotice()}><div class="notice-card" role="status">{verificationNotice()}</div></Show>
      </Show>
      {/* SoundCloud connection form */}
      <Show when={connectingPlatform() === 'soundcloud'}>
        <div class="form-grid" style={{ 'margin-top': '12px' }}>
          <label>SoundCloud permalink<small>The artist's permalink (e.g. "virya" or full URL)</small><input value={soundcloudPermalink()} onInput={e => setSoundcloudPermalink(e.currentTarget.value)} placeholder="virya" /></label>
        </div>
        <div class="form-actions">
          <button disabled={!soundcloudPermalink().trim() || connectSoundcloud.isPending}
            onClick={() => connectSoundcloud.mutate()}>
            {connectSoundcloud.isPending ? 'Connecting…' : 'Connect SoundCloud'}
          </button>
          <button class="ghost" onClick={() => { setConnectingPlatform(null); setVerificationNotice(null) }}>Cancel</button>
        </div>
        <Show when={verificationNotice()}><div class="notice-card" role="status">{verificationNotice()}</div></Show>
      </Show>
      {/* Reddit connection form */}
      <Show when={connectingPlatform() === 'reddit'}>
        <div class="form-grid" style={{ 'margin-top': '12px' }}>
          <label>Subreddit name<small>The subreddit name (e.g. "Metal", "r/Metal")</small><input value={redditSubreddit()} onInput={e => setRedditSubreddit(e.currentTarget.value)} placeholder="Metal" /></label>
        </div>
        <div class="form-actions">
          <button disabled={!redditSubreddit().trim() || connectReddit.isPending}
            onClick={() => connectReddit.mutate()}>
            {connectReddit.isPending ? 'Connecting…' : 'Connect Reddit'}
          </button>
          <button class="ghost" onClick={() => { setConnectingPlatform(null); setVerificationNotice(null) }}>Cancel</button>
        </div>
        <Show when={verificationNotice()}><div class="notice-card" role="status">{verificationNotice()}</div></Show>
      </Show>
      </Show>
    </div>

    <Show when={creating}>
      <p class="agent-section-intro" style={{ 'margin-top': '20px' }}>A source is one place fans arrive from. Naming it well matters — the name is what every ingestion row, attribution report and audit entry refers back to.</p>
      <div class="form-grid">
        <label>
          <span>Name</span>
          <input value={name()} onInput={e => setName(e.currentTarget.value)} placeholder="e.g. Meta Lead Ads — Warsaw" />
          <small>Yours to choose. Include the platform and the campaign or city, so two similar feeds stay tellable apart later.</small>
        </label>
        <label>
          <span>Source kind</span>
          <select value={sourceKind()} onChange={e => setSourceKind(e.currentTarget.value)}>
            <For each={SOURCE_KINDS}>{k => <option value={k.value}>{k.label}</option>}</For>
          </select>
          <small>How fans reach the graph: a URL polled on a schedule, a batch you paste in, or a platform this tenant is connected to.</small>
        </label>
        <Show when={sourceKind() === 'http_json_pull'}>
          <label>
            <span>Fetch URL</span>
            <input value={fetchUrl()} onInput={e => setFetchUrl(e.currentTarget.value)} placeholder="https://…/candidates.json" />
            <small>HTTPS endpoint returning the candidate list as JSON. Polled on the ingestion schedule; it must stay reachable, so avoid a signed URL that expires.</small>
          </label>
        </Show>
        <Show when={needsAttestation()}>
          <label>
            <span>Consent attested by</span>
            <input value={attestedBy()} onInput={e => setAttestedBy(e.currentTarget.value)} placeholder="operator@label" />
            <small>This kind carries personal data, so a named operator has to attest that the fans consented. The name is stored with every batch it ingests.</small>
          </label>
        </Show>
      </div>
      <div class="form-actions">
        <button disabled={!name() || (needsAttestation() && !attestedBy())}
          onClick={() => create.mutate()}>Create</button>
        <button class="ghost" onClick={() => setCreating(false)}>Cancel</button>
      </div>
    </Show>

    <Show when={blocks().length}>
      <table class="data-table">
        <thead><tr><th>Name</th><th>Origin</th><th>Members</th><th>Last ingestion</th><th>Ingest</th><th></th></tr></thead>
        <tbody>
          <For each={blocks()}>{fb => (
            <tr>
              <td>{fb.name}{fb.enabled ? '' : ' (off)'}</td>
              <td><span class="fanbase-origin"><FanbaseIcon sourceKind={fb.source_kind} size={16} class="provider-icon" /> {SOURCE_LABEL[fb.source_kind] ?? fb.source_kind}</span></td>
              <td>{metric(fb.members)}</td>
              <td>
                <Show when={fb.last_status} fallback={<span class="muted">never</span>}>
                  <span class="row-health">
                    <StatusBadge status={fb.last_status ?? ''} tone={ingestionTone(fb.last_status)} />
                    <Show when={fb.last_imported_pending != null}>
                      <small>+{fb.last_imported_pending} pending</small>
                    </Show>
                  </span>
                </Show>
              </td>
              <td>
                <Show when={ingestingId() === fb.id} fallback={
                  <button disabled={pendingFor() !== null}
                    onClick={() => { setIngestingId(fb.id); setIngestJson(EMPTY_INGEST) }}>
                    Ingest batch…
                  </button>
                }>
                  <div class="ingest-editor">
                    <textarea rows="4" placeholder='{"entries":[{"external_id":"x1","email":"a@b.c"}]}'
                      aria-label="Fan batch JSON"
                      value={ingestJson()} onInput={e => setIngestJson(e.currentTarget.value)} />
                    <div class="form-actions">
                      <button disabled={!parseEntries()}
                        onClick={() => {
                          const parsed = parseEntries()
                          if (parsed) ingest.mutate({ id: fb.id, entries: parsed.entries as never })
                        }}>Run</button>
                      <button class="ghost" onClick={() => setIngestingId(null)}>Cancel</button>
                    </div>
                  </div>
                </Show>
              </td>
              <td>
                <Show when={confirmingDelete() === fb.id} fallback={
                  <button class="danger-ghost" disabled={pendingFor() !== null || remove.isPending}
                    onClick={() => setConfirmingDelete(fb.id)}>
                    Delete
                  </button>
                }>
                  <div class="row-health">
                    <button class="danger-ghost" disabled={remove.isPending}
                      onClick={() => remove.mutate(fb.id)}>
                      {remove.isPending ? 'Deleting…' : 'Confirm'}
                    </button>
                    <button class="ghost" onClick={() => setConfirmingDelete(null)}>Cancel</button>
                  </div>
                </Show>
              </td>
            </tr>
          )}</For>
        </tbody>
      </table>
    </Show>
    <Show when={!blocks().length}>
      <div class="inherit-card portfolio-empty">
        <p><strong>No fanbases created yet.</strong> {connections()?.length ? 'Your platform connections are ready — create a fanbase to start ingesting candidates from them.' : 'Connect a platform above or create a fanbase with a manual source to start collecting candidates.'}</p>
        <p>Each fanbase is an audience block with a swappable acquisition origin. Every ingest lands candidates as pending double opt-in.</p>
      </div>
    </Show>
  </article>
}
