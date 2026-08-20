import { For, Show, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { api } from '../lib/api'
import type { RegionalProfile } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'

type Preset = 'PL' | 'DE' | 'CZ' | 'US'
const presets: Record<Preset, RegionalProfile> = {
  PL: { countryCode:'PL', region:'eu', locale:'pl-PL', timezone:'Europe/Warsaw', currency:'PLN', dateFormat:'dmy', numberFormat:'comma_decimal', dataRegion:'eu' },
  DE: { countryCode:'DE', region:'eu', locale:'de-DE', timezone:'Europe/Berlin', currency:'EUR', dateFormat:'dmy', numberFormat:'comma_decimal', dataRegion:'eu' },
  CZ: { countryCode:'CZ', region:'eu', locale:'cs-CZ', timezone:'Europe/Prague', currency:'CZK', dateFormat:'dmy', numberFormat:'comma_decimal', dataRegion:'eu' },
  // The US spans multiple time zones. Never hide a New York assumption here.
  US: { countryCode:'US', region:'us', locale:'en-US', timezone:'', currency:'USD', dateFormat:'mdy', numberFormat:'dot_decimal', dataRegion:'us' },
}
const freshProfile = () => ({ ...presets.PL })

export function TenantsPage() {
  const queryClient = useQueryClient()
  const tenants = useQuery(() => ({ queryKey: ['tenants'], queryFn: api.tenants }))
  const overview = useQuery(() => ({ queryKey: ['overview'], queryFn: api.overview }))
  const [creating, setCreating] = createSignal(false)
  const [slug, setSlug] = createSignal('')
  const [name, setName] = createSignal('')
  const [crowdrelayBaseUrl, setCrowdrelayBaseUrl] = createSignal('')
  const [signalBaseUrl, setSignalBaseUrl] = createSignal('')
  const [profile, setProfile] = createSignal<RegionalProfile>(freshProfile())
  const [desiredVersion, setDesiredVersion] = createSignal('')
  const [deployNow, setDeployNow] = createSignal(true)
  const [notice, setNotice] = createSignal<string | null>(null)

  const applyPreset = (preset: Preset) => setProfile({ ...presets[preset] })
  const setRegional = <K extends keyof RegionalProfile>(key: K, value: RegionalProfile[K]) =>
    setProfile(current => ({ ...current, [key]: value }))
  const resetForm = () => {
    setSlug(''); setName(''); setCrowdrelayBaseUrl(''); setSignalBaseUrl('')
    setProfile(freshProfile()); setDesiredVersion(''); setDeployNow(true)
  }

  const createTenant = useMutation(() => ({
    mutationFn: () => api.createTenant({
      slug: slug(), displayName: name(),
      crowdrelayBaseUrl: crowdrelayBaseUrl() || undefined,
      signalBaseUrl: signalBaseUrl() || undefined,
      defaultCountryCode: profile().countryCode,
      regionalProfile: profile(),
      deployCrowdrelay: deployNow(),
      desiredVersion: deployNow() ? desiredVersion() || undefined : undefined,
    }),
    onSuccess: async (tenant) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenants'] }),
        queryClient.invalidateQueries({ queryKey: ['overview'] }),
      ])
      setCreating(false)
      setNotice(deployNow()
        ? `${tenant.displayName} created. Regional profile is persisted and CrowdRelay deployment is queued atomically.`
        : `${tenant.displayName} created without deployment.`)
      resetForm()
    },
  }))

  const regionalReady = () => profile().countryCode.length === 2
    && profile().locale.trim().length >= 4
    && profile().timezone.includes('/')
    && profile().currency.length === 3
  const deployFieldsReady = () => !deployNow() || (
    overview.data?.provisionerConfigured === true
    && crowdrelayBaseUrl().startsWith('https://')
    && signalBaseUrl().startsWith('https://')
    && (desiredVersion().trim().length > 0 || Boolean(overview.data?.provisionerDefaultImageTag))
  )

  return <section class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">TENANT REGISTRY</span>
        <h1>Teams on the platform</h1>
        <p>Create an isolated CrowdRelay + Signal tenant with an explicit regional profile. Browser locale/IP never silently decides currency, timezone or data residency.</p>
      </div>
      <button onClick={() => { setNotice(null); setCreating(true) }}>+ New tenant</button>
    </div>

    <Show when={notice()}>{message => <div class="notice-card">{message()}</div>}</Show>
    <Show when={tenants.error || overview.error}><div class="error-card" role="alert">{tenants.error instanceof Error ? tenants.error.message : overview.error instanceof Error ? overview.error.message : 'Control Plane data could not be loaded'}</div></Show>
    <Show when={creating()}>
      <form class="tenant-create-form" onSubmit={(event) => { event.preventDefault(); createTenant.mutate() }}>
        <div class="form-section-head"><div><span class="eyebrow">NEW TENANT</span><h2>Identity + region</h2></div><StatusBadge status={overview.data?.provisionerConfigured ? 'Provisioner connected' : 'Provisioner token not configured'} tone={overview.data?.provisionerConfigured ? 'good' : 'warn'} /></div>
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
          <label>CrowdRelay API base URL<input value={crowdrelayBaseUrl()} onInput={(e) => setCrowdrelayBaseUrl(e.currentTarget.value)} placeholder="https://api.future-metal.example" /></label>
          <label>Signal / public site URL<input value={signalBaseUrl()} onInput={(e) => setSignalBaseUrl(e.currentTarget.value)} placeholder="https://future-metal.example" /></label>
          <label>Release SHA <small>optional if server default is configured</small><input value={desiredVersion()} onInput={(e) => setDesiredVersion(e.currentTarget.value)} placeholder={overview.data?.provisionerDefaultImageTag ?? 'sha-<40-char CrowdRelay commit>'} /></label>
        </div>
        <label class="check-row"><input type="checkbox" checked={deployNow()} onChange={(e) => setDeployNow(e.currentTarget.checked)} /><span><strong>Deploy isolated CrowdRelay instance now</strong><small>Only an agent for the selected data region may claim this schema-v4 job.</small></span></label>
        <Show when={createTenant.error}><div class="error-card" role="alert">{createTenant.error instanceof Error ? createTenant.error.message : 'Tenant creation failed'}</div></Show>
        <div class="form-actions right"><button type="button" class="ghost" onClick={() => { setCreating(false); resetForm() }}>Cancel</button><button type="submit" disabled={createTenant.isPending || slug().length < 2 || name().length < 2 || !regionalReady() || !deployFieldsReady()}>{createTenant.isPending ? 'Creating…' : deployNow() ? 'Create & deploy' : 'Create tenant'}</button></div>
      </form>
    </Show>

    <div class="tenant-list"><For each={tenants.data?.items ?? []}>{tenant =>
      <Link to="/tenants/$slug" params={{ slug: tenant.slug }} class="tenant-row large">
        <div><strong>{tenant.displayName}</strong><small>{tenant.slug} · {tenant.workspaceId ?? 'workspace pending'} · {tenant.regionalProfile ? `${tenant.regionalProfile.locale} · ${tenant.regionalProfile.timezone} · ${tenant.regionalProfile.dataRegion.toUpperCase()}` : 'regional profile unclassified'}</small></div>
        <div class="row-health"><StatusBadge status={tenant.status} tone={tenant.status === 'active' ? 'good' : tenant.status === 'suspended' ? 'bad' : 'warn'} /><StatusBadge status={tenant.runtimeHealth} tone={tenant.runtimeHealth === 'healthy' ? 'good' : tenant.runtimeHealth === 'degraded' ? 'bad' : tenant.runtimeHealth === 'stale' ? 'warn' : 'muted'} /><StatusBadge status={tenant.regionalProfile ? `${tenant.regionalProfile.dataRegion.toUpperCase()} region` : 'unclassified'} tone={tenant.regionalProfile ? 'good' : 'warn'} /><StatusBadge status={tenant.brandingPalette ? 'Custom palette' : 'Product defaults'} /></div>
      </Link>}
    </For></div>
  </section>
}
