export type Palette = {
  primary: string
  primaryContrast: string
  accent: string
  surface: string
  surfaceElevated: string
  text: string
  textMuted: string
  success: string
  warning: string
  danger: string
}

export type RegionalProfile = {
  countryCode: string
  region: 'eu' | 'us'
  locale: string
  timezone: string
  currency: string
  dateFormat: 'dmy' | 'mdy' | 'ymd'
  numberFormat: 'comma_decimal' | 'dot_decimal'
  dataRegion: 'eu' | 'us'
}

export type RuntimeStatus = {
  tenantId: string
  apiHealthy: boolean | null
  workerHealthy: boolean | null
  schemaVersion: number | null
  deployedSha: string | null
  outboxPending: number | null
  queueLag: number | null
  lastHeartbeatAt: string | null
  checkedAt: string | null
}

export type Tenant = {
  id: string
  slug: string
  displayName: string
  status: 'provisioning' | 'active' | 'suspended'
  workspaceId: string | null
  crowdrelayBaseUrl: string | null
  signalBaseUrl: string | null
  defaultCountryCode: string
  regionalProfile: RegionalProfile | null
  brandingPalette: Palette | null
  synesthesiaEnabled: boolean
  areaEnabled: boolean
  createdAt: string
  updatedAt: string
}

export type RuntimeHealth = 'healthy' | 'degraded' | 'stale' | 'unknown'

export type TenantSummary = Tenant & { runtime: RuntimeStatus | null; runtimeHealth: RuntimeHealth }
export type TenantRuntimeSnapshot = { runtime: RuntimeStatus | null; runtimeHealth: RuntimeHealth }

export type AuditEntry = {
  id: string
  tenantId: string | null
  actor: string
  action: string
  targetKind: string
  targetId: string
  requestId: string | null
  detail: Record<string, unknown>
  createdAt: string
}

export type ProvisioningResult = {
  apiPort?: number
  localApiUrl?: string
  workspaceId?: string
  schemaVersion?: number
  deployedSha?: string
  provisionerWorkerId?: string
  dataRegion?: 'eu' | 'us' | null
  completedAt?: string
}

export type ProvisioningJob = {
  id: string
  tenantId: string
  status: 'planned' | 'approved' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  desiredVersion: string | null
  plan: Record<string, unknown>
  createdBy: string
  attemptCount: number
  claimedBy: string | null
  leaseExpiresAt: string | null
  startedAt: string | null
  finishedAt: string | null
  result: ProvisioningResult | null
  errorCode: string | null
  errorDetail: string | null
  createdAt: string
  updatedAt: string
}

export type AreaStatus = 'DRAFT' | 'PAUSED' | 'SCHEDULED' | 'LIVE' | 'ENDED' | 'ARCHIVED'
export type AreaCity = { id:string; slug:string; name:string; countryCode:string; region:string|null; latitude:number|null; longitude:number|null; moderationStatus:string }
export type AreaClue = { en:string; pl:string }
export type AreaCollectible = { line:string; track:string; edition:string; riddle:string }
export type AreaDropDraft = {
  number:string; cityId:string; mapX:number; mapY:number
  approximateLat:number; approximateLng:number; exactLat:number|null; exactLng:number|null
  radiusMeters:number; maxClaims:number; startsAt:string; endsAt:string
  clue:AreaClue; collectible:AreaCollectible; sortOrder:number
}
export type AreaDropSummary = {
  id:string; number:string; cityId:string; city:string; region:string; status:AreaStatus; active:boolean
  revision:number; hasDraft:boolean; hasExactLocation:boolean; claimCount:number; maxClaims:number
  startsAt:string; endsAt:string
}
export type AreaDropDetail = { summary:AreaDropSummary; published:AreaDropDraft; draft:AreaDropDraft|null; draftBaseRevision:number|null }
export type AreaOverview = {
  enabled:boolean; entitled:boolean; total:number; live:number; scheduled:number; drafts:number
  ended:number; paused:number; archived:number; totalClaims:number
}
export type AreaValidationIssue = { code:string; field:string; message:string; confirmationRequired:boolean }
export type AreaValidationResult = { valid:boolean; issues:AreaValidationIssue[] }

export type OperationsQueueSummary = {
  pending: number
  processing: number
  delivered_24h: number
  dead: number
  cancelled: number
  oldest_pending_seconds: number
}

