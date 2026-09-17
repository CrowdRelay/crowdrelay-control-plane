import { For, Show, createSignal } from 'solid-js'
import { NativeSelect } from './ui/native-select'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { PanelTitle } from './layout'
import { SectionIcon } from './SectionIcon'
import { EmptyState } from './ui/empty-state'
import { SkeletonSection } from './Skeleton'
import { SectionFailureCard } from './SectionFailureCard'
import { Card } from './app/card'
import { Badge } from './app/badge'
import { Button } from './app/button'
import type { GigPlanApproval, GigPlanProposal, GigPlanReason, GigPlanReasonScore } from '../lib/types'

// What to book next, and why — the output of 4G.
//
// The proposal leads with its reasons and its caveats, in that order, before
// a single contact is named. That order is the design: a band that reads who
// to write to before reading why it is them has learned to click approve
// without thinking, and the caveats are the part of the answer that keeps the
// band honest about what the planner does not know.
//
// The approve click is the whole approval — upstream recomputes the proposal
// against current evidence rather than trusting this payload, so a stale
// screen cannot write a letter the data no longer supports.

const count = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString()

/** A reason phrased for the band reading it. The kind tag is stable — the
 *  track record is scored in the same vocabulary, so the phrasing here must
 *  never become the only place a reason exists. */
