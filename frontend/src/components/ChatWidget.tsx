import { Show, For, createSignal, createEffect, onCleanup } from 'solid-js'
import { useNavigate, useLocation } from '@tanstack/solid-router'
import { ApiError } from '../lib/api'
import { authState } from '../lib/auth'
import { errorMessage } from '../lib/format'
import { cn } from '../lib/cn'
import { Textarea } from './ui/textarea'
import type { ChatMessage, ChatAction } from '../lib/types'
import { READ_ONLY_REASON, readOnly, writeGuard } from '../lib/read-only'
import { Button } from './app/button'
import { SparkIcon, CloseIcon, SendIcon } from './chat-icons'
import { renderMarkdown } from '../lib/chat-markdown'
import { CHAT_SUGGESTIONS, BAND_CHAT_SUGGESTIONS, readChatStream, stripActions } from '../lib/chat-stream'
import { runChatAction } from '../lib/chat-actions'
import { Square } from 'lucide-solid'

export function ChatWidget(props: { slug: string }) {
  const [open, setOpen] = createSignal(false)
  const [messages, setMessages] = createSignal<ChatMessage[]>([])
  const [input, setInput] = createSignal('')
  const [loading, setLoading] = createSignal(false)
  const [streaming, setStreaming] = createSignal(false)
  const [streamingContent, setStreamingContent] = createSignal('')
  const [error, setError] = createSignal<string | null>(null)
  const [executingAction, setExecutingAction] = createSignal<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()

  let scrollRef: HTMLDivElement | undefined
  let inputRef: HTMLTextAreaElement | undefined
  let panelRef: HTMLDivElement | undefined
  let abortController: AbortController | null = null

  // Auto-scroll to bottom on new messages or streaming text
  createEffect(() => {
    const msgs = messages()
    if (msgs.length > 0 && scrollRef) {
      const t = setTimeout(() => { if (scrollRef) scrollRef.scrollTop = scrollRef.scrollHeight }, 0)
      onCleanup(() => clearTimeout(t))
    }
  })

  // Focus input when opened
  createEffect(() => {
    if (open() && inputRef) {
      const t = setTimeout(() => { if (inputRef) inputRef.focus() }, 100)
      onCleanup(() => clearTimeout(t))
    }
  })

  // Lock body scroll while the chat is open so touch scrolling on mobile
  // does not chain through to the page underneath. The cleanup restores
  // the original overflow when the chat closes or the component unmounts.
  createEffect(() => {
    if (open()) {
      const previous = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      onCleanup(() => { document.body.style.overflow = previous })
    }
  })

  // Android Chrome sizes `100vh` (and a fixed element's containing block) to
  // the *large* viewport — the one you get with the URL bar retracted. A
  // full-screen panel anchored to the bottom therefore starts above the top of
  // what you can actually see, taking its header, and with it the close
  // button, off screen: on a Pixel the chat could be opened and not shut. The
  // visual viewport is the only thing that knows the real visible box, and it
  // is also what shrinks when the soft keyboard comes up, so the panel follows
  // it directly instead of trusting a viewport unit.
  createEffect(() => {
    if (!open()) return
    const viewport = window.visualViewport
    if (!viewport) return

    const fullScreen = window.matchMedia('(max-width: 480px)')

    const fit = () => {
      if (!panelRef) return
      // Only the full-screen layout is pinned this way; the desktop panel is a
      // floating card and keeps its own size. The media query is the same one
      // the stylesheet switches on, so the two cannot disagree.
      // A backgrounded or hidden tab reports a zero-height visual viewport;
      // writing that back would collapse the panel to nothing, so leave the
      // CSS height in place until there is a real measurement again.
      if (!fullScreen.matches || viewport.height <= 0) {
        panelRef.style.removeProperty('height')
        panelRef.style.removeProperty('transform')
        return
      }
      panelRef.style.height = `${viewport.height}px`
      // offsetTop is non-zero while the page is pinch-zoomed or the keyboard
      // has pushed the visual viewport down.
      panelRef.style.transform = viewport.offsetTop > 0 ? `translateY(${viewport.offsetTop}px)` : ''
    }

    fit()
    viewport.addEventListener('resize', fit)
    viewport.addEventListener('scroll', fit)
    window.addEventListener('orientationchange', fit)
    fullScreen.addEventListener('change', fit)
    onCleanup(() => {
      viewport.removeEventListener('resize', fit)
      viewport.removeEventListener('scroll', fit)
      window.removeEventListener('orientationchange', fit)
      fullScreen.removeEventListener('change', fit)
    })
  })

  const pageContext = () => {
    // The slug is stated outright. Without it the model has no way to build a
    // real path, which is exactly how it started emitting a literal "{slug}"
    // and navigating to /tenants/%7Bslug%7D/intelligence.
    const where = (page: string) => `${page} (slug: ${props.slug})`
    const path = location().pathname
    if (path.includes('/operations')) return where('Operations page')
    if (path.includes('/attention')) return where('Attention page')
    if (path.includes('/audience')) return where('Audience page')
    if (path.includes('/area')) return where('AREA page')
    if (path.includes('/integrations')) return where('AI Integrations page')
    if (path.includes('/notifiers')) return where('Notifiers page')
    if (path.includes('/automation')) return where('Automation page')
    if (path.includes('/tenants/') && !path.includes('/operations')) return where('Overview page')
    if (path === '/tenants') return where('Overview page')
    if (path === '/') return where('Overview page')
    return path
  }

  const send = async (text?: string) => {
    const msg = (text ?? input()).trim()
    if (!msg || loading()) return

    setError(null)
    setInput('')

    // This posts with a raw `fetch` to read the stream, so it never passes
    // through `request` and its read-only guard. Refuse here instead.
    if (readOnly()) {
      setError(READ_ONLY_REASON)
      return
    }
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

      // Update a dedicated signal — NOT the messages array — so the
      // streaming text grows as a smooth text node instead of re-setting
      // innerHTML on every token (which rebuilds the DOM and blinks).
      // `accumulated` is kept in sync so the catch blocks still see the
      // partial reply if the stream dies halfway.
      const result = await readChatStream(reader, (a) => {
        accumulated = a
        setStreamingContent(a)
      })
      accumulated = result.text
      const actions = result.actions

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
      setStreamingContent('')
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
      const result = await runChatAction(action, props.slug, (to) => navigate({ to }))
      if (result.closePanel) setOpen(false)
      if (result.error) setError(result.error)
      if (result.reply) setMessages(m => [...m, { role: 'assistant', content: result.reply! }])
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
      {/* Floating button. 16px from the edge is right on a phone, where
          the screen is the window; on a desktop the same 16px reads as
          stuck to the browser frame. The panel below moves with it so
          the two stay on one corner. */}
      <Show when={!open()}>
        <Button
          class="fixed bottom-4 right-4 lg:bottom-6 lg:right-6 z-40 h-auto gap-2 rounded-full px-4 py-3 shadow-lg"
          onClick={() => setOpen(true)}
          title="Ask AI Assistant"
          aria-label="Open AI Assistant"
        >
          <SparkIcon />
          <span class="text-sm font-medium">AI Assistant</span>
        </Button>
      </Show>

      {/* Chat panel */}
      <Show when={open()}>
        <div class="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
        <div class="fixed bottom-4 right-4 lg:bottom-6 lg:right-6 z-50 w-96 max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-2rem)] rounded-lg border border-border bg-card shadow-xl flex flex-col overflow-hidden" ref={panelRef} role="dialog" aria-modal="true" aria-label="AI assistant">
          <div class="flex items-center justify-between gap-2 border-b border-border px-4 py-3 flex-shrink-0">
            <div class="flex items-center gap-2 min-w-0">
              <SparkIcon />
              <div>
                <div class="text-sm font-semibold text-foreground">AI Assistant</div>
                <div class="text-xs text-muted-foreground">Free • Powered by Laguna S 2.1</div>
              </div>
            </div>
            <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground" onClick={() => setOpen(false)} aria-label="Close chat">
              <CloseIcon />
            </Button>
          </div>

          <div class="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef} role="log" aria-live="polite" aria-label="Chat conversation">
            <Show when={messages().length === 0}>
              <div class="flex flex-col items-center justify-center h-full text-center gap-4">
                <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary"><SparkIcon /></div>
                <h3>AI Assistant</h3>
                <p>{authState.isPlatformLevel() ? 'Ask about operations, growth metrics, autopilot, or platform health. Try one of these to start:' : 'Ask about your shows, fans, or what it decided. Try one of these to start:'}</p>
                <div class="flex flex-col gap-2 w-full max-w-xs">
                  <For each={authState.isPlatformLevel() ? CHAT_SUGGESTIONS : BAND_CHAT_SUGGESTIONS}>
                    {(s) => (
                      <Button writes variant="outline" class="h-auto justify-start whitespace-normal px-3 py-2 text-left text-sm font-normal text-muted-foreground hover:text-foreground" onClick={() => send(s)}>{s}</Button>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <For each={messages()}>
              {(msg, index) => {
                const isStreamingMsg = () =>
                  streaming() && msg.role === 'assistant' && index() === messages().length - 1
                return (
                <div class={cn('flex flex-col gap-1', msg.role === 'user' ? 'items-end' : 'items-start')}>
                  <Show
                    when={isStreamingMsg()}
                    fallback={<div data-slot="chat-message" class={cn('max-w-[80%] rounded-lg px-4 py-2.5 text-sm leading-relaxed break-words', msg.role === 'user' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-card text-foreground')} innerHTML={renderMarkdown(msg.content, props.slug)} />}
                  >
                    {/* During streaming, render as a text node so the text
                        grows smoothly without DOM rebuilds / blinking.
                        Markdown is applied once streaming completes. */}
                    <div data-slot="chat-message" class="max-w-[80%] rounded-lg rounded-bl-sm bg-card text-foreground px-4 py-2.5 text-sm leading-relaxed break-words">{streamingContent()}</div>
                  </Show>
                  <Show when={msg.actions && msg.actions.length > 0}>
                    <div class="flex flex-wrap gap-2 mt-2">
                      <For each={msg.actions}>
                        {(action) => (
                          <Button
                            writes
                            variant="outline"
                            size="xs"
                            class="whitespace-normal text-xs"
                            disabled={!!executingAction()}
                            onClick={() => executeAction(action)}
                          >
                            {executingAction() === action.label ? 'Working…' : action.label}
                          </Button>
                        )}
                      </For>
                    </div>
                  </Show>
                  {/* Blinking cursor while streaming the current assistant message */}
                  <Show when={isStreamingMsg()}>
                    <span class="inline-block w-2 h-4 bg-foreground animate-pulse" />
                  </Show>
                </div>
                )
              }}
            </For>
          </div>

          <Show when={error()}>
            <div class="text-sm text-destructive px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30">{error()}</div>
          </Show>

          <div class="border-t border-border p-3 flex-shrink-0">
            <div class="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                class="flex-1 resize-none"
                placeholder={authState.isPlatformLevel() ? 'Ask about operations, growth, or autopilot…' : 'Ask about your shows, fans, or growth…'}
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
                {...writeGuard()}
              />
              <Show when={streaming()}>
                <Button
                  variant="destructive"
                  size="icon"
                  class="flex-shrink-0"
                  onClick={stopStreaming}
                  aria-label="Stop streaming"
                  title="Stop"
                >
                  <Square size={14} fill="currentColor" aria-hidden="true" />
                </Button>
              </Show>
              <Show when={!streaming()}>
                <Button
                  writes
                  size="icon"
                  class="flex-shrink-0"
                  disabled={loading() || !input().trim()}
                  onClick={() => send()}
                  aria-label="Send message"
                >
                  <SendIcon />
                </Button>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}
