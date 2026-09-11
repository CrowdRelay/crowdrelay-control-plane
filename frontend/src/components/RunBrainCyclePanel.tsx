import { Show, createSignal } from 'solid-js'
import { For } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { triggerRefresh, refreshQueries } from '../lib/refresh'
import { StatusBadge } from './StatusBadge'
import { SkeletonPanel } from './Skeleton'
import { Spinner } from './Spinner'
import { ErrorCard, PanelTitle } from './layout'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { NativeSelect } from './ui/native-select'

const CycleIcon = (props: { size?: number }) => (
  <svg width={props.size ?? 18} height={props.size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </svg>
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
      setNotice({ tone: 'bad', message: errorMessage(error, 'Could not change the goal') })
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
      setNotice({ tone: 'bad', message: errorMessage(error, 'Could not request a cycle') })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card class="p-4">
      <header class="flex items-center justify-between gap-4 mb-3">
        <PanelTitle><CycleIcon /> Run a growth cycle</PanelTitle>
        <Button variant="ghost" size="sm" onClick={() => void preview.refetch()} disabled={preview.isFetching}>
          Refresh preview
        </Button>
      </header>

      <Show when={preview.isFetching}><SkeletonPanel /></Show>

      <Show when={preview.error}>
        <ErrorCard>Could not read what the brain believes: {errorMessage(preview.error, 'unknown error')}</ErrorCard>
      </Show>

      <Show when={preview.data}>
        {data => (
          <>
            <p class="text-sm leading-relaxed text-muted-foreground">
              The autopilot would run <strong class="text-foreground">{strategyLabel(data().strategy)}</strong>, choosing from{' '}
              {data().templatesConsidered} kinds of AI job. Nothing below has started — this is what it currently believes.
            </p>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div class="flex flex-col gap-1 border border-border bg-card p-3">
                <span class="block text-xs text-muted-foreground">Fans</span>
                <strong class="block text-xl font-bold tabular-nums text-foreground">{number(data().totalFans)}</strong>
              </div>
              <div class="flex flex-col gap-1 border border-border bg-card p-3">
                <span class="block text-xs text-muted-foreground">Reachable audience</span>
                <strong class="block text-xl font-bold tabular-nums text-foreground">{number(data().offPlatformAudience)}</strong>
                <small class="block text-xs text-muted-foreground">+{number(data().offPlatformAudienceThisMonth)} this month</small>
              </div>
              {/* The goal is the one number the brain optimises, so it is
                  editable where it is displayed rather than hidden in a
                  settings screen. Before this it could only be chosen in the
                  creation wizard and never changed again. */}
              <div class="flex flex-col gap-1 border border-border bg-card p-3">
                <label class="block text-xs text-muted-foreground" for="north-star-select">Goal</label>
                <NativeSelect id="north-star-select"
                  size="sm"
                  class="font-semibold disabled:cursor-progress"
                  value={data().northStar}
                  disabled={savingGoal() || goals.isFetching}
                  onChange={event => void changeGoal(event.currentTarget.value)}
                >
                  <Show when={goals.error}>
                    <option value={data().northStar}>{strategyLabel(data().northStar)}</option>
                  </Show>
                  <For each={goals.data?.options ?? []}>
                    {option => <option value={option.value}>{option.label}</option>}
                  </For>
                </NativeSelect>
                <strong class="block text-xl font-bold tabular-nums text-foreground">{number(data().northStarCurrent)}</strong>
                <small class="block text-xs text-muted-foreground">+{number(data().northStarThisMonth)} this month</small>
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
              <p class="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
                {data().connectedPlatforms - data().freshPlatforms} connected platform(s) have no
                recent reading. The brain is deciding without them.
              </p>
            </Show>

            <Show when={!data().hasAnyConnectedPlatform}>
              <p class="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
                No platform is connected yet, so a cycle would correctly decide to do nothing.
                Connect a fan source first in Portfolio.
              </p>
            </Show>

            <section class="mt-6 pt-4 border-t border-border">
              <h3 class="text-sm font-semibold text-foreground mb-2.5">Worker pipeline — brain dispatches in this order</h3>
              <div class="flex flex-wrap items-center gap-1.5">
                <For each={data().templatePriority}>
                  {(template, index) => (
                    <>
                      <Show when={index() > 0}>
                        <span class="text-muted-foreground text-sm" aria-hidden="true">→</span>
                      </Show>
                      <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-2 border border-border text-sm text-secondary-foreground">
                        <span class="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-surface-4 text-muted-foreground text-xs font-bold" classList={{ 'bg-success/15 text-success': index() === 0 }}>{index() + 1}</span>
                        <span class="capitalize whitespace-nowrap">{template.replaceAll('-', ' ')}</span>
                      </div>
                    </>
                  )}
                </For>
              </div>
            </section>

            <footer class="pt-3 mt-6 border-t border-border">
              <p class="text-sm text-muted-foreground leading-relaxed mb-3">
                Dispatches real outreach. Subject to the same autonomy policy and 24-hour action
                cap as a scheduled cycle.
              </p>
              <Button size="sm" onClick={() => void runCycle()} disabled={running() || !data().hasAnyConnectedPlatform}>
                {running() && <Spinner />} {running() ? 'Requesting…' : 'Run cycle now'}
              </Button>
            </footer>
          </>
        )}
      </Show>

      <Show when={notice()}>
        {value => (
          <p class={`mt-3 rounded-lg p-4 text-sm ${value().tone === 'bad' ? 'border border-destructive/30 bg-destructive/10 text-destructive' : 'border border-success/30 bg-success/10 text-success'}`}>{value().message}</p>
        )}
      </Show>
    </Card>
  )
}
