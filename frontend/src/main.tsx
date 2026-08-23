import { render } from 'solid-js/web'
import { lazy } from 'solid-js'
import { LoginGate } from './components/LoginGate'
import './styles.css'
import './ui-overrides.css'

const AuthenticatedApp = lazy(() => import('./AuthenticatedApp'))

render(() => <LoginGate><AuthenticatedApp /></LoginGate>, document.getElementById('app')!)
