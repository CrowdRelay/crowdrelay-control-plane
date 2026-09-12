import { For, Show, createMemo, createSignal } from 'solid-js'
import type { OpportunityBoardEntry } from '../lib/types'
import { api } from '../lib/api'
import { confidencePercent, errorMessage } from '../lib/format'
import { SkeletonOpportunityBoard } from './Skeleton'
import { APPROVE_EFFECT, CONTEXT_LABELS, DECISION_KIND_LABELS, SUBJECT_KIND_LABELS, RANK_FACTOR_LABELS, VALUE_TIER_LABELS, labelOr, opportunityTitle } from '../lib/opportunity-labels'
import { SectionIcon } from './SectionIcon'
import { Section, ErrorCard } from './layout'
import { Spinner } from './Spinner'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

// Phase 18 — find, then "do it". CrowdRelay parks what its agent found; this
// board is where a human decides. "Do it" approves through CrowdRelay's own
// approval endpoint and "done ourselves" records that a human took the
// opportunity outside the system — a first-class outcome, not a dismissal.
// The panel renders one slice of the Operations read model and never fetches.


const formatDue = (value: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleString()
}

const authorityTone = (entry: OpportunityBoardEntry): 'good' | 'warn' | 'bad' | 'muted' => {
  if (entry.authority === 'awaiting_approval') return 'warn'
  if (entry.authority === 'auto_executing') return 'good'
  if (entry.authority === 'recommended') return 'good'
  return 'muted'
}

const authorityLabel = (entry: OpportunityBoardEntry) =>
  entry.authority.replaceAll('_', ' ')

// Only a parked action can be approved. Everything else on this board is
// reported, not requested: `auto_executing` already ran under a bounded_auto
// policy, and `recommended`/`observed` never produced an action to approve.
//
// The button used to render whenever an `action_id` existed, which is true of
// every executed action too — so on a tenant whose policies are all
// bounded_auto, every "Do it" hit a 409 and the board looked broken while
// working exactly as designed.
const isApprovable = (entry: OpportunityBoardEntry) =>
  entry.authority === 'awaiting_approval' && entry.action_id !== null

const NOT_APPROVABLE_NOTE: Record<string, string> = {
  auto_executing: 'ran automatically — nothing to approve',
  recommended: 'advice only — no action was parked',
  observed: 'recorded for measurement — no action was parked',
}


// Basis points are the queue's only magnitude; percent is what a human reads.
const deviationLabel = (entry: OpportunityBoardEntry) =>
  entry.deviation_basis_points == null ? null : `${(entry.deviation_basis_points / 100).toFixed(1)}% measured movement`

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

/** Split a field value that is really a list of addresses. */
const asRecipients = (value: string): string[] => {
  const parts = value.split(/[,;]\s*/).map(part => part.trim()).filter(Boolean)
  return parts.length > 0 && parts.every(part => EMAIL.test(part)) ? parts : []
}

// A briefing field whose whole value is a record id. The backend emits these
// for events, campaigns and tasks — `event_id.to_string()` and friends — and
// they are the row an operator most wants gone: a UUID answers no question they
// can ask, and it is the widest thing on the line.
const isOpaqueId = (field: { label: string; value: string }) => UUID.test(field.value.trim())

/** Addresses, truncated. Thirty of them is not context, it is a wall. */
function Recipients(props: { addresses: string[] }) {
  const [expanded, setExpanded] = createSignal(false)
  const PREVIEW = 2
  const hidden = () => Math.max(0, props.addresses.length - PREVIEW)
  return (
    <span class="break-words">
      {(expanded() ? props.addresses : props.addresses.slice(0, PREVIEW)).join(', ')}
      <Show when={hidden() > 0}>
        {' '}
        <Show when={!expanded()}>…{' '}</Show>
        <button
          type="button"
          class="text-primary underline-offset-2 hover:underline"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded() ? 'show fewer' : `(${hidden()} more)`}
        </button>
      </Show>
    </span>
  )
}

// ── The drafted message ────────────────────────────────────────────────
//
// The autopilot writes outbound copy in the recipient's language — Polish to a
// Polish magazine, English to a radio station. The console is in the operator's
// language. Those two are different things and were rendering as one: the
// message arrived as a `key: value` blob joined with newlines, the newlines
// collapsed in HTML, and the result was one paragraph carrying the body, the
// follow-ups, a send date, a tone, a type and three UUIDs.
//
// A message to be sent is shown as a message: subject line, body with its line
// breaks intact, and a note saying which language it is in and why. Everything
// the operator is being asked to judge stays in their own language around it.

