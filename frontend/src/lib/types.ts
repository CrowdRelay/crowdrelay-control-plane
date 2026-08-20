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

export type OperationsSummary = {
  outbox: OperationsQueueSummary
  deliveries: OperationsQueueSummary
  push: OperationsQueueSummary
  watchdog: { active_alerts: number; critical_alerts: number; last_observed_at: string | null }
  http: { requests: number; errors_4xx: number; errors_5xx: number; average_ms: number; p50_ms: number; p95_ms: number }
  database: Record<string, unknown>
  area: Record<string, number>
  schema_version: number
  release: string
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
