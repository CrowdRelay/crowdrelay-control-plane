import type { AreaCity, AreaDropDetail, AreaDropDraft, AreaDropSummary, AreaOverview, AreaValidationResult, AgentScorecard, LatarnikInviteResult, MeasurementLedger, NegotiationsView, AgentProvider, AgentCredential, AgentModel, AgentSchedule, AgentWorkflow, AgentWorkflowTask, AutomationEvent, AutomationWorkflowConfig, AutopilotOverview, AutopilotPolicy, BulkAutopilotResult, IntelligenceDecisionsData, CommunityItem, CommunityIntroDraft, CommandCenterReadModel, ConnectionCreationResult, ContentPipeline, ContentSourceUpsertInput, ContentSourceView, DeliveryDetails, DeliveryItem, DeliveryResult, DriveBatchPromoteResult, DriveContactsResponse, DualRoleReview, FanbaseConnection, FeatureFlag, GrowthFunnelData, NotifierChannel, NotifierOutboxItem, OperationTimeline, OperatorAccount, OpportunityShortlist, OutboxItem, Palette, PlatformHealthEntry, Profile, ProvisioningJob, ReconciliationResult, RegionalProfile, RetryResult, SentRecord, SignalOverview, TenantOverviewReadModel, PortfolioSettingsReadModel, TenantPortfolioReadModel, TenantRuntimeSnapshot, TenantSummary, FanDetail, FanJourneyEntry, SegmentPreview, AudienceReadModel, PressOverviewReadModel, GrowthMetricCoverageResponse, GrowthMetricTrendsResponse, GrowthObjectivesResponse, AutopilotControlMutation, GrowthPostureView, AcquisitionChannels, FanSourcesResponse, TenantShowsResponse, TenantShowTimelineResponse, TenantShowScanResponse, TenantShowReportResponse, TenantShowPageModel, AutopilotChiefOfStaff, ShowActInput, ShowCreateInput, ShowCreateResult, SharedNight, NightContributionKind, OutreachCandidateView, OutreachCandidatePromotion, BookingCandidateView, BeaconDashboardResponse, BeaconCandidatesResponse, BeaconPressRequestsResponse, BeaconPressAssetsResponse, BeaconEngagementsResponse, BeaconCoverageResponse, BeaconNetworkResponse, BeaconImportResult, NotifiersOverview, AdminReleaseCampaignsResponse, AdminReleaseRecipientsResponse, PlayLedger, UsageAnalyticsData, DecisionEvidence, LearningLoopEntry, LearningProof, CyclePreview, CycleRunResult, NorthStarOption, AudiencePlace, AudiencePlaceInput, BeaconUpsertInput, AgentTasksOverview, AgentProvidersOverview, CommunityDetail, ScanScope, BandListing, ListingState, AttestationSummary, IssuedAttestationResult, RepresentationTargetsResponse, RepresentationTargetInput, ApproachRequestResult, CityFunnelRow, CityVenueRow, GigPlanResponse, GigPlanApproval, TenantIntentOption, TenantExecutorCapabilities, ActionLedgerEntry, TraceTimeline, RelayProcessRuns, RelayProcessRunDetail, AgentHealthResponse, AgentHealthAlertsResponse, IntelligenceBrief, TenantSecret, UploadedMedia, StandingApproval, BookingAgent, BookingAgentDrawEvidence, BookingAgentDrawFloors, GuaranteeView, TenantTodayReadModel, TenantBookingReadModel, TenantPlacesCitiesModel, TenantPlacesRoomsModel, TenantPlacesOnlineModel, TenantBrainReadModel, TenantProofReadModel, TenantDeliveryReadModel } from './types'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    /** The full parsed error response body. Carries structured fields that
     *  typed error variants expose — e.g. `all_sections_failed` includes
     *  `sections` (per-section verdicts) and `degraded`. Rendering layers
     *  read these to show per-section diagnosis instead of a generic string. */
    public readonly body?: Record<string, unknown>,
  ) { super(message) }
}

/** Map a backend error code to an operator-friendly heading. Falls back to
 *  the raw `detail` when no code-specific mapping applies. */
export function errorHeading(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'unauthorized': return 'Session expired — please log in again.'
      case 'forbidden': return "You don't have permission to do that."
      case 'not_found': return 'That item no longer exists.'
      case 'conflict': return 'That name or value is already taken.'
      case 'invalid_input': return 'Check the entered values and try again.'
      case 'unavailable': return 'That service is temporarily unavailable.'
      case 'internal_error': return 'Internal error — check server logs for details.'
      // Typed upstream error variants — the backend distinguishes these so
      // the operator sees the actual failure mode, not a generic "unavailable".
      case 'all_sections_failed': return 'Every section of this channel failed — see the per-section diagnosis below.'
      case 'upstream_timeout': return 'The tenant did not respond in time — retry may clear it.'
      case 'upstream_unreachable': return 'The tenant could not be reached — check the runtime and its tunnel.'
      case 'upstream_error': return 'The tenant returned an error — check its logs.'
      case 'contract_mismatch': return 'The tenant answered in an unrecognised shape — treat these numbers as unknown.'
    }
    return error.message || fallback
  }
  return error instanceof Error ? error.message : fallback
}

// Registered by lib/auth.ts so a 401 anywhere drops the in-memory profile.
let unauthorizedHandler: (() => void) | null = null
export const setUnauthorizedHandler = (handler: () => void) => {
  unauthorizedHandler = handler
}

// Registered by lib/auth.ts. Kept as a predicate rather than an import so this
// module stays the one nothing else in `lib` depends on.
let readOnlyCheck: (() => boolean) | null = null
export const setReadOnlyCheck = (check: () => boolean) => {
  readOnlyCheck = check
}

/** Methods the backend lets a read-only account send. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Refuse a write from a read-only session here rather than letting the
  // server refuse it. The `authenticate` middleware returns the same 403 for
  // the same reason, so this changes no authority — it only means a viewer
  // reads an explanation instead of an HTTP error, and that nothing is sent
  // that could still take effect if the middleware were ever weakened.
  // `/auth/*` is exempt, and must be: logging out is a DELETE and stepping up
  // is a POST. Both are public on the server for the same reason — they act on
  // the session, not on the tenant. A viewer that cannot log out is a worse
  // bug than the one this guard fixes.
  const method = (init?.method ?? 'GET').toUpperCase()
  if (!READ_METHODS.has(method) && !path.startsWith('/auth/') && readOnlyCheck?.()) {
    throw new ApiError(
      403,
      'This account can only read. Ask a platform admin to make the change.',
      'forbidden',
    )
  }
  // Client-side timeout above the server's own 8s request cap: a wedged
  // connection otherwise hangs the query forever — no error, no retry, a
  // spinner for the life of the tab. AbortSignal.any keeps a caller's own
  // signal working alongside it.
  const timeoutSignal = AbortSignal.timeout(15_000)
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'same-origin',
    signal: init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal,
    headers: {
      'content-type': 'application/json',
      'x-request-id': crypto.randomUUID(),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    // The session cookie is HttpOnly, so a 401 is the only signal the SPA can
    // get that its session died; drop the cached profile everywhere.
    if (response.status === 401 && !path.startsWith('/auth/session') && unauthorizedHandler) unauthorizedHandler()
    const body = await response.json().catch(() => ({ detail: response.statusText })) as Record<string, unknown>
    const detail = typeof body.detail === 'string' ? body.detail : `HTTP ${response.status}`
    const code = typeof body.error === 'string' ? body.error : undefined
    throw new ApiError(response.status, detail, code, body)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

type CreateTenantInput = {
  slug: string
  displayName: string
  workspaceId?: string
  crowdrelayBaseUrl?: string
  signalBaseUrl?: string
  defaultCountryCode?: string
  regionalProfile: RegionalProfile
  brandingPalette?: Palette
  deployCrowdrelay?: boolean
  desiredVersion?: string
  initialOperator?: { username: string; password: string }
  signalEnabled?: boolean
  synesthesiaEnabled?: boolean
  areaEnabled?: boolean
  northStarMetric?: string
  archetype?: string
  placement?: 'dedicated' | 'shared_pg'
  fanbaseSources?: string[]
  signalPlayStoreUrl?: string
  synesthesiaPlayStoreUrl?: string
  providerKeys?: Record<string, string>
  teamMembers?: TeamMemberInput[]
}

/** One crew member collected during onboarding — routed to by the brain. */
type TeamMemberInput = {
  key?: string
  name: string
  email: string
  skills: string[]
}

