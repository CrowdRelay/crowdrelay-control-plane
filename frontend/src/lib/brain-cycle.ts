// The brain cycle as a JourneyRail — sense → decide → authorize → act →
// measure → learn, each stage reading one section of the brain read model.
// Pure derivation: the page attaches drill-through (`onSelect`) and ticks
// `nowMs`; every number, word and timestamp comes from an endpoint field —
// a section the tenant could not answer yields `null`, which the rail
// renders '—', never 0.

import type { JourneyStageSpec } from '../components/Journey'
import type { TenantBrainReadModel } from './types'
import { ageSeconds, compactDuration, formatIsoAge, formatIsoUntil } from './format'

const WEEK_MS = 7 * 24 * 3600 * 1000

/** `action_states` parsed once for the live surfaces: state → count and the
 * age of its oldest entry in seconds (null when the row reports none or the
 * timestamp is unparseable/future). `null` when the section did not answer —
 * an older CrowdRelay without the route names itself in `degraded`. */
export function actionStateAges(
  model: TenantBrainReadModel,
  nowMs: number,
): Map<string, { count: number; ageSeconds: number | null }> | null {
  const report = model.action_states
  if (!report) return null
  const rows = new Map<string, { count: number; ageSeconds: number | null }>()
  for (const row of report.in_flight) {
    rows.set(row.state, {
      count: row.count,
      ageSeconds: row.oldest_entered_at ? ageSeconds(row.oldest_entered_at, nowMs) : null,
    })
  }
  return rows
}

// The verdict word in the band's own vocabulary. Platform sessions get the
// machine's word; an unlisted state passes through raw — it is still the
// tenant's answer, not a guess.
const BAND_VERDICT: Record<string, string> = {
  improving: 'getting better',
  learning: 'learning',
  stagnant: 'flat',
  regressing: 'slipping',
  initializing: 'starting up',
}

