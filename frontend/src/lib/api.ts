import type { AreaCity, AreaDropDetail, AreaDropDraft, AreaDropSummary, AreaOverview, AreaValidationResult, AuditEntry, AgentScorecard, AgentProvider, AgentCredential, AgentModel, AgentTask, AgentTaskResult, AgentSchedule, AgentTemplate, AgentOutcome, AgentWorkflow, AgentWorkflowTask, TaskSuggestion, AutomationEvent, AutomationRoutingItem, AutomationWorkflowConfig, AutopilotOverview, AutopilotPolicy, BulkAutopilotResult, IntelligenceDecisionsData, ChatAction, CommunityItem, CommunityObservationItem, CommunityEntityItem, ConnectionCreationResult, DeliveryDetails, DeliveryItem, DiscoveredEndpoint, FanbaseConnection, FeatureFlag, GrowthFunnelData, GrowthOverview, NotifierChannel, OperationTimeline, OperationsSummary, OperatorAccount, OutboxItem, Palette, PlatformConfigItem, PlatformHealthEntry, Profile, ProvisioningJob, ReconciliationResult, RegionalProfile, ReplyTriageView, RetryResult, SignalOverview, TenantOperationsReadModel, TenantOverviewReadModel, TenantPortfolioReadModel, TenantRuntimeSnapshot, TenantSummary, AudienceOverview, FanCard, FanDetail, FanJourneyEntry, AudienceSegment, SegmentPreview, AudienceReadModel, GrowthMetricCoverageResponse, GrowthMetricTrendsResponse, GrowthObjectiveView, GrowthObjectivesResponse, AutopilotControlMutation, GrowthPostureView, AcquisitionChannels, ShowEconomicsResponse, TourEconomicsSummary, AutopilotChiefOfStaff, OutreachCandidateView, OutreachCandidatePromotion, BookingCandidateView, BeaconDashboardResponse, BeaconCandidatesResponse, BeaconPressRequestsResponse, BeaconPressAssetsResponse, BeaconEngagementsResponse, BeaconCoverageResponse, BeaconNetworkResponse, BeaconImportResult, NotifiersOverview, AdminReleaseCampaignsResponse, AdminReleaseRecipientsResponse, PlayLedger, UsageAnalyticsData, DecisionEvidence, LearningLoopEntry, CyclePreview, CycleRunResult, NorthStarOption, AudiencePlace, AudiencePlaceInput, BeaconUpsertInput } from './types'

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}

