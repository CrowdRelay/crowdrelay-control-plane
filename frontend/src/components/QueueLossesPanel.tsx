import { For, Show, createSignal } from 'solid-js'
import { Skeleton } from './ui/skeleton'
import { api, ApiError } from '../lib/api'
import { authState } from '../lib/auth'
import { formatTimestamp, humanizeToken, timestampMillis } from '../lib/format'
import { labelOr, CONTEXT_LABELS, DECISION_KIND_LABELS, SUBJECT_KIND_LABELS } from '../lib/opportunity-labels'
import type { BandNotice, FailedSend, FailedSends, LapsedApprovals, RejectedAgentOutcome, SentRecord } from '../lib/types'
import { KpiCard, KpiStrip, PanelTitle, Section } from './layout'
import { EmptyState } from './ui/empty-state'
import { SectionIcon } from './SectionIcon'
import { Card } from './app/card'
import { Button } from './app/button'
import { DataTable, type ColumnDef } from './app/data-table'
import { Pill, type Tone } from './ui/dash'
import { Dialog } from './Dialog'

// The approval queue's other half, and the sends that never arrived.
//
// `needs_you` on the inbox shows what is pending. These two panels show what
// the same queue already lost: the asks that reached their deadline, and the
// outward sends that failed named by who never heard from the tenant. Every
// outbound channel in this system drafts and waits for a person — the
// operator *is* the throughput limit, and a queue that empties itself every
// 72 hours without telling anybody converts that limit into silent loss.
//
// Absent is not empty. When the tenant does not publish a section at all,
// the panel says so instead of showing a zero nobody counted.

// Three causes, three different things to do about them — one "expired"
// bucket would make the operator's own unanswered queue look the same as
// the machine withdrawing a question it should not have asked.
const CAUSE: Record<string, { label: string; tone: 'destructive' | 'warning' | 'muted'; why: string }> = {
  approval_expired: {
    label: 'unanswered',
    tone: 'destructive',
    why: 'The window closed with nobody answering — the work is spent.',
  },
  insufficient_evidence: {
    label: 'withdrawn by the brain',
    tone: 'muted',
    why: 'The machine withdrew its own ask — the decision carried no confidence.',
  },
  awaiting_sweep: {
    label: 'past deadline',
    tone: 'warning',
    why: 'Past its window and not yet swept — too late to answer, not yet recorded.',
  },
}
const causeOf = (cause: string) =>
  CAUSE[cause] ?? { label: cause.replace(/_/g, ' '), tone: 'muted' as const, why: '' }

// The worker output the brain declined — the admission gate's own list.
//
// Rejection is the system working: the deterministic worker refuses LLM
// output that fails verification, and that refusal is how the brain stays
// unpolluted. What the operator needs is the feed, not a count — a burst of
// rejections on one worker means its output drifted from the contract the
// gate enforces, which is a prompt or a contract to fix, and the watchdog's
// aggregate never said which.

const OUTCOME_KIND_LABELS: Record<string, string> = {
  press_pitch: 'press pitch',
  social_post: 'social post',
  audience_segments: 'audience segments',
  outreach_targets: 'outreach targets',
  campaign_insight: 'campaign insight',
  release_plan_note: 'release plan note',
  generic_insight: 'generic insight',
}

export function RejectedOutcomesPanel(props: {
  outcomes: RejectedAgentOutcome[] | undefined
  notReported: string[]
}) {
  const reported = () => !props.notReported.includes('rejected_agent_outcomes')
  const items = () => props.outcomes ?? []
  const platform = authState.isPlatformLevel

  return <Card flat class="space-y-4">
    <div>
      <PanelTitle icon={<SectionIcon name="shield" />}>What the brain declined</PanelTitle>
      <p class="text-muted-foreground text-sm mt-1">
        Worker output the admission gate refused in the last 7 days — in the gate's own words.
      </p>
    </div>

    <Show when={reported() && props.outcomes !== undefined} fallback={
      <div class="p-4 border border-border rounded-lg bg-background text-left">
        <EmptyState
          label="Not reported"
          hint={platform()
            ? 'This tenant does not publish rejected outcomes — the console cannot show what it was never told.'
            : 'Nothing is reported yet — this space stays empty until there is something to show.'}
        />
      </div>
    }>
      <Show when={items().length > 0} fallback={
        <p class="text-muted-foreground text-sm">Nothing refused in the window — every worker output passed the gate.</p>
      }>
        <KpiStrip class="mb-0">
          <KpiCard label="Refused in the window" value={items().length} tone="warn" />
        </KpiStrip>

        <div class="flex flex-col gap-2">
          <For each={items()}>{outcome =>
            <div class="rounded-md border border-border bg-background px-3 py-2 text-sm">
              <div class="flex items-center gap-2 flex-wrap">
                <strong class="text-foreground">{OUTCOME_KIND_LABELS[outcome.kind] ?? outcome.kind.replace(/_/g, ' ')}</strong>
                <span class="text-xs text-muted-foreground">{formatTimestamp(outcome.created_at)}</span>
              </div>
              <Show when={outcome.rejection_reason} fallback={
                <span class="block mt-1 text-xs text-muted-foreground">Refused before reasons were recorded — the outcome row is the only trace.</span>
              }>
                <span class="block mt-1 text-xs text-muted-foreground">
                  The gate said: <span class="text-foreground">{outcome.rejection_reason}</span>
                </span>
              </Show>
            </div>
          }</For>
        </div>
      </Show>
    </Show>
  </Card>
}

