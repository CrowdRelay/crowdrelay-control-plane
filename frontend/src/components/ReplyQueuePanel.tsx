import { For, Show, createSignal } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { capability, capabilityAction } from '../lib/capabilities'
import { fillPath, surface } from '../lib/surface'
import { errorMessage, formatTimestamp } from '../lib/format'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Badge } from './app/badge'
import { Button } from './app/button'
import { toast } from './app/toast'
import { Textarea } from './ui/textarea'

// The reply lane's queue: people who commented on the band's posts, and the
// answer drafted for each. Sending is a person's call unless unattended
// replies are on — and even then a guard, a failed review or a halted
// account parks the draft here with the reason. Edit it, send it, or skip it.

type Reply = {
  id: string
  platform: string
  subreddit: string
  post_title: string
  post_url: string | null
  author: string
  comment: string
  status: string
  draft: string | null
  hold_reason: string | null
  review_score: number | null
  reply_permalink: string | null
  created_at: string
}

const place = (reply: Reply) => (reply.platform === 'reddit' ? `r/${reply.subreddit}` : reply.platform)

function ReplyRow(props: { slug: string; reply: Reply; onDone: () => void }) {
  const [text, setText] = createSignal(props.reply.draft ?? '')
  const [busy, setBusy] = createSignal(false)
  const act = async (label: 'Send reply' | 'Skip reply', body?: unknown) => {
    const path = fillPath(capabilityAction('community-replies', label).path, { reply_id: props.reply.id })
    if (!path) return
    setBusy(true)
    try {
      await surface.write(props.slug, 'POST', path, body)
      toast.success(label === 'Send reply' ? 'Reply approved — it goes out on the next paced send.' : 'Skipped.')
      props.onDone()
    } catch (error) {
      toast.error(errorMessage(error, 'The reply could not be saved.'))
    } finally {
      setBusy(false)
    }
  }
  const send = () => {
    const edited = text().trim()
    void act('Send reply', edited && edited !== (props.reply.draft ?? '').trim() ? { text: edited } : undefined)
  }
  return (
    <li class="rounded-lg border border-border bg-background px-4 py-3">
      <p class="text-xs text-muted-foreground">
        <strong class="text-foreground">{props.reply.author}</strong> on {place(props.reply)} ·{' '}
        <Show when={props.reply.post_url} fallback={props.reply.post_title}>
          {url => <a class="underline" href={url()} target="_blank" rel="noreferrer">{props.reply.post_title}</a>}
        </Show>
        {' '}· {formatTimestamp(props.reply.created_at)}
      </p>
      <p class="mt-1 text-sm text-foreground">“{props.reply.comment}”</p>
      <Show when={props.reply.hold_reason}>
        {reason => <p class="mt-1 text-xs text-destructive">{reason()}</p>}
      </Show>
      <Textarea
        class="mt-2 text-sm"
        rows={3}
        maxlength={10000}
        value={text()}
        onInput={event => setText(event.currentTarget.value)}
        placeholder="No draft yet — write the answer yourself, or skip."
      />
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <Button writes size="xs" disabled={busy() || !text().trim()} onClick={send}>Send</Button>
        <Button writes size="xs" variant="ghost" disabled={busy()} onClick={() => void act('Skip reply')}>Skip</Button>
        <Show when={props.reply.review_score != null}>
          <Badge variant={(props.reply.review_score ?? 0) >= 7 ? 'success' : 'warning'}>review {props.reply.review_score}/10</Badge>
        </Show>
      </div>
    </li>
  )
}

export function ReplyQueuePanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const key = () => ['surface', props.slug, 'community-replies']
  const replies = useQuery(() => ({
    queryKey: key(),
    queryFn: () => surface.read<{ replies: Reply[] }>(props.slug, capability('community-replies').read!.path),
    staleTime: 30_000,
    retry: 1,
  }))
  const waiting = () => (replies.data?.replies ?? []).filter(reply => reply.status === 'awaiting_approval')
  const recent = () => (replies.data?.replies ?? []).filter(reply => reply.status !== 'awaiting_approval')
  const refresh = () => void queryClient.invalidateQueries({ queryKey: key() })

  return (
    <Section
      title="Replies waiting"
      icon={<SectionIcon name="list-checks" />}
      count={waiting().length}
      description="People who commented on the band's posts, with the answer drafted in the band's voice. Edit before sending if it doesn't sound like you."
    >
      <Show when={!replies.error} fallback={<p class="text-sm text-muted-foreground">Couldn't read the reply queue.</p>}>
        <Show when={replies.data} fallback={<p class="text-sm text-muted-foreground">Checking…</p>}>
          <Show when={waiting().length > 0} fallback={<p class="text-sm text-muted-foreground">Nobody is waiting for an answer.</p>}>
            <ul class="space-y-3">
              <For each={waiting()}>{reply => <ReplyRow slug={props.slug} reply={reply} onDone={refresh} />}</For>
            </ul>
          </Show>
          <Show when={recent().length > 0}>
            <p class="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Last week</p>
            <ul class="mt-1 space-y-1 text-xs text-muted-foreground">
              <For each={recent()}>{reply => (
                <li>
                  <Badge variant={reply.status === 'replied' ? 'success' : reply.status === 'failed' ? 'destructive' : 'muted'}>{reply.status.replaceAll('_', ' ')}</Badge>{' '}
                  {reply.author} on {place(reply)}
                  <Show when={reply.reply_permalink}>{link => <> · <a class="underline" href={link()} target="_blank" rel="noreferrer">our answer</a></>}</Show>
                </li>
              )}</For>
            </ul>
          </Show>
        </Show>
      </Show>
    </Section>
  )
}
