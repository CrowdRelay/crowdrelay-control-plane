import { For, Show, createMemo } from 'solid-js'
import { Inbox } from 'lucide-solid'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { capability, capabilityAction } from '../lib/capabilities'
import { fillPath, surface } from '../lib/surface'
import { formatIsoAge, formatTimestamp } from '../lib/format'
import { Dialog } from './Dialog'
import { Badge } from './app/badge'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { ErrorCard } from './layout'
import { SurfaceAction } from './capabilities/SurfaceAction'

// One contact's whole thread: who they are, every message either way, the
// letters the machine drafted or sent, and what happens next — the reason
// the evaluator itself computes. The drawer's controls are the three a hand
// already has: I wrote back, log their answer, don't contact.

export type ConversationMessage = {
  direction: 'outbound' | 'inbound' | string
  phase: string
  disposition: string
  author: 'sheet' | 'you' | 'autopilot' | string
  occurred_at: string
  reply_label: string | null
  reply_text: string | null
}

export type ConversationLetter = {
  action_id: string
  status: string
  phase: string | null
  template_key: string | null
  wave_id: string | null
  subject: string
  body: string
  created_at: string
  finished_at: string | null
}

export type OutreachConversation = {
  contact: {
    target_id: string
    display_name: string
    target_kind: string
    contact_email: string
    active: boolean
    verified: boolean
    accepts_outreach: boolean
    do_not_contact: boolean
    version: number
    last_reply_disposition: string
  }
  timeline: ConversationMessage[]
  letters: ConversationLetter[]
  next: {
    kind: 'in_wave' | 'due' | 'held' | 'your_turn' | 'closed' | 'none' | string
    detail: string
    due_at: string | null
    wave_id: string | null
  }
}

/** "2026-10-03T14:05" — the value a `datetime-local` field accepts. */
const nowLocal = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const authorWords = (author: string) =>
  author === 'sheet' ? 'the sheet'
    : author === 'you' ? 'you'
    : author === 'autopilot' ? 'the machine'
    : author

const nextTone = (kind: string) =>
  kind === 'in_wave' ? 'success' as const
    : kind === 'due' ? 'warning' as const
    : kind === 'your_turn' ? 'warning' as const
    : kind === 'closed' ? 'destructive' as const
    : 'muted' as const

const nextLabel = (kind: string) =>
  kind === 'in_wave' ? 'in a wave'
    : kind === 'due' ? 'due'
    : kind === 'held' ? 'held'
    : kind === 'your_turn' ? 'your turn'
    : kind === 'closed' ? 'closed'
    : 'nothing'

