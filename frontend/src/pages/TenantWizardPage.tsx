import { For, Show, createSignal, createMemo } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { useNavigate } from '@tanstack/solid-router'
import { Checkbox as KobalteCheckbox } from '@kobalte/core/checkbox'
import { RadioGroup as KobalteRadioGroup } from '@kobalte/core/radio-group'
import { ArrowLeft, ArrowRight, Check, ChevronRight } from 'lucide-solid'
import { api } from '../lib/api'
import type { RegionalProfile } from '../lib/types'
import { cn } from '../lib/cn'
import { StatusBadge } from '../components/StatusBadge'
import { Spinner } from '../components/Spinner'
import { ErrorCard, PageShell, PanelTitle } from '../components/layout'
import { DashHeader, Pill } from '../components/ui/dash'
import { Button } from '../components/app/button'
import { Input } from '../components/ui/input'
import { NativeSelect } from '../components/ui/native-select'
import { Field, FieldGrid } from '../components/ui/field'
import { RadioGroup } from '../components/app/radio-group'

// Card-tile controls compose the Kobalte primitives directly — the vendored
// ui/checkbox label prop only carries a plain string. Control styling mirrors
// ui/checkbox.tsx + ui/radio-group.tsx so the tiles read identically.
const checkboxTileControl =
  'peer mt-1 h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
  'data-[checked]:bg-primary data-[checked]:text-primary-foreground'
const radioTileControl =
  'peer mt-1 aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
  'data-[checked]:bg-primary'

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
  | 'weighted_audience'
  | 'activated_fans_30d'
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

type Archetype = 'band' | 'roster' | 'label' | 'festival_org'

// What kind of tenant this is. The loop is identical across archetypes; what
// differs is the per-archetype config the brain reads — north star, what counts
// as a peer, which production events exist. Nothing consumes it yet: it is
// asked here so the second tenant's archetype is a value rather than a code
// change, and so a roster does not silently arrive as a band.
const archetypes: { value: Archetype; label: string; description: string }[] = [
  { value: 'band', label: 'Band', description: 'One act. Fans, shows, releases. The default, and what every tenant created before this field was a band.' },
  { value: 'roster', label: 'Roster or management', description: 'Several acts under one manager. Effort is shared across them, and what one act learns is available to the others.' },
  { value: 'label', label: 'Label', description: 'A catalogue and the acts on it. Sales and subscribers matter as much as followers.' },
  { value: 'festival_org', label: 'Festival organiser', description: 'An event rather than an act. Lineups, ticket buyers, and people who come back next year.' },
]

const northStars: { value: NorthStar; label: string; description: string; requiresSignal?: boolean }[] = [
  { value: 'activated_fans_30d', label: 'Activated fans', description: 'Optimize the canonical activation cohort — people who signed up in the last 30 days, still consent, and did something meaningful within 30 days of signup.' },
  { value: 'total_audience', label: 'Every platform, added up', description: 'Optimize the whole connected portfolio — every platform audience summed, including Signal. Cross-platform identities are not deduplicated, so one person may contribute on more than one platform.' },
  { value: 'weighted_audience', label: 'Everything, by what it is worth', description: 'Optimize the same cross-platform audience, but not equally: a fan you can reach counts for more than a follower you cannot, and a paying supporter more than a passing view. Reported in Signal-fan equivalents; it is still not a unique-person count.' },
  { value: 'signal_installs', label: 'Fans with active Signal push', description: 'Optimize distinct fans linked to an active Signal push endpoint. This is the legacy signal_installs metric, not the raw app-download count.', requiresSignal: true },
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

// The work a crew member can be routed. Mirrors `TeamSkill::as_str` in
// crowdrelay-domain — the parity gate
// `scripts/test_team_skills_vocabulary_parity.py` keeps the two aligned.
const teamSkills: { value: string; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'operations', label: 'Operations' },
  { value: 'booking', label: 'Booking' },
  { value: 'approval', label: 'Approvals' },
  { value: 'technical', label: 'Technical' },
  { value: 'visual', label: 'Visual' },
  { value: 'video', label: 'Video' },
  { value: 'photography', label: 'Photography' },
  { value: 'social', label: 'Social' },
  { value: 'english_copy', label: 'English copy' },
  { value: 'polish_copy', label: 'Polish copy' },
  { value: 'people', label: 'People' },
]

