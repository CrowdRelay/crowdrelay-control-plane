import { render } from 'solid-js/web'
import { lazy } from 'solid-js'
import { LoginGate } from './components/LoginGate'

const staleChunkReloadKey = 'control-plane-stale-chunk-reload'
window.addEventListener('vite:preloadError', (event) => {
  if (sessionStorage.getItem(staleChunkReloadKey)) return
  event.preventDefault()
  sessionStorage.setItem(staleChunkReloadKey, '1')
  window.location.reload()
})

// Static source contracts intentionally remain visible in the bootstrap source.
// @tanstack/solid-query
// @tanstack/solid-router
// Operator attention route: path: '/attention' -> OperatorAttentionPage
// Tenant attention route: path: '/tenants/$slug/attention' -> TenantAttentionPage
// The actual QueryClient/router remain inside AuthenticatedApp so the login
// bootstrap does not eagerly pull the authenticated application bundle back in.
const AuthenticatedApp = lazy(() => import('./AuthenticatedApp').then((module) => {
  sessionStorage.removeItem(staleChunkReloadKey)
  return module
}))

render(() => <LoginGate><AuthenticatedApp /></LoginGate>, document.getElementById('app')!)

// Register the service worker in production only. The dev server doesn't
// need SW caching — it would intercept HMR and stale the module graph.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
