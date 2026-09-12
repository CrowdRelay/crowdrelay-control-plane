import { authState } from './auth'

/**
 * Read-only sessions, in the interface.
 *
 * `platform_viewer` is refused every non-GET by the `authenticate` middleware,
 * before any handler runs. The console used to offer a viewer every write
 * control anyway, so the way to discover what the account could do was to press
 * a button and read a 403. Worse, the ones that opened a form let a viewer fill
 * in eight fields before the submit failed.
 *
 * The rule is exactly the backend's: if the request is not a GET, a viewer
 * cannot send it, so the control that sends it is disabled and says why. That
 * includes the handful of POSTs that only read — `runReconciliation`,
 * `areaValidate` — because what decides here is the method, not the intent.
 *
 * `Button` and `Switch` take a `writes` prop. Everything else — a raw
 * `<button>`, a select, a text field feeding a mutation — spreads `writeGuard()`
 * last, so it overrides that control's own `disabled` only when it applies.
 */

/** One sentence, one place. Every disabled write control says the same thing. */
export const READ_ONLY_REASON = 'This account can only read. Ask a platform admin to make the change.'

/** True when the signed-in account may read and nothing else. */
export const readOnly = () => authState.readOnly()

/** Props for a control that writes. Spread last. */
export const writeGuard = (): { disabled?: true; title?: string } =>
  readOnly() ? { disabled: true, title: READ_ONLY_REASON } : {}
