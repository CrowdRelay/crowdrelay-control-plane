import { createSignal } from 'solid-js'
import { api, setUnauthorizedHandler } from './api'
import { queryClient } from './queryClient'
import type { Profile } from './types'

// The operator identity lives only in memory and is hydrated from the
// HttpOnly session cookie on boot. Nothing credential-shaped is ever stored
// where page JavaScript could read it: the session token itself never leaves
// the cookie jar, so there is nothing to persist and nothing to steal from
// storage. A refresh re-hydrates silently; closing the tab loses only the
// cached profile view, while the cookie keeps its server-side lifetime.
const [profile, setProfile] = createSignal<Profile | null>(null)
const [hydrated, setHydrated] = createSignal(false)

setUnauthorizedHandler(() => setProfile(null))

export const authState = {
  profile,
  hydrated,
  authenticated: () => profile() !== null,
  setProfile,
  async hydrate() {
    try {
      const profile = await api.session()
      setProfile(profile ?? null)
    } catch {
      setProfile(null)
    } finally {
      setHydrated(true)
    }
  },
  async login(username: string, password: string) {
    // A previous user's cached queries (e.g. a tenant operator's filtered
    // tenants list) must not bleed into the new session. Clear everything
    // before setting the new profile so the first query fires fresh.
    queryClient.clear()
    sessionStorage.removeItem('cp-default-tenant')
    setProfile(await api.login(username, password))
  },
  async logout() {
    try {
      await api.logout()
    } finally {
      queryClient.clear()
      sessionStorage.removeItem('cp-default-tenant')
      setProfile(null)
    }
  },
}
