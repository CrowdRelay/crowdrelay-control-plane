import { api } from './api'
import { failureLine } from './errors'
import { formatIsoUntil, formatTimestamp } from './format'
import type { AutopilotPolicy } from './types'

/** A 409 from a policy write means one of two things, and the generic
 *  "refresh and try again" copy is right for only one of them:
 *
 *   - another write landed first — a real version race; refreshing works;
 *   - the guardrail hold refused `bounded_auto` — upstream declines a direct
 *     return to Alone while `guarded_until` is still in the future, and no
 *     refresh changes that until the hold runs out.
 *
 *  The write's WHERE clause can fail only on the version match or the hold,
 *  so one refetch settles which: if the overview still reports the version we
 *  sent, nobody raced us and a held policy is the remaining cause. The editor
 *  already greys Alone while a hold is shown — this path covers the hold that
 *  landed between page load and save.
 *
 *  Not a `failureLine` caller's concern in errors.ts: that module stays
 *  dependency-free, and this diagnosis needs a live read. */
export const policySaveFailureLine = async (
  title: string,
  slug: string,
  policy: AutopilotPolicy,
  input: Pick<AutopilotPolicy, 'autonomy_level'>,
  error: unknown,
): Promise<string> => {
  const held = await guardedConflict(slug, policy, input, error)
  return held ?? failureLine(title, error)
}

const guardedConflict = async (
  slug: string,
  policy: AutopilotPolicy,
  input: Pick<AutopilotPolicy, 'autonomy_level'>,
  error: unknown,
): Promise<string | null> => {
  const e = error as { status?: number; code?: string }
  if (e.status !== 409 && e.code !== 'conflict') return null
  if (input.autonomy_level !== 'bounded_auto') return null
  try {
    const overview = await api.autopilotOverview(slug)
    const fresh = overview.policies.find(p => p.context === policy.context)
    // A moved version means somebody else wrote first — the ordinary
    // conflict copy is the honest answer for that case.
    if (!fresh || fresh.version !== policy.version) return null
    const untilMs = fresh.guarded_until ? new Date(fresh.guarded_until).getTime() : NaN
    if (!(untilMs > Date.now())) return null
    // Same version + row exists + Alone requested = the hold is what refused.
    return `The guardrail is holding it until ${formatTimestamp(fresh.guarded_until)} (${formatIsoUntil(fresh.guarded_until!)}). Save a lower level to lift the hold — Alone unlocks once it clears.`
  } catch {
    return null
  }
}
