import { For, Show, createSignal } from 'solid-js'
import { NativeSelect } from './ui/native-select'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { PanelTitle } from './layout'
import { SectionIcon } from './SectionIcon'
import { EmptyState } from './ui/empty-state'
import { SkeletonSection } from './Skeleton'
import { SectionFailureCard } from './SectionFailureCard'
import { Card } from './app/card'
import type { GigPlanReasonScore } from '../lib/types'
import { GigPlanPassedOverRow, GigPlanProposalCard, useGigPlanApproval } from './GigPlanProposalCard'

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
// screen cannot write a letter the data no longer supports. The card and the
// approval flow are shared with the city page (GigPlanProposalCard) so the
// same click works from both places with the same idempotency discipline.

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
  const { approve, approvingCityId, approvalResult, approveError } = useGigPlanApproval(() => props.slug)
  // '' means the stored intent — no override rides the request.
  const [intentOverride, setIntentOverride] = createSignal('')

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
                    <GigPlanProposalCard
                      proposal={proposal}
                      tenantSlug={props.slug}
                      approving={approvingCityId() === proposal.city_id}
                      busy={approve.isPending}
                      result={approvalResult()?.cityId === proposal.city_id ? approvalResult()!.result : null}
                      error={approveError()?.cityId === proposal.city_id ? approveError()!.message : null}
                      onApprove={(revision) => approve.mutate({ proposal, revision })}
                    />
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
                    {entry => <GigPlanPassedOverRow entry={entry} tenantSlug={props.slug} />}
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
