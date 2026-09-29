/**
 * Turns a failure into words a person can act on.
 *
 * The backend's `detail` is written for a log file: `unavailable: n8n workflow
 * list failed: error sending request`, `invalid input: valid UUID is required`,
 * `upstream returned HTTP 502`. Printing it verbatim made every error read like
 * a stack trace. This module is the one place that decides what a reader sees:
 *
 *   - `reason` — one plain sentence saying what happened.
 *   - `recovery` — one plain sentence saying what to do next.
 *   - `technical` — the raw status, code, detail and request id, for the
 *     "Technical details" disclosure and for a support thread. Nothing is
 *     thrown away; it moves one click in.
 *
 * It duck-types `status` / `code` / `body` / `requestId` rather than importing
 * `ApiError`, so `format.ts` and the components can use it without pulling
 * `api.ts` into a cycle.
 */

export type ErrorKind =
  | 'offline'
  | 'timeout'
  | 'unreachable'
  | 'session'
  | 'permission'
  | 'missing'
  | 'conflict'
  | 'invalid'
  | 'credentials'
  | 'busy'
  | 'server'
  | 'unknown'

export type DescribedError = {
  kind: ErrorKind
  /** What happened, in the reader's words. */
  reason: string
  /** What to do next. */
  recovery: string
  /** Whether trying the same thing again can work. */
  retryable: boolean
  /** Raw developer-facing facts for the Technical details disclosure. */
  technical: { label: string; value: string }[]
}

type ErrorLike = {
  message?: string
  name?: string
  status?: number
  code?: string
  requestId?: string
  body?: Record<string, unknown>
}

const COPY: Record<ErrorKind, { reason: string; recovery: string; retryable: boolean }> = {
  offline: {
    reason: "Couldn't connect to the server.",
    recovery: 'Check your internet connection, then try again.',
    retryable: true,
  },
  timeout: {
    reason: 'This took too long to respond.',
    recovery: 'Try again in a moment.',
    retryable: true,
  },
  unreachable: {
    reason: "This service isn't responding right now.",
    recovery: 'Try again in a few minutes.',
    retryable: true,
  },
  session: {
    reason: 'Your session has ended.',
    recovery: 'Sign in again to continue.',
    retryable: false,
  },
  permission: {
    reason: "Your account doesn't have access to this.",
    recovery: 'Ask a workspace admin if you need it.',
    retryable: false,
  },
  missing: {
    reason: "This couldn't be found.",
    recovery: "It may have been removed, or it isn't available here yet. Refresh the page to see the latest.",
    retryable: false,
  },
  conflict: {
    reason: 'This already exists or was just changed.',
    recovery: 'Refresh the page, then try again.',
    retryable: false,
  },
  invalid: {
    reason: "Some of the details weren't accepted.",
    recovery: 'Check what you entered, then try again.',
    retryable: false,
  },
  credentials: {
    reason: "That username or password isn't right.",
    recovery: 'Check them, then try again.',
    retryable: false,
  },
  busy: {
    reason: 'Too many requests at once.',
    recovery: 'Wait a moment, then try again.',
    retryable: true,
  },
  server: {
    reason: 'Something went wrong on the server.',
    recovery: 'Try again. If it keeps happening, contact support with the technical details.',
    retryable: true,
  },
  unknown: {
    reason: "Something didn't work as expected.",
    recovery: 'Try again. If it keeps happening, refresh the page.',
    retryable: true,
  },
}

/** Backend error codes → kind. Codes are the contract; messages are not. */
const CODE_KIND: Record<string, ErrorKind> = {
  unauthorized: 'session',
  forbidden: 'permission',
  not_found: 'missing',
  conflict: 'conflict',
  invalid_input: 'invalid',
  invalid_credentials: 'credentials',
  unavailable: 'unreachable',
  internal_error: 'server',
  all_sections_failed: 'unreachable',
  upstream_timeout: 'timeout',
  upstream_unreachable: 'unreachable',
  upstream_error: 'unreachable',
  contract_mismatch: 'unreachable',
}

const statusKind = (status: number): ErrorKind => {
  if (status === 401) return 'session'
  if (status === 403) return 'permission'
  if (status === 404 || status === 410) return 'missing'
  if (status === 409) return 'conflict'
  if (status === 400 || status === 422) return 'invalid'
  if (status === 408 || status === 504) return 'timeout'
  if (status === 429) return 'busy'
  if (status === 502 || status === 503) return 'unreachable'
  if (status >= 500) return 'server'
  return 'unknown'
}

/** The prefix `thiserror` puts in front of every backend detail. */
const DETAIL_PREFIX = /^(invalid input|conflict|forbidden|unavailable|not found|upstream [a-z ]+):\s*/i

/** Words and shapes that only a developer would write. A detail containing
 *  any of them stays in Technical details instead of reaching the headline. */
