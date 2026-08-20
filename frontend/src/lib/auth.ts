import { createSignal } from 'solid-js'

const SESSION_KEY = 'crowdrelay-control-plane.authorization'

const readSessionAuthorization = (): string | null => {
  if (typeof window === 'undefined') return null
  try {
    const value = window.sessionStorage.getItem(SESSION_KEY)
    return value?.startsWith('Basic ') ? value : null
  } catch {
    return null
  }
}

const persistSessionAuthorization = (value: string | null) => {
  if (typeof window === 'undefined') return
  try {
    if (value === null) window.sessionStorage.removeItem(SESSION_KEY)
    else window.sessionStorage.setItem(SESSION_KEY, value)
  } catch {
    // Storage can be unavailable in hardened/private browser contexts. In that
    // case the in-memory signal still works for the lifetime of the page.
  }
}

const [authorization, setAuthorization] = createSignal<string | null>(readSessionAuthorization())

export const authState = {
  authorization,
  authenticated: () => authorization() !== null,
  setBasic(username: string, password: string) {
    const bytes = new TextEncoder().encode(`${username}:${password}`)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const value = `Basic ${btoa(binary)}`
    setAuthorization(value)
    persistSessionAuthorization(value)
  },
  clear() {
    setAuthorization(null)
    persistSessionAuthorization(null)
  },
}
