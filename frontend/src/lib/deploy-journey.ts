// The tenant onboarding journey as JourneySteps — registered → deploy
// requested → deploying → reporting → healthy. One process instance (the
// tenant itself) moving through five steps, operator vocabulary only: the
// Deployment tab is platform-only.
//
// Pure derivation over fields the overview read model already carries —
// `tenant`, the newest provisioning job, the platform's capability flags.
// Nothing is fabricated: a step that cannot be evaluated stays pending,
// a deploy that never reaches `healthy` reads broken, not "unknown".

import type { JourneyStepSpec } from '../components/Journey'
import type { ProvisioningJob, TenantSummary } from './types'
import { formatIsoAge } from './format'

export function deployJourneySteps(input: {
  tenant: TenantSummary
  latestJob: ProvisioningJob | undefined
  canProvision: boolean | undefined
  provisionerConfigured: boolean | undefined
  nowMs: number
}): JourneyStepSpec[] {
  const { tenant, latestJob: job, canProvision, provisionerConfigured, nowMs } = input
  const externalDeploy = canProvision === false

  // ── deploying — the provisioning job's state machine ──
  const deploying = (): JourneyStepSpec => {
    const step = { key: 'deploying', label: 'Deploying' }
    if (!job) {
      return externalDeploy
        ? { ...step, status: 'skipped', detail: 'runs on an existing deployment' }
        : { ...step, status: 'pending' }
    }
    switch (job.status) {
      case 'succeeded':
        return {
          ...step,
          status: 'done',
          detail: job.finishedAt ? `finished ${formatIsoAge(job.finishedAt)}` : null,
        }
      case 'running': {
        // A running job whose lease already expired is not running — the
        // agent lost it or died holding it.
        if (job.leaseExpiresAt && Date.parse(job.leaseExpiresAt) < nowMs) {
          return { ...step, status: 'stuck', detail: `lease expired ${formatIsoAge(job.leaseExpiresAt)}` }
        }
        return {
          ...step,
          status: 'current',
          detail: job.startedAt ? `started ${formatIsoAge(job.startedAt)}` : null,
        }
      }
      case 'planned':
      case 'approved':
        if (provisionerConfigured === false) {
          return { ...step, status: 'stuck', detail: 'no deploy agent configured' }
        }
        return {
          ...step,
          status: 'current',
          detail: `waiting for the deploy agent since ${formatIsoAge(job.createdAt)}`,
        }
      case 'failed':
        return { ...step, status: 'stuck', detail: job.errorCode ?? 'failed' }
      case 'cancelled':
        return { ...step, status: 'pending', detail: 'cancelled' }
    }
  }

  const deployingStep = deploying()

  // ── reporting — the runtime's heartbeat after the deploy ──
  // A tenant on an existing deployment still reports: `lastHeartbeatAt`
  // is the fact, `canProvision` only decides whether a deploy was needed.
  const heartbeat = tenant.runtime?.lastHeartbeatAt ?? null
  const reporting = (): JourneyStepSpec => {
    const step = { key: 'reporting', label: 'Reporting' }
    if (heartbeat) {
      return tenant.runtimeHealth === 'stale'
        ? { ...step, status: 'stuck', detail: `last heartbeat ${formatIsoAge(heartbeat)}` }
        : { ...step, status: 'done', detail: `last heartbeat ${formatIsoAge(heartbeat)}` }
    }
    if (job?.status === 'succeeded') {
      return { ...step, status: 'stuck', detail: 'deployed but never reported' }
    }
    return { ...step, status: 'pending' }
  }
  const reportingStep = reporting()

  // ── healthy — the runtime health verdict ──
  const healthy = (): JourneyStepSpec => {
    const step = { key: 'healthy', label: 'Healthy' }
    switch (tenant.runtimeHealth) {
      case 'healthy': return { ...step, status: 'done' }
      case 'degraded': return { ...step, status: 'stuck', detail: 'degraded' }
      default:
        return reportingStep.status === 'done'
          ? { ...step, status: 'current' }
          : { ...step, status: 'pending' }
    }
  }

  return [
    {
      key: 'registered',
      label: 'Registered',
      status: 'done',
      detail: formatIsoAge(tenant.createdAt),
    },
    job
      ? {
          key: 'requested',
          label: 'Deploy requested',
          status: 'done',
          detail: formatIsoAge(job.createdAt),
        }
      : externalDeploy
        ? { key: 'requested', label: 'Deploy requested', status: 'skipped', detail: 'runs on an existing deployment' }
        : { key: 'requested', label: 'Deploy requested', status: 'current', detail: 'no deploy requested yet' },
    deployingStep,
    reportingStep,
    healthy(),
  ]
}
