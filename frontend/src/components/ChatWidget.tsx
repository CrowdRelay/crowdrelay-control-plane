import { Show, For, createSignal, createEffect, onCleanup } from 'solid-js'
import { useNavigate, useLocation } from '@tanstack/solid-router'
import { request, ApiError } from '../lib/api'
import { errorMessage } from '../lib/format'
import type { ChatMessage, ChatAction } from '../lib/types'

// --- Icons ---
const ChatIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
)

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)

const SparkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 2v6m0 8v6M4.93 4.93l4.24 4.24m5.66 5.66l4.24 4.24M2 12h6m8 0h6M4.93 19.07l4.24-4.24m5.66-5.66l4.24-4.24" />
  </svg>
)

const SUGGESTIONS = [
  "What can I do here?",
  "Help me set up a daily press pitch",
  "How do I connect OpenAI?",
  "Show me how to enable autopilot",
  "What free AI models are available?",
]

const ACTIONS_DELIMITER = ':::actions'

/** Strip the :::actions block from displayed text. */
function stripActions(raw: string): string {
  const idx = raw.indexOf(ACTIONS_DELIMITER)
  return idx === -1 ? raw : raw.slice(0, idx).trimEnd()
}

export function ChatWidget(props: { slug: string }) {
  const [open, setOpen] = createSignal(false)
  const [messages, setMessages] = createSignal<ChatMessage[]>([])
  const [input, setInput] = createSignal('')
  const [loading, setLoading] = createSignal(false)
  const [streaming, setStreaming] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [executingAction, setExecutingAction] = createSignal<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()

  let scrollRef: HTMLDivElement | undefined
  let inputRef: HTMLTextAreaElement | undefined
  let abortController: AbortController | null = null

  // Auto-scroll to bottom on new messages or streaming text
  createEffect(() => {
    const msgs = messages()
    if (msgs.length > 0 && scrollRef) {
      setTimeout(() => scrollRef!.scrollTop = scrollRef!.scrollHeight, 0)
    }
  })

  // Focus input when opened
  createEffect(() => {
    if (open() && inputRef) {
      setTimeout(() => inputRef!.focus(), 100)
    }
  })

  const pageContext = () => {
    const path = location().pathname
    if (path.includes('/operations')) return 'Operations page'
    if (path.includes('/attention')) return 'Attention page'
    if (path.includes('/portfolio')) return 'Portfolio page'
    if (path.includes('/area')) return 'AREA page'
    if (path.includes('/integrations')) return 'AI Integrations page'
    if (path.includes('/notifiers')) return 'Notifiers page'
    if (path.includes('/automation')) return 'Automation page'
    if (path.includes('/tenants/') && !path.includes('/operations')) return 'Tenant detail page'
    if (path === '/tenants') return 'Tenants registry page'
    if (path === '/') return 'Overview page'
    return path
  }

  const send = async (text?: string) => {
    const msg = (text ?? input()).trim()
    if (!msg || loading()) return

    setError(null)
    setInput('')

    const newMessages: ChatMessage[] = [...messages(), { role: 'user', content: msg }]
    setMessages(newMessages)
    setLoading(true)
    setStreaming(true)

    // Add an empty assistant message that we'll fill as tokens stream in.
    const assistantIndex = newMessages.length
    setMessages([...newMessages, { role: 'assistant', content: '' }])
    let accumulated = ''

    abortController = new AbortController()

    try {
      const response = await fetch(`/api/v1/tenants/${encodeURIComponent(props.slug)}/agents/chat/stream`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-request-id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          message: msg,
          history: newMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
          page_context: pageContext(),
        }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ detail: response.statusText })) as { detail?: string }
        throw new ApiError(response.status, body.detail ?? `HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buffer = ''
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
            const data = JSON.parse(payload) as { type: string; text?: string; actions?: ChatAction[]; error?: string }
            if (data.type === 'token' && data.text) {
              accumulated += data.text
              // Update the assistant message live as tokens arrive.
              setMessages(prev => {
                const next = [...prev]
                const cur = next[assistantIndex]
                if (cur) next[assistantIndex] = { role: 'assistant', content: accumulated, actions: cur.actions }
                return next
              })
            } else if (data.type === 'actions' && data.actions) {
              actions = data.actions
            } else if (data.type === 'error') {
              throw new Error(data.error ?? 'stream error')
            }
            // 'done' type — stream is complete, nothing extra to do.
          } catch (e) {
            // If it's our own thrown error, propagate it
            if (e instanceof Error && e.message !== 'Unexpected token' && !e.message.includes('JSON')) {
              throw e
            }
            // Ignore JSON parse errors for keepalive/heartbeat lines
          }
        }
      }

      // Finalize: strip the :::actions block from displayed text, attach actions.
      const cleanReply = stripActions(accumulated)
      setMessages(prev => {
        const next = [...prev]
        next[assistantIndex] = {
          role: 'assistant',
          content: cleanReply || '(no response)',
          actions: actions.length > 0 ? actions : undefined,
        }
        return next
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled — keep whatever was streamed so far, just clean up.
        const cleanReply = stripActions(accumulated)
        setMessages(prev => {
          const next = [...prev]
          next[assistantIndex] = {
            role: 'assistant',
            content: cleanReply || '(cancelled)',
          }
          return next
        })
      } else {
        const msg = err instanceof ApiError
          ? err.status === 503 ? 'The AI assistant is not available right now. Make sure the agent service is running.' : errorMessage(err, 'Chat failed')
          : errorMessage(err, 'Chat failed')
        setError(msg)
        setMessages(prev => {
          const next = [...prev]
          next[assistantIndex] = {
            role: 'assistant',
            content: accumulated ? stripActions(accumulated) : `Sorry, I couldn't process that. ${msg}`,
          }
          return next
        })
      }
    } finally {
      setLoading(false)
      setStreaming(false)
      abortController = null
    }
  }

  const stopStreaming = () => {
    abortController?.abort()
  }

  const executeAction = async (action: ChatAction) => {
    setExecutingAction(action.label)
    setError(null)

    try {
      switch (action.type) {
        case 'navigate': {
          const path = action.params.path as string
          if (path) navigate({ to: path })
          setOpen(false)
          break
        }
        case 'run_task': {
          await request(`/tenants/${encodeURIComponent(props.slug)}/agents/tasks`, {
            method: 'POST',
            body: JSON.stringify({
              template_id: action.params.template_id,
              model_id: action.params.model_id ?? 'laguna-s-2.1-free',
              prompt: action.params.prompt,
            }),
          })
          setMessages(m => [...m, { role: 'assistant', content: `Task started! You can check the result on the [Integrations page](/tenants/${props.slug}/integrations).` }])
          break
        }
        case 'create_schedule': {
          await request(`/tenants/${encodeURIComponent(props.slug)}/agents/schedules`, {
            method: 'POST',
            body: JSON.stringify({
              template_id: action.params.template_id,
              model_id: action.params.model_id ?? 'laguna-s-2.1-free',
              prompt: action.params.prompt,
              interval_minutes: action.params.interval_minutes ?? 1440,
            }),
          })
          setMessages(m => [...m, { role: 'assistant', content: 'Schedule created! It will run automatically on the configured interval.' }])
          break
        }
        case 'toggle_autopilot': {
          await request(`/tenants/${encodeURIComponent(props.slug)}/operations/autopilot/bulk`, {
            method: 'POST',
            headers: { 'idempotency-key': crypto.randomUUID() },
            body: JSON.stringify({ enabled: action.params.enabled }),
          })
          setMessages(m => [...m, { role: 'assistant', content: `Autopilot ${action.params.enabled ? 'enabled' : 'disabled'} for all contexts.` }])
          break
        }
        case 'paste_api_key': {
          navigate({ to: `/tenants/${props.slug}/integrations` })
          setOpen(false)
          break
        }
        case 'create_notifier': {
          await request(`/tenants/${encodeURIComponent(props.slug)}/notifiers`, {
            method: 'POST',
            body: JSON.stringify({
              kind: action.params.kind ?? 'discord',
              label: action.params.label ?? 'AI-created notifier',
              events: ['delivery.failed', 'outbox.dead'],
              enabled: true,
            }),
          })
          setMessages(m => [...m, { role: 'assistant', content: 'Notifier channel created! You can configure it on the Notifiers page.' }])
          break
        }
        case 'create_fanbase': {
          await request(`/tenants/${encodeURIComponent(props.slug)}/portfolio/fanbases`, {
            method: 'POST',
            headers: { 'idempotency-key': crypto.randomUUID() },
            body: JSON.stringify({
              name: action.params.name ?? 'New fanbase',
              sourceKind: action.params.sourceKind ?? 'manual_import',
            }),
          })
          setMessages(m => [...m, { role: 'assistant', content: 'Fanbase created! You can add fans to it on the Portfolio page.' }])
          break
        }
        case 'enable_area': {
          await request(`/tenants/${encodeURIComponent(props.slug)}/area/settings`, {
            method: 'PATCH',
            body: JSON.stringify({ enabled: action.params.enabled ?? true }),
          })
          setMessages(m => [...m, { role: 'assistant', content: `AREA ${action.params.enabled ? 'enabled' : 'disabled'}.` }])
          break
        }
        case 'deploy_tenant': {
          await request(`/tenants/${encodeURIComponent(props.slug)}/provisioning/deploy`, {
            method: 'POST',
            body: JSON.stringify({}),
          })
          setMessages(m => [...m, { role: 'assistant', content: 'Deployment started! You can monitor progress on the tenant detail page.' }])
          break
        }
        case 'retry_dead_deliveries': {
          await request(`/tenants/${encodeURIComponent(props.slug)}/operations/dead-deliveries/clear`, {
            method: 'POST',
            headers: { 'idempotency-key': crypto.randomUUID() },
            body: '{}',
          })
          setMessages(m => [...m, { role: 'assistant', content: 'Dead deliveries replayed!' }])
          break
        }
        case 'run_reconciliation': {
          await request(`/tenants/${encodeURIComponent(props.slug)}/operations/reconcile`, {
            method: 'POST',
            headers: { 'idempotency-key': crypto.randomUUID() },
            body: '{}',
          })
          setMessages(m => [...m, { role: 'assistant', content: 'Reconciliation started!' }])
          break
        }
        default:
          setError('Unknown action type')
      }
    } catch (err) {
      setError(errorMessage(err, 'Action failed'))
      setMessages(m => [...m, { role: 'assistant', content: `That action failed: ${errorMessage(err, 'unknown error')}` }])
    } finally {
      setExecutingAction(null)
    }
  }

  // Close on Escape
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open()) setOpen(false)
  }
  document.addEventListener('keydown', onKey)
  onCleanup(() => {
    document.removeEventListener('keydown', onKey)
    abortController?.abort()
  })

  return (
    <>
      {/* Floating button */}
      <Show when={!open()}>
        <button
          class="chat-fab"
          onClick={() => setOpen(true)}
          title="Ask AI Assistant"
          aria-label="Open AI Assistant"
        >
          <SparkIcon />
          <span class="chat-fab-label">AI Assistant</span>
        </button>
      </Show>

      {/* Chat panel */}
      <Show when={open()}>
        <div class="chat-panel">
          <div class="chat-header">
            <div class="chat-header-info">
              <SparkIcon />
              <div>
                <div class="chat-header-title">AI Assistant</div>
                <div class="chat-header-sub">Free • Powered by Laguna S 2.1</div>
              </div>
            </div>
            <button class="chat-close" onClick={() => setOpen(false)} aria-label="Close chat">
              <CloseIcon />
            </button>
          </div>

          <div class="chat-messages" ref={scrollRef}>
            <Show when={messages().length === 0}>
              <div class="chat-welcome">
                <div class="chat-welcome-icon"><SparkIcon /></div>
                <h3>Hi! I'm your AI copilot</h3>
                <p>I know everything you can do in CrowdRelay and can help you get things done. Ask me anything, or try one of these:</p>
                <div class="chat-suggestions">
                  <For each={SUGGESTIONS}>
                    {(s) => (
                      <button class="chat-suggestion" onClick={() => send(s)}>{s}</button>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <For each={messages()}>
              {(msg) => (
                <div class={`chat-msg chat-msg-${msg.role}`}>
                  <div class="chat-msg-content" innerHTML={renderMarkdown(msg.content)} />
                  <Show when={msg.actions && msg.actions.length > 0}>
                    <div class="chat-actions">
                      <For each={msg.actions}>
                        {(action) => (
                          <button
                            class="chat-action-btn"
                            disabled={!!executingAction()}
                            onClick={() => executeAction(action)}
                          >
                            {executingAction() === action.label ? 'Working…' : action.label}
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                  {/* Blinking cursor while streaming the current assistant message */}
                  <Show when={streaming() && msg.role === 'assistant' && msg.content === messages()[messages().length - 1]?.content}>
                    <span class="chat-cursor" />
                  </Show>
                </div>
              )}
            </For>
          </div>

          <Show when={error()}>
            <div class="chat-error">{error()}</div>
          </Show>

          <div class="chat-input-area">
            <textarea
              ref={inputRef}
              class="chat-input"
              placeholder="Ask me anything…"
              value={input()}
              onInput={(e) => setInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={1}
              maxlength={4000}
            />
            <Show when={streaming()}>
              <button
                class="chat-stop"
                onClick={stopStreaming}
                aria-label="Stop streaming"
                title="Stop"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            </Show>
            <Show when={!streaming()}>
              <button
                class="chat-send"
                disabled={loading() || !input().trim()}
                onClick={() => send()}
                aria-label="Send message"
              >
                <SendIcon />
              </button>
            </Show>
          </div>
        </div>
      </Show>
    </>
  )
}

// Minimal markdown → HTML (bold, italic, code, links, line breaks)
function renderMarkdown(text: string): string {
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>')
}
