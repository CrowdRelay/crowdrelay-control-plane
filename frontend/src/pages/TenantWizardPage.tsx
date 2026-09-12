import { For, Show, createSignal, createMemo } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { useNavigate } from '@tanstack/solid-router'
import { api } from '../lib/api'
import type { RegionalProfile } from '../lib/types'
import { cn } from '../lib/cn'
import { StatusBadge } from '../components/StatusBadge'
import { Spinner } from '../components/Spinner'
import { ErrorCard, PageHeader, PageShell, PanelTitle } from '../components/layout'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { NativeSelect } from '../components/ui/native-select'

type Preset = 'PL' | 'DE' | 'CZ' | 'US'
const presets: Record<Preset, RegionalProfile> = {
  PL: { countryCode:'PL', region:'eu', locale:'pl-PL', timezone:'Europe/Warsaw', currency:'PLN', dateFormat:'dmy', numberFormat:'comma_decimal', dataRegion:'eu' },
  DE: { countryCode:'DE', region:'eu', locale:'de-DE', timezone:'Europe/Berlin', currency:'EUR', dateFormat:'dmy', numberFormat:'comma_decimal', dataRegion:'eu' },
  CZ: { countryCode:'CZ', region:'eu', locale:'cs-CZ', timezone:'Europe/Prague', currency:'CZK', dateFormat:'dmy', numberFormat:'comma_decimal', dataRegion:'eu' },
  US: { countryCode:'US', region:'us', locale:'en-US', timezone:'', currency:'USD', dateFormat:'mdy', numberFormat:'dot_decimal', dataRegion:'us' },
}

// Mirrors `NorthStarMetric::all()` in crowdrelay-domain. The wizard creates a
// tenant, so there is no instance to ask yet — the list has to live here. It is
// pinned to the Rust vocabulary by
// `scripts/test_north_star_vocabulary_parity.py`, which fails if the two drift.
type NorthStar =
  | 'signal_installs'
  | 'total_audience'
  | 'spotify_followers'
  | 'youtube_subscribers'
  | 'bandsintown_trackers'
 
  | 'tiktok_followers'
  | 'soundcloud_followers'
  | 'instagram_followers'
  | 'facebook_followers'
  | 'discord_members'
  | 'telegram_subscribers'
  | 'lastfm_listeners'
  | 'deezer_fans'
  | 'discogs_in_collection'
  | 'bluesky_followers'
  | 'bandcamp_supporters'
  | 'x_followers'
type FanbaseSource = 'discord' | 'facebook_group' | 'youtube' | 'forum' | 'reddit' | 'x'

const northStars: { value: NorthStar; label: string; description: string; requiresSignal?: boolean }[] = [
  { value: 'total_audience', label: 'Total audience', description: 'Optimize the whole connected portfolio — every platform summed. The right choice when reach is spread across accounts rather than concentrated in one.' },
  { value: 'signal_installs', label: 'Signal fans', description: 'Optimize for Signal mobile app installs. The brain prioritizes signal-inviter workers and conversion-focused content.', requiresSignal: true },
  { value: 'spotify_followers', label: 'Spotify followers', description: 'Optimize Spotify artist follower growth. The brain prioritizes playlist outreach and release content.' },
  { value: 'youtube_subscribers', label: 'YouTube subscribers', description: 'Optimize YouTube channel subscriber growth. The brain prioritizes video-led posts and community engagement.' },
  { value: 'bandsintown_trackers', label: 'Bandsintown trackers', description: 'Optimize Bandsintown tracker count. The brain prioritizes event-driven promotion and tour marketing.' },
  { value: 'soundcloud_followers', label: 'SoundCloud followers', description: 'Optimize SoundCloud follower growth. Common north star for DJs and producers releasing there first.' },
  { value: 'tiktok_followers', label: 'TikTok followers', description: 'Optimize TikTok follower growth. The brain prioritizes short-form content and trend-led posting.' },
  { value: 'instagram_followers', label: 'Instagram followers', description: 'Optimize Instagram follower growth. The brain prioritizes visual content and story-led engagement.' },
  { value: 'facebook_followers', label: 'Facebook followers', description: 'Optimize Facebook Page follower growth.' },
  { value: 'bandcamp_supporters', label: 'Bandcamp supporters', description: 'Optimize Bandcamp supporter count — the audience that has actually paid.' },
  { value: 'discord_members', label: 'Discord members', description: 'Optimize Discord server membership. The brain prioritizes community-building over broadcast.' },
  { value: 'telegram_subscribers', label: 'Telegram subscribers', description: 'Optimize Telegram channel subscribers.' },
  { value: 'lastfm_listeners', label: 'Last.fm listeners', description: 'Optimize Last.fm listener count — people, not plays.' },
  { value: 'deezer_fans', label: 'Deezer fans', description: 'Optimize Deezer artist fan count.' },
  { value: 'bluesky_followers', label: 'Bluesky followers', description: 'Optimize Bluesky follower growth.' },
  { value: 'discogs_in_collection', label: 'Discogs collectors', description: 'Optimize the number of collectors who own a release. A strong signal for physical-format acts.' },
  { value: 'x_followers', label: 'X followers', description: 'Optimize X (Twitter) follower growth. The brain prioritizes X content and engagement.' },
]

