import { For, Show, createSignal, type JSX } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import { useMutation, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { Badge } from './app/badge'
import { Button } from './app/button'
import { Textarea } from './ui/textarea'
import type { GigPlanApproval, GigPlanPassedOver, GigPlanProposal, GigPlanReason } from '../lib/types'

// One gig-plan proposal, rendered anywhere a city is — the Places tab's plan
// card and the city's own page both draw from this so the approve click is
// one flow, not two.
//
// The approve click is the whole approval — upstream recomputes the proposal
// against current evidence rather than trusting this payload, so a stale
// screen cannot write a letter the data no longer supports.

const count = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString()

/** A reason phrased for the band reading it. The kind tag is stable — the
 *  track record is scored in the same vocabulary, so the phrasing here must
 *  never become the only place a reason exists. */
export const reasonText = (reason: GigPlanReason): string => {
  switch (reason.kind) {
    case 'comparable_acts_played_here':
      return `acts like yours have played this room — ${reason.count} of its last ${reason.of_shows} shows`
    case 'reachable_audience':
      return `${reason.reachable.toLocaleString()} people here asked to hear from you`
    case 'room_draws':
      return `the room itself draws about ${reason.typical_draw.toLocaleString()}`
    case 'never_played_but_has_fans':
      return `you have never played here and ${reason.reachable.toLocaleString()} people already listen`
    case 'overdue_return':
      return `${reason.months} months since you played here and ${reason.active_30d.toLocaleString()} people are still active`
    case 'co_bill_adds_audience':
      return `${reason.act} on the bill would reach ${reason.adds_reachable.toLocaleString()} more people`
    case 'warm_promoter':
      return `${reason.name} knows the band and answered last time`
    case 'room_is_active':
      return `the room had a show ${reason.days_since_last_event} days ago — it is programming now`
  }
}

/** The approve mutation and its per-city bookkeeping, shared so the city
 *  page's approve button is the Places tab's approve button — same key
 *  discipline, same result handling.
 *
 *  One key per proposal for the life of the component. A retry after a
 *  timeout — where the server may already have committed — must carry the
 *  same key or it lands as a second letter to the same promoters; a refusal
 *  stores nothing upstream, so reusing the key after a refusal simply
 *  re-evaluates. */
export function useGigPlanApproval(slug: () => string) {
  const queryClient = useQueryClient()
  const [approvingCityId, setApprovingCityId] = createSignal<string | null>(null)
  const [approvalResult, setApprovalResult] = createSignal<{ cityId: string; result: GigPlanApproval } | null>(null)
  const [approveError, setApproveError] = createSignal<{ cityId: string; message: string } | null>(null)

  const approvalKeys = new Map<string, string>()
  const keyFor = (cityId: string) => {
    let key = approvalKeys.get(cityId)
    if (!key) {
      key = crypto.randomUUID()
      approvalKeys.set(cityId, key)
    }
    return key
  }

  const approve = useMutation(() => ({
    mutationFn: (input: { proposal: GigPlanProposal; revision?: Record<string, string> }) =>
      api.approveGigPlan(slug(), input.proposal.city_id, keyFor(input.proposal.city_id), input.revision),
    onMutate: (input) => {
      setApprovingCityId(input.proposal.city_id)
      setApprovalResult(null)
      setApproveError(null)
    },
    onSuccess: async (result, input) => {
      const proposal = input.proposal
      setApprovingCityId(null)
      setApprovalResult({ cityId: proposal.city_id, result })
      // A queued approval changes what the plan can honestly say next —
      // the city is no longer a gap while the letter is out.
      await queryClient.invalidateQueries({ queryKey: ['gig-plan', slug()] })
    },
    onError: (error, input) => {
      setApprovingCityId(null)
      setApproveError({
        cityId: input.proposal.city_id,
        message: error instanceof Error ? error.message : 'Approval failed',
      })
    },
  }))

  return { approve, approvingCityId, approvalResult, approveError }
}

/** The city name as a link to the city page, when the caller passes the
 *  tenant slug — on the city page itself it stays plain text. */
function CityName(props: { tenantSlug?: string; citySlug: string; children: JSX.Element; class?: string }) {
  return (
    <Show
      when={props.tenantSlug}
      fallback={<span class={props.class}>{props.children}</span>}
    >
      {tenantSlug => (
        <Link
          to="/tenants/$slug/cities/$cityId"
          params={{ slug: tenantSlug(), cityId: props.citySlug }}
          class={`${props.class ?? ''} underline decoration-border underline-offset-4 hover:text-primary`}
        >
          {props.children}
        </Link>
      )}
    </Show>
  )
}

/** One proposal: the reasons and caveats first, the contacts after, and the
 *  approve affordance last — the order is the design, a band that reads who
 *  to write to before why has learned to click approve without thinking. */
export function GigPlanProposalCard(props: {
  proposal: GigPlanProposal
  /** This proposal's approval is in flight. */
  approving: boolean
  /** An approval is in flight somewhere — one at a time, so the rest disable. */
  busy: boolean
  result?: GigPlanApproval | null
  error?: string | null
  /** Whether any executor can send the letter today — false greys the button
   *  and shows the reason instead of offering a click that would refuse. */
  canSend?: boolean
  sendBlockedReason?: string | null
  /** The operator's fix to the letter, when they edited the opening line —
   *  forwarded verbatim to the revision gate upstream. */
  onApprove: (revision?: Record<string, string>) => void
  /** Tenant slug — links the city name to its city page. Omit where the page
   *  already is the city's own. */
  tenantSlug?: string
}) {
  const proposal = () => props.proposal
  const [editing, setEditing] = createSignal(false)
  const [editedLine, setEditedLine] = createSignal(props.proposal.opening_line)
  return (
    <div class="rounded-md border border-border p-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <CityName tenantSlug={props.tenantSlug} citySlug={proposal().city} class="font-medium text-foreground">
            {proposal().city_name}
          </CityName>
          <span class="ml-2 text-sm text-muted-foreground">at {proposal().venue}</span>
        </div>
        <Badge variant="muted">
          {count(proposal().reach.reachable)} reachable
          <Show when={proposal().reach.added_by_co_bill > 0}>
            {` · +${count(proposal().reach.added_by_co_bill)} co-bill`}
          </Show>
        </Badge>
      </div>

      {/* Why, before who. */}
      <ul class="mt-2 space-y-1">
        <For each={proposal().reasons}>
          {reason => (
            <li class="text-sm text-foreground before:mr-2 before:text-muted-foreground before:content-['—']">
              {reasonText(reason)}
            </li>
          )}
        </For>
      </ul>

      <p class="mt-2 text-xs text-muted-foreground">{proposal().reach.basis}</p>
      <p class="mt-1 text-xs text-muted-foreground italic">{proposal().fits_intent}</p>

      {/* What the planner does not know, stated before the names — approving
          means owning these. */}
      <Show when={proposal().caveats.length > 0}>
        <ul class="mt-2 space-y-1">
          <For each={proposal().caveats}>
            {caveat => (
              <li class="text-xs text-amber-400/90 before:mr-2 before:content-['⚠']">
                {caveat}
              </li>
            )}
          </For>
        </ul>
      </Show>

      <div class="mt-3 border-t border-border pt-2">
        <p class="text-xs text-muted-foreground">
          Write to: {proposal().contact.map((c) => c.name).join(', ')}
        </p>
        <Show when={proposal().invite_to_bill.length > 0}>
          <p class="mt-1 text-xs text-muted-foreground">
            Worth asking onto the bill: {proposal().invite_to_bill.join(', ')}
          </p>
        </Show>

        {/* The letter's first sentence, editable before approve (N.10). The
            reasons above are the machine's evidence — they are not editable;
            disagreeing with a number is a refusal, not an edit. */}
        <div class="mt-3">
          <Show
            when={editing()}
            fallback={
              <p class="text-sm text-foreground">
                Opens with: “{proposal().opening_line}”
                <Button
                  variant="link"
                  size="sm"
                  class="ml-2 h-auto p-0 text-xs text-muted-foreground"
                  onClick={() => setEditing(true)}
                >
                  edit
                </Button>
              </p>
            }
          >
            <Textarea
              class="mt-1"
              rows={3}
              value={editedLine()}
              onInput={(e) => setEditedLine(e.currentTarget.value)}
            />
          </Show>
        </div>

        <div class="mt-3 flex items-center gap-3">
          <Button
            size="sm"
            disabled={props.busy || props.canSend === false || (editing() && !editedLine().trim())}
            onClick={() => {
              const line = editedLine().trim()
              const revision = editing() && line !== proposal().opening_line.trim()
                ? { opening_line: line }
                : undefined
              props.onApprove(revision)
            }}
          >
            {props.approving ? 'Approving…' : (authState.isPlatformLevel() ? 'Approve & queue outreach' : 'Approve & send outreach')}
          </Button>
          <Show when={props.result}>
            {result => {
              const entry = result()
              if ('refused' in entry) {
                return <span class="text-xs text-amber-400/90">{entry.refused}</span>
              }
              if ('status' in entry) {
                return <span class="text-xs text-muted-foreground">Already approved — {entry.status}</span>
              }
              return (
                <span class="text-xs text-emerald-400/90">
                  {authState.isPlatformLevel() ? 'Queued to' : 'Off to'} {entry.recipients.length}{' '}
                  {entry.recipients.length === 1 ? 'person' : 'people'} — opens with
                  “{entry.opening_line}”
                </span>
              )
            }}
          </Show>
          <Show when={props.canSend === false && props.sendBlockedReason}>
            {reason => <span class="text-xs text-amber-400/90">{reason()}</span>}
          </Show>
          <Show when={props.error}>
            {message => <span class="text-xs text-destructive">{message()}</span>}
          </Show>
        </div>
      </div>
    </div>
  )
}

/** One city the planner passed over: the refusal sentence, and — when
 *  research would change the answer — the question to go and ask. The copy
 *  state lives inside the row: each entry owns its own brief. */
export function GigPlanPassedOverRow(props: { entry: GigPlanPassedOver; tenantSlug?: string }) {
  const [copied, setCopied] = createSignal(false)
  const [copyFailed, setCopyFailed] = createSignal(false)

  const copyBrief = (brief: string) => {
    const clipboard = navigator.clipboard
    if (!clipboard) {
      setCopyFailed(true)
      return
    }
    void clipboard.writeText(brief).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => setCopyFailed(true))
  }

  return (
    <li class="rounded-md border border-border/60 p-3">
      <CityName tenantSlug={props.tenantSlug} citySlug={props.entry.city} class="text-sm text-foreground">
        {props.entry.city_name}
      </CityName>
      <span class="ml-2 text-sm text-muted-foreground">{props.entry.reason}</span>
      <Show when={props.entry.research_brief}>
        {brief => (
          <div class="mt-2">
            <Button
              variant="outline"
              size="sm"
              class="h-7 px-2 text-xs"
              onClick={() => copyBrief(brief())}
            >
              {copied() ? 'Copied' : 'Copy research brief'}
            </Button>
            <Show when={copyFailed()}>
              <p class="mt-1 text-xs text-destructive">
                Clipboard unavailable — select the brief text and copy it by hand.
              </p>
            </Show>
            <p class="mt-1 text-xs text-muted-foreground">
              Paste it into whatever assistant you use — the
              sheet it returns parses without editing.
            </p>
          </div>
        )}
      </Show>
    </li>
  )
}