export type DatabaseRuntimeSummary = {
  pool_size: number
  pool_idle: number
  pool_max: number
  server_version_num: number
  io_method: string | null
  io_workers: number | null
  io_max_concurrency: number | null
  effective_io_concurrency: number | null
  maintenance_io_concurrency: number | null
  io_combine_limit_bytes: number | null
  io_max_combine_limit_bytes: number | null
  async_io_active: boolean
}

export type AreaRuntimeSummary = {
  credits_total: number
  vouchers_issued: number
  stale_voucher_reservations: number
  ticket_rewards_issued: number
  stale_ticket_reward_reservations: number
  legacy_imported_players: number
}

export type OperationsSummary = {
  outbox: OperationsQueueSummary
  deliveries: OperationsQueueSummary
  push: OperationsQueueSummary
  watchdog: { active_alerts: number; critical_alerts: number; last_observed_at: string | null }
  http: { requests: number; errors_4xx: number; errors_5xx: number; average_ms: number; p50_ms: number; p95_ms: number }
  database: DatabaseRuntimeSummary
  area: AreaRuntimeSummary
  schema_version: number
  release: string
}

// One row of the CrowdRelay watchdog's alert state. `watchdog.active_alerts`
// counts these; the list says which alert fired and on what evidence.
export type OpsAlert = {
  alert_key: string
  severity: 'critical' | 'warning' | string
  summary: string
  active: boolean
  first_seen_at: string
  last_seen_at: string
  last_alerted_at: string | null
  recovered_at: string | null
  details: Record<string, unknown>
}

export type OutboxItem = {
  id: string
  event_type: string
  event_version: number
  status: string
  attempts: number
  max_attempts: number
  available_at: string
  last_error_kind: string | null
  created_at: string
  updated_at: string
  delivered_at: string | null
  dead_at: string | null
}

export type DeliveryItem = {
  id: string
  outbox_event_id: string
  event_type: string
  endpoint_name: string
  endpoint_active: boolean
  status: string
  attempt_count: number
  max_attempts: number
  available_at: string
  last_response_status: number | null
  last_error_kind: string | null
  created_at: string
  updated_at: string
  delivered_at: string | null
  dead_at: string | null
}

export type DeliveryAttempt = {
  attempt_number: number
  started_at: string
  finished_at: string
  outcome: string
  response_status: number | null
  error_kind: string | null
  duration_ms: number
}

export type DeliveryDetails = { delivery: DeliveryItem; attempts: DeliveryAttempt[] }

export type PushDeliveryItem = {
  id: string
  fan_id: string | null
  source_kind: string
  title: string
  status: string
  attempt_count: number
  error_code: string | null
  available_at: string
  created_at: string
  delivered_at: string | null
  completed_at: string | null
}

export type SignalOverview = {
  generated_at: string
  summary: {
    total_fans: number
    active_fans: number
    pending_fans: number
    unsubscribed_fans: number
    suppressed_fans: number
    marketing_opted_in: number
    nearby_enabled: number
  }
  activity: {
    new_fans_7d: number
    new_fans_30d: number
    referral_attributions_total: number
    referral_attributions_30d: number
    event_interests_total: number
    event_interests_30d: number
    nearby_notifications_30d: number
    pending_city_requests: number
  }
  top_cities: { slug: string; name: string; country_code: string; active_fans: number }[]
  unavailable_sources: string[]
}

export type RetryResult = {
  operation_id: string
  target_type: string
  target_id: string
  status: string
  replayed: boolean
}

export type OperationTimelineEvent = {
  occurred_at: string
  source: string
  kind: string
  status: string | null
  target_type: string | null
  target_id: string | null
}

export type OperationTimeline = { request_id: string; events: OperationTimelineEvent[] }

export type ReconciliationRun = {
  id: string
  status: string
  trigger: string
  finding_count: number
  started_at: string
  finished_at: string | null
}

export type ReconciliationFinding = {
  id: string
  run_id: string
  kind: string
  severity: 'info' | 'warning' | 'critical' | string
  entity_type: string
  entity_id: string | null
  entity_label: string | null
  summary: string
  suggested_action: string | null
  metadata: Record<string, unknown>
  created_at: string
  resolved_at: string | null
}