const reasonText = (reason: GigPlanReason): string => {
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

/** One line of the track record: how a reason has actually performed. */
const scoreText = (score: GigPlanReasonScore) =>
  `${score.proposals} proposals · ${score.replies} got a reply · ${score.shows} produced a show`

const REASON_LABEL: Record<string, string> = {
  comparable_acts_played_here: 'comparable acts played here',
  reachable_audience: 'reachable audience',
  room_draws: 'room draws',
  never_played_but_has_fans: 'never played, has fans',
  overdue_return: 'overdue return',
  co_bill_adds_audience: 'co-bill adds audience',
  warm_promoter: 'warm promoter',
  room_is_active: 'room is active',
}

export function GigPlanPanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const [approvingCityId, setApprovingCityId] = createSignal<string | null>(null)
  const [approvalResult, setApprovalResult] = createSignal<{ cityId: string; result: GigPlanApproval } | null>(null)
  const [approveError, setApproveError] = createSignal<{ cityId: string; message: string } | null>(null)
  const [copiedCity, setCopiedCity] = createSignal<string | null>(null)
  // '' means the stored intent — no override rides the request.
  const [intentOverride, setIntentOverride] = createSignal('')
  const [copyFailed, setCopyFailed] = createSignal<string | null>(null)

  // One key per proposal for the life of the panel. A retry after a timeout —
  // where the server may already have committed — must carry the same key or
  // it lands as a second letter to the same promoters; a refusal stores
  // nothing upstream, so reusing the key after a refusal simply re-evaluates.
  const approvalKeys = new Map<string, string>()
  const keyFor = (cityId: string) => {
    let key = approvalKeys.get(cityId)
    if (!key) {
      key = crypto.randomUUID()
      approvalKeys.set(cityId, key)
    }
    return key
  }

  // The intents a band may state, from the planner's own vocabulary — the
  // console never ships a copy that could stop matching.
  const intents = useQuery(() => ({
    queryKey: ['tenant-intents', props.slug],
    queryFn: () => api.tenantIntentOptions(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 300_000,
  }))

  const plan = useQuery(() => ({
    queryKey: ['gig-plan', props.slug, intentOverride()],
    queryFn: () => api.gigPlan(props.slug, intentOverride() || undefined),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  const approve = useMutation(() => ({
    mutationFn: (proposal: GigPlanProposal) =>
      api.approveGigPlan(props.slug, proposal.city_id, keyFor(proposal.city_id)),
    onMutate: (proposal) => {
      setApprovingCityId(proposal.city_id)
      setApprovalResult(null)
      setApproveError(null)
    },
    onSuccess: async (result, proposal) => {
      setApprovingCityId(null)
      setApprovalResult({ cityId: proposal.city_id, result })
      // A queued approval changes what the plan can honestly say next —
      // the city is no longer a gap while the letter is out.
      await queryClient.invalidateQueries({ queryKey: ['gig-plan', props.slug] })
    },
    onError: (error, proposal) => {
      setApprovingCityId(null)
      setApproveError({
        cityId: proposal.city_id,
        message: error instanceof Error ? error.message : 'Approval failed',
      })
    },
  }))

  const copyBrief = (cityId: string, brief: string) => {
    const clipboard = navigator.clipboard
    if (!clipboard) {
      setCopyFailed(cityId)
      return
    }
    void clipboard.writeText(brief).then(() => {
      setCopiedCity(cityId)
      setTimeout(() => setCopiedCity(null), 2000)
    }).catch(() => setCopyFailed(cityId))
  }

  return (
    <Card class="mb-4">
      <PanelTitle icon={<SectionIcon name="map-pin" />}>What to book next</PanelTitle>
      <p class="mt-1 text-sm text-muted-foreground leading-relaxed">
        The cities worth writing to, each with the evidence that makes it one.
        {authState.isPlatformLevel()
          ? "Approving queues a letter to the room's contacts"
          : "Approving sends a letter to the room's contacts"}
        {' '}— the proposal is
        rechecked against what is true at that moment, not what was true when
        this screen loaded.
      </p>

      <Show when={plan.error}>
        <SectionFailureCard
          error={plan.error}
          fallback="Gig plan unavailable"
          onRetry={() => void plan.refetch()}
        />
      </Show>
      <Show when={!plan.error && !plan.data}>
        <SkeletonSection titleWidth="160px" lines={6} minHeight="240px" />
      </Show>

      <Show when={plan.data}>
        {data => (
          <>
            {/* Intent provenance — a plan read under an override is not the
                stored intent, and saying nothing would let it pass for it. */}
            <Show when={!data().intent_is_stored}>
              <p class="mt-2 text-xs text-muted-foreground">
                Read under a one-off intent override — the band's stated intent
                says something else.
              </p>
            </Show>

            {/* "What if we were booking?" — the override is the planner's own
                parameter, and the banner above marks the read as one-off so a
                preview never passes for the band's stored answer. */}
            <Show when={(intents.data?.options.length ?? 0) > 0}>
              <div class="mt-3 flex items-center gap-2">
                <label for="gig-plan-intent" class="text-xs text-muted-foreground">
                  Plan as
                </label>
                <NativeSelect
                  id="gig-plan-intent"
                  size="sm"
                  class="w-auto"
                  value={intentOverride()}
                  onChange={e => setIntentOverride(e.currentTarget.value)}
                >
                  <option value="">Stored intent{data().intent_is_stored ? ` — ${data().intent}` : ''}</option>
                  <For each={intents.data!.options}>
                    {option => (
                      <option value={option.value}>
                        {option.value.replaceAll('_', ' ')}{option.withholdsProposals ? ' (stops proposals)' : ''}
                      </option>
                    )}
                  </For>
                </NativeSelect>
              </div>
            </Show>

            <Show
              when={data().proposals.length > 0}
              fallback={
                <EmptyState
                  label="Nothing to propose"
                  hint={
                    data().cities_considered === 0
                      ? 'No city has enough consented fans to plan around yet. That is a fact about reach, not a failure of the planner.'
                      : `Every one of the ${data().cities_considered} cities considered produced a refusal — read them below; each says what would change it.`
                  }
                />
              }
            >
              <div class="mt-3 space-y-3">
                <For each={data().proposals}>
                  {proposal => (
                    <div class="rounded-md border border-border p-3">
                      <div class="flex items-start justify-between gap-3">
                        <div>
                          <span class="font-medium text-foreground">{proposal.city_name}</span>
                          <span class="ml-2 text-sm text-muted-foreground">at {proposal.venue}</span>
                        </div>
                        <Badge variant="muted">
                          {count(proposal.reach.reachable)} reachable
                          <Show when={proposal.reach.added_by_co_bill > 0}>
                            {` · +${count(proposal.reach.added_by_co_bill)} co-bill`}
                          </Show>
                        </Badge>
                      </div>

                      {/* Why, before who. */}
                      <ul class="mt-2 space-y-1">
                        <For each={proposal.reasons}>
                          {reason => (
                            <li class="text-sm text-foreground before:mr-2 before:text-muted-foreground before:content-['—']">
                              {reasonText(reason)}
                            </li>
                          )}
                        </For>
                      </ul>

                      <p class="mt-2 text-xs text-muted-foreground">{proposal.reach.basis}</p>
                      <p class="mt-1 text-xs text-muted-foreground italic">{proposal.fits_intent}</p>

                      {/* What the planner does not know, stated before the
                          names — approving means owning these. */}
                      <Show when={proposal.caveats.length > 0}>
                        <ul class="mt-2 space-y-1">
                          <For each={proposal.caveats}>
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
                          Write to: {proposal.contact.join(', ')}
                        </p>
                        <Show when={proposal.invite_to_bill.length > 0}>
                          <p class="mt-1 text-xs text-muted-foreground">
                            Worth asking onto the bill: {proposal.invite_to_bill.join(', ')}
                          </p>
                        </Show>

                        <div class="mt-3 flex items-center gap-3">
                          {/* One approval in flight at a time — a second click
                              on another city would overwrite `approvingCityId`
                              and re-enable the first while it is still running. */}
                          <Button
                            size="sm"
                            disabled={approve.isPending}
                            onClick={() => approve.mutate(proposal)}
                          >
                            {approvingCityId() === proposal.city_id ? 'Approving…' : (authState.isPlatformLevel() ? 'Approve & queue outreach' : 'Approve & send outreach')}
                          </Button>
                          <Show when={approvalResult()}>
                            {outcome => {
                              const entry = outcome()
                              if (entry.cityId !== proposal.city_id) return null
                              const result = entry.result
                              if ('refused' in result) {
                                return <span class="text-xs text-amber-400/90">{result.refused}</span>
                              }
                              if ('status' in result) {
                                return <span class="text-xs text-muted-foreground">Already approved — {result.status}</span>
                              }
                              return (
                                <span class="text-xs text-emerald-400/90">
                                  {authState.isPlatformLevel() ? 'Queued to' : 'Off to'} {result.recipients.length}{' '}
                                  {result.recipients.length === 1 ? 'person' : 'people'} — opens with
                                  “{result.opening_line}”
                                </span>
                              )
                            }}
                          </Show>
                          <Show when={approveError()}>
                            {error => {
                              const entry = error()
                              if (entry.cityId !== proposal.city_id) return null
                              return <span class="text-xs text-destructive">{entry.message}</span>
                            }}
                          </Show>
                        </div>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            {/* The cities that are not proposals, each with the sentence that
                explains it and — when research would change the answer — the
                question to go and ask. */}
            <Show when={data().passed_over.length > 0}>
              <div class="mt-4">
                <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Passed over
                </p>
                <ul class="mt-2 space-y-2">
                  <For each={data().passed_over}>
                    {entry => (
                      <li class="rounded-md border border-border/60 p-3">
                        <span class="text-sm text-foreground">{entry.city_name}</span>
                        <span class="ml-2 text-sm text-muted-foreground">{entry.reason}</span>
                        <Show when={entry.research_brief}>
                          {brief => (
                            <div class="mt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                class="h-7 px-2 text-xs"
                                onClick={() => copyBrief(entry.city_id, brief())}
                              >
                                {copiedCity() === entry.city_id ? 'Copied' : 'Copy research brief'}
                              </Button>
                              <Show when={copyFailed() === entry.city_id}>
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
                    )}
                  </For>
                </ul>
              </div>
            </Show>

            {/* Whether the reasons have ever been right — scored only on
                proposals whose reply windows have closed. */}
            <Show when={data().track_record.by_reason.length > 0 || data().track_record.proposals.length > 0}>
              <div class="mt-4 border-t border-border pt-3">
                <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Track record
                </p>
                <Show when={data().track_record.by_reason.length > 0}>
                  <ul class="mt-2 space-y-1">
                    <For each={data().track_record.by_reason}>
                      {score => (
                        <li class="text-xs text-muted-foreground">
                          <span class="text-foreground">{REASON_LABEL[score.kind] ?? score.kind}</span>
                          {' — '}
                          {scoreText(score)}
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
                <Show when={data().track_record.proposals.some(p => p.unfinished_measurements > 0 || p.action_status !== 'succeeded')}>
                  <p class="mt-2 text-xs text-muted-foreground">
                    Some approvals are still in flight — a letter parked or a
                    reply window open scores nothing yet.
                  </p>
                </Show>
              </div>
            </Show>
          </>
        )}
      </Show>
    </Card>
  )
}