const DRAFT_META_LABELS: Record<string, string> = {
  tone: 'Tone',
  type: 'Kind',
  suggested_send_at: 'Suggested send date',
  platform: 'Channel',
  follow_ups: 'Follow-up plan',
}

/** Keys that carry the message itself rather than a fact about it. */
const DRAFT_BODY_KEYS = new Set(['body', 'subject'])

/** Keys whose value is a list of record ids — nothing an operator can use. */
const DRAFT_ID_KEYS = new Set(['target_refs', 'task_id', 'template_id'])

type ParsedDraft = {
  subject?: string
  body?: string
  meta: { label: string; value: string }[]
  recipients: number
}

/** `draft_to_text` emits `key: value` lines. Read them back apart. */
function parseDraft(raw: string): ParsedDraft | null {
  if (!raw.includes(':')) return null
  const parsed: ParsedDraft = { meta: [], recipients: 0 }
  let seen = 0
  // Keys start a line; a value may run on, so split on the key pattern rather
  // than on newlines the server may or may not have preserved.
  const parts = raw.split(/(?:^|\s)(?=(?:body|subject|tone|type|platform|follow_ups|suggested_send_at|target_refs|task_id|template_id):)/)
  for (const part of parts) {
    const match = /^(\w+):\s*([\s\S]*)$/.exec(part.trim())
    if (!match) continue
    const [, key, value] = match as unknown as [string, string, string]
    seen += 1
    if (DRAFT_BODY_KEYS.has(key)) {
      if (key === 'subject') parsed.subject = value.trim()
      else parsed.body = value.trim()
    } else if (DRAFT_ID_KEYS.has(key)) {
      const ids = value.match(/[0-9a-f-]{8,}/gi)
      if (key === 'target_refs' && ids) parsed.recipients = ids.length
    } else {
      const label = DRAFT_META_LABELS[key]
      if (label) parsed.meta.push({ label, value: value.replace(/^\[|\]$/g, '').replace(/^"|"$/g, '').trim() })
    }
  }
  return seen >= 2 && (parsed.body || parsed.subject) ? parsed : null
}

function DraftPreview(props: { draft: ParsedDraft; language?: string }) {
  return (
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span class="font-medium text-secondary-foreground">The message, as it will be sent</span>
        <Show when={props.draft.recipients > 0}>
          <span>to {props.draft.recipients} {props.draft.recipients === 1 ? 'contact' : 'contacts'}</span>
        </Show>
        <span>Written in the recipient's language, not yours.</span>
      </div>

      <div class="border border-border bg-surface-1">
        <Show when={props.draft.subject}>
          <div class="border-b border-border-subtle px-3 py-2">
            <span class="block text-xs text-muted-foreground">Subject</span>
            <strong lang={props.language} class="text-sm text-foreground">{props.draft.subject}</strong>
          </div>
        </Show>
        <Show when={props.draft.body}>
          {/* `whitespace-pre-wrap`: the body arrives with its paragraph breaks
              and the browser was collapsing them into one wall of text. */}
          <p lang={props.language} class="m-0 whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed text-secondary-foreground">
            {props.draft.body}
          </p>
        </Show>
      </div>

      <Show when={props.draft.meta.length > 0}>
        <dl class="m-0 flex flex-wrap gap-x-4 gap-y-1">
          <For each={props.draft.meta}>{item => (
            <div class="flex items-baseline gap-1.5">
              <dt class="text-xs text-muted-foreground">{item.label}</dt>
              <dd class="m-0 text-xs text-secondary-foreground">{item.value}</dd>
            </div>
          )}</For>
        </dl>
      </Show>
    </div>
  )
}

/** The parsed message inside a briefing, if it carries one. */
const draftOf = (briefing: { content: { label: string; value: string }[] }): ParsedDraft | null => {
  for (const field of briefing.content) {
    const parsed = parseDraft(field.value)
    if (parsed) return parsed
  }
  return null
}

/** Briefing rows worth showing: no record ids, and nothing the message preview
 *  already renders in full.
 *
 *  The subject arrives twice — once as its own row under a label written in the
 *  tenant's language ("Temat"), once inside the draft. The preview shows it
 *  under an English label, so the duplicate goes. */
