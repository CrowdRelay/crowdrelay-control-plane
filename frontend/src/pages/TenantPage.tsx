import { For, Show, Suspense, createEffect, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { Link, useNavigate, useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { refreshTick } from '../lib/refresh'
import { errorMessage, formatTimestamp } from '../lib/format'
import type { Palette, ProvisioningJob } from '../lib/types'
import { ReleaseConvergencePanel } from '../components/ReleaseConvergencePanel'
import { StatusBadge } from '../components/StatusBadge'
import { RegionalProfilePanel } from '../components/RegionalProfilePanel'
import { TenantRuntimePanel } from '../components/TenantRuntimePanel'
import { SectionIcon } from '../components/SectionIcon'
import { TenantAuditPanel } from '../components/TenantAuditPanel'
import { TenantOperatorsPanel } from '../components/TenantOperatorsPanel'
import { OperationsPanel } from '../components/OperationsPanel'
import { SkeletonTenantPage } from '../components/Skeleton'

const paletteFields: Array<keyof Palette> = ['primary','primaryContrast','accent','surface','surfaceElevated','text','textMuted','success','warning','danger']
// The editor showed the raw struct field names — `primaryContrast`,
// `surfaceElevated` — so picking a colour meant knowing the CrowdRelay theming
// contract by heart. Name the slot, then say what it paints.
const paletteLabels: Record<keyof Palette, { label: string; role: string }> = {
  primary: { label: 'Primary', role: 'Buttons, links and the active state' },
  primaryContrast: { label: 'On primary', role: 'Text drawn on top of the primary colour' },
  accent: { label: 'Accent', role: 'Highlights, badges and charts' },
  surface: { label: 'Surface', role: 'Page background' },
  surfaceElevated: { label: 'Raised surface', role: 'Cards and sheets above the page' },
  text: { label: 'Text', role: 'Body copy and headings' },
  textMuted: { label: 'Muted text', role: 'Captions, hints and secondary labels' },
  success: { label: 'Success', role: 'Confirmations and healthy states' },
  warning: { label: 'Warning', role: 'Soft failures and things needing attention' },
  danger: { label: 'Danger', role: 'Errors and destructive actions' },
}
const defaultPalette: Palette = { primary:'#8b5cf6', primaryContrast:'#ffffff', accent:'#22d3ee', surface:'#0b0c0f', surfaceElevated:'#15171c', text:'#f7f7f8', textMuted:'#9ca3af', success:'#22c55e', warning:'#f59e0b', danger:'#ef4444' }
const provisionTone = (status: ProvisioningJob['status']) => status === 'succeeded' ? 'good' : status === 'failed' ? 'bad' : status === 'cancelled' ? 'muted' : 'warn'
const provisionFailures: Record<string, { title: string; guidance: string; retryable: boolean }> = {
  image_revision_mismatch: { title: 'Image was built from a different commit', guidance: 'The published image does not carry the git SHA this release asked for. The tag was rebuilt or overwritten. Do not retry until the release is republished from the intended commit.', retryable: false },
  image_revision_missing: { title: 'Image is missing its provenance label', guidance: 'The image does not publish org.opencontainers.image.revision, so its origin cannot be verified. Republish it from CrowdRelay CI.', retryable: false },
  image_digest_changed: { title: 'Release now points at different bytes', guidance: 'This release identifier previously resolved to another image digest. The tag was re-pushed. Deployment stopped before starting the new image; investigate the registry before retrying.', retryable: false },
  image_digest_unresolved: { title: 'Image has no registry digest', guidance: 'The pulled image could not be resolved to an immutable digest. Confirm the image exists in the registry and was pulled, not built locally.', retryable: false },
  data_region_mismatch: { title: 'Wrong regional provisioner', guidance: 'This agent is not allowed to deploy the tenant data region. Route the job to the matching EU/US provisioner pool.', retryable: true },
  image_digest_ambiguous: { title: 'Image resolves to multiple digests', guidance: 'Several registry digests match this repository. Clean the local image cache on the provisioner host and retry.', retryable: true },
  image_pull_failed: { title: 'Image pull failed', guidance: 'The provisioner host could not pull the image. Check registry credentials and network from that host, then retry.', retryable: true },
  lease_lost: { title: 'Deployment lost its lease', guidance: 'Another provisioner reclaimed this job mid-deployment, so this agent stopped rather than keep mutating Docker state. Safe to retry.', retryable: true },
  port_pool_exhausted: { title: 'No free tenant port', guidance: 'Every port in the configured range is allocated. Widen the range or release a retired tenant, then retry.', retryable: false },
  port_allocation_conflict: { title: 'Tenant port is double-claimed', guidance: 'Two tenants recorded the same host port. Resolve the conflicting deployment record on the host before retrying.', retryable: false },
  api_readiness_timeout: { title: 'CrowdRelay API never became ready', guidance: 'The stack started but its readiness probe never passed. Inspect the tenant container logs on the host. Retrying is safe.', retryable: true },
  worker_readiness_timeout: { title: 'CrowdRelay worker never became healthy', guidance: 'The API became ready but the background worker health check did not. Inspect the worker logs on the provisioner host before retrying.', retryable: true },
  workspace_probe_failed: { title: 'Workspace was not created', guidance: 'Bootstrap finished without producing the expected workspace. Inspect the setup container output before retrying.', retryable: true },
  schema_probe_failed: { title: 'Migration state is unreadable', guidance: 'The schema version probe did not return an integer. Inspect the tenant database before retrying.', retryable: true },
  docker_compose_failed: { title: 'Docker Compose step failed', guidance: 'A Compose step exited non-zero. The provisioner log holds the bounded output tail for this deployment.', retryable: true },
  docker_compose_unavailable: { title: 'Docker is unavailable', guidance: 'The provisioner host could not run Docker Compose, or the step timed out. Check the host daemon, then retry.', retryable: true },
  invalid_plan: { title: 'Deployment plan was rejected', guidance: 'The agent refused the plan as unsafe or malformed. This is a Control Plane defect; the plan must be corrected before retrying.', retryable: false },
}

export function TenantPage() {
  const params = useParams({ from: '/tenants/$slug' })
  const queryClient = useQueryClient()
  const model = useQuery(() => ({
    queryKey: ['tenant-overview', params().slug, refreshTick()],
    queryFn: async () => {
      const [overview, operations] = await Promise.all([
        api.tenantOverview(params().slug),
        api.tenantOperations(params().slug).catch(() => null),
      ])
      return { ...overview, operations, releaseLedger: operations?.autopilot?.release_ledger ?? null }
    },
    reconcile: 'id',
    refetchOnWindowFocus: false,
  }))
  const tenant = { get data() { return model.data?.tenant }, get error() { return model.error } }
  const platform = () => model.data?.platform
  const capabilities = () => model.data?.platform?.capabilities
  const provisioning = { get data() { return model.data?.provisioning } }
  const [palette, setPalette] = createSignal<Palette>(defaultPalette)
  const [editingPalette, setEditingPalette] = createSignal(false)
  const [desiredVersion, setDesiredVersion] = createSignal('')
  const [preview, setPreview] = createSignal<ProvisioningJob | null>(null)
  const [editingMobileApps, setEditingMobileApps] = createSignal(false)
  const [signalPlayUrl, setSignalPlayUrl] = createSignal('')
  const [synesthesiaPlayUrl, setSynesthesiaPlayUrl] = createSignal('')
  createEffect(() => { if (tenant.data?.brandingPalette) setPalette(tenant.data.brandingPalette) })
  createEffect(() => {
    if (tenant.data) {
      setSignalPlayUrl(tenant.data.signalPlayStoreUrl ?? '')
      setSynesthesiaPlayUrl(tenant.data.synesthesiaPlayStoreUrl ?? '')
    }
  })

  const refreshTenant = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tenant-overview', params().slug] }),
      queryClient.invalidateQueries({ queryKey: ['tenant-runtime', params().slug] }),
      queryClient.invalidateQueries({ queryKey: ['tenants'] }),
    ])
  }
  const branding = useMutation(() => ({ mutationFn: (value: Palette | null) => api.branding(params().slug, value), onSuccess: refreshTenant }))
  const mobileApps = useMutation(() => ({ mutationFn: (input: { signalPlayStoreUrl?: string | null; synesthesiaPlayStoreUrl?: string | null }) => api.mobileApps(params().slug, input), onSuccess: async () => { setEditingMobileApps(false); await refreshTenant() } }))
  const status = useMutation(() => ({ mutationFn: (action: 'suspend'|'resume') => action === 'suspend' ? api.suspend(params().slug) : api.resume(params().slug), onSuccess: refreshTenant }))
  const plan = useMutation(() => ({ mutationFn: () => api.planProvisioning(params().slug, desiredVersion() || platform()?.provisionerDefaultImageTag || undefined), onSuccess: (job) => setPreview(job) }))
  const deploy = useMutation(() => ({ mutationFn: () => api.deployTenant(params().slug, desiredVersion()), onSuccess: async () => { setPreview(null); await refreshTenant() } }))
  const cancel = useMutation(() => ({ mutationFn: () => api.cancelProvisioning(params().slug), onSuccess: refreshTenant }))
  // Removal is the one action here that cannot be undone from this screen, so
  // the confirmation is the slug typed out rather than a second button.
  const [removalConfirm, setRemovalConfirm] = createSignal('')
  const navigate = useNavigate()
  const remove = useMutation(() => ({
    mutationFn: () => api.removeTenant(params().slug),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenants'] })
      navigate({ to: '/tenants' })
    },
  }))
  const latestJob = () => provisioning.data?.items[0]
  const deploymentBusy = () => ['planned', 'approved', 'running'].includes(latestJob()?.status ?? '')
  const requestedVersion = () => desiredVersion().trim() || platform()?.provisionerDefaultImageTag || ''
  const releaseReady = () => /^sha-[0-9a-f]{40}$/.test(requestedVersion())
  const isAdmin = () => authState.profile()?.role === 'platform_admin'
  const [optOutConfirm, setOptOutConfirm] = createSignal('')
  const [optOutDone, setOptOutDone] = createSignal(false)
  const optOut = useMutation(() => ({
    mutationFn: () => api.optOut(params().slug),
    onSuccess: () => setOptOutDone(true),
  }))

  return <section class="page">
    <Show when={tenant.error}><div class="error-card" role="alert">{errorMessage(tenant.error, 'Tenant could not be loaded')}</div></Show>
    <Suspense fallback={<SkeletonTenantPage />}>
    <Show when={!tenant.error && tenant.data} fallback={!tenant.error ? <SkeletonTenantPage /> : null}>{data => {
    const t = data()
    return <>
      <div class="page-head">
        <div><span class="eyebrow">CONTROL</span><h1>{t.displayName}</h1><p>{t.workspaceId ?? 'Workspace mapping pending'} · {t.defaultCountryCode}</p></div>
        <div class="row-health"><StatusBadge status={t.status} tone={t.status === 'active' ? 'good' : t.status === 'suspended' ? 'bad' : 'warn'} /><Show when={capabilities()?.canSuspend !== false}><button class="ghost" onClick={() => status.mutate(t.status === 'suspended' ? 'resume' : 'suspend')}>{t.status === 'suspended' ? 'Resume' : 'Suspend'}</button></Show></div>
      </div>
      <Show when={status.error || branding.error || mobileApps.error || plan.error || deploy.error || cancel.error}>
        <div class="error-card" role="alert">{errorMessage(status.error || branding.error || mobileApps.error || plan.error || deploy.error || cancel.error, 'Control Plane operation failed')}</div>
      </Show>
      <div class="detail-grid">
        <TenantRuntimePanel slug={t.slug} initial={{ runtime: t.runtime, runtimeHealth: t.runtimeHealth }} />
        <article class="panel products-panel">
          <div class="section-title"><div><span class="eyebrow">PRODUCTS</span><h2><SectionIcon name="shield" />Entitlements</h2></div><button class="ghost" onClick={() => setEditingMobileApps(true)}>Edit Play Store URLs</button></div>
          <div class="product-row product-entitlement-row"><strong>CrowdRelay</strong><div class="product-action-slot" aria-hidden="true"/><div class="product-status-slot"><StatusBadge status="enabled" tone="good" /></div></div>
          <div class="product-row product-entitlement-row"><strong>Signal</strong><div class="product-action-slot"><Show when={t.signalEnabled && t.signalPlayStoreUrl}><a href={t.signalPlayStoreUrl!} target="_blank" rel="noopener noreferrer" class="play-store-link"><img src="/icons/google-play-badge.svg" alt="Get it on Google Play" width="100" height="30" /></a></Show></div><div class="product-status-slot"><StatusBadge status={t.signalEnabled ? 'enabled' : 'disabled'} tone={t.signalEnabled ? 'good' : 'muted'} /></div></div>
          <div class="product-row product-entitlement-row"><strong>AREA</strong><div class="product-action-slot"><Link class="ghost area-link-button" to="/tenants/$slug/area" params={{slug:t.slug}}>Manage</Link></div><div class="product-status-slot"><StatusBadge status={t.areaEnabled ? 'enabled' : 'disabled'} tone={t.areaEnabled ? 'good' : 'muted'} /></div></div>
          <div class="product-row product-entitlement-row"><strong>Synesthesia</strong><div class="product-action-slot"><Show when={t.synesthesiaEnabled && t.synesthesiaPlayStoreUrl}><a href={t.synesthesiaPlayStoreUrl!} target="_blank" rel="noopener noreferrer" class="play-store-link"><img src="/icons/google-play-badge.svg" alt="Get it on Google Play" width="100" height="30" /></a></Show></div><div class="product-status-slot"><StatusBadge status={t.synesthesiaEnabled ? 'enabled' : 'disabled'} tone={t.synesthesiaEnabled ? 'good' : 'muted'} /></div></div>
        </article>
      </div>
      <RegionalProfilePanel tenant={t} />
      <article class="panel"><div class="section-title"><div><span class="eyebrow">BRANDING</span><h2><SectionIcon name="palette" />CrowdRelay + Signal palette</h2></div>{t.brandingPalette ? <button class="ghost" onClick={() => branding.mutate(null)}>Reset to product defaults</button> : <StatusBadge status="Inherits current product defaults" />}</div><Show when={t.brandingPalette || editingPalette()} fallback={<div class="inherit-card"><p>No palette is stored for this tenant. CrowdRelay and Signal therefore keep their own current default colors with zero theming lookup required.</p><button class="ghost" onClick={() => setEditingPalette(true)}>Create custom palette</button></div>}><p>Ten colours, sent to this tenant's CrowdRelay and Signal builds. Nothing changes for fans until you save; resetting removes the override and both apps fall back to the product defaults.</p><div class="palette-grid"><For each={paletteFields}>{field => <label><span class="palette-field-name">{paletteLabels[field].label}</span><span class="palette-field-role">{paletteLabels[field].role}</span><div class="color-input"><input type="color" aria-label={paletteLabels[field].label} value={palette()[field]} onInput={(e) => setPalette(current => ({ ...current, [field]: e.currentTarget.value }))}/><code>{palette()[field]}</code></div></label>}</For></div><button onClick={() => branding.mutate(palette())} disabled={branding.isPending}>{branding.isPending ? 'Saving…' : 'Save custom palette'}</button></Show></article>

      <Show when={t.signalEnabled || t.synesthesiaEnabled}>
        <article class="panel mobile-app-setup-panel">
          <div class="section-title"><div><span class="eyebrow">MOBILE APPS</span><h2><SectionIcon name="play" />Google Play setup</h2></div></div>
          <p class="wizard-intro">Onboard this tenant's mobile apps for Google Play. Each step is automated by the onboarding script in the virya-signal repo.</p>
          <div class="setup-checklist">
            <div class="setup-step" classList={{ done: Boolean(t.brandingPalette), pending: !t.brandingPalette }}>
              <span class="setup-step-icon">{t.brandingPalette ? '✓' : '○'}</span>
              <div><strong>Branding palette</strong><small>{t.brandingPalette ? 'Custom palette configured' : 'Using product defaults — set a palette for custom app icons'}</small></div>
            </div>
            <Show when={t.signalEnabled}>
              <div class="setup-step" classList={{ done: Boolean(t.signalPlayStoreUrl), pending: !t.signalPlayStoreUrl }}>
                <span class="setup-step-icon">{t.signalPlayStoreUrl ? '✓' : '○'}</span>
                <div><strong>Signal app published</strong><small>{t.signalPlayStoreUrl ? <a href={t.signalPlayStoreUrl!} target="_blank" rel="noopener noreferrer">{t.signalPlayStoreUrl}</a> : `Package: music.${t.slug}.signal — run the onboarding script to build and publish`}</small></div>
              </div>
            </Show>
            <Show when={t.synesthesiaEnabled}>
              <div class="setup-step" classList={{ done: Boolean(t.synesthesiaPlayStoreUrl), pending: !t.synesthesiaPlayStoreUrl }}>
                <span class="setup-step-icon">{t.synesthesiaPlayStoreUrl ? '✓' : '○'}</span>
                <div><strong>Synesthesia app published</strong><small>{t.synesthesiaPlayStoreUrl ? <a href={t.synesthesiaPlayStoreUrl!} target="_blank" rel="noopener noreferrer">{t.synesthesiaPlayStoreUrl}</a> : `Package: music.${t.slug}.synesthesia — run the onboarding script in the synesthesia repo`}</small></div>
              </div>
            </Show>
          </div>
          <Show when={!t.signalPlayStoreUrl && t.signalEnabled}>
            <div class="onboard-command-card">
              <span class="eyebrow">QUICK START</span>
              <p>Run this in the virya-signal repo to onboard the Signal app end-to-end:</p>
              <pre><code>bash scripts/onboard-tenant-app.sh \<br/>  --tenant {t.slug} \<br/>  --control-plane-url {window.location.origin.replace(/:\d+$/, '')} \<br/>  --token $CONTROL_PLANE_ADMIN_TOKEN \<br/>  --version 0.1.0 --version-code 1</code></pre>
            </div>
          </Show>
        </article>
      </Show>

      <Show when={editingMobileApps()}>
        <div class="dialog-overlay" onClick={() => setEditingMobileApps(false)}>
          <div class="dialog-panel" onClick={(e) => e.stopPropagation()}>
            <div class="section-title"><div><span class="eyebrow">MOBILE APPS</span><h2>Google Play Store URLs</h2></div></div>
            <p class="wizard-intro">Set the Google Play Store URL for each tenant mobile app. Leave blank if the app is not yet published.</p>
            <div class="form-grid">
              <label>Signal Play Store URL<input value={signalPlayUrl()} onInput={(e) => setSignalPlayUrl(e.currentTarget.value)} placeholder="https://play.google.com/store/apps/details?id=music.{t.slug}.signal" /></label>
              <label>Synesthesia Play Store URL<input value={synesthesiaPlayUrl()} onInput={(e) => setSynesthesiaPlayUrl(e.currentTarget.value)} placeholder="https://play.google.com/store/apps/details?id=music.{t.slug}.synesthesia" /></label>
            </div>
            <Show when={mobileApps.error}><div class="error-card" role="alert">{mobileApps.error instanceof Error ? mobileApps.error.message : 'Failed to update Play Store URLs'}</div></Show>
            <div class="form-actions right">
              <button class="ghost" onClick={() => setEditingMobileApps(false)}>Cancel</button>
              <button onClick={() => mobileApps.mutate({ signalPlayStoreUrl: signalPlayUrl().trim() || null, synesthesiaPlayStoreUrl: synesthesiaPlayUrl().trim() || null })} disabled={mobileApps.isPending}>{mobileApps.isPending ? 'Saving…' : 'Save URLs'}</button>
            </div>
          </div>
        </div>
      </Show>

      <article class="panel provisioning-panel">
        <div class="section-title">
          <div><span class="eyebrow">PROVISIONING</span><h2><SectionIcon name="server" />CrowdRelay instance</h2></div>
          <Show when={latestJob()}>{job => <StatusBadge status={job().status} tone={provisionTone(job().status)} />}</Show>
        </div>
        <Show when={capabilities()?.canProvision !== false} fallback={<div class="inherit-card"><p>This tenant stays on its existing production CrowdRelay deployment. The tenant provisioner intentionally refuses to create a second stack for it.</p></div>}>
          <p>The browser only requests desired state. A separately authenticated host agent claims the job and runs a fixed Docker Compose recipe; the Control Plane API never receives Docker access.</p>
          <div class="deployment-target-grid">
            <div><span>Public API</span><strong>{t.crowdrelayBaseUrl ?? 'not configured'}</strong></div>
            <div><span>Signal / site</span><strong>{t.signalBaseUrl ?? 'not configured'}</strong></div>
            <div><span>Provisioner</span><strong>{platform()?.provisionerConfigured ? 'configured' : 'not configured'}</strong></div>
            <div><span>Default release</span><strong class="mono">{platform()?.provisionerDefaultImageTag?.slice(0, 16) ?? 'not configured'}</strong></div>
          </div>
          <div class="provision-row">
            <input class={!releaseReady() && desiredVersion().trim() ? 'input-invalid mono' : 'mono'} value={desiredVersion()} onInput={(e) => setDesiredVersion(e.currentTarget.value)} placeholder={platform()?.provisionerDefaultImageTag ?? 'sha-<40-char commit>'} aria-label="Desired release version" aria-invalid={!releaseReady() && Boolean(desiredVersion().trim())} />
            <button class="ghost" onClick={() => plan.mutate()} disabled={plan.isPending || deploymentBusy() || !releaseReady()}>Preview</button>
            <button onClick={() => deploy.mutate()} disabled={deploy.isPending || deploymentBusy() || !releaseReady() || t.status === 'suspended' || !t.crowdrelayBaseUrl || !t.signalBaseUrl}>{latestJob()?.status === 'failed' ? 'Retry deploy' : t.status === 'active' ? 'Deploy / upgrade' : 'Deploy instance'}</button>
          </div>
          <Show when={deploy.error}><div class="error-card">{deploy.error instanceof Error ? deploy.error.message : 'Deployment request failed'}</div></Show>
          <Show when={preview()}>{job => <div class="plan-preview"><span class="eyebrow">PLAN PREVIEW</span><pre>{JSON.stringify(job().plan, null, 2)}</pre></div>}</Show>
          <Show when={latestJob()}>{job => <div class="provision-job">
            <div class="provision-job-head"><div><strong>{job().desiredVersion ?? 'default release'}</strong><small>attempt {job().attemptCount} · created {new Date(job().createdAt).toLocaleString()}</small></div><StatusBadge status={job().status} tone={provisionTone(job().status)} /></div>
            <Show when={job().status === 'approved'}><p>Queued for the provisioner agent. No Docker mutation happens in the HTTP request.</p></Show>
            <Show when={job().status === 'running'}><p>Claimed by <code>{job().claimedBy ?? 'provisioner'}</code>. Lease expires {formatTimestamp(job().leaseExpiresAt)}.</p></Show>
            <Show when={job().status === 'succeeded'}><div class="deployment-result"><dl><dt>Local API</dt><dd><code>{job().result?.localApiUrl ?? '—'}</code></dd><dt>Host port</dt><dd>{job().result?.apiPort ?? '—'}</dd><dt>Workspace</dt><dd class="mono">{job().result?.workspaceId ?? t.workspaceId ?? '—'}</dd><dt>Schema</dt><dd>{job().result?.schemaVersion ?? '—'}</dd><dt>Provisioner</dt><dd><code>{job().result?.provisionerWorkerId ?? job().claimedBy ?? '—'}</code></dd></dl><p class="route-note">The instance is healthy locally. Route <code>{t.crowdrelayBaseUrl}</code> at the edge to this host port to expose it publicly.</p></div></Show>
            <Show when={job().status === 'failed' ? (job().errorCode ?? 'provisioning_failed') : undefined}>{code => <div class="error-card">
              <strong>{provisionFailures[code()]?.title ?? code()}</strong>
              <Show when={provisionFailures[code()]}>{failure => <>
                <p>{failure().guidance}</p>
                <Show when={!failure().retryable}><p class="route-note">Retrying will not help until the underlying cause is fixed.</p></Show>
              </>}</Show>
              <small class="mono">{code()}{job().errorDetail ? ` · ${job().errorDetail}` : ''}</small>
            </div>}</Show>
            <Show when={['planned','approved'].includes(job().status)}><button class="ghost danger-ghost" onClick={() => cancel.mutate()} disabled={cancel.isPending}>Cancel queued deployment</button></Show>
          </div>}</Show>
        </Show>
      </article>

      <Show when={model.data?.operations}>
        {ops => <OperationsPanel
          slug={t.slug}
          summary={ops()?.summary ?? null}
          flags={ops()?.flags ?? null}
          autopilot={ops()?.autopilot ?? null}
          degraded={ops()?.degraded ?? []}
          refresh={async () => { await queryClient.invalidateQueries({ queryKey: ['tenant-overview', params().slug] }) }}
          mode="health"
        />}
      </Show>

      <ReleaseConvergencePanel releaseLedger={model.data?.releaseLedger ?? null} />
      <TenantAuditPanel items={model.data?.audit.items ?? []} />
      <TenantOperatorsPanel slug={t.slug} />

      {/* Tenant-initiated opt-out. Available to tenant operators on
          non-Virya tenants. Records the request in the audit trail — the
          crew then uses the admin-side Remove button to complete it. */}
      <Show when={!isAdmin() && capabilities()?.canOptOut === true}>
        <article class="panel tenant-opt-out">
          <div class="section-title"><div><span class="eyebrow">LEAVING</span><h2>Opt out of the platform</h2></div></div>
          <Show when={optOutDone()} fallback={
            <>
              <p>
                If you want to leave the platform, request an opt-out here. Your request is
                recorded and sent to the crew. They will contact you at the email on file to
                confirm, then remove your tenant, operators, and all control-plane data.
                Your CrowdRelay workspace keeps running until it is shut down separately.
              </p>
              <p class="route-note">
                To expedite, also email <a href="mailto:virya.crew@gmail.com?subject=Opt%20out%3A%20{encodeURIComponent(t.displayName)}&body=Tenant%3A%20{encodeURIComponent(t.slug)}%0A%0AI%20want%20to%20opt%20out%20of%20the%20CrowdRelay%20platform.%20Please%20remove%20my%20tenant%20data.">virya.crew@gmail.com</a>.
              </p>
              <Show when={optOut.isError}>
                <div class="error-card" role="alert">{errorMessage(optOut.error, 'Opt-out request failed')}</div>
              </Show>
              <div class="form-grid">
                <label>
                  <span>Type <code>{t.slug}</code> to confirm</span>
                  <input
                    value={optOutConfirm()}
                    placeholder={t.slug}
                    autocomplete="off"
                    onInput={(e) => setOptOutConfirm(e.currentTarget.value)}
                  />
                </label>
              </div>
              <div class="form-actions">
                <button
                  class="danger-ghost"
                  disabled={optOutConfirm().trim() !== t.slug || optOut.isPending}
                  onClick={() => optOut.mutate()}
                >
                  {optOut.isPending ? 'Sending request…' : 'Request opt-out'}
                </button>
              </div>
            </>
          }>
            <div class="notice-card">
              <strong>Opt-out request received.</strong> The crew has been notified and will
              contact you to confirm before removing your data. No further action is needed
              from your side.
            </div>
          </Show>
        </article>
      </Show>

      {/* Admin-only removal. Rendered from the server's capability flag, never
          from the slug. And `=== true` rather than `!== false`: for a
          destructive action an absent or still-loading capability must read
          as "not allowed", which is the opposite default from the reads
          above. Tenant operators never see this — they use Opt out instead. */}
      <Show when={isAdmin() && capabilities()?.canRemove === true}>
        <article class="panel tenant-danger-zone">
          <div class="section-title"><div><span class="eyebrow">DANGER ZONE</span><h2>Remove tenant</h2></div></div>
          <p>
            Unregisters <strong>{t.displayName}</strong> from the control plane: its operators,
            runtime status and provisioning history here are deleted and cannot be restored from
            this screen. The tenant's own CrowdRelay data is not touched — that workspace keeps
            running until it is shut down separately. The audit trail survives this removal.
          </p>
          <Show when={remove.isError}>
            <div class="error-card" role="alert">{errorMessage(remove.error, 'Tenant removal failed')}</div>
          </Show>
          <div class="form-grid">
            <label>
              <span>Type <code>{t.slug}</code> to confirm</span>
              <input
                value={removalConfirm()}
                placeholder={t.slug}
                autocomplete="off"
                onInput={(e) => setRemovalConfirm(e.currentTarget.value)}
              />
            </label>
          </div>
          <div class="form-actions">
            <button
              class="danger-ghost"
              disabled={removalConfirm().trim() !== t.slug || remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? 'Removing…' : 'Remove this tenant'}
            </button>
          </div>
        </article>
      </Show>
    </>
  }}</Show></Suspense></section>
}
