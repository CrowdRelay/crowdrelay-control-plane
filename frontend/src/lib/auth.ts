import { createSignal } from 'solid-js'

const STORAGE_KEY = 'crowdrelay-control-plane-token-v1'
const [token, setTokenSignal] = createSignal(sessionStorage.getItem(STORAGE_KEY) ?? '')

export const adminToken = token
export function setAdminToken(value: string) {
  const next = value.trim()
  setTokenSignal(next)
  if (next) sessionStorage.setItem(STORAGE_KEY, next)
  else sessionStorage.removeItem(STORAGE_KEY)
}