const fanbaseSources: { value: FanbaseSource; label: string; description: string }[] = [
  { value: 'discord', label: 'Discord servers', description: 'Discover Discord communities via Disboard.org public API.' },
  { value: 'facebook_group', label: 'Facebook Groups', description: 'Discover Facebook Groups via Graph API.' },
  { value: 'youtube', label: 'YouTube channels', description: 'Discover YouTube channels via Data API v3.' },
  { value: 'forum', label: 'Forums', description: 'Discover music forums via web search.' },
  { value: 'reddit', label: 'Reddit (post-only)', description: 'Reddit discovery is already integrated. Posting only — scraping is broken.' },
  { value: 'x', label: 'X (Twitter)', description: 'Discover X curators and music communities via browser-scraped search.' },
]


export function TenantWizardPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const overview = useQuery(() => ({ queryKey: ['overview'], queryFn: api.overview, reconcile: 'id', staleTime: 30_000, refetchOnWindowFocus: false }))

  const [step, setStep] = createSignal(1)
  const [slug, setSlug] = createSignal('')
  const [name, setName] = createSignal('')
  const [crowdrelayBaseUrl, setCrowdrelayBaseUrl] = createSignal('')
  const [signalBaseUrl, setSignalBaseUrl] = createSignal('')
  const [profile, setProfile] = createSignal<RegionalProfile>({ ...presets.PL })
  const [desiredVersion, setDesiredVersion] = createSignal('')
  const [deployNow, setDeployNow] = createSignal(true)
  const [opUsername, setOpUsername] = createSignal('')
  const [opPassword, setOpPassword] = createSignal('')

  // Step 2: Products
  const [signalEnabled, setSignalEnabled] = createSignal(true)
  const [synesthesiaEnabled, setSynesthesiaEnabled] = createSignal(false)
  const [areaEnabled, setAreaEnabled] = createSignal(false)
  const [signalPlayStoreUrl, setSignalPlayStoreUrl] = createSignal('')
  const [synesthesiaPlayStoreUrl, setSynesthesiaPlayStoreUrl] = createSignal('')

  // Step 3: Goal
  const [northStar, setNorthStar] = createSignal<NorthStar>('total_audience')

  // Step 4: Fanbase sources
  const [selectedSources, setSelectedSources] = createSignal<FanbaseSource[]>([])

  // Step 5: Provider API keys (optional, collapsible)
  const [bandsintownKey, setBandsintownKey] = createSignal('')
  const [youtubeKey, setYoutubeKey] = createSignal('')
  const [spotifyClientId, setSpotifyClientId] = createSignal('')
  const [spotifyClientSecret, setSpotifyClientSecret] = createSignal('')
  const [facebookPageToken, setFacebookPageToken] = createSignal('')
  const [tiktokClientKey, setTiktokClientKey] = createSignal('')
  const [tiktokClientSecret, setTiktokClientSecret] = createSignal('')
  const [lastfmKey, setLastfmKey] = createSignal('')
  const [showProviderKeys, setShowProviderKeys] = createSignal(false)

  const providerKeys = createMemo(() => {
    const keys: Record<string, string> = {}
    if (bandsintownKey().trim()) keys.bandsintown = bandsintownKey().trim()
    if (youtubeKey().trim()) keys.youtube = youtubeKey().trim()
    if (spotifyClientId().trim()) keys.spotifyClientId = spotifyClientId().trim()
    if (spotifyClientSecret().trim()) keys.spotifyClientSecret = spotifyClientSecret().trim()
    if (facebookPageToken().trim()) keys.facebookPageToken = facebookPageToken().trim()
    if (tiktokClientKey().trim()) keys.tiktokClientKey = tiktokClientKey().trim()
    if (tiktokClientSecret().trim()) keys.tiktokClientSecret = tiktokClientSecret().trim()
    if (lastfmKey().trim()) keys.lastfm = lastfmKey().trim()
    return Object.keys(keys).length > 0 ? keys : undefined
  })

  const applyPreset = (preset: Preset) => setProfile({ ...presets[preset] })
  const setRegional = <K extends keyof RegionalProfile>(key: K, value: RegionalProfile[K]) =>
    setProfile(current => ({ ...current, [key]: value }))

  const toggleSource = (source: FanbaseSource) =>
    setSelectedSources(current =>
      current.includes(source) ? current.filter(s => s !== source) : [...current, source]
    )

  // When Signal is disabled, north star can't be signal_installs
  const availableNorthStars = createMemo(() => {
    const enabled = signalEnabled()
    return northStars.filter(n => !n.requiresSignal || enabled)
  })

  const effectiveNorthStar = createMemo(() => {
    const ns = northStar()
    if (ns === 'signal_installs' && !signalEnabled()) return 'total_audience' as NorthStar
    return ns
  })

  const operatorFieldsReady = () => !opUsername().trim() && !opPassword()
    || (/^[a-z0-9][a-z0-9-_.]{2,31}$/.test(opUsername().trim()) && opPassword().length >= 12)

  const regionalReady = () => profile().countryCode.length === 2
    && profile().locale.trim().length >= 4
    && profile().timezone.includes('/')
    && profile().currency.length === 3

  const deployFieldsReady = () => !deployNow() || (
    overview.data?.provisionerConfigured === true
    && crowdrelayBaseUrl().startsWith('https://')
    && (signalBaseUrl().startsWith('https://') || !signalEnabled())
    && (desiredVersion().trim().length > 0 || Boolean(overview.data?.provisionerDefaultImageTag))
  )

  const deployBlocker = () => {
    if (!deployNow()) return null
    if (overview.data?.provisionerConfigured !== true) return 'No provisioner token is configured, so this control plane cannot deploy. Untick the deploy box to create the tenant only.'
    if (!crowdrelayBaseUrl().startsWith('https://')) return 'CrowdRelay API base URL must be an https:// address.'
    if (signalEnabled() && !signalBaseUrl().startsWith('https://')) return 'Signal is enabled, so its public site URL is required.'
    if (!desiredVersion().trim() && !overview.data?.provisionerDefaultImageTag) return 'No server default release is set — paste the release SHA to deploy.'
    return null
  }

  const step1Ready = () => slug().length >= 2 && name().length >= 2 && regionalReady()
  // Named in field order so the message tracks where the operator is looking.
  const step1Blocker = () => {
    if (slug().length < 2) return 'Give the tenant a slug to continue.'
    if (name().length < 2) return 'Add a display name to continue.'
    if (profile().countryCode.length !== 2) return 'Country needs a two-letter code.'
    if (profile().locale.trim().length < 4) return 'Locale needs a BCP-47 tag, e.g. de-DE.'
    if (!profile().timezone.includes('/')) return 'Timezone needs an IANA name, e.g. Europe/Berlin.'
    if (profile().currency.length !== 3) return 'Currency needs a three-letter code.'
    if (!operatorFieldsReady()) return 'Operator username must be 3–32 lowercase characters and the password at least 12 — or clear both to skip.'
    return null
  }
  const step2Ready = () => true
  const step3Ready = () => true
  const step4Ready = () => true

  const createTenant = useMutation(() => ({
    mutationFn: () => api.createTenant({
      slug: slug(), displayName: name(),
      crowdrelayBaseUrl: crowdrelayBaseUrl() || undefined,
      signalBaseUrl: signalBaseUrl() || undefined,
      defaultCountryCode: profile().countryCode,
      regionalProfile: profile(),
      deployCrowdrelay: deployNow(),
      desiredVersion: deployNow() ? desiredVersion() || undefined : undefined,
      initialOperator: opUsername().trim() && opPassword() ? { username: opUsername().trim(), password: opPassword() } : undefined,
      signalEnabled: signalEnabled(),
      synesthesiaEnabled: synesthesiaEnabled(),
      areaEnabled: areaEnabled(),
      northStarMetric: effectiveNorthStar(),
      fanbaseSources: selectedSources(),
      signalPlayStoreUrl: signalPlayStoreUrl().trim() || undefined,
      synesthesiaPlayStoreUrl: synesthesiaPlayStoreUrl().trim() || undefined,
      providerKeys: providerKeys(),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenants'] }),
        queryClient.invalidateQueries({ queryKey: ['overview'] }),
      ])
      navigate({ to: '/tenants' })
    },
  }))

  const nextStep = () => {
    if (step() === 1 && step1Ready()) setStep(2)
    else if (step() === 2 && step2Ready()) setStep(3)
    else if (step() === 3 && step3Ready()) setStep(4)
    else if (step() === 4 && step4Ready()) setStep(5)
  }
  const prevStep = () => { if (step() > 1) setStep(step() - 1) }

  return <PageShell>
    <PageHeader
      eyebrow="ONBOARDING WIZARD"
      title="New tenant"
      description="Configure identity, products, growth goal, and fanbase sources. The brain adapts its strategy to the selected goal."
    />

    <div class="flex items-center gap-2 flex-wrap">
      <div class={cn('flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors', step() >= 1 ? 'bg-primary/10 text-primary' : 'text-muted-foreground', step() === 1 && 'ring-1 ring-primary/30')}>1. Identity + Region</div>
      <div class={cn('flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors', step() >= 2 ? 'bg-primary/10 text-primary' : 'text-muted-foreground', step() === 2 && 'ring-1 ring-primary/30')}>2. Products</div>
      <div class={cn('flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors', step() >= 3 ? 'bg-primary/10 text-primary' : 'text-muted-foreground', step() === 3 && 'ring-1 ring-primary/30')}>3. Goal</div>
      <div class={cn('flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors', step() >= 4 ? 'bg-primary/10 text-primary' : 'text-muted-foreground', step() === 4 && 'ring-1 ring-primary/30')}>4. Fanbase Sources</div>
      <div class={cn('flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors', step() >= 5 ? 'bg-primary/10 text-primary' : 'text-muted-foreground', step() === 5 && 'ring-1 ring-primary/30')}>5. Deploy</div>
    </div>

    <Show when={step() === 1}>
      <div class="rounded-lg border border-border bg-card p-5 space-y-4">
        <div class="flex items-center justify-between gap-2 flex-wrap"><div><PanelTitle>Identity + region</PanelTitle></div><Show when={overview.error}><StatusBadge status="Provisioner status unavailable" tone="bad" /></Show><Show when={!overview.error}><StatusBadge status={overview.data?.provisionerConfigured ? 'Provisioner connected' : 'Provisioner token not configured'} tone={overview.data?.provisionerConfigured ? 'good' : 'warn'} /></Show></div>
        <p class="text-sm text-muted-foreground leading-relaxed">Identity is permanent once the tenant exists; the regional block is what the runtime reads instead of guessing from a browser or an IP address.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <label><span>Slug</span><Input value={slug()} onInput={(e) => setSlug(e.currentTarget.value.toLowerCase())} placeholder="future-metal" autocomplete="off" /><small>Lowercase, used in URLs and API paths. It cannot be changed later.</small></label>
          <label><span>Display name</span><Input value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="Future Metal" /><small>The band or label as people write it. Shown across the console and in operator-facing alerts.</small></label>
          <label>Regional preset<NativeSelect onChange={e=>applyPreset(e.currentTarget.value as Preset)}><option value="PL">Poland</option><option value="DE">Germany</option><option value="CZ">Czechia</option><option value="US">United States</option></NativeSelect><small>Fills the six fields below in one go. Nothing is inferred from it afterwards — edit any of them freely.</small></label>
          <label><span>Country</span><Input maxlength="2" value={profile().countryCode} onInput={e=>setRegional('countryCode',e.currentTarget.value.toUpperCase())}/><small>Two-letter ISO code, e.g. PL. The tenant's home market, not where the servers are.</small></label>
          <label><span>Locale</span><Input value={profile().locale} onInput={e=>setRegional('locale',e.currentTarget.value)} placeholder="de-DE"/><small>BCP-47 tag. Decides the language and formatting of fan-facing copy.</small></label>
          <label>Timezone<Input value={profile().timezone} onInput={e=>setRegional('timezone',e.currentTarget.value)} placeholder={profile().countryCode === 'US' ? 'America/Chicago (choose explicitly)' : 'Europe/Berlin'}/><small>{profile().countryCode === 'US' ? 'Required: US preset intentionally has no hidden timezone default.' : 'Explicit IANA timezone.'}</small></label>
          <label><span>Currency</span><Input maxlength="3" value={profile().currency} onInput={e=>setRegional('currency',e.currentTarget.value.toUpperCase())}/><small>Three-letter ISO code, e.g. PLN. Ticket and merch amounts are stored and shown in it.</small></label>
          <label><span>Market region</span><NativeSelect value={profile().region} onChange={e=>setRegional('region',e.currentTarget.value as 'eu'|'us')}><option value="eu">EU</option><option value="us">US</option></NativeSelect><small>Which market the growth strategy plays in. Separate from data residency below.</small></label>
          <label>Data residency<NativeSelect value={profile().dataRegion} onChange={e=>setRegional('dataRegion',e.currentTarget.value as 'eu'|'us')}><option value="eu">EU</option><option value="us">US</option></NativeSelect><small>Cannot be changed after deployment.</small></label>
          <label><span>Date format</span><NativeSelect value={profile().dateFormat} onChange={e=>setRegional('dateFormat',e.currentTarget.value as RegionalProfile['dateFormat'])}><option value="dmy">DD/MM/YYYY</option><option value="mdy">MM/DD/YYYY</option><option value="ymd">YYYY-MM-DD</option></NativeSelect><small>How dates are printed to fans and operators of this tenant.</small></label>
          <label><span>Number format</span><NativeSelect value={profile().numberFormat} onChange={e=>setRegional('numberFormat',e.currentTarget.value as RegionalProfile['numberFormat'])}><option value="comma_decimal">1 234,56</option><option value="dot_decimal">1,234.56</option></NativeSelect><small>Thousands and decimal separators for counts and prices.</small></label>
        </div>
        <div class="flex items-center justify-between gap-2"><div><PanelTitle>First account for the team</PanelTitle></div></div>
        <p class="text-sm text-muted-foreground leading-relaxed">Optional. Creates one login scoped to this tenant so the band or their manager can work without a platform admin. You can add more later from the tenant page.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <label>Operator username<Input value={opUsername()} onInput={(e) => setOpUsername(e.currentTarget.value.toLowerCase())} placeholder="future-metal-op" autocomplete="off" /><small>Optional. Sees only this tenant; leave blank to skip.</small></label>
          <label>Operator password<Input type="password" value={opPassword()} onInput={(e) => setOpPassword(e.currentTarget.value)} placeholder="min 12 characters" autocomplete="new-password" /><small>Handed to the team once — never shown again.</small></label>
        </div>
        {/* The Next button just went grey. Say which field is still holding
            it, in the order the form asks for them. */}
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="text-sm" aria-live="polite">
            <span class="flex items-center gap-2">
              <span class={cn('inline-block w-2 h-2 rounded-full', step1Ready() && operatorFieldsReady() ? 'bg-success' : 'bg-muted-foreground')} />
              {step1Blocker() ?? 'Identity and region are complete.'}
            </span>
          </div>
          <div class="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/tenants' })}>Cancel</Button>
            <Button size="sm" onClick={nextStep} disabled={!step1Ready() || !operatorFieldsReady()}>Next: Products →</Button>
          </div>
        </div>
      </div>
    </Show>

    <Show when={step() === 2}>
      <div class="rounded-lg border border-border bg-card p-5 space-y-4">
        <div class="flex items-center justify-between gap-2"><div><PanelTitle>Products</PanelTitle></div></div>
        <p class="text-sm text-muted-foreground leading-relaxed">Choose which products to enable for this tenant. Each product can be toggled independently.</p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label class={cn('flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors', signalEnabled() ? 'border-primary bg-primary/5' : 'border-border bg-surface-1 hover:border-border-strong')}>
            <input type="checkbox" class="mt-1" checked={signalEnabled()} onChange={(e) => setSignalEnabled(e.currentTarget.checked)} />
            <div>
              <strong class="text-sm text-foreground">Signal mobile app</strong>
              <small class="block text-xs text-muted-foreground mt-1">Push notifications, fan engagement, and event alerts. The brain's signal-inviter worker is only dispatched when this is enabled.</small>
            </div>
          </label>
          <label class={cn('flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors', synesthesiaEnabled() ? 'border-primary bg-primary/5' : 'border-border bg-surface-1 hover:border-border-strong')}>
            <input type="checkbox" class="mt-1" checked={synesthesiaEnabled()} onChange={(e) => setSynesthesiaEnabled(e.currentTarget.checked)} />
            <div>
              <strong class="text-sm text-foreground">Synesthesia</strong>
              <small class="block text-xs text-muted-foreground mt-1">Interactive album experience with leaderboard and game mechanics. Originally a Virya-exclusive product.</small>
            </div>
          </label>
          <label class={cn('flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors', areaEnabled() ? 'border-primary bg-primary/5' : 'border-border bg-surface-1 hover:border-border-strong')}>
            <input type="checkbox" class="mt-1" checked={areaEnabled()} onChange={(e) => setAreaEnabled(e.currentTarget.checked)} />
            <div>
              <strong class="text-sm text-foreground">AREA game</strong>
              <small class="block text-xs text-muted-foreground mt-1">Location-based fan engagement with drops, challenges, and claims.</small>
            </div>
          </label>
        </div>
        <Show when={!signalEnabled()}>
          <div class="rounded-lg border border-border bg-surface-1 p-4 text-sm text-muted-foreground">Signal is disabled. The brain goal step will not offer "Signal fans" as a north star option. Signal base URL is not required for deployment.</div>
        </Show>
        <Show when={signalEnabled() || synesthesiaEnabled()}>
          <div class="flex items-center justify-between gap-2"><div><PanelTitle>Play Store URLs (optional)</PanelTitle></div></div>
          <p class="text-sm text-muted-foreground leading-relaxed">Set the Google Play Store URL for each enabled mobile app. Leave blank if the app is not yet published — you can add it later from the tenant page.</p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <Show when={signalEnabled()}>
              <label>Signal Play Store URL<Input value={signalPlayStoreUrl()} onInput={(e) => setSignalPlayStoreUrl(e.currentTarget.value)} placeholder={`https://play.google.com/store/apps/details?id=music.${slug() || 'tenant'}.signal`} /></label>
            </Show>
            <Show when={synesthesiaEnabled()}>
              <label>Synesthesia Play Store URL<Input value={synesthesiaPlayStoreUrl()} onInput={(e) => setSynesthesiaPlayStoreUrl(e.currentTarget.value)} placeholder={`https://play.google.com/store/apps/details?id=music.${slug() || 'tenant'}.synesthesia`} /></label>
            </Show>
          </div>
        </Show>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={prevStep}>← Back</Button>
          <Button size="sm" onClick={nextStep} disabled={!step2Ready()}>Next: Goal →</Button>
        </div>
      </div>
    </Show>

    <Show when={step() === 3}>
      <div class="rounded-lg border border-border bg-card p-5 space-y-4">
        <div class="flex items-center justify-between gap-2"><div><PanelTitle>Growth goal</PanelTitle></div></div>
        <p class="text-sm text-muted-foreground leading-relaxed">The brain optimizes its deterministic strategy around this metric. Fan aggregation is always active regardless of this choice.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <For each={availableNorthStars()}>{ns =>
            <label class={cn('flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors', northStar() === ns.value ? 'border-primary bg-primary/5' : 'border-border bg-surface-1 hover:border-border-strong')}>
              <input type="radio" class="mt-1" name="northstar" value={ns.value} checked={northStar() === ns.value} onChange={() => setNorthStar(ns.value)} />
              <div>
                <strong class="text-sm text-foreground">{ns.label}</strong>
                <small class="block text-xs text-muted-foreground mt-1">{ns.description}</small>
              </div>
            </label>
          }</For>
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={prevStep}>← Back</Button>
          <Button size="sm" onClick={nextStep} disabled={!step3Ready()}>Next: Fanbase Sources →</Button>
        </div>
      </div>
    </Show>

    <Show when={step() === 4}>
      <div class="rounded-lg border border-border bg-card p-5 space-y-4">
        <div class="flex items-center justify-between gap-2"><div><PanelTitle>Fanbase sources</PanelTitle></div></div>
        <p class="text-sm text-muted-foreground leading-relaxed">Select which platforms the discovery worker should search for fan communities. These are upserted into the audience graph.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <For each={fanbaseSources}>{src =>
            <label class={cn('flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors', selectedSources().includes(src.value) ? 'border-primary bg-primary/5' : 'border-border bg-surface-1 hover:border-border-strong')}>
              <input type="checkbox" class="mt-1" checked={selectedSources().includes(src.value)} onChange={() => toggleSource(src.value)} />
              <div>
                <strong class="text-sm text-foreground">{src.label}</strong>
                <small class="block text-xs text-muted-foreground mt-1">{src.description}</small>
              </div>
            </label>
          }</For>
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={prevStep}>← Back</Button>
          <Button size="sm" onClick={nextStep} disabled={!step4Ready()}>Next: Deploy →</Button>
        </div>
      </div>
    </Show>

    <Show when={step() === 5}>
      <div class="rounded-lg border border-border bg-card p-5 space-y-4">
        <div class="flex items-center justify-between gap-2"><div><PanelTitle>Review + deploy</PanelTitle></div></div>
        <div class="rounded-lg border border-border bg-surface-1 p-4 space-y-2">
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Slug</span><strong class="text-sm text-foreground">{slug()}</strong></div>
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Display name</span><strong class="text-sm text-foreground">{name()}</strong></div>
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Region</span><strong class="text-sm text-foreground">{profile().locale} · {profile().timezone} · {profile().dataRegion.toUpperCase()}</strong></div>
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Signal</span><strong class={cn('text-sm', signalEnabled() ? 'text-success' : 'text-muted-foreground')}>{signalEnabled() ? 'Enabled' : 'Disabled'}</strong></div>
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Synesthesia</span><strong class={cn('text-sm', synesthesiaEnabled() ? 'text-success' : 'text-muted-foreground')}>{synesthesiaEnabled() ? 'Enabled' : 'Disabled'}</strong></div>
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">AREA game</span><strong class={cn('text-sm', areaEnabled() ? 'text-success' : 'text-muted-foreground')}>{areaEnabled() ? 'Enabled' : 'Disabled'}</strong></div>
          <Show when={signalEnabled() && signalPlayStoreUrl().trim()}>
            <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Signal Play URL</span><strong class="text-sm text-foreground break-all">{signalPlayStoreUrl().trim()}</strong></div>
          </Show>
          <Show when={synesthesiaEnabled() && synesthesiaPlayStoreUrl().trim()}>
            <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Synesthesia Play URL</span><strong class="text-sm text-foreground break-all">{synesthesiaPlayStoreUrl().trim()}</strong></div>
          </Show>
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Brain goal</span><strong class="text-sm text-foreground">{northStars.find(n => n.value === effectiveNorthStar())?.label ?? effectiveNorthStar()}</strong></div>
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Fanbase sources</span><strong class="text-sm text-foreground">{selectedSources().length > 0 ? selectedSources().join(', ') : 'None selected'}</strong></div>
          <Show when={deployNow()}>
            <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">CrowdRelay URL</span><strong class="text-sm text-foreground break-all">{crowdrelayBaseUrl() || 'not set'}</strong></div>
            <Show when={signalEnabled()}>
              <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Signal URL</span><strong class="text-sm text-foreground break-all">{signalBaseUrl() || 'not set'}</strong></div>
            </Show>
            <div class="flex items-center justify-between gap-3 py-1"><span class="text-sm text-muted-foreground">Release SHA</span><strong class="text-sm text-foreground">{desiredVersion() || overview.data?.provisionerDefaultImageTag || 'server default'}</strong></div>
          </Show>
        </div>

        <Show when={deployNow()}>
          <div class="flex items-center justify-between gap-2"><div><PanelTitle>Deploy URLs</PanelTitle></div></div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <label>CrowdRelay API base URL<Input value={crowdrelayBaseUrl()} onInput={(e) => setCrowdrelayBaseUrl(e.currentTarget.value)} placeholder="https://api.future-metal.example" /></label>
            <Show when={signalEnabled()}>
              <label>Signal / public site URL<Input value={signalBaseUrl()} onInput={(e) => setSignalBaseUrl(e.currentTarget.value)} placeholder="https://future-metal.example" /></label>
            </Show>
            <label>Release SHA <small>optional if server default is configured</small><Input value={desiredVersion()} onInput={(e) => setDesiredVersion(e.currentTarget.value)} placeholder={overview.data?.provisionerDefaultImageTag ?? 'sha-<40-char CrowdRelay commit>'} /></label>
          </div>

          {/* Optional provider API keys — collapsible, only shown when deploying */}
          <Button variant="ghost" size="sm" onClick={() => setShowProviderKeys(!showProviderKeys())}>
            {showProviderKeys() ? '▾' : '▸'} Optional: Provider API keys
          </Button>
          <Show when={showProviderKeys()}>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <label>Bandsintown API key<Input value={bandsintownKey()} onInput={(e) => setBandsintownKey(e.currentTarget.value)} placeholder="Optional" /></label>
              <label>YouTube API key<Input value={youtubeKey()} onInput={(e) => setYoutubeKey(e.currentTarget.value)} placeholder="Optional" /></label>
              <label>Spotify client ID<Input value={spotifyClientId()} onInput={(e) => setSpotifyClientId(e.currentTarget.value)} placeholder="Optional" /></label>
              <label>Spotify client secret<Input value={spotifyClientSecret()} onInput={(e) => setSpotifyClientSecret(e.currentTarget.value)} placeholder="Optional" type="password" /></label>
              <label>Facebook page token<Input value={facebookPageToken()} onInput={(e) => setFacebookPageToken(e.currentTarget.value)} placeholder="Optional" type="password" /></label>
              <label>TikTok client key<Input value={tiktokClientKey()} onInput={(e) => setTiktokClientKey(e.currentTarget.value)} placeholder="Optional" /></label>
              <label>TikTok client secret<Input value={tiktokClientSecret()} onInput={(e) => setTiktokClientSecret(e.currentTarget.value)} placeholder="Optional" type="password" /></label>
              <label>Last.fm API key<Input value={lastfmKey()} onInput={(e) => setLastfmKey(e.currentTarget.value)} placeholder="Optional" /></label>
            </div>
          </Show>

          <label class="flex items-start gap-3 cursor-pointer"><input type="checkbox" class="mt-1" checked={deployNow()} onChange={(e) => setDeployNow(e.currentTarget.checked)} /><span><strong>Deploy isolated CrowdRelay instance now</strong><small class="block text-muted-foreground">Only an agent for the selected data region may claim this schema-v4 job.</small></span></label>
        </Show>

        <Show when={createTenant.error}><ErrorCard>{createTenant.error instanceof Error ? createTenant.error.message : 'Tenant creation failed'}</ErrorCard></Show>
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="text-sm" aria-live="polite">
            <span class="flex items-center gap-2">
              <span class={cn('inline-block w-2 h-2 rounded-full', deployFieldsReady() ? 'bg-success' : 'bg-muted-foreground')} />
              {deployBlocker() ?? (deployNow() ? 'Ready to create the tenant and queue its deployment.' : 'Ready to create the tenant. Nothing is deployed yet.')}
            </span>
          </div>
          <div class="flex gap-2">
            <Button variant="ghost" size="sm" onClick={prevStep}>← Back</Button>
            <Button writes size="sm" onClick={() => createTenant.mutate()} disabled={createTenant.isPending || !deployFieldsReady()}>
              {createTenant.isPending && <Spinner />} {createTenant.isPending ? 'Creating…' : deployNow() ? 'Create & deploy' : 'Create tenant'}
            </Button>
          </div>
        </div>
      </div>
    </Show>
  </PageShell>
}