const contentFields = (briefing: { content: { label: string; value: string }[] }) => {
  const draft = draftOf(briefing)
  return briefing.content.filter(field => {
    if (isOpaqueId(field) || parseDraft(field.value)) return false
    if (!draft) return true
    const value = field.value.trim()
    return value !== draft.subject?.trim() && !draft.subject?.trim().startsWith(value)
  })
}

const entryTitle = opportunityTitle

export function OpportunityBoardPanel(props: {
  slug: string
  opportunities: OpportunityBoardEntry[] | null
  degraded: boolean
  refresh: () => Promise<unknown>
}) {
  const board = {
    get data() { return props.opportunities ?? undefined },
    get error() { return props.degraded ? new Error('Opportunity queue is temporarily unavailable.') : undefined },
  }

  const [pendingMutation, setPendingMutation] = createSignal<string | null>(null)
  const [confirming, setConfirming] = createSignal<string | null>(null)
  const [mutationError, setMutationError] = createSignal<string | null>(null)
  const [showAll, setShowAll] = createSignal(false)
  const MAX_VISIBLE = 3

  // One mutation at a time; destructive intent needs a second click on the
  // same control before anything is sent.
  const decide = async (key: string, operation: () => Promise<unknown>) => {
    if (pendingMutation() !== null) return
    if (confirming() !== key) {
      setConfirming(key)
      return
    }
    setConfirming(null)
    setMutationError(null)
    setPendingMutation(key)
    try {
      await operation()
      await props.refresh()
    } catch (error) {
      setMutationError(errorMessage(error, 'Opportunity decision failed'))
    } finally {
      setPendingMutation(null)
    }
  }

  const approve = (entry: OpportunityBoardEntry) => {
    if (!entry.action_id) return
    void decide(`do:${entry.decision_id}`, () => api.approveOpportunityAction(props.slug, entry.action_id!))
  }

  // Reject used to live in the separate decision panel above this one, which
  // showed the same top entry. Merging the two panels would have dropped the
  // only way to cancel a parked action, so it moves here.
  const reject = (entry: OpportunityBoardEntry) => {
    if (!entry.action_id) return
    void decide(`reject:${entry.decision_id}`, () => api.cancelOpportunityAction(props.slug, entry.action_id!))
  }

  const doneOurselves = (entry: OpportunityBoardEntry) =>
    void decide(`done:${entry.decision_id}`, () => api.markOpportunityHandledExternally(props.slug, entry.decision_id))

  const all = () => board.data ?? []
  // One list, grouped by the only question the operator is asking: is this
  // mine to do? Everything else is reference.
  const needsYou = () => all().filter(isApprovable)
  const ranAlone = () => all().filter(e => e.authority === 'auto_executing')
  // The autopilot re-raises a standing finding every cycle, so "Agent Insight —
  // Analysed fan growth metrics…" arrived five times with identical wording and
  // an identical confidence. Five rows of the same sentence is not five
  // findings; it is one finding nobody has closed. Collapse on what the
  // operator reads — the kind and the reason — and keep the newest, carrying a
  // count so the repetition itself stays visible.
  const forInfo = createMemo(() => {
    const seen = new Map<string, OpportunityBoardEntry & { repeats: number }>()
    for (const entry of all()) {
      if (isApprovable(entry) || entry.authority === 'auto_executing') continue
      const key = `${entry.decision_kind}|${entry.reason}`
      const existing = seen.get(key)
      if (existing) existing.repeats += 1
      else seen.set(key, { ...entry, repeats: 1 })
    }
    return [...seen.values()]
  })

  return <>
    <Show when={board.error}>
      <Alert tone="warning" role="status">
        {errorMessage(board.error, 'Opportunity queue is temporarily unavailable.')}
      </Alert>
    </Show>

    <Show when={mutationError()}>
      {message => <ErrorCard>{message()}</ErrorCard>}
    </Show>

    <Show when={board.data} fallback={!board.error ? <SkeletonOpportunityBoard /> : null}>{data => <>
      <Show when={data().length === 0}>
        <Section flush title="Nothing waiting" icon={<SectionIcon name="target" />}>
          <p class="text-sm text-muted-foreground">
            The autopilot has found nothing that needs a decision. Anything it finds appears here the moment it raises it.
          </p>
        </Section>
      </Show>

      <Show when={needsYou().length > 0}>
        <Section
          flush
          title="Needs you now"
          icon={<SectionIcon name="target" />}
          count={needsYou().length}
          description="The autopilot prepared these and stopped, because its policy says to ask you first. Approve, reject, or record that you did it yourself."
        >
          <div class="border-t border-border">
            <For each={needsYou()}>{entry => <Row entry={entry} expanded />}</For>
          </div>
        </Section>
      </Show>

      <Show when={ranAlone().length > 0}>
        <Section
          title="Ran on its own"
          icon={<SectionIcon name="zap" />}
          count={ranAlone().length}
          description="Already done under a policy you set to act without asking. Here so you can see what it did."
        >
          <div class="border-t border-border">
            <For each={showAll() ? ranAlone() : ranAlone().slice(0, MAX_VISIBLE)}>{entry => <Row entry={entry} />}</For>
          </div>
          <Show when={ranAlone().length > MAX_VISIBLE}>
            <Button variant="ghost" size="sm" class="mt-2" onClick={() => setShowAll(v => !v)}>
              {showAll() ? 'Show fewer' : `Show all ${ranAlone().length}`}
            </Button>
          </Show>
        </Section>
      </Show>

      <Show when={forInfo().length > 0}>
        <Section
          title="Noted, no action taken"
          icon={<SectionIcon name="inbox" />}
          count={forInfo().length}
          description="Advice and measurements the autopilot recorded. Nothing was prepared, so there is nothing to approve."
        >
          <div class="border-t border-border">
            <For each={forInfo()}>{entry => <Row entry={entry} />}</For>
          </div>
        </Section>
      </Show>
    </>}</Show>
  </>

  // ── One row ──────────────────────────────────────────────────────────
  // Rows are separated by a hairline, not by a box each. A bordered box per
  // row inside a bordered panel inside a bordered page is three edges spent
  // on one list.
  function Row(rowProps: { entry: OpportunityBoardEntry; expanded?: boolean }) {
    const entry = () => rowProps.entry
    const busy = (key: string) => pendingMutation() === key
    return (
      <div class="flex flex-col gap-2 border-b border-border-subtle py-3.5 last:border-0 md:flex-row md:items-start md:justify-between md:gap-6">
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          {/* `opportunityTitle` prefers `briefing.summary`, which the backend
              writes in the tenant's language — a Polish heading on an English
              card. Where the briefing carries a drafted message, the decision
              kind names the same thing in the operator's language. */}
          <strong class="text-sm leading-snug text-foreground">
            {entry().briefing && draftOf(entry().briefing!)
              ? labelOr(DECISION_KIND_LABELS, entry().decision_kind)
              : entryTitle(entry())}
          </strong>
          <p class="m-0 text-sm leading-relaxed text-secondary-foreground">{entry().reason}</p>

          <div class="flex flex-wrap items-center gap-2">
            {/* A finding the autopilot raised with no confidence in it is not
                a 0% finding, it is one that never scored itself. */}
            <Show when={entry().confidence > 0}>
              <Badge variant="muted">confidence {confidencePercent(entry().confidence)}</Badge>
            </Show>
            <Show when={(entry() as { repeats?: number }).repeats! > 1}>
              <Badge variant="outline">raised {(entry() as { repeats?: number }).repeats} times</Badge>
            </Show>
            <Show when={formatDue(entry().due_at)}>
              {due => <Badge variant="warning">by {due()}</Badge>}
            </Show>
            <Show when={entry().decision_kind?.startsWith('agent.')}>
              <Badge variant="outline">written by AI</Badge>
            </Show>
          </div>

          <Show when={entry().consequence && entry().authority !== 'auto_executing'}>
            <small class="text-xs text-warning-light">If nobody acts: {entry().consequence}</small>
          </Show>

          {/* Everything below is reference. It opens on demand so a list of
              twenty does not become twenty essays. */}
          <details class="mt-0.5" open={rowProps.expanded && !!entry().briefing}>
            <summary class="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-secondary-foreground">
              Why this, and what it involves
            </summary>
            <div class="mt-2 flex flex-col gap-2 border-l-2 border-border pl-3">
              <div class="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{labelOr(CONTEXT_LABELS, entry().context)}</Badge>
                <Badge variant="outline">{labelOr(SUBJECT_KIND_LABELS, entry().subject_kind)}</Badge>
                {/* `ranked_by` is what separates this entry from the one
                    below it, not a claim about the whole queue — so "top of the
                    list because it is waiting on you" appeared on entry #2,
                    which is not top of anything. Only position 1 is. */}
                <Badge variant="outline">
                  {entry().position === 1 ? 'top of the list because ' : 'ranked here because '}
                  {RANK_FACTOR_LABELS[entry().ranked_by] ?? entry().ranked_by}
                </Badge>
                <Show when={entry().value_tier}>
                  {tier => <Badge variant="outline">{VALUE_TIER_LABELS[tier()] ?? tier()} value</Badge>}
                </Show>
                <Show when={deviationLabel(entry())}>
                  {label => <Badge variant="outline">{label()}</Badge>}
                </Show>
              </div>
              <Show when={entry().briefing}>
                {briefing => (
                  <>
                    {/* The backend writes this prose in the tenant's language,
                        so on a Polish tenant the operator met Polish
                        instructions inside an English console — and they say
                        the same thing the section header and the button
                        already say in their own language. Where there is a
                        drafted message, the message is the thing to read and
                        these are noise; elsewhere they are all the context
                        there is, so they stay. */}
                    <Show when={!draftOf(briefing())}>
                      <p class="m-0 text-sm leading-relaxed text-secondary-foreground">{briefing().why_it_matters}</p>
                      <Show when={briefing().steps.length > 0}>
                        <ol class="m-0 list-decimal pl-4.5 text-sm leading-relaxed text-secondary-foreground">
                          <For each={briefing().steps}>{step => (
                            <li class="mb-1"><strong class="text-foreground">{step.what_to_do}</strong> — {step.why_it_matters}</li>
                          )}</For>
                        </ol>
                      </Show>
                    </Show>

                    <Show when={draftOf(briefing())}>
                      {draft => <DraftPreview draft={draft()} />}
                    </Show>
                    {/* Fields whose entire value is a record id are dropped.
                        The backend puts `event_id`, `campaign_id` and `task_id`
                        in here as bare UUIDs; they identify a row an operator
                        cannot look up and they are the widest thing on the
                        line. Everything an operator can act on stays. */}
                    <Show when={contentFields(briefing()).length > 0}>
                      <dl class="m-0 flex flex-col">
                        <For each={contentFields(briefing())}>{field => (
                          <div class="flex items-baseline gap-3 border-b border-border-subtle py-1 last:border-0">
                            <dt class="text-xs capitalize text-muted-foreground">{field.label}</dt>
                            <dd class="m-0 min-w-0 flex-1 break-words text-sm text-secondary-foreground">
                              <Show when={asRecipients(field.value).length > 0} fallback={field.value}>
                                <Recipients addresses={asRecipients(field.value)} />
                              </Show>
                            </dd>
                          </div>
                        )}</For>
                      </dl>
                    </Show>
                  </>
                )}
              </Show>
            </div>
          </details>
        </div>

        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <Show
            when={isApprovable(entry())}
            fallback={
              <span class="text-sm text-muted-foreground">
                {NOT_APPROVABLE_NOTE[entry().authority] ?? 'nothing here can run this — handle it yourself'}
              </span>
            }
          >
            {/* Every row's buttons look the same, but approving an outreach
                request sends a message to somebody outside the band while
                approving a price change edits a number. Say which before the
                click, not in a briefing written in another language. */}
            <Show when={APPROVE_EFFECT[entry().decision_kind]}>
              {effect => <span class="w-full text-xs text-muted-foreground md:w-auto md:max-w-[13rem] md:text-right">{effect()}</span>}
            </Show>
            <Button
              type="button"
              size="sm"
              disabled={pendingMutation() !== null}
              onClick={() => approve(entry())}
              writes
            >
              {busy(`do:${entry().decision_id}`) && <Spinner />}
              {busy(`do:${entry().decision_id}`) ? 'Approving…' : confirming() === `do:${entry().decision_id}` ? 'Yes, approve' : 'Approve'}
            </Button>
            <Button
              type="button"
              variant="destructive-ghost"
              size="sm"
              disabled={pendingMutation() !== null}
              onClick={() => reject(entry())}
              writes
            >
              {busy(`reject:${entry().decision_id}`) && <Spinner />}
              {busy(`reject:${entry().decision_id}`) ? 'Rejecting…' : confirming() === `reject:${entry().decision_id}` ? 'Yes, reject' : 'Reject'}
            </Button>
          </Show>
          <Show when={entry().authority !== 'auto_executing'}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pendingMutation() !== null}
              onClick={() => doneOurselves(entry())}
              writes
            >
              {busy(`done:${entry().decision_id}`) && <Spinner />}
              {busy(`done:${entry().decision_id}`) ? 'Recording…' : confirming() === `done:${entry().decision_id}` ? 'Yes, I did it' : 'I did this myself'}
            </Button>
          </Show>
        </div>
      </div>
    )
  }
}
