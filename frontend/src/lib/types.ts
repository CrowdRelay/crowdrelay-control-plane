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
  status: 'provisioning' | 'active' | 'suspended' | 'parked'
  workspaceId: string | null
  crowdrelayBaseUrl: string | null
  signalBaseUrl: string | null
  defaultCountryCode: string
  regionalProfile: RegionalProfile | null
  brandingPalette: Palette | null
  synesthesiaEnabled: boolean
  areaEnabled: boolean
  signalEnabled: boolean
  signalPlayStoreUrl: string | null
  synesthesiaPlayStoreUrl: string | null
  northStarMetric: string
  fanbaseSources: string[]
  canSuspend: boolean
  canProvision: boolean
  canRemove: boolean
  archetype: 'band' | 'roster' | 'label' | 'festival_org'
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

// The semantic phase of an external operation. Distinguishes "we asked"
// (accepted) from "it happened" (completed). The existing domain-specific
// `status` field stays for backward compat; `phase` is the universal
// semantic layer the UI reads to avoid mistaking a trigger for a result.
export type OperationPhase = 'accepted' | 'running' | 'completed' | 'failed' | 'unknown'

export type ProvisioningJob = {
  id: string
  tenantId: string
  status: 'planned' | 'approved' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  // Semantic phase: accepted (planned/approved), running, completed (succeeded),
  // failed (failed/cancelled). The UI reads this to distinguish "we asked"
  // from "it happened".
  phase: OperationPhase
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
  /// Liveness of the process running the brain, the outbox and metric sync.
  /// Optional because a tenant on an older CrowdRelay will not report it.
  worker?: { lease_age_seconds: number; alive: boolean }
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

/// A piece of content the brain actually put somewhere — a social post,
/// community post, telegram message or Signal push — with where it landed
/// and the engagement it earned. From `/operations/delivery-results`.
export type DeliveryResult = {
  kind: string
  id: string
  action_id: string | null
  channel: string
  content: Record<string, unknown>
  status: string
  url: string | null
  created_at: string
  posted_at: string | null
  score: number | null
  upvotes: number | null
  num_comments: number | null
  upvote_ratio: number | null
  error_message: string | null
}

/// One address the connected sources (Google Drive spreadsheets, Gmail
/// headers) surfaced into the shared review queue. Every address lands
/// staged — nothing is a fan or a beacon until the operator promotes it,
/// and the two outcomes are independent because a beacon may also be a fan.
export type DriveContactOutcome = 'staged' | 'promoted' | 'dismissed'

export type DriveContact = {
  id: string
  email: string
  display_name: string | null
  organization: string | null
  suggested_kind: string | null
  /** The city the sheet placed this contact in — free text; the booking
      promote resolves it against the cities catalogue. */
  city: string | null
  notes: string | null
  source_file_name: string
  /** Where this address was sighted — 'gdrive', 'gmail', or both. */
  sources: string[]
  last_seen_at: string
  /** The file stopped carrying this address — kept, not deleted. */
  gone_from_source: boolean
  fan_outcome: DriveContactOutcome
  beacon_outcome: DriveContactOutcome
}

export type DriveContactsResponse = {
  contacts: DriveContact[]
}

export type DeliveryAttempt = {
  attempt_number: number
  started_at: string
  finished_at: string
  outcome: string
  response_status: number | null
  error_kind: string | null
  duration_ms: number
  /// What the receiver replied when it refused. Absent on older attempts,
  /// which were recorded before the worker kept the body.
  response_excerpt?: string | null
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
    archive_imported: number
    archive_confirmed: number
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
  /// The payload fields an operator may edit on approve, with their current
  /// text — CrowdRelay computes the map; absent when nothing is revisable.
  revisable?: Record<string, string>
}

/// One week of the §4d-3.2 voice signal.
export type RevisionTrendWeek = {
  week_start: string
  revised_fields: number
  avg_distance_chars: number
}

/// How far the band's approve-time edits moved the machine's words.
/// Distance should fall as voice-matching improves.
export type RevisionTrend = {
  revised_fields_30d: number
  revised_actions_30d: number
  avg_distance_chars_30d: number
  weekly: RevisionTrendWeek[]
}

/// The content page's own read model — its approval-queue slice plus the
/// material count and the titles those drafts cite, without the cockpit-wide
/// overview fan-out. Served by `/operations/content-pipeline`.
export type ContentPipeline = {
  runtime_enabled: boolean
  live_sources: number
  pending: PendingAutopilotAction[]
  /// content_source_id → title for every source a pending payload cites.
  source_titles: Record<string, string>
  /// The voice-learning signal — null until the first revised approval.
  revision_trend?: RevisionTrend | null
}

/// Lightweight summary of a pending autopilot action — just the fields the
/// AttentionInbox needs to render an approval item. NOT the full
/// PendingAutopilotAction (which includes payload, briefing, assignee,
/// executor readiness). Used in the attention snapshot.
export type PendingActionSummary = {
  id: string
  context: string
  action_kind: string
  subject_kind: string
  approval_expires_at: string | null
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

// A human-readable briefing for a pending autopilot action, generated from
// the action payload by the backend. Provides what to do, why it matters,
// concrete steps, and the content being approved.
export type BriefingStep = { what_to_do: string; why_it_matters: string }
export type BriefingField = { label: string; value: string }
export type ActionBriefing = {
  summary: string
  why_it_matters: string
  steps: BriefingStep[]
  content: BriefingField[]
  deadline_note: string
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
  briefing: ActionBriefing | null
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
    /** Server-decided lifecycle policy. The browser renders these, it does
     *  not re-derive them from the tenant slug. */
    capabilities: {
      canSuspend: boolean
      canProvision: boolean
      canRemove: boolean
      canOptOut: boolean
      canPark: boolean
      canUnpark: boolean
      canRedeploy: boolean
    }
  }
}

export type TenantOperationsSection = 'summary' | 'flags' | 'autopilot' | 'growth' | 'opportunities' | 'signal' | 'audience' | 'growth_metrics' | 'acquisition_sources'

// Why a read-model section is missing. The Control Plane classifies each
// failure at the tunnel instead of collapsing them all into "degraded", so a
// panel can say whether to retry, look at the tenant, or stop trusting the
// numbers entirely. Mirrors `SectionState` in `read_models.rs`.
export type SectionState =
  | 'ok'
  | 'timeout'
  | 'unreachable'
  | 'upstream_error'
  | 'unauthorized'
  | 'absent'
  | 'rejected'
  | 'contract_mismatch'

export type SectionVerdict = {
  state: SectionState
  // Server-authored next step. Null only when the section is 'ok'.
  remediation: string | null
}

export type SectionVerdicts = Record<string, SectionVerdict | undefined>

// Per-section fact freshness. `observedAt` is propagated from upstream
// timestamps where present, or set to the fetch time when no upstream
// timestamp is available (the section was just fetched, so it is live).
// `classification` is:
//   live     — upstream timestamp within stale threshold, or no upstream
//              timestamp but the section was successfully fetched just now
//   stale    — upstream timestamp older than stale threshold
//   unknown  — the section failed to fetch; no freshness claim is possible
//   assembled — the section came from the Control Plane database, not a
//               live fan-out; fetchedAt is the honest freshness signal
export type FreshnessClassification = 'live' | 'stale' | 'unknown' | 'assembled'

export type SectionFreshness = {
  observedAt: string | null
  classification: FreshnessClassification
}

export type SectionFreshnessMap = Record<string, SectionFreshness | undefined>

export type TenantOperationsReadModel = {
  id: string
  summary: OperationsSummary | null
  flags: FeatureFlag[] | null
  autopilot: AutopilotOverview | null
  growth: GrowthOverview | null
  opportunities: OpportunityBoardEntry[] | null
  // North Star fan-growth sections. Each degrades independently — a dead
  // audience endpoint does not blank signal KPIs.
  signal: SignalOverview | null
  audience: AudienceOverview | null
  growth_metrics: GrowthMetricTrendsResponse | null
  acquisition_sources: AcquisitionSources | null
  // Sections the tenant channel could not serve. They render as locally
  // degraded instead of failing the whole subpage.
  degraded: TenantOperationsSection[]
  // Per-section verdict, including the ones that succeeded.
  sections: SectionVerdicts
  // Per-section fact freshness. observedAt is propagated from upstream
  // timestamps where present; classification is live/stale/unknown.
  freshness: SectionFreshnessMap
  // When the server assembled this fan-out. The only freshness claim it can
  // honestly make about a live upstream read.
  fetchedAt: string
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
  role: 'platform_admin' | 'platform_viewer' | 'tenant_operator'
  tenantSlug: string | null
  isMobile?: boolean
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

/// Platform-level notification config item (from environment variables).
/// Read-only — shows routing topology, not just "is something configured."
export interface PlatformConfigItem {
  source: 'environment' | 'database' | 'n8n'
  owner: 'platform' | 'tenant' | 'automation'
  type: string
  path: 'direct' | 'relay' | 'workflow'
  configured: boolean
  destination: string | null
  enabled: boolean
}

/// Automation routing config item (from database).
/// Read-only — shows n8n workflow routing with provenance labels.
export interface AutomationRoutingItem {
  source: 'environment' | 'database' | 'n8n'
  owner: 'platform' | 'tenant' | 'automation'
  type: string
  path: 'direct' | 'relay' | 'workflow'
  workflowId: string
  label: string
  category: string
  discordEnabled: boolean
  muted: boolean
  enabled: boolean
}

/// Community Intelligence — a tracked community surface with its latest observation.
export interface CommunityItem {
  placeId: string
  placeKind: string
  platform: string
  name: string
  url: string
  countryCode: string | null
  language: string | null
  genres: string[]
  memberCount: number | null
  /// Our relationship with the place, not whether we observe it.
  membershipState: 'not_joined' | 'joining' | 'joined' | 'rejected' | 'not_a_fit'
  membershipNote: string | null
  membershipChangedAt: string | null
  latestObservation: {
    id: string
    observedAt: string
    source: string
    quality: number
    rawActivityMetrics: unknown
  } | null
}

/// Community Intelligence — one observation in the time series.
export interface CommunityObservationItem {
  id: string
  placeId: string
  observedAt: string
  source: string
  sourceUrl: string
  collectorVersion: string
  rawActivityMetrics: unknown
  observationQuality: number
  createdAt: string
}

/// Community Intelligence — an extracted entity from an observation.
export interface CommunityEntityItem {
  id: string
  observationId: string
  entityType: string
  entityRef: string
  strength: number
  observedAt: string
}

/// Consolidated community detail — observations + entities in one
/// round-trip. Each section is either the upstream JSON or
/// `{ __error: string }` when that section's endpoint failed.
export interface CommunityDetail {
  observations: { items: CommunityObservationItem[] } | { __error: string }
  entities: { items: CommunityEntityItem[]; observationId: string } | { __error: string }
}
export const NOTIFIER_EVENTS = [
  'provisioning.failed',
  'runtime.degraded',
  'runtime.stale',
  'runtime.recovered',
] as const
export type NotifierEvent = (typeof NOTIFIER_EVENTS)[number]
// Human-readable labels for each event — the dotted internals read as
// accusations ("provisioning failed") rather than categories. Used in the
// notifier create-form checkboxes and the active-destination event list.
export const NOTIFIER_EVENT_LABELS: Record<NotifierEvent, string> = {
  'provisioning.failed': 'Provisioning failures',
  'runtime.degraded': 'Runtime degraded',
  'runtime.stale': 'Runtime stale',
  'runtime.recovered': 'Runtime recovered',
}

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
  // Members whose fan row is still active — the retained share, which is
  // the ROI a raw member count cannot show.
  active_members: number | null
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
  sections: SectionVerdicts
  freshness: SectionFreshnessMap
  fetchedAt: string
}


// The measurement ledger — the plan's fifteen claims, each stated with the
// number that answers it or the reason this build cannot produce one. Rates
// are stated only when the denominator clears `rate_floor`; `below_floor`
// shows the counts and the floor, and `unmeasured` carries the reason — no
// state ever fabricates a zero.
export type Measure =
  | { state: 'rate'; numerator: number; denominator: number; basis_points: number }
  | { state: 'below_floor'; numerator: number; denominator: number; floor: number }
  | { state: 'count'; value: number; unit: string }
  | { state: 'minutes'; median: number; n: number }
  | { state: 'days'; median: number; n: number }
  | { state: 'unmeasured'; reason: string }

export type MeasurementBreakdown = {
  label: string
  measure: Measure
}

export type MeasurementClaim = {
  key: string
  /// The plan's words for the claim.
  claim: string
  /// The plan's words for how it is measured.
  measured_as: string
  /// 0 means the claim is not windowed — the archive is a stock, not a flow.
  window_days: number
  measure: Measure
  /// Per-channel / per-show rows where the claim is judged per unit.
  breakdown: MeasurementBreakdown[]
}

export type MeasurementLedger = {
  observed_at: string
  window_days: number
  rate_floor: number
  claims: MeasurementClaim[]
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
    /// Actions whose outcome could not be established. Excluded from
    /// `executed`, so excluded from the rate below. Optional: an older tenant
    /// will not send it.
    unknown?: number
    /// Of the actions that reached a terminal state, how many are recorded as
    /// succeeded. Not "how often the agent works": the denominator omits
    /// `unknown`, and the numerator counts believed success — an externally
    /// executed action is marked succeeded at dispatch and corrected later if
    /// the provider contradicts it.
    success_rate_basis_points: number | null
  }
  track_record: {
    improved: number
    neutral: number
    worsened: number
    unmeasured: number
    /// Scheduled, horizon not elapsed. Optional: an older tenant will not send it.
    awaiting_measurement?: number
    next_measurement_due_at?: string | null
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
  learning: {
    metacognition: string | null
    learning_cycles: number
    improving_cycles_total: number
    evidence_partial: number
    evidence_resolved: number
    evidence_pending: number
    last_partial_resolution_at: string | null
    last_full_resolution_at: string | null
    measurements_by_horizon: Array<{
      kind: string
      pending: number
      succeeded: number
      failed: number
      next_due_at: string | null
    }>
  }
}

/** N.9 — one executor lane as the workspace stands right now.
 *  `live`: an unexpired executor advertises it and no breaker holds it open.
 *  `blocked`: advertised but held this minute — the advertisement or the
 *  executor expired, or the circuit breaker is holding it. `missing`: a
 *  parked action needs it and nobody advertises it. `awaiting` counts the
 *  queued actions parked behind the lane — the number a missing row costs. */
export type ExecutorCapabilityRow = {
  capability: string
  state: 'live' | 'blocked' | 'missing'
  /** The executors that advertise the lane — names matter when two run and
   *  only one is healthy. Empty on a `missing` row by construction. */
  executors: string[]
  awaiting: number
}

/** The dispatch gate's registry, laid out per lane (N.9). Rows arrive ordered
 *  by `awaiting` desc upstream — keep that order. `executors_registered` false
 *  means no executor has ever heartbeated: the dispatcher fails open on an
 *  empty registry, so the panel says that plainly rather than reading every
 *  lane as missing. */
export type TenantExecutorCapabilities = {
  executors_registered: boolean
  capabilities: ExecutorCapabilityRow[]
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
  /**
   * Whether the workspace can dispatch this model right now — its provider is
   * connected, or it's a free model whose provider has a platform env key.
   * Absent on older agent-service builds; treat undefined as unknown.
   */
  available?: boolean
}

export interface PremiumModel {
  id: string
  provider: string
  name: string
  best_for: string
  agentic: boolean
  price_input_per_mtok: number
  price_output_per_mtok: number
}

export interface PremiumTask {
  id: string
  template_id: string
  model_id: string
  model_provider: string | null
  tier: string
  cost_micro_usd: number
  status: string
  created_at: string
  completed_at: string | null
}

export interface PremiumUsage {
  connected_providers: string[]
  premium_models: PremiumModel[]
  monthly_spend_micro_usd: number
  budget_micro_usd: number
  tasks: PremiumTask[]
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

/// Consolidated Tasks-tab read model — one round-trip instead of five.
/// Each section is either the upstream JSON or `{ __error: string }` when
/// that section's agent-service endpoint failed.
export interface AgentTasksOverview {
  templates: { templates: AgentTemplate[] } | { __error: string }
  tasks: { tasks: AgentTask[] } | { __error: string }
  models: { models: AgentModel[]; connectedProviders: string[] } | { __error: string }
  suggestions: { suggestions: TaskSuggestion[] } | { __error: string }
  schedules: { schedules: AgentSchedule[] } | { __error: string }
}

/// Consolidated Providers-tab read model — one round-trip instead of three.
export interface AgentProvidersOverview {
  providers: { providers: AgentProvider[] } | { __error: string }
  credentials: { credentials: AgentCredential[] } | { __error: string }
  models: { models: AgentModel[]; connectedProviders: string[] } | { __error: string }
}

// --- Fanbase connection types ---

export interface FanbaseConnection {
  id: string
  platform: string
  external_account_ref: string
  label: string
  /// Whether credentials are present — not whether the channel works.
  ///
  /// Five production connections reported `connected` while failing every
  /// sync since they were created, so this and the sync fields answer
  /// different questions and both are needed.
  status: 'connected' | 'expired' | 'disconnected' | 'invalid'
  last_sync_at: string | null
  /// Why the most recent sync failed, verbatim from the provider. Null once a
  /// sync succeeds.
  last_sync_error: string | null
  last_sync_failed_at: string | null
  /// The tenant's chosen read boundary for scan-capable connections
  /// (gdrive, gmail). `null` means the question was never answered — the
  /// connector scans nothing, and the tile says so rather than pretending.
  scan_scope: ScanScope | null
  created_at: string
}

/// What a scan-capable connection may read. The vocabulary is per-platform —
/// a Drive folder means nothing to Gmail — and the union lists every shape so
/// the panel can render any of them without knowing which platform stored it.
export interface ScanScope {
  kind: 'whole_account' | 'folder' | 'shared_drive' | 'sent_only' | 'label' | 'since'
  folder_ids?: string[]
  drive_id?: string
  label?: string
  since?: string
}

/// Result of a connection creation with provider probe verification.
/// `verification` is a creation-time diagnostic only — it is NOT a durable
/// health state. `verified` describes the probe result at creation time.
export interface ConnectionCreationResult {
  platform: string
  status: 'connected' | 'invalid'
  verification: 'verified' | 'invalid' | 'unavailable'
  displayName?: string
  reason?: string
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
  sections: SectionVerdicts
  freshness: SectionFreshnessMap
  fetchedAt: string
}

export type PressOverviewSection = 'requests' | 'assets' | 'engagements' | 'coverage'

export type PressOverviewReadModel = {
  id: string
  requests: BeaconPressRequestsResponse | null
  assets: BeaconPressAssetsResponse | null
  engagements: BeaconEngagementsResponse | null
  coverage: BeaconCoverageResponse | null
  degraded: PressOverviewSection[]
  sections: SectionVerdicts
  freshness: SectionFreshnessMap
  fetchedAt: string
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

/** `audience/acquisition-sources` — first-touch attribution over
 * `fan_acquisition_events`, counted on fans still active. `tracked_fans`
 * below `active_fans` is the honest unknown: fans who predate the ledger
 * carry no source at all. */
export type AcquisitionSources = {
  active_fans: number
  tracked_fans: number
  sources: Array<{ source: string; fans: number; fans_30d: number }>
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
  | { state: 'missed'; progress_basis_points: number; final_value: number; shortfall: number }
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

/** One trusted fact the content loop may write about — mirrors
 *  `ContentSourceView` in crowdrelay-application. `metadata` carries the
 *  link for a video/release or the body for a story. */
export type ContentSourceKind = 'event' | 'release' | 'show_completed' | 'video' | 'story' | 'social_post'

export type ContentSourceView = {
  source_id: string
  source_kind: ContentSourceKind
  source_key: string
  title: string
  occurred_at: string
  expires_at: string
  metadata: Record<string, unknown>
  format_key: string | null
  version: number
  active: boolean
  /** What the machine produced from this source — artifact, status, and
      whether it actually emitted. The trail a tombstone must not hide. */
  sends: ContentSourceSend[]
}

export type ContentSourceSend = {
  action_id: string
  artifact: string
  status: string
  created_at: string
  emitted_at: string | null
}

export type ContentSourceUpsertInput = {
  source_id?: string
  source_kind: ContentSourceKind
  source_key: string
  title: string
  occurred_at: string
  expires_at: string
  metadata: Record<string, unknown>
  /** Omit on create (defaults to live) or to leave the flag alone on edit. */
  active?: boolean
  expected_version: number
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

/** One show on the tenant's list — `GET /tenants/{slug}/shows`. `upcoming`
 * marks the show still ahead of or inside the night it is played; the list
 * arrives ordered next-up-ascending then past-descending. */
export type TenantShow = {
  id: string
  slug: string
  title: string
  venue: string | null
  starts_at: string
  ends_at: string | null
  scan_count: number
  upcoming: boolean
}

export type TenantShowsResponse = {
  events: TenantShow[]
}

export type ShowTimelineState = 'done' | 'active' | 'due' | 'waiting' | 'skipped'

export type ShowTimelineAction = {
  kind: string
  label: string
}

export type ShowTimelineStep = {
  key: string
  label: string
  anchor: string
  state: ShowTimelineState
  owner: string | null
  action: ShowTimelineAction | null
  detail: Record<string, unknown>
}

/** One act on a bill — the shape `PUT …/acts` accepts. `position` is the
 * row's slot in running order; `ticket_url` feeds per-act click attribution. */
export type ShowActInput = {
  act_slug: string
  act_name: string
  position?: number
  ticket_url?: string | null
}

export type TenantShowTimelineResponse = {
  event: {
    id: string
    slug: string
    title: string
    venue: string | null
    venue_address: string | null
    status: string
    starts_at: string
    ends_at: string | null
    /** Who the T+7 report mails besides the band — the show setup card edits
     *  these directly; null means the report goes to the band only. */
    counterparty_name?: string | null
    counterparty_email?: string | null
    /** The shared night this event resolved to, when the venue registry
     *  linked it — the key the "Shared night" block calls back with (4V.6b). */
    place_event_id?: string | null
    /** What the night knows about the room — beacon-campaign records keyed
     *  to this event. Empty when there is no relationship on file. */
    venue_knowledge?: Array<{
      name: string
      kind: string
      status: string
      last_reply: string
      last_outreach_at: string | null
      notes: string | null
    }>
  }
  steps: ShowTimelineStep[]
}

// ── The shared night (4V.6b) ────────────────────────────────────────────
// One venue's night, every tenant's event pointing at it. The payload's
// shape is the caller's lens — upstream derives it from the workspace's
// relationship, never from a parameter, and a caller with no relationship
// gets a 404. Lens-only blocks are absent rather than null when they do
// not apply to the lens that answered.
export type NightLens = 'own_band' | 'co_billed' | 'organiser' | 'roster'

export type NightAct = {
  act_slug: string
  name: string
  position: number
  /** True only when the act's own workspace signed the bill row — a
   *  tenant's claim about somebody else's act stays unconfirmed. */
  confirmed: boolean
  /** Omitted entirely on lenses where "mine" means nothing. */
  mine?: boolean
}

export type NightAnnounce = { act: string | null; state: string }
export type NightAsk = { from_acts: string[]; items: string[] }
export type NightOrganiserLink = { token: string; expires_at: string }

export type SharedNight = {
  place_event_id: string
  lens: NightLens
  venue: { display_name: string; city_name: string }
  /** The room's night — the UTC date the rendezvous is keyed on. */
  event_date: string
  lineup: NightAct[]
  /** Roll-up of the night's events by status; a cancelled show stays on
   *  the calendar and reads as cancelled, not absent. */
  status: Record<string, number>
  // Band-side lenses (own_band, roster):
  own_event_slug?: string
  co_bill?: NightAct[]
  contributions?: { own: string[]; shared_by_others: number }
  /** This workspace's own terms contribution — null when it never made
   *  one. Other acts' terms are never present on any lens. */
  own_terms?: { amount_minor?: number; currency?: string } | null
  organiser_link?: NightOrganiserLink | null
  // CoBilled:
  public_announce?: NightAnnounce[]
  asks?: NightAsk[]
  // Organiser — sums only; per-act parts never leave the workspaces:
  combined_reachable?: number | null
  tickets_sold?: number
  capacity?: number | null
  payout_total_minor?: number | null
  announce?: NightAnnounce[]
  // Roster additions:
  roster_acts?: NightAct[]
  draw_split?: { ours: number; rest: number }
}

/** The four contribution kinds — the upstream schema's CHECK, mirrored so
 *  the editor can name them without a lookup. */
export type NightContributionKind = 'draw_estimate' | 'announce_status' | 'asks' | 'terms'

/** The door view — `/tenants/{slug}/shows/{event}/scan`. The check-in URL
 * carries the campaign's signed token in its fragment; it is null (a fact,
 * not an error) whenever the night has no live campaign to scan. */
export type TenantShowScanResponse = {
  checkin_url: string | null
  campaign_label: string | null
  /** The door's open edge — before this the QR is a dead scan, so the page
   * says "goes live at" instead of handing out a rejecting code. */
  valid_from: string | null
  valid_until: string | null
  /** The night's tally across all campaigns; `campaign_checkin_count` is
   * the live campaign's own slice — the value `max_checkins` caps. */
  checkin_count: number
  campaign_checkin_count: number | null
  max_checkins: number | null
}

/** The T+7 counterparty artifact — `/tenants/{slug}/shows/{event}/report`.
 * `issued` means the payload IS the mailed artifact; before that it is a
 * live preview composed from the same evidence. The inner shapes mirror
 * the emitted payload, so the page renders one model either way. */
export type TenantShowReportResponse = {
  issued: boolean
  issued_at: string | null
  /** outbox status when issued — "sent" is only honest once `delivered` */
  delivery_status: string | null
  event: {
    slug?: string
    title?: string
    city?: string | null
    venue?: string | null
    /** RFC3339 in the preview; the issued artifact carries `time`'s serde
     *  array [year, ordinal, h, m, s, ns, offH, offM, offS] verbatim. */
    starts_at?: string | number[]
    timezone?: string | null
    acts?: Array<{ slug: string; name: string }>
  }
  report: {
    kind?: string
    preview?: boolean
    observed?: {
      room_checkins_total?: number
      room_checkins_by_session?: number
      room_checkins_by_email_claim?: number
      new_fan_records_at_show?: number
      admission_passes_redeemed?: number
    }
    inferred?: {
      paid_ticket_buyers?: number
      interested_fans?: number
      ticket_link_clicks?: number
      ticket_link_clicks_by_act?: Array<{ act_slug: string | null; clicks: number }>
    }
    campaigns?: Array<{
      slug: string
      template_key: string
      status: string
      scheduled_at: string | null
      recipients: number | null
      delivered: number | null
      completed_at: string | null
    }>
    evidence_gaps?: string[]
  }
  recipients: {
    band?: Array<{ email: string; name: string }>
    counterparty?: { name: string | null; email: string } | null
  }
  honesty_contract: {
    observed?: string
    inferred?: string
    rules?: string[]
  }
}

/** §4h-11 — who could help with this show: the staging queue read against a
 * date rather than as an inventory. Every row is a candidate for a person to
 * look at — no row carries an email, and promotion, the contact governor and
 * the admission wall all still bind between this list and any outreach.
 * `degraded` names what the read could not answer: "city" when the event
 * carries none (every section then answers empty), and one key per section
 * whose query failed — an absent key means an empty array is a measured
 * answer, not a failure. */
export type TenantShowHelpersResponse = {
  event: {
    slug: string
    title: string
    starts_at: string
    city: string | null
    country_code: string | null
  }
  degraded: Array<'city' | 'press' | 'rooms_and_promoters' | 'communities' | 'cold_rooms'>
  notes: string[]
  press: Array<{
    id: string
    target_kind: 'press' | 'radio' | 'playlist' | 'media_patronage'
    display_name: string
    contact_domain: string | null
    why_fit: string
    verified: boolean
  }>
  rooms_and_promoters: Array<{
    id: string
    target_kind: 'venue' | 'promoter' | 'festival'
    display_name: string
    accepts_booking: boolean
    relationship_score: number
    /** Whether the target is joined to the shared venue registry. */
    venue_linked: boolean
  }>
  communities: Array<{
    id: string
    community_name: string
    platform: 'reddit' | 'forum' | 'discord' | 'webzine' | 'newsletter'
    url: string
    self_promo_policy: 'tolerant' | 'strict' | 'megathread_only' | 'prohibited'
    /** The country the match was made on — never a city. */
    country: string
  }>
  cold_rooms: Array<{
    id: string
    display_name: string
    /** The global capacity fact's raw text value, when one exists. */
    capacity: string | null
  }>
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
  estimated_minutes_basis: string
  median_assignment_turnaround_minutes_7d: number | null
  assignments_completed_7d: number
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
  inviteExpiresAt: string | null
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
  /** Researched contacts not yet on the roster. */
  researchedAvailable: number
}

/** What one press of Import did. */
export type BeaconImportResult = {
  imported: number
  alreadyPresent: number
  skippedNoRoute: number
  skippedDoNotContact: number
  considered: number
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

// --- Decision evidence + learning loop types ---

/// Structured evidence for a single decision — the "Why this decision" data.
/// Every field comes from the persisted decision row. input_snapshot and
/// policy_snapshot are raw JSON passed through as-is.
export type DecisionEvidence = {
  decision_id: string
  context: string
  decision_kind: string
  subject_kind: string
  subject_id: string
  confidence_basis_points: number
  disposition: string
  reason: string
  input_snapshot: Record<string, unknown>
  policy_snapshot: Record<string, unknown>
  recommendation: Record<string, unknown>
  evaluated_at: string
}

/// One entry in the learning loop: a decision with its action and outcome
/// where they exist. Missing stages are null — the frontend shows
/// "Not yet measured", never fabricated success. If an action or outcome row
/// exists but has corrupt/missing required fields, the corresponding field
/// in `data_integrity` is set and the entity is absent — distinguishing
/// "no action" from "action row exists but is corrupt." Action corruption
/// does NOT imply outcome corruption, and vice versa.
export type LearningLoopEntry = {
  decision_id: string
  context: string
  decision_kind: string
  subject_kind: string
  subject_id: string
  confidence_basis_points: number
  disposition: string
  reason: string
  evaluated_at: string
  action?: {
    action_id: string
    action_kind: string
    status: string
    finished_at: string | null
  }
  outcome?: {
    effect_assessment: string
    metric_key: string
    delta_basis_points: number
    observed_at: string
  }
  /// Stage-specific integrity warnings. `action` is set when an action row
  /// exists but has missing required fields; `outcome` is set when an
  /// outcome row exists but has missing required fields. The two are
  /// independent — action corruption does NOT mark the outcome corrupt.
  data_integrity?: {
    action?: string
    outcome?: string
  }
}

/// One belief the brain changed, what changed it, and what it did afterwards.
///
/// The learning loop shows decision → action → outcome. This shows the link
/// that follows: outcome → belief → later decision. `changed_a_decision` is
/// the claim — a revision where it is false is a belief that moved and has
/// not yet altered anything the brain did, which is a real state and not a
/// rendering gap.
export type LearningProofEntry = {
  revision_id: string
  module: string
  belief_key: string
  change_summary: string
  previous_value: Record<string, unknown>
  current_value: Record<string, unknown>
  recorded_at: string
  caused_by: {
    action_id: string
    action_kind: string | null
    decision_id: string | null
    trace_id: string | null
    decision_reason: string | null
    decided_at: string | null
    effect_assessment: string | null
    metric_key: string | null
    delta_basis_points: number | null
    observed_at: string | null
  }[]
  then_influenced: {
    decision_id: string
    decision_kind: string
    context: string
    trace_id: string | null
    evaluated_at: string
    strategy_prior: string | null
    strategy_applied: string | null
    strategy_source: string | null
    template_id: string | null
  }[]
  changed_a_decision: boolean
}

export type LearningProof = {
  entries: LearningProofEntry[]
  /// True when the ledger holds nothing yet. Separates "the brain has not
  /// changed a belief" from "the endpoint returned nothing" — an empty array
  /// cannot tell those apart.
  no_revisions_recorded: boolean
}

/// What a full autopilot cycle would decide right now, without running one.
export interface CyclePreview {
  strategy: string
  templatePriority: string[]
  templatesConsidered: number
  totalFans: number
  offPlatformAudience: number
  offPlatformAudienceThisMonth: number
  connectedPlatforms: number
  freshPlatforms: number
  northStar: string
  northStarCurrent: number
  northStarThisMonth: number
  hasAnyConnectedPlatform: boolean
}

export interface CycleRunResult {
  status: string
  detail: string
}

/// One selectable brain goal, as returned by the tenant's own CrowdRelay.
///
/// The list is fetched rather than hardcoded: the wizard has to hardcode it
/// because it runs before a tenant exists, but every post-creation surface can
/// ask, and asking is what keeps this from becoming a fourth copy of the
/// vocabulary that drifts.
/** One intent a band may state, in the planner's own vocabulary — proxied
 *  rather than copied so the console cannot offer a value the planner would
 *  not recognise. */
export interface TenantIntentOption {
  value: string
  description: string
  /** `heads_down` withholds every proposal — the console must say so at the
   *  moment of choosing, not afterwards. */
  withholdsProposals: boolean
}

export interface NorthStarOption {
  value: string
  label: string
  requiresSignal: boolean
  isAggregate: boolean
  platform: string | null
}

/// A community the brain can scan and post into.
export interface AudiencePlace {
  id: string
  placeKind: string
  platform: string
  name: string
  url: string
  countryCode: string | null
  language: string | null
  genres: string[]
  memberCount: number | null
  status: string
  notes: string | null
}

/// The fields an operator supplies when registering a community. Identity is
/// `(platform, url)`; upserting an existing pair refreshes the mutable facts
/// and never rewrites the kind.
export interface AudiencePlaceInput {
  placeKind: string
  platform: string
  name: string
  url: string
  countryCode?: string
  language?: string
  genres?: string[]
  memberCount?: number
  notes?: string
}

/// Fields for creating or updating a beacon.
///
/// `beaconId` absent means create. The tenant accepts `citySlug` as an
/// alternative to a city UUID precisely so operator surfaces can use the slug
/// the public city list returns.
export interface BeaconUpsertInput {
  beaconId?: string
  citySlug?: string
  beaconKind: string
  displayName: string
  contactEmail?: string
  destinationUrl?: string
  sourceUrl?: string
  active: boolean
  verified: boolean
  acceptsOutreach: boolean
  doNotContact: boolean
  relationshipScore: number
  relevanceBasisPoints: number
  confidenceBasisPoints: number
}

/// Every layer of the notification topology, read in one request.
///
/// Each section carries either its payload or its own `error`, because three
/// working layers and one broken one is a more useful answer than nothing —
/// and saying which parts are healthy is the page's whole job.
export type NotifiersOverview = {
  channels: { items?: NotifierChannel[]; error?: string }
  platformConfig: { items?: PlatformConfigItem[]; error?: string }
  automationRouting: { items?: AutomationRoutingItem[]; error?: string }
  discovered: { endpoints?: DiscoveredEndpoint[]; error?: string }
}

/// An introduction draft for a community, built from what was observed of it.
///
/// `grounded` is false when nothing has been observed yet — the draft then
/// says so rather than offering a template that claims a fit nobody checked.
export type CommunityIntroDraft = {
  placeId: string
  name: string
  url: string
  observedGenres: string[]
  sharedGenres: string[]
  draft: string
  grounded: boolean
}

// ── Global command center read model ────────────────────────────────────

/// Per-tenant attention projection in the command center.
export type CommandCenterTenantAttention = {
  available: boolean
  needsYou: number
  awaitingApproval: number
  openFindings: number
  criticalAlerts: number
  deadDeliveries: number
  /// Drafted posts waiting for a person to publish, summed across channels.
  /// null when the tenant does not report the queue — not the same as zero.
  unpublishedDrafts: number | null
  /// Per-channel breakdown behind `unpublishedDrafts`, for the card detail.
  unpublishedDraftChannels: { channel: string; drafts: number; oldest_drafted_at: string | null }[] | null
  /// The brain's self-assessment, passed through wholesale from the tenant —
  /// snake_case keys, because the tenant emits them that way and the
  /// projection must not rename what it does not own.
  brain: {
    state?: string
    needs_attention?: boolean
    days_observed?: number
    /// Consecutive finished cycles that created no actions — the streak that
    /// makes a silent brain legible.
    quiet_cycles?: number
    /// The brain's own words for the most recent quiet cycle, when it kept
    /// one. "WAIT wins: VOI=0.85 > best_action_value=0.00".
    latest_wait_reason?: string | null
  } | null
}

/// Per-tenant autopilot projection in the command center.
export type CommandCenterTenantAutopilot = {
  available: boolean
  queuedActions: number
  processingActions: number
  succeeded24h: number
  failed24h: number
  unknownActions: number
  runtimeEnabled: boolean
  releaseLedger: unknown | null
}

/// Per-tenant learning projection in the command center.
export type CommandCenterTenantLearning = {
  available: boolean
  totalOutcomes: number
  admitted: number
  rejected: number
  totalDecisions: number
}

/// Per-tenant outcomes projection in the command center.
export type CommandCenterTenantOutcomes = {
  available: boolean
  resolved: number
  unknown: number
  waitingForObservation: number
}

/// Per-tenant momentum projection — direction behind the magnitudes.
/// All deltas null when the trends section or the series does not report.
export type CommandCenterTenantMomentum = {
  available: boolean
  seriesCount: number | null
  staleSeriesCount: number | null
  /// Delta of the tenant's declared north-star series, matched by the
  /// "{platform}_{metric_key}" composite. Aggregate north stars
  /// (total_audience, signal_installs) match nothing — for those the
  /// brain's state label is the direction signal.
  northStarLatest: number | null
  northStarDelta7d: number | null
  northStarDelta28d: number | null
  northStarStale: boolean | null
  northStarDisplayName: string | null
  /// Sum of non-stale downstream-tier series deltas — tickets, orders,
  /// attendance. A count of conversions, never community sizes.
  conversionDelta7d: number | null
  conversionDelta28d: number | null
}

/// Per-tenant objective pacing — "are we on track" against declared
/// targets. `state` is derived upstream; counts here are tag counts.
export type CommandCenterTenantObjectives = {
  available: boolean
  total: number | null
  met: number
  onTrack: number
  behind: number
  missed: number
  unmeasurable: number
  /// The objectives actually in trouble, soonest deadline first (max 3).
  atRisk: {
    platform: string | null
    metricKey: string | null
    observedValue: number | null
    targetValue: number | null
    deadline: string | null
    state: string | null
  }[]
}

/// One tenant's contribution to the command center.
export type CommandCenterTenantSummary = {
  slug: string
  displayName: string
  runtimeHealth: 'healthy' | 'degraded' | 'stale' | 'unknown'
  available: boolean
  attention: CommandCenterTenantAttention
  autopilot: CommandCenterTenantAutopilot
  learning: CommandCenterTenantLearning
  outcomes: CommandCenterTenantOutcomes
  brain: CommandCenterTenantAttention['brain']
  // North Star fan KPIs — null when audience endpoint is unavailable,
  // not zero. The operator sees "unknown" not "0 fans".
  fans: {
    available: boolean
    activeFans: number | null
    marketingConsentedFans: number | null
    ticketBuyers: number | null
    attendees: number | null
    paidTicketOrders: number | null
    qualifiedReferrals: number | null
    synesthesiaParticipants: number | null
  }
  momentum: CommandCenterTenantMomentum
  objectives: CommandCenterTenantObjectives
}

/// The global command-center read model — the first screen an operator sees.
/// Aggregates attention, autopilot, outcomes, system convergence and learning
/// signal across all visible tenants. Each block drills into the existing
/// tenant-scoped page owning the detail.
export type CommandCenterReadModel = {
  fetchedAt: string
  tenants: {
    total: number
    active: number
    healthy: number
    degraded: number
    stale: number
    unknown: number
  }
  attention: {
    needsYou: number
    awaitingApproval: number
    openFindings: number
    criticalAlerts: number
    deadDeliveries: number
    unavailableTenants: number
    reportingTenants: number
  }
  autopilot: {
    queuedActions: number
    processingActions: number
    succeeded24h: number
    failed24h: number
    unknownActions: number
    reportingTenants: number
  }
  outcomes: {
    resolved: number
    unknown: number
    waitingForObservation: number
    reportingTenants: number
  }
  system: {
    platformServices: PlatformHealthEntry[]
  }
  learning: {
    totalOutcomes: number
    admitted: number
    rejected: number
    reportingTenants: number
  }
  brainNeedsAttention: boolean
  // North Star fan KPIs — null when no tenant reported, so the UI can
  // show "unknown" instead of a misleading "0 fans".
  fans: {
    activeFans: number | null
    ticketBuyers: number | null
    attendees: number | null
    paidTicketOrders: number | null
    reportingTenants: number
  }
  // Direction behind the magnitudes. conversionDelta* sums non-stale
  // downstream-tier series across tenants; northStar* counts the brain's
  // own verdict on each tenant's 60-day north-star series, which is the
  // direction signal for aggregate north stars too.
  momentum: {
    reportingTenants: number
    conversionDelta7d: number | null
    conversionDelta28d: number | null
    northStarImproving: number
    northStarRegressing: number
    northStarReporting: number
  }
  // Pacing against declared objectives across the fleet — "are we on
  // track", not just "which way did we move".
  objectives: {
    reportingTenants: number
    total: number
    met: number
    onTrack: number
    behind: number
    missed: number
  }
  perTenant: CommandCenterTenantSummary[]
}

// ── §4h-12: the band's listing + representation ──────────────────────
// A listing is the band-authored profile a share link admits a reader to.
// `value` may be null — a claim the band cannot support yet is a valid
// draft, and the domain drops it before any reader sees it.
export type ListingClaim = {
  label: string
  value: number | null
  tier: 'vanity' | 'intermediate' | 'downstream'
  basis: string
}

export type BandListing = {
  act_name: string
  genre_tags: string[]
  cities: string[]
  claims: ListingClaim[]
  published_dates: string[]
  seeking: string[]
  visibility: 'unlisted' | 'admitted_readers'
}

// 2.8 — an audience attestation as the operator's list shows it. The figures
// live on the public document the share_token carries, not on this summary.
export type AttestationSummary = {
  digest: string
  share_token: string
  act_name: string
  issued_at: string
  valid_until: string
  revoked: boolean
}

// The issued document plus the token that carries its link — the response
// to "issue a card", not a list row.
export type IssuedAttestationResult = {
  digest: string
  share_token: string
  signature: string
  issued_at: string
  valid_until: string
  figures: {
    metric: string
    method: string
    scope: { kind: string; value?: string }
    value: { kind: 'exact' | 'fewer_than'; value: number }
    reads_as: string
    window_days: number
    observed_at: number
  }[]
}

export type ListingState = {
  listing: BandListing | null
  share_token: string | null
  published_at: string | null
  updated_at: string | null
  approaches_used_this_month: number
  monthly_approach_allowance: number
}

// A representation contact as the band sees it — the email address never
// leaves the platform: the approach is brokered, not handed over.
export type RepresentationTarget = {
  target_id: string
  kind: 'agent' | 'label' | string
  display_name: string
  accepts_outreach: boolean
  accepts_outreach_basis?: string
  do_not_contact: boolean
  active: boolean
  verified: boolean
  version: number
  last_outreach_at?: string
}

export type RepresentationTargetsResponse = {
  targets: RepresentationTarget[]
  approaches_used_this_month: number
  monthly_approach_allowance: number
}

export type RepresentationTargetInput = {
  target_id?: string
  kind: 'agent' | 'label'
  display_name: string
  contact_email: string
  accepts_outreach: boolean
  accepts_outreach_basis?: string
  active?: boolean
  verified?: boolean
  do_not_contact?: boolean
  expected_version?: number
}

export type ApproachRequestResult = {
  action_id: string
  status: string
}

/** One city in the tenant's own funnel — `GET /tenants/{slug}/audience/city-funnel`.
 *
 *  Every count is a real count. `months_since_show` is null when the band has
 *  never played there, which is different from having played there a long time
 *  ago, and the panel renders those two differently on purpose.
 */
export type CityFunnelRow = {
  city_slug: string
  city_name: string
  country_code: string
  region: string | null
  fans: number
  new_30d: number
  active_30d: number
  consented: number
  /** The funnel's own threshold for "there are enough people here to play to". */
  bookable: boolean
  /** Consented fans inside the radius they chose — who we could actually tell. */
  reachable: number
  venues: number
  promoters: number
  festivals: number
  last_show_at: string | null
  next_show_at: string | null
  /** Null means never played here, not "played here zero months ago". */
  months_since_show: number | null
  /** `domain::place::organise_score` in basis points. A city with a booked
   *  forward show scores 0 — it is not a gap. */
  organise_score_bp: number
}

/** One room in the shared venue registry — `GET /tenants/{slug}/audience/city-venues`.
 *
 *  Aggregated across every tenant that has played it. `contributors` is a
 *  count and never names anybody, and `typical_draw` is null rather than 0
 *  when no marked show sold tickets through us: an unticketed night is
 *  unmeasurable, not empty.
 */
export type CityVenueRow = {
  venue_id: string
  display_name: string
  city_slug: string
  city_name: string
  country_code: string
  shows_played: number
  shows_booked: number
  contributors: number
  typical_draw: number | null
  repeat_attenders: number
  last_played_at: string | null
  next_show_at: string | null
  /** §12-1 verdict on the room's evidence: `worth_contact` carries a
   *  because-list sentence, `insufficient_evidence` the honest refusal. */
  assessment: 'worth_contact' | 'insufficient_evidence'
  /** The one-sentence answer in the tenant's crew locale. */
  assessment_sentence: string
}

/** Why the planner proposes this city — `GET /tenants/{slug}/gig-plan`.
 *
 *  Reasons are structured data, not sentences: the panel phrases each for a
 *  person, and the outreach draft phrases it for a promoter, from the same
 *  fields. The `kind` tag is the vocabulary the track record is scored in.
 */
export type GigPlanReason =
  | { kind: 'comparable_acts_played_here'; count: number; of_shows: number }
  | { kind: 'reachable_audience'; reachable: number }
  | { kind: 'room_draws'; typical_draw: number }
  | { kind: 'never_played_but_has_fans'; reachable: number }
  | { kind: 'overdue_return'; months: number; active_30d: number }
  | { kind: 'co_bill_adds_audience'; act: string; adds_reachable: number }
  | { kind: 'warm_promoter'; name: string }
  | { kind: 'room_is_active'; days_since_last_event: number }

/** Who the proposal says the room is and what it reaches. */
export type GigPlanProposal = {
  /** The catalogue id — what an approval names. A slug is only unique per
   *  country, so identity is the id and `city` is for reading. */
  city_id: string
  /** The catalogue slug. */
  city: string
  /** The name a person reads. */
  city_name: string
  venue: string
  /** Who to write to, strongest relationship first. */
  contact: string[]
  /** Acts worth asking onto the bill — asking, never announcing. */
  invite_to_bill: string[]
  reasons: GigPlanReason[]
  reach: {
    reachable: number
    added_by_co_bill: number
    /** Null is unmeasured, not zero. */
    room_typical_draw: number | null
    basis: string
  }
  fits_intent: string
  /** What the planner knows it does not know — read before approving. */
  caveats: string[]
}

/** One city that produced no proposal, with the sentence explaining it. */
export type GigPlanPassedOver = {
  /** The catalogue id — slug is only unique per country. */
  city_id: string
  city: string
  city_name: string
  reason: string
  /** A ready-to-paste research prompt when research would change the answer
   *  (4G.6); absent when nothing missing is a fact somebody could go find. */
  research_brief: string | null
}

/** One approved proposal and what it has produced so far. */
export type GigPlanOutcome = {
  /** The catalogue id of the proposed city. */
  city_id: string
  city: string
  city_name: string
  venue: string
  approved_at: string
  /** The action's own status — `queued` may mean parked on a missing
   *  executor; a score exists only once the letter left. */
  action_status: string
  recipients: number
  replies: number
  /** Reply windows still open — the proposal is in flight, not failed. */
  unfinished_measurements: number
  /** A real show appeared in the city after the approval. */
  show_booked: boolean
  reasons: GigPlanReason[]
}

/** Per reason kind, over settled proposals only. */
export type GigPlanReasonScore = {
  kind: string
  proposals: number
  replies: number
  shows: number
}

export type GigPlanResponse = {
  proposals: GigPlanProposal[]
  passed_over: GigPlanPassedOver[]
  cities_considered: number
  /** The intent the plan was made under — the band's word or the override. */
  intent: string
  /** False means the visible plan came from a one-off override, not the
   *  stored intent — the panel says so rather than letting it look stored. */
  intent_is_stored: boolean
  track_record: {
    proposals: GigPlanOutcome[]
    by_reason: GigPlanReasonScore[]
  }
}

/** The answer to an approval — untagged upstream, so the variant is told by
 *  which fields are present. `refused` is a real answer, not an error. */
export type GigPlanApproval =
  | { action_id: string; city: string; venue: string; recipients: string[]; opening_line: string }
  | { action_id: string; status: string }
  | { refused: string }
