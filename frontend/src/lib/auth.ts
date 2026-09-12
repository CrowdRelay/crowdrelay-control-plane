import { createSignal } from 'solid-js'
import { api, setUnauthorizedHandler, setReadOnlyCheck } from './api'
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
  /** Platform-level identity: admin or viewer. Sees all tenants. */
  isPlatformLevel: () => profile()?.role === 'platform_admin' || profile()?.role === 'platform_viewer',
  /** Full mutation authority. Viewer is read-only. */
  isAdmin: () => profile()?.role === 'platform_admin',
  /**
   * This account may read and nothing else.
   *
   * `platform_viewer` is the only read-only role: the `authenticate`
   * middleware refuses every non-GET it sends, before any handler runs. A
   * tenant operator writes freely inside its own tenant, so it is not this.
   *
   * The console used to leave every write control enabled for a viewer, who
   * found out what their account could do by pressing a button and reading a
   * 403. A control the session cannot use is disabled and says why.
   */
  readOnly: () => profile()?.role === 'platform_viewer',
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

// The last line of defence. A write control that nobody marked, a keyboard
// shortcut, a retry a component fires on its own — all of them end at
// `request`, and none of them reach the network on a read-only session.
setReadOnlyCheck(() => authState.readOnly())
