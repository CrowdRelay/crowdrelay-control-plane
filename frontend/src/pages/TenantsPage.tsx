import { For, Show, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { StatusBadge } from '../components/StatusBadge'

export function TenantsPage() {
  const queryClient = useQueryClient()
  const tenants = useQuery(() => ({ queryKey: ['tenants'], queryFn: api.tenants }))
  const overview = useQuery(() => ({ queryKey: ['overview'], queryFn: api.overview }))
  const [creating, setCreating] = createSignal(false)
  const [slug, setSlug] = createSignal('')
  const [name, setName] = createSignal('')
  const [crowdrelayBaseUrl, setCrowdrelayBaseUrl] = createSignal('')
  const [signalBaseUrl, setSignalBaseUrl] = createSignal('')
  const [countryCode, setCountryCode] = createSignal('PL')
  const [desiredVersion, setDesiredVersion] = createSignal('')
  const [deployNow, setDeployNow] = createSignal(true)
  const [notice, setNotice] = createSignal<string | null>(null)

  const resetForm = () => {
    setSlug('')
    setName('')
    setCrowdrelayBaseUrl('')
    setSignalBaseUrl('')
    setCountryCode('PL')
    setDesiredVersion('')
    setDeployNow(true)
  }

  const createTenant = useMutation(() => ({
    mutationFn: () => api.createTenant({
      slug: slug(),
      displayName: name(),
      crowdrelayBaseUrl: crowdrelayBaseUrl() || undefined,
      signalBaseUrl: signalBaseUrl() || undefined,
      defaultCountryCode: countryCode(),
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
        ? `${tenant.displayName} created. CrowdRelay deployment is queued atomically.`
        : `${tenant.displayName} created without deployment.`)
      resetForm()
    },
  }))

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
        <p>Create a tenant and optionally queue an isolated CrowdRelay instance in the same flow. Virya stays platform-owned and Synesthesia remains Virya-only.</p>
      </div>
      <button onClick={() => { setNotice(null); setCreating(true) }}>+ New tenant</button>
    </div>

    <Show when={notice()}>{message => <div class="notice-card">{message()}</div>}</Show>

    <Show when={creating()}>
      <form class="tenant-create-form" onSubmit={(event) => { event.preventDefault(); createTenant.mutate() }}>
        <div class="form-section-head">
          <div><span class="eyebrow">NEW TENANT</span><h2>Identity</h2></div>
          <StatusBadge status={overview.data?.provisionerConfigured ? 'Provisioner connected' : 'Provisioner token not configured'} tone={overview.data?.provisionerConfigured ? 'good' : 'warn'} />
        </div>
        <div class="form-grid">
          <label>Slug<input value={slug()} onInput={(e) => setSlug(e.currentTarget.value.toLowerCase())} placeholder="future-metal" autocomplete="off" /></label>
          <label>Display name<input value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="Future Metal" /></label>
          <label>Default country<input value={countryCode()} maxlength={2} onInput={(e) => setCountryCode(e.currentTarget.value.toUpperCase())} placeholder="PL" /></label>
          <label>CrowdRelay API base URL<input value={crowdrelayBaseUrl()} onInput={(e) => setCrowdrelayBaseUrl(e.currentTarget.value)} placeholder="https://api.future-metal.example" /></label>
          <label>Signal / public site URL<input value={signalBaseUrl()} onInput={(e) => setSignalBaseUrl(e.currentTarget.value)} placeholder="https://future-metal.example" /></label>
          <label>Release SHA <small>optional if server default is configured</small><input value={desiredVersion()} onInput={(e) => setDesiredVersion(e.currentTarget.value)} placeholder={overview.data?.provisionerDefaultImageTag ?? 'sha-<40-char CrowdRelay commit>'} /></label>
        </div>
        <label class="check-row">
          <input type="checkbox" checked={deployNow()} onChange={(e) => setDeployNow(e.currentTarget.checked)} />
          <span><strong>Deploy isolated CrowdRelay instance now</strong><small>Queues Postgres + setup + API + worker on the provisioner host. Secrets never enter the browser.</small></span>
        </label>
        <Show when={deployNow() && overview.data?.provisionerConfigured === false}>
          <div class="warning-card">Tenant provisioning is not configured on this Control Plane. Configure the provisioner or uncheck deployment to create the tenant registry entry only.</div>
        </Show>
        <Show when={deployNow() && overview.data?.provisionerConfigured === true && !desiredVersion().trim() && !overview.data?.provisionerDefaultImageTag}>
          <div class="warning-card">Enter an immutable <code>sha-&lt;40-char commit&gt;</code> release before deploying this instance.</div>
        </Show>
        <Show when={createTenant.error}><div class="error-card">{createTenant.error instanceof Error ? createTenant.error.message : 'Tenant creation failed'}</div></Show>
        <div class="form-actions right">
          <button type="button" class="ghost" onClick={() => { setCreating(false); resetForm() }}>Cancel</button>
          <button type="submit" disabled={createTenant.isPending || slug().length < 2 || name().length < 2 || countryCode().length !== 2 || !deployFieldsReady()}>
            {createTenant.isPending ? 'Creating…' : deployNow() ? 'Create & deploy' : 'Create tenant'}
          </button>
        </div>
      </form>
    </Show>

    <div class="tenant-list"><For each={tenants.data?.items ?? []}>{tenant =>
      <Link to="/tenants/$slug" params={{ slug: tenant.slug }} class="tenant-row large">
        <div><strong>{tenant.displayName}</strong><small>{tenant.slug} · {tenant.workspaceId ?? 'workspace pending'} · {tenant.defaultCountryCode}</small></div>
        <div class="row-health">
          <StatusBadge status={tenant.status} tone={tenant.status === 'active' ? 'good' : tenant.status === 'suspended' ? 'bad' : 'warn'} />
          <StatusBadge status={tenant.runtimeHealth} tone={tenant.runtimeHealth === 'healthy' ? 'good' : tenant.runtimeHealth === 'degraded' ? 'bad' : tenant.runtimeHealth === 'stale' ? 'warn' : 'muted'} />
          <StatusBadge status={tenant.brandingPalette ? 'Custom palette' : 'Product defaults'} />
          <StatusBadge status={tenant.synesthesiaEnabled ? 'Synesthesia / Virya' : 'CrowdRelay + Signal'} tone={tenant.synesthesiaEnabled ? 'warn' : 'muted'} />
        </div>
      </Link>}
    </For></div>
  </section>
}