export type EcosystemOverview = {
  schema_version: number
  flags: FeatureFlag[]
  last_reconciliation: ReconciliationRun | null
  open_findings: number
  next_event: { id: string; slug: string; title: string; venue: string | null; starts_at: string } | null
  bandsintown_sync: {
    last_synced_at: string | null
    last_success_at: string | null
    next_sync_at: string
    consecutive_failures: number
    last_error: string | null
    in_progress: boolean
  } | null
}

export type ReconciliationResult = {
  run: ReconciliationRun
  findings: ReconciliationFinding[]
  replayed: boolean
}

export type FeatureFlag = {
  key: string
  enabled: boolean
  reason: string | null
  version: number
  updated_at: string
}

export type AutonomyLevel = 'observe' | 'recommend' | 'require_approval' | 'bounded_auto'

export type AutopilotPolicy = {
  context: string
  enabled: boolean
  autonomy_level: AutonomyLevel
  minimum_confidence: number
  max_actions_24h: number
  version: number
  guarded_until: string | null
  guardrail_reason: string | null
}

export type RumMetric = {
  surface: string
  metric_key: string
  samples_24h: number
  p75: number
  p95: number
}

export type ReleaseComponentSummary = {
  component_key: string
  environment: string
  source_sha: string
  artifact_digest: string | null
  deploy_ref: string | null
  version: string | null
  manifest_sha: string | null
  dependency_lock_sha256: string | null
  artifact_manifest_sha256: string | null
  workflow_attestation_sha: string | null
  workflow_attested_at: string | null
  observed_at: string
  stale: boolean
}

export type ReleaseLedgerOverview = {
  components: ReleaseComponentSummary[]
  missing_components: string[]
  backend_sha_drift: boolean
  executor_manifest_drift: boolean
  active_executor_count: number
  guarded_executor_count: number
  active_executor_manifest_shas: string[]
  active_team_email_executor_count: number
  n8n_attestation_ready: boolean
  team_email_live: boolean
}

export type AutopilotOverview = {
  runtime_enabled: boolean
  policies: AutopilotPolicy[]
  needs_you: unknown[]
  queued_actions: number
  processing_actions: number
  succeeded_24h: number
  failed_24h: number
  executor_confirmed_24h: number
  executor_failed_24h: number
  awaiting_executor: number
  release_ledger: ReleaseLedgerOverview
  rum_metrics_24h: RumMetric[]
}

export type GrowthCampaignProgress = {
  campaign_id: string
  slug: string
  name: string
  template_key: string
  status: string
  scheduled_at: string | null
  completed_at: string | null
  recipient_count: number
  delivered_count: number
  failed_count: number
  claimed_count: number
  pending_count: number
  stalled: boolean
}

export type GrowthDeliveryTotals = {
  scheduled_campaigns: number
  completed_campaigns: number
  cancelled_campaigns: number
  delivered: number
  failed: number
  pending: number
  claimed: number
  stalled_campaigns: number
}

export type GrowthOutreachSummary = {
  active_opportunities: number
  playlist_opportunities: number
  awaiting_reply: number
  replies_14d: number
  eligible_playlist_targets: number
  suppressed_targets: number
}

export type GrowthOverview = {
  campaigns_enabled: boolean
  totals: GrowthDeliveryTotals
  outreach: GrowthOutreachSummary
  campaigns: GrowthCampaignProgress[]
}

// One ranked opportunity-board finding from CrowdRelay's next-best-action
// queue. The ids are what the two buttons act on: "do it" approves
// `action_id` through the existing approval path, "done ourselves" records
// the human outcome against `decision_id`.
export type OpportunityBoardEntry = {
  position: number
  decision_id: string
  action_id: string | null
  context: string
  decision_kind: string
  subject_kind: string
  subject_id: string
  authority: 'awaiting_approval' | 'recommended' | 'observed' | 'auto_executing'
  confidence: number
  reason: string
  recommended_action: string
  ranked_by: string
  consequence: string
  due_at: string | null
  value_tier: 'vanity' | 'intermediate' | 'downstream' | null
  deviation_basis_points: number | null
}

// Per-subpage read models. Each Control Plane tenant subpage loads exactly one
// of these with one request; there is deliberately no combined tenant model, so
// a field added for one subpage cannot grow another subpage's payload.

