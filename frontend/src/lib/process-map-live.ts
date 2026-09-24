// The process map's live layer — one fact per block, all of it derived
// from the tenant-brain read model the page already fetches. Stages that
// the model can answer get a live count and a detail line; nodes whose
// answer the model does not carry (sources, providers, fans…) get no fact
// at all — a blank is honest, a placeholder is not.
//
// The cycle math is not re-derived here: `brainCycleStages` is the single
// derivation, this module only maps its stages onto node ids and adds the
// facts the rail does not show (queue depth, the outbox, worker liveness).

import type { JourneyStageSpec } from '../components/Journey'
import type { TenantBrainReadModel } from './types'
import { actionStateAges, brainCycleStages } from './brain-cycle'
import { compactDuration } from './format'

export type LiveNodeFact = {
  /** The rendered number — '12', or '—' when the section did not answer. */
  value: string
  detail?: string | null
  stuck?: boolean
}

const stageValue = (stage: JourneyStageSpec | undefined): string =>
  stage?.headline ?? (stage?.count == null ? '—' : String(stage.count))

export function processMapLive(
  model: TenantBrainReadModel,
  platform: boolean,
  nowMs: number,
): { nodes: Partial<Record<string, LiveNodeFact>>; workerDown: boolean | null } {
  const byKey = new Map(brainCycleStages(model, platform, nowMs).map(s => [s.key, s]))
  const autopilot = model.autopilot
  const attention = model.attention

  const nodes: Partial<Record<string, LiveNodeFact>> = {}

  const decide = byKey.get('decide')
  const sense = byKey.get('sense')
  const authorize = byKey.get('authorize')
  const measure = byKey.get('measure')
  const learn = byKey.get('learn')

  nodes.intel = {
    value: stageValue(decide),
    detail: platform ? 'decisions this week' : 'decided this week',
    // The brain's self-assessment flags the block, not the decide count.
    stuck: sense?.stuck,
  }
  nodes.approval = {
    value: stageValue(authorize),
    detail: authorize?.detail,
    stuck: authorize?.stuck,
  }
  // The action-states aggregate answers what the queue depth cannot: how
  // long the oldest row has sat. Null when the section did not answer —
  // every fact below then reads exactly as it did without it.
  const stateAges = actionStateAges(model, nowMs)
  const queued = stateAges?.get('QUEUED')
  const queuedAge = queued && queued.count > 0 ? queued.ageSeconds : null
  nodes.auto = {
    value: autopilot === null ? '—' : String(autopilot.queued_actions),
    detail: queuedAge !== null
      ? `${platform ? 'queued' : 'lined up'} · oldest ${compactDuration(queuedAge)}`
      : platform ? 'queued' : 'lined up',
  }
  // UNKNOWN + RECONCILING — dispatched work whose outcome never came back.
  // It outranks executor failures in the detail but the stuck flag is either.
  const unknown =
    (stateAges?.get('UNKNOWN')?.count ?? 0) + (stateAges?.get('RECONCILING')?.count ?? 0)
  const executorFailed = autopilot?.executor_failed_24h ?? 0
  nodes.receipt = {
    value: autopilot === null ? '—' : String(autopilot.awaiting_executor),
    detail: unknown > 0
      ? platform ? `${unknown} unknown · reconciling` : `${unknown} we couldn't confirm`
      : executorFailed > 0
        ? platform ? `${executorFailed} executor failures 24h` : `${executorFailed} didn't go through today`
        : platform ? 'awaiting receipt' : 'waiting to hear back',
    stuck: unknown > 0 || executorFailed > 0,
  }
  // `summary` is required on the contract, so `outbox` is only undefined
  // when the whole attention section did not answer.
  const outbox = attention?.summary.outbox
  if (!outbox) {
    nodes.outbox = { value: '—' }
  } else {
    const dead = outbox.dead
    nodes.outbox = {
      value: String(outbox.pending + outbox.processing),
      detail: dead > 0
        ? platform ? `${dead} dead` : `${dead} couldn't be delivered`
        : outbox.pending > 0 && outbox.oldest_pending_seconds > 0
          ? `oldest ${compactDuration(outbox.oldest_pending_seconds)}`
          : null,
      stuck: dead > 0,
    }
  }
  nodes.metrics = { value: stageValue(measure), detail: measure?.detail }
  nodes.scorecard = { value: stageValue(learn), detail: learn?.detail }

  // `worker` is absent on older tenants — absence is not a verdict.
  const worker = attention?.summary.worker
  const workerDown = worker === undefined ? null : !worker.alive

  return { nodes, workerDown }
}
