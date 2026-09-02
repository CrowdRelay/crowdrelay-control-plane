import { For, Show, createSignal, createMemo } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { useNavigate } from '@tanstack/solid-router'
import { api } from '../lib/api'
import type { RegionalProfile } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'

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
type FanbaseSource = 'discord' | 'facebook_group' | 'youtube' | 'forum' | 'reddit'

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
]

const fanbaseSources: { value: FanbaseSource; label: string; description: string }[] = [
  { value: 'discord', label: 'Discord servers', description: 'Discover Discord communities via Disboard.org public API.' },
  { value: 'facebook_group', label: 'Facebook Groups', description: 'Discover Facebook Groups via Graph API.' },
  { value: 'youtube', label: 'YouTube channels', description: 'Discover YouTube channels via Data API v3.' },
  { value: 'forum', label: 'Forums', description: 'Discover music forums via web search.' },
  { value: 'reddit', label: 'Reddit (post-only)', description: 'Reddit discovery is already integrated. Posting only — scraping is broken.' },
]

export function TenantWizardPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const overview = useQuery(() => ({ queryKey: ['overview'], queryFn: api.overview, reconcile: 'id' }))

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

  const step1Ready = () => slug().length >= 2 && name().length >= 2 && regionalReady()
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

  return <section class="page wizard-page">
    <div class="page-head">
      <div>
        <span class="eyebrow">ONBOARDING WIZARD</span>
        <h1>New tenant</h1>
        <p>Configure identity, products, growth goal, and fanbase sources. The brain adapts its strategy to the selected goal.</p>
      </div>
    </div>

    <div class="wizard-steps">
      <div class="wizard-step-indicator" classList={{ active: step() >= 1, current: step() === 1 }}>1. Identity + Region</div>
      <div class="wizard-step-indicator" classList={{ active: step() >= 2, current: step() === 2 }}>2. Products</div>
      <div class="wizard-step-indicator" classList={{ active: step() >= 3, current: step() === 3 }}>3. Goal</div>
      <div class="wizard-step-indicator" classList={{ active: step() >= 4, current: step() === 4 }}>4. Fanbase Sources</div>
      <div class="wizard-step-indicator" classList={{ active: step() >= 5, current: step() === 5 }}>5. Deploy</div>
    </div>

    <Show when={step() === 1}>
      <div class="wizard-card">
        <div class="form-section-head"><div><span class="eyebrow">STEP 1</span><h2>Identity + region</h2></div><StatusBadge status={overview.data?.provisionerConfigured ? 'Provisioner connected' : 'Provisioner token not configured'} tone={overview.data?.provisionerConfigured ? 'good' : 'warn'} /></div>
        <div class="form-grid">
          <label>Slug<input value={slug()} onInput={(e) => setSlug(e.currentTarget.value.toLowerCase())} placeholder="future-metal" autocomplete="off" /></label>
          <label>Display name<input value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="Future Metal" /></label>
          <label>Regional preset<select onChange={e=>applyPreset(e.currentTarget.value as Preset)}><option value="PL">Poland</option><option value="DE">Germany</option><option value="CZ">Czechia</option><option value="US">United States</option></select><small>Preset fills persisted fields; runtime never infers from it.</small></label>
          <label>Country<input maxlength="2" value={profile().countryCode} onInput={e=>setRegional('countryCode',e.currentTarget.value.toUpperCase())}/></label>
          <label>Locale<input value={profile().locale} onInput={e=>setRegional('locale',e.currentTarget.value)} placeholder="de-DE"/></label>
          <label>Timezone<input value={profile().timezone} onInput={e=>setRegional('timezone',e.currentTarget.value)} placeholder={profile().countryCode === 'US' ? 'America/Chicago (choose explicitly)' : 'Europe/Berlin'}/><small>{profile().countryCode === 'US' ? 'Required: US preset intentionally has no hidden timezone default.' : 'Explicit IANA timezone.'}</small></label>
          <label>Currency<input maxlength="3" value={profile().currency} onInput={e=>setRegional('currency',e.currentTarget.value.toUpperCase())}/></label>
          <label>Market region<select value={profile().region} onChange={e=>setRegional('region',e.currentTarget.value as 'eu'|'us')}><option value="eu">EU</option><option value="us">US</option></select></label>
          <label>Data residency<select value={profile().dataRegion} onChange={e=>setRegional('dataRegion',e.currentTarget.value as 'eu'|'us')}><option value="eu">EU</option><option value="us">US</option></select><small>Persisted and enforced by the regional provisioner pool.</small></label>
          <label>Date format<select value={profile().dateFormat} onChange={e=>setRegional('dateFormat',e.currentTarget.value as RegionalProfile['dateFormat'])}><option value="dmy">DD/MM/YYYY</option><option value="mdy">MM/DD/YYYY</option><option value="ymd">YYYY-MM-DD</option></select></label>
          <label>Number format<select value={profile().numberFormat} onChange={e=>setRegional('numberFormat',e.currentTarget.value as RegionalProfile['numberFormat'])}><option value="comma_decimal">1 234,56</option><option value="dot_decimal">1,234.56</option></select></label>
        </div>
        <div class="form-section-head"><div><span class="eyebrow">TENANT OPERATOR</span><h2>First account for the team</h2></div></div>
        <div class="form-grid">
          <label>Operator username<input value={opUsername()} onInput={(e) => setOpUsername(e.currentTarget.value.toLowerCase())} placeholder="future-metal-op" autocomplete="off" /><small>Optional. Sees only this tenant; leave blank to skip.</small></label>
          <label>Operator password<input type="password" value={opPassword()} onInput={(e) => setOpPassword(e.currentTarget.value)} placeholder="min 12 characters" autocomplete="new-password" /><small>Handed to the team once — hashed with argon2id, never shown again.</small></label>
        </div>
        <div class="form-actions right">
          <button class="ghost" onClick={() => navigate({ to: '/tenants' })}>Cancel</button>
          <button onClick={nextStep} disabled={!step1Ready() || !operatorFieldsReady()}>Next: Products →</button>
        </div>
      </div>
    </Show>

    <Show when={step() === 2}>
      <div class="wizard-card">
        <div class="form-section-head"><div><span class="eyebrow">STEP 2</span><h2>Products</h2></div></div>
        <p class="wizard-intro">Choose which products to enable for this tenant. Each product can be toggled independently.</p>
        <div class="product-cards">
          <label class="product-card" classList={{ selected: signalEnabled() }}>
            <input type="checkbox" checked={signalEnabled()} onChange={(e) => setSignalEnabled(e.currentTarget.checked)} />
            <div class="product-card-body">
              <strong>Signal mobile app</strong>
              <small>Push notifications, fan engagement, and event alerts. The brain's signal-inviter worker is only dispatched when this is enabled.</small>
            </div>
          </label>
          <label class="product-card" classList={{ selected: synesthesiaEnabled() }}>
            <input type="checkbox" checked={synesthesiaEnabled()} onChange={(e) => setSynesthesiaEnabled(e.currentTarget.checked)} />
            <div class="product-card-body">
              <strong>Synesthesia</strong>
              <small>Interactive album experience with leaderboard and game mechanics. Originally a Virya-exclusive product.</small>
            </div>
          </label>
          <label class="product-card" classList={{ selected: areaEnabled() }}>
            <input type="checkbox" checked={areaEnabled()} onChange={(e) => setAreaEnabled(e.currentTarget.checked)} />
            <div class="product-card-body">
              <strong>AREA game</strong>
              <small>Location-based fan engagement with drops, challenges, and claims.</small>
            </div>
          </label>
        </div>
        <Show when={!signalEnabled()}>
          <div class="notice-card">Signal is disabled. The brain goal step will not offer "Signal fans" as a north star option. Signal base URL is not required for deployment.</div>
        </Show>
        <Show when={signalEnabled() || synesthesiaEnabled()}>
          <div class="form-section-head"><div><span class="eyebrow">GOOGLE PLAY</span><h2>Play Store URLs (optional)</h2></div></div>
          <p class="wizard-intro">Set the Google Play Store URL for each enabled mobile app. Leave blank if the app is not yet published — you can add it later from the tenant page.</p>
          <div class="form-grid">
            <Show when={signalEnabled()}>
              <label>Signal Play Store URL<input value={signalPlayStoreUrl()} onInput={(e) => setSignalPlayStoreUrl(e.currentTarget.value)} placeholder={`https://play.google.com/store/apps/details?id=music.${slug() || 'tenant'}.signal`} /></label>
            </Show>
            <Show when={synesthesiaEnabled()}>
              <label>Synesthesia Play Store URL<input value={synesthesiaPlayStoreUrl()} onInput={(e) => setSynesthesiaPlayStoreUrl(e.currentTarget.value)} placeholder={`https://play.google.com/store/apps/details?id=music.${slug() || 'tenant'}.synesthesia`} /></label>
            </Show>
          </div>
        </Show>
        <div class="form-actions right">
          <button class="ghost" onClick={prevStep}>← Back</button>
          <button onClick={nextStep} disabled={!step2Ready()}>Next: Goal →</button>
        </div>
      </div>
    </Show>

    <Show when={step() === 3}>
      <div class="wizard-card">
        <div class="form-section-head"><div><span class="eyebrow">STEP 3</span><h2>Growth goal</h2></div></div>
        <p class="wizard-intro">The brain optimizes its deterministic strategy around this metric. Fan aggregation is always active regardless of this choice.</p>
        <div class="goal-cards">
          <For each={availableNorthStars()}>{ns =>
            <label class="goal-card" classList={{ selected: northStar() === ns.value }}>
              <input type="radio" name="northstar" value={ns.value} checked={northStar() === ns.value} onChange={() => setNorthStar(ns.value)} />
              <div class="goal-card-body">
                <strong>{ns.label}</strong>
                <small>{ns.description}</small>
              </div>
            </label>
          }</For>
        </div>
        <div class="form-actions right">
          <button class="ghost" onClick={prevStep}>← Back</button>
          <button onClick={nextStep} disabled={!step3Ready()}>Next: Fanbase Sources →</button>
        </div>
      </div>
    </Show>

    <Show when={step() === 4}>
      <div class="wizard-card">
        <div class="form-section-head"><div><span class="eyebrow">STEP 4</span><h2>Fanbase sources</h2></div></div>
        <p class="wizard-intro">Select which platforms the discovery worker should search for fan communities. These are upserted into the audience graph.</p>
        <div class="source-cards">
          <For each={fanbaseSources}>{src =>
            <label class="source-card" classList={{ selected: selectedSources().includes(src.value) }}>
              <input type="checkbox" checked={selectedSources().includes(src.value)} onChange={() => toggleSource(src.value)} />
              <div class="source-card-body">
                <strong>{src.label}</strong>
                <small>{src.description}</small>
              </div>
            </label>
          }</For>
        </div>
        <div class="form-actions right">
          <button class="ghost" onClick={prevStep}>← Back</button>
          <button onClick={nextStep} disabled={!step4Ready()}>Next: Deploy →</button>
        </div>
      </div>
    </Show>

    <Show when={step() === 5}>
      <div class="wizard-card">
        <div class="form-section-head"><div><span class="eyebrow">STEP 5</span><h2>Review + deploy</h2></div></div>
        <div class="wizard-summary">
          <div class="summary-row"><span>Slug</span><strong>{slug()}</strong></div>
          <div class="summary-row"><span>Display name</span><strong>{name()}</strong></div>
          <div class="summary-row"><span>Region</span><strong>{profile().locale} · {profile().timezone} · {profile().dataRegion.toUpperCase()}</strong></div>
          <div class="summary-row"><span>Signal</span><strong classList={{ on: signalEnabled(), off: !signalEnabled() }}>{signalEnabled() ? 'Enabled' : 'Disabled'}</strong></div>
          <div class="summary-row"><span>Synesthesia</span><strong classList={{ on: synesthesiaEnabled(), off: !synesthesiaEnabled() }}>{synesthesiaEnabled() ? 'Enabled' : 'Disabled'}</strong></div>
          <div class="summary-row"><span>AREA game</span><strong classList={{ on: areaEnabled(), off: !areaEnabled() }}>{areaEnabled() ? 'Enabled' : 'Disabled'}</strong></div>
          <Show when={signalEnabled() && signalPlayStoreUrl().trim()}>
            <div class="summary-row"><span>Signal Play URL</span><strong>{signalPlayStoreUrl().trim()}</strong></div>
          </Show>
          <Show when={synesthesiaEnabled() && synesthesiaPlayStoreUrl().trim()}>
            <div class="summary-row"><span>Synesthesia Play URL</span><strong>{synesthesiaPlayStoreUrl().trim()}</strong></div>
          </Show>
          <div class="summary-row"><span>Brain goal</span><strong>{northStars.find(n => n.value === effectiveNorthStar())?.label ?? effectiveNorthStar()}</strong></div>
          <div class="summary-row"><span>Fanbase sources</span><strong>{selectedSources().length > 0 ? selectedSources().join(', ') : 'None selected'}</strong></div>
          <Show when={deployNow()}>
            <div class="summary-row"><span>CrowdRelay URL</span><strong>{crowdrelayBaseUrl() || 'not set'}</strong></div>
            <Show when={signalEnabled()}>
              <div class="summary-row"><span>Signal URL</span><strong>{signalBaseUrl() || 'not set'}</strong></div>
            </Show>
            <div class="summary-row"><span>Release SHA</span><strong>{desiredVersion() || overview.data?.provisionerDefaultImageTag || 'server default'}</strong></div>
          </Show>
        </div>

        <Show when={deployNow()}>
          <div class="form-section-head"><div><span class="eyebrow">DEPLOYMENT</span><h2>Deploy URLs</h2></div></div>
          <div class="form-grid">
            <label>CrowdRelay API base URL<input value={crowdrelayBaseUrl()} onInput={(e) => setCrowdrelayBaseUrl(e.currentTarget.value)} placeholder="https://api.future-metal.example" /></label>
            <Show when={signalEnabled()}>
              <label>Signal / public site URL<input value={signalBaseUrl()} onInput={(e) => setSignalBaseUrl(e.currentTarget.value)} placeholder="https://future-metal.example" /></label>
            </Show>
            <label>Release SHA <small>optional if server default is configured</small><input value={desiredVersion()} onInput={(e) => setDesiredVersion(e.currentTarget.value)} placeholder={overview.data?.provisionerDefaultImageTag ?? 'sha-<40-char CrowdRelay commit>'} /></label>
          </div>
          <label class="check-row"><input type="checkbox" checked={deployNow()} onChange={(e) => setDeployNow(e.currentTarget.checked)} /><span><strong>Deploy isolated CrowdRelay instance now</strong><small>Only an agent for the selected data region may claim this schema-v4 job.</small></span></label>
        </Show>

        <Show when={createTenant.error}><div class="error-card" role="alert">{createTenant.error instanceof Error ? createTenant.error.message : 'Tenant creation failed'}</div></Show>
        <div class="form-actions right">
          <button class="ghost" onClick={prevStep}>← Back</button>
          <button onClick={() => createTenant.mutate()} disabled={createTenant.isPending || !deployFieldsReady()}>
            {createTenant.isPending ? 'Creating…' : deployNow() ? 'Create & deploy' : 'Create tenant'}
          </button>
        </div>
      </div>
    </Show>
  </section>
}
