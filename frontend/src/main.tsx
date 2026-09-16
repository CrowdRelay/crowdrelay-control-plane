import { render } from 'solid-js/web'
import { lazy, type JSX } from 'solid-js'
import { ColorModeProvider, ColorModeScript, createLocalStorageManager } from '@kobalte/core'
import { LoginGate } from './components/LoginGate'
import './styles/tailwind.css'

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
// Operator attention route: path: '/attention' -> redirects to '/'
// Tenant attention route: path: '/tenants/$slug/attention' -> TenantAttentionPage
// The actual QueryClient/router remain inside AuthenticatedApp so the login
// bootstrap does not eagerly pull the authenticated application bundle back in.
const AuthenticatedApp = lazy(() => import('./AuthenticatedApp').then((module) => {
  sessionStorage.removeItem(staleChunkReloadKey)
  return module
}))

// Style guide: dev server on localhost only. `import.meta.env.DEV` is a
// compile-time constant, so a production build drops this branch and never
// emits the page's chunk. It renders outside the login gate because it shows
// primitives only and issues no queries.
const isLocalStyleGuide = import.meta.env.DEV
  && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  && window.location.pathname.replace(/\/$/, '') === '/styleguide'

// Light / dark / system, stored in localStorage. Kobalte stamps
// `data-kb-theme` on <html>, which the theme's `dark` variant keys on.
const colorModeStorage = createLocalStorageManager('control-plane-color-mode')
const WithColorMode = (props: { children: JSX.Element }) => (
  <>
    <ColorModeScript storageType={colorModeStorage.type} storageKey="control-plane-color-mode" />
    <ColorModeProvider storageManager={colorModeStorage}>{props.children}</ColorModeProvider>
  </>
)

if (isLocalStyleGuide) {
  const StyleGuidePage = lazy(() => import('./pages/StyleGuidePage'))
  render(() => <WithColorMode><StyleGuidePage /></WithColorMode>, document.getElementById('app')!)
} else {
  render(() => <WithColorMode><LoginGate><AuthenticatedApp /></LoginGate></WithColorMode>, document.getElementById('app')!)
}

// Register the service worker in production only. The dev server doesn't
// need SW caching — it would intercept HMR and stale the module graph.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
