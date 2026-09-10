import { For, Show, createEffect, createMemo, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { Link, useNavigate, useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { errorMessage } from '../lib/format'
import type { Palette, ProvisioningJob } from '../lib/types'
import { ReleaseConvergencePanel } from '../components/ReleaseConvergencePanel'
import { StatusBadge } from '../components/StatusBadge'
import { RegionalProfilePanel } from '../components/RegionalProfilePanel'
import { TenantRuntimePanel } from '../components/TenantRuntimePanel'
import { SectionIcon } from '../components/SectionIcon'
import { TenantAuditPanel } from '../components/TenantAuditPanel'
import { TenantOperatorsPanel } from '../components/TenantOperatorsPanel'
import { OperationsPanel } from '../components/OperationsPanel'
import { SkeletonTenantPage, SkeletonSection } from '../components/Skeleton'
import { TabBar, TabPanel, useTabPanels, PageShell, PageHeader, ErrorCard, SectionPanel, SectionTitle, SkeletonBlock } from '../components/layout'
import { Spinner } from '../components/Spinner'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'

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
// Semantic phase tone — the phase distinguishes "we asked" (accepted) from
// "it happened" (completed). The domain status (planned/approved/running/
// succeeded/failed/cancelled) stays for backward compat; the phase is the
// universal semantic layer that prevents mistaking a trigger for a result.
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
  const { activeTab, switchTab, isVisited } = useTabPanels('profile')

  // Base read model — tenant identity, provisioning, audit, platform caps.
  // This is all the Profile and Access tabs need. The Deployment tab has
  // its own lazy query below so opening Settings doesn't pay for the
  // operations read model unless the operator actually visits it.
  const model = useQuery(() => ({
    queryKey: ['tenant-overview', params().slug],
    queryFn: () => api.tenantOverview(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))
  const tenant = { get data() { return model.data?.tenant }, get error() { return model.error } }
  const platform = () => model.data?.platform
  const capabilities = () => model.data?.platform?.capabilities
  const provisioning = { get data() { return model.data?.provisioning } }

  // Operations read model — loaded when the Profile or Deployment tab is
  // opened. Profile needs it for the fan-growth KPI card (North Star);
  // Deployment needs it for the operations detail. The query is cached by
  // TanStack Query, so visiting one tab preloads the other.
  const operations = useQuery(() => ({
    queryKey: ['tenant-operations', params().slug],
    queryFn: () => api.tenantOperations(params().slug),
    enabled: isVisited('profile') || isVisited('deployment'),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
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

  // Invalidate only the read models a mutation actually changes — not the
  // whole fleet. Palette/mobile-apps edits don't touch operations or
  // runtime; provisioning changes don't touch the fleet list.
  const refreshTenant = async () => {
    await queryClient.invalidateQueries({ queryKey: ['tenant-overview', params().slug] })
    await queryClient.invalidateQueries({ queryKey: ['tenants'] })
  }
  const refreshProvisioning = async () => {
    await queryClient.invalidateQueries({ queryKey: ['tenant-overview', params().slug] })
    await queryClient.invalidateQueries({ queryKey: ['tenant-operations', params().slug] })
  }
  const branding = useMutation(() => ({ mutationFn: (value: Palette | null) => api.branding(params().slug, value), onSuccess: refreshTenant }))
  const mobileApps = useMutation(() => ({ mutationFn: (input: { signalPlayStoreUrl?: string | null; synesthesiaPlayStoreUrl?: string | null }) => api.mobileApps(params().slug, input), onSuccess: async () => { setEditingMobileApps(false); await refreshTenant() } }))
  const status = useMutation(() => ({ mutationFn: (action: 'suspend'|'resume') => action === 'suspend' ? api.suspend(params().slug) : api.resume(params().slug), onSuccess: refreshTenant }))
  const park = useMutation(() => ({ mutationFn: (reason?: string) => api.park(params().slug, reason), onSuccess: refreshTenant }))
  const unpark = useMutation(() => ({ mutationFn: () => api.unpark(params().slug), onSuccess: refreshTenant }))
  const plan = useMutation(() => ({ mutationFn: () => api.planProvisioning(params().slug, desiredVersion() || platform()?.provisionerDefaultImageTag || undefined), onSuccess: (job) => setPreview(job) }))
  const deploy = useMutation(() => ({ mutationFn: () => api.deployTenant(params().slug, desiredVersion()), onSuccess: async () => { setPreview(null); await refreshProvisioning() } }))
  const cancel = useMutation(() => ({ mutationFn: () => api.cancelProvisioning(params().slug), onSuccess: refreshProvisioning }))
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
  const latestJob = createMemo(() => provisioning.data?.items[0])
  const deploymentBusy = createMemo(() => ['planned', 'approved', 'running'].includes(latestJob()?.status ?? ''))
  const requestedVersion = createMemo(() => desiredVersion().trim() || platform()?.provisionerDefaultImageTag || '')
  const releaseReady = createMemo(() => /^sha-[0-9a-f]{40}$/.test(requestedVersion()))
  const isAdmin = createMemo(() => authState.isAdmin())
  const [optOutConfirm, setOptOutConfirm] = createSignal('')
  const [optOutDone, setOptOutDone] = createSignal(false)
  const optOut = useMutation(() => ({
    mutationFn: () => api.optOut(params().slug),
    onSuccess: () => setOptOutDone(true),
  }))

  return <PageShell>
    <Show when={tenant.error}><ErrorCard>{errorMessage(tenant.error, 'Tenant could not be loaded')}</ErrorCard></Show>
    <Show when={!tenant.error && tenant.data} fallback={!tenant.error ? <SkeletonTenantPage /> : null}>{data => {
    const t = data()
    return <>
      <PageHeader
        eyebrow="CONTROL"
        title={t.displayName}
        description={`${t.defaultCountryCode} · ${t.workspaceId ? 'Workspace ready' : 'Workspace mapping pending'}`}
        actions={<div class="row-health"><StatusBadge status={t.status} tone={t.status === 'active' ? 'good' : t.status === 'suspended' ? 'bad' : t.status === 'parked' ? 'warn' : 'warn'} /><Show when={capabilities()?.canPark}><Button variant="ghost" size="sm" disabled={park.isPending} onClick={() => park.mutate('non-payment')} aria-label={park.isPending ? 'Parking tenant' : 'Park tenant'}>{park.isPending && <Spinner />} {park.isPending ? 'Parking…' : 'Park'}</Button></Show><Show when={capabilities()?.canUnpark}><Button size="sm" disabled={unpark.isPending} onClick={() => unpark.mutate()} aria-label={unpark.isPending ? 'Resuming tenant' : 'Resume tenant'}>{unpark.isPending && <Spinner />} {unpark.isPending ? 'Resuming…' : 'Resume'}</Button></Show><Show when={capabilities()?.canSuspend !== false && t.status !== 'parked'}><Button variant="ghost" size="sm" disabled={status.isPending} onClick={() => status.mutate(t.status === 'suspended' ? 'resume' : 'suspend')} aria-label={status.isPending ? 'Updating status' : (t.status === 'suspended' ? 'Resume tenant' : 'Suspend tenant')}>{status.isPending && <Spinner />} {status.isPending ? 'Updating…' : t.status === 'suspended' ? 'Resume' : 'Suspend'}</Button></Show></div>}
      />
      <Show when={status.error || branding.error || mobileApps.error || plan.error || deploy.error || cancel.error || park.error || unpark.error}>
        <ErrorCard>{errorMessage(status.error || branding.error || mobileApps.error || plan.error || deploy.error || cancel.error || park.error || unpark.error, 'Control Plane operation failed')}</ErrorCard>
      </Show>
      <Show when={t.status === 'parked'}>
        <div class="parked-banner" role="status">
          <strong>Tenant is parked.</strong> The autopilot is stopped — no new tasks or outreach. Pending deliveries still drain. Click <em>Resume</em> to restore.
        </div>
      </Show>
      <TabBar
        active={activeTab()}
        onChange={switchTab}
        tabs={[
          { id: 'profile', label: 'Profile' },
          { id: 'deployment', label: 'Deployment' },
          { id: 'access', label: 'Access' },
        ]}
      />

      {/* ── Profile tab — fan growth, identity, runtime, branding ── */}
      <TabPanel active={activeTab()} id="profile" visited={isVisited('profile')}>
        {/* North Star fan-growth card — the first thing the operator sees
            on the tenant landing page. Shows audience KPIs from the
            operations read model. Degrades to a skeleton while loading
            and to "unavailable" if the audience section fails. */}
        <Show when={operations.data} fallback={
          <Show when={operations.isFetching} fallback={
            <SectionPanel class="fan-growth-card fan-growth-unavailable">
              <SectionTitle eyebrow="NORTH STAR" title="Fan growth" icon={<SectionIcon name="users" />} />
              <p class="text-muted-foreground">Fan data unavailable — the audience endpoint did not respond.</p>
            </SectionPanel>
          }>
            <SkeletonBlock class="fan-growth-card" style={{ 'min-height': '120px', 'border-radius': 'var(--radius-lg)' }} />
          </Show>
        }>
          <SectionPanel class="fan-growth-card">
            <SectionTitle eyebrow="NORTH STAR" title="Fan growth" icon={<SectionIcon name="users" />} action={<Link to="/tenants/$slug/audience" params={{ slug: t.slug }} class="section-link">Audience detail →</Link>} />
            <div class="fan-growth-grid">
              <div class="fan-growth-metric">
                <span class="fan-growth-value tabular-nums">
                  <Show when={operations.data?.audience?.active_fans != null} fallback={<span class="text-muted-foreground">—</span>}>
                    {operations.data!.audience!.active_fans!.toLocaleString()}
                  </Show>
                </span>
                <span class="fan-growth-label">Active fans</span>
              </div>
              <div class="fan-growth-metric">
                <span class="fan-growth-value tabular-nums">
                  <Show when={operations.data?.audience?.ticket_buyers != null} fallback={<span class="text-muted-foreground">—</span>}>
                    {operations.data!.audience!.ticket_buyers!.toLocaleString()}
                  </Show>
                </span>
                <span class="fan-growth-label">Ticket buyers</span>
              </div>
              <div class="fan-growth-metric">
                <span class="fan-growth-value tabular-nums">
                  <Show when={operations.data?.audience?.attendees != null} fallback={<span class="text-muted-foreground">—</span>}>
                    {operations.data!.audience!.attendees!.toLocaleString()}
                  </Show>
                </span>
                <span class="fan-growth-label">Attendees</span>
              </div>
              <div class="fan-growth-metric">
                <span class="fan-growth-value tabular-nums">
                  <Show when={operations.data?.audience?.paid_ticket_orders != null} fallback={<span class="text-muted-foreground">—</span>}>
                    {operations.data!.audience!.paid_ticket_orders!.toLocaleString()}
                  </Show>
                </span>
                <span class="fan-growth-label">Paid orders</span>
              </div>
              <div class="fan-growth-metric">
                <span class="fan-growth-value tabular-nums">
                  <Show when={operations.data?.audience?.qualified_referrals != null} fallback={<span class="text-muted-foreground">—</span>}>
                    {operations.data!.audience!.qualified_referrals!.toLocaleString()}
                  </Show>
                </span>
                <span class="fan-growth-label">Qualified referrals</span>
              </div>
              <div class="fan-growth-metric">
                <span class="fan-growth-value tabular-nums">
                  <Show when={operations.data?.audience?.marketing_consented_fans != null} fallback={<span class="text-muted-foreground">—</span>}>
                    {operations.data!.audience!.marketing_consented_fans!.toLocaleString()}
                  </Show>
                </span>
                <span class="fan-growth-label">Marketing consented</span>
              </div>
            </div>
            <Show when={operations.data?.signal?.activity}>
              <div class="fan-growth-rate">
                <Show when={operations.data!.signal!.activity!.new_fans_7d != null}>
                  <span class="fan-growth-delta tabular-nums">{operations.data!.signal!.activity!.new_fans_7d} new fans (7d)</span>
                </Show>
                <Show when={operations.data!.signal!.activity!.new_fans_30d != null}>
                  <span class="text-muted-foreground tabular-nums">{operations.data!.signal!.activity!.new_fans_30d} new fans (30d)</span>
                </Show>
              </div>
            </Show>
          </SectionPanel>
        </Show>

        <div class="detail-grid">
          <TenantRuntimePanel slug={t.slug} initial={{ runtime: t.runtime, runtimeHealth: t.runtimeHealth }} />
          <SectionPanel class="products-panel">
            <SectionTitle eyebrow="PRODUCTS" title="Entitlements" icon={<SectionIcon name="shield" />} action={<Button variant="ghost" size="sm" onClick={() => setEditingMobileApps(true)}>Edit Play Store URLs</Button>} />
            <div class="product-row product-entitlement-row"><strong>CrowdRelay</strong><div class="product-action-slot" aria-hidden="true"/><div class="product-status-slot"><StatusBadge status="enabled" tone="good" /></div></div>
            <div class="product-row product-entitlement-row"><strong>Signal</strong><div class="product-action-slot"><Show when={t.signalEnabled && t.signalPlayStoreUrl}><a href={t.signalPlayStoreUrl!} target="_blank" rel="noopener noreferrer" class="play-store-link"><img src="/icons/google-play-badge.svg" alt="Get it on Google Play" width="100" height="30" /></a></Show></div><div class="product-status-slot"><StatusBadge status={t.signalEnabled ? 'enabled' : 'disabled'} tone={t.signalEnabled ? 'good' : 'muted'} /></div></div>
            <div class="product-row product-entitlement-row"><strong>AREA</strong><div class="product-action-slot"><Link class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors h-8 px-3 text-xs text-secondary-foreground hover:bg-surface-3 hover:text-foreground" to="/tenants/$slug/area" params={{slug:t.slug}}>Manage</Link></div><div class="product-status-slot"><StatusBadge status={t.areaEnabled ? 'enabled' : 'disabled'} tone={t.areaEnabled ? 'good' : 'muted'} /></div></div>
            <div class="product-row product-entitlement-row"><strong>Synesthesia</strong><div class="product-action-slot"><Show when={t.synesthesiaEnabled && t.synesthesiaPlayStoreUrl}><a href={t.synesthesiaPlayStoreUrl!} target="_blank" rel="noopener noreferrer" class="play-store-link"><img src="/icons/google-play-badge.svg" alt="Get it on Google Play" width="100" height="30" /></a></Show></div><div class="product-status-slot"><StatusBadge status={t.synesthesiaEnabled ? 'enabled' : 'disabled'} tone={t.synesthesiaEnabled ? 'good' : 'muted'} /></div></div>
          </SectionPanel>
        </div>
        <RegionalProfilePanel tenant={t} />
        <SectionPanel><SectionTitle eyebrow="BRANDING" title="CrowdRelay + Signal palette" icon={<SectionIcon name="palette" />} action={t.brandingPalette ? <Button variant="ghost" size="sm" disabled={branding.isPending} onClick={() => branding.mutate(null)}>{branding.isPending && <Spinner />} Reset to product defaults</Button> : <StatusBadge status="Inherits current product defaults" />} /><Show when={t.brandingPalette || editingPalette()} fallback={<div class="p-4"><p>No custom palette stored. Both apps use their default colors.</p><Button variant="ghost" size="sm" onClick={() => setEditingPalette(true)}>Create custom palette</Button></div>}><p>Ten colours sent to this tenant's CrowdRelay and Signal builds. Nothing changes until you save; resetting removes the override.</p><div class="palette-grid"><For each={paletteFields}>{field => <label><span class="palette-field-name">{paletteLabels[field].label}</span><span class="palette-field-role">{paletteLabels[field].role}</span><div class="color-input"><input type="color" aria-label={paletteLabels[field].label} value={palette()[field]} onInput={(e) => setPalette(current => ({ ...current, [field]: e.currentTarget.value }))}/><code>{palette()[field]}</code></div></label>}</For></div><Button size="sm" onClick={() => branding.mutate(palette())} disabled={branding.isPending}>{branding.isPending && <Spinner />} {branding.isPending ? 'Saving…' : 'Save custom palette'}</Button></Show></SectionPanel>

        <Show when={t.signalEnabled || t.synesthesiaEnabled}>
          <SectionPanel class="mobile-app-setup-panel">
            <SectionTitle eyebrow="MOBILE APPS" title="Google Play setup" icon={<SectionIcon name="play" />} />
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
                <p>Run in the virya-signal repo to onboard the Signal app:</p>
                <pre><code>bash scripts/onboard-tenant-app.sh \<br/>  --tenant {t.slug} \<br/>  --control-plane-url {window.location.origin.replace(/:\d+$/, '')} \<br/>  --token $CONTROL_PLANE_ADMIN_TOKEN \<br/>  --version 0.1.0 --version-code 1</code></pre>
              </div>
            </Show>
          </SectionPanel>
        </Show>

        <Show when={editingMobileApps()}>
          <div class="dialog-overlay" onClick={() => setEditingMobileApps(false)}>
            <div class="dialog-panel" onClick={(e) => e.stopPropagation()}>
              <SectionTitle eyebrow="MOBILE APPS" title="Google Play Store URLs" icon={<SectionIcon name="play" />} />
              <p class="wizard-intro">Set the Google Play Store URL for each tenant mobile app. Leave blank if the app is not yet published.</p>
              <div class="form-grid">
                <label>Signal Play Store URL<input value={signalPlayUrl()} onInput={(e) => setSignalPlayUrl(e.currentTarget.value)} placeholder="https://play.google.com/store/apps/details?id=music.{t.slug}.signal" /></label>
                <label>Synesthesia Play Store URL<input value={synesthesiaPlayUrl()} onInput={(e) => setSynesthesiaPlayUrl(e.currentTarget.value)} placeholder="https://play.google.com/store/apps/details?id=music.{t.slug}.synesthesia" /></label>
              </div>
              <Show when={mobileApps.error}><ErrorCard>{mobileApps.error instanceof Error ? mobileApps.error.message : 'Failed to update Play Store URLs'}</ErrorCard></Show>
              <div class="form-actions right">
                <Button variant="ghost" size="sm" onClick={() => setEditingMobileApps(false)}>Cancel</Button>
                <button onClick={() => mobileApps.mutate({ signalPlayStoreUrl: signalPlayUrl().trim() || null, synesthesiaPlayStoreUrl: synesthesiaPlayUrl().trim() || null })} disabled={mobileApps.isPending}>{mobileApps.isPending && <Spinner />} {mobileApps.isPending ? 'Saving…' : 'Save URLs'}</button>
              </div>
            </div>
          </div>
        </Show>
      </TabPanel>

      {/* ── Deployment tab — provisioning, operations, release ledger ── */}
      <TabPanel active={activeTab()} id="deployment" visited={isVisited('deployment')}>
        <Show when={operations.isPending}><SkeletonSection titleWidth="180px" lines={4} minHeight="180px" /></Show>
        <Show when={operations.error}><ErrorCard>{errorMessage(operations.error, 'Operations read model unavailable')}</ErrorCard></Show>
        <SectionPanel class="provisioning-panel">
          <SectionTitle eyebrow="PROVISIONING" title="CrowdRelay instance" icon={<SectionIcon name="server" />} action={<Show when={latestJob()}>{job => <StatusBadge status={job().status} tone={provisionTone(job().status)} />}</Show>} />
          <Show when={capabilities()?.canProvision !== false} fallback={<div class="p-4"><p>This tenant stays on its existing production CrowdRelay deployment.</p></div>}>
            <p>The browser only requests desired state. A separately authenticated host agent claims the job and runs the deployment.</p>
            <div class="deployment-target-grid">
              <div><span>Public API</span><strong>{t.crowdrelayBaseUrl ?? 'not configured'}</strong></div>
              <div><span>Signal / site</span><strong>{t.signalBaseUrl ?? 'not configured'}</strong></div>
              <div><span>Provisioner</span><strong>{platform()?.provisionerConfigured ? 'configured' : 'not configured'}</strong></div>
            </div>
            <div class="provision-row">
              <input class={!releaseReady() && desiredVersion().trim() ? 'input-invalid' : ''} value={desiredVersion()} onInput={(e) => setDesiredVersion(e.currentTarget.value)} placeholder="Leave blank for latest release" aria-label="Desired release version" aria-invalid={!releaseReady() && Boolean(desiredVersion().trim())} />
              <Button variant="ghost" size="sm" onClick={() => plan.mutate()} disabled={plan.isPending || deploymentBusy() || !releaseReady()}>Preview</Button>
              <button onClick={() => deploy.mutate()} disabled={deploy.isPending || deploymentBusy() || !releaseReady() || t.status === 'suspended' || !t.crowdrelayBaseUrl || !t.signalBaseUrl}>{latestJob()?.status === 'failed' ? 'Retry deploy' : t.status === 'active' ? 'Deploy / upgrade' : 'Deploy instance'}</button>
            </div>
            <Show when={deploy.error}><ErrorCard>{deploy.error instanceof Error ? deploy.error.message : 'Deployment request failed'}</ErrorCard></Show>
            <Show when={preview()}>{job => <div class="plan-preview"><pre>{JSON.stringify(job().plan, null, 2)}</pre></div>}</Show>
            <Show when={latestJob()}>{job => <div class="provision-job">
              <div class="provision-job-head"><div><strong>{job().status === 'succeeded' ? 'Deployed' : job().status === 'failed' ? 'Deployment failed' : job().status === 'running' ? 'Deploying…' : job().status === 'approved' ? 'Queued' : 'Planned'}</strong><small>attempt {job().attemptCount} · {new Date(job().createdAt).toLocaleString()}</small></div><div class="provision-job-badges"><StatusBadge status={job().status} tone={provisionTone(job().status)} /></div></div>
              <Show when={job().status === 'approved'}><p>Queued for the provisioner agent. No Docker mutation happens in the HTTP request.</p></Show>
              <Show when={job().status === 'running'}><p>The provisioner agent is deploying. This typically takes 2–5 minutes.</p></Show>
              <Show when={job().status === 'succeeded'}><div class="deployment-result"><dl><dt>Local API</dt><dd><code>{job().result?.localApiUrl ?? '—'}</code></dd><dt>Host port</dt><dd>{job().result?.apiPort ?? '—'}</dd><dt>Schema</dt><dd>{job().result?.schemaVersion ?? '—'}</dd></dl><p class="route-note">The instance is healthy locally. Route <code>{t.crowdrelayBaseUrl}</code> at the edge to this host port to expose it publicly.</p></div></Show>
              <Show when={job().status === 'failed' ? (job().errorCode ?? 'provisioning_failed') : undefined}>{code => <ErrorCard>
                <strong>{provisionFailures[code()]?.title ?? 'Deployment failed'}</strong>
                <Show when={provisionFailures[code()]}>{failure => <>
                  <p>{failure().guidance}</p>
                  <Show when={!failure().retryable}><p class="route-note">Retrying will not help until the underlying cause is fixed.</p></Show>
                </>}</Show>
              </ErrorCard>}</Show>
              <Show when={['planned','approved'].includes(job().status)}><Button variant="destructive-ghost" size="sm" onClick={() => cancel.mutate()} disabled={cancel.isPending}>Cancel queued deployment</Button></Show>
            </div>}</Show>
          </Show>
        </SectionPanel>

        <Show when={operations.data}>
          {ops => <OperationsPanel
            slug={t.slug}
            summary={ops()?.summary ?? null}
            flags={ops()?.flags ?? null}
            autopilot={ops()?.autopilot ?? null}
            degraded={ops()?.degraded ?? []}
            sections={ops()?.sections}
            freshness={ops()?.freshness}
            fetchedAt={ops()?.fetchedAt}
            refresh={async () => { await queryClient.invalidateQueries({ queryKey: ['tenant-operations', params().slug] }) }}
            mode="health"
            canRedeploy={capabilities()?.canRedeploy}
          />}
        </Show>

        <ReleaseConvergencePanel releaseLedger={operations.data?.autopilot?.release_ledger ?? null} />
      </TabPanel>

      {/* ── Access tab — operators, audit, opt-out, danger zone ── */}
      <TabPanel active={activeTab()} id="access" visited={isVisited('access')}>
        <TenantOperatorsPanel slug={t.slug} />
        <TenantAuditPanel items={model.data?.audit.items ?? []} />

        {/* Tenant-initiated opt-out. Available to tenant operators on
            non-Virya tenants. Records the request in the audit trail — the
            crew then uses the admin-side Remove button to complete it. */}
        <Show when={!isAdmin() && capabilities()?.canOptOut === true}>
          <SectionPanel class="tenant-opt-out">
            <SectionTitle eyebrow="LEAVING" title="Opt out of the platform" icon={<SectionIcon name="alert-triangle" />} />
            <Show when={optOutDone()} fallback={
              <>
                <p>
                  Request an opt-out to leave the platform. Your request is recorded and sent to the crew, who will contact you to confirm before removing your tenant data. Your CrowdRelay workspace keeps running until shut down separately.
                </p>
                <p class="route-note">
                  To expedite, also email <a href="mailto:virya.crew@gmail.com?subject=Opt%20out%3A%20{encodeURIComponent(t.displayName)}&body=Tenant%3A%20{encodeURIComponent(t.slug)}%0A%0AI%20want%20to%20opt%20out%20of%20the%20CrowdRelay%20platform.%20Please%20remove%20my%20tenant%20data.">virya.crew@gmail.com</a>.
                </p>
                <Show when={optOut.isError}>
                  <ErrorCard>{errorMessage(optOut.error, 'Opt-out request failed')}</ErrorCard>
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
                  <Button
                    variant="destructive-ghost"
                    size="sm"
                    disabled={optOutConfirm().trim() !== t.slug || optOut.isPending}
                    onClick={() => optOut.mutate()}
                  >
                    {optOut.isPending && <Spinner />} {optOut.isPending ? 'Sending request…' : 'Request opt-out'}
                  </Button>
                </div>
              </>
            }>
              <div class="notice-card">
                <strong>Opt-out request received.</strong> The crew has been notified and will
                contact you to confirm before removing your data. No further action is needed
                from your side.
              </div>
            </Show>
          </SectionPanel>
        </Show>

        {/* Admin-only removal. Rendered from the server's capability flag, never
            from the slug. And `=== true` rather than `!== false`: for a
            destructive action an absent or still-loading capability must read
            as "not allowed", which is the opposite default from the reads
            above. Tenant operators never see this — they use Opt out instead. */}
        <Show when={isAdmin() && capabilities()?.canRemove === true}>
          <SectionPanel class="tenant-danger-zone">
            <SectionTitle eyebrow="DANGER ZONE" title="Remove tenant" icon={<SectionIcon name="alert-triangle" />} />
            <p>
              Unregisters <strong>{t.displayName}</strong> from the control plane: operators, runtime status, and provisioning history are deleted. The tenant's CrowdRelay workspace is not touched — it keeps running until shut down separately. The audit trail survives.
            </p>
            <Show when={remove.isError}>
              <ErrorCard>{errorMessage(remove.error, 'Tenant removal failed')}</ErrorCard>
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
              <Button
                variant="destructive-ghost"
                size="sm"
                disabled={removalConfirm().trim() !== t.slug || remove.isPending}
                onClick={() => remove.mutate()}
              >
                {remove.isPending && <Spinner />} {remove.isPending ? 'Removing…' : 'Remove this tenant'}
              </Button>
            </div>
          </SectionPanel>
        </Show>
      </TabPanel>
    </>
  }}</Show></PageShell>
}
