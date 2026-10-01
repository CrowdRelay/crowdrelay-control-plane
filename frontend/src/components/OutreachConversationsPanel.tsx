import { For, Show, createSignal } from 'solid-js'
import { Inbox, MoreHorizontal, Plus } from 'lucide-solid'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { authState } from '../lib/auth'
import { capability, capabilityAction } from '../lib/capabilities'
import { formatIsoAge } from '../lib/format'
import { surface } from '../lib/surface'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { StatusBadge } from './StatusBadge'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { SectionFailureCard } from './SectionFailureCard'
import { ActionSheet, type OpenWrite } from './capabilities/ActionSheet'
import { Button } from './app/button'
import { DataTable, type ColumnDef } from './app/data-table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu'
import { READ_ONLY_REASON } from '../lib/read-only'
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

/** Where a contact's conversation stands, in a few words for its row. */
const standing = (c: OutreachContact) => {
  switch (c.state) {
    case 'your_turn': return c.last_answered_at ? `They answered ${formatIsoAge(c.last_answered_at)}` : 'They wrote'
    case 'waiting_on_them': return c.answers > 0 ? `${c.answers} earlier answer${c.answers === 1 ? '' : 's'}` : 'No answer yet'
    case 'not_contacted': return 'No message on record'
    default: return c.last_message_at ? `Last message ${formatIsoAge(c.last_message_at)}` : 'No message on record'
  }
}

/** Written to, not answered for two weeks: worth a follow-up decision. */
const quiet = (c: OutreachContact) => {
  const days = daysSince(c.last_written_at)
  return c.state === 'waiting_on_them' && days != null && days >= FOLLOW_UP_AFTER_DAYS
}

const age = (iso: string | null) => iso ? formatIsoAge(iso) : '—'

