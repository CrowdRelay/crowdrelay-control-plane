import { Show, createSignal } from 'solid-js'
import { Alert } from './app/alert'
import { failureLine } from '../lib/errors'
import { For } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { triggerRefresh, refreshQueries } from '../lib/refresh'
import { SkeletonPanel } from './Skeleton'
import { Spinner } from './Spinner'
import { ErrorCard, Section } from './layout'
import { Button } from './app/button'
import { NativeSelect } from './ui/native-select'
import { northStarLabel, northStarMeaning, northStarMovement, signedCount } from '../lib/north-star'
import { writeGuard } from '../lib/read-only'
import { ArrowRight, RotateCw } from 'lucide-solid'

const CycleIcon = (props: { size?: number }) => (
  <RotateCw size={props.size ?? 18} aria-hidden="true" />
)

const strategyLabel = (strategy: string) =>
  strategy.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const number = (value: number) => value.toLocaleString()

/// Run a full brain cycle, or preview what one would decide.
///
/// Preview is always offered first. A cycle dispatches real outreach, and the
/// operator should be able to see what the brain currently believes before
/// authorising it to act on that belief.
export function RunBrainCyclePanel(props: { slug: string }) {
  const preview = useQuery(() => ({
    queryKey: ['autopilot-cycle-preview', props.slug],
    queryFn: () => api.autopilotCyclePreview(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const [running, setRunning] = createSignal(false)
  const [notice, setNotice] = createSignal<{ tone: 'good' | 'bad'; message: string } | null>(null)

  // The goal is loaded lazily: it is only needed once the operator opens the
  // picker, and the panel's own preview is the thing worth waiting for.
  const goals = useQuery(() => ({
    queryKey: ['north-star-options', props.slug],
    queryFn: () => api.northStarOptions(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const [savingGoal, setSavingGoal] = createSignal(false)

  const changeGoal = async (value: string) => {
    if (!value || value === preview.data?.northStar) return
    setSavingGoal(true)
    setNotice(null)
    try {
      await api.updatePortfolioSetting(props.slug, 'north_star_metric', value)
      setNotice({ tone: 'good', message: 'Goal updated. The next cycle will optimise for it.' })
      refreshQueries(['north-star-options', props.slug])
      await preview.refetch()
    } catch (error) {
      setNotice({ tone: 'bad', message: failureLine("Couldn't change the goal", error) })
    } finally {
      setSavingGoal(false)
    }
  }

  const runCycle = async () => {
    setRunning(true)
    setNotice(null)
    try {
      const result = await api.autopilotCycleRun(props.slug)
      setNotice({
        tone: 'good',
        message: result.detail ?? 'Cycle requested.',
      })
      // The one legitimate global refresh: a brain cycle re-plans decisions,
      // dispatches workers and writes outcomes, so there is no small set of
      // read models it leaves untouched.
      triggerRefresh()
      await preview.refetch()
    } catch (error) {
      setNotice({ tone: 'bad', message: failureLine("Couldn't start a brain cycle", error) })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Section
      title="Run a growth cycle"
      icon={<CycleIcon />}
      action={<Button variant="outline" size="sm" onClick={() => void preview.refetch()} disabled={preview.isFetching}>
        Refresh preview
      </Button>}
    >

      <Show when={preview.isFetching}><SkeletonPanel /></Show>

      <Show when={preview.error}>
        <ErrorCard title="Couldn't load what the brain believes" error={preview.error} onRetry={() => void preview.refetch()} />
      </Show>

      <Show when={preview.data}>
        {data => (
          <>
            <p class="text-sm leading-relaxed text-muted-foreground">
              {authState.isPlatformLevel() ? 'The autopilot would run ' : 'It would run '}<strong class="text-foreground">{strategyLabel(data().strategy)}</strong>, choosing from{' '}
              {data().templatesConsidered} kinds of AI job. Nothing below has started — this is what it currently believes.
            </p>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div class="flex flex-col gap-1 border border-border bg-card p-3">
                <span class="block text-xs text-muted-foreground">Fans</span>
                <strong class="block text-xl font-bold tabular-nums text-foreground">{number(data().totalFans)}</strong>
              </div>
              <div class="flex flex-col gap-1 border border-border bg-card p-3">
                <span class="block text-xs text-muted-foreground">Off-platform audience</span>
                <strong class="block text-xl font-bold tabular-nums text-foreground">{number(data().offPlatformAudience)}</strong>
                <small class="block text-xs text-muted-foreground">{signedCount(data().offPlatformAudienceThisMonth)} this month · summed platform counts</small>
              </div>
              {/* The goal is the one number the brain optimises, so it is
                  editable where it is displayed rather than hidden in a
                  settings screen. Before this it could only be chosen in the
                  creation wizard and never changed again. */}
              <div class="flex flex-col gap-1 border border-border bg-card p-3">
                <label class="block text-xs text-muted-foreground" for="north-star-select">What it is chasing</label>
                <NativeSelect id="north-star-select"
                  size="sm"
                  class="font-semibold disabled:cursor-progress"
                  value={data().northStar}
                  disabled={savingGoal() || goals.isFetching}
                  onChange={event => void changeGoal(event.currentTarget.value)}
                  {...writeGuard()}
                >
                  <Show when={goals.error}>
                    <option value={data().northStar}>{strategyLabel(data().northStar)}</option>
                  </Show>
                  <For each={goals.data?.options ?? []}>
                    {option => <option value={option.value}>{northStarLabel(option)}</option>}
                  </For>
                </NativeSelect>
                <strong class="block text-xl font-bold tabular-nums text-foreground">{number(data().northStarCurrent)}</strong>
                <small class="block text-xs text-muted-foreground">
                  {northStarMovement(data().northStar, data().northStarThisMonth)}
                </small>
                {/* Which number this is, in a sentence. The picker above names
                    the goal; this says what picking it commits the brain to. */}
                <Show when={northStarMeaning(data().northStar)}>
                  <small class="block text-xs leading-relaxed text-muted-foreground">{northStarMeaning(data().northStar)}</small>
                </Show>
              </div>
              <div class="flex flex-col gap-1 border border-border bg-card p-3">
                <span class="block text-xs text-muted-foreground">Platforms</span>
                <strong class="block text-xl font-bold tabular-nums text-foreground">{data().freshPlatforms} / {data().connectedPlatforms}</strong>
                <small class="block text-xs text-muted-foreground">fresh / connected</small>
              </div>
            </div>

            {/* A gap here is measurement debt, not audience loss: the platform is
                configured but its newest reading is too old to act on. */}
            <Show when={data().connectedPlatforms > data().freshPlatforms}>
              <p class="mt-3 rounded-lg border border-warning-foreground/30 bg-warning-foreground/10 p-4 text-sm text-warning-foreground">
                {data().connectedPlatforms - data().freshPlatforms} connected platform(s) have no
                recent reading. The brain is deciding without them.
              </p>
            </Show>

            <Show when={!data().hasAnyConnectedPlatform}>
              <p class="mt-3 rounded-lg border border-warning-foreground/30 bg-warning-foreground/10 p-4 text-sm text-warning-foreground">
                No platform is connected yet, so a cycle would correctly decide to do nothing.
                {authState.isPlatformLevel() ? 'Connect a fan source first in Portfolio.' : 'Connect a fan source on the Audience page first.'}
              </p>
            </Show>

            <section class="mt-6 pt-4 border-t border-border">
              <h3 class="text-sm font-semibold text-foreground mb-2.5">{authState.isPlatformLevel() ? 'Worker pipeline — brain dispatches in this order' : 'Job order — the brain hands these out in this order'}</h3>
              <div class="flex flex-wrap items-center gap-1.5">
                <For each={data().templatePriority}>
                  {(template, index) => (
                    <>
                      <Show when={index() > 0}>
                        <ArrowRight class="size-3.5 text-muted-foreground" aria-hidden="true" />
                      </Show>
                      <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-card border border-border text-sm text-secondary-foreground">
                        <span class="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-accent text-muted-foreground text-xs font-bold" classList={{ 'bg-success-foreground/10 text-success-foreground': index() === 0 }}>{index() + 1}</span>
                        <span class="capitalize whitespace-nowrap">{template.replaceAll('-', ' ')}</span>
                      </div>
                    </>
                  )}
                </For>
              </div>
            </section>

            <footer class="mt-6 pt-4 border-t border-border">
              <p class="text-sm text-muted-foreground leading-relaxed mb-3">
                Dispatches real outreach. Subject to the same {authState.isPlatformLevel() ? 'autonomy policy' : 'rules'} and 24-hour action
                cap as a scheduled cycle.
              </p>
              <Button size="sm" writes onClick={() => void runCycle()} disabled={running() || !data().hasAnyConnectedPlatform}>
                {running() && <Spinner />} {running() ? 'Requesting…' : 'Run cycle now'}
              </Button>
            </footer>
          </>
        )}
      </Show>

      <Show when={notice()}>
        {value => value().tone === 'bad'
          ? <ErrorCard class="mt-3">{value().message}</ErrorCard>
          : <Alert tone="success" role="status" class="mt-3">{value().message}</Alert>}
      </Show>
    </Section>
  )
}
