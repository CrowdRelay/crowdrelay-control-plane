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
  brandingPalette: Palette | null
  synesthesiaEnabled: boolean
  createdAt: string
  updatedAt: string
}

export type RuntimeHealth = 'healthy' | 'degraded' | 'stale' | 'unknown'

export type TenantSummary = Tenant & { runtime: RuntimeStatus | null; runtimeHealth: RuntimeHealth }

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