// The notices the band is owed — show tasks, release reports, deal
// updates. Each row is the durable record an escalation left behind; the
// `delivered` flag is whether the email behind it actually left, so an
// undelivered notice is work that happened and nobody was told.

const NOTICE_KIND_LABELS: Record<string, string> = {
  'show.task_attention_required': 'show task needs the band',
  'show.post_show_report_due': 'post-show report due',
  'release.r3_report_due': 'release 3-day report',
  'release.r14_report_due': 'release 14-day report',
  'release.likely_listeners': 'likely listeners',
  'release.editorial_pitch_parked': 'editorial pitch parked',
  'release.editorial_pitch_escalated': 'editorial pitch escalated',
  'opportunity.counterparty_report_issued': 'deal report issued',
}

const noticeSubject = (detail: Record<string, unknown>): string | null => {
  for (const key of ['event_title', 'title', 'release_title', 'task', 'counterparty']) {
    const value = detail[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

// ── What got lost ───────────────────────────────────────────────────────
// The four ways work went missing, as one table: asks that lapsed, sends
// that never arrived, worker output the gate refused, and escalations the
// band was owed. Filtered by chips; each row says why in its own words.

type LossKind = 'lapsed' | 'failed' | 'declined' | 'notice'
const LOSS_LABEL: Record<LossKind, string> = { lapsed: 'Lapsed asks', failed: 'Failed sends', declined: 'Declined', notice: 'Notices' }
const CAUSE_TONE: Record<'destructive' | 'warning' | 'muted', Tone> = { destructive: 'bad', warning: 'warn', muted: 'muted' }

type LossRow = {
  id: string
  kind: LossKind
  title: string
  detail: string
  note?: string
  status: { label: string; tone: Tone }
  when: string | null
  send?: FailedSend
}

export function InboxLossesPanel(props: {
  slug: string
  lapsed: LapsedApprovals | null | undefined
  failed: FailedSends | null | undefined
  outcomes: RejectedAgentOutcome[] | undefined
  notices: BandNotice[] | undefined
  notReported: string[]
}) {
  const platform = authState.isPlatformLevel()
  const reported = (name: string, value: unknown) => !props.notReported.includes(name) && value != null
  const [show, setShow] = createSignal<LossKind | 'all'>('all')
  const [viewing, setViewing] = createSignal<FailedSend | null>(null)

  const rows = (): LossRow[] => {
    const out: LossRow[] = []
    for (const item of props.lapsed?.items ?? []) {
      const cause = causeOf(item.cause)
      out.push({
        id: `lapsed-${out.length}`, kind: 'lapsed',
        title: labelOr(DECISION_KIND_LABELS, item.action_kind),
        detail: `${labelOr(CONTEXT_LABELS, item.context)} · ${labelOr(SUBJECT_KIND_LABELS, item.subject_kind)}`,
        note: [cause.why, item.reason].filter(Boolean).join(' '),
        status: { label: sentence(cause.label), tone: CAUSE_TONE[cause.tone] },
        when: item.approval_expires_at ?? item.finished_at ?? null,
      })
    }
    for (const send of props.failed?.items ?? []) {
      out.push({
        id: `failed-${send.action_id}`, kind: 'failed', send,
        title: labelOr(DECISION_KIND_LABELS, send.action_kind),
        detail: send.recipients.length > 0
          ? `Never reached: ${send.recipients.join(', ')}`
          : 'It failed before naming anyone — nobody was written to.',
        note: [labelOr(CONTEXT_LABELS, send.context), send.attempt_count > 1 ? `${send.attempt_count} attempts` : null].filter(Boolean).join(' · '),
        status: { label: send.error_kind ? sentence(humanizeToken(send.error_kind)) : 'Failed', tone: 'bad' },
        when: send.finished_at ?? null,
      })
    }
    for (const outcome of props.outcomes ?? []) {
      out.push({
        id: `declined-${outcome.id ?? out.length}`, kind: 'declined',
        title: sentence(OUTCOME_KIND_LABELS[outcome.kind] ?? outcome.kind.replace(/_/g, ' ')),
        detail: outcome.rejection_reason
          ? `The gate said: ${outcome.rejection_reason}`
          : 'Refused before reasons were recorded — the outcome row is the only trace.',
        status: { label: 'Refused', tone: 'muted' },
        when: outcome.created_at,
      })
    }
    for (const notice of props.notices ?? []) {
      out.push({
        id: `notice-${notice.id ?? out.length}`, kind: 'notice',
        title: sentence(NOTICE_KIND_LABELS[notice.kind] ?? humanizeToken(notice.kind)),
        detail: noticeSubject(notice.detail) ?? 'No subject recorded',
        status: notice.delivered ? { label: 'Delivered', tone: 'good' } : { label: 'Not delivered', tone: 'warn' },
        when: notice.created_at,
      })
    }
    return out
  }
  const countOf = (kind: LossKind | 'all') => kind === 'all' ? rows().length : rows().filter(r => r.kind === kind).length
  const visible = () => show() === 'all' ? rows() : rows().filter(r => r.kind === show())

  const columns: ColumnDef<LossRow, any>[] = [
    {
      id: 'item', header: 'What', accessorFn: r => r.title, meta: { class: 'min-w-72' },
      cell: c => {
        const r = c.row.original
        return <div class="max-w-xl">
          <span class="font-medium text-foreground">{r.title}</span>
          <span class="block text-muted-foreground text-pretty">{r.detail}</span>
          <Show when={r.note}><span class="mt-0.5 block text-xs text-muted-foreground text-pretty">{r.note}</span></Show>
        </div>
      },
    },
    {
      id: 'kind', header: 'Kind', accessorFn: r => LOSS_LABEL[r.kind], meta: { class: 'whitespace-nowrap' },
      cell: c => <span class="text-muted-foreground">{LOSS_LABEL[c.row.original.kind]}</span>,
    },
    {
      id: 'status', header: 'Status', accessorFn: r => r.status.label, meta: { class: 'whitespace-nowrap' },
      cell: c => <Pill tone={c.row.original.status.tone}>{c.row.original.status.label}</Pill>,
    },
    {
      id: 'when', header: 'When', accessorFn: r => timestampMillis(r.when) || 0, meta: { class: 'whitespace-nowrap' },
      cell: c => <span class="text-muted-foreground">{c.row.original.when ? formatTimestamp(c.row.original.when) : '—'}</span>,
    },
    {
      id: 'actions', header: () => <span class="sr-only">Actions</span>, enableSorting: false, enableHiding: false,
      meta: { class: 'text-right whitespace-nowrap' },
      cell: c => <Show when={c.row.original.send}>{send =>
        <Button variant="outline" size="sm" onClick={() => setViewing(send())}>What it tried to send<span class="sr-only">: {c.row.original.title}, {c.row.original.when ? formatTimestamp(c.row.original.when) : ''}</span></Button>
      }</Show>,
    },
  ]

  // Absent is not empty: a list the tenant never published is named once,
  // and a list longer than the window carried says how much it left out.
  const notes = () => {
    const out: string[] = []
    const missing = [
      !reported('lapsed_approvals', props.lapsed) && 'lapsed asks',
      !reported('failed_sends', props.failed) && 'failed sends',
      !reported('rejected_agent_outcomes', props.outcomes) && 'declined work',
      !reported('band_notices', props.notices) && 'band notices',
    ].filter((v): v is string => typeof v === 'string')
    if (missing.length > 0) {
      out.push(platform
        ? `This tenant does not publish ${missing.join(', ')} — the console cannot show what it was never told.`
        : `Not reported yet: ${missing.join(', ')}.`)
    }
    const lapsedMore = (props.lapsed?.total ?? 0) - (props.lapsed?.items.length ?? 0)
    if (lapsedMore > 0) out.push(`${lapsedMore} more lapsed asks are not listed — the tile counts every lapse in the window.`)
    const failedMore = (props.failed?.total ?? 0) - (props.failed?.items.length ?? 0)
    if (failedMore > 0) out.push(`${failedMore} more failed sends are not listed.`)
    return out
  }

  const CHIPS: (LossKind | 'all')[] = ['all', 'lapsed', 'failed', 'declined', 'notice']

  return <section class="rounded-xl border border-border bg-card p-4 sm:p-5">
    <Section
      flush
      title="What got lost"
      icon={<SectionIcon name="history" />}
      count={rows().length}
      description={`The queue's other half: asks that ran out of time, sends that never arrived, work the gate refused, and notices ${platform ? 'the band was' : 'you were'} owed — the last ${props.lapsed?.window_days ?? 7} days.`}
    >
      <DataTable
        data={visible()}
        columns={columns}
        getRowId={r => r.id}
        bordered={false}
        initialSorting={[{ id: 'when', desc: true }]}
        searchText={r => [r.title, r.detail, r.note, r.status.label].filter(Boolean).join(' ')}
        searchPlaceholder="Search what got lost"
        toolbar={
          <div role="group" aria-label="Kind" class="flex flex-wrap items-center gap-1">
            <For each={CHIPS}>{id => (
              <Button variant={show() === id ? 'secondary' : 'ghost'} size="sm" aria-pressed={show() === id} onClick={() => setShow(id)}>
                {id === 'all' ? 'All' : LOSS_LABEL[id]}
                <span class="tabular-nums text-muted-foreground">{countOf(id)}</span>
              </Button>
            )}</For>
          </div>
        }
        empty={rows().length === 0
          ? <EmptyState label="Nothing lost" hint="Every ask got an answer in time, every send arrived, and every notice reached the band." />
          : <EmptyState label="Nothing here" hint="Nothing matches this filter.">
              <Button variant="outline" size="sm" onClick={() => setShow('all')}>Show everything</Button>
            </EmptyState>}
      />
      <For each={notes()}>{note => <p class="mt-3 text-xs text-muted-foreground">{note}</p>}</For>
    </Section>

    <Dialog
      open={viewing() !== null}
      onClose={() => setViewing(null)}
      label="What it tried to send"
      description={viewing() ? labelOr(DECISION_KIND_LABELS, viewing()!.action_kind) : undefined}
    >
      <Show when={viewing()} keyed>{send => <SentRecordView slug={props.slug} send={send} />}</Show>
    </Dialog>
  </section>
}

/** The sent record behind a failed send — the words it tried to carry and
 *  the addresses it went to — fetched when opened, not per row on mount. */
function SentRecordView(props: { slug: string; send: FailedSend }) {
  const [record, setRecord] = createSignal<SentRecord | 'none' | 'error' | null>(null)
  void (async () => {
    try {
      setRecord(await api.actionSentRecord(props.slug, props.send.action_id))
    } catch (error) {
      // 404 is the honest answer, not a failure: the action never emitted,
      // so nobody was written to.
      setRecord(error instanceof ApiError && error.status === 404 ? 'none' : 'error')
    }
  })()
  return <div class="flex flex-col gap-2 text-sm">
    <Show when={record() === null}><div role="status" class="flex flex-col gap-1.5"><span class="sr-only">Loading…</span><Skeleton class="h-3.5 w-3/5" /><Skeleton class="h-3.5 w-2/5" /></div></Show>
    <Show when={record() === 'none'}>
      <p class="text-muted-foreground">Nothing left — the action never emitted, so there are no words and no addresses to show.</p>
    </Show>
    <Show when={record() === 'error'}>
      <p class="text-error-foreground">Couldn't load this record. Close this and open it again to retry.</p>
    </Show>
    <Show when={record() !== null && record() !== 'none' && record() !== 'error'}>
      {(() => {
        const r = record() as SentRecord
        return <>
          <Show when={r.subject}><p class="font-medium text-foreground">{r.subject}</p></Show>
          <Show when={r.body}><p class="whitespace-pre-wrap leading-relaxed text-muted-foreground">{r.body}</p></Show>
          <Show when={!r.subject && !r.body}>
            <p class="text-muted-foreground">The emission carried no rendered words — it was a reference, not a message.</p>
          </Show>
          <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Show when={r.event_type}><span class="font-mono">{r.event_type}</span></Show>
            <Show when={r.executor_status}><span>executor: {humanizeToken(r.executor_status!)}</span></Show>
            <Show when={r.provider_reference}><span>ref: <span class="font-mono">{r.provider_reference}</span></span></Show>
          </div>
          <Show when={r.recipients.length > 0}>
            <p class="text-xs text-muted-foreground">Addressed to: {r.recipients.join(', ')}</p>
          </Show>
        </>
      })()}
    </Show>
  </div>
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