export function brainCycleStages(
  model: TenantBrainReadModel,
  platform: boolean,
  nowMs: number,
): JourneyStageSpec[] {
  const attention = model.attention
  const brain = attention?.brain ?? null
  const scorecard = model.scorecard
  const autopilot = model.autopilot

  // ── sense — what the brain makes of what it sees ──
  const sense: JourneyStageSpec = {
    key: 'sense',
    label: platform ? 'Sense' : 'Watching',
    stuck: brain?.needs_attention === true,
  }
  if (brain?.state) {
    sense.headline = platform ? brain.state : (BAND_VERDICT[brain.state] ?? brain.state)
  } else {
    sense.count = null
  }
  if ((brain?.quiet_cycles ?? 0) > 0) {
    const quiet = brain!.quiet_cycles!
    sense.detail = platform ? `${quiet} quiet cycles` : `quiet for ${quiet} cycles`
  } else if (scorecard?.status.last_decision_at) {
    sense.detail = `last decision ${formatIsoAge(scorecard.status.last_decision_at)}`
  }

  // ── decide — decisions evaluated this week ──
  const decideCount = model.learning === null
    ? null
    : model.learning.filter(e => {
        const t = Date.parse(e.evaluated_at)
        return !Number.isNaN(t) && nowMs - t >= 0 && nowMs - t <= WEEK_MS
      }).length

  // ── authorize — the human gate ──
  // `needs_you` absent (older tenant) or named in `not_reported` is a
  // placeholder, not an empty queue — the count stays '—'.
  const notReported = attention?.not_reported ?? []
  const needsYou = attention?.needs_you
  const authorizeCount =
    !attention || needsYou === undefined || notReported.includes('needs_you')
      ? null
      : needsYou.length
  const lapsed = attention?.lapsed_approvals ?? null
  const expiringSoon = lapsed !== null && lapsed.expiring_within_24h > 0
  let authorizeDetail: string | null = null
  if (expiringSoon) {
    const n = lapsed!.expiring_within_24h
    authorizeDetail = platform ? `${n} expire <24h` : `${n} lapse within a day`
  } else if (needsYou) {
    const soonest = needsYou
      .map(a => a.approval_expires_at)
      .filter((x): x is string => !!x)
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0]
    if (soonest) authorizeDetail = `next lapses ${formatIsoUntil(soonest)}`
  }

  // ── act — the state machine's in-flight work ──
  const actCount = autopilot === null
    ? null
    : autopilot.queued_actions + autopilot.processing_actions + autopilot.awaiting_executor

  // Time-in-stage: the oldest entry across the three states that mean "work
  // is waiting or running", plus the UNKNOWN+RECONCILING count — work whose
  // outcome the system cannot confirm. Age is shown, never judged: no
  // threshold turns waiting into stuck.
  const stateAges = actionStateAges(model, nowMs)
  let actOldest: { state: string; seconds: number } | null = null
  let actUnknown = 0
  if (stateAges) {
    for (const state of ['QUEUED', 'AUTHORIZED', 'RUNNING'] as const) {
      const row = stateAges.get(state)
      if (
        row && row.count > 0 && row.ageSeconds !== null &&
        (actOldest === null || row.ageSeconds > actOldest.seconds)
      ) {
        actOldest = { state, seconds: row.ageSeconds }
      }
    }
    actUnknown =
      (stateAges.get('UNKNOWN')?.count ?? 0) + (stateAges.get('RECONCILING')?.count ?? 0)
  }
  const act24h = autopilot === null
    ? null
    : platform
      ? `24h: ${autopilot.succeeded_24h} ok · ${autopilot.failed_24h} failed`
      : `${autopilot.succeeded_24h} done · ${autopilot.failed_24h} failed in the last day`
  let actDetail: string | null
  if (actUnknown > 0) {
    actDetail = platform
      ? `${actUnknown} unknown outcome${actUnknown === 1 ? '' : 's'}`
      : `${actUnknown} we couldn't confirm`
  } else if (actOldest) {
    const age = platform
      ? `oldest ${actOldest.state.toLowerCase()} ${compactDuration(actOldest.seconds)}`
      : `oldest waiting ${compactDuration(actOldest.seconds)}`
    actDetail = act24h ? `${age} · ${act24h}` : age
  } else {
    actDetail = act24h
  }

  // ── measure — outcomes scheduled, horizon not elapsed ──
  // `awaiting_measurement` is optional on the contract: an older tenant not
  // sending it reads '—', not 0.
  const measureCount = scorecard?.track_record.awaiting_measurement ?? null
  const nextDue = scorecard?.track_record.next_measurement_due_at

  // ── learn — beliefs the loop actually changed ──
  const learnCount = model.learning_proof?.entries.length ?? null

  return [
    sense,
    {
      key: 'decide',
      label: platform ? 'Decide' : 'Deciding',
      count: decideCount,
      detail: 'this week',
    },
    {
      key: 'authorize',
      label: platform ? 'Authorize' : 'Waiting on you',
      count: authorizeCount,
      waiting: authorizeCount ?? undefined,
      detail: authorizeDetail,
      stuck: expiringSoon,
    },
    {
      key: 'act',
      label: platform ? 'Act' : 'Doing',
      count: actCount,
      detail: actDetail,
      stuck: (autopilot?.failed_24h ?? 0) > 0 || actUnknown > 0,
    },
    {
      key: 'measure',
      label: platform ? 'Measure' : 'Checking',
      count: measureCount,
      detail: nextDue ? `next reading ${formatIsoUntil(nextDue)}` : null,
    },
    {
      key: 'learn',
      label: platform ? 'Learn' : 'Learned',
      count: learnCount,
      detail: scorecard === null
        ? null
        : platform
          ? `improved ${scorecard.track_record.improved} · worsened ${scorecard.track_record.worsened}`
          : `${scorecard.track_record.improved} helped · ${scorecard.track_record.worsened} hurt`,
    },
  ]
}
