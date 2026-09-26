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
  awaitingApproval: number | null
  northStarFans: number | null
  lastHeartbeatAt: string | null
  checkedAt: string | null
}

/** The ninety-day guarantee verdict, derived on read from the frozen
 * activation baseline and the latest reported fan-graph level. */
export type GuaranteeView = {
  state: 'unmeasured' | 'tracking' | 'kept' | 'refund_owed'
  metricKey: string
  baselineValue: number | null
  baselineCapturedAt: string | null
  deadline: string | null
  currentValue: number | null
  currentCapturedAt: string | null
  daysRemaining: number | null
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
  placement: 'dedicated' | 'shared_pg'
  placementCluster: string | null
  placementDatabase: string | null
  /** Crew roster collected at onboarding — `[{key,name,email,skills}]`. */
  teamMembers: { key: string; name: string; email: string; skills: string[] }[]
  createdAt: string
  updatedAt: string
}

export type RuntimeHealth = 'healthy' | 'degraded' | 'stale' | 'unknown'

export type BillingState = 'trialing' | 'active' | 'past_due' | 'canceled' | 'refunded'

export type BillingView = {
  state: BillingState
  subscriptionStartedAt: string
  trialEndsAt: string | null
  currentPeriodEndsAt: string | null
}

export type TenantSummary = Tenant & {
  /** Enabled notifier channels, as the overview reports them. */
  enabledNotifierChannels?: number
  runtime: RuntimeStatus | null
  runtimeHealth: RuntimeHealth
  billing: BillingView | null
}
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
  approximateLat:number|null; approximateLng:number|null; exactLat:number|null; exactLng:number|null
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
  worker?: { lease_age_seconds: number; alive: boolean; cycle_age_seconds?: number; crash_looping?: boolean }
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
  /** Where this address was sighted — 'gdrive', 'gmail', 'upload', or a mix. */
  sources: string[]
  last_seen_at: string
  /** The file stopped carrying this address — kept, not deleted. */
  gone_from_source: boolean
  fan_outcome: DriveContactOutcome
  beacon_outcome: DriveContactOutcome
  /** P.2: the room's registry display name when this contact's
      organisation is already on record — null means a stranger. */
  matched_venue: string | null
  /** The band's own marks say they already played that room. */
  venue_played_here: boolean
  /** The counterparty registry knows this address. */
  matched_counterparty: string | null
  /** The band's own marks say they already dealt with them. */
  counterparty_worked_with: boolean
  /** P.6: the address's reply record across every tenant — anonymous
      counts. null means the prior read did not run, not "no history". */
  counterparty_prior: CounterpartyPrior | null
  /** P.6: the matched room's play record across every tenant. null when
      no venue matched or the read did not run. */
  venue_prior: VenuePrior | null
}

/** P.6 — one address's cross-tenant reply record. Counts of tenants,
    never which tenants. `tenants_replied` counts any disposition — a
    decline is still an answer. */
export type CounterpartyPrior = {
  tenants_contacted: number
  tenants_replied: number
  tenants_won: number
}

/** P.6 — one room's cross-tenant play record: tenants with a mark and
    total shows on record. */
export type VenuePrior = {
  tenants_played: number
  shows: number
}

/** The registry joins counted over the whole staging population — the
    page is capped, so "already on record" numbers cannot come from it. */
export type DriveRegistrySummary = {
  total: number
  known_venues: number
  own_rooms: number
  known_counterparties: number
  dealt_with: number
}

export type DriveContactsResponse = {
  contacts: DriveContact[]
  /** Null when the registry pass could not run — never reads as zeroes. */
  registry_summary: DriveRegistrySummary | null
  /** Counted over the whole staging population upstream, one filtered
      query — the rendered page is capped, so chip totals must come from
      here. Null when the count pass failed: a missing number is null,
      never 0, and a null count disables the bulk-promote path. */
  segment_counts: DriveSegmentCounts | null
}

/** The upstream segments the contacts list can be filtered to. `decided`
    is the count of rows no longer staged on either destination — there is
    no chip for it, it only explains why the staged counts need not sum. */
export type DriveSegmentCounts = {
  likely_fan: number
  likely_org: number
  beacon: number
  inactive: number
  gone: number
  decided: number
}

/** What a promote-batch call moved. Every counter is the upstream's own
    number — rendered verbatim, never rounded into one "N promoted". */
export type DriveBatchPromoteResult = {
  promoted: number
  imported_pending: number
  confirmation_resent: number
  already_active: number
  skipped_suppressed: number
  cooldown_skipped: number
}

// P.1 — one person, two roles. The industry list (beacons) joined to the
// fan list by address, for reading only. snake_case — the upstream read
// model serialises field names verbatim.
export type DualRoleContact = {
  beacon_id: string
  display_name: string
  role: string
  city: string | null
  relationship_score: number
  /** Already an active fan with marketing consent. */
  hears_the_dates: boolean
  /** A fan row exists but without live consent — never reachable. */
  known_but_not_consented: boolean
  /** Days since contact in any role; null means never — "cold". */
  days_since_last_contact: number | null
  already_invited: boolean
  invitable: boolean
  /** Why not, when not — a sentence, not a flag. */
  hold_reason: string | null
  /** The band ever had an answer — a reply outranks a score. */
  has_replied: boolean
  /** Marked do-not-contact on the beacon or the governor. */
  do_not_contact: boolean
  accepts_outreach: boolean
  /** They were on the list and left — the hold that never expires. */
  previously_opted_out: boolean
  /** Their double opt-in is already in their inbox, unanswered. */
  opt_in_pending: boolean
}

export type DualRoleReview = {
  contacts: DualRoleContact[]
  total: number
  already_hear_the_dates: number
  invitable_now: number
}

/** The invitation answers 200 either way: `outcome` on a send, `refused`
    with the rule's own sentence when the click re-check found a reason
    the read's assumption missed. */
