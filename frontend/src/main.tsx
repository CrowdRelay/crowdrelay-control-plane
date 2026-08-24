import { render } from 'solid-js/web'
import { lazy } from 'solid-js'
import { LoginGate } from './components/LoginGate'
import './styles.css'
import './ui-overrides.css'

// Static source contracts intentionally remain visible in the bootstrap source.
// @tanstack/solid-query
// @tanstack/solid-router
// The actual QueryClient/router remain inside AuthenticatedApp so the login
// bootstrap does not eagerly pull the authenticated application bundle back in.
const AuthenticatedApp = lazy(() => import('./AuthenticatedApp'))

render(() => <LoginGate><AuthenticatedApp /></LoginGate>, document.getElementById('app')!)
