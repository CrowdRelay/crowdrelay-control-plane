import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { Link, useNavigate, useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { errorMessage, relativeTime } from '../lib/format'
import { Check, Circle, RefreshCw } from 'lucide-solid'
import { cn } from '../lib/cn'
import type { Palette, ProvisioningJob } from '../lib/types'
import { ReleaseConvergencePanel } from '../components/ReleaseConvergencePanel'
import { StatusBadge } from '../components/StatusBadge'
import { RegionalProfilePanel } from '../components/RegionalProfilePanel'
import { SectionIcon } from '../components/SectionIcon'
import { TenantAuditPanel } from '../components/TenantAuditPanel'
import { TenantOperatorsPanel } from '../components/TenantOperatorsPanel'
import { TenantSecretsPanel } from '../components/TenantSecretsPanel'
import { NotifiersPanel } from '../components/NotifiersPanel'
import { WorkspaceSettingsPanel } from '../components/WorkspaceSettingsPanel'
import { Dialog } from '../components/Dialog'
import { SkeletonTenantPage, SkeletonSection } from '../components/Skeleton'
import { ErrorCard, PageHeader, PageShell, Section, TabBar, TabPanel, useTabPanels } from '../components/layout'
import { Alert } from '../components/app/alert'
import { Spinner } from '../components/Spinner'
import { Button } from '../components/app/button'
import { ColorInput } from '../components/ui/color-input'
import { Input } from '../components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/app/table'
import { Field, FieldGrid, ReadField, Unset } from '../components/ui/field'
import { buttonVariants } from '../components/app/button'
import { writeGuard } from '../lib/read-only'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'

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
  // This page is the tenant's Settings surface — products, region, brand,
  // deployment and access. The daily read (fans, the next night, this week's
  // moves) used to live here as a second copy of Today on the bare tenant
  // URL; Today has one home now — `/operations`, which the bare URL and
  // `?tab=today` redirect to in the router. The sidebar's Settings item
  // points at `?tab=profile`.
  const platformView = authState.isPlatformLevel()
  // The band used to get no tab bar — a second sidebar entry it did not have
  // meant Deployment and Access were platform-only in practice. Workspace
  // (the editable settings, moved out of Audience) is exactly the surface a
  // band operator drives themselves, so the bar now shows for both roles.
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('profile', ['profile', 'workspace', 'deployment', 'access', 'destinations'])

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

  // Operations read model — the Deployment tab is its only consumer here
  // (release ledger, instance state). Today reads it on /operations, which
  // is a different page with its own copy of the query.
  const operations = useQuery(() => ({
    queryKey: ['tenant-today', params().slug],
    queryFn: () => api.tenantToday(params().slug),
    enabled: isVisited('deployment'),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // A section the tenant could not answer lands here as 200 with the
    // section named in `degraded`, so nothing retries it and the panel
    // stays empty for the life of the tab. Keep asking until it fills.
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))
  // The ninety-day guarantee is a Deployment-tab read — the promise attached
  // to the instance, next to the switch that deploys it.
  const guarantee = useQuery(() => ({
    queryKey: ['tenant-guarantee', params().slug],
    queryFn: () => api.tenantGuarantee(params().slug),
    enabled: isVisited('deployment'),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
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
    await queryClient.invalidateQueries({ queryKey: ['tenant-today', params().slug] })
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

  // The page's read models, refreshed together.
  const PAGE_KEYS = ['tenant-overview', 'tenant-today', 'tenant-runtime', 'tenant-operators']
  const refreshPage = () => void queryClient.invalidateQueries({ predicate: q => q.queryKey[1] === params().slug && PAGE_KEYS.includes(String(q.queryKey[0])) })
  const refreshing = () => model.isFetching || operations.isFetching
  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now()
    const ts = Math.max(model.dataUpdatedAt, operations.dataUpdatedAt)
    return ts === 0 ? null : relativeTime(ts)
  })
  const statusTone = (s: string) => s === 'active' ? 'good' : s === 'suspended' ? 'bad' : 'warn'

  return <PageShell>
    <Show when={tenant.error}><ErrorCard>{errorMessage(tenant.error, authState.isPlatformLevel() ? 'Tenant could not be loaded' : 'Your act could not be loaded')}</ErrorCard></Show>
    <Show when={!tenant.error && tenant.data} fallback={!tenant.error ? <SkeletonTenantPage /> : null}>{data => {
    const t = data()


    // ── Settings — products, region, brand, publishing ──
    const Settings = () => <>
          <Section
            title="Products"
            icon={<SectionIcon name="shield" />}
            description={authState.isPlatformLevel() ? 'Which apps this tenant is entitled to, and where each one is published.' : 'Which apps your act is entitled to, and where each one is published.'}
            action={<Button writes variant="outline" size="sm" onClick={() => setEditingMobileApps(true)}>Edit Play Store URLs</Button>}
          >
            {/* Four hand-built three-column CSS grids, each declaring its own
                template inline, is a table that has not admitted it is one. */}
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Where it lives</TableHead><TableHead class="text-right">Status</TableHead></TableRow></TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell><strong>CrowdRelay</strong></TableCell>
                  <TableCell class="text-muted-foreground">{authState.isPlatformLevel() ? "The tenant's own API and workspace" : "Your act's own API and workspace"}</TableCell>
                  <TableCell class="text-right"><StatusBadge status="enabled" tone="good" /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><strong>Signal</strong></TableCell>
                  <TableCell>
                    <Show when={t.signalEnabled && t.signalPlayStoreUrl} fallback={<span class="text-muted-foreground">{t.signalEnabled ? 'not published yet' : '—'}</span>}>
                      <a href={t.signalPlayStoreUrl!} target="_blank" rel="noopener noreferrer" class="inline-block"><img src="/icons/google-play-badge.svg" alt="Get it on Google Play" width="100" height="30" /></a>
                    </Show>
                  </TableCell>
                  <TableCell class="text-right"><StatusBadge status={t.signalEnabled ? 'enabled' : 'disabled'} tone={t.signalEnabled ? 'good' : 'muted'} /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><strong>AREA</strong></TableCell>
                  <TableCell><Link class={buttonVariants({ variant: 'ghost', size: 'sm' })} to="/tenants/$slug/area" params={{ slug: t.slug }}>Manage rewards</Link></TableCell>
                  <TableCell class="text-right"><StatusBadge status={t.areaEnabled ? 'enabled' : 'disabled'} tone={t.areaEnabled ? 'good' : 'muted'} /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><strong>Synesthesia</strong></TableCell>
                  <TableCell>
                    <Show when={t.synesthesiaEnabled && t.synesthesiaPlayStoreUrl} fallback={<span class="text-muted-foreground">{t.synesthesiaEnabled ? 'not published yet' : '—'}</span>}>
                      <a href={t.synesthesiaPlayStoreUrl!} target="_blank" rel="noopener noreferrer" class="inline-block"><img src="/icons/google-play-badge.svg" alt="Get it on Google Play" width="100" height="30" /></a>
                    </Show>
                  </TableCell>
                  <TableCell class="text-right"><StatusBadge status={t.synesthesiaEnabled ? 'enabled' : 'disabled'} tone={t.synesthesiaEnabled ? 'good' : 'muted'} /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Section>
          <RegionalProfilePanel tenant={t} />
          <Show when={t.teamMembers.length > 0}>
            <Section
              title="Crew roster"
              icon={<SectionIcon name="users" />}
              description="The people the brain can hand work to. Collected at onboarding and shipped with every deploy — skills decide what the router may ask of each member."
            >
              <ul class="divide-y divide-border rounded-lg border border-border">
                <For each={t.teamMembers}>{member => (
                  <li class="flex items-start gap-3 p-3">
                    <div class="min-w-0 flex-1">
                      <strong class="text-sm text-foreground">{member.name}</strong>
                      <small class="block break-words text-xs text-muted-foreground">{member.email} · {member.key}</small>
                    </div>
                    <div class="flex flex-wrap justify-end gap-1.5">
                      <For each={member.skills}>{skill => (
                        <span class="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">{skill.replaceAll('_', ' ')}</span>
                      )}</For>
                    </div>
                  </li>
                )}</For>
              </ul>
            </Section>
          </Show>
          <Section
            title="Brand palette"
            icon={<SectionIcon name="palette" />}
            description={authState.isPlatformLevel() ? "Ten colours sent to this tenant's CrowdRelay and Signal builds. Nothing changes until you save; resetting removes the override and both apps fall back to product defaults." : "Ten colours sent to your CrowdRelay and Signal builds. Nothing changes until you save; resetting removes the override and both apps fall back to product defaults."}
            action={t.brandingPalette
              ? <Button writes variant="outline" size="sm" disabled={branding.isPending} onClick={() => branding.mutate(null)}>{branding.isPending && <Spinner />} Reset to defaults</Button>
              : <StatusBadge status="product defaults" />}
          >
            <Show when={t.brandingPalette || editingPalette()} fallback={
              <div class="flex flex-wrap items-center gap-3">
                <p class="m-0 text-sm text-muted-foreground">No custom palette stored. Both apps use their own default colours.</p>
                <Button writes variant="outline" size="sm" onClick={() => setEditingPalette(true)}>Create custom palette</Button>
              </div>
            }>
              <div class="grid grid-cols-2 gap-4 md:grid-cols-5">
                <For each={paletteFields}>{field => (
                  <label class="flex min-w-0 flex-col gap-1.5">
                    <span class="text-sm font-medium leading-none text-foreground">{paletteLabels[field].label}</span>
                    <div class="flex items-center gap-2">
                      <ColorInput writes aria-label={paletteLabels[field].label} value={palette()[field]} onInput={(e) => setPalette(current => ({ ...current, [field]: e.currentTarget.value }))} />
                      <code class="text-xs tabular-nums text-muted-foreground">{palette()[field]}</code>
                    </div>
                    <span class="text-xs leading-relaxed text-muted-foreground">{paletteLabels[field].role}</span>
                  </label>
                )}</For>
              </div>
              <Button writes size="sm" class="mt-4" onClick={() => branding.mutate(palette())} disabled={branding.isPending}>{branding.isPending && <Spinner />} {branding.isPending ? 'Saving…' : 'Save custom palette'}</Button>
            </Show>
          </Section>

          <Show when={t.signalEnabled || t.synesthesiaEnabled}>
            <Section
              title="Google Play setup"
              icon={<SectionIcon name="play" />}
              description={authState.isPlatformLevel()
                ? "Onboarding this tenant's mobile apps. Each step is automated by the onboarding script in the virya-signal repo."
                : 'Getting your apps onto the Play Store.'}
            >
              <ul class="divide-y divide-border rounded-lg border border-border">
                <For each={[
                  {
                    show: true,
                    done: Boolean(t.brandingPalette),
                    title: 'Branding palette',
                    detail: t.brandingPalette ? 'Custom palette configured' : 'Using product defaults — set a palette for custom app icons',
                    url: null as string | null,
                  },
                  {
                    show: t.signalEnabled,
                    done: Boolean(t.signalPlayStoreUrl),
                    title: 'Signal app published',
                    detail: authState.isPlatformLevel()
                      ? `Package: music.${t.slug}.signal — run the onboarding script to build and publish`
                      : `Package: music.${t.slug}.signal — the crew publishes this for you`,
                    url: t.signalPlayStoreUrl ?? null,
                  },
                  {
                    show: t.synesthesiaEnabled,
                    done: Boolean(t.synesthesiaPlayStoreUrl),
                    title: 'Synesthesia app published',
                    detail: authState.isPlatformLevel()
                      ? `Package: music.${t.slug}.synesthesia — run the onboarding script in the synesthesia repo`
                      : `Package: music.${t.slug}.synesthesia — the crew publishes this for you`,
                    url: t.synesthesiaPlayStoreUrl ?? null,
                  },
                ].filter(step => step.show)}>{step => (
                  <li class="flex items-start gap-3 p-3">
                    {/* The done mark painted a green check on a green disc. */}
                    <span class={cn('flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold', step.done ? 'bg-success text-success-foreground' : 'border border-border text-muted-foreground')}>
                      <Show when={step.done} fallback={<Circle size={10} aria-hidden="true" />}><Check size={12} stroke-width={3} aria-hidden="true" /></Show>
                    </span>
                    <div class="min-w-0">
                      <strong class="text-sm text-foreground">{step.title}</strong>
                      <small class="block break-words text-xs text-muted-foreground">
                        <Show when={step.url} fallback={step.detail}>
                          <a href={step.url!} target="_blank" rel="noopener noreferrer" class="text-primary hover:text-primary/80">{step.url}</a>
                        </Show>
                      </small>
                    </div>
                  </li>
                )}</For>
              </ul>
              {/* The onboarding command is operator runbook material — it
                  names an admin-token env var the band has no use for. */}
              <Show when={!t.signalPlayStoreUrl && t.signalEnabled && authState.isPlatformLevel()}>
                <div class="mt-3 rounded-lg border border-border bg-background p-3">
                  <p class="mb-2 text-sm text-muted-foreground">Run in the virya-signal repo to onboard the Signal app:</p>
                  <pre class="overflow-x-auto text-xs text-foreground"><code>bash scripts/onboard-tenant-app.sh \<br/>  --tenant {t.slug} \<br/>  --control-plane-url {window.location.origin.replace(/:\d+$/, '')} \<br/>  --token $CONTROL_PLANE_ADMIN_TOKEN \<br/>  --version 0.1.0 --version-code 1</code></pre>
                </div>
              </Show>
            </Section>
          </Show>

          <Dialog
            open={editingMobileApps()}
            onClose={() => setEditingMobileApps(false)}
            label="Google Play Store URLs"
            title="Google Play Store URLs"
            description={authState.isPlatformLevel() ? "Where each of this tenant's mobile apps is published. Leave a field blank if that app is not on the store yet." : "Where each of your apps is published. Leave a field blank if that app is not on the store yet."}
            class="max-w-lg"
            footer={<>
              <Button variant="ghost" size="sm" onClick={() => setEditingMobileApps(false)}>Cancel</Button>
              <Button writes size="sm" onClick={() => mobileApps.mutate({ signalPlayStoreUrl: signalPlayUrl().trim() || null, synesthesiaPlayStoreUrl: synesthesiaPlayUrl().trim() || null })} disabled={mobileApps.isPending}>{mobileApps.isPending && <Spinner />} {mobileApps.isPending ? 'Saving…' : 'Save URLs'}</Button>
            </>}
          >
            <Show when={mobileApps.error}><ErrorCard class="mb-4">{mobileApps.error instanceof Error ? mobileApps.error.message : 'Failed to update Play Store URLs'}</ErrorCard></Show>
            {/* These placeholders were written as plain attribute strings
                containing `{t.slug}`, which JSX passes through literally — the
                field suggested a URL with a brace in it. */}
            <div class="flex flex-col gap-4">
              <Field label="Signal Play Store URL">
                <Input value={signalPlayUrl()} onInput={(e) => setSignalPlayUrl(e.currentTarget.value)} placeholder={`https://play.google.com/store/apps/details?id=music.${t.slug}.signal`} {...writeGuard()} />
              </Field>
              <Field label="Synesthesia Play Store URL">
                <Input value={synesthesiaPlayUrl()} onInput={(e) => setSynesthesiaPlayUrl(e.currentTarget.value)} placeholder={`https://play.google.com/store/apps/details?id=music.${t.slug}.synesthesia`} {...writeGuard()} />
              </Field>
            </div>
          </Dialog>

          {/* Tenant-initiated opt-out. Tenant operators only — platform
              staff never see it (a viewer would get a disabled tenant-facing
              form), and it renders inside the band's Settings view rather
              than under the daily read. Records the request in the audit
              trail; the crew then uses the admin-side Remove button to
              complete it. */}
          <Show when={!authState.isPlatformLevel() && capabilities()?.canOptOut === true}>
            <Section
              title="Opt out of the platform"
              icon={<SectionIcon name="alert-triangle" />}
              description="Your request is recorded and sent to the crew, who contact you to confirm before removing any of your act's data. Your CrowdRelay setup keeps running until it is shut down separately."
            >
              <Show when={optOutDone()} fallback={
                <>
                  <Show when={optOut.isError}>
                    <ErrorCard class="mb-3">{errorMessage(optOut.error, 'Opt-out request failed')}</ErrorCard>
                  </Show>
                  <div class="max-w-md">
                    {/* This mailto was a plain attribute string containing
                        `{encodeURIComponent(...)}`, so the braces went into the
                        URL literally and the link opened a mail draft with a
                        subject reading `{encodeURIComponent(t.displayName)}`. */}
                    <Field
                      label={<>Type <code>{t.slug}</code> to confirm</>}
                      hint={<>To expedite, also email <a href={`mailto:virya.crew@gmail.com?subject=${encodeURIComponent(`Opt out: ${t.displayName}`)}&body=${encodeURIComponent(`Tenant: ${t.slug}\n\nI want to opt out of the CrowdRelay platform. Please remove my tenant data.`)}`} class="text-primary hover:text-primary/80">virya.crew@gmail.com</a>.</>}
                    >
                      <Input
                        value={optOutConfirm()}
                        placeholder={t.slug}
                        autocomplete="off"
                        onInput={(e) => setOptOutConfirm(e.currentTarget.value)}
                      />
                    </Field>
                  </div>
                  <div class="mt-4 flex justify-end gap-2">
                    <Button writes
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
                <Alert tone="success" role="status" title="Opt-out request received">
                  The crew has been notified and will contact you to confirm before removing your
                  data. No further action is needed from your side.
                </Alert>
              </Show>
            </Section>
          </Show>
    </>

    return <>
      <PageHeader
        title={t.displayName}
        description={platformView
          ? `${t.slug} · ${t.defaultCountryCode} · ${t.workspaceId ? 'workspace ready' : 'workspace pending'}`
          : t.defaultCountryCode}
        actions={<>
          <Show when={updated()}><span class="text-sm text-muted-foreground">Updated {updated()}</span></Show>
          <StatusBadge status={t.status} tone={statusTone(t.status)} />
          <Button variant="outline" size="sm" onClick={refreshPage} disabled={refreshing()} aria-label="Refresh">
            <RefreshCw class={cn(refreshing() && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </>}
      />
      <Show when={status.error || branding.error || mobileApps.error || plan.error || deploy.error || cancel.error || park.error || unpark.error}>
        <ErrorCard>{errorMessage(status.error || branding.error || mobileApps.error || plan.error || deploy.error || cancel.error || park.error || unpark.error, authState.isPlatformLevel() ? 'Control Plane operation failed' : 'That change did not go through')}</ErrorCard>
      </Show>
      {/* A tenant that is not running says so above every tab, with the one
          action that changes it. The parked notice painted its text on the
          strong warning colour and read as a blank bar. */}
      <Show when={t.status === 'parked'}>
        <Alert tone="warning" role="status" title={platformView ? 'This tenant is parked' : 'Parked'}>
          Automated work is stopped — no new tasks or outreach. Pending deliveries still drain.
          <Show when={capabilities()?.canUnpark}>
            <div class="mt-3"><Button writes size="sm" disabled={unpark.isPending} onClick={() => unpark.mutate()}>{unpark.isPending && <Spinner />} {unpark.isPending ? 'Resuming…' : 'Resume'}</Button></div>
          </Show>
        </Alert>
      </Show>
      <Show when={t.status === 'suspended'}>
        <Alert tone="destructive" role="status" title={platformView ? 'This tenant is suspended' : 'Suspended'}>
          Nothing runs for this tenant until it is resumed.
          <Show when={capabilities()?.canSuspend !== false}>
            <div class="mt-3"><Button writes size="sm" disabled={status.isPending} onClick={() => status.mutate('resume')}>{status.isPending && <Spinner />} {status.isPending ? 'Resuming…' : 'Resume'}</Button></div>
          </Show>
        </Alert>
      </Show>

      <TabBar
        active={activeTab()}
        onChange={switchTab}
        onPrefetch={prefetch}
        // One declaration per label — the collision gate counts literal
        // `label:` occurrences, and a band-vs-platform split that repeats
        // 'Profile' reads as two different concepts sharing a word.
        tabs={[
          { id: 'profile', label: 'Profile' },
          { id: 'workspace', label: 'Workspace' },
          ...(platformView
            ? [
                { id: 'deployment', label: 'Deployment' },
                { id: 'access', label: 'Access' },
                { id: 'destinations', label: 'Destinations' },
              ]
            : []),
        ]}
      />

      {/* Each tab body is one vertical rhythm. Sections draw a hairline and
          24px above their heading, but nothing below their content, so
          without the gap each section's last line sat on the next one's rule. */}
      <TabPanel active={activeTab()} id="profile" visited={isVisited('profile')}>
        <div class="space-y-8"><Settings /></div>
      </TabPanel>

      <TabPanel active={activeTab()} id="workspace" visited={isVisited('workspace')}>
        <div class="space-y-8">
          <WorkspaceSettingsPanel slug={t.slug} />
          {/* The band keeps its API keys here because Access is a
              platform-only tab — moving secrets there would take the write
              away from the people who own the accounts. Platform sessions
              see the same panel under Access. */}
          <Show when={!platformView}>
            <TenantSecretsPanel slug={t.slug} />
          </Show>
        </div>
      </TabPanel>

      <TabPanel active={activeTab()} id="deployment" visited={isVisited('deployment')}>
        <div class="space-y-8">
          <Show when={operations.isPending}><SkeletonSection titleWidth="180px" lines={4} minHeight="180px" /></Show>
          <Show when={operations.error}><ErrorCard>{errorMessage(operations.error, 'Operations data unavailable')}</ErrorCard></Show>
          <Section
            flush
            title="CrowdRelay instance"
            icon={<SectionIcon name="server" />}
            description="Set the desired state here. A separate deploy agent picks up the job and runs the deployment — this page never touches Docker itself."
            action={<Show when={latestJob()}>{job => <StatusBadge status={job().status} tone={provisionTone(job().status)} />}</Show>}
          >
            <Show when={capabilities()?.canProvision !== false} fallback={<p class="text-sm text-muted-foreground">This tenant stays on its existing production CrowdRelay deployment.</p>}>
              <FieldGrid min="220px">
                <ReadField label="Public API">{t.crowdrelayBaseUrl ?? <Unset>not configured</Unset>}</ReadField>
                <ReadField label="Signal / site">{t.signalBaseUrl ?? <Unset>not configured</Unset>}</ReadField>
                <ReadField label="Deploy agent">
                  <Show when={platform()?.provisionerConfigured} fallback={<Unset>not configured</Unset>}>configured</Show>
                </ReadField>
                {/* The ninety-day guarantee as a line in the same grid —
                    frozen baseline vs the latest report. `unmeasured` says
                    so; a missing number stays '—', never zero. */}
                <Show when={guarantee.data}>{g => (
                  <ReadField label="90-day guarantee">
                    {g().state === 'unmeasured'
                      ? 'Waiting for the first fan-graph report to freeze the baseline'
                      : `${g().metricKey.replaceAll('_', ' ')}: ${g().baselineValue ?? '—'} → ${g().currentValue ?? '—'}${g().daysRemaining != null ? ` · ${g().daysRemaining}d left` : ''}`}
                    <Show when={g().state === 'kept' || g().state === 'refund_owed'}>
                      {' '}<StatusBadge status={g().state === 'kept' ? 'kept' : 'refund owed'} tone={g().state === 'kept' ? 'good' : 'bad'} />
                    </Show>
                  </ReadField>
                )}</Show>
              </FieldGrid>

              <div class="mt-5 flex flex-wrap items-end gap-2">
                <Field
                  class="min-w-64 flex-1"
                  label="Release to deploy"
                  hint="A 40-character commit SHA, as sha-<commit>. Leave blank to take the platform default."
                  error={desiredVersion().trim() && !releaseReady() ? 'Not a release identifier. Expected sha- followed by a 40-character commit SHA.' : undefined}
                >
                  <Input
                    class={cn(!releaseReady() && desiredVersion().trim() && 'border-destructive/50')}
                    value={desiredVersion()}
                    onInput={(e) => setDesiredVersion(e.currentTarget.value)}
                    placeholder={platform()?.provisionerDefaultImageTag ?? 'sha-…'}
                    aria-invalid={!releaseReady() && Boolean(desiredVersion().trim())}
                  />
                </Field>
                <div class="flex gap-2 pb-6">
                  <Button writes variant="outline" size="sm" onClick={() => plan.mutate()} disabled={plan.isPending || deploymentBusy() || !releaseReady()}>Preview</Button>
                  <Button writes size="sm" onClick={() => deploy.mutate()} disabled={deploy.isPending || deploymentBusy() || !releaseReady() || t.status === 'suspended' || !t.crowdrelayBaseUrl || !t.signalBaseUrl}>{latestJob()?.status === 'failed' ? 'Retry deploy' : t.status === 'active' ? 'Deploy / upgrade' : 'Deploy instance'}</Button>
                </div>
              </div>
              <Show when={deploy.error}><ErrorCard>{deploy.error instanceof Error ? deploy.error.message : 'Deployment request failed'}</ErrorCard></Show>
              <Show when={preview()}>{job => <div class="mt-3 overflow-x-auto rounded-lg border border-border bg-background p-3"><pre class="text-xs text-foreground">{JSON.stringify(job().plan, null, 2)}</pre></div>}</Show>
              <Show when={latestJob()}>{job => <div class="mt-5 border-t border-border pt-4">
                <div class="flex items-center justify-between gap-2"><div><strong class="text-foreground">{job().status === 'succeeded' ? 'Deployed' : job().status === 'failed' ? 'Deployment failed' : job().status === 'running' ? 'Deploying…' : job().status === 'approved' ? 'Queued' : 'Planned'}</strong><small class="block text-xs text-muted-foreground">attempt {job().attemptCount} · {new Date(job().createdAt).toLocaleString()}</small></div><StatusBadge status={job().status} tone={provisionTone(job().status)} /></div>
                <Show when={job().status === 'approved'}><p class="mt-2 text-sm text-muted-foreground">Queued for deployment. Nothing changes until the deploy agent picks it up.</p></Show>
                <Show when={job().status === 'running'}><p class="mt-2 text-sm text-muted-foreground">Deployment is running. This typically takes 2–5 minutes.</p></Show>
                <Show when={job().status === 'succeeded'}><div class="mt-3 rounded-lg bg-background p-3">
                  <FieldGrid min="140px">
                    <ReadField label="Local API"><code class="text-xs">{job().result?.localApiUrl ?? '—'}</code></ReadField>
                    <ReadField label="Host port">{job().result?.apiPort ?? '—'}</ReadField>
                    <ReadField label="Schema">{job().result?.schemaVersion ?? '—'}</ReadField>
                  </FieldGrid>
                  <p class="mt-3 text-xs italic text-muted-foreground">The instance is healthy locally. Route <code>{t.crowdrelayBaseUrl}</code> to this host port to expose it publicly.</p>
                </div></Show>
                <Show when={job().status === 'failed' ? (job().errorCode ?? 'provisioning_failed') : undefined}>{code => <ErrorCard class="mt-3">
                  <strong>{provisionFailures[code()]?.title ?? 'Deployment failed'}</strong>
                  <Show when={provisionFailures[code()]}>{failure => <>
                    <p class="mt-1">{failure().guidance}</p>
                    <Show when={!failure().retryable}><p class="mt-1 text-xs italic text-muted-foreground">Retrying will not help until the underlying cause is fixed.</p></Show>
                  </>}</Show>
                </ErrorCard>}</Show>
                <Show when={['planned','approved'].includes(job().status)}><Button writes variant="destructive-ghost" size="sm" class="mt-3" onClick={() => cancel.mutate()} disabled={cancel.isPending}>Cancel queued deployment</Button></Show>
              </div>}</Show>
            </Show>
          </Section>

          {/* Live health, switches and redeploy were drawn here a second time —
              the same controls the Health page's Switches tab owns. One home,
              and a door to it. */}
          <Section
            title="Runtime and switches"
            icon={<SectionIcon name="activity" />}
            description="Live health, feature flags and redeploy for this tenant live on the Health page."
            action={<Link to="/tenants/$slug/health" params={{ slug: t.slug }} search={{ tab: 'runtime' } as never} class={buttonVariants({ variant: 'outline', size: 'sm' })}>Open Health</Link>}
          >{null}</Section>

          <ReleaseConvergencePanel releaseLedger={operations.data?.autopilot?.release_ledger ?? null} />
        </div>
      </TabPanel>

      <TabPanel active={activeTab()} id="access" visited={isVisited('access')}>
        <div class="space-y-8">
          <TenantOperatorsPanel slug={t.slug} />
          {/* Tenant-held credentials moved here from Audience: the keys are
              access material, not audience data. The band's copy lives on the
              Workspace tab because this tab is platform-only. */}
          <Show when={platformView}>
            <TenantSecretsPanel slug={t.slug} />
          </Show>
          <TenantAuditPanel items={model.data?.audit.items ?? []} />

          {/* Park, suspend and resume sat in the page header as one-click
              buttons beside the tenant's name, on every tab. They change what
              the tenant is allowed to do, so they live with the other access
              decisions — and the banner above the tabs offers Resume when it
              matters. */}
          <Show when={capabilities()?.canPark || capabilities()?.canUnpark || (capabilities()?.canSuspend !== false && t.status !== 'parked')}>
            <Section
              title="Tenant status"
              icon={<SectionIcon name="shield" />}
              description="Parking stops automated work — no new tasks or outreach — while pending deliveries drain; use it for non-payment. Suspending stops the tenant."
              action={<StatusBadge status={t.status} tone={statusTone(t.status)} />}
            >
              <div class="flex flex-wrap gap-2">
                <Show when={capabilities()?.canPark}><Button writes variant="outline" size="sm" disabled={park.isPending} onClick={() => park.mutate('non-payment')} aria-label={park.isPending ? 'Parking tenant' : 'Park tenant'}>{park.isPending && <Spinner />} {park.isPending ? 'Parking…' : 'Park'}</Button></Show>
                <Show when={capabilities()?.canUnpark}><Button writes size="sm" disabled={unpark.isPending} onClick={() => unpark.mutate()} aria-label={unpark.isPending ? 'Resuming tenant' : 'Resume tenant'}>{unpark.isPending && <Spinner />} {unpark.isPending ? 'Resuming…' : 'Resume'}</Button></Show>
                <Show when={capabilities()?.canSuspend !== false && t.status !== 'parked'}><Button writes variant={t.status === 'suspended' ? 'default' : 'destructive-ghost'} size="sm" disabled={status.isPending} onClick={() => status.mutate(t.status === 'suspended' ? 'resume' : 'suspend')} aria-label={status.isPending ? 'Updating status' : (t.status === 'suspended' ? 'Resume tenant' : 'Suspend tenant')}>{status.isPending && <Spinner />} {status.isPending ? 'Updating…' : t.status === 'suspended' ? 'Resume' : 'Suspend'}</Button></Show>
              </div>
            </Section>
          </Show>
          {/* Admin-only removal. Rendered from the server's capability flag, never
              from the slug. And `=== true` rather than `!== false`: for a
              destructive action an absent or still-loading capability must read
              as "not allowed", which is the opposite default from the reads
              above. Tenant operators never see this — they use Opt out instead. */}
          <Show when={isAdmin() && capabilities()?.canRemove === true}>
            <Section
              title="Remove tenant"
              icon={<SectionIcon name="alert-triangle" />}
              description={<>Unregisters <strong class="text-foreground">{t.displayName}</strong> from the control plane: operators, runtime status and provisioning history are deleted. The tenant's CrowdRelay workspace is not touched — it keeps running until shut down separately. The audit trail survives.</>}
            >
              <Show when={remove.isError}>
                <ErrorCard class="mb-3">{errorMessage(remove.error, 'Tenant removal failed')}</ErrorCard>
              </Show>
              <div class="max-w-md">
                <Field label={<>Type <code>{t.slug}</code> to confirm</>} hint="This cannot be undone from this screen.">
                  <Input
                    value={removalConfirm()}
                    placeholder={t.slug}
                    autocomplete="off"
                    onInput={(e) => setRemovalConfirm(e.currentTarget.value)}
                  />
                </Field>
              </div>
              <div class="mt-4 flex justify-end gap-2">
                <Button writes
                  variant="destructive-ghost"
                  size="sm"
                  disabled={removalConfirm().trim() !== t.slug || remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  {remove.isPending && <Spinner />} {remove.isPending ? 'Removing…' : 'Remove this tenant'}
                </Button>
              </div>
            </Section>
          </Show>
        </div>
      </TabPanel>

      {/* Where the tenant's alerts go — the notifier channels, platform
          config and automation routing that used to be a top-level nav
          item. Its own queries; nothing here loads until the tab does. */}
      <TabPanel active={activeTab()} id="destinations" visited={isVisited('destinations')}>
        <NotifiersPanel slug={t.slug} />
      </TabPanel>
    </>
  }}</Show></PageShell>
}
