import { createSignal } from 'solid-js'

// Re-authentication flow for destructive mutations from mobile sessions.
//
// Mobile sessions get a 2h TTL, but a lost phone with a live session can
// still approve outreach or flip flags. When the frontend detects a
// destructive mutation from a mobile session, it proactively opens the
// re-auth modal. The operator enters their password, the frontend calls
// POST /auth/reauth to prove the human is still the account owner, and
// only then sends the mutation.
//
// This is a global signal so any component can trigger the flow without
// prop-drilling. The Shell renders the modal once.

export type PendingMutation = {
  resolve: () => void
  reject: (error: unknown) => void
  description: string
}

const [reauthPending, setReauthPending] = createSignal<PendingMutation | null>(null)
const [reauthError, setReauthError] = createSignal('')
const [reauthBusy, setReauthBusy] = createSignal(false)

export const reauthState = {
  pending: reauthPending,
  error: reauthError,
  busy: reauthBusy,
  clear() {
    setReauthPending(null)
    setReauthError('')
    setReauthBusy(false)
  },
}

/// Request re-authentication before a destructive mutation. Returns a
/// promise that resolves when the operator has successfully re-authed, or
/// rejects if they cancel or the password is wrong.
export function requireReauth(description: string): Promise<void> {
  return new Promise((resolve, reject) => {
    setReauthError('')
    setReauthPending({ resolve, reject, description })
  })
}

/// Called by the ReauthModal when the operator submits their password.
export async function submitReauth(password: string): Promise<boolean> {
  const pending = reauthPending()
  if (!pending) return false
  setReauthBusy(true)
  setReauthError('')
  try {
    await api.reauth(password)
    setReauthBusy(false)
    setReauthPending(null)
    pending.resolve()
    return true
  } catch (error) {
    setReauthBusy(false)
    setReauthError(error instanceof Error ? error.message : 'Re-authentication failed')
    return false
  }
}

/// Called by the ReauthModal when the operator cancels.
export function cancelReauth() {
  const pending = reauthPending()
  if (pending) pending.reject(new Error('Re-authentication cancelled'))
  setReauthPending(null)
  setReauthError('')
  setReauthBusy(false)
}

// Import api lazily to avoid a circular dependency at module load time.
import { api } from './api'
