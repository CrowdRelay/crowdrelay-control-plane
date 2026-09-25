import { For, Show, createSignal } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { authState } from '../lib/auth'
import { capability, capabilityAction } from '../lib/capabilities'
import { formatIsoAge } from '../lib/format'
import { surface } from '../lib/surface'
import { Section, TabBar } from './layout'
import { SectionIcon } from './SectionIcon'
import { StatusBadge } from './StatusBadge'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { SectionFailureCard } from './SectionFailureCard'
import { SurfaceAction } from './capabilities/SurfaceAction'
import { Button } from './app/button'
import { OutreachContactDrawer } from './OutreachContactDrawer'
import { cn } from '../lib/cn'

// The outreach list as conversations — the process view of the act's press,
// radio, venue and agent outreach, which lived in its own sheets because no
// screen here could list it. Four stages, each a count and a filter: whose
// move it is, who has not answered, who never heard from the act, and what is
// closed. "Your turn" leads because it is the one that goes cold.

type ConversationState = 'your_turn' | 'waiting_on_them' | 'not_contacted' | 'closed'

type OutreachContact = {
  target_id: string
  display_name: string
  target_kind: string
  state: ConversationState
  last_message_at: string | null
  answer_disposition: string | null
  reply_label: string | null
  messages_sent: number
  answers: number
  last_written_at: string | null
  last_answered_at: string | null
}

type OutreachContactsView = {
  contacts: OutreachContact[]
  counts: Record<ConversationState, number> & { total: number }
}

const STAGES: { id: ConversationState; band: string; platform: string }[] = [
  { id: 'your_turn', band: 'Your turn', platform: 'Last message inbound' },
  { id: 'waiting_on_them', band: 'Waiting on them', platform: 'Last message outbound' },
  { id: 'not_contacted', band: 'Never written to', platform: 'No message on record' },
  { id: 'closed', band: 'Closed', platform: 'Closed (refused, inactive or DNC)' },
]

/** A written-to contact with no answer after this long is worth a follow-up
 *  decision. Two weeks: a press or radio inbox that has not answered in two
 *  weeks has, in practice, answered. */
const FOLLOW_UP_AFTER_DAYS = 14

const daysSince = (iso: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null

const kindLabel = (kind: string) => kind.replace(/_/g, ' ')

/** Now, in the shape a datetime-local input takes. */
const localNow = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

const ROW_LIMIT = '500'

export function OutreachConversationsPanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const [stage, setStage] = createSignal<ConversationState>('your_turn')
  const [showAll, setShowAll] = createSignal(false)
  // The row that is open in the drawer — one contact's whole thread.
  const [openTarget, setOpenTarget] = createSignal<string | null>(null)
  const MAX_VISIBLE = 15

  const list = useQuery(() => ({
    queryKey: ['surface', props.slug, 'outreach-contacts', stage()],
    queryFn: () => surface.read<OutreachContactsView>(
      props.slug,
      capability('outreach-conversations').read!.path,
      { state: stage(), limit: ROW_LIMIT },
    ),
    staleTime: 30_000,
    retry: 1,
  }))
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['surface', props.slug, 'outreach-contacts'] })
    void queryClient.invalidateQueries({ queryKey: ['tenant-today', props.slug] })
  }
  const platform = () => authState.isPlatformLevel()
  const counts = () => list.data?.counts
  const rows = () => list.data?.contacts ?? []

  return (
    <Section
      flush
      title="Your outreach conversations"
      icon={<SectionIcon name="mail" />}
      count={counts()?.total}
      description={platform()
        ? 'Every outreach target with its conversation state, read from the interaction ledger: the latest message decides the stage.'
        : 'Everyone you pitch — press, radio, venues, agents — and where each conversation stands. Your turn comes first: those are the ones that go cold.'}
      action={
        <SurfaceAction
          slug={props.slug}
          size="sm"
          label="Add a contact"
          action={capabilityAction('outreach-targets', 'Add or update a target')}
          hidden={['version']}
          onDone={refresh}
        />
      }
    >
      {/* The stages are the pipeline: each tab is a count and a filter.
          "Your turn" leads — it is the stage that goes cold. */}
      <TabBar
        class="mb-0"
        active={stage()}
        onChange={(next) => { setStage(next as ConversationState); setShowAll(false) }}
        tabs={STAGES.map(item => ({
          id: item.id,
          label: platform() ? item.platform : item.band,
          count: () => counts()?.[item.id] ?? 0,
        }))}
      />

      <Show when={list.error}>
        <SectionFailureCard error={list.error} fallback="The outreach list did not load" onRetry={() => void list.refetch()} />
      </Show>
      <Show when={!list.error && list.isPending}><SkeletonRows count={4} /></Show>

      <Show when={list.data}>
        <Show
          when={rows().length > 0}
          fallback={<EmptyState label={emptyLabel(stage())} hint={emptyHint(stage(), platform())} />}
        >
          <div class="mt-3 flex flex-col">
            <For each={showAll() ? rows() : rows().slice(0, MAX_VISIBLE)}>{contact => (
              <ConversationRow contact={contact} slug={props.slug} onDone={refresh} onOpen={() => setOpenTarget(contact.target_id)} />
            )}</For>
          </div>
          <Show when={rows().length > MAX_VISIBLE}>
            <Button variant="ghost" size="sm" class="mt-3" onClick={() => setShowAll(s => !s)}>
              {showAll() ? 'Show fewer' : `Show all ${rows().length}`}
            </Button>
          </Show>
          <Show when={counts() && counts()![stage()] > rows().length}>
            <p class="mt-2 text-xs text-muted-foreground">
              Showing {rows().length} of {counts()![stage()].toLocaleString()}.
            </p>
          </Show>
        </Show>
      </Show>
      <OutreachContactDrawer
        slug={props.slug}
        targetId={openTarget()}
        onClose={() => setOpenTarget(null)}
        onChanged={refresh}
      />
    </Section>
  )
}