type CrewDraft = { name: string; email: string; skills: string[] }


export function TenantWizardPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  // The wizard's one read: whether this plane can deploy, its default
  // release, and the North Star vocabulary the fleet admits.
  const wizard = useQuery(() => ({ queryKey: ['tenant-wizard'], queryFn: api.tenantWizard, staleTime: 30_000, refetchOnWindowFocus: false }))
  const overview = { get data() { return wizard.data }, get error() { return wizard.error } }

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
  const [archetype, setArchetype] = createSignal<Archetype>('band')
  const [northStar, setNorthStar] = createSignal<NorthStar>('activated_fans_30d')

  // Step 4: Fanbase sources
  const [selectedSources, setSelectedSources] = createSignal<FanbaseSource[]>([])

  // Step 5: Crew — elastic roster, however many members the tenant actually
  // has. Persisted on the tenant row and rendered into
  // CROWDRELAY_TEAM_MEMBERS_JSON on every deploy; an empty crew keeps the
  // tenant deployable but leaves Autopilot's human handoffs unrouted.
  const [crew, setCrew] = createSignal<CrewDraft[]>([])

  // Provider API keys (optional, collapsible — rendered inside the deploy step)
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

  const addCrewMember = () => setCrew(current => [...current, { name: '', email: '', skills: [] }])
  const removeCrewMember = (index: number) => setCrew(current => current.filter((_, i) => i !== index))
  const updateCrewMember = (index: number, patch: Partial<CrewDraft>) =>
    setCrew(current => current.map((member, i) => (i === index ? { ...member, ...patch } : member)))
  const toggleCrewSkill = (index: number, skill: string) =>
    setCrew(current => current.map((member, i) => (i === index
      ? { ...member, skills: member.skills.includes(skill) ? member.skills.filter(s => s !== skill) : [...member.skills, skill] }
      : member
    )))

  // Mirrors the API-side email grammar closely enough to catch the typos a
  // human makes; `team_members` validation is the authoritative check.
  const crewEmailOk = (value: string) => {
    const email = value.trim()
    if (email.length > 254 || !/^[\x21-\x7e]+$/.test(email)) return false
    const parts = email.split('@')
    const [local, domain] = parts
    if (parts.length !== 2 || !local || !domain) return false
    return local.length <= 64 && !local.startsWith('.') && !local.endsWith('.')
      && !local.includes('..') && domain.includes('.')
  }
  const crewMemberReady = (member: CrewDraft) => {
    const name = member.name.trim()
    return name.length > 0 && name.length <= 80 && crewEmailOk(member.email) && member.skills.length > 0
  }
  const step5Ready = () => crew().every(crewMemberReady)
  const step5Blocker = () => {
    const member = crew().find(member => !crewMemberReady(member))
    if (!member) return null
    const index = crew().indexOf(member) + 1
    if (!member.name.trim() || member.name.trim().length > 80)
      return `Crew member ${index} needs a name (1-80 characters).`
    if (!crewEmailOk(member.email)) return `Crew member ${index} needs a valid email — this is where handoff alerts go.`
    return `Crew member ${index} needs at least one skill — the brain routes work by skill.`
  }

  // The vocabulary the deployed fleet can parse. A goal the running image
  // cannot read is stored but silently falls back to signal_installs, so the
  // server reports what the fleet admits and the list below offers only that.
  // A failed fetch leaves the parity-gated local list — the create call's
  // validator is the last guard either way.
  const vocabulary = { get data() { return wizard.data?.northStars } }

  const offeredNorthStars = createMemo(() => {
    const options = vocabulary.data?.options
    if (!options || options.length === 0) return northStars
    const admitted = new Set(options.map(o => o.value))
    const filtered = northStars.filter(n => admitted.has(n.value))
    return filtered.length === 0 ? northStars : filtered
  })

  // When Signal is disabled, north star can't be signal_installs
  const availableNorthStars = createMemo(() => {
    const enabled = signalEnabled()
    return offeredNorthStars().filter(n => !n.requiresSignal || enabled)
  })

  const effectiveNorthStar = createMemo(() => {
    const ns = northStar()
    const offered = availableNorthStars()
    if (offered.some(n => n.value === ns)) return ns
    return (offered[0]?.value ?? 'activated_fans_30d') as NorthStar
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
      archetype: archetype(),
      northStarMetric: effectiveNorthStar(),
      fanbaseSources: selectedSources(),
      signalPlayStoreUrl: signalPlayStoreUrl().trim() || undefined,
      synesthesiaPlayStoreUrl: synesthesiaPlayStoreUrl().trim() || undefined,
      providerKeys: providerKeys(),
      teamMembers: crew().map(member => ({
        name: member.name.trim(),
        email: member.email.trim(),
        skills: member.skills,
      })),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenants'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant-wizard'] }),
      ])
      navigate({ to: '/tenants' })
    },
  }))

  const nextStep = () => {
    if (step() === 1 && step1Ready()) setStep(2)
    else if (step() === 2 && step2Ready()) setStep(3)
    else if (step() === 3 && step3Ready()) setStep(4)
    else if (step() === 4 && step4Ready()) setStep(5)
    else if (step() === 5 && step5Ready()) setStep(6)
  }
  const prevStep = () => { if (step() > 1) setStep(step() - 1) }

  const WIZARD_STEPS = ['Who', 'What it uses', 'The goal', 'Where fans are', 'Crew', 'Launch']

  return <PageShell>
    <DashHeader
      title="New tenant"
      subtitle="Who the act is, what it may use, where its fans are — then launch"
      back={{ label: 'Tenants', to: '/tenants' }}
    />

    <div class="mb-3 flex flex-wrap items-center gap-1.5">
      <For each={WIZARD_STEPS}>{(label, index) => (
        <Pill tone={step() === index() + 1 ? 'accent' : step() > index() + 1 ? 'good' : 'muted'}>{index() + 1} · {label}</Pill>
      )}</For>
    </div>

    <Show when={step() === 1}>
      <div class="rounded-xl border border-border bg-card px-4 py-3.5 space-y-4">
        <div class="flex items-center justify-between gap-2 flex-wrap"><div><PanelTitle>Identity + region</PanelTitle></div><Show when={overview.error}><StatusBadge status="Provisioner status unavailable" tone="bad" /></Show><Show when={!overview.error}><StatusBadge status={overview.data?.provisionerConfigured ? 'Provisioner connected' : 'Provisioner token not configured'} tone={overview.data?.provisionerConfigured ? 'good' : 'warn'} /></Show></div>
        <p class="text-sm text-muted-foreground leading-relaxed">Identity is permanent once the tenant exists; the regional block is what the runtime reads instead of guessing from a browser or an IP address.</p>
        <FieldGrid min="220px">
          <Field label="Slug" hint="Lowercase, used in URLs and API paths. It cannot be changed later."><Input value={slug()} onInput={(e) => setSlug(e.currentTarget.value.toLowerCase())} placeholder="future-metal" autocomplete="off" /></Field>
          <Field label="Display name" hint="The band or label as people write it. Shown across the console and in operator-facing alerts."><Input value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="Future Metal" /></Field>
          <Field label="Regional preset" hint="Fills the six fields below in one go. Nothing is inferred from it afterwards — edit any of them freely."><NativeSelect onChange={e=>applyPreset(e.currentTarget.value as Preset)}><option value="PL">Poland</option><option value="DE">Germany</option><option value="CZ">Czechia</option><option value="US">United States</option></NativeSelect></Field>
          <Field label="Country" hint="Two-letter ISO code, e.g. PL. The tenant's home market, not where the servers are."><Input maxlength="2" value={profile().countryCode} onInput={e=>setRegional('countryCode',e.currentTarget.value.toUpperCase())}/></Field>
          <Field label="Locale" hint="BCP-47 tag. Decides the language and formatting of fan-facing copy."><Input value={profile().locale} onInput={e=>setRegional('locale',e.currentTarget.value)} placeholder="de-DE"/></Field>
          <Field label="Timezone" hint={profile().countryCode === 'US' ? 'Required: US preset intentionally has no hidden timezone default.' : 'Explicit IANA timezone.'}><Input value={profile().timezone} onInput={e=>setRegional('timezone',e.currentTarget.value)} placeholder={profile().countryCode === 'US' ? 'America/Chicago (choose explicitly)' : 'Europe/Berlin'}/></Field>
          <Field label="Currency" hint="Three-letter ISO code, e.g. PLN. Ticket and merch amounts are stored and shown in it."><Input maxlength="3" value={profile().currency} onInput={e=>setRegional('currency',e.currentTarget.value.toUpperCase())}/></Field>
          <Field label="Market region" hint="Which market the growth strategy plays in. Separate from data residency below."><NativeSelect value={profile().region} onChange={e=>setRegional('region',e.currentTarget.value as 'eu'|'us')}><option value="eu">EU</option><option value="us">US</option></NativeSelect></Field>
          <Field label="Data residency" hint="Cannot be changed after deployment."><NativeSelect value={profile().dataRegion} onChange={e=>setRegional('dataRegion',e.currentTarget.value as 'eu'|'us')}><option value="eu">EU</option><option value="us">US</option></NativeSelect></Field>
          <Field label="Date format" hint="How dates are printed to fans and operators of this tenant."><NativeSelect value={profile().dateFormat} onChange={e=>setRegional('dateFormat',e.currentTarget.value as RegionalProfile['dateFormat'])}><option value="dmy">DD/MM/YYYY</option><option value="mdy">MM/DD/YYYY</option><option value="ymd">YYYY-MM-DD</option></NativeSelect></Field>
          <Field label="Number format" hint="Thousands and decimal separators for counts and prices."><NativeSelect value={profile().numberFormat} onChange={e=>setRegional('numberFormat',e.currentTarget.value as RegionalProfile['numberFormat'])}><option value="comma_decimal">1 234,56</option><option value="dot_decimal">1,234.56</option></NativeSelect></Field>
        </FieldGrid>
        <div class="flex items-center justify-between gap-2"><div><PanelTitle>First account for the team</PanelTitle></div></div>
        <p class="text-sm text-muted-foreground leading-relaxed">Optional. Creates one login scoped to this tenant so the band or their manager can work without a platform admin. You can add more later from the tenant page.</p>
        <FieldGrid min="220px">
          <Field label="Operator username" hint="Optional. Sees only this tenant; leave blank to skip."><Input value={opUsername()} onInput={(e) => setOpUsername(e.currentTarget.value.toLowerCase())} placeholder="future-metal-op" autocomplete="off" /></Field>
          <Field label="Operator password" hint="Handed to the team once — never shown again."><Input type="password" value={opPassword()} onInput={(e) => setOpPassword(e.currentTarget.value)} placeholder="min 12 characters" autocomplete="new-password" /></Field>
        </FieldGrid>
        {/* The Next button just went grey. Say which field is still holding
            it, in the order the form asks for them. */}
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="text-sm" aria-live="polite">
            <span class="flex items-center gap-2">
              <span class={cn('inline-block w-2 h-2 rounded-full', step1Ready() && operatorFieldsReady() ? 'bg-success-solid' : 'bg-muted-foreground')} />
              {step1Blocker() ?? 'Identity and region are complete.'}
            </span>
          </div>
          <div class="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/tenants' })}>Cancel</Button>
            <Button size="sm" onClick={nextStep} disabled={!step1Ready() || !operatorFieldsReady()}>Next: Products <ArrowRight aria-hidden="true" /></Button>
          </div>
        </div>
      </div>
    </Show>

    <Show when={step() === 2}>
      <div class="rounded-xl border border-border bg-card px-4 py-3.5 space-y-4">
        <div class="flex items-center justify-between gap-2"><div><PanelTitle>Products</PanelTitle></div></div>
        <p class="text-sm text-muted-foreground leading-relaxed">Choose which products to enable for this tenant. Each product can be toggled independently.</p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KobalteCheckbox checked={signalEnabled()} onChange={setSignalEnabled} class={cn('flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors', signalEnabled() ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-input')}>
            <KobalteCheckbox.Input class="sr-only" />
            <KobalteCheckbox.Control class={checkboxTileControl}>
              <KobalteCheckbox.Indicator class="flex items-center justify-center text-current"><Check class="h-3.5 w-3.5" /></KobalteCheckbox.Indicator>
            </KobalteCheckbox.Control>
            <div>
              <strong class="text-sm text-foreground">Signal mobile app</strong>
              <small class="block text-xs text-muted-foreground mt-1">Push notifications, fan engagement, and event alerts. The brain's signal-inviter worker is only dispatched when this is enabled.</small>
            </div>
          </KobalteCheckbox>
          <KobalteCheckbox checked={synesthesiaEnabled()} onChange={setSynesthesiaEnabled} class={cn('flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors', synesthesiaEnabled() ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-input')}>
            <KobalteCheckbox.Input class="sr-only" />
            <KobalteCheckbox.Control class={checkboxTileControl}>
              <KobalteCheckbox.Indicator class="flex items-center justify-center text-current"><Check class="h-3.5 w-3.5" /></KobalteCheckbox.Indicator>
            </KobalteCheckbox.Control>
            <div>
              <strong class="text-sm text-foreground">Synesthesia</strong>
              <small class="block text-xs text-muted-foreground mt-1">Interactive album experience with leaderboard and game mechanics. Originally a Virya-exclusive product.</small>
            </div>
          </KobalteCheckbox>
          <KobalteCheckbox checked={areaEnabled()} onChange={setAreaEnabled} class={cn('flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors', areaEnabled() ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-input')}>
            <KobalteCheckbox.Input class="sr-only" />
            <KobalteCheckbox.Control class={checkboxTileControl}>
              <KobalteCheckbox.Indicator class="flex items-center justify-center text-current"><Check class="h-3.5 w-3.5" /></KobalteCheckbox.Indicator>
            </KobalteCheckbox.Control>
            <div>
              <strong class="text-sm text-foreground">AREA game</strong>
              <small class="block text-xs text-muted-foreground mt-1">Location-based fan engagement with drops, challenges, and claims.</small>
            </div>
          </KobalteCheckbox>
        </div>
        <Show when={!signalEnabled()}>
          <div class="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">Signal is disabled. The brain goal step will not offer "Signal fans" as a north star option. Signal base URL is not required for deployment.</div>
        </Show>
        <Show when={signalEnabled() || synesthesiaEnabled()}>
          <div class="flex items-center justify-between gap-2"><div><PanelTitle>Play Store URLs (optional)</PanelTitle></div></div>
          <p class="text-sm text-muted-foreground leading-relaxed">Set the Google Play Store URL for each enabled mobile app. Leave blank if the app is not yet published — you can add it later from the tenant page.</p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Show when={signalEnabled()}>
              <label>Signal Play Store URL<Input value={signalPlayStoreUrl()} onInput={(e) => setSignalPlayStoreUrl(e.currentTarget.value)} placeholder={`https://play.google.com/store/apps/details?id=music.${slug() || 'tenant'}.signal`} /></label>
            </Show>
            <Show when={synesthesiaEnabled()}>
              <label>Synesthesia Play Store URL<Input value={synesthesiaPlayStoreUrl()} onInput={(e) => setSynesthesiaPlayStoreUrl(e.currentTarget.value)} placeholder={`https://play.google.com/store/apps/details?id=music.${slug() || 'tenant'}.synesthesia`} /></label>
            </Show>
          </div>
        </Show>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={prevStep}><ArrowLeft aria-hidden="true" /> Back</Button>
          <Button size="sm" onClick={nextStep} disabled={!step2Ready()}>Next: Goal <ArrowRight aria-hidden="true" /></Button>
        </div>
      </div>
    </Show>

    <Show when={step() === 3}>
      <div class="rounded-xl border border-border bg-card px-4 py-3.5 space-y-4">
        <div class="flex items-center justify-between gap-2"><div><PanelTitle>What this tenant is</PanelTitle></div></div>
        <p class="text-sm text-muted-foreground leading-relaxed">The machine runs the same loop for all of these. The archetype decides what it reads as a peer, a production event and a fan.</p>
        <RadioGroup value={archetype()} onChange={setArchetype} class="grid grid-cols-1 md:grid-cols-2 gap-3" aria-label="Tenant archetype">
          <For each={archetypes}>{arc =>
            <KobalteRadioGroup.Item value={arc.value} class={cn('flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors', archetype() === arc.value ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-input')}>
              <KobalteRadioGroup.ItemInput class="sr-only" />
              <KobalteRadioGroup.ItemControl class={radioTileControl}>
                <KobalteRadioGroup.ItemIndicator class="flex items-center justify-center"><div class="h-2 w-2 rounded-full bg-background" /></KobalteRadioGroup.ItemIndicator>
              </KobalteRadioGroup.ItemControl>
              <div>
                <strong class="text-sm text-foreground">{arc.label}</strong>
                <small class="block text-xs text-muted-foreground mt-1">{arc.description}</small>
              </div>
            </KobalteRadioGroup.Item>
          }</For>
        </RadioGroup>
        <div class="pt-2 border-t border-border">
          <PanelTitle>Growth goal</PanelTitle>
        </div>
        <p class="text-sm text-muted-foreground leading-relaxed">The brain optimizes its deterministic strategy around this metric. Fan aggregation is always active regardless of this choice.</p>
        <RadioGroup value={northStar()} onChange={setNorthStar} class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" aria-label="Growth goal">
          <For each={availableNorthStars()}>{ns =>
            <KobalteRadioGroup.Item value={ns.value} class={cn('flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors', northStar() === ns.value ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-input')}>
              <KobalteRadioGroup.ItemInput class="sr-only" />
              <KobalteRadioGroup.ItemControl class={radioTileControl}>
                <KobalteRadioGroup.ItemIndicator class="flex items-center justify-center"><div class="h-2 w-2 rounded-full bg-background" /></KobalteRadioGroup.ItemIndicator>
              </KobalteRadioGroup.ItemControl>
              <div>
                <strong class="text-sm text-foreground">{ns.label}</strong>
                <small class="block text-xs text-muted-foreground mt-1">{ns.description}</small>
              </div>
            </KobalteRadioGroup.Item>
          }</For>
        </RadioGroup>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={prevStep}><ArrowLeft aria-hidden="true" /> Back</Button>
          <Button size="sm" onClick={nextStep} disabled={!step3Ready()}>Next: Fanbase Sources <ArrowRight aria-hidden="true" /></Button>
        </div>
      </div>
    </Show>

    <Show when={step() === 4}>
      <div class="rounded-xl border border-border bg-card px-4 py-3.5 space-y-4">
        <div class="flex items-center justify-between gap-2"><div><PanelTitle>Fanbase sources</PanelTitle></div></div>
        <p class="text-sm text-muted-foreground leading-relaxed">Select which platforms the discovery worker should search for fan communities. These are upserted into the audience graph.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" role="group" aria-label="Fanbase sources">
          <For each={fanbaseSources}>{src =>
            <KobalteCheckbox checked={selectedSources().includes(src.value)} onChange={() => toggleSource(src.value)} class={cn('flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors', selectedSources().includes(src.value) ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-input')}>
              <KobalteCheckbox.Input class="sr-only" />
              <KobalteCheckbox.Control class={checkboxTileControl}>
                <KobalteCheckbox.Indicator class="flex items-center justify-center text-current"><Check class="h-3.5 w-3.5" /></KobalteCheckbox.Indicator>
              </KobalteCheckbox.Control>
              <div>
                <strong class="text-sm text-foreground">{src.label}</strong>
                <small class="block text-xs text-muted-foreground mt-1">{src.description}</small>
              </div>
            </KobalteCheckbox>
          }</For>
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={prevStep}><ArrowLeft aria-hidden="true" /> Back</Button>
          <Button size="sm" onClick={nextStep} disabled={!step4Ready()}>Next: Crew <ArrowRight aria-hidden="true" /></Button>
        </div>
      </div>
    </Show>

    <Show when={step() === 5}>
      <div class="rounded-xl border border-border bg-card px-4 py-3.5 space-y-4">
        <div class="flex items-center justify-between gap-2"><div><PanelTitle>Crew</PanelTitle></div></div>
        <p class="text-sm text-muted-foreground leading-relaxed">
          The people the brain can hand work to — approvals, booking calls, copy review. Add as many as the
          tenant actually has; there is no fixed team size. Each member needs at least one skill so the
          router knows what they can take. The roster ships with every deploy.
        </p>
        <For each={crew()}>{(member, index) =>
          <div class="rounded-lg border border-border bg-background p-4 space-y-3">
            <div class="flex items-center justify-between gap-2">
              <strong class="text-sm text-foreground">Member {index() + 1}</strong>
              <Button variant="ghost" size="sm" onClick={() => removeCrewMember(index())}>Remove</Button>
            </div>
            <FieldGrid min="200px">
              <Field label="Name"><Input value={member.name} onInput={(e) => updateCrewMember(index(), { name: e.currentTarget.value })} placeholder="Ada Ops" autocomplete="off" /></Field>
              <Field label="Email" hint="Handoff alerts and digests go here."><Input type="email" value={member.email} onInput={(e) => updateCrewMember(index(), { email: e.currentTarget.value })} placeholder="ada@band.example" autocomplete="off" /></Field>
            </FieldGrid>
            <div>
              <span class="block text-xs font-medium text-muted-foreground mb-2">Skills — what the brain may route to them</span>
              <div class="flex flex-wrap gap-2" role="group" aria-label={`Member ${index() + 1} skills`}>
                <For each={teamSkills}>{skill =>
                  <KobalteCheckbox
                    checked={member.skills.includes(skill.value)}
                    onChange={() => toggleCrewSkill(index(), skill.value)}
                    class={cn(
                      'rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors',
                      'data-[checked]:border-primary data-[checked]:bg-primary/10 data-[checked]:text-primary',
                      'data-[unchecked]:border-border data-[unchecked]:bg-background data-[unchecked]:text-muted-foreground data-[unchecked]:hover:border-input',
                    )}
                  >
                    <KobalteCheckbox.Input class="sr-only" />
                    <KobalteCheckbox.Label>{skill.label}</KobalteCheckbox.Label>
                  </KobalteCheckbox>
                }</For>
              </div>
            </div>
          </div>
        }</For>
        <Button variant="outline" size="sm" onClick={addCrewMember}>+ Add crew member</Button>
        <Show when={crew().length === 0}>
          <p class="text-xs text-muted-foreground">
            No crew yet — the tenant deploys either way, but Autopilot's human handoffs stay unrouted
            until somebody is on the roster.
          </p>
        </Show>
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="text-sm text-muted-foreground" aria-live="polite">{step5Blocker()}</div>
          <div class="flex gap-2">
            <Button variant="ghost" size="sm" onClick={prevStep}><ArrowLeft aria-hidden="true" /> Back</Button>
            <Button size="sm" onClick={nextStep} disabled={!step5Ready()}>Next: Deploy <ArrowRight aria-hidden="true" /></Button>
          </div>
        </div>
      </div>
    </Show>

    <Show when={step() === 6}>
      <div class="rounded-xl border border-border bg-card px-4 py-3.5 space-y-4">
        <div class="flex items-center justify-between gap-2"><div><PanelTitle>Review + deploy</PanelTitle></div></div>
        <div class="rounded-lg border border-border bg-background p-4 space-y-2">
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Slug</span><strong class="text-sm text-foreground">{slug()}</strong></div>
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Display name</span><strong class="text-sm text-foreground">{name()}</strong></div>
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Region</span><strong class="text-sm text-foreground">{profile().locale} · {profile().timezone} · {profile().dataRegion.toUpperCase()}</strong></div>
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Signal</span><strong class={cn('text-sm', signalEnabled() ? 'text-success-foreground' : 'text-muted-foreground')}>{signalEnabled() ? 'Enabled' : 'Disabled'}</strong></div>
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Synesthesia</span><strong class={cn('text-sm', synesthesiaEnabled() ? 'text-success-foreground' : 'text-muted-foreground')}>{synesthesiaEnabled() ? 'Enabled' : 'Disabled'}</strong></div>
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">AREA game</span><strong class={cn('text-sm', areaEnabled() ? 'text-success-foreground' : 'text-muted-foreground')}>{areaEnabled() ? 'Enabled' : 'Disabled'}</strong></div>
          <Show when={signalEnabled() && signalPlayStoreUrl().trim()}>
            <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Signal Play URL</span><strong class="text-sm text-foreground break-all">{signalPlayStoreUrl().trim()}</strong></div>
          </Show>
          <Show when={synesthesiaEnabled() && synesthesiaPlayStoreUrl().trim()}>
            <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Synesthesia Play URL</span><strong class="text-sm text-foreground break-all">{synesthesiaPlayStoreUrl().trim()}</strong></div>
          </Show>
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Tenant type</span><strong class="text-sm text-foreground">{archetypes.find(a => a.value === archetype())?.label ?? archetype()}</strong></div>
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Brain goal</span><strong class="text-sm text-foreground">{northStars.find(n => n.value === effectiveNorthStar())?.label ?? effectiveNorthStar()}</strong></div>
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Fanbase sources</span><strong class="text-sm text-foreground">{selectedSources().length > 0 ? selectedSources().join(', ') : 'None selected'}</strong></div>
          <div class="flex items-center justify-between gap-3 py-2 border-b border-border"><span class="text-sm text-muted-foreground">Crew</span><strong class="text-sm text-foreground">{crew().length > 0 ? crew().map(m => m.name.trim()).join(', ') : 'None declared'}</strong></div>
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
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label>CrowdRelay API base URL<Input value={crowdrelayBaseUrl()} onInput={(e) => setCrowdrelayBaseUrl(e.currentTarget.value)} placeholder="https://api.future-metal.example" /></label>
            <Show when={signalEnabled()}>
              <label>Signal / public site URL<Input value={signalBaseUrl()} onInput={(e) => setSignalBaseUrl(e.currentTarget.value)} placeholder="https://future-metal.example" /></label>
            </Show>
            <label>Release SHA <small>optional if server default is configured</small><Input value={desiredVersion()} onInput={(e) => setDesiredVersion(e.currentTarget.value)} placeholder={overview.data?.provisionerDefaultImageTag ?? 'sha-<40-char CrowdRelay commit>'} /></label>
          </div>

          {/* Optional provider API keys — collapsible, only shown when deploying */}
          <Button variant="ghost" size="sm" onClick={() => setShowProviderKeys(!showProviderKeys())}>
            <ChevronRight class={cn('size-4 transition-transform', showProviderKeys() && 'rotate-90')} aria-hidden="true" /> Optional: Provider API keys
          </Button>
          <Show when={showProviderKeys()}>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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

          <KobalteCheckbox checked={deployNow()} onChange={setDeployNow} class="flex items-start gap-3 cursor-pointer">
            <KobalteCheckbox.Input class="sr-only" />
            <KobalteCheckbox.Control class={checkboxTileControl}>
              <KobalteCheckbox.Indicator class="flex items-center justify-center text-current"><Check class="h-3.5 w-3.5" /></KobalteCheckbox.Indicator>
            </KobalteCheckbox.Control>
            <span><strong>Deploy isolated CrowdRelay instance now</strong><small class="block text-muted-foreground">Only an agent for the selected data region may claim this schema-v4 job.</small></span>
          </KobalteCheckbox>
        </Show>

        <Show when={createTenant.error}><ErrorCard title="Couldn't create the tenant" error={createTenant.error} /></Show>
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="text-sm" aria-live="polite">
            <span class="flex items-center gap-2">
              <span class={cn('inline-block w-2 h-2 rounded-full', deployFieldsReady() ? 'bg-success-solid' : 'bg-muted-foreground')} />
              {deployBlocker() ?? (deployNow() ? 'Ready to create the tenant and queue its deployment.' : 'Ready to create the tenant. Nothing is deployed yet.')}
            </span>
          </div>
          <div class="flex gap-2">
            <Button variant="ghost" size="sm" onClick={prevStep}><ArrowLeft aria-hidden="true" /> Back</Button>
            <Button writes size="sm" onClick={() => createTenant.mutate()} disabled={createTenant.isPending || !deployFieldsReady()}>
              {createTenant.isPending && <Spinner />} {createTenant.isPending ? 'Creating…' : deployNow() ? 'Create & deploy' : 'Create tenant'}
            </Button>
          </div>
        </div>
      </div>
    </Show>
  </PageShell>
}