// Registered by lib/auth.ts so a 401 anywhere drops the in-memory profile.
let unauthorizedHandler: (() => void) | null = null
export const setUnauthorizedHandler = (handler: () => void) => {
  unauthorizedHandler = handler
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'same-origin',
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
    const body = await response.json().catch(() => ({ detail: response.statusText })) as { detail?: string }
    throw new ApiError(response.status, body.detail ?? `HTTP ${response.status}`)
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
  fanbaseSources?: string[]
  signalPlayStoreUrl?: string
  synesthesiaPlayStoreUrl?: string
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
  discoveredEndpoints: (slug: string) =>
    request<{ endpoints: DiscoveredEndpoint[] }>(`/tenants/${encodeURIComponent(slug)}/notifiers/discovered`),
  notifierPlatformConfig: (slug: string) =>
    request<{ items: PlatformConfigItem[] }>(`/tenants/${encodeURIComponent(slug)}/notifiers/platform-config`),
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

  notifierAutomationRouting: (slug: string) =>
    request<{ items: AutomationRoutingItem[] }>(`/tenants/${encodeURIComponent(slug)}/notifiers/automation-routing`),
  communityIntelligenceCommunities: (slug: string) =>
    request<{ items: CommunityItem[] }>(`/tenants/${encodeURIComponent(slug)}/portfolio/communities`),
  communityIntelligenceObservations: (slug: string, placeId: string) =>
    request<{ items: CommunityObservationItem[] }>(`/tenants/${encodeURIComponent(slug)}/portfolio/communities/${encodeURIComponent(placeId)}/observations`),
  communityIntelligenceEntities: (slug: string, placeId: string) =>
    request<{ items: CommunityEntityItem[]; observationId: string }>(`/tenants/${encodeURIComponent(slug)}/portfolio/communities/${encodeURIComponent(placeId)}/entities`),
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
  tenants: () => request<{ items: TenantSummary[] }>('/tenants'),
  // One purpose-built read model per tenant subpage. The browser never
  // orchestrates a fan-out to assemble a screen.
  tenantOverview: (slug: string) => request<TenantOverviewReadModel>(`/tenants/${encodeURIComponent(slug)}/overview`),
  tenantOperations: (slug: string) => request<TenantOperationsReadModel>(`/tenants/${encodeURIComponent(slug)}/operations/overview`),
  agentScorecard: (slug: string) => request<AgentScorecard>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot/scorecard`),
  replyTriage: (slug: string) => request<ReplyTriageView>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot/reply-triage`),
  decisionEvidence: (slug: string, decisionId: string) => request<DecisionEvidence>(`/tenants/${encodeURIComponent(slug)}/operations/decisions/${encodeURIComponent(decisionId)}/evidence`),
  learningLoop: (slug: string) => request<LearningLoopEntry[]>(`/tenants/${encodeURIComponent(slug)}/operations/learning-loop`),
  autopilotCyclePreview: (slug: string) => request<CyclePreview>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot/cycle/preview`),
  autopilotCycleRun: (slug: string) => request<CycleRunResult>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot/cycle/run`, { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() } }),
  autopilotOverview: (slug: string) => request<AutopilotOverview>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot`),
  tenant: (slug: string) => request<TenantSummary>(`/tenants/${encodeURIComponent(slug)}`),
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
  planProvisioning: (slug: string, desiredVersion?: string) =>
    request<ProvisioningJob>(`/tenants/${encodeURIComponent(slug)}/provisioning/plan`, { method: 'POST', body: JSON.stringify({ desiredVersion: desiredVersion || undefined }) }),
  deployTenant: (slug: string, desiredVersion?: string) =>
    request<ProvisioningJob>(`/tenants/${encodeURIComponent(slug)}/provisioning/deploy`, { method: 'POST', body: JSON.stringify({ desiredVersion: desiredVersion || undefined }) }),
  cancelProvisioning: (slug: string) => request<ProvisioningJob>(`/tenants/${encodeURIComponent(slug)}/provisioning/cancel`, { method: 'POST', body: '{}' }),
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
  setAutopilotPolicy: (slug: string, policy: AutopilotPolicy, input: Pick<AutopilotPolicy, 'enabled'|'autonomy_level'|'minimum_confidence'|'max_actions_24h'>) => request<unknown>(`/tenants/${encodeURIComponent(slug)}/operations/autopilot/${encodeURIComponent(policy.context)}`, {
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
  // Opportunity board decisions. Both upstream mutations take no body; the
  // idempotency key makes a lost response safe to retry as the same intent.
  approveOpportunityAction: (slug: string, actionId: string) => request<{ operation_id: string; target_id: string; status: string; replayed: boolean }>(`/tenants/${encodeURIComponent(slug)}/operations/opportunities/actions/${encodeURIComponent(actionId)}/approve`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: '{}',
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
  updatePortfolioSetting: (slug: string, key: string, value: string) =>
    request<{ key: string; value: string }>(`/tenants/${encodeURIComponent(slug)}/portfolio/settings/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ value }),
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
  automationEvents: (params?: { limit?: number; status?: string; workflowId?: string }) =>
    request<{ items: AutomationEvent[] }>(`/automation/events${params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString() : ''}`),
  ackAutomationEvent: (id: string) =>
    request<{ id: string; status: string }>(`/automation/events/${encodeURIComponent(id)}/ack`, { method: 'POST', body: '{}' }),
  resolveAutomationEvent: (id: string) =>
    request<{ id: string; status: string }>(`/automation/events/${encodeURIComponent(id)}/resolve`, { method: 'POST', body: '{}' }),
  retryAutomationEvent: (id: string) =>
    request<{ id: string; status: string }>(`/automation/events/${encodeURIComponent(id)}/retry`, { method: 'POST', body: '{}', headers: { 'idempotency-key': crypto.randomUUID() } }),
  automationWorkflowConfigs: () =>
    request<{ items: AutomationWorkflowConfig[] }>(`/automation/workflows`),
  updateAutomationWorkflowConfig: (workflowId: string, input: { category?: string; discordEnabled?: boolean; muted?: boolean; label?: string }) =>
    request<AutomationWorkflowConfig>(`/automation/workflows/${encodeURIComponent(workflowId)}`, { method: 'PATCH', body: JSON.stringify(input) }),

  // --- Agent service (proxied through control-plane) ---
  agentTemplates: (slug: string) =>
    request<{ templates: AgentTemplate[] }>(`/tenants/${encodeURIComponent(slug)}/agents/templates`),
  agentTasks: (slug: string) =>
    request<{ tasks: AgentTask[] }>(`/tenants/${encodeURIComponent(slug)}/agents/tasks`),
  agentTaskResult: (slug: string, taskId: string) =>
    request<AgentTaskResult>(`/tenants/${encodeURIComponent(slug)}/agents/tasks/${encodeURIComponent(taskId)}/result`),
  agentProviders: (slug: string) =>
    request<{ providers: AgentProvider[] }>(`/tenants/${encodeURIComponent(slug)}/agents/providers`),
  agentCredentials: (slug: string) =>
    request<{ credentials: AgentCredential[] }>(`/tenants/${encodeURIComponent(slug)}/agents/credentials`),
  agentPasteCredential: (slug: string, input: { provider: string; api_key: string; label?: string; provider_account?: string }) =>
    request<void>(`/tenants/${encodeURIComponent(slug)}/agents/credentials`, { method: 'POST', body: JSON.stringify(input) }),
  agentDeleteCredential: (slug: string, provider: string) =>
    request<void>(`/tenants/${encodeURIComponent(slug)}/agents/credentials/${encodeURIComponent(provider)}`, { method: 'DELETE' }),
  agentValidateCredential: (slug: string, provider: string) =>
    request<void>(`/tenants/${encodeURIComponent(slug)}/agents/credentials/${encodeURIComponent(provider)}/validate`, { method: 'POST', body: '{}' }),
  agentModels: (slug: string) =>
    request<{ models: AgentModel[]; connectedProviders: string[] }>(`/tenants/${encodeURIComponent(slug)}/agents/models`),
  agentSuggestions: (slug: string) =>
    request<{ suggestions: TaskSuggestion[] }>(`/tenants/${encodeURIComponent(slug)}/agents/suggestions`),
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
  agentSchedules: (slug: string) =>
    request<{ schedules: AgentSchedule[] }>(`/tenants/${encodeURIComponent(slug)}/agents/schedules`),
  agentCreateSchedule: (slug: string, input: { template_id: string; model_id: string; prompt: string; interval_minutes: number }) =>
    request<{ schedule: AgentSchedule }>(`/tenants/${encodeURIComponent(slug)}/agents/schedules`, { method: 'POST', body: JSON.stringify(input) }),
  agentDeleteSchedule: (slug: string, id: string) =>
    request<void>(`/tenants/${encodeURIComponent(slug)}/agents/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  agentToggleSchedule: (slug: string, id: string, enabled: boolean) =>
    request<void>(`/tenants/${encodeURIComponent(slug)}/agents/schedules/${encodeURIComponent(id)}/enabled`, { method: 'POST', body: JSON.stringify({ enabled }) }),

  // --- AI Chatbot (proxied through control-plane to agent service) ---
  agentChat: (slug: string, message: string, history: Array<{ role: 'user' | 'assistant'; content: string }>, pageContext?: string) =>
    request<{ reply: string; actions: ChatAction[]; usage?: { tokens_in: number; tokens_out: number } }>(`/tenants/${encodeURIComponent(slug)}/agents/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, history, page_context: pageContext }),
    }),

  // --- Fanbase connections ---
  fanbaseConnections: (slug: string) =>
    request<{ connections: FanbaseConnection[] }>(`/tenants/${encodeURIComponent(slug)}/portfolio/fanbases/connections`),
  deleteFanbaseConnection: (slug: string, id: string) =>
    request<void>(`/tenants/${encodeURIComponent(slug)}/portfolio/fanbases/connections/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createDiscordConnection: (slug: string, guildId: string, label?: string) =>
    request<{ platform: string; status: string }>(`/tenants/${encodeURIComponent(slug)}/portfolio/connections/discord`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ guildId, label }),
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
  audienceSegmentPreview: (slug: string, segmentSlug: string) =>
    request<SegmentPreview>(`/tenants/${encodeURIComponent(slug)}/audience/segments/${encodeURIComponent(segmentSlug)}/preview`),

  // --- Growth Metrics, Objectives, Posture ---
  growthMetricCoverage: (slug: string) =>
    request<GrowthMetricCoverageResponse>(`/tenants/${encodeURIComponent(slug)}/operations/growth-metrics/coverage`),
  growthMetricTrends: (slug: string) =>
    request<GrowthMetricTrendsResponse>(`/tenants/${encodeURIComponent(slug)}/operations/growth-metrics/trends`),
  growthObjectives: (slug: string) =>
    request<GrowthObjectivesResponse>(`/tenants/${encodeURIComponent(slug)}/operations/objectives`),
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
  tourEconomics: (slug: string) =>
    request<TourEconomicsSummary>(`/tenants/${encodeURIComponent(slug)}/operations/tour-economics`),
  showEconomics: (slug: string) =>
    request<ShowEconomicsResponse>(`/tenants/${encodeURIComponent(slug)}/operations/show-economics`),
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

  // --- Beacon management ---
  // Six read endpoints existed before these; not one write. The roster was
  // observable and unchangeable. Payloads are snake_case: the tenant's write
  // contracts are, even though its responses are camelCase.
  upsertBeacon: (slug: string, beacon: BeaconUpsertInput) =>
    request<{ beaconId: string }>(`/tenants/${encodeURIComponent(slug)}/operations/beacons`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        beacon_id: beacon.beaconId ?? null,
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
      }),
    }),
  batchInviteBeacons: (slug: string, beaconIds: string[], options?: { ttlDays?: number; radiusKm?: number; locale?: string }) =>
    request<{ invites: { beaconId: string; status: string }[] }>(`/tenants/${encodeURIComponent(slug)}/operations/beacons/signal-invites/batch`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        beacon_ids: beaconIds,
        ...(options?.ttlDays ? { ttl_days: options.ttlDays } : {}),
        ...(options?.radiusKm ? { radius_km: options.radiusKm } : {}),
        ...(options?.locale ? { locale: options.locale } : {}),
      }),
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
