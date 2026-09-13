import type { AgentCredential } from './types'

// A key can be present, accepted once, and still buy nothing today: the
// account ran out of credit, the card failed, the plan hit its rate ceiling, or
// somebody rotated the key. The panel used to call all of those "Connected"
// with a green tick, so a provider that had silently stopped working looked
// exactly like one that was working.
//
// The provider's own message is the only thing that names the fix, so it is
// matched rather than replaced — and when it matches nothing, it is shown
// verbatim rather than flattened into "unavailable".
export type CredentialHealth =
  | { state: 'working' }
  | { state: 'broken'; headline: string; whatToDo: string }

export const credentialHealth = (credential: AgentCredential | undefined): CredentialHealth => {
  if (!credential) return { state: 'working' }
  const raw = (credential.last_validation_error ?? '').toLowerCase()

  if (credential.status === 'revoked') {
    return { state: 'broken', headline: 'Key was revoked', whatToDo: 'Paste a new key to start using this provider again.' }
  }

  const billing = /insufficient|quota|credit|balance|billing|payment|exceeded your current/.test(raw)
  if (billing) {
    return { state: 'broken', headline: 'Out of credit', whatToDo: 'Top up or add a payment method in the provider\'s own console. The key itself is fine.' }
  }

  const rate = /rate.?limit|too many requests|429/.test(raw)
  if (rate) {
    return { state: 'broken', headline: 'Rate limited', whatToDo: 'The plan is sending more than it allows. It usually clears on its own; raise the tier if it keeps happening.' }
  }

  const badKey = /invalid|unauthor|forbidden|401|403|authentication|api key/.test(raw)
  if (badKey || credential.status === 'invalid') {
    return { state: 'broken', headline: 'Key was rejected', whatToDo: 'The key is wrong, expired, or was rotated. Paste the current one.' }
  }

  if (raw) {
    return { state: 'broken', headline: 'Provider refused the last check', whatToDo: credential.last_validation_error! }
  }

  return { state: 'working' }
}

export const budgetPct = (spent: number, budget: number): number => {
  if (budget <= 0) return 0
  return Math.min(100, (spent / budget) * 100)
}

export const taskStatusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'completed' ? 'good' :
  status === 'running' ? 'warn' :
  status === 'failed' ? 'bad' : 'muted'

export const toneToBadgeVariant = (tone: 'good' | 'warn' | 'bad' | 'muted'): 'success' | 'warning' | 'destructive' | 'muted' =>
  tone === 'good' ? 'success' :
  tone === 'warn' ? 'warning' :
  tone === 'bad' ? 'destructive' : 'muted'