const emptyLabel = (stage: ConversationState) => ({
  your_turn: 'Nobody is waiting on you',
  waiting_on_them: 'Nothing is waiting on an answer',
  not_contacted: 'Everyone on the list has been written to',
  closed: 'No closed conversations',
}[stage])

const emptyHint = (stage: ConversationState, platform: boolean) => {
  if (stage === 'your_turn') {
    return platform
      ? 'No target has an inbound message as its latest.'
      : 'When someone you pitched writes back, they land here until you answer.'
  }
  return platform ? 'No target is in this stage.' : 'Conversations move here as they happen.'
}

function ConversationRow(props: { contact: OutreachContact; slug: string; onDone: () => void; onOpen: () => void }) {
  const c = () => props.contact
  const quiet = () => {
    const days = daysSince(c().last_written_at)
    return c().state === 'waiting_on_them' && days != null && days >= FOLLOW_UP_AFTER_DAYS
  }
  const detail = () => {
    switch (c().state) {
      case 'your_turn':
        return [
          c().last_answered_at ? `answered ${formatIsoAge(c().last_answered_at!)}` : null,
          c().last_written_at ? `you last wrote ${formatIsoAge(c().last_written_at!)}` : 'no message from you on record',
        ].filter(Boolean).join(' · ')
      case 'waiting_on_them':
        return [
          c().last_written_at ? `you wrote ${formatIsoAge(c().last_written_at!)}` : null,
          c().answers > 0 ? `${c().answers} earlier answer${c().answers === 1 ? '' : 's'}` : 'no answer yet',
        ].filter(Boolean).join(' · ')
      case 'not_contacted':
        return 'no message on record'
      default:
        return c().last_message_at ? `last message ${formatIsoAge(c().last_message_at!)}` : 'no message on record'
    }
  }

  return (
    <div class="flex flex-wrap items-start justify-between gap-3 border-b border-border py-3 last:border-0">
      <div
        class="min-w-0 flex-1 cursor-pointer rounded-sm outline-offset-2 hover:bg-muted/30 focus-visible:outline-2"
        role="button"
        tabIndex={0}
        onClick={props.onOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onOpen() } }}
        title="Open the whole thread"
      >
        <strong class="block text-foreground">{c().display_name}</strong>
        <small class="block text-sm text-muted-foreground">
          {[kindLabel(c().target_kind), c().reply_label].filter(Boolean).join(' · ')}
        </small>
        <small class={cn('block text-sm', quiet() ? 'text-warning-foreground' : 'text-muted-foreground')}>
          {detail()}{quiet() ? ' — follow up, or let it go' : ''}
        </small>
      </div>
      <div class="flex flex-shrink-0 flex-col items-end gap-2">
        <Show when={c().answer_disposition}>
          {disposition => <StatusBadge status={disposition()} tone={disposition() === 'positive' ? 'good' : disposition() === 'declined' ? 'warn' : 'muted'} />}
        </Show>
        <Show when={c().state === 'your_turn' || c().state === 'waiting_on_them' || c().state === 'not_contacted'}>
          <div class="flex flex-wrap justify-end gap-1.5">
            <SurfaceAction
              slug={props.slug}
              size="xs"
              variant={c().state === 'your_turn' ? 'outline' : 'ghost'}
              action={capabilityAction('outreach-conversations', 'I wrote back')}
              label={c().state === 'your_turn' ? 'I wrote back' : 'I wrote to them'}
              fixed={{ target_id: c().target_id }}
              initial={{ occurred_at: localNow() }}
              onDone={props.onDone}
            />
            <Show when={c().state !== 'not_contacted'}>
              <SurfaceAction
                slug={props.slug}
                size="xs"
                variant="ghost"
                action={capabilityAction('outreach-replies', 'Record a reply')}
                label="Log their answer"
                fixed={{ target_id: c().target_id }}
                initial={{ disposition: c().answer_disposition ?? 'received', occurred_at: localNow() }}
                hidden={['opportunity_id']}
                onDone={props.onDone}
              />
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}
