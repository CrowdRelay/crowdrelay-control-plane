import { For, Show } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { capability, capabilityAction } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { errorMessage, formatTimestamp } from '../lib/format'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Badge } from './app/badge'
import { Alert } from './app/alert'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { SurfaceAction } from './capabilities/SurfaceAction'

// P4 — release a record, R-28 → R+30. One card per release: the ladder of
// milestones as the evaluator sees them (done, parked, due, upcoming), the one
// step only a person can close (the editorial pitch — nothing the agent reads
// would tell it the form was submitted), and the honest reports the release
// produced: above trend, within noise, or insufficient evidence — never a
// quietly recomputed win.

type ReleaseStep = {
  milestone: string
  offset_days: number
  due_at: string
  completed_at: string | null
  state: 'done' | 'parked' | 'due' | 'upcoming' | 'disabled'
}

type ReleasePlan = {
  release_id: string
  title: string
  release_at: string
  active: boolean
  tier: string
  editorial_pitch_completed_at: string | null
  tier_release_miss_streak: number
  lifecycle: string
  timeline: ReleaseStep[]
}

type ReleaseOutcome = {
  release_id: string
  report_kind: string
  generated_at: string
  window_days: number
  verdict: string
}

const words = (value: string) => value.replaceAll('_', ' ')
const offset = (days: number) => (days === 0 ? 'R' : days < 0 ? `R${days}` : `R+${days}`)

const STEP_TONE: Record<ReleaseStep['state'], 'success' | 'warning' | 'muted' | 'outline'> = {
  done: 'success',
  parked: 'warning',
  due: 'warning',
  upcoming: 'outline',
  disabled: 'muted',
}

export function ReleasePlanPanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const plans = useQuery(() => ({
    queryKey: ['surface', props.slug, 'release-plans'],
    queryFn: () => surface.read<ReleasePlan[]>(props.slug, capability('releases').read!.path),
    staleTime: 30_000,
    retry: 1,
  }))
  const outcomes = useQuery(() => ({
    queryKey: ['surface', props.slug, 'release-outcomes'],
    queryFn: () => surface.read<ReleaseOutcome[]>(props.slug, capability('release-outcomes').read!.path),
    staleTime: 60_000,
    retry: 1,
  }))
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['surface', props.slug, 'release-plans'] })
  const outcomesFor = (releaseId: string) => (outcomes.data ?? []).filter(o => o.release_id === releaseId)
  const pitchOpen = (plan: ReleasePlan) =>
    plan.editorial_pitch_completed_at == null &&
    plan.timeline.some(step => step.milestone === 'editorial_pitch' && (step.state === 'parked' || step.state === 'due'))

  return (
    <Section
      title="Release plan"
      icon={<SectionIcon name="play" />}
      count={plans.data?.length}
      description="Each release as a ladder from R-28 to R+30: what is done, what waits on you, and what the release measurably did."
      action={
        <SurfaceAction
          slug={props.slug}
          action={capabilityAction('releases', 'Plan a release')}
          initial={{ expected_version: '0', active: true }}
          hidden={['expected_version']}
          onDone={refresh}
        />
      }
    >
      <Show when={!plans.error} fallback={<Alert tone="warning" title="Couldn't check the release plan">{errorMessage(plans.error, 'The tenant did not answer.')}</Alert>}>
        <Show when={plans.data} fallback={<SkeletonRows count={2} />}>
          <Show when={plans.data!.length > 0} fallback={
            <EmptyState label="No release planned" hint="Plan the next release and the ladder — calendar, pitch, announcement, press, the day, the reports — starts from its date." />
          }>
            <div class="space-y-3">
              <For each={plans.data!}>{plan => (
                <div class="rounded-lg border border-border p-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-medium text-foreground">{plan.title}</span>
                    <Badge variant="outline">{words(plan.tier)}</Badge>
                    <Badge variant="muted">{words(plan.lifecycle)}</Badge>
                    <span class="text-xs text-muted-foreground">out {formatTimestamp(plan.release_at)}</span>
                    <Show when={!plan.active}><Badge variant="muted">paused</Badge></Show>
                  </div>
                  <Show when={plan.tier_release_miss_streak >= 2}>
                    <p class="mt-1 text-xs text-muted-foreground">
                      The last {plan.tier_release_miss_streak} {words(plan.tier)} releases showed no lift, so the next outward step at this tier waits for a person.
                    </p>
                  </Show>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <For each={plan.timeline}>{step => (
                      <Badge variant={STEP_TONE[step.state] ?? 'muted'} title={`${words(step.state)} · due ${formatTimestamp(step.due_at)}`}>
                        {offset(step.offset_days)} {words(step.milestone)}
                      </Badge>
                    )}</For>
                  </div>
                  <Show when={pitchOpen(plan)}>
                    <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>The editorial pitch is a form only a person can send.</span>
                      <SurfaceAction
                        slug={props.slug}
                        size="xs"
                        action={capabilityAction('releases', 'Editorial pitch done')}
                        label="We submitted it"
                        fixed={{ release_id: plan.release_id }}
                        onDone={refresh}
                      />
                    </div>
                  </Show>
                  <Show when={outcomesFor(plan.release_id).length > 0}>
                    <ul class="mt-2 space-y-0.5 text-xs text-muted-foreground">
                      <For each={outcomesFor(plan.release_id)}>{outcome => (
                        <li>
                          {words(outcome.report_kind)} over {outcome.window_days} days: <strong class="text-foreground">{words(outcome.verdict)}</strong>
                          {' '}· {formatTimestamp(outcome.generated_at)}
                        </li>
                      )}</For>
                    </ul>
                  </Show>
                </div>
              )}</For>
            </div>
          </Show>
        </Show>
      </Show>
    </Section>
  )
}
