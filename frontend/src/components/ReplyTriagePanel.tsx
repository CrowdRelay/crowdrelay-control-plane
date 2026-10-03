import { Show, createSignal, type JSX } from 'solid-js'
import { CircleCheck, Inbox, MoreHorizontal, Zap } from 'lucide-solid'
import { ErrorCard, Section } from './layout'
import { failureLine } from '../lib/errors'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { capabilityAction } from '../lib/capabilities'
import { confidencePercent, money } from '../lib/format'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'
import { refreshQueries } from '../lib/refresh'
import { EmptyState } from './ui/empty-state'
import type { ReplyTriageEntry, WaitingReply } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { SkeletonReplyTriage } from './Skeleton'
import { SectionIcon } from './SectionIcon'
import { Tile, Tiles } from './ui/dash'
import { Button } from './app/button'
import { DataTable, type ColumnDef } from './app/data-table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu'
import { ActionSheet, type OpenWrite } from './capabilities/ActionSheet'
import { READ_ONLY_REASON } from '../lib/read-only'

const timeAgo = (value: string | null | undefined) => {
  if (!value) return 'never'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  const seconds = Math.floor((Date.now() - parsed.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const dispositionTone = (disp: string | null): 'good' | 'warn' | 'bad' | 'muted' => {
  if (!disp) return 'muted'
  if (disp === 'positive') return 'good'
  if (disp === 'declined') return 'warn'
  if (disp === 'do_not_contact') return 'bad'
  return 'muted'
}

const dispositionLabel = (disp: string | null) =>
  disp ?? 'pending'

const reasonLabel = (reason: string | null) => {
  const labels: Record<string, string> = {
    ambiguous_text: 'Ambiguous text',
    not_in_supported_language: 'Not in supported language',
    too_short: 'Too short',
    previous_do_not_contact: 'Previous DNC',
    unmatched_text: 'Unmatched',
    negotiation_reply: 'Negotiation reply',
  }
  return reason ? (labels[reason] ?? reason) : null
}

const targetKindLabel = (kind: string) =>
  kind.replace(/_/g, ' ')


/** Now, in the shape a datetime-local input takes: the answer being logged
 *  is usually today's, and the form needs one to submit. */
const localNow = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

const card = 'rounded-xl border border-border bg-card p-4 sm:p-5'

export function ReplyTriagePanel() {
  const params = useParams({ strict: false }) as () => { slug: string }
  const queryClient = useQueryClient()
  // The reply queue rides the tenant's /today snapshot — same query key the
  // page already holds, so this subscriber adds no request of its own.
  const model = useQuery(() => ({
    queryKey: ['tenant-today', params().slug],
    queryFn: () => api.tenantToday(params().slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // Same retry rule the page carries — every observer of a shared key
    // must poll a degraded section until it fills, or this subscriber's
    // "retrying" note would lie when it ever mounts alone.
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))

  const data = () => model.data?.reply_triage
  const waiting = () => data()?.waiting_on_you ?? []
  const waitingCount = () => data()?.summary.waiting_on_you_count ?? waiting().length
  const platform = () => authState.isPlatformLevel()
  const readOnly = () => authState.readOnly()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['tenant-today', params().slug] })

  // "I wrote back" and "Log their answer" open beside the table.
  const [write, setWrite] = createSignal<OpenWrite | null>(null)
  // Marking a reply positive / declined / do-not-contact happens in place.
  const [busy, setBusy] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const resolve = async (entry: ReplyTriageEntry, disposition: string) => {
    if (busy()) return
    setBusy(entry.id)
    setError(null)
    try {
      await api.recordBeaconReply(params().slug, entry.target_id, {
        eventId: entry.id,
        disposition,
        occurredAt: new Date().toISOString(),
      })
      refreshQueries(['tenant-today', params().slug])
    } catch (err) {
      setError(failureLine("Couldn't save the reply status", err))
    } finally {
      setBusy(null)
    }
  }

  // `items` is a function so the menu items are created inside the menu —
  // Kobalte's item reads the menu context when it is built.
  const rowMenu = (label: string, items: () => JSX.Element) => (
    <DropdownMenu placement="bottom-end">
      <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="size-8">
        <span class="sr-only">Open menu for {label}</span>
        <MoreHorizontal aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent class="min-w-44">{items()}</DropdownMenuContent>
    </DropdownMenu>
  )
  const writeItem = (label: string, onSelect: () => void, class_?: string) => (
    <DropdownMenuItem class={class_} disabled={readOnly()} title={readOnly() ? READ_ONLY_REASON : undefined} onSelect={onSelect}>{label}</DropdownMenuItem>
  )

  const waitingColumns: ColumnDef<WaitingReply, any>[] = [
    {
      id: 'contact', header: 'Contact', accessorFn: c => c.display_name,
      cell: cell => <>
        <span class="font-medium text-foreground">{cell.row.original.display_name}</span>
        <Show when={cell.row.original.reply_label}><span class="block text-muted-foreground">{cell.row.original.reply_label}</span></Show>
      </>,
    },
    { id: 'kind', header: 'Kind', accessorFn: c => targetKindLabel(c.target_kind), meta: { class: 'whitespace-nowrap first-letter:uppercase' } },
    {
      id: 'answer', header: 'Answer', accessorFn: c => c.disposition, meta: { class: 'whitespace-nowrap' },
      cell: cell => <StatusBadge status={cell.row.original.disposition} tone={dispositionTone(cell.row.original.disposition)} />,
    },
    { id: 'replied', header: 'They answered', accessorFn: c => c.replied_at, meta: { class: 'whitespace-nowrap' }, cell: cell => timeAgo(cell.row.original.replied_at) },
    {
      id: 'written', header: 'You last wrote', accessorFn: c => c.last_written_at ?? '', meta: { class: 'whitespace-nowrap' },
      cell: cell => cell.row.original.last_written_at ? timeAgo(cell.row.original.last_written_at) : <span class="text-muted-foreground">Never</span>,
    },
    {
      id: 'actions', header: () => <span class="sr-only">Actions</span>, enableSorting: false, enableHiding: false,
      meta: { class: 'w-12 text-right' },
      cell: cell => {
        const c = cell.row.original
        return rowMenu(c.display_name, () => <>
          {writeItem('I wrote back', () => setWrite({
            title: 'I wrote back',
            description: c.display_name,
            action: capabilityAction('outreach-conversations', 'I wrote back'),
            fixed: { target_id: c.target_id },
            initial: { occurred_at: localNow() },
          }))}
          {writeItem('Log their answer', () => setWrite({
            title: 'Log their answer',
            description: c.display_name,
            action: capabilityAction('outreach-replies', 'Record a reply'),
            fixed: { target_id: c.target_id },
            initial: { disposition: c.disposition, occurred_at: localNow() },
            hidden: ['opportunity_id'],
          }))}
        </>)
      },
    },
  ]

  const replyColumns = (actionable: boolean): ColumnDef<ReplyTriageEntry, any>[] => [
    {
      id: 'reply', header: 'Reply', accessorFn: e => e.reply_text,
      cell: cell => {
        const e = cell.row.original
        return <span class="block max-w-xl">
          <span class="block font-medium text-foreground first-letter:uppercase">{targetKindLabel(e.target_kind)}</span>
          <span class="block text-muted-foreground text-pretty">{e.reply_text}</span>
          <Show when={e.proposed_fee_minor != null && e.proposed_currency != null}>
            <span class="block text-foreground">Proposes {money(e.proposed_fee_minor!, e.proposed_currency!)} — confirm it under Negotiations</span>
          </Show>
        </span>
      },
    },
    {
      id: 'reason', header: 'Why it needs you', accessorFn: e => reasonLabel(e.human_review_reason) ?? '',
      meta: { label: 'Why it needs you' },
      cell: cell => {
        const e = cell.row.original
        return <>
          {reasonLabel(e.human_review_reason) ?? '—'}
          <Show when={e.matched_rules.length > 0}><span class="block text-xs text-muted-foreground">Rules: {e.matched_rules.join(', ')}</span></Show>
        </>
      },
    },
    { id: 'confidence', header: 'Confidence', accessorFn: e => e.confidence_basis_points, meta: { numeric: true, class: 'whitespace-nowrap' }, cell: cell => confidencePercent(cell.row.original.confidence_basis_points) },
    { id: 'classified', header: 'When', accessorFn: e => e.classified_at, meta: { class: 'whitespace-nowrap' }, cell: cell => timeAgo(cell.row.original.classified_at) },
    {
      id: 'status', header: 'Status', accessorFn: e => dispositionLabel(e.classified_disposition), meta: { class: 'whitespace-nowrap' },
      cell: cell => <StatusBadge status={dispositionLabel(cell.row.original.classified_disposition)} tone={dispositionTone(cell.row.original.classified_disposition)} />,
    },
    ...(actionable ? [{
      id: 'actions', header: () => <span class="sr-only">Actions</span>, enableSorting: false, enableHiding: false,
      meta: { class: 'w-12 text-right' },
      cell: (cell: { row: { original: ReplyTriageEntry } }) => {
        const e = cell.row.original
        return <Show when={busy() !== e.id} fallback={<span class="text-xs text-muted-foreground">Saving…</span>}>
          {rowMenu(targetKindLabel(e.target_kind), () => <>
            {writeItem('Mark positive', () => void resolve(e, 'positive'))}
            {writeItem('Mark declined', () => void resolve(e, 'declined'))}
            <DropdownMenuSeparator />
            {writeItem('Do not contact', () => void resolve(e, 'do_not_contact'), 'text-destructive')}
          </>)}
        </Show>
      },
    } satisfies ColumnDef<ReplyTriageEntry, any>] : []),
  ]
  const needsHumanColumns = replyColumns(true)
  const autoColumns = replyColumns(false).filter(c => c.id !== 'reason')

  const replySearch = (e: ReplyTriageEntry) => [targetKindLabel(e.target_kind), e.reply_text, reasonLabel(e.human_review_reason), e.classified_disposition].filter(Boolean).join(' ')

  return <div class="space-y-6">
    <p class="text-sm text-muted-foreground text-pretty">{platform() ? 'Inbound replies the classifier could not resolve on its own. Read the text, then decide.' : 'Inbound replies it could not sort on its own. Read the text, then decide.'}</p>

    <Show when={model.error}>
      <ErrorCard title="Couldn't load replies" error={model.error} onRetry={() => void model.refetch()} />
    </Show>
    <Show when={error()}><ErrorCard>{error()}</ErrorCard></Show>

    <Show when={!model.error && model.isPending}><SkeletonReplyTriage /></Show>

    {/* The today snapshot loaded but the tenant's triage section did not —
        degraded, not empty. The page retries until it fills; say so instead
        of leaving a blank tab. */}
    <Show when={model.data && !data()}>
      <div class="rounded-lg border border-warning-solid/30 bg-warning-solid/10 p-4 text-sm text-warning-foreground" role="status">
        {platform() ? 'Reply triage did not answer — retrying shortly.' : 'The replies list did not answer — retrying shortly.'}
      </div>
    </Show>

    <Show when={data()}>{d => <>
      {/* The same tile strip as the Today overview. "Classified" used to be
          coloured green, orange and red under three static labels, which read
          as three states when it was one word. */}
      <Tiles cols={d().summary.pending_count > 0 ? 5 : 4}>
        <Tile label="Needs a human" value={d().summary.needs_human_count} valueTone={d().summary.needs_human_count > 0 ? 'warn' : undefined} sub="Waiting for your review" />
        <Tile label="Auto positive" value={d().summary.auto_positive_count} sub="Sorted on its own" />
        <Tile label="Auto declined" value={d().summary.auto_declined_count} sub="Sorted on its own" />
        <Tile label="Do not contact" value={d().summary.auto_do_not_contact_count} sub="Sorted on its own" />
        <Show when={d().summary.pending_count > 0}>
          <Tile label="Pending" value={d().summary.pending_count} valueTone="warn" sub="Queued for sorting" />
        </Show>
      </Tiles>

      {/* Answered you. The classifier's queue only sees replies that went
          through it; people who answered by a route it never reads — the
          reply form, the sheet import — were invisible here while they
          waited. Their last word is theirs, so the next move is the act's. */}
      <Show when={waitingCount() > 0}>
        <div class={card} id="answered">
          <Section
            flush
            title="Answered you — your turn"
            icon={<SectionIcon name="mail" />}
            count={waitingCount()}
            description={platform()
              ? 'Contacts whose latest logged message is inbound, from the outreach interaction ledger. A declined or do-not-contact answer closes the row; an outbound message logged after the reply ("I wrote back") does too.'
              : 'They wrote back and nobody has answered them since. Reply from your mailbox, then mark "I wrote back" — or log their answer if it was a no.'}
          >
            <DataTable
              data={waiting()}
              columns={waitingColumns}
              getRowId={c => c.target_id}
              bordered={false}
              searchText={c => [c.display_name, c.reply_label, targetKindLabel(c.target_kind), c.disposition].filter(Boolean).join(' ')}
              searchPlaceholder="Search by name or answer"
              initialSorting={[{ id: 'replied', desc: false }]}
              empty={<EmptyState icon={<CircleCheck />} label="Nobody is waiting on you" hint="When someone you pitched writes back, they land here until you answer." />}
            />
            <Show when={waitingCount() > waiting().length}>
              <p class="mt-2 text-xs text-muted-foreground">{waitingCount() - waiting().length} more not listed — the oldest are cut first.</p>
            </Show>
          </Section>
        </div>
      </Show>

      <div class={card}>
        <Section flush title="Read these" icon={<Inbox class="size-4" />} count={d().needs_human.length} description="Replies it couldn't sort on its own. Read each one, then mark it positive, declined or do not contact.">
          <DataTable
            data={d().needs_human}
            columns={needsHumanColumns}
            getRowId={e => e.id}
            bordered={false}
            searchText={replySearch}
            searchPlaceholder="Search replies"
            initialSorting={[{ id: 'classified', desc: true }]}
            empty={<EmptyState icon={<CircleCheck />} label="No replies need human review" hint={platform() ? 'The agent handles routine replies automatically. Items that need a human touch appear here.' : 'It handles routine replies on its own. Items that need a person appear here.'} />}
          />
        </Section>
      </div>

      <Show when={d().recent_auto.length > 0}>
        <div class={card}>
          <Section flush title="Classified without a human" icon={<Zap class="size-4" />} count={d().recent_auto.length} description="Recent replies it sorted on its own — check one now and then.">
            <DataTable
              data={d().recent_auto}
              columns={autoColumns}
              getRowId={e => e.id}
              bordered={false}
              searchText={replySearch}
              searchPlaceholder="Search replies"
              initialSorting={[{ id: 'classified', desc: true }]}
            />
          </Section>
        </div>
      </Show>

      <ActionSheet
        slug={params().slug}
        write={write()}
        onClose={() => setWrite(null)}
        onDone={() => { setWrite(null); refresh() }}
      />
    </>}</Show>
  </div>
}