export const api = {
  // Session lifecycle. The HttpOnly cookie carries the credential; these
  // calls only move the profile view in and out of memory.
  login: async (username: string, password: string) =>
    request<Profile>('/auth/session', { method: 'POST', body: JSON.stringify({ username, password }) }),
  session: () => request<Profile | null>('/auth/session'),
  logout: () => request<void>('/auth/session', { method: 'DELETE' }),
  reauth: (password: string) =>
    request<{ status: string }>('/auth/reauth', { method: 'POST', body: JSON.stringify({ password }) }),
  operators: (slug: string) => request<{ items: OperatorAccount[] }>(`/tenants/${encodeURIComponent(slug)}/operators`),
  createOperator: (slug: string, username: string, password: string) =>
    request<OperatorAccount>(`/tenants/${encodeURIComponent(slug)}/operators`, { method: 'POST', body: JSON.stringify({ username, password }) }),
  deleteOperator: (slug: string, id: string) =>
    request<void>(`/tenants/${encodeURIComponent(slug)}/operators/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  notifiers: (slug: string) => request<{ items: NotifierChannel[] }>(`/tenants/${encodeURIComponent(slug)}/notifiers`),
  createNotifier: (slug: string, input: { kind: NotifierChannel['kind']; label: string; url?: string; events: string[]; enabled: boolean }) =>
    request<NotifierChannel>(`/tenants/${encodeURIComponent(slug)}/notifiers`, { method: 'POST', body: JSON.stringify(input) }),
  updateNotifier: (slug: string, id: string, input: { label?: string; events?: string[]; enabled?: boolean }) =>
    request<NotifierChannel>(`/tenants/${encodeURIComponent(slug)}/notifiers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteNotifier: (slug: string, id: string) =>
    request<void>(`/tenants/${encodeURIComponent(slug)}/notifiers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  testNotifier: (slug: string, id: string) =>
    request<{ ok: boolean; error?: string }>(`/tenants/${encodeURIComponent(slug)}/notifiers/${encodeURIComponent(id)}/test`, { method: 'POST', body: '{}' }),
  // n8n owns the workflows; the control plane mirrors them so they can be
  // shown and muted. Without this the routing panel stays empty while n8n runs
  // dozens of live workflows, which reads as a broken page rather than an
  // unsynced one.
  syncNotifierAutomationRouting: (slug: string) =>
    request<{ synced: number; skipped: number }>(
      `/tenants/${encodeURIComponent(slug)}/notifiers/automation-routing/sync`,
      { method: 'POST' },
    ),

  // The whole Notifications page in one request. The four section endpoints
  // stay for write-and-refresh; this is the read path, so the page stops
  // assembling itself in front of the operator across four round trips.
  notifiersOverview: (slug: string) =>
    request<NotifiersOverview>(`/tenants/${encodeURIComponent(slug)}/notifiers/overview`),
  notifierOutbox: (slug: string) =>
    request<{ items: NotifierOutboxItem[] }>(`/tenants/${encodeURIComponent(slug)}/notifiers/outbox`),

  communityIntelligenceCommunities: (slug: string) =>
    request<{ items: CommunityItem[] }>(`/tenants/${encodeURIComponent(slug)}/portfolio/communities`),
  // Joining is a human act; this records what happened so the next person
  // does not repeat it.
  setCommunityMembership: (slug: string, placeId: string, state: string, note?: string) =>
    request<{ placeId: string; membershipState: string }>(
      `/tenants/${encodeURIComponent(slug)}/portfolio/communities/${encodeURIComponent(placeId)}/membership`,
      { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ state, note: note ?? null }) },
    ),

  communityIntroDraft: (slug: string, placeId: string) =>
    request<CommunityIntroDraft>(
      `/tenants/${encodeURIComponent(slug)}/portfolio/communities/${encodeURIComponent(placeId)}/intro-draft`,
    ),

  // Consolidated community detail — observations + entities in one round-trip.
  communityDetail: (slug: string, placeId: string) =>
    request<CommunityDetail>(`/tenants/${encodeURIComponent(slug)}/portfolio/communities/${encodeURIComponent(placeId)}/detail`),
  autopilotBulk: (slug: string, enabled: boolean) =>
    request<BulkAutopilotResult>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot/bulk`, { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ enabled }) }),
  overview: () => request<{
    tenants: number
    healthy: number
    degraded: number
    stale: number
    unknown: number
    runtimeStaleAfterSeconds: number
    provisionerConfigured: boolean
    provisionerDefaultImageTag: string | null
    platformHealth: PlatformHealthEntry[]
  }>('/overview'),
  commandCenter: () => request<CommandCenterReadModel>('/command-center'),
  tenants: () => request<{ items: TenantSummary[] }>('/tenants'),
  // One purpose-built read model per tenant subpage. The browser never
  // orchestrates a fan-out to assemble a screen.
  tenantOverview: (slug: string) => request<TenantOverviewReadModel>(`/tenants/${encodeURIComponent(slug)}/overview`),
  tenantToday: (slug: string) => request<TenantTodayReadModel>(`/tenants/${encodeURIComponent(slug)}/today`),
  // The booking pipeline — found → confirmed → approached → talking →
  // booked — composed server-side into one call for the Shows → Get booked tab.
  bookingModel: (slug: string) => request<TenantBookingReadModel>(`/tenants/${encodeURIComponent(slug)}/booking`),
  // The places lens, one thin model per tab — the Cities tab never pays for
  // the venue registry, the Online tab never pays for the funnel. AREA keeps
  // its own endpoints; no places model carries it.
  placesCities: (slug: string) => request<TenantPlacesCitiesModel>(`/tenants/${encodeURIComponent(slug)}/places/cities`),
  placesRooms: (slug: string) => request<TenantPlacesRoomsModel>(`/tenants/${encodeURIComponent(slug)}/places/rooms`),
  placesOnline: (slug: string) => request<TenantPlacesOnlineModel>(`/tenants/${encodeURIComponent(slug)}/places/online`),
  // The brain's evidence — scorecard, learning, measurement, the refused
  // outcomes — one call under the Intelligence tabs. The brief stays its
  // own endpoint; this is everything beneath it.
  brainModel: (slug: string) => request<TenantBrainReadModel>(`/tenants/${encodeURIComponent(slug)}/brain`),
  // What is stuck, and why — live queues, dead rows, landed attempts.
  deliveryModel: (slug: string) => request<TenantDeliveryReadModel>(`/tenants/${encodeURIComponent(slug)}/delivery`),
  // The proof drawer — listing, attestation cards, representation contacts,
  // the shows whose reports are worth sending.
  proofModel: (slug: string) => request<TenantProofReadModel>(`/tenants/${encodeURIComponent(slug)}/proof`),
  pressOverview: (slug: string) => request<PressOverviewReadModel>(`/tenants/${encodeURIComponent(slug)}/operations/press-overview`),
  agentScorecard: (slug: string) => request<AgentScorecard>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot/scorecard`),
  /** N.9 — the executor lanes this workspace has and the ones its parked
   *  actions need: the registry the dispatch gate enforces, read-only. */
  executorCapabilities: (slug: string) => request<TenantExecutorCapabilities>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot/capabilities`),
  measurement: (slug: string) => request<MeasurementLedger>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot/measurement`),
  negotiations: (slug: string) => request<NegotiationsView>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot/negotiations`),
  recordOpportunityTerms: (slug: string, opportunityId: string, body: { position: 'offer' | 'withdrawn'; offered_fee_minor: number; currency: string; responds_by: string }) =>
    request(`/tenants/${encodeURIComponent(slug)}/operations/autopilot/team-opportunities/${encodeURIComponent(opportunityId)}/terms`, { method: 'POST', body: JSON.stringify(body), headers: { 'idempotency-key': crypto.randomUUID() } }),
  opportunityShortlist: (slug: string) => request<OpportunityShortlist>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot/opportunity-shortlist`),
  decisionEvidence: (slug: string, decisionId: string) => request<DecisionEvidence>(`/tenants/${encodeURIComponent(slug)}/operations/decisions/${encodeURIComponent(decisionId)}/evidence`),
  learningLoop: (slug: string) => request<LearningLoopEntry[]>(`/tenants/${encodeURIComponent(slug)}/operations/learning-loop`),
  learningProof: (slug: string) => request<LearningProof>(`/tenants/${encodeURIComponent(slug)}/operations/learning-proof`),
  /** The intelligence brief — one read for the whole "is the brain working"
   *  story. Replaces the fan-out of posture + preview + chief-of-staff +
   *  attention the old tab layout required. */
  intelligence: (slug: string) => request<IntelligenceBrief>(`/tenants/${encodeURIComponent(slug)}/operations/intelligence`),
  autopilotCyclePreview: (slug: string) => request<CyclePreview>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot/cycle/preview`),
  autopilotCycleRun: (slug: string) => request<CycleRunResult>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot/cycle/run`, { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() } }),
  autopilotOverview: (slug: string) => request<AutopilotOverview>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot`),
  featureFlags: (slug: string) => request<FeatureFlag[]>(`/tenants/${encodeURIComponent(slug)}/operations/flags`),
  tenant: (slug: string) => request<TenantSummary>(`/tenants/${encodeURIComponent(slug)}`),
  // The ninety-day guarantee — baseline frozen at first measured fan-graph
  // report, verdict derived on read. A tenant-scoped read, like the rest.
  tenantGuarantee: (slug: string) => request<GuaranteeView>(`/tenants/${encodeURIComponent(slug)}/guarantee`),
  tenantRuntime: (slug: string) => request<TenantRuntimeSnapshot>(`/tenants/${encodeURIComponent(slug)}/runtime`),
  createTenant: (input: CreateTenantInput) =>
    request<TenantSummary>('/tenants', { method: 'POST', body: JSON.stringify(input) }),
  branding: (slug: string, brandingPalette: Palette | null) =>
    request<TenantSummary>(`/tenants/${encodeURIComponent(slug)}/branding`, { method: 'PATCH', body: JSON.stringify({ brandingPalette }) }),
  regionalProfile: (slug: string, regionalProfile: RegionalProfile) =>
    request<TenantSummary>(`/tenants/${encodeURIComponent(slug)}/regional-profile`, { method: 'PATCH', body: JSON.stringify({ regionalProfile }) }),
  mobileApps: (slug: string, input: { signalPlayStoreUrl?: string | null; synesthesiaPlayStoreUrl?: string | null }) =>
    request<TenantSummary>(`/tenants/${encodeURIComponent(slug)}/mobile-apps`, { method: 'PATCH', body: JSON.stringify(input) }),
  suspend: (slug: string) => request<TenantSummary>(`/tenants/${encodeURIComponent(slug)}/suspend`, { method: 'POST', body: '{}' }),
  resume: (slug: string) => request<TenantSummary>(`/tenants/${encodeURIComponent(slug)}/resume`, { method: 'POST', body: '{}' }),
  park: (slug: string, reason?: string) =>
    request<TenantSummary>(`/tenants/${encodeURIComponent(slug)}/park`, { method: 'POST', body: JSON.stringify({ reason }) }),
  unpark: (slug: string) => request<TenantSummary>(`/tenants/${encodeURIComponent(slug)}/unpark`, { method: 'POST', body: '{}' }),
  // Unregisters the tenant from the control plane. The slug is repeated in the
  // body because the server requires the caller to name the tenant they mean;
  // the tenant's own CrowdRelay data is not touched by this.
  removeTenant: (slug: string) =>
    request<void>(`/tenants/${encodeURIComponent(slug)}`, { method: 'DELETE', body: JSON.stringify({ confirmSlug: slug }) }),
  // Tenant-initiated opt-out request. Records the intent in the audit trail
  // so the crew knows to act on it. Does NOT remove the tenant — removal
  // stays admin-only. Not available for externally-owned tenants (Virya).
  optOut: (slug: string) =>
    request<void>(`/tenants/${encodeURIComponent(slug)}/opt-out`, { method: 'POST', body: '{}' }),
  planProvisioning: (slug: string, desiredVersion?: string) =>
    request<ProvisioningJob>(`/tenants/${encodeURIComponent(slug)}/provisioning/plan`, { method: 'POST', body: JSON.stringify({ desiredVersion: desiredVersion || undefined }) }),
  deployTenant: (slug: string, desiredVersion?: string) =>
    request<ProvisioningJob>(`/tenants/${encodeURIComponent(slug)}/provisioning/deploy`, { method: 'POST', body: JSON.stringify({ desiredVersion: desiredVersion || undefined }) }),
  cancelProvisioning: (slug: string) => request<ProvisioningJob>(`/tenants/${encodeURIComponent(slug)}/provisioning/cancel`, { method: 'POST', body: '{}' }),
  // Platform-admin only: re-plans and re-provisions a managed tenant. The
  // shared→dedicated promotion runbook uses this after flipping placement.
  reprovisionTenant: (slug: string, desiredVersion?: string) =>
    request<ProvisioningJob>(`/tenants/${encodeURIComponent(slug)}/provisioning/reprovision`, { method: 'POST', body: JSON.stringify({ desiredVersion: desiredVersion || undefined }) }),
  actionSentRecord: (slug: string, actionId: string) => request<SentRecord>(`/tenants/${encodeURIComponent(slug)}/operations/actions/${encodeURIComponent(actionId)}/sent`),
  retryOutbox: (slug: string, id: string) => request<RetryResult>(`/tenants/${encodeURIComponent(slug)}/operations/outbox/${encodeURIComponent(id)}/retry`, {
    method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: '{}',
  }),
  deliveryDetails: (slug: string, id: string) => request<DeliveryDetails>(`/tenants/${encodeURIComponent(slug)}/operations/deliveries/${encodeURIComponent(id)}`),
  retryDelivery: (slug: string, id: string) => request<RetryResult>(`/tenants/${encodeURIComponent(slug)}/operations/deliveries/${encodeURIComponent(id)}/retry`, {
    method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: '{}',
  }),
  retryPush: (slug: string, id: string) => request<RetryResult>(`/tenants/${encodeURIComponent(slug)}/operations/push/${encodeURIComponent(id)}/retry`, {
    method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: '{}',
  }),
  clearDeadDeliveries: (slug: string) => request<{ operation_id: string; cleared: number; status: string; replayed: boolean }>(`/tenants/${encodeURIComponent(slug)}/operations/dead-deliveries/clear`, {
    method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: '{}',
  }),
  operationTimeline: (slug: string, requestId: string) => request<OperationTimeline>(`/tenants/${encodeURIComponent(slug)}/operations/timeline/${encodeURIComponent(requestId)}`),
  operationActions: (slug: string, state?: string) => {
    const qs = state ? `?limit=250&state=${encodeURIComponent(state)}` : '?limit=250'
    return request<ActionLedgerEntry[]>(`/tenants/${encodeURIComponent(slug)}/operations/actions${qs}`)
  },
  operationTrace: (slug: string, traceId: string) => request<TraceTimeline>(`/tenants/${encodeURIComponent(slug)}/operations/trace/${encodeURIComponent(traceId)}`),
  // Process runs: one pass of a pipeline over one subject, joined upstream
  // into the step shape the process page renders — one call per view.
  // `id` rides on every run and target so `reconcile: 'id'` keeps DOM
  // identity across the poll — the route loader and the page must see the
  // same shape, so the mapping lives here, not in the queryFn.
  relayProcessRuns: async (slug: string) => {
    const data = await request<RelayProcessRuns>(`/tenants/${encodeURIComponent(slug)}/operations/processes/relays`)
    return { ...data, runs: data.runs.map(r => ({ ...r, id: r.source_id })) }
  },
  relayProcessRun: async (slug: string, sourceId: string) => {
    const data = await request<RelayProcessRunDetail>(`/tenants/${encodeURIComponent(slug)}/operations/processes/relays/${encodeURIComponent(sourceId)}`)
    return { ...data, targets: data.targets.map(t => ({ ...t, id: t.target_id })) }
  },
  // The batch ask's two answers — one approval per source, not one per
  // community. Approve releases every parked delivery to the drip; revoke
  // cancels what has not landed.
  approveCommunityRelay: (slug: string, sourceId: string, revisions?: Record<string, { title?: string; body?: string }>) =>
    request<unknown>(`/tenants/${encodeURIComponent(slug)}/operations/community-relays/${encodeURIComponent(sourceId)}/approve`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      // `revisions` maps action_id → edited title/body — a refused edit
      // refuses the whole approval upstream. Sent only when non-empty, so
      // the plain approve stays bodiless as before.
      ...(revisions && Object.keys(revisions).length > 0 ? { body: JSON.stringify({ revisions }) } : {}),
    }),
  revokeCommunityRelay: (slug: string, sourceId: string) =>
    request<unknown>(`/tenants/${encodeURIComponent(slug)}/operations/community-relays/${encodeURIComponent(sourceId)}/revoke`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
    }),
  // The manual leg: the operator published the drafted post by hand —
  // registering its URL turns the metrics poller on for it.
  registerManualCommunityPost: (slug: string, postId: string, redditPostUrl: string) =>
    request<unknown>(`/tenants/${encodeURIComponent(slug)}/operations/community-posts/${encodeURIComponent(postId)}/register-manual`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ reddit_post_url: redditPostUrl }),
    }),
  // The social-post manual leg — same close-out, but the URL is wherever the
  // post actually landed (facebook.com/…, instagram.com/…, t.me/…).
  registerManualSocialPost: (slug: string, postId: string, platformPostUrl: string) =>
    request<unknown>(`/tenants/${encodeURIComponent(slug)}/operations/social-posts/${encodeURIComponent(postId)}/register-manual`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ platform_post_url: platformPostUrl }),
    }),
  signalOverview: (slug: string) => request<SignalOverview>(`/tenants/${encodeURIComponent(slug)}/operations/signal-overview`),
  listOutbox: (slug: string, params?: { limit?: number; status?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)] as [string, string])).toString() : ''
    return request<OutboxItem[]>(`/tenants/${encodeURIComponent(slug)}/operations/outbox${qs}`)
  },
  listDeliveries: (slug: string, params?: { limit?: number; status?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)] as [string, string])).toString() : ''
    return request<DeliveryItem[]>(`/tenants/${encodeURIComponent(slug)}/operations/deliveries${qs}`)
  },
  runReconciliation: (slug: string) => request<ReconciliationResult>(`/tenants/${encodeURIComponent(slug)}/operations/reconcile`, {
    method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: '{}',
  }),
  setFeatureFlag: (slug: string, flag: FeatureFlag, enabled: boolean) => request<{flag: FeatureFlag; replayed: boolean}>(`/tenants/${encodeURIComponent(slug)}/operations/flags/${encodeURIComponent(flag.key)}`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ enabled, reason: 'Control Plane operator toggle', expected_version: flag.version }),
  }),
  setAutopilotPolicy: (slug: string, policy: AutopilotPolicy, input: Pick<AutopilotPolicy, 'enabled'|'autonomy_level'|'minimum_confidence'|'max_actions_24h'>) => request<void>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot/${encodeURIComponent(policy.context)}`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      enabled: input.enabled,
      autonomy_level: input.autonomy_level,
      minimum_confidence_basis_points: input.minimum_confidence,
      max_actions_24h: input.max_actions_24h,
      expected_version: policy.version,
    }),
  }),
  // Opportunity board decisions. `remember` is the standing-approval opt-in —
  // "approve this and stop asking about this target". It is off by default:
  // a grant changes authority and must be a typed choice, not the usual
  // button's side effect. The idempotency key makes a lost response safe to
  // retry as the same intent.
  approveOpportunityAction: (slug: string, actionId: string, opts?: { remember?: { days?: number; note?: string }; revision?: Record<string, string> }) => request<{ mutation: { operation_id: string; target_id: string; status: string; replayed: boolean }; remembered: { granted: boolean; reason?: string } | null }>(`/tenants/${encodeURIComponent(slug)}/operations/opportunities/actions/${encodeURIComponent(actionId)}/approve`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    // `revision` carries the operator's edits to the draft's revisable
    // fields — upstream refuses an empty replacement and any field outside
    // the allowlist. Absent keys stay absent: a plain approve sends the
    // same `{}` it always did.
    body: JSON.stringify({ ...(opts?.revision ? { revision: opts.revision } : {}), ...(opts?.remember ? { remember: opts.remember } : {}) }),
  }),
  // Standing approvals — what may run without asking. The grant itself is
  // only ever written through the approve flow's `remember`; this pair lists
  // and revokes. Revoke keeps the row stamped upstream.
  standingApprovals: (slug: string) => request<{ items: StandingApproval[] }>(`/tenants/${encodeURIComponent(slug)}/operations/standing-approvals`),
  revokeStandingApproval: (slug: string, actionKind: string, targetKey: string) => request<void>(`/tenants/${encodeURIComponent(slug)}/operations/standing-approvals/${encodeURIComponent(actionKind)}/${encodeURIComponent(targetKey)}`, { method: 'DELETE' }),
  // The screened booking-agent registry. `approach` asks the agent for a
  // season (queues an awaiting-approval action upstream); `recordReply`
  // files what the agent answered — `occurred_at` is the operator's own
  // timestamp so a retried submit reads as the same filing.
  bookingAgents: (slug: string) => request<{ agents: BookingAgent[]; draw_evidence?: BookingAgentDrawEvidence | null; draw_floors?: BookingAgentDrawFloors }>(`/tenants/${encodeURIComponent(slug)}/operations/booking-agents`),
  approachBookingAgent: (slug: string, agentId: string, note?: string) => request<{ action_id: string; status: string }>(`/tenants/${encodeURIComponent(slug)}/operations/booking-agents/approach`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ agent_id: agentId, note: note ?? null }),
  }),
  // The batch form — one approval card covering every selected agent, and
  // the response names whoever the season gate refused upstream.
  approachBookingAgentWave: (slug: string, agentIds: string[], note?: string) => request<{ action_id: string; wave_id: string; status: string; queued: number; refused: Array<{ agent_id: string; name: string; reason: string }> }>(`/tenants/${encodeURIComponent(slug)}/operations/booking-agents/approach-wave`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ agent_ids: agentIds, note: note ?? null }),
  }),
  recordBookingAgentReply: (slug: string, agentId: string, disposition: string, occurredAt: string) => request<Record<string, unknown>>(`/tenants/${encodeURIComponent(slug)}/operations/booking-agents/${encodeURIComponent(agentId)}/reply`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ disposition, occurred_at: occurredAt }),
  }),
  cancelOpportunityAction: (slug: string, actionId: string) => request<{ operation_id: string; target_id: string; status: string; replayed: boolean }>(`/tenants/${encodeURIComponent(slug)}/operations/opportunities/actions/${encodeURIComponent(actionId)}/cancel`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: '{}',
  }),
  markOpportunityHandledExternally: (slug: string, decisionId: string) => request<{ operation_id: string; target_id: string; status: string; replayed: boolean }>(`/tenants/${encodeURIComponent(slug)}/operations/opportunities/decisions/${encodeURIComponent(decisionId)}/handled-externally`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: '{}',
  }),
  // One purpose-built read model per tenant subpage. The browser never
  // orchestrates a fan-out to assemble a screen.
  tenantPortfolio: (slug: string) => request<TenantPortfolioReadModel>(`/tenants/${encodeURIComponent(slug)}/portfolio/model`),
  decidePortfolioEdge: (slug: string, consentId: string, action: 'approve'|'pause'|'resume'|'revoke', input: { actor?: string; revokeReason?: string }) =>
    request<{ status: string }>(`/tenants/${encodeURIComponent(slug)}/portfolio/amplification/${encodeURIComponent(consentId)}/decide`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ action, actor: input.actor, revoke_reason: input.revokeReason }),
    }),
  // The brain's goal, readable and writable after creation. The wizard could
  // set it once and nothing could change it afterwards, so a tenant that
  // connected new platforms was stuck with whichever goal it guessed on day one.
  // Audience graph — the communities the brain scans and posts into. Until
  // these existed, the only way to register one was psql against the tenant's
  // database, with no validation and no audit entry.
  audiencePlaces: (slug: string, filters?: { kind?: string; stage?: string; limit?: number }) => {
    const query = new URLSearchParams()
    if (filters?.kind) query.set('kind', filters.kind)
    if (filters?.stage) query.set('stage', filters.stage)
    if (filters?.limit) query.set('limit', String(filters.limit))
    const suffix = query.size > 0 ? `?${query.toString()}` : ''
    return request<{ places: AudiencePlace[] }>(`/tenants/${encodeURIComponent(slug)}/audience-graph/places${suffix}`)
  },
  upsertAudiencePlace: (slug: string, place: AudiencePlaceInput) =>
    request<{ placeId: string }>(`/tenants/${encodeURIComponent(slug)}/audience-graph/places`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(place),
    }),
  importAudiencePlaces: (slug: string, places: AudiencePlaceInput[]) =>
    request<{ imported: number }>(`/tenants/${encodeURIComponent(slug)}/audience-graph/places/import`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ places }),
    }),
  northStarOptions: (slug: string) =>
    request<{ options: NorthStarOption[] }>(`/tenants/${encodeURIComponent(slug)}/portfolio/north-stars`),
  northStarVocabulary: () =>
    request<{ options: NorthStarOption[]; source: 'fleet' | 'platform' }>(`/north-star-options`),
  updatePortfolioSetting: (slug: string, key: string, value: string) =>
    request<{ key: string; value: string }>(`/tenants/${encodeURIComponent(slug)}/portfolio/settings/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ value }),
    }),
  // The Workspace tab's read — the editable settings alone, without the
  // audience KPIs the portfolio fan-out used to carry alongside them.
  tenantSettings: (slug: string) =>
    request<PortfolioSettingsReadModel>(`/tenants/${encodeURIComponent(slug)}/settings`),
  // The file's own bytes go upstream — the server sniffs the image kind, so
  // the declared content-type is a hint, not a trust boundary. X-Media-Name
  // carries the display name because it is display text, not a path. The
  // name is normalized to ASCII here because a header cannot carry wider
  // bytes — fetch throws before the request leaves, and the server runs the
  // same sanitation on receipt anyway.
  uploadMedia: (slug: string, file: File) =>
    request<UploadedMedia>(`/tenants/${encodeURIComponent(slug)}/media`, {
      method: 'POST',
      headers: {
        'idempotency-key': crypto.randomUUID(),
        'content-type': file.type || 'application/octet-stream',
        'x-media-name': file.name
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^\x20-\x7E]/g, '_'),
      },
      body: file,
    }),
  // Tenant-held credentials: write-only. The list returns masked hints; a set
  // sends the value once and the value never comes back.
  tenantSecrets: (slug: string) =>
    request<{ secrets: TenantSecret[] }>(`/tenants/${encodeURIComponent(slug)}/secrets`),
  setTenantSecret: (slug: string, name: string, value: string) =>
    request<TenantSecret>(`/tenants/${encodeURIComponent(slug)}/secrets/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
  deleteTenantSecret: (slug: string, name: string) =>
    request<{ name: string; removed: boolean }>(`/tenants/${encodeURIComponent(slug)}/secrets/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  createFanbase: (slug: string, input: { name: string; sourceKind: string; fetchUrl?: string; consentAttestedBy?: string }) =>
    request<{ fanbaseId: string }>(`/tenants/${encodeURIComponent(slug)}/portfolio/fanbases`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(input),
    }),
  deleteFanbase: (slug: string, id: string) =>
    request<void>(`/tenants/${encodeURIComponent(slug)}/portfolio/fanbases/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  ingestFanbase: (slug: string, id: string, entries: { external_id: string; email?: string; display_name?: string; locale?: string }[]) =>
    request<Record<string, number>>(`/tenants/${encodeURIComponent(slug)}/portfolio/fanbases/${encodeURIComponent(id)}/ingest`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ entries }),
    }),
  areaOverview: (slug: string) => request<AreaOverview>(`/tenants/${encodeURIComponent(slug)}/area`),
  areaSettings: (slug: string, enabled: boolean) => request<{enabled:boolean; entitled:boolean}>(`/tenants/${encodeURIComponent(slug)}/area/settings`, { method:'PATCH', body:JSON.stringify({enabled}) }),
  areaCities: (slug: string, q = '', limit = 30) => request<{items:AreaCity[]}>(`/tenants/${encodeURIComponent(slug)}/area/cities?q=${encodeURIComponent(q)}&limit=${limit}`),
  areaCreateCity: (slug:string, input:{slug:string;name:string;countryCode:string;region?:string;latitude:number;longitude:number}) => request<AreaCity>(`/tenants/${encodeURIComponent(slug)}/area/cities`, {method:'POST',body:JSON.stringify(input)}),
  areaDrops: (slug:string) => request<{items:AreaDropSummary[]}>(`/tenants/${encodeURIComponent(slug)}/area/drops`),
  areaDrop: (slug:string,id:string) => request<AreaDropDetail>(`/tenants/${encodeURIComponent(slug)}/area/drops/${encodeURIComponent(id)}`),
  areaCreateDrop: (slug:string,dropId:string,draft:AreaDropDraft) => request<AreaDropDetail>(`/tenants/${encodeURIComponent(slug)}/area/drops`, {method:'POST',body:JSON.stringify({dropId,draft})}),
  areaSaveDraft: (slug:string,id:string,baseRevision:number,draft:AreaDropDraft) => request<AreaDropDetail>(`/tenants/${encodeURIComponent(slug)}/area/drops/${encodeURIComponent(id)}/draft`, {method:'PATCH',body:JSON.stringify({baseRevision,draft})}),
  areaDiscardDraft: (slug:string,id:string) => request<void>(`/tenants/${encodeURIComponent(slug)}/area/drops/${encodeURIComponent(id)}/draft`, {method:'DELETE'}),
  areaValidate: (slug:string,id:string) => request<AreaValidationResult>(`/tenants/${encodeURIComponent(slug)}/area/drops/${encodeURIComponent(id)}/validate`, {method:'POST',body:'{}'}),
  areaPublish: (slug:string,id:string,confirmations:string[] = []) => request<AreaDropDetail>(`/tenants/${encodeURIComponent(slug)}/area/drops/${encodeURIComponent(id)}/publish`, {method:'POST',body:JSON.stringify({confirmations})}),
  areaPause: (slug:string,id:string) => request<AreaDropDetail>(`/tenants/${encodeURIComponent(slug)}/area/drops/${encodeURIComponent(id)}/pause`, {method:'POST',body:'{}'}),
  areaResume: (slug:string,id:string) => request<AreaDropDetail>(`/tenants/${encodeURIComponent(slug)}/area/drops/${encodeURIComponent(id)}/resume`, {method:'POST',body:'{}'}),
  areaArchive: (slug:string,id:string) => request<AreaDropDetail>(`/tenants/${encodeURIComponent(slug)}/area/drops/${encodeURIComponent(id)}/archive`, {method:'POST',body:'{}'}),
  areaDuplicate: (slug:string,id:string,newDropId:string,cityId:string) => request<AreaDropDetail>(`/tenants/${encodeURIComponent(slug)}/area/drops/${encodeURIComponent(id)}/duplicate`, {method:'POST',body:JSON.stringify({newDropId,cityId})}),
  areaDelete: (slug:string,id:string) => request<void>(`/tenants/${encodeURIComponent(slug)}/area/drops/${encodeURIComponent(id)}`, {method:'DELETE'}),
  automationEvents: (slug: string, params?: { limit?: number; status?: string; workflowId?: string }) =>
    request<{ items: AutomationEvent[] }>(`/tenants/${encodeURIComponent(slug)}/automation/events${params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString() : ''}`),
  ackAutomationEvent: (slug: string, id: string) =>
    request<{ id: string; status: string }>(`/tenants/${encodeURIComponent(slug)}/automation/events/${encodeURIComponent(id)}/ack`, { method: 'POST', body: '{}' }),
  resolveAutomationEvent: (slug: string, id: string) =>
    request<{ id: string; status: string }>(`/tenants/${encodeURIComponent(slug)}/automation/events/${encodeURIComponent(id)}/resolve`, { method: 'POST', body: '{}' }),
  retryAutomationEvent: (slug: string, id: string) =>
    request<{ id: string; status: string }>(`/tenants/${encodeURIComponent(slug)}/automation/events/${encodeURIComponent(id)}/retry`, { method: 'POST', body: '{}', headers: { 'idempotency-key': crypto.randomUUID() } }),
  automationWorkflowConfigs: (slug: string) =>
    request<{ items: AutomationWorkflowConfig[] }>(`/tenants/${encodeURIComponent(slug)}/automation/workflows`),
  updateAutomationWorkflowConfig: (slug: string, workflowId: string, input: { category?: string; discordEnabled?: boolean; muted?: boolean; label?: string }) =>
    request<AutomationWorkflowConfig>(`/tenants/${encodeURIComponent(slug)}/automation/workflows/${encodeURIComponent(workflowId)}`, { method: 'PATCH', body: JSON.stringify(input) }),

  // --- Agent service (proxied through control-plane) ---
  agentProviders: (slug: string) =>
    request<{ providers: AgentProvider[] }>(`/tenants/${encodeURIComponent(slug)}/agents/providers`),
  agentCredentials: (slug: string) =>
    request<{ credentials: AgentCredential[] }>(`/tenants/${encodeURIComponent(slug)}/agents/credentials`),
  agentPasteCredential: (slug: string, input: { provider: string; api_key: string; label?: string; provider_account?: string }) =>
    request<void>(`/tenants/${encodeURIComponent(slug)}/agents/credentials`, { method: 'POST', body: JSON.stringify(input) }),
  agentDeleteCredential: (slug: string, provider: string) =>
    request<void>(`/tenants/${encodeURIComponent(slug)}/agents/credentials/${encodeURIComponent(provider)}`, { method: 'DELETE' }),
  agentValidateCredential: (slug: string, provider: string) =>
    request<{ valid: boolean; error?: string }>(`/tenants/${encodeURIComponent(slug)}/agents/credentials/${encodeURIComponent(provider)}/validate`, { method: 'POST', body: '{}' }),
  redditCookieStatus: (slug: string) =>
    request<{ status: 'active' | 'expired' | 'failed' | 'missing'; expires_at: string | null; reddit_username: string | null }>(`/tenants/${encodeURIComponent(slug)}/agents/reddit/cookies`),
  redditCookieUpload: (slug: string, input: { cookies_text: string; reddit_username?: string }) =>
    request<{ status: string; cookie_count: number; expires_at: string; reddit_username: string | null }>(`/tenants/${encodeURIComponent(slug)}/agents/reddit/cookies/upload`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(input),
    }),
  redditCookieValidate: (slug: string) =>
    request<{ valid: boolean; reddit_username?: string; error?: string }>(`/tenants/${encodeURIComponent(slug)}/agents/reddit/cookies/validate`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: '{}',
    }),
  agentModels: (slug: string) =>
    request<{ models: AgentModel[]; connectedProviders: string[] }>(`/tenants/${encodeURIComponent(slug)}/agents/models`),
  agentWorkflows: (slug: string, limit?: number) => {
    const qs = limit ? `?limit=${limit}` : ''
    return request<{ workflows: AgentWorkflow[] }>(`/tenants/${encodeURIComponent(slug)}/agents/workflows${qs}`)
  },
  agentWorkflow: (slug: string, id: string) =>
    request<{ workflow: AgentWorkflow; tasks: AgentWorkflowTask[] }>(`/tenants/${encodeURIComponent(slug)}/agents/workflows/${encodeURIComponent(id)}`),
  growthFunnel: (slug: string, days?: number) => {
    const qs = days ? `?days=${days}` : ''
    return request<GrowthFunnelData>(`/tenants/${encodeURIComponent(slug)}/agents/growth/funnel${qs}`)
  },
  intelligenceDecisions: (slug: string, limit?: number, days?: number) => {
    const params = new URLSearchParams()
    if (limit) params.set('limit', String(limit))
    if (days) params.set('days', String(days))
    const qs = params.toString() ? `?${params.toString()}` : ''
    return request<IntelligenceDecisionsData>(`/tenants/${encodeURIComponent(slug)}/agents/brain/decisions${qs}`)
  },
  usageAnalytics: (slug: string) =>
    request<UsageAnalyticsData>(`/tenants/${encodeURIComponent(slug)}/agents/usage/analytics`),
  // Consolidated read models — one round-trip per tab instead of 5/3.
  agentTasksOverview: (slug: string) =>
    request<AgentTasksOverview>(`/tenants/${encodeURIComponent(slug)}/agents/tasks-overview`),
  agentProvidersOverview: (slug: string) =>
    request<AgentProvidersOverview>(`/tenants/${encodeURIComponent(slug)}/agents/providers-overview`),
  agentHealth: (slug: string) =>
    request<AgentHealthResponse>(`/tenants/${encodeURIComponent(slug)}/agents/health`),
  agentHealthAlerts: (slug: string) =>
    request<AgentHealthAlertsResponse>(`/tenants/${encodeURIComponent(slug)}/agents/health/alerts`),
  agentCreateSchedule: (slug: string, input: { template_id: string; model_id: string; prompt: string; interval_minutes: number }) =>
    request<{ schedule: AgentSchedule }>(`/tenants/${encodeURIComponent(slug)}/agents/schedules`, { method: 'POST', body: JSON.stringify(input) }),
  agentDeleteSchedule: (slug: string, id: string) =>
    request<void>(`/tenants/${encodeURIComponent(slug)}/agents/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  agentToggleSchedule: (slug: string, id: string, enabled: boolean) =>
    request<void>(`/tenants/${encodeURIComponent(slug)}/agents/schedules/${encodeURIComponent(id)}/enabled`, { method: 'POST', body: JSON.stringify({ enabled }) }),

  // --- Fanbase connections ---
  fanbaseConnections: (slug: string) =>
    request<{ connections: FanbaseConnection[] }>(`/tenants/${encodeURIComponent(slug)}/portfolio/fanbases/connections`),
  deleteFanbaseConnection: (slug: string, id: string) =>
    request<void>(`/tenants/${encodeURIComponent(slug)}/portfolio/fanbases/connections/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  updateFanbaseConnectionScanScope: (slug: string, id: string, scope: ScanScope | null) =>
    request<void>(`/tenants/${encodeURIComponent(slug)}/portfolio/fanbases/connections/${encodeURIComponent(id)}/scan-scope`, { method: 'PATCH', body: JSON.stringify({ scope }) }),
  createDiscordConnection: (slug: string, inviteCode: string, label?: string) =>
    request<{ platform: string; status: string }>(`/tenants/${encodeURIComponent(slug)}/portfolio/connections/discord`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ inviteCode, label }),
    }),
  createTelegramConnection: (slug: string, channel: string, botToken: string, label?: string) =>
    request<{ platform: string; status: string }>(`/tenants/${encodeURIComponent(slug)}/portfolio/connections/telegram`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ channel, botToken, label }),
    }),
  createLastfmConnection: (slug: string, artist: string, label?: string) =>
    request<{ platform: string; status: string }>(`/tenants/${encodeURIComponent(slug)}/portfolio/connections/lastfm`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ artist, label }),
    }),
  createDeezerConnection: (slug: string, artistId: string, label?: string) =>
    request<{ platform: string; status: string }>(`/tenants/${encodeURIComponent(slug)}/portfolio/connections/deezer`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ artistId, label }),
    }),
  createDiscogsConnection: (slug: string, artistId: string, label?: string) =>
    request<{ platform: string; status: string }>(`/tenants/${encodeURIComponent(slug)}/portfolio/connections/discogs`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ artistId, label }),
    }),
  createBlueskyConnection: (slug: string, handle: string, label?: string) =>
    request<{ platform: string; status: string }>(`/tenants/${encodeURIComponent(slug)}/portfolio/connections/bluesky`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ handle, label }),
    }),
  createBandcampConnection: (slug: string, subdomain: string, label?: string) =>
    request<{ platform: string; status: string }>(`/tenants/${encodeURIComponent(slug)}/portfolio/connections/bandcamp`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ subdomain, label }),
    }),
  createYoutubeConnection: (slug: string, channelId: string, label?: string) =>
    request<ConnectionCreationResult>(`/tenants/${encodeURIComponent(slug)}/portfolio/connections/youtube`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ channelId, label }),
    }),
  createFacebookConnection: (slug: string, pageId: string, label?: string) =>
    request<ConnectionCreationResult>(`/tenants/${encodeURIComponent(slug)}/portfolio/connections/facebook`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ pageId, label }),
    }),
  createInstagramConnection: (slug: string, igUserId: string, label?: string) =>
    request<ConnectionCreationResult>(`/tenants/${encodeURIComponent(slug)}/portfolio/connections/instagram`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ igUserId, label }),
    }),
  createSoundcloudConnection: (slug: string, permalink: string, label?: string) =>
    request<ConnectionCreationResult>(`/tenants/${encodeURIComponent(slug)}/portfolio/connections/soundcloud`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ permalink, label }),
    }),
  createRedditConnection: (slug: string, subreddit: string, label?: string) =>
    request<ConnectionCreationResult>(`/tenants/${encodeURIComponent(slug)}/portfolio/connections/reddit`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ subreddit, label }),
    }),

  // --- Audience Intelligence ---
  // `audienceModel` is the one entry point: the read model already composes
  // the overview, fan and segment sections server-side in a single request.
  // Per-section clients for those three existed alongside it, called nothing,
  // and would have made the page fetch four times what it needs.
  audienceModel: (slug: string) =>
    request<AudienceReadModel>(`/tenants/${encodeURIComponent(slug)}/audience/model`),
  fanDetail: (slug: string, fanId: string) =>
    request<FanDetail>(`/tenants/${encodeURIComponent(slug)}/audience/fans/${encodeURIComponent(fanId)}`),
  fanJourney: (slug: string, fanId: string) =>
    request<FanJourneyEntry[]>(`/tenants/${encodeURIComponent(slug)}/audience/fans/${encodeURIComponent(fanId)}/journey`),
  // The operator's own labels on a fan — upstream stores them with
  // source='operator'. Add rides the body, remove the path.
  addFanTag: (slug: string, fanId: string, tag: string) =>
    request<Record<string, unknown>>(`/tenants/${encodeURIComponent(slug)}/audience/fans/${encodeURIComponent(fanId)}/tags`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ tag }),
    }),
  removeFanTag: (slug: string, fanId: string, tag: string) =>
    request<Record<string, unknown>>(`/tenants/${encodeURIComponent(slug)}/audience/fans/${encodeURIComponent(fanId)}/tags/${encodeURIComponent(tag)}/remove`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: '{}',
    }),
  audienceSegmentPreview: (slug: string, segmentSlug: string) =>
    request<SegmentPreview>(`/tenants/${encodeURIComponent(slug)}/audience/segments/${encodeURIComponent(segmentSlug)}/preview`),
  // Where the fans are, and the rooms near them. Both read models shipped with
  // Sprint 4 and had no caller on either side of the proxy until now — six
  // routes served two answers nobody could see.
  cityFunnel: (slug: string, order?: 'organise') =>
    request<CityFunnelRow[]>(
      `/tenants/${encodeURIComponent(slug)}/audience/city-funnel${order ? `?order=${order}` : ''}`,
    ),
  cityVenues: (slug: string) =>
    request<CityVenueRow[]>(`/tenants/${encodeURIComponent(slug)}/audience/city-venues`),
  // The registry-verification brief: the held venues, bands and booking
  // agents as a paste-ready prompt — verify each entry's liveness, mark the
  // dead, name the missing. `brief` is null only when all three registries
  // are empty.
  registryVerificationBrief: (slug: string) =>
    request<{ brief: string | null }>(
      `/tenants/${encodeURIComponent(slug)}/audience/registry-verification-brief`,
    ),
  // What the band should book next — the proposals, the cities passed over
  // with the reason each one is not a proposal, and the track record those
  // reasons now carry. `intent` is a one-off override ("what if we were
  // booking?"); absent, the stored intent speaks.
  gigPlan: (slug: string, intent?: string) =>
    request<GigPlanResponse>(
      `/tenants/${encodeURIComponent(slug)}/gig-plan${intent ? `?intent=${encodeURIComponent(intent)}` : ''}`,
    ),
  // The band's yes to one proposal. The key makes a retried click the same
  // approval rather than a second letter to the same promoters.
  // The key is the caller's, not minted here: an approval retried after a
  // timeout — where the server may already have committed — must carry the
  // same key or it lands as a second letter to the same promoters.
  approveGigPlan: (slug: string, cityId: string, idempotencyKey: string, revision?: Record<string, string>) =>
    request<GigPlanApproval>(`/tenants/${encodeURIComponent(slug)}/gig-plan/approve`, {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
      // Approve-with-edit (N.10): `revision` carries the operator's fix to the
      // letter's words — upstream's draft-revision gate owns the allowlist.
      body: JSON.stringify(revision ? { cityId, revision } : { cityId }),
    }),
  // The intents a band may state, from the planner's own vocabulary (the same
  // reason the north-star list is proxied rather than copied).
  tenantIntentOptions: (slug: string) =>
    request<{ options: TenantIntentOption[] }>(
      `/tenants/${encodeURIComponent(slug)}/portfolio/tenant-intents`,
    ),

  // --- Growth Metrics, Objectives, Posture ---
  growthMetricCoverage: (slug: string) =>
    request<GrowthMetricCoverageResponse>(`/tenants/${encodeURIComponent(slug)}/operations/growth-metrics/coverage`),
  growthMetricTrends: (slug: string) =>
    request<GrowthMetricTrendsResponse>(`/tenants/${encodeURIComponent(slug)}/operations/growth-metrics/trends`),
  growthObjectives: (slug: string) =>
    request<GrowthObjectivesResponse>(`/tenants/${encodeURIComponent(slug)}/operations/objectives`),
  contentSources: (slug: string) =>
    request<ContentSourceView[]>(`/tenants/${encodeURIComponent(slug)}/operations/content-sources`),
  deliveryResults: (slug: string, limit = 25) =>
    request<DeliveryResult[]>(`/tenants/${encodeURIComponent(slug)}/operations/delivery-results?limit=${limit}`),
  contentPipeline: (slug: string) =>
    request<ContentPipeline>(`/tenants/${encodeURIComponent(slug)}/operations/content-pipeline`),
  gdriveContacts: (slug: string, segment?: string) =>
    request<DriveContactsResponse>(`/tenants/${encodeURIComponent(slug)}/operations/gdrive-contacts${segment ? `?segment=${encodeURIComponent(segment)}` : ''}`),
  // One click promotes a whole segment: the confirmed count travels with
  // the request and the tenant answers 409 when it no longer matches, so a
  // scan between fetch and click can never widen the send silently.
  promoteDriveContactsBatch: (slug: string, segment: string, expectedCount: number, reason?: string) =>
    request<DriveBatchPromoteResult>(`/tenants/${encodeURIComponent(slug)}/operations/gdrive-contacts/promote-batch`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ destination: 'fan', segment, expected_count: expectedCount, reason: reason?.trim() || null }),
    }),
  gdriveScan: (slug: string) =>
    request<{ scan: string }>(`/tenants/${encodeURIComponent(slug)}/operations/gdrive-contacts/scan`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
    }),
  uploadDriveContacts: (slug: string, fileName: string, csv: string) =>
    request<{ staged: number; rows_read: number; rows_without_email: number }>(`/tenants/${encodeURIComponent(slug)}/operations/gdrive-contacts/upload`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ file_name: fileName, csv }),
    }),
  promoteDriveContact: (slug: string, contactId: string, destination: 'fan' | 'beacon', kind?: string, city?: string) =>
    request<{ fan_outcome?: string; beacon_outcome?: string; opt_in_emailed?: boolean }>(`/tenants/${encodeURIComponent(slug)}/operations/gdrive-contacts/${contactId}/promote`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ destination, kind: kind ?? null, city: city ?? null }),
    }),
  dismissDriveContact: (slug: string, contactId: string, destination: 'fan' | 'beacon') =>
    request<unknown>(`/tenants/${encodeURIComponent(slug)}/operations/gdrive-contacts/${contactId}/dismiss`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ destination }),
    }),
  // §4h-12 — the Listing tab: draft save, the only two visibility
  // transitions, token rotation, contacts, and the approach request.
  listingState: (slug: string) =>
    request<ListingState>(`/tenants/${encodeURIComponent(slug)}/operations/listing`),
  saveListing: (slug: string, input: Omit<BandListing, 'visibility'>) =>
    request<ListingState>(`/tenants/${encodeURIComponent(slug)}/operations/listing`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(input),
    }),
  publishListing: (slug: string) =>
    request<ListingState>(`/tenants/${encodeURIComponent(slug)}/operations/listing/publish`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
    }),
  unlistListing: (slug: string) =>
    request<ListingState>(`/tenants/${encodeURIComponent(slug)}/operations/listing/unlist`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
    }),
  rotateListingToken: (slug: string) =>
    request<ListingState>(`/tenants/${encodeURIComponent(slug)}/operations/listing/rotate-token`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
    }),
  // 2.8 — proof cards: issue from measured figures, list, revoke, rotate.
  attestations: (slug: string) =>
    request<AttestationSummary[]>(`/tenants/${encodeURIComponent(slug)}/operations/attestations`),
  issueAttestation: (slug: string, cities: string[]) =>
    request<IssuedAttestationResult>(`/tenants/${encodeURIComponent(slug)}/operations/attestations`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(cities.length ? { cities } : {}),
    }),
  revokeAttestation: (slug: string, digest: string) =>
    request<unknown>(`/tenants/${encodeURIComponent(slug)}/operations/attestations/revoke`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ digest }),
    }),
  rotateAttestationToken: (slug: string, digest: string) =>
    request<{ share_token: string }>(`/tenants/${encodeURIComponent(slug)}/operations/attestations/rotate`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ digest }),
    }),
  representationTargets: (slug: string) =>
    request<RepresentationTargetsResponse>(`/tenants/${encodeURIComponent(slug)}/operations/representation/targets`),
  upsertRepresentationTarget: (slug: string, input: RepresentationTargetInput) =>
    request<unknown>(`/tenants/${encodeURIComponent(slug)}/operations/representation/targets`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(input),
    }),
  requestRepresentationApproach: (slug: string, targetId: string, note?: string) =>
    request<ApproachRequestResult>(`/tenants/${encodeURIComponent(slug)}/operations/representation/approach`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ target_id: targetId, note: note ?? null }),
    }),
  upsertContentSource: (slug: string, input: ContentSourceUpsertInput) =>
    request<unknown>(`/tenants/${encodeURIComponent(slug)}/operations/content-sources`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(input),
    }),
  declareGrowthObjective: (slug: string, input: { platform: string; metric_key: string; scope_kind: string; scope_id?: string; target_value: number; deadline: string; declared_by: string }) =>
    request<AutopilotControlMutation>(`/tenants/${encodeURIComponent(slug)}/operations/objectives`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(input),
    }),
  retireGrowthObjective: (slug: string, objectiveId: string) =>
    request<AutopilotControlMutation>(`/tenants/${encodeURIComponent(slug)}/operations/objectives/${encodeURIComponent(objectiveId)}/retire`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: '{}',
    }),
  growthPosture: (slug: string) =>
    request<GrowthPostureView>(`/tenants/${encodeURIComponent(slug)}/operations/posture`),
  setGrowthPosture: (slug: string, input: { posture: string; expected_version: number }) =>
    request<AutopilotControlMutation>(`/tenants/${encodeURIComponent(slug)}/operations/posture`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(input),
    }),
  acquisitionChannels: (slug: string) =>
    request<AcquisitionChannels>(`/tenants/${encodeURIComponent(slug)}/operations/acquisition-channels`),
  fanSources: (slug: string) =>
    request<FanSourcesResponse>(`/tenants/${encodeURIComponent(slug)}/operations/fan-sources`),
  shows: (slug: string) =>
    request<TenantShowsResponse>(`/tenants/${encodeURIComponent(slug)}/shows`),
  showTimeline: (slug: string, eventSlug: string) =>
    request<TenantShowTimelineResponse>(`/tenants/${encodeURIComponent(slug)}/shows/${encodeURIComponent(eventSlug)}`),
  showScan: (slug: string, eventSlug: string) =>
    request<TenantShowScanResponse>(`/tenants/${encodeURIComponent(slug)}/shows/${encodeURIComponent(eventSlug)}/scan`),
  showReport: (slug: string, eventSlug: string) =>
    request<TenantShowReportResponse>(`/tenants/${encodeURIComponent(slug)}/shows/${encodeURIComponent(eventSlug)}/report`)
      // The issued path can carry literal `null` sections — normalize to
      // empty objects so the page's optional fields simply render nothing.
      .then(r => ({
        ...r,
        event: r.event ?? {},
        report: r.report ?? {},
        recipients: r.recipients ?? {},
        honesty_contract: r.honesty_contract ?? {},
      })),
  /** The show page's whole read side in one call — the timeline spine plus
   *  every panel's section, fanned out server-side. A section the tenant
   *  could not answer comes back `null` and named in `degraded`. */
  showModel: (slug: string, eventSlug: string) =>
    request<TenantShowPageModel>(`/tenants/${encodeURIComponent(slug)}/shows/${encodeURIComponent(eventSlug)}/model`),
  /** P.4 — one yes over the whole ladder. */
  approveShowGrowthLadder: (slug: string, eventId: string) =>
    request<unknown>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot/events/${encodeURIComponent(eventId)}/growth-ladder/approve`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
    }),
  /** P.4 — stop the rungs the ladder approval would still release. */
  revokeShowGrowthLadder: (slug: string, eventId: string) =>
    request<unknown>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot/events/${encodeURIComponent(eventId)}/growth-ladder/revoke`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
    }),
  /** Add a show by hand — the path for a label that never ran Bandsintown or
   * another sync source. Idempotent on the generated key; the answer's slug
   * is the show's durable link. */
  showCreate: (slug: string, input: ShowCreateInput, idempotencyKey: string) =>
    request<ShowCreateResult>(`/tenants/${encodeURIComponent(slug)}/shows`, {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
      body: JSON.stringify(input),
    }),
  /** Replace the night's whole bill in one write — the crossbill step's only
   * input. `position` is the row's order; `ticket_url` feeds per-act click
   * attribution. */
  showActsReplace: (slug: string, eventSlug: string, acts: ShowActInput[]) =>
    request<unknown>(`/tenants/${encodeURIComponent(slug)}/shows/${encodeURIComponent(eventSlug)}/acts`, {
      method: 'PUT',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ acts }),
    }),
  /** Who the T+7 report mails besides the band — null clears. */
  showCounterparty: (slug: string, eventSlug: string, input: { counterparty_name: string | null; counterparty_email: string | null }) =>
    request<unknown>(`/tenants/${encodeURIComponent(slug)}/shows/${encodeURIComponent(eventSlug)}/counterparty`, {
      method: 'PUT',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(input),
    }),

  // ── The shared night (4V.6b) ────────────────────────────────────────
  // One venue's night across tenants. The read answers in the tenant
  // workspace's own lens — which lens is upstream's derivation from the
  // workspace's relationship, never a parameter this call could pick.
  /** Publish or replace one contributed kind for the tenant's workspace —
   *  explicit, revocable, audited; the default is contribute nothing. */
  nightContribute: (slug: string, placeEventId: string, kind: NightContributionKind, value: Record<string, unknown>) =>
    request<SharedNight>(`/tenants/${encodeURIComponent(slug)}/nights/${encodeURIComponent(placeEventId)}/contributions`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ kind, value }),
    }),
  nightRevokeContribution: (slug: string, placeEventId: string, kind: NightContributionKind) =>
    request<SharedNight>(`/tenants/${encodeURIComponent(slug)}/nights/${encodeURIComponent(placeEventId)}/contributions/${encodeURIComponent(kind)}`, {
      method: 'DELETE',
    }),
  /** Mint the night's organiser link — every link already sent dies on
   *  this call; the token returns once, here. */
  nightMintOrganiserLink: (slug: string, placeEventId: string) =>
    request<{ token: string; expires_at: string }>(`/tenants/${encodeURIComponent(slug)}/nights/${encodeURIComponent(placeEventId)}/organiser-link`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: '{}',
    }),
  nightRevokeOrganiserLink: (slug: string, placeEventId: string) =>
    request<SharedNight>(`/tenants/${encodeURIComponent(slug)}/nights/${encodeURIComponent(placeEventId)}/organiser-link`, {
      method: 'DELETE',
    }),
  /** The billed act's own workspace confirms it is on the bill — upstream
   *  refuses anyone else with the same 404 as a nonexistent night. */
  nightConfirmAct: (slug: string, placeEventId: string, actSlug: string) =>
    request<SharedNight>(`/tenants/${encodeURIComponent(slug)}/nights/${encodeURIComponent(placeEventId)}/acts/${encodeURIComponent(actSlug)}/confirm`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: '{}',
    }),
  /** The organiser's public read — no session, the token is the whole
   *  credential; the slug names the tenant that minted it. */
  publicNight: (slug: string, token: string) =>
    request<SharedNight>(`/public/nights/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`),
  chiefOfStaff: (slug: string) =>
    request<AutopilotChiefOfStaff>(`/tenants/${encodeURIComponent(slug)}/operations/chief-of-staff`),

  // --- Outreach & Booking Discovery ---
  outreachCandidates: (slug: string, status?: string) =>
    request<OutreachCandidateView[]>(`/tenants/${encodeURIComponent(slug)}/operations/outreach/candidates` + (status ? `?status=${encodeURIComponent(status)}` : '')),
  confirmOutreachCandidate: (slug: string, candidateId: string) =>
    request<OutreachCandidatePromotion>(`/tenants/${encodeURIComponent(slug)}/operations/outreach/candidates/${encodeURIComponent(candidateId)}/confirm`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: '{}',
    }),
  bookingCandidates: (slug: string, status?: string) =>
    request<BookingCandidateView[]>(`/tenants/${encodeURIComponent(slug)}/operations/booking-discovery/candidates` + (status ? `?status=${encodeURIComponent(status)}` : '')),
  confirmBookingCandidate: (slug: string, candidateId: string) =>
    request<AutopilotControlMutation>(`/tenants/${encodeURIComponent(slug)}/operations/booking-discovery/candidates/${encodeURIComponent(candidateId)}/confirm`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: '{}',
    }),

  // --- Beacon Signal Network ---
  beaconSignalDashboard: (slug: string) =>
    request<BeaconDashboardResponse>(`/tenants/${encodeURIComponent(slug)}/operations/beacon-signal`),
  beaconSignalCandidates: (slug: string) =>
    request<BeaconCandidatesResponse>(`/tenants/${encodeURIComponent(slug)}/operations/beacon-signal/candidates`),
  beaconPressRequests: (slug: string) =>
    request<BeaconPressRequestsResponse>(`/tenants/${encodeURIComponent(slug)}/operations/beacon-press-requests`),
  resolveBeaconPressRequest: (slug: string, pressRequestId: string, body: { status: string; resolutionNote?: string }) =>
    request<{ requestId: string; status: string }>(`/tenants/${encodeURIComponent(slug)}/operations/beacon-press-requests/${encodeURIComponent(pressRequestId)}/resolve`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(body),
    }),
  upsertBeaconPressAsset: (
    slug: string,
    body: {
      assetKey: string
      assetKind: string
      labelPl: string
      labelEn: string
      url: string
      eventId?: string
      sortOrder?: number
      active?: boolean
    },
  ) =>
    request<{ assetId: string }>(`/tenants/${encodeURIComponent(slug)}/operations/beacon-press-assets`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify(body),
    }),
  beaconPressAssets: (slug: string) =>
    request<BeaconPressAssetsResponse>(`/tenants/${encodeURIComponent(slug)}/operations/beacon-press-assets`),
  beaconSignalEngagements: (slug: string) =>
    request<BeaconEngagementsResponse>(`/tenants/${encodeURIComponent(slug)}/operations/beacon-signal-engagements`),
  beaconCoverage: (slug: string) =>
    request<BeaconCoverageResponse>(`/tenants/${encodeURIComponent(slug)}/operations/beacon-coverage`),
  beaconNetwork: (slug: string) =>
    request<BeaconNetworkResponse>(`/tenants/${encodeURIComponent(slug)}/operations/beacon-network`),

  // Two pools of researched contacts existed — agent-proposed targets and
  // screened candidate routes — with no path onto the roster. Imported
  // beacons arrive unverified and queue behind the same approval as anything
  // discovery finds, so this adds names to review, not people to email.
  importResearchedBeacons: (slug: string) =>
    request<BeaconImportResult>(`/tenants/${encodeURIComponent(slug)}/operations/beacon-network`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ action: 'import_researched' }),
    }),

  // SubmitHub Activity CSV export → unverified beacons. The CSV carries
  // curator names and actions but no contact routes — the operator
  // enriches those from the SubmitHub chat before approving. Only
  // curators who approved or shared are imported.
  importSubmithubCsv: (slug: string, csvText: string) =>
    request<BeaconImportResult>(`/tenants/${encodeURIComponent(slug)}/operations/beacons/import-submithub`, {
      method: 'POST',
      headers: {
        'content-type': 'text/csv',
        'idempotency-key': crypto.randomUUID(),
      },
      body: csvText,
    }),

  // --- Beacon management ---
  // Six read endpoints existed before these; not one write. The roster was
  // observable and unchangeable. Payloads are snake_case: the tenant's write
  // contracts are, even though its responses are camelCase.
  upsertBeacon: (slug: string, beacon: BeaconUpsertInput) =>
    request<{ beacon_id: string; version: number; replayed: boolean; operation_id: string }>(
      `/tenants/${encodeURIComponent(slug)}/operations/beacons`,
      {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          beacon_id: beacon.beaconId ?? null,
          city_id: beacon.cityId ?? null,
          city_slug: beacon.citySlug ?? null,
          beacon_kind: beacon.beaconKind,
          display_name: beacon.displayName,
          contact_email: beacon.contactEmail ?? null,
          destination_url: beacon.destinationUrl ?? null,
          source_url: beacon.sourceUrl ?? null,
          active: beacon.active,
          verified: beacon.verified,
          accepts_outreach: beacon.acceptsOutreach,
          do_not_contact: beacon.doNotContact,
          relationship_score: beacon.relationshipScore,
          relevance_basis_points: beacon.relevanceBasisPoints,
          confidence_basis_points: beacon.confidenceBasisPoints,
          metadata: {},
          // Required upstream: 0 is create-intent, a positive value is the
          // CAS version for an edit. The console only creates for now.
          expected_version: beacon.expectedVersion ?? 0,
        }),
      },
    ),
  batchInviteBeacons: (slug: string, beaconIds: string[], options?: { ttlDays?: number; radiusKm?: number; locale?: string }) =>
    request<{ created: number; skipped: number; invitations: { beaconId: string; displayName: string; inviteUrl: string }[] }>(`/tenants/${encodeURIComponent(slug)}/operations/beacons/signal-invites/batch`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        beaconIds: beaconIds,
        ...(options?.ttlDays ? { ttlDays: options.ttlDays } : {}),
        ...(options?.radiusKm ? { radiusKm: options.radiusKm } : {}),
        ...(options?.locale ? { locale: options.locale } : {}),
      }),
    }),
  // The single-invite endpoint is the deliberate revive path: the batch only
  // reaches never-invited and lapsed invites, while this can re-approach a
  // paused or revoked beacon one person at a time.
  inviteBeacon: (slug: string, beaconId: string) =>
    request<{ beaconId: string; inviteUrl: string }>(`/tenants/${encodeURIComponent(slug)}/operations/beacons/${encodeURIComponent(beaconId)}/signal-invites`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({}),
    }),
  setBeaconState: (slug: string, beaconId: string, status: 'active' | 'paused' | 'revoked') =>
    request<{ beaconId: string; status: string }>(`/tenants/${encodeURIComponent(slug)}/operations/beacons/${encodeURIComponent(beaconId)}/signal-state`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ status }),
    }),
  recordBeaconReply: (slug: string, beaconId: string, input: { eventId: string; disposition: string; occurredAt: string }) =>
    request<{ beaconId: string }>(`/tenants/${encodeURIComponent(slug)}/operations/beacons/${encodeURIComponent(beaconId)}/reply`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        event_id: input.eventId,
        disposition: input.disposition,
        occurred_at: input.occurredAt,
      }),
    }),

  // P.1 — the industry list as an audience, and the one-person invitation.
  dualRoleContacts: (slug: string) =>
    request<DualRoleReview>(`/tenants/${encodeURIComponent(slug)}/operations/contacts/dual-role`),
  inviteToLatarnik: (slug: string, beaconId: string) =>
    request<LatarnikInviteResult>(`/tenants/${encodeURIComponent(slug)}/operations/contacts/${encodeURIComponent(beaconId)}/latarnik-invite`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
    }),

  // --- Release Campaigns ---
  beaconReleaseCampaigns: (slug: string) =>
    request<AdminReleaseCampaignsResponse>(`/tenants/${encodeURIComponent(slug)}/operations/beacon-release-campaigns`),
  createBeaconReleaseCampaign: (slug: string, input: { slug: string; title: string; sku: string; claimDeadline: string }) =>
    request<{ campaignId: string; status: string }>(`/tenants/${encodeURIComponent(slug)}/operations/beacon-release-campaigns`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      // snake_case: the tenant's create contract is not camelCased, unlike its
      // responses. Sending claimDeadline silently fails validation.
      body: JSON.stringify({
        slug: input.slug,
        title: input.title,
        sku: input.sku,
        claim_deadline: input.claimDeadline,
      }),
    }),
  launchBeaconReleaseCampaign: (slug: string, campaignId: string) =>
    request<{ campaignId: string; status: string; eligibleCount: number; reservedQuantity: number; availableBeforeReservation: number }>(`/tenants/${encodeURIComponent(slug)}/operations/beacon-release-campaigns/${encodeURIComponent(campaignId)}/launch`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: '{}',
    }),
  closeBeaconReleaseCampaign: (slug: string, campaignId: string) =>
    request<{ campaignId: string; status: string }>(`/tenants/${encodeURIComponent(slug)}/operations/beacon-release-campaigns/${encodeURIComponent(campaignId)}/close`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: '{}',
    }),
  beaconReleaseRecipients: (slug: string, campaignId: string) =>
    request<AdminReleaseRecipientsResponse>(`/tenants/${encodeURIComponent(slug)}/operations/beacon-release-campaigns/${encodeURIComponent(campaignId)}/recipients`),

  // --- Play Ledger ---
  playLedger: (slug: string) =>
    request<PlayLedger>(`/tenants/${encodeURIComponent(slug)}/operations/plays`),
}
