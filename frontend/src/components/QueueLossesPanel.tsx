import { For, Show, createSignal } from 'solid-js'
import { api, ApiError } from '../lib/api'
import { authState } from '../lib/auth'
import { formatTimestamp } from '../lib/format'
import { labelOr, CONTEXT_LABELS, DECISION_KIND_LABELS, SUBJECT_KIND_LABELS } from '../lib/opportunity-labels'
import type { FailedSend, FailedSends, LapsedApprovals, RejectedAgentOutcome, SentRecord } from '../lib/types'
import { KpiCard, KpiStrip, PanelTitle } from './layout'
import { EmptyState } from './ui/empty-state'
import { SectionIcon } from './SectionIcon'
import { Card } from './app/card'
import { Badge } from './app/badge'
import { Spinner } from './Spinner'

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

export function LapsedApprovalsPanel(props: {
  lapsed: LapsedApprovals | null | undefined
  notReported: string[]
}) {
  const reported = () => !props.notReported.includes('lapsed_approvals')
  const items = () => props.lapsed?.items ?? []
  const total = () => props.lapsed?.total ?? 0
  const expiring = () => props.lapsed?.expiring_within_24h ?? 0
  const platform = authState.isPlatformLevel

  return <Card flat class="space-y-4">
    <div>
      <PanelTitle icon={<SectionIcon name="history" />}>Lost while waiting for an answer</PanelTitle>
      <p class="text-muted-foreground text-sm mt-1">
        Asks that reached their approval deadline in the last {props.lapsed?.window_days ?? 7} days — the queue's other half.
      </p>
    </div>

    <Show when={reported() && props.lapsed} fallback={
      <div class="p-4 border border-border rounded-lg bg-background text-left">
        <EmptyState
          label="Not reported"
          hint={platform()
            ? 'This tenant does not publish the approval queue’s losses — the console cannot show what it was never told.'
            : 'Nothing is reported yet — this space stays empty until there is something to show.'}
        />
      </div>
    }>
      <Show when={total() > 0 || expiring() > 0} fallback={
        <p class="text-muted-foreground text-sm">Nothing lapsed in the window. Every ask got an answer in time.</p>
      }>
        <KpiStrip class="mb-0">
          <KpiCard label="Lost in the window" value={total()} tone={total() > 0 ? 'warn' : 'default'} />
          <KpiCard
            label="Expiring within 24h"
            value={expiring()}
            sub="pending asks about to lapse"
            tone={expiring() > 0 ? 'warn' : 'default'}
          />
        </KpiStrip>

        <div class="flex flex-col gap-2">
          <For each={items()}>{(item) => {
            const cause = causeOf(item.cause)
            return <div class="flex flex-col gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm">
              <div class="flex items-center gap-2 flex-wrap">
                <strong class="text-foreground">{labelOr(DECISION_KIND_LABELS, item.action_kind)}</strong>
                <Badge variant="outline">{labelOr(CONTEXT_LABELS, item.context)}</Badge>
                <Badge variant="outline">{labelOr(SUBJECT_KIND_LABELS, item.subject_kind)}</Badge>
                <Badge variant={cause.tone}>{cause.label}</Badge>
                <Show when={item.approval_expires_at ?? item.finished_at}>
                  <span class="text-xs text-muted-foreground">
                    {item.cause === 'awaiting_sweep' ? 'closed' : 'ended'} {formatTimestamp(item.approval_expires_at ?? item.finished_at)}
                  </span>
                </Show>
              </div>
              <Show when={cause.why}>
                <span class="text-xs text-muted-foreground">{cause.why}</span>
              </Show>
              <Show when={item.reason}>
                <span class="text-xs leading-relaxed text-muted-foreground italic">{item.reason}</span>
              </Show>
            </div>
          }}</For>
          <Show when={total() > items().length}>
            <span class="text-xs text-muted-foreground">
              …and {total() - items().length} more the list omits — the count above is every lapse in the window.
            </span>
          </Show>
        </div>
      </Show>
    </Show>
  </Card>
}

/** One failed send row. Expanding fetches the sent record — the words it
 *  tried to carry and the addresses it went to — on demand, not per row on
 *  mount: a window with twenty failures should not fire twenty requests to
 *  render its summary. */
