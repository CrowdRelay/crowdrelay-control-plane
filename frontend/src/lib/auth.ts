import { createSignal } from 'solid-js'

// A Basic Authorization header is password-equivalent. Keep it in memory only
// so a successful same-origin script execution cannot recover long-lived
// credentials from Web Storage. A full page reload intentionally requires a
// fresh sign-in until the edge is moved to a server-issued HttpOnly session.
const [authorization, setAuthorization] = createSignal<string | null>(null)

export const authState = {
  authorization,
  authenticated: () => authorization() !== null,
  setBasic(username: string, password: string) {
    const bytes = new TextEncoder().encode(`${username}:${password}`)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    setAuthorization(`Basic ${btoa(binary)}`)
  },
  clear() {
    setAuthorization(null)
  },
}