const TECHNICAL = new RegExp([
  String.raw`[_{}<>\[\]=\\|#\`]`,                  // snake_case, markup, code
  String.raw`\w/\w`,                               // paths
  String.raw`::|=>|\(\)|Error:`,                   // stack and type noise
  String.raw`\b\d{3}\b`,                           // status codes
  String.raw`\b(http|json|uuid|sse|n8n|url|uri|idempotency|upstream|reqwest|serde|sql|sqlx|body|path|segment|header|enum|null|undefined|nan|stack|token|payload|schema|endpoint|api|fetch|request|response|seriali[sz]ed?|parse|deserializ\w*|constraint|tunnel|runtime|probe|webhook|oauth|cors|tls|dns|socket|panic|unwrap|envelope|snapshot|contract|sha)\b`,
].join('|'), 'i')

/** Whether a message reads as a sentence a non-developer would understand. */
/** camelCase identifiers — case-sensitive, so it cannot share the flag above. */
const CAMEL_CASE = /\b[a-z]+[A-Z]\w*\b/

export const readsAsPlainLanguage = (text: string): boolean =>
  text.length > 0 && text.length <= 160 && !TECHNICAL.test(text) && !CAMEL_CASE.test(text)

const sentence = (text: string): string => {
  const trimmed = text.trim().replace(DETAIL_PREFIX, '')
  if (!trimmed) return trimmed
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  return /[.!?…]$/.test(capital) ? capital : `${capital}.`
}

const isOffline = (e: ErrorLike) =>
  (typeof navigator !== 'undefined' && navigator.onLine === false) ||
  (e.name === 'TypeError' && /fetch|network|load failed/i.test(e.message ?? ''))

const isTimeout = (e: ErrorLike) =>
  e.name === 'TimeoutError' || (e.name === 'AbortError' && /timeout|timed out/i.test(e.message ?? ''))

/** Errors the JavaScript engine throws. Their message describes code, never
 *  the reader's situation, however plain it happens to read. */
const RUNTIME_ERROR = new Set(['TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError'])

export function describeError(error: unknown): DescribedError {
  const e: ErrorLike = error && typeof error === 'object' ? error as ErrorLike : { message: typeof error === 'string' ? error : undefined }
  const raw = (e.message ?? '').trim()

  const coded = typeof e.code === 'string' ? CODE_KIND[e.code] : undefined
  let kind: ErrorKind
  if (coded) kind = coded
  else if (typeof e.status === 'number') kind = statusKind(e.status)
  else if (isTimeout(e)) kind = 'timeout'
  else if (isOffline(e)) kind = 'offline'
  else kind = 'unknown'

  // The database's unique-violation path reports as a 500 with "already
  // taken (constraint_name)"; to the reader that is a name clash, not an
  // outage.
  if (kind === 'server' && /^already taken\b/i.test(raw)) kind = 'conflict'

  const copy = COPY[kind]
  let reason = copy.reason

  // Validation, clash and permission messages are the one place the backend
  // often says something specific and fixable ("operator username is already
  // taken", "email is too long"). Keep it when it reads as plain language.
  // An error the console threw itself (no status) was written for the reader
  // already — same test, so a stray developer string still gets caught.
  const specific = sentence(raw)
  const speaksForItself = kind === 'invalid' || kind === 'conflict' || kind === 'permission' || (kind === 'unknown' && e.status === undefined && !RUNTIME_ERROR.has(e.name ?? ''))
  if (speaksForItself && readsAsPlainLanguage(specific)) reason = specific

  const technical: { label: string; value: string }[] = []
  if (typeof e.status === 'number') technical.push({ label: 'Status', value: String(e.status) })
  if (typeof e.code === 'string' && e.code) technical.push({ label: 'Code', value: e.code })
  if (raw && raw !== reason) technical.push({ label: 'Detail', value: raw })
  const channel = e.body?.channel
  if (typeof channel === 'string') technical.push({ label: 'Channel', value: channel })
  if (e.requestId) technical.push({ label: 'Request ID', value: e.requestId })

  return { kind, reason, recovery: copy.recovery, retryable: copy.retryable, technical }
}

/** Reason and recovery as one line — for toasts and inline form errors. */
export const describeErrorLine = (error: unknown): string => {
  const d = describeError(error)
  return d.reason === COPY[d.kind].reason ? `${d.reason} ${d.recovery}` : d.reason
}

/** "Couldn't save the policy. Email is too long." — what failed, then why.
 *  For inline error text that a string signal carries; `ErrorCard` splits
 *  the first sentence into its heading. */
export const failureLine = (title: string, error: unknown): string =>
  `${title.replace(/[.\s]+$/, '')}. ${describeErrorLine(error)}`

/** "Run sync" → "run sync", but "AREA sync" stays — for "Couldn't {label}". */
export const lowerFirst = (label: string): string =>
  /^[A-Z]{2}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1)

/** A part of a read model that came back missing. It reads as "this service
 *  isn't responding" — which is what happened — and keeps `detail` for
 *  Technical details, instead of an ad-hoc `new Error(...)` whose message
 *  would be shown as if it were the reason. */
export const unavailableError = (detail: string | undefined): Error =>
  Object.assign(new Error(detail ?? ''), { code: 'unavailable' })
