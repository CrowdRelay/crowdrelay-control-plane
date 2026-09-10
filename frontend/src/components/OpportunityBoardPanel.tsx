import { For, Show, createSignal } from 'solid-js'
import type { OpportunityBoardEntry } from '../lib/types'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { SkeletonOpportunityBoard } from './Skeleton'
import { CONTEXT_LABELS, SUBJECT_KIND_LABELS, RANK_FACTOR_LABELS, VALUE_TIER_LABELS, labelOr, opportunityTitle } from '../lib/opportunity-labels'
import { SectionIcon } from './SectionIcon'
import { Section } from './layout'
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

const confidencePercent = (basisPoints: number) => `${Math.round(basisPoints / 100)}%`

// Basis points are the queue's only magnitude; percent is what a human reads.
const deviationLabel = (entry: OpportunityBoardEntry) =>
  entry.deviation_basis_points == null ? null : `${(entry.deviation_basis_points / 100).toFixed(1)}% measured movement`

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
  const forInfo = () => all().filter(e => !isApprovable(e) && e.authority !== 'auto_executing')

  return <>
    <Show when={board.error}>
      <Alert tone="warning" role="status">
        {errorMessage(board.error, 'Opportunity queue is temporarily unavailable.')}
      </Alert>
    </Show>

    <Show when={mutationError()}>
      {message => <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{message()}</div>}
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
          <strong class="text-sm leading-snug text-foreground">{entryTitle(entry())}</strong>
          <p class="m-0 text-sm leading-relaxed text-secondary-foreground">{entry().reason}</p>

          <div class="flex flex-wrap items-center gap-2">
            <Badge variant="muted">confidence {confidencePercent(entry().confidence)}</Badge>
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
                <Badge variant="outline">top of the list because {RANK_FACTOR_LABELS[entry().ranked_by] ?? entry().ranked_by}</Badge>
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
                    <p class="m-0 text-sm leading-relaxed text-secondary-foreground">{briefing().why_it_matters}</p>
                    <Show when={briefing().steps.length > 0}>
                      <ol class="m-0 list-decimal pl-4.5 text-sm leading-relaxed text-secondary-foreground">
                        <For each={briefing().steps}>{step => (
                          <li class="mb-1"><strong class="text-foreground">{step.what_to_do}</strong> — {step.why_it_matters}</li>
                        )}</For>
                      </ol>
                    </Show>
                    <Show when={briefing().content.length > 0}>
                      <dl class="m-0 flex flex-col">
                        <For each={briefing().content}>{field => (
                          <div class="flex items-baseline gap-3 border-b border-border-subtle py-1 last:border-0">
                            <dt class="text-xs capitalize text-muted-foreground">{field.label}</dt>
                            <dd class="m-0 min-w-0 flex-1 break-words text-sm text-secondary-foreground">{field.value}</dd>
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
            <Button
              type="button"
              size="sm"
              disabled={pendingMutation() !== null}
              onClick={() => approve(entry())}
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
