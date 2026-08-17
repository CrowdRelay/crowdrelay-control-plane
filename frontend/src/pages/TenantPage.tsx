import { For, Show, createEffect, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import type { Palette, ProvisioningJob, RuntimeHealth } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'

const paletteFields: Array<keyof Palette> = ['primary','primaryContrast','accent','surface','surfaceElevated','text','textMuted','success','warning','danger']
const defaultPalette: Palette = { primary:'#8b5cf6', primaryContrast:'#ffffff', accent:'#22d3ee', surface:'#0b0c0f', surfaceElevated:'#15171c', text:'#f7f7f8', textMuted:'#9ca3af', success:'#22c55e', warning:'#f59e0b', danger:'#ef4444' }
const runtimeTone = (health: RuntimeHealth) => health === 'healthy' ? 'good' : health === 'degraded' ? 'bad' : health === 'stale' ? 'warn' : 'muted'
const provisionTone = (status: ProvisioningJob['status']) => status === 'succeeded' ? 'good' : status === 'failed' ? 'bad' : status === 'cancelled' ? 'muted' : 'warn'
const formatTimestamp = (value: string | null | undefined) => {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString()
}
// The provisioner reports machine-readable failure codes. An operator deciding
// whether to retry needs to know which failures are safe to retry and which mean
// the release itself is untrustworthy, so each code carries explicit guidance
// rather than being surfaced as a bare identifier.
const provisionFailures: Record<string, { title: string; guidance: string; retryable: boolean }> = {
  image_revision_mismatch: { title: 'Image was built from a different commit', guidance: 'The published image does not carry the git SHA this release asked for. The tag was rebuilt or overwritten. Do not retry until the release is republished from the intended commit.', retryable: false },
  image_revision_missing: { title: 'Image is missing its provenance label', guidance: 'The image does not publish org.opencontainers.image.revision, so its origin cannot be verified. Republish it from CrowdRelay CI.', retryable: false },
  image_digest_changed: { title: 'Release now points at different bytes', guidance: 'This release identifier previously resolved to another image digest. The tag was re-pushed. Deployment stopped before starting the new image; investigate the registry before retrying.', retryable: false },
  image_digest_unresolved: { title: 'Image has no registry digest', guidance: 'The pulled image could not be resolved to an immutable digest. Confirm the image exists in the registry and was pulled, not built locally.', retryable: false },
  image_digest_ambiguous: { title: 'Image resolves to multiple digests', guidance: 'Several registry digests match this repository. Clean the local image cache on the provisioner host and retry.', retryable: true },
  image_pull_failed: { title: 'Image pull failed', guidance: 'The provisioner host could not pull the image. Check registry credentials and network from that host, then retry.', retryable: true },
  lease_lost: { title: 'Deployment lost its lease', guidance: 'Another provisioner reclaimed this job mid-deployment, so this agent stopped rather than keep mutating Docker state. Safe to retry.', retryable: true },
  port_pool_exhausted: { title: 'No free tenant port', guidance: 'Every port in the configured range is allocated. Widen the range or release a retired tenant, then retry.', retryable: false },
  port_allocation_conflict: { title: 'Tenant port is double-claimed', guidance: 'Two tenants recorded the same host port. Resolve the conflicting deployment record on the host before retrying.', retryable: false },
  api_readiness_timeout: { title: 'CrowdRelay API never became ready', guidance: 'The stack started but its readiness probe never passed. Inspect the tenant container logs on the host. Retrying is safe.', retryable: true },
  workspace_probe_failed: { title: 'Workspace was not created', guidance: 'Bootstrap finished without producing the expected workspace. Inspect the setup container output before retrying.', retryable: true },
  schema_probe_failed: { title: 'Migration state is unreadable', guidance: 'The schema version probe did not return an integer. Inspect the tenant database before retrying.', retryable: true },
  docker_compose_failed: { title: 'Docker Compose step failed', guidance: 'A Compose step exited non-zero. The provisioner log holds the bounded output tail for this deployment.', retryable: true },
  docker_compose_unavailable: { title: 'Docker is unavailable', guidance: 'The provisioner host could not run Docker Compose, or the step timed out. Check the host daemon, then retry.', retryable: true },
  invalid_plan: { title: 'Deployment plan was rejected', guidance: 'The agent refused the plan as unsafe or malformed. This is a Control Plane defect; the plan must be corrected before retrying.', retryable: false },
}

export function TenantPage() {
  const params = useParams({ from: '/tenants/$slug' })
  const queryClient = useQueryClient()
  const tenant = useQuery(() => ({ queryKey: ['tenant', params().slug], queryFn: () => api.tenant(params().slug), refetchInterval: 15_000 }))
  const overview = useQuery(() => ({ queryKey: ['overview'], queryFn: api.overview }))
  const audit = useQuery(() => ({ queryKey: ['tenant-audit', params().slug], queryFn: () => api.audit(params().slug), refetchInterval: 15_000 }))
  const provisioning = useQuery(() => ({ queryKey: ['tenant-provisioning', params().slug], queryFn: () => api.provisioning(params().slug), refetchInterval: 3_000 }))
  const [palette, setPalette] = createSignal<Palette>(defaultPalette)
  const [editingPalette, setEditingPalette] = createSignal(false)
  const [desiredVersion, setDesiredVersion] = createSignal('')
  const [preview, setPreview] = createSignal<ProvisioningJob | null>(null)
  createEffect(() => { if (tenant.data?.brandingPalette) setPalette(tenant.data.brandingPalette) })

  const refreshTenant = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tenant', params().slug] }),
      queryClient.invalidateQueries({ queryKey: ['tenant-provisioning', params().slug] }),
      queryClient.invalidateQueries({ queryKey: ['tenant-audit', params().slug] }),
      queryClient.invalidateQueries({ queryKey: ['overview'] }),
    ])
  }
  const branding = useMutation(() => ({ mutationFn: (value: Palette | null) => api.branding(params().slug, value), onSuccess: refreshTenant }))
  const status = useMutation(() => ({ mutationFn: (action: 'suspend'|'resume') => action === 'suspend' ? api.suspend(params().slug) : api.resume(params().slug), onSuccess: refreshTenant }))
  const plan = useMutation(() => ({ mutationFn: () => api.planProvisioning(params().slug, desiredVersion() || overview.data?.provisionerDefaultImageTag || undefined), onSuccess: (job) => setPreview(job) }))
  const deploy = useMutation(() => ({ mutationFn: () => api.deployTenant(params().slug, desiredVersion()), onSuccess: async () => { setPreview(null); await refreshTenant() } }))
  const cancel = useMutation(() => ({ mutationFn: () => api.cancelProvisioning(params().slug), onSuccess: refreshTenant }))
  const latestJob = () => provisioning.data?.items[0]
  const deploymentBusy = () => ['planned', 'approved', 'running'].includes(latestJob()?.status ?? '')

  return <section class="page"><Show when={tenant.data} fallback={<div class="skeleton-block"/>}>{data => {
    const t = data()
    return <>
      <div class="page-head">
        <div><span class="eyebrow">TENANT / {t.slug.toUpperCase()}</span><h1>{t.displayName}</h1><p>{t.workspaceId ?? 'Workspace mapping pending'} · {t.defaultCountryCode}</p></div>
        <div class="row-health"><StatusBadge status={t.status} tone={t.status === 'active' ? 'good' : t.status === 'suspended' ? 'bad' : 'warn'} />{t.slug !== 'virya' && <button class="ghost" onClick={() => status.mutate(t.status === 'suspended' ? 'resume' : 'suspend')}>{t.status === 'suspended' ? 'Resume' : 'Suspend'}</button>}</div>
      </div>
      <div class="detail-grid">
        <article class="panel"><div class="section-title"><div><span class="eyebrow">RUNTIME</span><h2>Health</h2></div><StatusBadge status={t.runtimeHealth} tone={runtimeTone(t.runtimeHealth)} /></div><dl><dt>API</dt><dd>{String(t.runtime?.apiHealthy ?? 'unknown')}</dd><dt>Worker</dt><dd>{String(t.runtime?.workerHealthy ?? 'unknown')}</dd><dt>Schema</dt><dd>{t.runtime?.schemaVersion ?? '—'}</dd><dt>Deploy SHA</dt><dd class="mono">{t.runtime?.deployedSha?.slice(0,12) ?? '—'}</dd><dt>Outbox pending</dt><dd>{t.runtime?.outboxPending ?? '—'}</dd><dt>Heartbeat</dt><dd>{t.runtime?.lastHeartbeatAt ? new Date(t.runtime.lastHeartbeatAt).toLocaleString() : '—'}</dd></dl></article>
        <article class="panel"><span class="eyebrow">PRODUCTS</span><h2>Entitlements</h2><div class="product-row"><strong>CrowdRelay</strong><StatusBadge status="enabled" tone="good" /></div><div class="product-row"><strong>Signal</strong><StatusBadge status="enabled" tone="good" /></div><div class="product-row"><strong>Synesthesia</strong><StatusBadge status={t.synesthesiaEnabled ? 'Virya only' : 'not available'} tone={t.synesthesiaEnabled ? 'warn' : 'muted'} /></div></article>
      </div>
      <article class="panel"><div class="section-title"><div><span class="eyebrow">BRANDING</span><h2>CrowdRelay + Signal palette</h2></div>{t.brandingPalette ? <button class="ghost" onClick={() => branding.mutate(null)}>Reset to product defaults</button> : <StatusBadge status="Inherits current product defaults" />}</div><Show when={t.brandingPalette || editingPalette()} fallback={<div class="inherit-card"><p>No palette is stored for this tenant. CrowdRelay and Signal therefore keep their own current default colors with zero theming lookup required.</p><button class="ghost" onClick={() => setEditingPalette(true)}>Create custom palette</button></div>}><div class="palette-grid"><For each={paletteFields}>{field => <label>{field}<div class="color-input"><input type="color" value={palette()[field]} onInput={(e) => setPalette(current => ({ ...current, [field]: e.currentTarget.value }))}/><code>{palette()[field]}</code></div></label>}</For></div><button onClick={() => branding.mutate(palette())} disabled={branding.isPending}>Save custom palette</button></Show></article>

      <article class="panel provisioning-panel">
        <div class="section-title">
          <div><span class="eyebrow">PROVISIONING</span><h2>CrowdRelay instance</h2></div>
          <Show when={latestJob()}>{job => <StatusBadge status={job().status} tone={provisionTone(job().status)} />}</Show>
        </div>
        <Show when={t.slug !== 'virya'} fallback={<div class="inherit-card"><p>Virya stays on the existing production CrowdRelay deployment. The tenant provisioner intentionally refuses to create a second Virya stack.</p></div>}>
          <p>The browser only requests desired state. A separately authenticated host agent claims the job and runs a fixed Docker Compose recipe; the Control Plane API never receives Docker access.</p>
          <div class="deployment-target-grid">
            <div><span>Public API</span><strong>{t.crowdrelayBaseUrl ?? 'not configured'}</strong></div>
            <div><span>Signal / site</span><strong>{t.signalBaseUrl ?? 'not configured'}</strong></div>
            <div><span>Provisioner</span><strong>{overview.data?.provisionerConfigured ? 'configured' : 'not configured'}</strong></div>
            <div><span>Default release</span><strong class="mono">{overview.data?.provisionerDefaultImageTag?.slice(0, 16) ?? 'not configured'}</strong></div>
          </div>
          <div class="provision-row">
            <input value={desiredVersion()} onInput={(e) => setDesiredVersion(e.currentTarget.value)} placeholder={overview.data?.provisionerDefaultImageTag ?? 'sha-<40-char CrowdRelay commit>'} />
            <button class="ghost" onClick={() => plan.mutate()} disabled={plan.isPending || deploymentBusy()}>Preview</button>
            <button onClick={() => deploy.mutate()} disabled={deploy.isPending || deploymentBusy() || t.status === 'suspended' || !t.crowdrelayBaseUrl || !t.signalBaseUrl}>{latestJob()?.status === 'failed' ? 'Retry deploy' : t.status === 'active' ? 'Deploy / upgrade' : 'Deploy instance'}</button>
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

      <article class="panel"><span class="eyebrow">AUDIT</span><h2>Recent platform changes</h2><div class="audit-list"><For each={audit.data?.items ?? []}>{item => <div class="audit-row"><div><strong>{item.action}</strong><small>{item.actor} · {new Date(item.createdAt).toLocaleString()}</small></div><code>{item.targetKind}</code></div>}</For></div></article>
    </>
  }}</Show></section>
}
