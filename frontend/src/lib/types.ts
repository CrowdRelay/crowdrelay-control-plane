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
  needs_you: PendingAutopilotAction[]
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

/// A queued autopilot action awaiting human approval (from `needs_you`).
export type PendingAutopilotAction = {
  id: string
  context: string
  action_kind: string
  subject_kind: string
  subject_id: string
  payload: AutopilotActionPayload
  created_at: string
  approval_expires_at: string | null
  assignee: { member_id: string; member_key: string; display_name: string } | null
  assignment_due_at: string | null
  required_capability: string | null
  executor_ready: boolean
}

/// Tagged union of autopilot action payloads. The `kind` field discriminates.
/// Only the variants the control panel renders are typed; the rest pass through
/// as the generic catch-all.
export type AutopilotActionPayload = {
  kind: string
  [key: string]: unknown
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
  authMethod: 'api_key' | 'none'
  freeTier: boolean
  tier: 'premium' | 'free'
  modelCount: number
  supportsApiKeyPaste: boolean
}

export interface AgentCredential {
  id: string
  provider: string
  label: string
  credential_type: 'api_key'
  status: 'active' | 'revoked' | 'invalid'
  provider_account: string | null
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

/// A intelligence-dispatched worker workflow (from the agent service).
export interface AgentWorkflow {
  id: string
  workspace_id: string
  brain_template: string
  brain_model: string | null
  status: 'planning' | 'dispatching' | 'running' | 'completed' | 'failed'
  plan: AgentWorkflowPlanItem[] | null
  parent_task_id: string | null
  created_at: string
  completed_at: string | null
}

export interface AgentWorkflowPlanItem {
  template: string
  prompt: string
  priority: number
  rationale: string
}

export interface AgentWorkflowTask {
  workflow_id: string
  task_id: string
  slot: number
  role: 'brain' | 'muscle'
  task_status: string
  task_template_id: string
  task_error: string | null
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

// --- AI Chatbot types ---

export interface ChatAction {
  type: 'navigate' | 'create_schedule' | 'run_task' | 'toggle_autopilot' | 'paste_api_key' | 'create_notifier' | 'create_fanbase' | 'enable_area' | 'deploy_tenant' | 'retry_dead_deliveries' | 'run_reconciliation'
  label: string
  params: Record<string, unknown>
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  actions?: ChatAction[]
}

// --- Audience Intelligence types ---
// These mirror the CrowdRelay response structs exactly. See:
//   crates/crowdrelay-api/src/audience/models.rs
//   crates/crowdrelay-application/src/autopilot/control.rs

export type AudienceOverview = {
  active_fans: number
  marketing_consented_fans: number
  ticket_buyers: number
  attendees: number
  synesthesia_participants: number
  qualified_referrals: number
  paid_ticket_orders: number
  [key: string]: unknown
}

export type FanCard = {
  id: string
  email: string
  display_name: string | null
  locale: string | null
  status: string
  created_at: string
  updated_at: string
  qualified_referrals: number
  event_interests: number
  attended_events: number
  paid_ticket_orders: number
  synesthesia_entries: number
  consented: boolean
  last_activity_at: string | null
  activation_state: string
  [key: string]: unknown
}

export type FanJourneyEntry = {
  kind: string
  occurred_at: string
  title: string
  detail: unknown
  [key: string]: unknown
}

export type AcquisitionTouch = {
  source: string
  campaign_name: string | null
  occurred_at: string
  [key: string]: unknown
}

export type EventInterestTouch = {
  event_slug: string
  event_title: string
  created_at: string
  [key: string]: unknown
}

export type AttendanceTouch = {
  event_slug: string
  event_title: string
  status: string
  redeemed_at: string | null
  [key: string]: unknown
}

export type TicketPurchase = {
  order_reference: string
  event_slug: string
  event_title: string
  status: string
  currency: string
  amount_gross_minor: number
  amount_refunded_minor: number
  paid_at: string | null
  [key: string]: unknown
}

export type RewardTouch = {
  reward_name: string
  reward_type: string
  status: string
  created_at: string
  [key: string]: unknown
}

export type SynesthesiaTouch = {
  campaign_slug: string
  entered_at: string
  completed_at: string | null
  client_total_elapsed_ms: number | null
  [key: string]: unknown
}

export type FanDetail = {
  fan: FanCard
  acquisitions: AcquisitionTouch[]
  event_interests: EventInterestTouch[]
  attendance: AttendanceTouch[]
  ticket_purchases: TicketPurchase[]
  rewards: RewardTouch[]
  synesthesia: SynesthesiaTouch[]
  tags: string[]
  [key: string]: unknown
}

export type AudienceSegment = {
  id: string
  slug: string
  name: string
  description: string | null
  filter: unknown
  active: boolean
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export type SegmentPreview = {
  segment: AudienceSegment
  total: number
  sample: FanCard[]
  [key: string]: unknown
}

export type AudienceReadModel = {
  id: string
  overview: AudienceOverview | null
  fans: FanCard[] | null
  segments: AudienceSegment[] | null
  degraded: string[]
}

// --- Growth Metrics types ---

export type FeedState = 'missing' | 'stale' | 'live'

export type FeedCoverage = {
  platform: string
  series: number
  live_series: number
  state: FeedState
  [key: string]: unknown
}

export type GrowthMetricCoverageResponse = {
  platforms: FeedCoverage[]
  [key: string]: unknown
}

export type GrowthMetricTrendView = {
  series_id: string
  platform: string
  metric_key: string
  display_name: string
  subject_kind: string | null
  subject_id: string | null
  direction: 'higher_is_better' | 'lower_is_better'
  value_tier: 'vanity' | 'intermediate' | 'downstream'
  expected_interval_hours: number
  latest_value: number
  latest_at: string
  delta_24h: number | null
  delta_7d: number | null
  delta_28d: number | null
  velocity_milli_per_day: number | null
  baseline_milli_per_day: number | null
  velocity_ratio_basis_points: number | null
  points_in_window: number
  age_seconds: number
  stale: boolean
  [key: string]: unknown
}

export type GrowthMetricTrendsResponse = {
  series: GrowthMetricTrendView[]
  [key: string]: unknown
}

export type ObjectiveState =
  | { state: 'met'; progress_basis_points: number }
  | { state: 'on_track'; progress_basis_points: number; projected_value: number }
  | { state: 'behind'; progress_basis_points: number; projected_value: number; shortfall: number }
  | { state: 'missed'; progress_basis_points: number; shortfall: number }
  | { state: 'unmeasurable'; reason: string }

export type GrowthObjectiveView = {
  objective_id: string
  platform: string
  metric_key: string
  scope_kind: string
  scope_id: string | null
  baseline_value: number
  target_value: number
  declared_at: string
  deadline: string
  declared_by: string
  observed_value: number | null
  state: ObjectiveState
  [key: string]: unknown
}

export type GrowthObjectivesResponse = {
  objectives: GrowthObjectiveView[]
  [key: string]: unknown
}

export type AutopilotControlMutation = {
  operation_id: string
  target_id: string
  status: string
  replayed: boolean
  [key: string]: unknown
}

export type GrowthPostureView = {
  posture: 'grounded' | 'working' | 'full_send' | null
  expected_version: number
  set_at: string | null
  [key: string]: unknown
}

export type ChannelAttribution =
  | { evidence: 'attributed'; source: string; community: string | null; creative: string | null }
  | { evidence: 'unattributed'; reason: string }

export type ChannelPerformance = {
  attribution: ChannelAttribution
  signups: number
  activated_30d: number
  activation_basis_points: number | null
  best_action: string | null
  [key: string]: unknown
}

export type AcquisitionChannels = {
  channels: ChannelPerformance[]
  total_signups: number
  total_activated_30d: number
  active_30d: number
  reachable_consented: number
  retained_30d: number
  unattributed: Array<{
    reason: string
    remedy: string
    signups: number
    activated_30d: number
  }>
  [key: string]: unknown
}

export type ShowCostLedgerEntry = {
  event_id: string
  event_title: string
  starts_at: string
  predicted_at: string
  offered_fee_minor: number
  predicted_total_cost_minor: number | null
  predicted_net_margin_minor: number | null
  prediction_missing_input: string | null
  settled_at: string | null
  settled_by: string | null
  settled_total_cost_minor: number | null
  settled_net_margin_minor: number | null
  fee_received_minor: number | null
  accuracy: string | null
  accuracy_reason: string | null
  total_variance_basis_points: number | null
  worst_line: string | null
  worst_line_delta_minor: number | null
  worst_line_remedy: string | null
  [key: string]: unknown
}

export type ShowEconomicsResponse = {
  shows: ShowCostLedgerEntry[]
  [key: string]: unknown
}

export type VehicleProfile = {
  seats: number
  cargo_litres: number
  fuel_centilitres_per_100km: number
  [key: string]: unknown
}

export type TourEconomicsPolicy = {
  transport_minor_per_100km_round_trip: number
  transport_rate_covers_vehicles: number
  vehicle: VehicleProfile
  max_vehicles: number
  crew_size: number
  backline_litres: number
  fuel_price_minor_per_litre: number
  toll_minor_per_km: number
  accommodation_minor_per_room_night: number
  crew_per_room: number
  per_diem_minor_per_person_day: number
  fixed_overhead_minor: number
  overnight_threshold_km: number
  minimum_margin_minor: number
  [key: string]: unknown
}

export type TourEconomicsSummary = {
  policy: TourEconomicsPolicy
  version: number
  [key: string]: unknown
}

export type ChiefOfStaffAttentionItem = {
  kind: string
  subject_kind: string
  subject_id: string
  title: string
  detail: string
  due_at: string
  urgency: string
  [key: string]: unknown
}

export type ChiefOfStaffOpportunity = {
  context: string
  decision_kind: string
  subject_kind: string
  subject_id: string
  confidence: number
  reason: string
  needs_approval: boolean
  [key: string]: unknown
}

export type ChiefOfStaffShowTask = {
  event_id: string
  event_title: string
  task_key: string
  status: string
  starts_at: string
  [key: string]: unknown
}

export type ChiefOfStaffActivity = {
  action_kind: string
  action_class: string
  count: number
  [key: string]: unknown
}

export type ChiefOfStaffStopped = {
  kind: string
  reason: string
  count: number
  detail: string
  [key: string]: unknown
}

export type ChiefOfStaffMovement = {
  subject: string
  claim: string
  assessment: string
  delta_basis_points: number | null
  [key: string]: unknown
}

export type ChiefOfStaffObjective = {
  platform: string
  metric_key: string
  scope_kind: string
  state: string
  progress_basis_points: number
  shortfall: number
  deadline: string
  [key: string]: unknown
}

export type AutopilotChiefOfStaff = {
  executed_24h: number
  failed_24h: number
  needs_you: number
  estimated_minutes_saved_24h: number
  measured_improved_7d: number
  measured_neutral_7d: number
  measured_worsened_7d: number
  emitted_24h: number
  executor_confirmed_24h: number
  executor_failed_24h: number
  attention_items: ChiefOfStaffAttentionItem[]
  top_opportunities: ChiefOfStaffOpportunity[]
  show_tasks: ChiefOfStaffShowTask[]
  acted_alone_24h: ChiefOfStaffActivity[]
  about_to_act: ChiefOfStaffActivity[]
  parked_for_approval: ChiefOfStaffActivity[]
  stopped: ChiefOfStaffStopped[]
  moved: ChiefOfStaffMovement[]
  objectives_at_risk: ChiefOfStaffObjective[]
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Phase 2: Outreach pipeline — outreach candidates, booking candidates,
// beacon signal network, press, release campaigns, play ledger.
// ---------------------------------------------------------------------------

// Outreach candidates — bare array, snake_case (no serde rename_all).
export type OutreachCandidateView = {
  id: string
  target_kind: string
  display_name: string
  source: string
  source_reference: string
  route_kind: string
  evidence: string | null
  status: string
  refusal_reason: string | null
  pitch_class: string | null
  fit_basis_points: number
  follower_count: number | null
}

export type OutreachCandidatePromotion = {
  operation_id: string
  candidate_id: string
  target_id: string | null
  replayed: boolean
}

// Booking candidates — bare array, snake_case (no serde rename_all).
export type BookingCandidateView = {
  candidate_id: string
  target_kind: string
  display_name: string
  city_slug: string | null
  route_kind: string
  route_value: string
  source: string
  fit_basis_points: number
  status: string
  refusal_reason: string | null
  booking_target_id: string | null
}

// Beacon signal dashboard — object, camelCase (serde rename_all).
export type BeaconDashboardResponse = {
  total: number
  active: number
  invited: number
  paused: number
  revoked: number
  profiles: BeaconProfileView[]
}

export type BeaconProfileView = {
  beaconId: string
  displayName: string
  beaconKind: string
  contactEmail: string | null
  city: string | null
  status: string
  radiusKm: number
  locale: string
  nearbyGigsEnabled: boolean
  inviteCount: number
  lastInvitedAt: string | null
  joinedAt: string | null
  lastSeenAt: string | null
  activeSessions: number
  activePushEndpoints: number
  openPressRequests: number
  activeEngagements: number
  coverageCount: number
}

// Beacon candidates — object { candidates: [...] }, camelCase.
export type BeaconCandidatesResponse = {
  candidates: BeaconCandidateView[]
}

export type BeaconCandidateView = {
  beaconId: string
  displayName: string
  beaconKind: string
  contactEmail: string
  city: string | null
  relevanceBasisPoints: number
  relationshipScore: number
  signalStatus: string | null
  inviteCount: number
  lastInvitedAt: string | null
}

// Press requests — object { requests: [...] }, camelCase.
export type BeaconPressRequestsResponse = {
  requests: BeaconPressRequestView[]
}

export type BeaconPressRequestView = {
  id: string
  beaconId: string
  displayName: string
  beaconKind: string
  eventId: string | null
  eventTitle: string | null
  requestKind: string
  details: string | null
  status: string
  resolutionNote: string | null
  createdAt: string
  resolvedAt: string | null
}

// Press assets — object { assets: [...] }, camelCase.
export type BeaconPressAssetsResponse = {
  assets: BeaconPressAssetView[]
}

export type BeaconPressAssetView = {
  id: string
  eventId: string | null
  eventTitle: string | null
  assetKey: string
  assetKind: string
  labelPl: string
  labelEn: string
  url: string
  sortOrder: number
  active: boolean
  updatedAt: string
}

// Beacon engagements — object { engagements: [...] }, camelCase.
export type BeaconEngagementsResponse = {
  engagements: BeaconEngagementView[]
}

export type BeaconEngagementView = {
  beaconId: string
  displayName: string
  beaconKind: string
  eventId: string
  eventTitle: string
  eventSlug: string
  status: string
  helpKind: string | null
  helpDetails: string | null
  notificationCount: number
  coverageCount: number
  lastNotifiedAt: string | null
  updatedAt: string
}

// Beacon coverage — object { coverage: [...] }, camelCase.
export type BeaconCoverageResponse = {
  coverage: BeaconCoverageView[]
}

export type BeaconCoverageView = {
  id: string
  beaconId: string
  displayName: string
  eventId: string
  eventTitle: string
  coverageKind: string
  url: string
  title: string | null
  createdAt: string
}

// Beacon network — object, camelCase.
export type BeaconNetworkResponse = {
  discoveryRuns: DiscoveryRunView[]
  pendingCandidates: DiscoveredBeaconView[]
  approvedCandidates: DiscoveredBeaconView[]
  inviteJobs: InviteJobView[]
}

export type DiscoveryRunView = {
  id: string
  countryCode: string
  targetCount: number
  status: string
  discoveredCount: number
  reportFilename: string | null
  reportSha256: string | null
  requestedAt: string
  completedAt: string | null
  failureKind: string | null
}

export type DiscoveredBeaconView = {
  id: string
  displayName: string
  beaconKind: string
  contactEmail: string | null
  destinationUrl: string | null
  sourceUrl: string | null
  verified: boolean
  acceptsOutreach: boolean
  doNotContact: boolean
  metadata: unknown
}

export type InviteJobView = {
  id: string
  status: string
  beaconCount: number
  ttlDays: number
  radiusKm: number
  locale: string
  claimedBy: string | null
  claimedAt: string | null
  claimExpiresAt: string | null
  reportedAt: string | null
  providerSummary: unknown
  exchangedCount: number
  webCount: number
  androidCount: number
  iosCount: number
  activeCount: number
  pushEnabledCount: number
  helpingCount: number
  coverageCount: number
  createdAt: string
}

// Release campaigns — object. The wrapper has camelCase, but PoolSummary
// and ReleaseCampaignView have NO serde rename (snake_case in JSON).
// AdminReleaseRecipientView IS camelCase.
export type AdminReleaseCampaignsResponse = {
  pool: PoolSummary
  campaigns: ReleaseCampaignView[]
  recipients: AdminReleaseRecipientView[]
  recipientsTruncated: boolean
}

export type PoolSummary = {
  active_release_latarnicy: number
  contactable_latarnicy: number
  missing_email: number
}

export type ReleaseCampaignView = {
  id: string
  slug: string
  title: string
  sku: string
  product_name: string
  variant_label: string
  status: string
  phase: string
  claim_deadline: string
  eligible_count: number
  reserved_quantity: number
  reservation_id: string | null
  launched_at: string | null
  closed_at: string | null
  cancelled_at: string | null
  created_at: string
  notified_count: number
  confirmed_count: number
  prepared_count: number
  sent_count: number
  delivered_count: number
  declined_count: number
  expired_count: number
}

export type AdminReleaseRecipientView = {
  campaignId: string
  beaconId: string
  displayName: string
  beaconKind: string
  city: string | null
  status: string
  recipientName: string | null
  recipientPhone: string | null
  parcelLockerCode: string | null
  confirmedAt: string | null
  preparedAt: string | null
  sentAt: string | null
  deliveredAt: string | null
  activationDueAt: string | null
  activationQueuedAt: string | null
  activationSuppressedAt: string | null
}

export type AdminReleaseRecipientsResponse = {
  campaignId: string
  recipients: AdminReleaseRecipientView[]
}

// Play ledger — object, snake_case (no serde rename_all).
export type PlayLedger = {
  plays: PlayLedgerEntry[]
  standings: PlayKindStanding[]
}

export type PlayLedgerEntry = {
  play_id: string
  kind: string
  anchor: PlayAnchorRef
  anchor_at: string
  hypothesis: string
  state: string
  started_at: string
  completed_at: string | null
  steps_total: number
  steps_settled: number
  steps_skipped: number
  recipients_reached: number
  claims: PlayClaimView[]
}

export type PlayAnchorRef = {
  kind: string
  event_id?: string
  fan_id?: string
  release_plan_id?: string
}

export type PlayClaimView = {
  claim: string
  claim_means: string
  success_metric_platform: string
  success_metric_key: string
  window_start: string
  window_end: string
  status: string
  evidence: string | null
  evidence_reason: string | null
  effect: string | null
  delta_basis_points: number | null
  baseline_milli_per_day: number | null
  observed_milli_per_day: number | null
  recipients_reached: number | null
}

export type PlayKindStanding = {
  kind: string
  record: PlayRecord
  standing: PlayStanding
  effective_max_recipients_per_step: number
}

export type PlayRecord = {
  improved: number
  neutral: number
  worsened: number
  insufficient: number
  consecutive_worsened: number
  operator_retired: boolean
}

export type PlayStanding =
  | { standing: 'untested'; measured: number }
  | { standing: 'weighted'; basis_points: number; measured: number }
  | { standing: 'retired'; reason: string }

// --- Growth Funnel types ---

export type FunnelWorkerRunStats = {
  total: number
  completed: number
  failed: number
  running: number
  queued: number
}

export type FunnelRecentWorkerRun = {
  id: string
  template_id: string
  status: string
  created_at: string
  completed_at: string | null
  has_outcome: boolean
  outcome_kind: string | null
  tokens_in: number
  tokens_out: number
}

export type GrowthFunnelData = {
  days: number
  since: string
  communities_discovered: number
  worker_runs: Record<string, FunnelWorkerRunStats>
  brain_workflows: {
    total: number
    by_status: Record<string, number>
  }
  recent_worker_runs: FunnelRecentWorkerRun[]
}

// --- Intelligence Transparency types ---

export type IntelligencePlanItem = {
  template: string
  prompt: string
  priority: number
  rationale: string
}

export type IntelligenceDecisionTask = {
  task_id: string
  slot: number
  role: 'brain' | 'muscle'
  status: string
  template_id: string
  error: string | null
  created_at: string | null
  completed_at: string | null
  has_outcome: boolean
  outcome_kind: string | null
  tokens_in: number
  tokens_out: number
}

export type IntelligenceDecision = {
  id: string
  brain_template: string
  brain_model: string | null
  status: 'planning' | 'dispatching' | 'running' | 'completed' | 'failed'
  created_at: string
  completed_at: string | null
  plan: IntelligencePlanItem[]
  tasks: IntelligenceDecisionTask[]
}

export type IntelligenceDecisionSummary = {
  total_decisions: number
  completed_decisions: number
  failed_decisions: number
  running_decisions: number
  total_tasks: number
  completed_tasks: number
}

export type IntelligenceDecisionsData = {
  days: number
  since: string
  decisions: IntelligenceDecision[]
  summary: IntelligenceDecisionSummary
}

// --- AI Usage Analytics types ---

export type UsageBudget = {
  monthly_spend_micro_usd: number
  budget_micro_usd: number
  remaining_micro_usd: number
  days_in_month: number
  day_of_month: number
}

export type TemplateRoi = {
  template_id: string
  total_tasks: number
  completed_tasks: number
  failed_tasks: number
  total_cost_micro_usd: number
  outcome_count: number
  cost_per_outcome_micro_usd: number | null
  tokens_in: number
  tokens_out: number
  success_rate: number | null
}

export type ModelAnalytics = {
  model_id: string
  model_provider: string | null
  total_tasks: number
  completed_tasks: number
  failed_tasks: number
  total_cost_micro_usd: number
  avg_cost_per_task_micro_usd: number
  avg_latency_ms: number
  avg_tokens_in: number
  avg_tokens_out: number
  success_rate: number | null
}

export type DailySpend = {
  day: string
  paid_cost_micro_usd: number
  free_cost_micro_usd: number
  requests: number
}

export type AvailableModel = {
  id: string
  provider: string
  name: string
  paid: boolean
  connected: boolean
}

export type UsageAnalyticsData = {
  budget: UsageBudget
  template_roi: TemplateRoi[]
  model_analytics: ModelAnalytics[]
  daily_spend: DailySpend[]
  connected_providers: string[]
  available_models: AvailableModel[]
}
