import { Show, For, createSignal, createEffect, onCleanup } from 'solid-js'
import { ErrorCard } from './layout'
import { failureLine } from '../lib/errors'
import { useNavigate, useLocation } from '@tanstack/solid-router'
import { ApiError } from '../lib/api'
import { authState } from '../lib/auth'
import { cn } from '../lib/cn'
import { Textarea } from './ui/textarea'
import type { ChatMessage, ChatAction } from '../lib/types'
import { READ_ONLY_REASON, readOnly, writeGuard } from '../lib/read-only'
import { Button } from './app/button'
import { SparkIcon, SendIcon } from './chat-icons'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet'
import { renderMarkdown } from '../lib/chat-markdown'
import { CHAT_SUGGESTIONS, BAND_CHAT_SUGGESTIONS, readChatStream, stripActions } from '../lib/chat-stream'
import { runChatAction } from '../lib/chat-actions'
import { Square } from 'lucide-solid'

export function ChatWidget(props: { slug: string; open: boolean; onOpenChange: (open: boolean) => void }) {
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
    if (props.open && inputRef) {
      const t = setTimeout(() => { if (inputRef) inputRef.focus() }, 100)
      onCleanup(() => clearTimeout(t))
    }
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
    // AREA folded into Places as a tab — the pathname alone can't see
    // `?tab=`, so read the search param directly (same as Destinations).
    if (path.includes('/places') && (location().search as { tab?: string }).tab === 'area') return where('AREA page')
    if (path.includes('/places')) return where('Places page')
    if (path.includes('/integrations')) return where('AI Integrations page')
    // The notifiers surface moved to the tenant page's Destinations tab. The
    // pathname alone can't see `?tab=`, so read the search param directly.
    if ((location().search as { tab?: string }).tab === 'destinations') return where('Destinations')
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
          ? err.status === 503
            ? (authState.isPlatformLevel() ? "The assistant isn't available right now. Make sure the agent service is running." : "The assistant isn't available right now. Try again in a moment.")
            : failureLine("Couldn't get a reply", err)
          : failureLine("Couldn't get a reply", err)
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
      if (result.closePanel) close()
      if (result.error) setError(result.error)
      if (result.reply) setMessages(m => [...m, { role: 'assistant', content: result.reply! }])
    } catch (err) {
      setError(failureLine("Couldn't complete that action", err))
      setMessages(m => [...m, { role: 'assistant', content: failureLine("That action didn't work", err) }])
    } finally {
      setExecutingAction(null)
    }
  }

  const close = () => props.onOpenChange(false)

  onCleanup(() => abortController?.abort())

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        position="right"
        class="flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[28rem]"
      >
        <SheetHeader class="shrink-0 border-b px-4 py-3 pr-12 text-left">
          <div class="flex items-center gap-2">
            <SparkIcon />
            <div class="min-w-0">
              <SheetTitle class="text-sm">CrowdRelay</SheetTitle>
              <SheetDescription class="text-xs">
                {authState.isPlatformLevel()
                  ? 'Ask about operations, growth, or platform health.'
                  : 'Ask about this tenant, its fans, shows, and growth.'}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div
          class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-label="Chat conversation"
        >
          <Show when={messages().length === 0}>
            <div class="flex h-full flex-col justify-center gap-4 py-8">
              <div>
                <h3 class="m-0 text-sm font-semibold text-foreground">What do you need?</h3>
                <p class="m-0 mt-1 text-sm leading-relaxed text-muted-foreground">
                  {authState.isPlatformLevel()
                    ? 'Ask about operations, growth metrics, autopilot, or platform health.'
                    : 'Ask about your shows, fans, or what CrowdRelay decided.'}
                </p>
              </div>
              <div class="flex flex-col gap-2">
                <For each={authState.isPlatformLevel() ? CHAT_SUGGESTIONS : BAND_CHAT_SUGGESTIONS}>
                  {(s) => (
                    <Button
                      writes
                      variant="outline"
                      class="h-auto justify-start whitespace-normal px-3 py-2 text-left text-sm font-normal text-muted-foreground hover:text-foreground"
                      onClick={() => send(s)}
                    >
                      {s}
                    </Button>
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
                    fallback={
                      <div
                        data-slot="chat-message"
                        class={cn(
                          'break-words text-sm leading-relaxed',
                          msg.role === 'user'
                            ? 'max-w-[85%] rounded-lg bg-muted px-3 py-2 text-foreground'
                            : 'w-full py-1 text-foreground',
                        )}
                        innerHTML={renderMarkdown(msg.content, props.slug)}
                      />
                    }
                  >
                    <div data-slot="chat-message" class="w-full break-words py-1 text-sm leading-relaxed text-foreground">
                      {streamingContent()}
                    </div>
                  </Show>

                  <Show when={msg.actions && msg.actions.length > 0}>
                    <div class="mt-2 flex flex-wrap gap-2">
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

                  <Show when={isStreamingMsg()}>
                    <span class="inline-block h-4 w-2 animate-pulse bg-foreground" />
                  </Show>
                </div>
              )
            }}
          </For>
        </div>

        <Show when={error()}>
          <ErrorCard class="mx-3 mb-2 p-3">{error()}</ErrorCard>
        </Show>

        <div class="shrink-0 border-t p-3">
          <div class="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              class="flex-1 resize-none"
              aria-label="Message CrowdRelay"
              placeholder={authState.isPlatformLevel()
                ? 'Ask about operations, growth, or autopilot…'
                : 'Ask about your shows, fans, or growth…'}
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
                class="shrink-0"
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
                class="shrink-0"
                disabled={loading() || !input().trim()}
                onClick={() => send()}
                aria-label="Send message"
              >
                <SendIcon />
              </Button>
            </Show>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