function FailedSendRow(props: { slug: string; send: FailedSend }) {
  const [record, setRecord] = createSignal<SentRecord | 'none' | 'error' | null>(null)
  const [loading, setLoading] = createSignal(false)

  const load = async () => {
    if (record() !== null || loading()) return
    setLoading(true)
    try {
      setRecord(await api.actionSentRecord(props.slug, props.send.action_id))
    } catch (error) {
      // 404 is the honest answer, not a failure: the action never emitted,
      // so nobody was written to.
      setRecord(error instanceof ApiError && error.status === 404 ? 'none' : 'error')
    } finally {
      setLoading(false)
    }
  }

  return <div class="rounded-md border border-border bg-background px-3 py-2 text-sm">
    <div class="flex items-center gap-2 flex-wrap">
      <strong class="text-foreground">{labelOr(DECISION_KIND_LABELS, props.send.action_kind)}</strong>
      <Badge variant="outline">{labelOr(CONTEXT_LABELS, props.send.context)}</Badge>
      <Show when={props.send.error_kind}>
        <Badge variant="destructive">{props.send.error_kind}</Badge>
      </Show>
      <Show when={props.send.attempt_count > 1}>
        <span class="text-xs text-muted-foreground">{props.send.attempt_count} attempts</span>
      </Show>
      <Show when={props.send.finished_at}>
        <span class="text-xs text-muted-foreground">{formatTimestamp(props.send.finished_at)}</span>
      </Show>
    </div>
    <Show when={props.send.recipients.length > 0} fallback={
      <span class="block mt-1 text-xs text-muted-foreground">It failed before naming anyone — nobody was written to.</span>
    }>
      <span class="block mt-1 text-xs text-muted-foreground">
        Never reached: <span class="text-foreground">{props.send.recipients.join(', ')}</span>
      </span>
    </Show>
    <details class="mt-1" onToggle={(e) => { if (e.currentTarget.open) void load() }}>
      <summary class="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-secondary-foreground">
        What it tried to send
      </summary>
      <div class="mt-2 flex flex-col gap-1.5 border-l-2 border-border pl-3 text-sm">
        <Show when={loading()}><span class="text-xs text-muted-foreground"><Spinner /> Loading…</span></Show>
        <Show when={record() === 'none'}>
          <span class="text-xs text-muted-foreground">Nothing left — the action never emitted, so there are no words and no addresses to show.</span>
        </Show>
        <Show when={record() === 'error'}>
          <span class="text-xs text-destructive">The record could not be read — try again.</span>
        </Show>
        <Show when={record() !== null && record() !== 'none' && record() !== 'error'}>
          {(() => {
            const r = record() as SentRecord
            return <>
              <Show when={r.subject}>
                <span class="text-foreground font-medium">{r.subject}</span>
              </Show>
              <Show when={r.body}>
                <span class="text-muted-foreground leading-relaxed whitespace-pre-wrap">{r.body}</span>
              </Show>
              <Show when={!r.subject && !r.body}>
                <span class="text-xs text-muted-foreground">The emission carried no rendered words — it was a reference, not a message.</span>
              </Show>
              <div class="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                <Show when={r.event_type}><span class="font-mono">{r.event_type}</span></Show>
                <Show when={r.executor_status}><span>executor: {r.executor_status}</span></Show>
                <Show when={r.provider_reference}>
                  <span>ref: <span class="font-mono">{r.provider_reference}</span></span>
                </Show>
              </div>
              <Show when={r.recipients.length > 0}>
                <span class="text-xs text-muted-foreground">Addressed to: {r.recipients.join(', ')}</span>
              </Show>
            </>
          })()}
        </Show>
      </div>
    </details>
  </div>
}

export function FailedSendsPanel(props: {
  slug: string
  failed: FailedSends | null | undefined
  notReported: string[]
}) {
  const reported = () => !props.notReported.includes('failed_sends')
  const items = () => props.failed?.items ?? []
  const total = () => props.failed?.total ?? 0
  const platform = authState.isPlatformLevel

  return <Card flat class="space-y-4">
    <div>
      <PanelTitle icon={<SectionIcon name="alert-triangle" />}>Didn’t get through</PanelTitle>
      <p class="text-muted-foreground text-sm mt-1">
        Outward sends that failed in the last {props.failed?.window_days ?? 7} days — named by who never heard from {platform() ? 'the tenant' : 'you'}.
      </p>
    </div>

    <Show when={reported() && props.failed} fallback={
      <div class="p-4 border border-border rounded-lg bg-background text-left">
        <EmptyState
          label="Not reported"
          hint={platform()
            ? 'This tenant does not publish failed sends — the console cannot show what it was never told.'
            : 'Nothing is reported yet — this space stays empty until there is something to show.'}
        />
      </div>
    }>
      <Show when={total() > 0} fallback={
        <p class="text-muted-foreground text-sm">Nothing failed in the window. Every send reached its address.</p>
      }>
        <KpiStrip class="mb-0">
          <KpiCard label="Failed in the window" value={total()} tone={total() > 0 ? 'warn' : 'default'} />
        </KpiStrip>

        <div class="flex flex-col gap-2">
          <For each={items()}>{(send) => <FailedSendRow slug={props.slug} send={send} />}</For>
          <Show when={total() > items().length}>
            <span class="text-xs text-muted-foreground">
              …and {total() - items().length} more the list omits — the count above is every failure in the window.
            </span>
          </Show>
        </div>
      </Show>
    </Show>
  </Card>
}

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