export function OutreachConversationsPanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const [stage, setStage] = createSignal<ConversationState>('your_turn')
  // The row that is open in the drawer — one contact's whole thread.
  const [openTarget, setOpenTarget] = createSignal<string | null>(null)
  // A write in progress — Add a contact, I wrote back, Log their answer.
  // A form expanding inside a table row would push the table about, so it
  // opens beside it instead.
  const [write, setWrite] = createSignal<OpenWrite | null>(null)

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

  const wroteBack = (c: OutreachContact): OpenWrite => ({
    title: c.state === 'your_turn' ? 'I wrote back' : 'I wrote to them',
    description: c.display_name,
    action: capabilityAction('outreach-conversations', 'I wrote back'),
    fixed: { target_id: c.target_id },
    initial: { occurred_at: localNow() },
  })
  const logAnswer = (c: OutreachContact): OpenWrite => ({
    title: 'Log their answer',
    description: c.display_name,
    action: capabilityAction('outreach-replies', 'Record a reply'),
    fixed: { target_id: c.target_id },
    initial: { disposition: c.answer_disposition ?? 'received', occurred_at: localNow() },
    hidden: ['opportunity_id'],
  })

  const columns: ColumnDef<OutreachContact, any>[] = [
    {
      id: 'contact', header: 'Contact', accessorFn: c => c.display_name,
      cell: cell => {
        const c = cell.row.original
        return <>
          <Button
            variant="link"
            class="h-auto p-0 text-left font-medium text-foreground"
            title="Open the whole thread"
            onClick={() => setOpenTarget(c.target_id)}
          >{c.display_name}</Button>
          <Show when={c.reply_label}><span class="block text-muted-foreground">{c.reply_label}</span></Show>
        </>
      },
    },
    { id: 'kind', header: 'Kind', accessorFn: c => kindLabel(c.target_kind), meta: { class: 'whitespace-nowrap capitalize' } },
    {
      id: 'standing', header: 'Where it stands', accessorFn: c => standing(c),
      cell: cell => {
        const c = cell.row.original
        return <span class={cn(quiet(c) && 'text-warning-foreground')}>
          {standing(c)}{quiet(c) ? ' — follow up, or let it go' : ''}
        </span>
      },
    },
    {
      id: 'answer', header: 'Answer', accessorFn: c => c.answer_disposition ?? '',
      cell: cell => <Show when={cell.row.original.answer_disposition} fallback="—">
        {disposition => <StatusBadge status={disposition()} tone={disposition() === 'positive' ? 'good' : disposition() === 'declined' ? 'warn' : 'muted'} />}
      </Show>,
    },
    {
      id: 'written', header: 'You last wrote', accessorFn: c => c.last_written_at ?? '', meta: { class: 'whitespace-nowrap' },
      cell: cell => <span class={cn(quiet(cell.row.original) && 'text-warning-foreground')}>{age(cell.row.original.last_written_at)}</span>,
    },
    { id: 'answered', header: 'They answered', accessorFn: c => c.last_answered_at ?? '', meta: { class: 'whitespace-nowrap' }, cell: cell => age(cell.row.original.last_answered_at) },
    { id: 'sent', header: 'Sent', accessorFn: c => c.messages_sent, meta: { numeric: true } },
    { id: 'answers', header: 'Answers', accessorFn: c => c.answers, meta: { numeric: true } },
    {
      id: 'actions', header: () => <span class="sr-only">Actions</span>, enableSorting: false, enableHiding: false,
      meta: { class: 'w-12 text-right' },
      cell: cell => {
        const c = cell.row.original
        const open = c.state !== 'closed'
        const readOnly = () => authState.readOnly()
        return (
          <DropdownMenu placement="bottom-end">
            <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="size-8">
              <span class="sr-only">Open menu for {c.display_name}</span>
              <MoreHorizontal aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="min-w-44">
              <DropdownMenuItem onSelect={() => setOpenTarget(c.target_id)}>Open the thread</DropdownMenuItem>
              <Show when={open}>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={readOnly()} title={readOnly() ? READ_ONLY_REASON : undefined} onSelect={() => setWrite(wroteBack(c))}>
                  {c.state === 'your_turn' ? 'I wrote back' : 'I wrote to them'}
                </DropdownMenuItem>
                <Show when={c.state !== 'not_contacted'}>
                  <DropdownMenuItem disabled={readOnly()} title={readOnly() ? READ_ONLY_REASON : undefined} onSelect={() => setWrite(logAnswer(c))}>
                    Log their answer
                  </DropdownMenuItem>
                </Show>
              </Show>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return (
    <Section
      flush
      title="Your outreach conversations"
      icon={<SectionIcon name="mail" />}
      count={counts()?.total}
      description={platform()
        ? 'Every outreach target with its conversation state, read from the interaction ledger: the latest message decides the stage.'
        : 'Everyone you pitch — press, radio, venues, agents — and where each conversation stands. Your turn comes first: those are the ones that go cold.'}
    >
      <Show when={list.error}>
        <SectionFailureCard error={list.error} title="Couldn't load the outreach list" onRetry={() => void list.refetch()} />
      </Show>
      <Show when={!list.error && list.isPending && !list.data}><SkeletonRows count={4} /></Show>

      <Show when={list.data}>
        <DataTable
          data={rows()}
          columns={columns}
          getRowId={c => c.target_id}
          searchText={c => [c.display_name, c.reply_label, kindLabel(c.target_kind), c.answer_disposition].filter(Boolean).join(' ')}
          searchPlaceholder="Search by name, kind or contact"
          pageSize={15}
          actions={
            <Button writes size="sm" onClick={() => setWrite({
              title: 'Add a contact',
              description: 'Press, radio, a venue or an agent to pitch.',
              action: capabilityAction('outreach-targets', 'Add or update a target'),
              hidden: ['version'],
            })}>
              <Plus aria-hidden="true" /> Add a contact
            </Button>
          }
          // The stages are the pipeline: each chip is a count and a filter.
          // "Your turn" leads — it is the stage that goes cold.
          toolbar={
            <div role="group" aria-label="Stage" class="flex flex-wrap items-center gap-1">
              <For each={STAGES}>{item => (
                <Button
                  variant={stage() === item.id ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-pressed={stage() === item.id}
                  onClick={() => setStage(item.id)}
                >
                  {platform() ? item.platform : item.band}
                  <span class="tabular-nums text-muted-foreground">{(counts()?.[item.id] ?? 0).toLocaleString()}</span>
                </Button>
              )}</For>
            </div>
          }
          empty={<EmptyState icon={<Inbox />} label={emptyLabel(stage())} hint={emptyHint(stage(), platform())} />}
        />
        <Show when={counts() && counts()![stage()] > rows().length}>
          <p class="mt-2 text-xs text-muted-foreground">
            Showing {rows().length} of {counts()![stage()].toLocaleString()}.
          </p>
        </Show>
      </Show>

      <ActionSheet
        slug={props.slug}
        write={write()}
        onClose={() => setWrite(null)}
        onDone={() => { setWrite(null); refresh() }}
      />
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
