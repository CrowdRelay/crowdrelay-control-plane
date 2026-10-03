import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { fetchTenantOverview } from '../lib/tenantOverview'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { Link, useNavigate, useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { httpUrl } from '../lib/format'
import { Check, Circle, Users } from 'lucide-solid'
import { cn } from '../lib/cn'
import type { Palette, ProvisioningJob, TenantSummary } from '../lib/types'
import { ReleaseConvergencePanel } from '../components/ReleaseConvergencePanel'
import { StatusBadge } from '../components/StatusBadge'
import { RegionalProfilePanel } from '../components/RegionalProfilePanel'
import { TenantAuditPanel } from '../components/TenantAuditPanel'
import { TenantOperatorsPanel } from '../components/TenantOperatorsPanel'
import { TenantSecretsPanel } from '../components/TenantSecretsPanel'
import { NotifiersPanel } from '../components/NotifiersPanel'
import { WorkspaceSettingsPanel } from '../components/WorkspaceSettingsPanel'
import { SkeletonTenantPage, SkeletonSection } from '../components/Skeleton'
import { ErrorCard, PageShell } from '../components/layout'
import { SaveActions, SettingsRow, SettingsSection } from '../components/ui/settings'
import { DataTable, type ColumnDef } from '../components/app/data-table'
import { Badge } from '../components/app/badge'
import { EmptyState } from '../components/ui/empty-state'
import { confirmAction } from '../components/Dialog'
import { Act, DashHeader, Pill, SubPagePanel, type Tone } from '../components/ui/dash'
import { SettingsFirstScreen } from '../components/SettingsFirstScreen'
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
import { JourneySteps } from '../components/Journey'
import { deployJourneySteps } from '../lib/deploy-journey'

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

export type SettingsSection = 'overview' | 'profile' | 'brand' | 'team' | 'workspace' | 'keys' | 'notifications' | 'deployment'

// Sub-pages only a platform session gets — the band's sidebar does not list
// them, and a pasted URL sends a band session back to the overview rather
// than mounting a platform-only panel.
const PLATFORM_ONLY: SettingsSection[] = ['notifications', 'deployment']
const SECTION_TITLE: Record<SettingsSection, string> = {
  overview: 'Settings', profile: 'Profile', brand: 'Brand and apps', team: 'Team', workspace: 'Workspace',
  keys: 'API keys', notifications: 'Notifications', deployment: 'Deployment',
}
// One line under each heading saying what the page is for.
const SECTION_SUBTITLE: Record<SettingsSection, string> = {
  overview: 'Who you are, and what the machine may do',
  profile: 'How letters describe you, and the region fans are written to in',
  brand: 'Which apps run, where they are published, and the colours they wear',
  team: 'The crew the brain hands work to, and who can sign in',
  workspace: 'Member links, what the brain chases, and social posting',
  keys: 'Credentials for the services you sell through',
  notifications: 'Where alerts go, and what was sent',
  deployment: 'The CrowdRelay instance, its release and recent platform changes',
}

export const SettingsOverviewPage = () => <TenantPage section="overview" />
export const SettingsProfilePage = () => <TenantPage section="profile" />
export const SettingsBrandPage = () => <TenantPage section="brand" />
export const SettingsTeamPage = () => <TenantPage section="team" />
export const SettingsWorkspacePage = () => <TenantPage section="workspace" />
export const SettingsKeysPage = () => <TenantPage section="keys" />
export const SettingsNotificationsPage = () => <TenantPage section="notifications" />
export const SettingsDeploymentPage = () => <TenantPage section="deployment" />

export function TenantPage(props: { section: SettingsSection }) {
  const params = useParams({ strict: false }) as () => { slug: string }
  const queryClient = useQueryClient()
  // This page is the tenant's Settings section — products, region, brand,
  // deployment and access. The daily read lives on Today (`/operations`),
  // where the bare tenant URL redirects. The sidebar's Settings item lands
  // on the overview at `/settings`; each settings area is its own sub-page
  // (`/settings/profile`, `/settings/workspace`, …) nested under it.
  // Accessor, not a snapshot — profile() hydrates async, so freezing the
  // level at setup would nail a platform session's sections to the band list.
  const platformView = () => authState.isPlatformLevel()
  const section = () => props.section
  const isVisited = (id: SettingsSection) => section() === id

  // Base read model — tenant identity, provisioning, audit, platform caps.
  // This is all the Profile and Access pages need. The Deployment page has
  // its own lazy query below so opening Settings doesn't pay for the
  // operations read model unless the operator actually visits it.
  const model = useQuery(() => ({
    queryKey: ['tenant-overview', params().slug],
    queryFn: () => fetchTenantOverview(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))
  const tenant = { get data() { return model.data?.tenant }, get error() { return model.error } }
  const platform = () => model.data?.platform
  const capabilities = () => model.data?.platform?.capabilities
  const provisioning = { get data() { return model.data?.provisioning } }


  // Operations read model — the Deployment page is its only consumer here
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
  // The ninety-day guarantee is a Deployment-page read — the promise attached
  // to the instance, next to the switch that deploys it.
  const guarantee = useQuery(() => ({
    queryKey: ['tenant-guarantee', params().slug],
    queryFn: () => api.tenantGuarantee(params().slug),
    enabled: isVisited('deployment'),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))
  const [palette, setPalette] = createSignal<Palette>(defaultPalette)
  const [desiredVersion, setDesiredVersion] = createSignal('')
  const [preview, setPreview] = createSignal<ProvisioningJob | null>(null)
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
  const mobileApps = useMutation(() => ({ mutationFn: (input: { signalPlayStoreUrl?: string | null; synesthesiaPlayStoreUrl?: string | null }) => api.mobileApps(params().slug, input), onSuccess: refreshTenant }))
  const status = useMutation(() => ({ mutationFn: (action: 'suspend'|'resume') => action === 'suspend' ? api.suspend(params().slug) : api.resume(params().slug), onSuccess: refreshTenant }))
  const park = useMutation(() => ({ mutationFn: (reason?: string) => api.park(params().slug, reason), onSuccess: refreshTenant }))
  const unpark = useMutation(() => ({ mutationFn: () => api.unpark(params().slug), onSuccess: refreshTenant }))
  const plan = useMutation(() => ({ mutationFn: () => api.planProvisioning(params().slug, desiredVersion() || platform()?.provisionerDefaultImageTag || undefined), onSuccess: (job) => setPreview(job) }))
  // The section below only renders for provisioner-managed tenants
  // (`canProvision !== false`), and `deploy_tenant` refuses those tenants by
  // design — "redeploy is only available for externally-owned tenants". The
  // managed path is `reprovision`: a platform admin turns the previewed
  // `planned` job into the `approved` one the provisioner actually claims.
  // Externally-owned tenants redeploy from Health → Runtime, not here.
  const deploy = useMutation(() => ({ mutationFn: () => api.reprovisionTenant(params().slug, desiredVersion() || undefined), onSuccess: async () => { setPreview(null); await refreshProvisioning() } }))
  const cancel = useMutation(() => ({ mutationFn: () => api.cancelProvisioning(params().slug), onSuccess: refreshProvisioning }))
  // Removal is the one action here that cannot be undone from this screen, so
  // the confirmation is the slug typed out rather than a second button.
  const [removalConfirm, setRemovalConfirm] = createSignal('')
  const navigate = useNavigate()
  // Waits for the profile: before it hydrates every session reads as band.
  createEffect(() => {
    if (authState.profile() && !platformView() && PLATFORM_ONLY.includes(section())) {
      void navigate({ to: '/tenants/$slug/settings', params: { slug: params().slug }, replace: true })
    }
  })
  const remove = useMutation(() => ({
    mutationFn: () => api.removeTenant(params().slug),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenants'] })
      navigate({ to: '/tenants' })
    },
  }))
  const latestJob = createMemo(() => provisioning.data?.items[0])
  // `planned` is the preview state — it sits waiting for an admin to approve
  // it via reprovision, not for the provisioner. Counting it as busy made
  // every "Deploy this plan" click unreachable: the preview itself produced
  // the block.
  const deploymentBusy = createMemo(() => ['approved', 'running'].includes(latestJob()?.status ?? ''))
  const requestedVersion = createMemo(() => desiredVersion().trim() || platform()?.provisionerDefaultImageTag || '')
  const releaseReady = createMemo(() => /^sha-[0-9a-f]{40}$/.test(requestedVersion()))
  const isAdmin = createMemo(() => authState.isAdmin())
  const [optOutConfirm, setOptOutConfirm] = createSignal('')
  const [optOutDone, setOptOutDone] = createSignal(false)
  const optOut = useMutation(() => ({
    mutationFn: () => api.optOut(params().slug),
    onSuccess: () => setOptOutDone(true),
  }))

  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const statusTone = (s: string) => s === 'active' ? 'good' : s === 'suspended' ? 'bad' : 'warn'

  return <PageShell>
    <Show when={tenant.error}><ErrorCard title={authState.isPlatformLevel() ? "Couldn't load this tenant" : "Couldn't load your act"} error={tenant.error} /></Show>
    <Show when={!tenant.error && tenant.data} fallback={!tenant.error ? <SkeletonTenantPage /> : null}>{data => {
    const t = data()


    const tenantWord = (platformText: string, bandText: string) => platformView() ? platformText : bandText
    const playBadge = (url: string | null | undefined, enabled: boolean) => (
      <Show when={enabled && httpUrl(url)} fallback={<span class="text-muted-foreground">{enabled ? 'not published yet' : '—'}</span>}>
        {href => <a href={href()} target="_blank" rel="noopener noreferrer" class="inline-block"><img src="/icons/google-play-badge.svg" alt="Get it on Google Play" width="100" height="30" /></a>}
      </Show>
    )

    // ── Brand and apps — what the tenant runs and how it looks ──
    const paletteDirty = () => JSON.stringify(palette()) !== JSON.stringify(t.brandingPalette ?? defaultPalette)
    const playDirty = () => signalPlayUrl() !== (t.signalPlayStoreUrl ?? '') || synesthesiaPlayUrl() !== (t.synesthesiaPlayStoreUrl ?? '')
    const resetPalette = async () => {
      const ok = await confirmAction({
        title: 'Reset the brand palette?',
        body: 'The custom colours are removed and both apps fall back to their product defaults.',
        confirmLabel: 'Reset palette',
        destructive: true,
      })
      if (ok) branding.mutate(null)
    }
    const BrandAndApps = () => <>
      <SettingsSection
        plain
        title="Products"
        description={tenantWord('Which apps this tenant is entitled to, and where each one is published.', 'Which apps your act is entitled to, and where each one is published.')}
      >
        {/* Four hand-built three-column CSS grids, each declaring its own
            template inline, is a table that has not admitted it is one. */}
        <Table>
          <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Where it lives</TableHead><TableHead class="text-right">Status</TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow>
              <TableCell><strong>CrowdRelay</strong></TableCell>
              <TableCell class="text-muted-foreground">{tenantWord("The tenant's own API and workspace", "Your act's own API and workspace")}</TableCell>
              <TableCell class="text-right"><StatusBadge status="enabled" tone="good" /></TableCell>
            </TableRow>
            <TableRow>
              <TableCell><strong>Signal</strong></TableCell>
              <TableCell>{playBadge(t.signalPlayStoreUrl, t.signalEnabled)}</TableCell>
              <TableCell class="text-right"><StatusBadge status={t.signalEnabled ? 'enabled' : 'disabled'} tone={t.signalEnabled ? 'good' : 'muted'} /></TableCell>
            </TableRow>
            <TableRow>
              <TableCell><strong>AREA</strong></TableCell>
              <TableCell><Show when={platformView()} fallback={<span class="text-sm text-muted-foreground">—</span>}>
                <Link class={buttonVariants({ variant: 'ghost', size: 'sm' })} to="/tenants/$slug/places/area" params={{ slug: t.slug }}>Manage rewards</Link>
              </Show></TableCell>
              <TableCell class="text-right"><StatusBadge status={t.areaEnabled ? 'enabled' : 'disabled'} tone={t.areaEnabled ? 'good' : 'muted'} /></TableCell>
            </TableRow>
            <TableRow>
              <TableCell><strong>Synesthesia</strong></TableCell>
              <TableCell>{playBadge(t.synesthesiaPlayStoreUrl, t.synesthesiaEnabled)}</TableCell>
              <TableCell class="text-right"><StatusBadge status={t.synesthesiaEnabled ? 'enabled' : 'disabled'} tone={t.synesthesiaEnabled ? 'good' : 'muted'} /></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </SettingsSection>

      <WorkspaceSettingsPanel slug={t.slug} groups={['apps']} />

      <Show when={t.signalEnabled || t.synesthesiaEnabled}>
        <SettingsSection
          title="Play Store listings"
          description={tenantWord(
            "Where this tenant's mobile apps are published. Each step is automated by the onboarding script in the virya-signal repo.",
            'Where your apps are published. The crew publishes them for you; leave a field blank until an app is on the store.',
          )}
          actions={<SaveActions
            dirty={playDirty()}
            pending={mobileApps.isPending}
            onCancel={() => { setSignalPlayUrl(t.signalPlayStoreUrl ?? ''); setSynesthesiaPlayUrl(t.synesthesiaPlayStoreUrl ?? '') }}
            onSave={() => mobileApps.mutate({ signalPlayStoreUrl: signalPlayUrl().trim() || null, synesthesiaPlayStoreUrl: synesthesiaPlayUrl().trim() || null })}
          />}
        >
          <Show when={mobileApps.error}><div class="py-4"><ErrorCard title="Couldn't update Play Store URLs" error={mobileApps.error} /></div></Show>
          <Show when={t.signalEnabled}>
            <SettingsRow for="play-signal" label="Signal" hint={`Package music.${t.slug}.signal`}>
              <Input id="play-signal" type="url" value={signalPlayUrl()} onInput={(e) => setSignalPlayUrl(e.currentTarget.value)} placeholder={`https://play.google.com/store/apps/details?id=music.${t.slug}.signal`} {...writeGuard()} />
            </SettingsRow>
          </Show>
          <Show when={t.synesthesiaEnabled}>
            <SettingsRow for="play-synesthesia" label="Synesthesia" hint={`Package music.${t.slug}.synesthesia`}>
              <Input id="play-synesthesia" type="url" value={synesthesiaPlayUrl()} onInput={(e) => setSynesthesiaPlayUrl(e.currentTarget.value)} placeholder={`https://play.google.com/store/apps/details?id=music.${t.slug}.synesthesia`} {...writeGuard()} />
            </SettingsRow>
          </Show>
          <SettingsRow label="Setup steps" hint="What is left before the apps are on the store.">
            <ul class="m-0 flex list-none flex-col gap-3 p-0">
              <For each={[
                { show: true, done: Boolean(t.brandingPalette), title: 'Brand palette', detail: t.brandingPalette ? 'Custom palette set' : 'Using product defaults — set a palette below for custom app icons' },
                { show: t.signalEnabled, done: Boolean(t.signalPlayStoreUrl), title: 'Signal app published', detail: tenantWord('Run the onboarding script to build and publish', 'The crew publishes this for you') },
                { show: t.synesthesiaEnabled, done: Boolean(t.synesthesiaPlayStoreUrl), title: 'Synesthesia app published', detail: tenantWord('Run the onboarding script in the synesthesia repo', 'The crew publishes this for you') },
              ].filter(step => step.show)}>{step => (
                <li class="flex items-start gap-3">
                  {/* The done mark painted a green check on a green disc. */}
                  <span class={cn('mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold', step.done ? 'bg-success text-success-foreground' : 'border border-border text-muted-foreground')}>
                    <Show when={step.done} fallback={<Circle size={10} aria-hidden="true" />}><Check size={12} stroke-width={3} aria-hidden="true" /></Show>
                    <span class="sr-only">{step.done ? 'Done' : 'To do'}</span>
                  </span>
                  <div class="min-w-0">
                    <strong class="block text-sm font-medium text-foreground">{step.title}</strong>
                    <small class="block text-xs text-muted-foreground">{step.detail}</small>
                  </div>
                </li>
              )}</For>
            </ul>
            {/* The onboarding command is operator runbook material — it
                names an admin-token env var the band has no use for. */}
            <Show when={!t.signalPlayStoreUrl && t.signalEnabled && platformView()}>
              <div class="mt-4 rounded-lg border border-border bg-background p-3">
                <p class="mb-2 text-sm text-muted-foreground">Run in the virya-signal repo to onboard the Signal app:</p>
                <pre class="overflow-x-auto text-xs text-foreground"><code>bash scripts/onboard-tenant-app.sh \<br/>  --tenant {t.slug} \<br/>  --control-plane-url {window.location.origin.replace(/:\d+$/, '')} \<br/>  --token $CONTROL_PLANE_ADMIN_TOKEN \<br/>  --version 0.1.0 --version-code 1</code></pre>
              </div>
            </Show>
          </SettingsRow>
        </SettingsSection>
      </Show>

      <SettingsSection
        title="Brand palette"
        description={tenantWord(
          "Ten colours sent to this tenant's CrowdRelay and Signal builds. Nothing changes until you save.",
          'Ten colours sent to your CrowdRelay and Signal builds. Nothing changes until you save.',
        )}
        actions={<>
          <Show when={t.brandingPalette} fallback={<StatusBadge status="product defaults" />}>
            <Button writes variant="ghost" size="sm" disabled={branding.isPending} onClick={() => void resetPalette()}>Reset to defaults</Button>
          </Show>
          <SaveActions
            dirty={paletteDirty()}
            pending={branding.isPending}
            saveLabel={t.brandingPalette ? 'Save' : 'Save custom palette'}
            onCancel={() => setPalette(t.brandingPalette ?? defaultPalette)}
            onSave={() => branding.mutate(palette())}
          />
        </>}
      >
        <For each={paletteFields}>{field => (
          <SettingsRow for={`palette-${field}`} label={paletteLabels[field].label} hint={paletteLabels[field].role}>
            <div class="flex items-center gap-3">
              <ColorInput writes id={`palette-${field}`} aria-label={paletteLabels[field].label} value={palette()[field]} onInput={(e) => setPalette(current => ({ ...current, [field]: e.currentTarget.value }))} />
              <code class="text-xs tabular-nums text-muted-foreground">{palette()[field]}</code>
            </div>
          </SettingsRow>
        )}</For>
      </SettingsSection>
    </>

    // ── Team — the people the brain hands work to, and who signs in ──
    type Member = TenantSummary['teamMembers'][number]
    const crewColumns: ColumnDef<Member, any>[] = [
      { id: 'name', header: 'Name', accessorFn: m => m.name, cell: c => <div class="min-w-0"><strong class="block font-medium text-foreground">{c.row.original.name}</strong><small class="block text-xs text-muted-foreground">{c.row.original.email}</small></div> },
      { id: 'key', header: 'Handle', accessorFn: m => m.key, cell: c => <code class="text-xs text-muted-foreground">{c.row.original.key}</code> },
      {
        id: 'skills', header: 'Can be asked to', accessorFn: m => m.skills.length, enableSorting: false,
        cell: c => <div class="flex flex-wrap gap-1.5"><For each={c.row.original.skills}>{skill => <Badge variant="muted">{skill.replaceAll('_', ' ')}</Badge>}</For></div>,
      },
    ]
    const Team = () => <>
      <SettingsSection
        plain
        title="Crew roster"
        description="The people the brain can hand work to. Collected at onboarding and shipped with every deploy — skills decide what the router may ask of each member."
      >
        <Show when={(t.teamMembers ?? []).length > 0} fallback={<EmptyState icon={<Users />} label="No crew yet" hint="The crew is collected at onboarding. Ask the platform team to add people." />}>
          <DataTable
            data={t.teamMembers}
            columns={crewColumns}
            getRowId={m => m.key}
            searchText={m => [m.name, m.email, m.key, ...m.skills].join(' ')}
            searchPlaceholder="Search by name, email or skill"
            searchLabel="Search the crew"
          />
        </Show>
      </SettingsSection>
      <WorkspaceSettingsPanel slug={t.slug} groups={['crew']} />
      <TenantOperatorsPanel slug={t.slug} />
    </>

    // ── Danger zone — the actions that stop or remove the tenant ──
    // Park, suspend and resume sat in the page header as one-click buttons on
    // every page. They change what the tenant is allowed to do, so they sit
    // with removal at the foot of Profile, boxed apart from everything else.
    const showStatusControls = () => capabilities()?.canPark || capabilities()?.canUnpark || (capabilities()?.canSuspend !== false && t.status !== 'parked')
    // Removal renders from the server's capability flag, never from the slug,
    // and `=== true`: for a destructive action an absent or still-loading
    // capability must read as "not allowed".
    const showRemove = () => isAdmin() && capabilities()?.canRemove === true
    const showOptOut = () => !platformView() && capabilities()?.canOptOut === true
    const DangerZone = () => <Show when={(platformView() && (showStatusControls() || showRemove())) || showOptOut()}>
      <SettingsSection tone="danger" title="Danger zone" description="These change what the tenant may do, or remove it. Each one asks before it acts.">
        <Show when={platformView() && showStatusControls()}>
          <SettingsRow
            label={<span class="flex items-center gap-2">Tenant status <StatusBadge status={t.status} tone={statusTone(t.status)} /></span>}
            hint="Parking stops automated work — no new tasks or outreach — while pending deliveries drain; use it for non-payment. Suspending stops the tenant."
          >
            <div class="flex flex-wrap gap-2">
              <Show when={capabilities()?.canPark}><Button writes variant="outline" size="sm" disabled={park.isPending} onClick={() => park.mutate('non-payment')} aria-label={park.isPending ? 'Parking tenant' : 'Park tenant'}>{park.isPending && <Spinner />} {park.isPending ? 'Parking…' : 'Park'}</Button></Show>
              <Show when={capabilities()?.canUnpark}><Button writes size="sm" disabled={unpark.isPending} onClick={() => unpark.mutate()} aria-label={unpark.isPending ? 'Resuming tenant' : 'Resume tenant'}>{unpark.isPending && <Spinner />} {unpark.isPending ? 'Resuming…' : 'Resume'}</Button></Show>
              <Show when={capabilities()?.canSuspend !== false && t.status !== 'parked'}><Button writes variant={t.status === 'suspended' ? 'default' : 'destructive-ghost'} size="sm" disabled={status.isPending} onClick={() => status.mutate(t.status === 'suspended' ? 'resume' : 'suspend')} aria-label={status.isPending ? 'Updating status' : (t.status === 'suspended' ? 'Resume tenant' : 'Suspend tenant')}>{status.isPending && <Spinner />} {status.isPending ? 'Updating…' : t.status === 'suspended' ? 'Resume' : 'Suspend'}</Button></Show>
            </div>
          </SettingsRow>
        </Show>
        <Show when={showRemove()}>
          <SettingsRow
            for="remove-confirm"
            label="Remove tenant"
            hint={<>Unregisters <strong class="text-foreground">{t.displayName}</strong> from the control plane: operators, runtime status and provisioning history are deleted. The CrowdRelay workspace keeps running until shut down separately. The audit trail survives.</>}
          >
            <Show when={remove.isError}><ErrorCard class="mb-3" title="Couldn't remove the tenant" error={remove.error} /></Show>
            <Field label={<>Type <code>{t.slug}</code> to confirm</>} hint="This cannot be undone from this screen.">
              <Input id="remove-confirm" value={removalConfirm()} placeholder={t.slug} autocomplete="off" onInput={(e) => setRemovalConfirm(e.currentTarget.value)} />
            </Field>
            <Button writes variant="destructive-ghost" size="sm" class="mt-3" disabled={removalConfirm().trim() !== t.slug || remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending && <Spinner />} {remove.isPending ? 'Removing…' : 'Remove this tenant'}
            </Button>
          </SettingsRow>
        </Show>
        {/* Tenant-initiated opt-out. Tenant operators only; it records the
            request in the audit trail and the crew completes it with Remove. */}
        <Show when={showOptOut()}>
          <SettingsRow
            for="opt-out-confirm"
            label="Opt out of the platform"
            hint="Your request is recorded and sent to the crew, who contact you to confirm before removing any of your act's data. Your CrowdRelay setup keeps running until it is shut down separately."
          >
            <Show when={optOutDone()} fallback={<>
              <Show when={optOut.isError}><ErrorCard class="mb-3" title="Couldn't send the opt-out request" error={optOut.error} /></Show>
              <Field
                label={<>Type <code>{t.slug}</code> to confirm</>}
                hint={<>To expedite, also email <a href={`mailto:virya.crew@gmail.com?subject=${encodeURIComponent(`Opt out: ${t.displayName}`)}&body=${encodeURIComponent(`Tenant: ${t.slug}\n\nI want to opt out of the CrowdRelay platform. Please remove my tenant data.`)}`} class="text-primary hover:text-primary/80">virya.crew@gmail.com</a>.</>}
              >
                <Input id="opt-out-confirm" value={optOutConfirm()} placeholder={t.slug} autocomplete="off" onInput={(e) => setOptOutConfirm(e.currentTarget.value)} />
              </Field>
              <Button writes variant="destructive-ghost" size="sm" class="mt-3" disabled={optOutConfirm().trim() !== t.slug || optOut.isPending} onClick={() => optOut.mutate()}>
                {optOut.isPending && <Spinner />} {optOut.isPending ? 'Sending request…' : 'Request opt-out'}
              </Button>
            </>}>
              <Alert tone="success" role="status" title="Opt-out request received">
                The crew has been notified and will contact you to confirm before removing your
                data. No further action is needed from your side.
              </Alert>
            </Show>
          </SettingsRow>
        </Show>
      </SettingsSection>
    </Show>

    return <>
      <DashHeader
        title={SECTION_TITLE[section()]}
        subtitle={platformView() && section() === 'overview'
          ? `${SECTION_SUBTITLE.overview} · ${t.slug} · ${t.defaultCountryCode}`
          : SECTION_SUBTITLE[section()]}
        actions={<>
          <Show when={t.status !== 'active'}><Pill tone={statusTone(t.status) as Tone}>{t.status}</Pill></Show>
          {/* The capability map — where each feature lives. Operator-only
              and not a sidebar destination, on purpose. */}
          <Show when={authState.isPlatformLevel()}>
            <Act to="/tenants/$slug/capabilities" params={{ slug: t.slug }}>Where features live</Act>
          </Show>
        </>}
      />
      <Show when={status.error || branding.error || mobileApps.error || plan.error || deploy.error || cancel.error || park.error || unpark.error}>
        <ErrorCard title="Couldn't save that change" error={status.error || branding.error || mobileApps.error || plan.error || deploy.error || cancel.error || park.error || unpark.error} />
      </Show>
      {/* A tenant that is not running says so above every sub-page, with the one
          action that changes it. The parked notice painted its text on the
          strong warning colour and read as a blank bar. */}
      <Show when={t.status === 'parked'}>
        <Alert tone="warning" role="status" title={platformView() ? 'This tenant is parked' : 'Parked'}>
          Automated work is stopped — no new tasks or outreach. Pending deliveries still drain.
          <Show when={capabilities()?.canUnpark}>
            <div class="mt-3"><Button writes size="sm" disabled={unpark.isPending} onClick={() => unpark.mutate()}>{unpark.isPending && <Spinner />} {unpark.isPending ? 'Resuming…' : 'Resume'}</Button></div>
          </Show>
        </Alert>
      </Show>
      <Show when={t.status === 'suspended'}>
        <Alert tone="destructive" role="status" title={platformView() ? 'This tenant is suspended' : 'Suspended'}>
          Nothing runs for this tenant until it is resumed.
          <Show when={capabilities()?.canSuspend !== false}>
            <div class="mt-3"><Button writes size="sm" disabled={status.isPending} onClick={() => status.mutate('resume')}>{status.isPending && <Spinner />} {status.isPending ? 'Resuming…' : 'Resume'}</Button></div>
          </Show>
        </Alert>
      </Show>

      <SubPagePanel when={section() === 'overview'}>
        <SettingsFirstScreen slug={t.slug} tenant={t} />
      </SubPagePanel>

      {/* Every sub-page is a stack of settings sections — heading, sentence,
          Cancel / Save, then two-column rows (components/ui/settings.tsx). */}
      <SubPagePanel when={section() === 'profile'}>
        <div class="space-y-10">
          <WorkspaceSettingsPanel slug={t.slug} groups={['identity']} />
          <RegionalProfilePanel tenant={t} />
          <DangerZone />
        </div>
      </SubPagePanel>

      <SubPagePanel when={section() === 'brand'}>
        <div class="space-y-10"><BrandAndApps /></div>
      </SubPagePanel>

      <SubPagePanel when={section() === 'team'}>
        <div class="space-y-10"><Team /></div>
      </SubPagePanel>

      <SubPagePanel when={section() === 'workspace'}>
        <div class="space-y-10">
          <WorkspaceSettingsPanel slug={t.slug} groups={['links', 'growth', 'social', 'advanced']} />
        </div>
      </SubPagePanel>

      {/* One home for the tenant's API keys, for the band and platform alike —
          it was on Workspace for one and Access for the other. */}
      <SubPagePanel when={section() === 'keys'}>
        <div class="space-y-10"><TenantSecretsPanel slug={t.slug} /></div>
      </SubPagePanel>

      <SubPagePanel when={section() === 'deployment'}>
        <div class="space-y-10">
          {/* The tenant as one process instance — how far this deploy got
              and where it is stuck. Reads the overview model only, so it
              does not wait on the operations read. */}
          <JourneySteps
            label="Deployment journey"
            steps={deployJourneySteps({
              tenant: t,
              latestJob: latestJob(),
              canProvision: platform()?.capabilities.canProvision,
              provisionerConfigured: platform()?.provisionerConfigured,
              nowMs: now(),
            })}
          />
          <Show when={operations.isPending}><SkeletonSection titleWidth="180px" lines={4} minHeight="180px" /></Show>
          <Show when={operations.error}><ErrorCard title="Couldn't load operations" error={operations.error} onRetry={() => void operations.refetch()} /></Show>
          <SettingsSection
            plain
            title="CrowdRelay instance"
            description="Set the desired state here. A separate deploy agent picks up the job and runs the deployment — this page never touches Docker itself."
            actions={<Show when={latestJob()}>{job => <StatusBadge status={job().status} tone={provisionTone(job().status)} />}</Show>}
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
                    onInput={(e) => { setDesiredVersion(e.currentTarget.value); setPreview(null) }}
                    placeholder={platform()?.provisionerDefaultImageTag ?? 'sha-…'}
                    aria-invalid={!releaseReady() && Boolean(desiredVersion().trim())}
                  />
                </Field>
                <div class="flex gap-2 pb-6">
                  <Button writes variant="outline" size="sm" onClick={() => plan.mutate()} disabled={plan.isPending || deploymentBusy() || !releaseReady()}>{preview() ? 'Preview again' : 'Preview'}</Button>
                  {/* Only a platform admin may approve a managed tenant's plan
                      (reprovision) — for anyone else the button could only
                      403, and a control that always fails is worse than none.
                      The planned job waits visibly on the rail instead. */}
                  <Show when={isAdmin()}>
                    <Button writes size="sm" onClick={() => deploy.mutate()} disabled={deploy.isPending || deploymentBusy() || !releaseReady() || t.status === 'suspended' || !t.crowdrelayBaseUrl || !t.signalBaseUrl || platform()?.provisionerConfigured === false}>{preview() ? 'Deploy this plan' : latestJob()?.status === 'failed' ? 'Retry deploy' : t.status === 'active' ? 'Deploy / upgrade' : 'Deploy instance'}</Button>
                  </Show>
                </div>
              </div>
              <Show when={deploy.error}><ErrorCard title="Couldn't request the deployment" error={deploy.error} /></Show>
              <Show when={preview()}>{job => <div class="mt-3 overflow-x-auto rounded-lg border border-border bg-background p-3"><pre class="text-xs text-foreground">{JSON.stringify(job().plan, null, 2)}</pre></div>}</Show>
              <Show when={latestJob()}>{job => <div class="mt-5 border-t border-border pt-4">
                {/* The job is a state machine — draw it as one. `cancelled`
                    leaves the rail because it never reached the stage it
                    stopped at; the terminal labels bend to the outcome. */}
                <Show when={job().status !== 'cancelled'} fallback={
                  <div class="flex items-center justify-between gap-2"><div><strong class="text-foreground">Cancelled</strong><small class="block text-xs text-muted-foreground">attempt {job().attemptCount} · {new Date(job().createdAt).toLocaleString()}</small></div><StatusBadge status={job().status} tone={provisionTone(job().status)} /></div>
                }>
                  <ol class="m-0 flex list-none items-center gap-1.5 p-0 text-xs">
                    <For each={['Planned', 'Picked up', 'Deploying', job().status === 'failed' ? 'Failed' : 'Deployed']}>{(label, i) => {
                      const stage = () => job().status === 'planned' ? 0 : job().status === 'approved' ? 1 : job().status === 'running' ? 2 : 3
                      const failed = () => job().status === 'failed'
                      return <li class={stage() === i() ? (failed() && i() === 3 ? 'font-medium text-destructive' : 'font-medium text-foreground') : 'text-muted-foreground'}>
                        {i() < stage() ? '✓ ' : ''}{label}{i() < 3 ? <span class="mx-1 text-border">→</span> : null}
                      </li>
                    }}</For>
                  </ol>
                  <div class="mt-2 flex items-center justify-between gap-2"><small class="text-xs text-muted-foreground">attempt {job().attemptCount} · {new Date(job().createdAt).toLocaleString()}</small><StatusBadge status={job().status} tone={provisionTone(job().status)} /></div>
                </Show>
                <Show when={job().status === 'planned'}><p class="mt-2 text-sm text-muted-foreground">Planned and waiting — a platform admin approves it, then the deploy agent picks it up.</p></Show>
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
                <Show when={job().status === 'failed' ? (job().errorCode ?? 'provisioning_failed') : undefined}>{code => <ErrorCard
                  class="mt-3"
                  title={provisionFailures[code()]?.title ?? "The deployment didn't finish"}
                  recovery={provisionFailures[code()]?.retryable === false ? "Fix the cause first — deploying again won't help until then." : 'Deploy again when ready.'}
                >
                  {provisionFailures[code()]?.guidance ?? 'Something stopped the deployment before it finished.'}
                </ErrorCard>}</Show>
                <Show when={['planned','approved'].includes(job().status)}><Button writes variant="destructive-ghost" size="sm" class="mt-3" onClick={() => cancel.mutate()} disabled={cancel.isPending}>Cancel queued deployment</Button></Show>
              </div>}</Show>
            </Show>
          </SettingsSection>

          {/* Live health, switches and redeploy were drawn here a second time —
              the same controls the Health page's Switches tab owns. One home,
              and a door to it. */}
          <SettingsSection
            title="Runtime and switches"
            description="Live health, feature flags and redeploy for this tenant live on the Health page."
            actions={<Link to="/tenants/$slug/health/switches" params={{ slug: t.slug }} class={buttonVariants({ variant: 'outline', size: 'sm' })}>Open Health</Link>}
          />

          <ReleaseConvergencePanel releaseLedger={operations.data?.autopilot?.release_ledger ?? null} />
          <TenantAuditPanel items={model.data?.audit.items ?? []} />
        </div>
      </SubPagePanel>

      {/* Where the tenant's alerts go — the notifier channels, platform
          config and delivery log. Its own queries; nothing loads until the
          page does. */}
      <SubPagePanel when={section() === 'notifications'}>
        <div class="space-y-10"><NotifiersPanel slug={t.slug} /></div>
      </SubPagePanel>
    </>
  }}</Show></PageShell>
}