export type LatarnikInviteResult = {
  outcome?: string
  refused?: string
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

/// One row of the tenant's ViryaOS action ledger — the durable state machine
/// every autopilot action moves through (PLANNED → AUTHORIZED → QUEUED →
/// RUNNING → SUCCEEDED/FAILED/UNKNOWN → RECONCILING → terminal).
export type ActionLedgerEntry = {
  action_id: string
  state: string
  trace_id: string | null
  causation_id: string | null
  decision_id: string | null
  state_entered_at: string
  updated_at: string
  transition_count: number
  previous_state: string | null
  reconciliation_count: number
  last_reconciliation_error: string | null
}

/// One event in the causal chain a trace_id joins across the event tables:
/// decision → action → outbox → delivery → measurement → evidence.
export type TraceTimelineEvent = {
  occurred_at: string
  source: string
  kind: string
  state: string | null
  action_id: string | null
  decision_id: string | null
  causation_id: string | null
  event_id: string | null
  /// FACT (observed), INFERENCE (derived) or UNKNOWN (not yet confirmed).
  certainty: string
}

export type TraceTimeline = { trace_id: string; events: TraceTimelineEvent[] }

// ── Process runs ────────────────────────────────────────────────────────
// One pass of a pipeline over one subject, rendered as steps: observed →
// decided → awaiting a person → sent → proof → measured. The community
// relay is the first kind: one synced band post fans out to one Signal push
// plus one drafted Reddit post per admitted community.

/// One community the decision named, its draft, approval state, receipt and
/// latest measurement. `state` is the upstream-derived step word — the page
/// never re-interprets timestamps into its own vocabulary.
export type RelayTargetState =
  | 'deciding'
  | 'awaiting_you'
  | 'expired'
  | 'queued'
  | 'posting'
  | 'rate_limited'
  | 'posted'
  | 'manual'
  | 'failed'
  | 'skipped'

export type RelayTarget = {
  /// Client-side identity for keyed reconcile — mirrors `target_id`.
  id: string
  target_id: string
  subreddit: string | null
  display_name: string | null
  confidence_bp: number | null
  state: RelayTargetState
  action_id: string | null
  community_post_id: string | null
  draft_title: string | null
  draft_body: string | null
  image_url: string | null
  approval_expires_at: string | null
  post_status: string | null
  /// When a `rate_limited` delivery retries — the "why still posting"
  /// answer the state word alone cannot give.
  rate_limited_until: string | null
  reddit_post_url: string | null
  posted_at: string | null
  score: number | null
  upvotes: number | null
  num_comments: number | null
  upvote_ratio: number | null
  measured_at: string | null
  reach_status: string | null
  observed_fans: number | null
  converted: boolean | null
  /// Why the action or the post failed, when it did.
  error_kind: string | null
}

export type RelayPushLeg = {
  action_id: string
  status: string
  audience_size: number | null
  approval_expires_at: string | null
}

/// The full run detail — the single-call process view.
export type RelayProcessRunDetail = {
  source_id: string
  title: string | null
  platform: string | null
  source_url: string | null
  thumbnail_url: string | null
  body: string | null
  occurred_at: string | null
  decided_at: string
  confidence_bp: number
  /// The batch ask — one approval per source. `awaiting_approval` while a
  /// person has not answered, `approved` while the drip runs, `revoked`/
  /// `done` once the answer landed. `null` while drafts still land.
  batch_status: string | null
  /// Seconds the executor holds between two posts of the same spread.
  interval_seconds: number | null
  approved_at: string | null
  revoked_at: string | null
  observe_until: string | null
  push: RelayPushLeg | null
  /// True when the fan-out exceeded the bounded cap — the view says so
  /// rather than silently showing a partial list. `targets_total` is the
  /// untruncated count for the "N of total" note.
  targets_truncated: boolean
  targets_total: number
  targets: RelayTarget[]
}

/// One row of step state per run — the list view stays thin so it renders
/// in a single indexed read.
export type RelayProcessRun = {
  /// Client-side identity for keyed reconcile — mirrors `source_id`.
  id: string
  source_id: string
  title: string | null
  platform: string | null
  source_url: string | null
  thumbnail_url: string | null
  occurred_at: string | null
  decided_at: string
  confidence_bp: number
  communities_decided: number
  push_decided: boolean
  /// The batch ask — the run's one answer. See `RelayProcessRunDetail`.
  batch_status: string | null
  interval_seconds: number | null
  observe_until: string | null
  deciding: number
  awaiting: number
  expired: number
  queued: number
  posting: number
  /// Deferred on Reddit's 429 backoff — counted apart from `posting`
  /// because a parked delivery is a different fact from one in flight.
  rate_limited: number
  posted: number
  manual: number
  failed: number
  skipped: number
  last_posted_at: string | null
  total_score: number | null
  total_comments: number | null
  replies: number
  conversions: number
  push_status: string | null
}

export type RelayProcessRuns = { runs: RelayProcessRun[] }

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
  /** Crew members the machine can hand a show task to. */
  available_assignees?: { member_id: string; display_name: string }[]
  /** Newest-first recent actions — the In motion page tallies what
   *  finished in the last day from these. */
  recent_actions?: { id: string; action_kind: string; status: string; finished_at: string | null; context: string }[]
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

/// One ask that is past answering — the approval queue's other half. The
/// inbox lists what is pending; this is what reached its deadline.
export type LapsedApproval = {
  action_kind: string
  context: string
  subject_kind: string
  /// `approval_expired`, `insufficient_evidence` or `awaiting_sweep` — three
  /// deaths, three different remedies.
  cause: string
  /// When the sweep cancelled it. `null` for `awaiting_sweep`, which has not
  /// been cancelled yet — absent, not zero and not "now".
  finished_at: string | null
  /// When the window closed. `null` when the row predates the column.
  approval_expires_at: string | null
  /// The decision's own sentence — why the machine proposed this at all.
  reason: string
}

/// What lapsed in the window, and the pressure on the queue right now.
export type LapsedApprovals = {
  window_days: number
  items: LapsedApproval[]
  /// Every lapse in the window, including any the capped list omitted.
  total: number
  /// Pending asks whose window closes within a day — the forward half.
  expiring_within_24h: number
}

/// One inbound reply whose last word is theirs — nobody has written back.
///
/// The queue `needs_you` cannot express: those are asks the system proposed;
/// this is conversations people started with us. Read from the interaction
/// log itself, not the reply-classifier queue — imported sheet answers never
/// carried reply text, so they never entered that table, and a board that
/// read only it reported "nothing needs you" with sixteen people waiting.
export type UnansweredReply = {
  /// `outreach` or `booking` — which log the reply lives in.
  channel: string
  target_id: string
  /// The counterparty as the operator knows them.
  target_name: string
  target_kind: string
  contact_email: string | null
  /// `positive` (a yes is waiting) or `received` (the answer was never
  /// classified — the whole imported cohort).
  disposition: string
  /// The sheet's own verdict code when the reply was imported
  /// (`POSITIVE`, `GMAIL_REPLY`, `NEGOTIATING`); null otherwise.
  sheet_verdict: string | null
  replied_at: string
  /// Days the reply has waited.
  waiting_days: number
}

/// One outward send that failed, named.
export type FailedSend = {
  action_id: string
  action_kind: string
  context: string
  /// `executor_unavailable`, a provider's own error kind, whatever was
  /// recorded. Named rather than counted.
  error_kind: string | null
  finished_at: string | null
  attempt_count: number
  /// Who never heard from the tenant. Empty when the action failed before
  /// it emitted anything — nobody was written to, a different failure.
  recipients: string[]
}

/// The failed sends of the window, and how many there were in total.
export type FailedSends = {
  window_days: number
  items: FailedSend[]
  /// Every failed send in the window, including any the capped list omitted.
  total: number
}

/// An LLM worker's result the admission gate refused.
///
/// The agents service writes outcomes; the deterministic worker rejects the
/// ones that fail verification. A rejection is the system working — but a
/// burst is the worker's output drifting from the contract the gate
/// enforces, which used to be visible only as an aggregate inside a
/// watchdog alert: something was refused, never which output or why.
export type RejectedAgentOutcome = {
  id: string
  /// Which worker produced the refused output (`press_pitch`,
  /// `audience_segments`, …).
  kind: string
  /// The gate's own words for the refusal. `null` means the row predates
  /// reason capture — a rejection without its reason is still a rejection.
  rejection_reason: string | null
  /// The agents-service task that produced it — the trace handle into
  /// `ops/trace` for the full decision chain.
  task_id: string
  created_at: string
}

/// A notice the band is owed — a show task, a release report, a deal
/// update. Its record is the durable outbox event itself, deduped per
/// subject: `delivered` is whether the email behind it actually left, so a
/// `false` row is an escalation that happened and nobody was told.
export type BandNotice = {
  id: string
  /// The outbox event type minus the `crowdrelay.` prefix
  /// (`show.task_attention_required`, `release.r3_report_due`, …).
  kind: string
  /// The emitted payload — which event, release or deal it concerns.
  detail: Record<string, unknown>
  delivered: boolean
  created_at: string
}

/// One action, as the world outside received it — the words it carried and
/// the addresses it went to. A 404 upstream means the action never emitted:
/// nothing left, which is itself the answer.
export type SentRecord = {
  action_id: string
  action_kind: string
  status: string
  finished_at: string | null
  /// The executor's own word for what happened, when one reported.
  executor_status: string | null
  /// The provider's identifier for the thing that was sent — a message id,
  /// a post id. What a support request from the other end would quote.
  provider_reference: string | null
  /// `crowdrelay.gig.outreach_requested` and friends. `null` when the action
  /// never emitted, which is itself the answer: nothing left.
  event_type: string | null
  emitted_at: string | null
  /// The subject as it was sent, when the payload carried a draft.
  subject: string | null
  /// The body as it was sent.
  body: string | null
  /// Every address the emission named, in the order it named them.
  recipients: string[]
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
  /// The community the action targets, when the payload names one. Absent on
  /// an older tenant that does not project it.
  subreddit?: string | null
  /// What the content is called, when the payload names one.
  title?: string | null
  /// Which workflow template the action runs, when the payload names one.
  template_id?: string | null
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

export type TenantTodaySection = 'summary' | 'flags' | 'autopilot' | 'growth' | 'opportunities' | 'signal' | 'audience' | 'growth_metrics' | 'acquisition_sources' | 'reply_triage' | 'shows' | 'attention' | 'next_show_timeline'

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

/// The needs-you snapshot, as `GET /tenants/{slug}/operations/attention`
/// projects it — the same object embedded in the today model's `attention`
/// section, so the page's strip and the Needs-you page read one shape.
/// `not_reported` names the sections whose value is a placeholder rather
/// than a measurement: an empty list beside a zero means the tenant really
/// has nothing waiting; `awaiting_approval` listed there means it does not
/// report approvals at all.
export type TenantAttentionReadModel = {
  id: string
  summary: OperationsSummary
  alerts: OpsAlert[]
  dead_push: PushDeliveryItem[]
  dead_outbox: OutboxItem[]
  dead_deliveries: DeliveryItem[]
  ecosystem: EcosystemOverview
  findings: ReconciliationFinding[]
  /// Pending autopilot actions awaiting human approval. Optional: an older
  /// CrowdRelay may not publish this field — the control-plane projects
  /// `[]` for backward compatibility. `[]` + healthy snapshot = genuinely
  /// nothing needs approval. Absent field = degraded, not empty.
  needs_you?: PendingActionSummary[]
  /// Count of opportunities awaiting approval. Optional for the same reason.
  awaiting_approval?: number
  /// Drafted posts waiting for a person to publish them, per channel.
  ///
  /// The one queue where the system is blocked on the operator rather than the
  /// reverse: every outbound channel drafts and waits. Optional for the same
  /// reason as the fields above — absent means the tenant does not report the
  /// queue, which is not the same as reporting an empty one.
  unpublished_drafts?: UnpublishedDraftChannel[]
  /// What the brain makes of its own recent performance, and — when it has
  /// been doing nothing — why. `null` (or absent on an older tenant) means
  /// the tenant does not report a self-assessment; the page prints
  /// "not reported", never a healthy-looking verdict nobody measured.
  brain?: BrainSelfAssessment | null
  /// The approval queue's losses — asks that reached their deadline, and
  /// what is about to. `null` (or absent on an older tenant) means the
  /// tenant does not report the queue's losses; `not_reported` names it.
  lapsed_approvals?: LapsedApprovals | null
  /// Outward sends that failed in the window, named — the recipients the
  /// counts cannot identify. Same null/not_reported convention as above.
  failed_sends?: FailedSends | null
  /// LLM worker results the admission gate refused in the last week,
  /// newest first — the rejection kind and the gate's own reason, not just
  /// the watchdog's aggregate. Absent means the tenant does not publish it.
  rejected_agent_outcomes?: RejectedAgentOutcome[]
  /// The show/release/opportunity escalations the band is owed, deduped per
  /// subject — the durable record the escalation leaves behind. Absent
  /// means the tenant does not publish it.
  band_notices?: BandNotice[]
  /// Inbound replies whose last word is theirs — conversations waiting on
  /// the band, oldest first. Absent means the tenant does not report the
  /// queue, which is not the same as reporting an empty one.
  unanswered_replies?: UnansweredReply[]
  /// Sections whose value above is a placeholder the Control Plane
  /// substituted, not something the tenant measured.
  not_reported?: string[]
}

/// Facts assembled cp-side from the Today fan-out — the header pill's
/// running/done/broken summary, the approval inbox grouped into waves, and
/// per-work-area counts. Assembled, not fetched: `derived` is absent on
/// control-plane builds that predate it, and each field inside is `null`
/// when the section it reads degraded.
export type TodayDerived = {
  status: {
    running: boolean | null
    done_24h: number | null
    failed_24h: number | null
    queued: number | null
    dead_jobs: number | null
    waiting_on_you: number | null
  }
  /// One row per same-kind wave (`context|action_kind|subject_kind`), soonest
  /// expiry first. `action_ids` keeps every ask's id so the attention page
  /// can still act on them one by one. `null` when attention is degraded or
  /// the tenant does not report the queue — never `[]` for "unknown".
  approval_batches: {
    key: string
    context: string
    action_kind: string
    subject_kind: string
    title: string | null
    count: number
    action_ids: string[]
    earliest_expires_at: string | null
  }[] | null
  work_area_counts: {
    replies: number | null
    approvals: number | null
    drafts: number | null
  }
}

export type TenantTodayReadModel = {
  id: string
  summary: OperationsSummary | null
  derived?: TodayDerived | null
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
  // The default tab's queue — replies waiting on a person.
  reply_triage: ReplyTriageView | null
  // "The next night" — the show list, and the nearest upcoming night's own
  // timeline. The timeline key only exists when a next show does: a night
  // that is never due is absent, not degraded.
  shows: TenantShowsResponse | null
  next_show_timeline?: TenantShowTimelineResponse | null
  // The needs-you snapshot — the human gate the page's own strip renders.
  // Re-projected server-side through the dedicated attention endpoint's
  // contract, so `not_reported` means the same thing here as there.
  attention: TenantAttentionReadModel | null
  // Sections the tenant channel could not serve. They render as locally
  // degraded instead of failing the whole subpage.
  degraded: TenantTodaySection[]
  // Per-section verdict, including the ones that succeeded.
  sections: SectionVerdicts
  // Per-section fact freshness. observedAt is propagated from upstream
  // timestamps where present; classification is live/stale/unknown.
  freshness: SectionFreshnessMap
  // When the server assembled this fan-out. The only freshness claim it can
  // honestly make about a live upstream read.
  fetchedAt: string
}

export type TenantBookingSection =
  | 'gig_plan'
  | 'shortlist'
  | 'booking_candidates'
  | 'outreach_candidates'
  | 'agents'
  | 'reply_triage'
  | 'negotiations'
  | 'shows'

/** `GET /tenants/{slug}/booking` — the whole book-a-show pipeline in one
 * read model, sections in pipeline order: found → confirmed → approached →
 * talking → booked. A missing section is `null` and named in `degraded`. */
export type TenantBookingReadModel = {
  id: string
  // The planner's city picks, the passed-over list, and the track record
  // those proposals produced. `null` when the gig-plan section is degraded.
  gig_plan: GigPlanResponse | null
  // The scout's shortlist — every tracked opportunity, live and closed.
  shortlist: OpportunityShortlist | null
  // Candidate queues waiting on a person's confirm before a letter exists.
  booking_candidates: BookingCandidateView[] | null
  outreach_candidates: OutreachCandidateView[] | null
  // The agent registry — who the season door is open with.
  agents: { agents: BookingAgent[] } | null
  // Replies waiting on a human read.
  reply_triage: ReplyTriageView | null
  // Live terms conversations and moves parked for approval.
  negotiations: NegotiationsView | null
  // The nights themselves — what the pipeline already produced.
  shows: TenantShowsResponse | null
  degraded: TenantBookingSection[]
  sections: SectionVerdicts
  freshness: SectionFreshnessMap
  fetchedAt: string
}

// The Places page is tabbed, and each tab carries a thin read model of its
// own — the Cities tab never pays for the venue registry, the Online tab
// never pays for the funnel. AREA keeps its own endpoints (the workspace
// owns them), so no places model carries AREA data.

export type TenantPlacesCitiesSection = 'city_funnel' | 'gig_plan' | 'rooms_summary' | 'online_summary'
export type TenantPlacesRoomsSection = 'city_venues'
export type TenantPlacesOnlineSection = 'audience_places'

/** `GET /tenants/{slug}/places/cities` — the "where next" read: the city
 * funnel in the organise ranking plus the gig plan's city facet, so the
 * tab can mark which funnel rows the planner already wants. */
export type TenantPlacesCitiesModel = {
  id: string
  // Ranked city funnel — `?order=organise` upstream. `null` when degraded.
  city_funnel: CityFunnelRow[] | null
  // The planner's current city picks — proposals, passed-over, track record.
  gig_plan: GigPlanResponse | null
  /** The page's first screen: counts over the room registry and the online
   *  places, computed server-side. Absent on an older control plane. */
  rooms_summary?: {
    total: number
    worth_contact: number
    insufficient_evidence: number
    not_assessed: number
    played: number
    by_city: { city_name: string; city_slug: string; rooms: number }[]
    last_played: { display_name: string; city_name: string; last_played_at: string; shows_played: number } | null
  } | null
  online_summary?: { total: number; by_platform: Record<string, number> } | null
  degraded: TenantPlacesCitiesSection[]
  sections: SectionVerdicts
  freshness: SectionFreshnessMap
  fetchedAt: string
}

/** `GET /tenants/{slug}/places/rooms` — the shared venue registry,
 * aggregated across acts. */
export type TenantPlacesRoomsModel = {
  id: string
  city_venues: CityVenueRow[] | null
  degraded: TenantPlacesRoomsSection[]
  sections: SectionVerdicts
  freshness: SectionFreshnessMap
  fetchedAt: string
}

/** `GET /tenants/{slug}/places/online` — the communities the audience
 * graph knows. */
export type TenantPlacesOnlineModel = {
  id: string
  audience_places: { places: AudiencePlace[] } | null
  degraded: TenantPlacesOnlineSection[]
  sections: SectionVerdicts
  freshness: SectionFreshnessMap
  fetchedAt: string
}

export type TenantBrainSection =
  | 'autopilot'
  | 'scorecard'
  | 'learning'
  | 'learning_proof'
  | 'measurement'
  | 'attention'
  | 'action_states'
  | 'intelligence'

/** `GET /v1/control-plane/ops/action-states` — per-state depth and the
 * oldest entry's timestamp for every in-flight action state. Always all six
 * in-flight states; an empty state is `count: 0` with `oldest_entered_at`
 * null — a measured zero, not a gap. */
export type ActionStatesReport = {
  observed_at: string
  in_flight: Array<{ state: string; count: number; oldest_entered_at: string | null }>
}

/** `GET /tenants/{slug}/brain` — the autopilot's evidence in one call: the
 * posture facts the page header needs, the scorecard, the two learning
 * surfaces, the measurement ledger, and the attention snapshot whose
 * refused-outcome list the learning tab renders as the gate's own words.
 * The brief stays its own endpoint — it is the page's story and keeps its
 * own poll cadence. A missing section is `null` and named in `degraded`. */
export type TenantBrainReadModel = {
  id: string
  // Posture + queue depth — the header badges read this.
  autopilot: AutopilotOverview | null
  scorecard: AgentScorecard | null
  // Decision → action → outcome entries, newest first.
  learning: LearningLoopEntry[] | null
  // Outcome → belief → later decision — the loop's fourth link.
  learning_proof: LearningProof | null
  // The plan's fifteen claims, each with its number or the reason it cannot be produced.
  measurement: MeasurementLedger | null
  // The attention snapshot — rejected_agent_outcomes is the gate's refused
  // work in its own words; findings and needs_you ride along.
  attention: TenantAttentionReadModel | null
  // Time-in-stage per in-flight action state — what "how long has this sat"
  // the actions list cannot answer. Absent on an older CrowdRelay (404 →
  // named in `degraded`).
  action_states: ActionStatesReport | null
  /** The intelligence brief — the page's first screen. Absent on an older
   *  control plane; null when the tenant could not answer it. */
  intelligence?: IntelligenceBrief | null
  degraded: TenantBrainSection[]
  sections: SectionVerdicts
  freshness: SectionFreshnessMap
  fetchedAt: string
}

export type TenantProofSection =
  | 'listing'
  | 'attestations'
  | 'representation'
  | 'shows'

/** `GET /tenants/{slug}/proof` — the "send this to a promoter" drawer in one
 * call: the listing and its share token, the issued attestation cards, the
 * representation contacts an agent may approach, and the show list the page
 * reads issued reports from. Organiser links stay per-night — upstream has
 * no nights list. A missing section is `null` and named in `degraded`. */
export type TenantProofReadModel = {
  id: string
  // The band-authored profile + share token — the listing link's state.
  listing: ListingState | null
  // The signed proof cards, current and revoked both — the page styles them.
  attestations: AttestationSummary[] | null
  // Who an agent or label may approach, and this month's allowance.
  representation: RepresentationTargetsResponse | null
  // The show list — completed nights are the reports worth sending.
  shows: TenantShowsResponse | null
  degraded: TenantProofSection[]
  sections: SectionVerdicts
  freshness: SectionFreshnessMap
  fetchedAt: string
}

export type TenantDeliverySection =
  | 'summary'
  | 'outbox'
  | 'deliveries'
  | 'attention'
  | 'delivery_results'

/** `GET /tenants/{slug}/delivery` — the operator's "what is stuck, and why"
 * in one call: queue depths, the live outbox and delivery rows in flight,
 * the attention snapshot's dead lists and unpublished drafts, and the
 * recent delivery-results ledger. A missing section is `null` and named in
 * `degraded`. */
export type TenantDeliveryReadModel = {
  id: string
  summary: OperationsSummary | null
  // Live rows still in flight — the recent window, not the dead list.
  outbox: OutboxItem[] | null
  deliveries: DeliveryItem[] | null
  // dead_outbox / dead_deliveries / dead_push / unpublished_drafts ride here.
  attention: TenantAttentionReadModel | null
  // What landed — the recent per-attempt ledger.
  delivery_results: DeliveryResult[] | null
  degraded: TenantDeliverySection[]
  sections: SectionVerdicts
  freshness: SectionFreshnessMap
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
  'approvals.pending',
  'outreach.reddit_halted',
  'outreach.replies_waiting',
  'outreach.lanes_cut',
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
  'approvals.pending': 'Approvals waiting',
  'outreach.reddit_halted': 'Reddit posting halted',
  'outreach.replies_waiting': 'Replies waiting over 12h',
  'outreach.lanes_cut': 'Lanes with no fans',
}

export type DiscoveredEndpoint = {
  id: string
  name: string
  urlHost: string
  active: boolean
}

/// One queued notification in the control plane's notifier outbox. `phase`
/// is the server-rolled state: `accepted` (pending or already sent), `failed`
/// (dead after retries), `unknown` for anything else.
export type NotifierOutboxItem = {
  id: string
  event: string
  status: string
  phase: 'accepted' | 'failed' | 'unknown' | string
  attempts: number
  lastError: string | null
  channel: { id: string; label: string; kind: NotifierKind }
  createdAt: string
  updatedAt: string
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

// What the media upload returns — the public URL is what `join_ask_image_url`
// stores, minted from the tenant's public API origin so Meta and Telegram can
// fetch it at publish time.
export interface UploadedMedia {
  id: string
  url: string
  contentType: string
  byteLen: number
  name: string
}

// A tenant-held credential the operator can see exists — the masked hint and
// when it was set. The value itself is never returned by any read.
export interface TenantSecret {
  name: string
  masked_hint: string
  updated_at: string
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

export type TenantPortfolioSection = 'overview' | 'amplification' | 'fanbases'

export type TenantPortfolioReadModel = {
  id: string
  overview: PortfolioOverview | null
  amplification: { consents: PortfolioConsent[] } | null
  fanbases: { fanbases: FanbaseBlock[] } | null
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

/// One approved action and what it produced. `outcome_state` is the honest
/// word for the measurement: `measured` has verdicts to show, `pending` is
/// waiting on its horizon, `unmeasured` never scheduled one — three
/// different statements the console keeps apart rather than reading as 0.
export type ActionOutcomeLine = {
  id: string
  kind: string
  context: string
  label: string | null
  status: string
  error_kind: string | null
  approved_at: string | null
  finished_at: string | null
  outcomes: {
    metric: string
    verdict: 'improved' | 'neutral' | 'worsened' | null
    observed: number
    baseline: number | null
    at: string
  }[]
  outcome_state: 'measured' | 'pending' | 'unmeasured'
  next_measurement_due: string | null
}

/// One wave of approved asks, folded by kind cp-side so the page can say
/// "4 pushes to fans · measuring" instead of listing raw action ids.
/// `latest_metrics` is the freshest measured action's outcome lines — what
/// one representative result looks like; absent until something measures.
export type OutcomeGroup = {
  kind: string
  context: string | null
  count: number
  pending: number
  unmeasured: number
  measured: number
  improved: number
  neutral: number
  worsened: number
  failed: number
  latest_finished_at: string | null
  latest_metrics: {
    metric: string
    verdict: 'improved' | 'neutral' | 'worsened' | null
    observed: number
    baseline: number | null
  }[] | null
}

/// `GET /tenants/{slug}/operations/outcomes` — the approved asks' report
/// card for the trailing window.
export type OpsOutcomes = {
  window_days: number
  actions: ActionOutcomeLine[]
  /// Kind-folded view of the same actions, added by the control-plane proxy.
  /// Absent on builds that predate it — the caller falls back to `actions`.
  groups?: OutcomeGroup[]
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
  /** Contacts whose last message is theirs — positive first, then the
   *  longest wait. Absent from an upstream that predates it. */
  waiting_on_you?: WaitingReply[]
  summary: {
    needs_human_count: number
    auto_positive_count: number
    auto_declined_count: number
    auto_do_not_contact_count: number
    pending_count: number
    waiting_on_you_count?: number
  }
}

/** One contact who answered and has not heard back since. */
export type WaitingReply = {
  target_id: string
  display_name: string
  target_kind: string
  disposition: string
  /** Their answer in the source's own words (a sheet's result column). */
  reply_label: string | null
  replied_at: string
  /** The act's last message to them, before the answer; null when the log
   *  holds none. */
  last_written_at: string | null
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
  proposed_fee_minor: number | null
  proposed_currency: string | null
  proposed_opportunity_id: string | null
  confidence_basis_points: number
  matched_rules: string[]
  classified_at: string
}

export type NegotiationsView = {
  live: NegotiationEntry[]
  settled: NegotiationEntry[]
}

export type NegotiationEntry = {
  opportunity_id: string
  title: string
  organization: string
  contact_email: string | null
  opportunity_kind: string
  opportunity_status: string
  state: string
  currency: string
  /** What the promoter has on the table right now. */
  offered_fee_minor: number
  /** The frozen ladder: below walk_away the answer is no. */
  walk_away_minor: number
  target_minor: number
  opening_ask_minor: number
  /** Which input produced the walk-away — cost, market, counterparty_history. */
  floor_basis: string
  prior_fee_minor: number | null
  market_floor_minor: number | null
  /** The agent's last ask, and how many it has made. */
  countered_fee_minor: number | null
  counter_rounds: number
  responds_by: string
  settled_at: string | null
  settled_reason: string | null
  /** The move parked in awaiting_approval — a drafted counter or accept. */
  pending_move: {
    action_id: string
    kind: string
    amount_minor: number | null
    round: number
  } | null
}

// --- Opportunity scout shortlist ---

export type OpportunityShortlistEntry = {
  opportunity_id: string
  kind: string
  source: string
  external_key: string
  title: string
  organization: string
  /** The link the finding stands on; null means it was never checkable. */
  destination_url: string | null
  source_observed_at: string | null
  deadline: string | null
  status: string
  /** Why a terminal row closed; null while the row is live. */
  status_reason: string | null
  eligible: boolean
  /** Money stays null when unknown — never 0, which would read as "free". */
  expected_fee_minor: number | null
  estimated_cost_minor: number | null
  application_fee_minor: number | null
  /** The row's own ISO currency for those amounts. */
  currency: string
  fit_basis_points: number
  reputation_basis_points: number
  confidence_basis_points: number
  /** Why the row cannot be worked right now, when it cannot. */
  stale_reason: string | null
  latest_decision_id: string | null
  latest_decision_kind: string | null
  latest_decision_disposition: string | null
  /** True when the cost figure came from the tour-economics engine. */
  costed_from_logistics: boolean
}

export type OpportunityShortlist = {
  generated_at: string
  entries: OpportunityShortlistEntry[]
  stale_count: number
  closed_count: number
  ineligible_count: number
  /** Sections that could not be read this time. */
  degraded: string[]
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

/// One stored probe result per (provider, model) from the agent service's
/// health checker. `status` is `ok`, `degraded` (reachable but refusing —
/// rate limits, auth failures) or `down` (unreachable / 5xx); `cooldown`
/// rows are written when a model is parked after repeated failures, and
/// `disabled` means the failure needs a human (dead key, archived/EOL model
/// id, unpaid tier) — the ticker probes those at most once a day.
export interface AgentProviderHealth {
  provider: string
  model_id: string
  status: string
  requests_remaining: number | null
  last_checked_at: string
  last_error: string | null
  latency_ms: number | null
}

/// GET /agents/health — the agent service's `/health/providers` answer: the
/// stored probe rows plus the full model catalog so every known model can be
/// placed next to its health reading.
export interface AgentHealthResponse {
  models: Array<{
    id: string
    provider: string
    name: string
    context_window: number
    best_for: string
    requires_key: boolean
    paid: boolean
  }>
  health: AgentProviderHealth[]
}

/// One reliability alert the agent service rolled up for the ops dashboard:
/// a failed task, a dead webhook delivery or a down provider.
export interface AgentServiceAlert {
  severity: 'critical' | 'warning' | 'info' | string
  category: string
  message: string
  detail?: unknown
  occurred_at?: string
}

/// GET /agents/health/alerts — the service's own "what is broken right now"
/// answer, sorted by recency upstream.
export interface AgentHealthAlertsResponse {
  alert_count: number
  alerts: AgentServiceAlert[]
}

export interface PremiumModel {
  id: string
  provider: string
  name: string
  best_for: string
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
  /** The first screen's reads — absent on an older control plane. */
  growth_metrics?: GrowthMetricTrendsResponse | null
  acquisition_sources?: AcquisitionSources | null
  signal?: SignalOverview | null
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
  /// Over the people who stayed — read it beside `departed`, or a channel
  /// that lost most of its arrivals can show a perfect rate over the rest.
  activation_basis_points: number | null
  best_action: string | null
  /// Arrived through this channel, then left (unsubscribed or suppressed).
  /// Optional: an older CrowdRelay does not report it, and absent is not zero.
  departed?: number
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
    departed?: number
  }>
  [key: string]: unknown
}

/** One row of the brain's fan-growth attribution — the per-template or
 * per-strategy accounting `attribute_fan_growth` computes and the worker
 * snapshots once per cycle. `incremental_fans` is the counterfactual-adjusted
 * count; `durable_fans` the 30-day survivors. A template with observations
 * and zero incremental fans is ineffective, not untested. */
export type TemplateAttribution = {
  template_id: string
  observed_fans: number
  incremental_fans: number
  durable_fans: number
  observations: number
  mean_observed_fans: number
  mean_incremental_fans: number
  best_quality: string
  [key: string]: unknown
}

export type StrategyAttribution = {
  strategy: string
  observed_fans: number
  incremental_fans: number
  observations: number
  mean_incremental_fans: number
  [key: string]: unknown
}

export type QualityAttribution = {
  quality: string
  incremental_fans: number
  observations: number
  [key: string]: unknown
}

export type FanGrowthAttribution = {
  total_observed_fans: number
  total_incremental_fans: number
  total_durable_fans: number
  resolved_observations: number
  partial_observations: number
  by_template: TemplateAttribution[]
  by_strategy: StrategyAttribution[]
  by_quality: QualityAttribution[]
  [key: string]: unknown
}

/** One CUSUM regime shift over the daily North Star series, with its civil
 * date resolved at write time — the detector's own `timestamp` is an
 * observation index, never a date. `pre_mean`/`post_mean` are fans-per-day
 * rates on each side of the shift. A shift says *when* the rate changed,
 * never *why*. */
export type NorthStarShift = {
  date: string
  direction: 'upward' | 'downward'
  pre_mean: number
  post_mean: number
  shift_size: number
  magnitude: number
  [key: string]: unknown
}

export type FanSourceSnapshot = {
  captured_at: string
  total_observed_fans: number
  total_incremental_fans: number
  total_durable_fans: number
  resolved_observations: number
  attribution: FanGrowthAttribution
  north_star_shifts: NorthStarShift[]
  [key: string]: unknown
}

export type FanSourcesResponse = {
  snapshots: FanSourceSnapshot[]
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
  /** `draft` is a show on the books but not announced — the list keeps it
   *  visible so it never reads as live by accident. */
  status: 'draft' | 'published' | 'cancelled' | 'completed'
  /** Added with the Shows remaster; absent on an older CrowdRelay. */
  city?: string | null
  /** The registry room a mark ties the night to — preferred over `venue`,
   *  which has carried tour names and titles. */
  room?: string | null
  capacity?: number | null
  /** Null when the night has no active ticket sale — unmeasured, not zero. */
  tickets_sold?: number | null
  tickets_7d?: number | null
  interested?: number
  /** Door QR campaigns on record; 0 means the room was never measured. */
  door_campaigns?: number
}

export type TenantShowsResponse = {
  events: TenantShow[]
}

/** `POST /tenants/{slug}/shows` — a night typed in by hand. City is a pair:
 * `city_name` + `city_country_code` arrive together or not at all; `publish`
 * false keeps the show off the public site while every internal surface
 * (checklists, gig planning, the T+7 report) already sees it. */
export type ShowCreateInput = {
  title: string
  starts_at: string
  doors_at?: string | null
  ends_at?: string | null
  venue?: string | null
  venue_address?: string | null
  city_name?: string | null
  city_country_code?: string | null
  city_region?: string | null
  timezone?: string | null
  ticket_url?: string | null
  publish?: boolean
}

/** What upstream answers — the minted slug is the link target. */
export type ShowCreateResult = {
  event_id: string
  slug: string
  status: string
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
    /** The catalogue city's name; absent on an older CrowdRelay. */
    city?: string | null
    /** Fans who asked to be told about this night. */
    interested?: number
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

// ── The show's approve-once growth ladder (P.4) ─────────────────────────

/** One rung of the ladder — the autopilot action the rung released, parks
 * or already ran. `lever` is the stable snake_case key; the briefing is the
 * same render the approval screen shows. */
export type ShowLadderRung = {
  action_id: string
  lever: string
  action_kind: string
  status: 'awaiting_approval' | 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled'
  available_at: string
  approval_expires_at: string | null
  /** `operator:show_ladder` means the approve-once path released it; a member
   *  name means an individual approval; null while it still waits. */
  approved_by: string | null
  briefing: ActionBriefing | null
}

export type ShowGrowthLadderView = {
  event_id: string
  title: string
  starts_at: string
  event_status: string
  /** `approved` while a live approval exists, `revoked` once the newest row
   *  is closed, `none` when the operator was never asked. */
  ladder_state: 'approved' | 'revoked' | 'none'
  approved_at: string | null
  approved_by: string | null
  revoked_at: string | null
  rungs: ShowLadderRung[]
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
  /** The night the door belongs to. `tickets_sold` is null when the night
   *  has no active ticket sale — unticketed is unmeasured, not zero. */
  event?: {
    title: string
    city: string | null
    starts_at: string
    capacity: number | null
    tickets_sold: number | null
    interested: number
  }
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
  /** The tenant's next announced night — where "next time" points. The
   *  field is absent on an API that predates it, null when nothing is
   *  announced. */
  next_show?: { slug: string; title: string; city: string | null; starts_at: string } | null
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
    /** The canonical city id — what an admit action needs to place a
        beacon there. */
    city_id: string | null
  }
  degraded: Array<
    'city' | 'press' | 'rooms_and_promoters' | 'communities' | 'cold_rooms' | 'bill_mates' | 'venue_channel' | 'photographers'
  >
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
    /** P.6 — the address's cross-tenant reply record; null = not measured. */
    counterparty_prior: CounterpartyPrior | null
    /** P.6 — the linked room's play record; null when not venue-linked. */
    venue_prior: VenuePrior | null
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
    /** P.6 — the room's play record across every tenant; null = not
        measured. Cold for this band is not cold for the registry. */
    venue_prior: VenuePrior | null
  }>
  /** The other bands on this bill who are not tenants — names, not
      addresses. `on_roster` means a beacon already carries them. */
  bill_mates: Array<{
    act_slug: string
    act_name: string
    position: number
    /** `peer` resolved to the registry; `unclaimed` not yet. Tenant acts
        are omitted — the crossbill edge is already their channel. */
    resolution: 'peer' | 'unclaimed' | string
    on_roster: boolean
    /** Bills shared with this band, tonight included. */
    shared_bills: number
  }>
  /** The room the show is in — the venue's own channel. `venue_id` null
      when the registry has not resolved the name yet. */
  venue_channel: {
    venue_id: string | null
    display_name: string
    /** A venue-kind beacon in this city already names this room. */
    on_roster: boolean
    /** The room's cross-tenant play record — null when unmatched or
        the read did not run. */
    venue_prior: VenuePrior | null
  } | null
  /** Photographer beacons in the show's city, warmest first. */
  photographers: Array<{
    id: string
    display_name: string
    verified: boolean
    relationship_score: number
    /** The governor remembers a touch — the band has written before. */
    contacted_before: boolean
  }>
  /** Sections that hit the shortlist cap — "40 shown" is not "40 exist". */
  truncated: string[]
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

// ── The show page read model ────────────────────────────────────────────
// `GET /tenants/{slug}/shows/{eventSlug}/model` — the page's whole read
// side in one server-side fan-out. `timeline` is the spine: it is always
// present on a 200, because a page with no show is a failed request, not a
// partial one. Every panel's section is independently degraded — `null`
// means "couldn't check", `degraded`/`sections` name which and why.
// `shared_night` only exists when the venue registry linked a night: an
// unlinked show is absent, not degraded.
export type TenantShowPageSection =
  | 'timeline'
  | 'helpers'
  | 'growth_ladder'
  | 'economics'
  | 'tour_economics'
  | 'shared_night'

export type TenantShowPageModel = {
  id: string
  timeline: TenantShowTimelineResponse
  helpers: TenantShowHelpersResponse | null
  growth_ladder: ShowGrowthLadderView | null
  economics: ShowEconomicsResponse | null
  tour_economics: TourEconomicsSummary | null
  shared_night?: SharedNight | null
  degraded: TenantShowPageSection[]
  sections: SectionVerdicts
  freshness: SectionFreshnessMap
  fetchedAt: string
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
  // Consent and identity flags — optional because older deployments did not
  // send them; `undefined` reads as "not blocked" so the UI never invents a
  // refusal the mint did not make.
  verified?: boolean
  acceptsOutreach?: boolean
  doNotContact?: boolean
  relevanceBasisPoints?: number
  relationshipScore?: number
  destinationUrl?: string | null
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

/// One standing grant as the operator reads it back — "this target may act
/// without a per-action approval". Granted through the approve flow's
/// `remember` opt-in; revoked rows stay listed with their stamps so "which
/// of these did we turn off, and when" stays answerable.
export type StandingApproval = {
  action_kind: string
  target_key: string
  action_class: string
  granted_by: string
  granted_at: string
  expires_at: string
  revoked_at: string | null
  revoked_by: string | null
  note: string | null
}

/// A screened booking agent as the band sees it — the contact address is
/// deliberately absent (the platform brokers the send). `approach_pending`
/// means a season letter is already queued or awaiting approval.
export type BookingAgent = {
  agent_id: string
  name: string
  agency?: string
  roster_url?: string
  genres: string[]
  active: boolean
  do_not_contact: boolean
  route_verified: boolean
  approached_at?: string
  refused_until?: string
  approach_pending: boolean
  /// An answer to their reply already sits on the approval board.
  reply_pending?: boolean
  /// An answerable reply (`received`/`positive`/`signed`) nobody has
  /// answered — the row's draft affordance keys off this.
  awaiting_reply?: boolean
  reply_waiting_at?: string
  reply_waiting_disposition?: string
  version: number
}

/// The season's draw readings the agent gate floors are applied against —
/// the workspace's own 12-month numbers, `null` when the read could not
/// run. `undefined` means the upstream predates the field.
export type BookingAgentDrawEvidence = {
  shows_played_12m?: number | null
  paid_tickets_12m?: number | null
  distinct_buyers_12m?: number | null
  repeat_buyers_12m?: number | null
  cities_reached_12m?: number | null
  best_show_paid_tickets_12m?: number | null
  as_of?: string | null
}

/// The floors the approach gate applies — published beside the evidence so
/// the batch view can say whether a letter would clear today.
export type BookingAgentDrawFloors = {
  shows_played_12m: number
  paid_tickets_12m: number
  distinct_buyers_12m: number
}

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
  /// Discovery channels that produced nothing lately — serialized by the
  /// tenant's CyclePreview (camelCase), surfaced by the brief as silence.
  discoveryChannelsSilent?: string[]
  /// What the brain expects the top-priority workflow to add.
  topTemplateProjectedIncrementalFans?: number
  topTemplateProjectedConfidence?: number
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
  /** The canonical city id — preferred over the slug, whose resolution
      reads a fan-signal snapshot foreign and low-signal cities lack. */
  cityId?: string
  citySlug?: string
  /** Optimistic-concurrency version for edits; omitted (→ 0) for creates. */
  expectedVersion?: number
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
  /// Counts whose source section the tenant does not publish are null —
  /// named in `notReported` — never a zero nobody measured.
  needsYou: number | null
  awaitingApproval: number | null
  openFindings: number | null
  criticalAlerts: number | null
  deadDeliveries: number | null
  /// Drafted posts waiting for a person to publish, summed across channels.
  /// null when the tenant does not report the queue — not the same as zero.
  unpublishedDrafts: number | null
  /// Per-channel breakdown behind `unpublishedDrafts`, for the card detail.
  unpublishedDraftChannels: { channel: string; drafts: number; oldest_drafted_at: string | null }[] | null
  /// Sections the tenant does not publish — the attention snapshot's
  /// placeholders, named so the row can say "not reported" instead of a
  /// substituted zero.
  notReported: string[]
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
  /// Every count is null when the tenant's snapshot omitted the field —
  /// an unanswered queue is not an empty queue.
  queuedActions: number | null
  processingActions: number | null
  succeeded24h: number | null
  failed24h: number | null
  unknownActions: number | null
  /// null when the tenant did not say — never a fabricated "off".
  runtimeEnabled: boolean | null
  releaseLedger: unknown | null
}

/// Per-tenant learning projection in the command center.
export type CommandCenterTenantLearning = {
  available: boolean
  totalOutcomes: number | null
  admitted: number | null
  rejected: number | null
  totalDecisions: number | null
}

/// Per-tenant outcomes projection in the command center.
export type CommandCenterTenantOutcomes = {
  available: boolean
  resolved: number | null
  unknown: number | null
  waitingForObservation: number | null
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
  met: number | null
  onTrack: number | null
  behind: number | null
  missed: number | null
  unmeasurable: number | null
  /// The objectives actually in trouble, soonest deadline first (max 3).
  atRisk: {
    platform: string | null
    metricKey: string | null
    observedValue: number | null
    targetValue: number | null
    deadline: string | null
    state: string | null
  }[] | null
}

/// One tenant's contribution to the command center.
export type CommandCenterTenantSummary = {
  slug: string
  displayName: string
  runtimeHealth: 'healthy' | 'degraded' | 'stale' | 'unknown'
  available: boolean
  /** Enabled notifier channels — zero means events drop silently at fanout. */
  enabledNotifierChannels: number
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
    notificationOutbox: {
      dead7d: number
      overduePending: number
    }
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
   *  because-list sentence, `insufficient_evidence` the honest refusal,
   *  `closed` a room on record as shut. `not_assessed` is the degraded
   *  read — the tenant's own facts could not be loaded, so no verdict is
   *  claimed rather than a confident wrong one. */
  assessment: 'worth_contact' | 'insufficient_evidence' | 'closed' | 'not_assessed'
  /** The one-sentence answer in the tenant's crew locale. */
  assessment_sentence: string
  /** Resolved room facts, each won by its best provenance — null when no
   *  source has claimed one. The genres are a ", "-joined tag list. */
  genres_fact?: string | null
  address_fact?: string | null
  website_fact?: string | null
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
  /** The first line of the letter an approval would queue — computed upstream
   *  by the plan's own opening_line(), so the screen reads the same words the
   *  promoter would. The approve-with-edit box pre-fills it. */
  opening_line: string
  /** Who to write to, strongest relationship first. Upstream emits
   *  PromoterContact objects — `{key}` is the booking-target identity, `name`
   *  is who the band reads. */
  contact: { key: string; name: string }[]
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
  /** The act's declared style, or null when the band has not declared one. */
  act_style: string | null
  /** Whether an executor can actually send the letter today — when false the
   *  approve button must not pretend otherwise. */
  can_send: boolean
  /** The sentence to show when can_send is false. */
  send_blocked_reason: string | null
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

// ---------------------------------------------------------------------------
// Intelligence brief — the "are we getting anywhere" story in one read.
// ---------------------------------------------------------------------------

/// Whether the machinery that runs the brain is alive. Full WorkerSummary —
/// the intelligence brief gets the whole liveness picture, not the
/// `lease_age_seconds` subset the ops summary projects.
export type WorkerVitals = {
  lease_age_seconds: number
  alive: boolean
  /// Seconds since an autopilot cycle last finished. 999999 = never has.
  cycle_age_seconds: number
  /// Seconds since a decision was last evaluated. 999999 = never has.
  decision_age_seconds: number
  /// Fresh lease but no finished cycle in 30min — the crash-loop signal.
  crash_looping: boolean
}

/// One community the brain wants to post to and cannot — nobody joined it.
export type BlockedCommunity = {
  community: string
  member_count: number | null
  discovered_at: string | null
}

/// The brain's own verdict, and — when it chose to do nothing — its reason.
///
/// Field names are snake_case because the tenant emits them that way and the
/// Control Plane passes the object through wholesale: a field the tenant adds
/// reaches this page without a matching Control Plane deploy.
export type BrainSelfAssessment = {
  /// `improving`, `learning`, `stagnant`, `regressing`, or `initializing`.
  state: string
  /// True only for `regressing` and `stagnant` — the verdicts that ask for a
  /// person. A flat young system is `learning`, not a fault.
  needs_attention?: boolean
  /// Distinct days of North Star readings behind the verdict.
  days_observed?: number
  /// Consecutive finished cycles that produced no actions, counting back from
  /// the latest. The count is what makes a silent brain legible: quiet since
  /// the last check and quiet for three days straight are different things.
  quiet_cycles?: number
  /// Why the most recent quiet cycle stayed quiet, in the brain's own words
  /// ("WAIT wins: VOI=0.85 > best_action_value=0.00"). The system may do
  /// nothing — this is where it says so. Absent when no quiet cycle has a
  /// recorded reason — the cycle is acting, or it predates the field.
  latest_wait_reason?: string | null
}

/// One channel's backlog of drafted-but-unpublished posts.
export type UnpublishedDraftChannel = {
  channel: string
  drafts: number
  oldest_drafted_at: string | null
}

/// One read answering "is the brain working, what mode, what found, what
/// plan, what needs you, what it did, what came of it."
///
/// Every field is a fact or a count — the human-language narrative is
/// derived from them at read time, never stored.
export type IntelligenceBrief = {
  worker: WorkerVitals
  brain: BrainSelfAssessment
  posture: GrowthPostureView
  cycle: CyclePreview
  chief_of_staff: AutopilotChiefOfStaff
  /// Pending approvals, excluding community-relay batch deliveries — the
  /// In motion view owns those, so the operator is not asked twice.
  needs_you: PendingActionSummary[]
  awaiting_approval: number
  /// Communities the brain wants but cannot reach.
  blocked_communities: BlockedCommunity[]
  /// Finished work nobody published.
  unpublished_drafts: UnpublishedDraftChannel[]
  /// What the weekly join-ask needs from a person before it can run at all.
  ///
  /// Optional: a CrowdRelay that predates the field does not publish it, and
  /// an absent list is not an empty one — absent means "this tenant does not
  /// report setup gaps", which is not the same fact as "there are none". The
  /// panel must not claim the loop is ready on the strength of a missing key.
  join_ask_readiness?: JoinAskGap[]
}

/// One prerequisite the weekly join-ask is waiting on, named with its remedy.
///
/// Fullest when the tenant is newest: this is the cold-start list, and every
/// other field on the brief reads empty for a workspace nobody has set up —
/// which is also what a healthy idle tenant looks like.
export type JoinAskGap = {
  /// The platform this stops. Absent when it stops every platform at once:
  /// the words and the destination are written per tenant, not per channel.
  platform?: string
  /// Stable machine-readable reason, matching the cycle report's holds.
  reason: string
  /// What a person does about it.
  remedy: string
}

/** `GET /tenants/{slug}/views/cities/{city}` — the city page's first screen
 *  in one read. `funnel` is null when no fan named the city, `verdict` null
 *  when the planner did not consider it; both are answers, not failures. */
export type CityViewModel = {
  city_slug: string
  funnel: CityFunnelRow | null
  rooms: CityVenueRow[]
  verdict: {
    proposed: boolean
    reason: string | null
    /** Fans who asked to hear about a show here; null = cannot be measured. */
    reachable: number | null
    /** The audience a show needs; present only when that bar is the reason. */
    floor: number | null
  } | null
  shows: CityViewShow[]
  last_show: (CityViewShow & {
    /** Null without a ticket sale for the night. */
    paid_buyers: number | null
    ticket_clicks: number
    interested: number
    /** Null without a door campaign — the room was not measured. */
    checkins: number | null
  }) | null
}

export type CityViewShow = {
  slug: string
  title: string
  venue: string | null
  starts_at: string
  status: string
}

/** `GET /tenants/{slug}/views/content-material` — the material page's first
 *  screen. "Usable" is active and not past `expires_at`; a use is one
 *  content-supply action taken on the source. */
export type ContentMaterialView = {
  total: number
  usable: number
  used: number
  uses_total: number
  newest: { source_id: string; kind: ContentSourceKind; platform: string; title: string; occurred_at: string } | null
  by_kind: Array<{
    kind: ContentSourceKind
    total: number
    usable: number
    used: number
    uses: number
    /** Songs counted once per title rather than per single/EP/album copy —
     *  a title fold, so the page says "about". */
    distinct_titles: number
    oldest_unused_at: string | null
    newest_unused_at: string | null
  }>
  recent: Array<{
    source_id: string
    kind: ContentSourceKind
    platform: string
    title: string
    occurred_at: string
    expires_at: string
    usable: boolean
    uses: number
    last_used_at: string | null
  }>
}

/** `GET /tenants/{slug}/in-motion/model` — the In motion page in one read:
 *  relay runs, the autopilot overview and the intelligence brief, each a
 *  section that degrades on its own. */
export type TenantInMotionModel = {
  id: string
  relays: RelayProcessRuns | null
  autopilot: AutopilotOverview | null
  intelligence: IntelligenceBrief | null
  degraded: string[]
  sections: SectionVerdicts
  fetchedAt: string
}

/** `GET /tenants/{slug}/content/model` — the Content page in one read: the
 *  drafting pipeline and the recent delivery results (upstream's
 *  `{ results }` envelope), each a section that degrades on its own. */
export type TenantContentModel = {
  id: string
  pipeline: ContentPipeline | null
  delivery_results: { results: DeliveryResult[] } | null
  degraded: string[]
  sections: SectionVerdicts
  fetchedAt: string
}
