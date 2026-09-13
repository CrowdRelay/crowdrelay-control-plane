import type { ChatAction } from './types'

// Distinguishes a server-sent SSE error from a JSON parse failure on a
// keepalive/heartbeat line. The catch block uses `instanceof StreamError`
// to propagate real errors while silently ignoring unparseable non-JSON
// lines. String-matching the message (the old approach) swallowed every
// server error whose text happened to contain "JSON".
export class StreamError extends Error {}

export const CHAT_SUGGESTIONS = [
  "What can I do here?",
  "Help me set up a daily press pitch",
  "How do I connect OpenAI?",
  "Show me how to enable autopilot",
  "What free AI models are available?",
]

const ACTIONS_DELIMITER = ':::actions'

/** Strip the :::actions block from displayed text. */
export function stripActions(raw: string): string {
  const idx = raw.indexOf(ACTIONS_DELIMITER)
  return idx === -1 ? raw : raw.slice(0, idx).trimEnd()
}

/**
 * Turns a model-supplied navigate target into a path we are willing to follow.
 *
 * A path from a language model is untrusted input, and this one was being
 * handed straight to the router. Two things go wrong with that.
 *
 * The one that bit: the prompt documents routes as `/tenants/{slug}/...`, and
 * the model copied the placeholder through literally, so the app navigated to
 * `/tenants/%7Bslug%7D/intelligence` and the API answered "slug must be 2-63
 * lowercase letters, digits or internal hyphens". Substituting it here fixes
 * that for every phrasing the model might produce, rather than hoping the
 * prompt is followed.
 *
 * The one that had not bit yet: nothing checked the target was in-app. A model
 * that emitted an absolute URL would have been followed off-site. Anything not
 * starting with a single `/` is refused.
 */
export function resolveNavigatePath(raw: unknown, slug: string): string | null {
  if (typeof raw !== 'string') return null
  let path = raw.trim().replace(/\{slug\}|:slug|\{SLUG\}|%7Bslug%7D/gi, slug)
  // `//host` is protocol-relative and leaves the app, so one leading slash only.
  if (!path.startsWith('/') || path.startsWith('//')) return null
  // The model frequently hallucinates a wrong tenant slug (e.g. "kumo"
  // instead of "virya"). Force-replace the slug segment in any
  // /tenants/<slug>/... path so navigation always stays inside the
  // tenant the operator is actually viewing.
  path = path.replace(/^\/tenants\/[^/]+(\/|$)/, `/tenants/${slug}$1`)
  return path
}

/**
 * Reads a chat SSE stream to completion.
 *
 * `onToken` is called with the accumulated reply text as each token arrives —
 * the caller writes it to a dedicated signal so the text grows as a smooth
 * text node instead of re-setting innerHTML on every token (which causes the
 * browser to rebuild the DOM and blink). Returns the final accumulated text
 * plus any actions the stream declared.
 *
 * A `data.type === 'error'` event throws `StreamError`; unparseable lines
 * (keepalives, heartbeats) are skipped — only the parse of a malformed line
 * is ignorable. This used to tell the two apart by string-matching the
 * message ("does it mention JSON?"), which swallowed every server error
 * whose text happened to contain the word — "model returned invalid JSON"
 * and friends surfaced to the operator as the assistant replying
 * "(no response)".
 */
export async function readChatStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onToken: (accumulated: string) => void,
): Promise<{ text: string; actions: ChatAction[] }> {
  const decoder = new TextDecoder()
  let buffer = ''
  let accumulated = ''
  let actions: ChatAction[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Process complete SSE events (separated by \n\n)
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''

    for (const event of events) {
      const line = event.trim()
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6)
      try {
        const raw = JSON.parse(payload)
        if (typeof raw !== 'object' || raw === null || typeof (raw as Record<string, unknown>).type !== 'string') {
          continue
        }
        const data = raw as { type: string; text?: unknown; actions?: unknown; error?: unknown }
        if (data.type === 'token' && typeof data.text === 'string') {
          accumulated += data.text
          onToken(accumulated)
        } else if (data.type === 'actions' && Array.isArray(data.actions)) {
          actions = data.actions as ChatAction[]
        } else if (data.type === 'error') {
          throw new StreamError(typeof data.error === 'string' ? data.error : 'stream error')
        }
        // 'done' type — stream is complete, nothing extra to do.
      } catch (e) {
        if (e instanceof StreamError) throw e
      }
    }
  }

  return { text: accumulated, actions }
}