export type TenantOverviewReadModel = {
  id: string
  tenant: TenantSummary
  provisioning: { items: ProvisioningJob[] }
  audit: { items: AuditEntry[] }
  platform: {
    runtimeStaleAfterSeconds: number
    provisionerConfigured: boolean
    provisionerDefaultImageTag: string | null
  }
}

export type TenantOperationsSection = 'summary' | 'flags' | 'autopilot' | 'growth' | 'opportunities'

export type TenantOperationsReadModel = {
  id: string
  summary: OperationsSummary | null
  flags: FeatureFlag[] | null
  autopilot: AutopilotOverview | null
  growth: GrowthOverview | null
  opportunities: OpportunityBoardEntry[] | null
  // Sections the tenant channel could not serve. They render as locally
  // degraded instead of failing the whole subpage.
  degraded: TenantOperationsSection[]
}

export type PortfolioConsentStatus = 'proposed' | 'active' | 'paused' | 'revoked'
export type PortfolioPurpose = 'cross_promote' | 'release_feature' | 'event_crossbill'

export interface PortfolioConsent {
  id: string
  from_workspace_id: string
  to_workspace_id: string
  purpose: PortfolioPurpose
  scope: 'all_active' | 'double_opt_in'
  status: PortfolioConsentStatus
  max_campaigns_per_month: number
  cooldown_days: number
  campaigns_this_month: number
  approved_by: string | null
  approved_at: string | null
  revoked_at: string | null
}

export interface PortfolioOverview {
  workspaceCount: number
  activeFans: number
  fansLast30d: number
  activeEdges: number
  deliveriesLast30d: number
}

export type Profile = {
  username: string
  role: 'platform_admin' | 'tenant_operator'
  tenantSlug: string | null
}

export type OperatorAccount = {
  id: string
  username: string
  role: 'tenant_operator'
  tenantId: string
  active: boolean
}

export type NotifierKind = 'discord' | 'webhook' | 'email_relay'
export type NotifierChannel = {
  id: string
  kind: NotifierKind
  label: string
  config: { urlHost?: string; to?: string }
  events: string[]
  enabled: boolean
}
export const NOTIFIER_EVENTS = [
  'provisioning.failed',
  'runtime.degraded',
  'runtime.stale',
  'runtime.recovered',
] as const
export type NotifierEvent = (typeof NOTIFIER_EVENTS)[number]

export type DiscoveredEndpoint = {
  id: string
  name: string
  urlHost: string
  active: boolean
}

export type PlatformHealthEntry = {
  service: string
  label: string
  url: string
  healthy: boolean
  lastStatus: string | null
  lastCheckedAt: string
  lastHealthyAt: string | null
  latencyMs: number | null
}

export type AutomationEvent = {
  id: string
  workflowId: string
  workflowName: string
  executionId: string | null
  eventKind: 'error' | 'status' | 'heartbeat' | 'approval'
  severity: 'info' | 'warn' | 'error'
  nodeName: string | null
  message: string
  payload: Record<string, unknown>
  occurredAt: string
  status: 'new' | 'acknowledged' | 'retried' | 'resolved' | 'muted'
  retryCount: number
  lastRetriedAt: string | null
  createdAt: string
}

export type AutomationWorkflowConfig = {
  workflowId: string
  label: string
  category: 'real_work' | 'status' | 'system'
  discordEnabled: boolean
  muted: boolean
  createdAt: string
  updatedAt: string
}

export type BulkAutopilotResult = {
  enabled: boolean
  updated: number
  results: Array<{ context: string; ok: boolean; error?: string }>
}

export interface PortfolioSettingsReadModel {
  settings: Record<string, string>
  overridden: string[]
  editable_keys: string[]
}

export interface FanbaseBlock {
  id: string
  name: string
  source_kind: string
  fetch_url: string | null
  consent_attested_by: string | null
  enabled: boolean
  created_at: string
  members: number | null
  last_status: string | null
  last_finished_at: string | null
  last_imported_pending: number | null
}

export type TenantPortfolioSection = 'overview' | 'amplification' | 'fanbases' | 'settings'

export type TenantPortfolioReadModel = {
  id: string
  overview: PortfolioOverview | null
  amplification: { consents: PortfolioConsent[] } | null
  fanbases: { fanbases: FanbaseBlock[] } | null
  settings: PortfolioSettingsReadModel | null
  // Sections the tenant channel could not serve. They render as locally
  // degraded instead of failing the whole subpage.
  degraded: TenantPortfolioSection[]
}


