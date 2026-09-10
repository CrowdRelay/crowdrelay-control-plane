import { For, Show, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { SkeletonRows } from '../components/Skeleton'
import type { RegionalProfile } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { Spinner } from '../components/Spinner'
import { PageShell, PageHeader, ErrorCard } from '../components/layout'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { NativeSelect } from '../components/ui/native-select'
import { buttonVariants } from '../components/ui/button'

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
  const tenants = useQuery(() => ({ queryKey: ['tenants'], queryFn: api.tenants, reconcile: 'id', staleTime: 15_000, refetchOnWindowFocus: false }))
  const overview = useQuery(() => ({ queryKey: ['overview'], queryFn: api.overview, reconcile: 'id', staleTime: 30_000, refetchOnWindowFocus: false }))
  const isPlatformLevel = () => authState.isPlatformLevel()
  const isAdmin = () => authState.isAdmin()
  const [creating, setCreating] = createSignal(false)
  const [slug, setSlug] = createSignal('')
  const [name, setName] = createSignal('')
  const [crowdrelayBaseUrl, setCrowdrelayBaseUrl] = createSignal('')
  const [signalBaseUrl, setSignalBaseUrl] = createSignal('')
  const [profile, setProfile] = createSignal<RegionalProfile>(freshProfile())
  const [desiredVersion, setDesiredVersion] = createSignal('')
  const [deployNow, setDeployNow] = createSignal(true)
  const [opUsername, setOpUsername] = createSignal('')
  const [opPassword, setOpPassword] = createSignal('')
  const [notice, setNotice] = createSignal<string | null>(null)

  const applyPreset = (preset: Preset) => setProfile({ ...presets[preset] })
  const setRegional = <K extends keyof RegionalProfile>(key: K, value: RegionalProfile[K]) =>
    setProfile(current => ({ ...current, [key]: value }))
  const resetForm = () => {
    setSlug(''); setName(''); setCrowdrelayBaseUrl(''); setSignalBaseUrl('')
    setProfile(freshProfile()); setDesiredVersion(''); setDeployNow(true)
    setOpUsername(''); setOpPassword('')
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
      initialOperator: opUsername().trim() && opPassword() ? { username: opUsername().trim(), password: opPassword() } : undefined,
    }),
    onSuccess: async (tenant) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenants'] }),
        queryClient.invalidateQueries({ queryKey: ['overview'] }),
      ])
      setCreating(false)
      setNotice(opUsername().trim()
        ? `${tenant.displayName} created${deployNow() ? ' with a queued CrowdRelay deployment' : ''}. Operator “${opUsername().trim()}” can sign in and sees only this tenant.`
        : deployNow()
          ? `${tenant.displayName} created. Regional profile is persisted and CrowdRelay deployment is queued atomically.`
          : `${tenant.displayName} created without deployment.`)
      resetForm()
    },
  }))

  const operatorFieldsReady = () => !opUsername().trim() && !opPassword()
    || (/^[a-z0-9][a-z0-9-_.]{2,31}$/.test(opUsername().trim()) && opPassword().length >= 12)

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

  return <PageShell>
    {/* A <button> inside an <a> nests one interactive control in another:
        screen readers announce both, and the anchor is what actually
        navigates. The link carries the button treatment instead. */}
    <PageHeader
      eyebrow="TENANT REGISTRY"
      title={isPlatformLevel() ? 'Teams on the platform' : 'Your tenant'}
      description={isPlatformLevel()
        ? 'Create an isolated CrowdRelay + Signal tenant with an explicit regional profile.'
        : 'Your tenant on the platform. Regional profile, runtime health and deployment state.'}
      actions={<Show when={isAdmin()}><Link class={buttonVariants()} to="/tenants/new">+ New tenant</Link></Show>}
    />

    <Show when={notice()}>{message => <div class="rounded-lg border border-border bg-surface-1 p-4 text-sm text-foreground">{message()}</div>}</Show>
    <Show when={tenants.error || overview.error}><ErrorCard>{tenants.error instanceof Error ? tenants.error.message : overview.error instanceof Error ? overview.error.message : 'Control Plane data could not be loaded'}</ErrorCard></Show>
    <Show when={isAdmin() && creating()}>
      <form class="rounded-lg border border-border bg-card p-5 space-y-5" onSubmit={(event) => { event.preventDefault(); createTenant.mutate() }}>
        <div class="flex items-center justify-between gap-2"><div><h2 class="text-lg font-semibold text-foreground">Identity + region</h2></div><StatusBadge status={overview.data?.provisionerConfigured ? 'Provisioner connected' : 'Provisioner token not configured'} tone={overview.data?.provisionerConfigured ? 'good' : 'warn'} /></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <label>Slug<Input value={slug()} onInput={(e) => setSlug(e.currentTarget.value.toLowerCase())} placeholder="future-metal" autocomplete="off" maxlength="60" /></label>
          <label>Display name<Input value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="Future Metal" maxlength="120" /></label>
          <label>Regional preset<NativeSelect onChange={e=>applyPreset(e.currentTarget.value as Preset)}><option value="PL">Poland</option><option value="DE">Germany</option><option value="CZ">Czechia</option><option value="US">United States</option></NativeSelect><small>Fills fields below; can be overridden.</small></label>
          <label>Country<Input maxlength="2" value={profile().countryCode} onInput={e=>setRegional('countryCode',e.currentTarget.value.toUpperCase())}/></label>
          <label>Locale<Input value={profile().locale} onInput={e=>setRegional('locale',e.currentTarget.value)} placeholder="de-DE"/></label>
          <label>Timezone<Input value={profile().timezone} onInput={e=>setRegional('timezone',e.currentTarget.value)} placeholder={profile().countryCode === 'US' ? 'America/Chicago (choose explicitly)' : 'Europe/Berlin'}/><small>{profile().countryCode === 'US' ? 'Required: US preset has no hidden timezone default.' : 'Explicit timezone.'}</small></label>
          <label>Currency<Input maxlength="3" value={profile().currency} onInput={e=>setRegional('currency',e.currentTarget.value.toUpperCase())}/></label>
          <label>Market region<NativeSelect value={profile().region} onChange={e=>setRegional('region',e.currentTarget.value as 'eu'|'us')}><option value="eu">EU</option><option value="us">US</option></NativeSelect></label>
          <label>Data residency<NativeSelect value={profile().dataRegion} onChange={e=>setRegional('dataRegion',e.currentTarget.value as 'eu'|'us')}><option value="eu">EU</option><option value="us">US</option></NativeSelect><small>Enforced by the regional provisioner pool.</small></label>
          <label>Date format<NativeSelect value={profile().dateFormat} onChange={e=>setRegional('dateFormat',e.currentTarget.value as RegionalProfile['dateFormat'])}><option value="dmy">DD/MM/YYYY</option><option value="mdy">MM/DD/YYYY</option><option value="ymd">YYYY-MM-DD</option></NativeSelect></label>
          <label>Number format<NativeSelect value={profile().numberFormat} onChange={e=>setRegional('numberFormat',e.currentTarget.value as RegionalProfile['numberFormat'])}><option value="comma_decimal">1 234,56</option><option value="dot_decimal">1,234.56</option></NativeSelect></label>
          <label>CrowdRelay API base URL<Input value={crowdrelayBaseUrl()} onInput={(e) => setCrowdrelayBaseUrl(e.currentTarget.value)} placeholder="https://api.future-metal.example" /></label>
          <label>Signal / public site URL<Input value={signalBaseUrl()} onInput={(e) => setSignalBaseUrl(e.currentTarget.value)} placeholder="https://future-metal.example" /></label>
          <label>Release SHA <small>optional if server default is configured</small><Input value={desiredVersion()} onInput={(e) => setDesiredVersion(e.currentTarget.value)} placeholder={overview.data?.provisionerDefaultImageTag ?? 'sha-<40-char CrowdRelay commit>'} /></label>
        </div>
        <div class="flex items-center justify-between gap-2"><div><h2 class="text-lg font-semibold text-foreground">First account for the team</h2></div></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <label>Operator username<Input value={opUsername()} onInput={(e) => setOpUsername(e.currentTarget.value.toLowerCase())} placeholder="future-metal-op" autocomplete="off" /><small>Optional. Sees only this tenant; leave blank to skip.</small></label>
          <label>Operator password<Input type="password" value={opPassword()} onInput={(e) => setOpPassword(e.currentTarget.value)} placeholder="min 12 characters" autocomplete="new-password" /><small>Hashed securely, never shown again.</small></label>
        </div>
        <label class="flex items-start gap-3 cursor-pointer"><input type="checkbox" class="mt-1" checked={deployNow()} onChange={(e) => setDeployNow(e.currentTarget.checked)} /><span><strong>Deploy isolated CrowdRelay instance now</strong><small class="block text-muted-foreground">Only an agent for the selected data region may claim this job.</small></span></label>
        <Show when={createTenant.error}><ErrorCard>{createTenant.error instanceof Error ? createTenant.error.message : 'Tenant creation failed'}</ErrorCard></Show>
        <div class="flex justify-end gap-2"><Button variant="ghost" size="sm" type="button" onClick={() => { setCreating(false); resetForm() }}>Cancel</Button><Button type="submit" size="sm" disabled={createTenant.isPending || slug().length < 2 || name().length < 2 || !regionalReady() || !deployFieldsReady() || !operatorFieldsReady()}>{createTenant.isPending && <Spinner />} {createTenant.isPending ? 'Creating…' : deployNow() ? 'Create & deploy' : 'Create tenant'}</Button></div>
      </form>
    </Show>

    <Show when={tenants.isPending && !tenants.data}><SkeletonRows count={4} /></Show>
    <div class="space-y-2"><For each={tenants.data?.items ?? []}>{tenant =>
      <Link to="/tenants/$slug" params={{ slug: tenant.slug }} class="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 hover:border-border-strong transition-colors">
        <div class="min-w-0"><strong class="text-foreground">{tenant.displayName}</strong><small class="block text-muted-foreground text-sm">{tenant.slug} · {tenant.regionalProfile ? `${tenant.regionalProfile.locale} · ${tenant.regionalProfile.timezone} · ${tenant.regionalProfile.dataRegion.toUpperCase()}` : 'regional profile unclassified'}</small></div>
        <div class="flex items-center gap-2"><StatusBadge status={tenant.status} tone={tenant.status === 'active' ? 'good' : tenant.status === 'suspended' ? 'bad' : tenant.status === 'parked' ? 'warn' : 'warn'} /><StatusBadge status={tenant.runtimeHealth} tone={tenant.runtimeHealth === 'healthy' ? 'good' : tenant.runtimeHealth === 'degraded' ? 'bad' : tenant.runtimeHealth === 'stale' ? 'warn' : 'muted'} /><StatusBadge status={tenant.regionalProfile ? `${tenant.regionalProfile.dataRegion.toUpperCase()} region` : 'unclassified'} tone={tenant.regionalProfile ? 'good' : 'warn'} /><StatusBadge status={tenant.brandingPalette ? 'Custom palette' : 'Product defaults'} /></div>
      </Link>}
    </For></div>
  </PageShell>
}
