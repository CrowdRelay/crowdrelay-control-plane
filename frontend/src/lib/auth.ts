import { createSignal } from 'solid-js'

const [authorization, setAuthorization] = createSignal<string | null>(null)

export const authState = {
  authorization,
  authenticated: () => authorization() !== null,
  setBasic(username: string, password: string) {
    // Keep the edge credential in memory only. Reloading deliberately requires
    // a fresh login so the browser never persists an operator password for us.
    const bytes = new TextEncoder().encode(`${username}:${password}`)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    setAuthorization(`Basic ${btoa(binary)}`)
  },
  clear() {
    setAuthorization(null)
  },
}