export function OutreachContactDrawer(props: {
  slug: string
  targetId: string | null
  onClose: () => void
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const conversation = useQuery(() => ({
    queryKey: ['surface', props.slug, 'outreach-conversation', props.targetId],
    queryFn: () =>
      surface.read<OutreachConversation>(
        props.slug,
        fillPath(capability('outreach-conversation').read!.path, { target_id: props.targetId! })!,
      ),
    enabled: props.targetId != null,
    staleTime: 15_000,
    retry: 1,
  }))

  const data = createMemo(() => conversation.data)
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['surface', props.slug, 'outreach-conversation', props.targetId] })
    props.onChanged()
  }

  return (
    <Dialog
      open={props.targetId != null}
      onClose={props.onClose}
      label="The conversation"
      title={data()?.contact.display_name ?? 'The conversation'}
      class="max-w-2xl"
      footer={
        <Show when={data()}>
          {view => (
            <div class="flex flex-wrap items-center gap-2">
              <SurfaceAction
                slug={props.slug}
                size="sm"
                label="I wrote back"
                action={capabilityAction('outreach-conversations', 'I wrote back')}
                fixed={{ target_id: props.targetId! }}
                initial={{ occurred_at: nowLocal() }}
                onDone={refresh}
              />
              <SurfaceAction
                slug={props.slug}
                size="sm"
                label="Log their answer"
                action={capabilityAction('outreach-replies', 'Record a reply')}
                fixed={{ target_id: props.targetId! }}
                initial={{ occurred_at: nowLocal() }}
                hidden={['opportunity_id']}
                onDone={refresh}
              />
              <div class="ml-auto">
                <Show
                  when={!view().contact.do_not_contact}
                  fallback={
                    <SurfaceAction
                      slug={props.slug}
                      size="sm"
                      variant="outline"
                      label="Contact again"
                      action={capabilityAction('outreach-conversation', 'Contact again')}
                      fixed={{ target_id: props.targetId! }}
                      initial={{ do_not_contact: false, occurred_at: nowLocal() }}
                      hidden={['do_not_contact', 'occurred_at']}
                      onDone={refresh}
                    />
                  }
                >
                  <SurfaceAction
                    slug={props.slug}
                    size="sm"
                    variant="destructive"
                    label="Don't contact"
                    action={capabilityAction('outreach-conversation', "Don't contact")}
                    fixed={{ target_id: props.targetId! }}
                    initial={{ do_not_contact: true, occurred_at: nowLocal() }}
                    hidden={['do_not_contact', 'occurred_at']}
                    onDone={refresh}
                  />
                </Show>
              </div>
            </div>
          )}
        </Show>
      }
    >
      <Show when={conversation.error}>
        <ErrorCard title="Couldn't load the conversation" error={conversation.error} onRetry={() => void conversation.refetch()} />
      </Show>
      <Show when={data()} fallback={<SkeletonRows count={4} />}>
        {view => (
          <div class="space-y-5 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{view().contact.target_kind.replaceAll('_', ' ')}</Badge>
              <span class="text-muted-foreground">{view().contact.contact_email}</span>
              <Show when={view().contact.verified} fallback={<Badge variant="warning">unverified</Badge>}>
                <Badge variant="muted">verified</Badge>
              </Show>
              <Show when={view().contact.do_not_contact}>
                <Badge variant="destructive">do not contact</Badge>
              </Show>
            </div>

            {/* The headline: what happens next, in the evaluator's own words. */}
            <div class="rounded-md border border-border p-3">
              <Badge variant={nextTone(view().next.kind)}>{nextLabel(view().next.kind)}</Badge>
              <p class="mt-1.5 leading-relaxed text-foreground">
                {view().next.detail}
                <Show when={view().next.due_at}>
                  {at => <> — {formatTimestamp(at())}</>}
                </Show>
              </p>
            </div>

            <div>
              <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">The letters</h3>
              <Show when={view().letters.length > 0} fallback={<p class="text-muted-foreground">The machine has written nothing here yet.</p>}>
                <ul class="space-y-2">
                  <For each={view().letters}>{letter => (
                    <li class="rounded-md border border-border p-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="font-medium text-foreground">{letter.subject}</span>
                        <Badge variant="muted">{letter.status.replaceAll('_', ' ')}</Badge>
                        <Show when={letter.wave_id}><Badge variant="outline">wave</Badge></Show>
                        <span class="ml-auto text-xs text-muted-foreground">{formatIsoAge(letter.created_at)} ago</span>
                      </div>
                      <details class="mt-2">
                        <summary class="cursor-pointer text-xs text-muted-foreground underline underline-offset-4">Read it</summary>
                        <pre class="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">{letter.body}</pre>
                      </details>
                    </li>
                  )}</For>
                </ul>
              </Show>
            </div>

            <div>
              <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">The thread</h3>
              <Show when={view().timeline.length > 0} fallback={<EmptyState icon={<Inbox />} label="Nothing on record" hint="No message either way has reached the ledger for this contact." />}>
                <ul class="space-y-2">
                  <For each={view().timeline}>{message => (
                    <li class="flex flex-col gap-1 rounded-md border border-border p-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class={message.direction === 'inbound' ? 'text-primary' : 'text-muted-foreground'}>
                          {message.direction === 'inbound' ? '←' : '→'}
                        </span>
                        <span class="text-foreground">
                          {message.direction === 'inbound' ? 'they answered' : `${authorWords(message.author)} wrote`}
                        </span>
                        <Show when={message.direction === 'inbound' && message.disposition !== 'none'}>
                          <Badge variant="muted">{message.disposition.replaceAll('_', ' ')}</Badge>
                        </Show>
                        <Show when={message.reply_label}>
                          <span class="text-xs text-muted-foreground">— the sheet called it "{message.reply_label}"</span>
                        </Show>
                        <span class="ml-auto text-xs text-muted-foreground">{formatTimestamp(message.occurred_at)}</span>
                      </div>
                      <Show when={message.reply_text}>
                        {text => <p class="whitespace-pre-wrap pl-5 leading-relaxed text-muted-foreground">{text()}</p>}
                      </Show>
                    </li>
                  )}</For>
                </ul>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </Dialog>
  )
}
