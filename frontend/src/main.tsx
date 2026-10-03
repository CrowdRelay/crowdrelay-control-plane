import { render } from 'solid-js/web'
import { lazy, type JSX } from 'solid-js'
import { ColorModeProvider, ColorModeScript, createLocalStorageManager } from '@kobalte/core'
import { LoginGate } from './components/LoginGate'
import './styles/tailwind.css'

const staleChunkReloadKey = 'control-plane-stale-chunk-reload'
window.addEventListener('vite:preloadError', (event) => {
  // The marker is the loop guard: without it every reload re-fails the same
  // chunk and reloads again forever. Storage blocked => no guard => do not
  // auto-reload; leave the stale page for a manual refresh.
  let marked = false
  try {
    if (sessionStorage.getItem(staleChunkReloadKey)) return
    sessionStorage.setItem(staleChunkReloadKey, '1')
    marked = true
  } catch { /* storage unavailable */ }
  if (!marked) return
  event.preventDefault()
  window.location.reload()
})

// Static source contracts intentionally remain visible in the bootstrap source.
// @tanstack/solid-query
// @tanstack/solid-router
// Operator attention route: path: '/attention' -> redirects to '/'
// Tenant attention route: path: '/tenants/$slug/attention' -> TenantAttentionPage
// The actual QueryClient/router remain inside AuthenticatedApp so the login
// bootstrap does not eagerly pull the authenticated application bundle back in.
const AuthenticatedApp = lazy(() => import('./AuthenticatedApp').then((module) => {
  try { sessionStorage.removeItem(staleChunkReloadKey) } catch {}
  return module
}))

// Style guide: dev server on localhost only. `import.meta.env.DEV` is a
// compile-time constant, so a production build drops this branch and never
// emits the page's chunk. It renders outside the login gate because it shows
// primitives only and issues no queries.
const isLocalStyleGuide = import.meta.env.DEV
  && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  && ['/styleguide', '/style-guide'].includes(window.location.pathname.replace(/\/$/, ''))

// The organiser's night link: `/nights/{tenant}/{token}` — a bearer-token
// read a workspace on the bill minted for its promoter (4V.6b). Renders
// outside the login gate for the same reason the styleguide does: the token
// is the whole credential and there is no session to gate on.
const nightMatch = window.location.pathname.match(/^\/nights\/([a-z0-9_-]+)\/([0-9a-f-]{36})\/?$/)
const PublicNightPage = nightMatch ? lazy(() => import('./pages/PublicNightPage')) : null

// Light / dark / system, stored in localStorage. Kobalte stamps
// `data-kb-theme` on <html>, which the theme's `dark` variant keys on.
const colorModeStorage = createLocalStorageManager('control-plane-color-mode')
const WithColorMode = (props: { children: JSX.Element }) => (
  <>
    <ColorModeScript storageType={colorModeStorage.type} storageKey="control-plane-color-mode" />
    <ColorModeProvider storageManager={colorModeStorage} disableTransitionOnChange>{props.children}</ColorModeProvider>
  </>
)

if (isLocalStyleGuide) {
  const StyleGuidePage = lazy(() => import('./pages/styleguide/StyleGuidePage'))
  render(() => <WithColorMode><StyleGuidePage /></WithColorMode>, document.getElementById('app')!)
} else if (nightMatch && PublicNightPage) {
  const slug = nightMatch[1]!
  const token = nightMatch[2]!
  render(() => <WithColorMode><PublicNightPage slug={slug} token={token} /></WithColorMode>, document.getElementById('app')!)
} else {
  render(() => <WithColorMode><LoginGate><AuthenticatedApp /></LoginGate></WithColorMode>, document.getElementById('app')!)
}

// Register the service worker in production only. The dev server doesn't
// need SW caching — it would intercept HMR and stale the module graph.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