// Agent scorecard — is it running, what did it do, did it work.
export type AgentScorecard = {
  status: {
    agent_enabled: boolean
    dry_run: boolean
    posture: string | null
    live_capabilities: string[]
    parked_capabilities: string[]
    last_decision_at: string | null
    last_action_at: string | null
  }
  week: {
    executed: number
    succeeded: number
    failed: number
    parked: number
    awaiting_approval: number
    success_rate_basis_points: number | null
  }
  track_record: {
    improved: number
    neutral: number
    worsened: number
    unmeasured: number
    measurement_coverage_basis_points: number | null
  }
  by_context: Array<{
    context: string
    executed: number
    succeeded: number
    failed: number
    parked: number
  }>
  recent_results: Array<{
    context: string
    action_kind: string
    subject_kind: string
    subject_id: string
    status: string
    outcome: string | null
    metric_key: string | null
    delta_basis_points: number | null
    completed_at: string
    executor_id: string | null
  }>
}

export type ReplyTriageView = {
  needs_human: ReplyTriageEntry[]
  recent_auto: ReplyTriageEntry[]
  summary: {
    needs_human_count: number
    auto_positive_count: number
    auto_declined_count: number
    auto_do_not_contact_count: number
    pending_count: number
  }
}

export type ReplyTriageEntry = {
  id: string
  target_id: string
  target_kind: string
  reply_text: string
  previous_disposition: string | null
  classification_result: string
  classified_disposition: string | null
  human_review_reason: string | null
  confidence_basis_points: number
  matched_rules: string[]
  classified_at: string
}

// --- Agent service types (proxied through control-plane) ---

export interface AgentProvider {
  id: string
  name: string
  description: string
  authMethod: 'api_key' | 'oauth' | 'none'
  freeTier: boolean
  modelCount: number
  oauthScopes: string[]
  oauthAvailable: boolean
  oauth?: {
    kind: 'redirect' | 'device'
    experimental: boolean
    tokenFlavor: 'access' | 'refresh' | 'id'
  }
}

export interface AgentCredential {
  id: string
  provider: string
  label: string
  credential_type: 'api_key' | 'oauth_refresh_token'
  status: 'active' | 'revoked' | 'invalid'
  credential_flavor: 'api_key' | 'access' | 'refresh' | 'id' | null
  provider_account: string | null
  expires_at: string | null
  last_validated_at: string | null
  last_validation_error: string | null
  created_at: string
}

export interface AgentModel {
  id: string
  name: string
  contextWindow: number
  bestFor: string
  paid: boolean
  providerId: string
  providerName: string
}

export interface AgentTask {
  id: string
  template_id: string
  model_id: string
  prompt: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  error: string | null
  created_at: string
  completed_at: string | null
  metadata?: {
    structured?: boolean
    outcome_count?: number
  }
}

export interface AgentTaskResult {
  id: string
  task_id: string
  content: string
  format: string
  model_used: string
  tokens_in: number | null
  tokens_out: number | null
  duration_ms: number | null
  outcomes?: AgentOutcome[]
}

export interface AgentOutcome {
  kind: string
  confidence_basis_points: number
  rationale: string
  item: unknown | null
}

export interface AgentSchedule {
  id: string
  template_id: string
  model_id: string
  prompt: string
  interval_minutes: number
  enabled: boolean
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
}

export interface AgentTemplate {
  id: string
  name: string
  description: string
  category: 'content' | 'research' | 'analysis'
  recommendedModels: string[]
  dataScope: string[]
  outputKind?: string
  suggestedIntervalMinutes?: number
}

export interface TaskSuggestion {
  id: string
  template_id: string
  model_id: string
  title: string
  description: string
  prefill_prompt: string
  priority: 'high' | 'medium' | 'low'
  reason: string
}

// --- Fanbase connection types ---

export interface FanbaseConnection {
  id: string
  platform: string
  external_account_ref: string
  label: string
  status: 'connected' | 'expired' | 'disconnected'
  last_sync_at: string | null
  created_at: string
}

export type FanbasePlatform = 'meta' | 'tiktok' | 'google_ads' | 'reddit' | 'bandsintown' | 'spotify'
