import { For, Show, createSignal } from 'solid-js'
import { Field } from './ui/field'
import { FormDrawer } from './app/form-drawer'
import { ChartLine, Plus } from 'lucide-solid'
import { failureLine } from '../lib/errors'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { refreshQueries } from '../lib/refresh'
import { compactNumber } from '../lib/charts'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
import { ErrorCard, Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { NativeSelect } from './ui/native-select'
import { Input } from './ui/input'
import type { GrowthObjectiveView, ObjectiveState } from '../lib/types'

const formatDeadline = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days < 30) return `${days}d left`
  if (days < 365) return `${Math.floor(days / 30)}mo left`
  return `${Math.floor(days / 365)}y left`
}

const stateLabel = (state: ObjectiveState): string => {
  switch (state.state) {
    case 'met': return 'Met'
    case 'on_track': return 'On track'
    case 'behind': return 'Behind'
    case 'missed': return 'Missed'
    case 'unmeasurable': return 'Unmeasurable'
  }
}

const stateTone = (state: ObjectiveState): 'good' | 'warn' | 'bad' | 'muted' => {
  switch (state.state) {
    case 'met': return 'good'
    case 'on_track': return 'good'
    case 'behind': return 'warn'
    case 'missed': return 'bad'
    case 'unmeasurable': return 'muted'
  }
}

const toneVariant = (tone: 'good' | 'warn' | 'bad' | 'muted'): 'success' | 'warning' | 'destructive' | 'muted' =>
  tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : tone === 'bad' ? 'destructive' : 'muted'

const stateProgress = (state: ObjectiveState): number => {
  switch (state.state) {
    case 'met': case 'on_track': case 'behind': case 'missed':
      return Math.min(100, Math.round(state.progress_basis_points / 100))
    case 'unmeasurable': return 0
  }
}


// MetricPlatform values upstream accepts — snake_case, one vocabulary across
// coverage, trends and objectives. `metric_key` stays free text because the
// backend treats it as text; the datalist offers the keys the tests exercise
// so an operator does not have to guess a plausible name.
const OBJECTIVE_PLATFORMS: Array<{ value: string; label: string }> = [
  { value: 'spotify', label: 'Spotify' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'bandsintown', label: 'Bandsintown' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'x', label: 'X' },
  { value: 'bluesky', label: 'Bluesky' },
  { value: 'discord', label: 'Discord' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'soundcloud', label: 'SoundCloud' },
  { value: 'bandcamp', label: 'Bandcamp' },
  { value: 'deezer', label: 'Deezer' },
  { value: 'lastfm', label: 'Last.fm' },
  { value: 'discogs', label: 'Discogs' },
  { value: 'signal', label: 'Signal' },
  { value: 'website', label: 'Website' },
  { value: 'social', label: 'Social (aggregate)' },
  { value: 'ticketing', label: 'Ticketing' },
  { value: 'merch', label: 'Merch' },
]

const METRIC_KEY_SUGGESTIONS = ['followers', 'monthly_listeners', 'members', 'subscribers', 'trackers', 'plays', 'views']

const datePlusDays = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

export function GrowthObjectivesPanel(props: { slug: string }) {
  const [error, setError] = createSignal<string | null>(null)
  const [retiring, setRetiring] = createSignal<string | null>(null)
  const [showAll, setShowAll] = createSignal(false)
  const MAX_VISIBLE = 6

  // Declare form — workspace scope only. City/event/release-plan scopes need
  // an entity picker this panel does not have; the tenant-wide target is the
  // common case and stays a four-field form.
  const [declaring, setDeclaring] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [platform, setPlatform] = createSignal('spotify')
  const [metricKey, setMetricKey] = createSignal('followers')
  const [targetValue, setTargetValue] = createSignal('')
  const [deadline, setDeadline] = createSignal(datePlusDays(90))

  const declareObjective = async () => {
    const target = Number(targetValue())
    if (!Number.isInteger(target) || target <= 0) {
      setError('The target needs to be a whole number above zero.')
      return
    }
    const by = authState.profile()?.username ?? 'operator'
    setSaving(true)
    setError(null)
    try {
      await api.declareGrowthObjective(props.slug, {
        platform: platform(),
        metric_key: metricKey().trim(),
        scope_kind: 'workspace',
        target_value: target,
        deadline: `${deadline()}T00:00:00Z`,
        declared_by: by,
      })
      setDeclaring(false)
      setTargetValue('')
      refreshQueries(['growth-objectives', props.slug])
    } catch (err) {
      setError(failureLine("Couldn't add the objective", err))
    } finally {
      setSaving(false)
    }
  }

  const objectives = useQuery(() => ({
    queryKey: ['growth-objectives', props.slug],
    queryFn: async () => {
      const data = await api.growthObjectives(props.slug)
      return data.objectives
    },
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const retireObjective = async (objective: GrowthObjectiveView) => {
    setRetiring(objective.objective_id)
    setError(null)
    try {
      await api.retireGrowthObjective(props.slug, objective.objective_id)
      refreshQueries(['growth-objectives', props.slug])
    } catch (err) {
      setError(failureLine("Couldn't retire the objective", err))
    } finally {
      setRetiring(null)
    }
  }

  return <Section
    title="Growth objectives"
    icon={<SectionIcon name="target" />}
    count={objectives.data?.length}
    description="Declared growth targets. Each objective freezes a baseline and measures progress toward the target value by the deadline."
  >

    <Show when={error() && !declaring()}>
      <ErrorCard class="mt-3">{error()}</ErrorCard>
    </Show>

    <Show when={objectives.error}><ErrorCard class="mt-3" title="Couldn't load growth objectives" error={objectives.error} onRetry={() => void objectives.refetch()} /></Show>
    <Show when={objectives.data && objectives.data!.length > 0} fallback={
      <Show when={objectives.isFetching} fallback={
        <EmptyState icon={<ChartLine />} label="No growth objectives yet" hint={authState.isPlatformLevel() ? 'Declare a target metric and deadline to start tracking progress. The intelligence measures every action against active objectives.' : 'Set a target number and deadline to start tracking progress. It measures every action against them.'} />
      }>
        <SkeletonRows count={3} />
      </Show>
    }>
      <div class="mt-3 flex flex-col gap-3">
        <For each={showAll() ? objectives.data : objectives.data!.slice(0, MAX_VISIBLE)}>{(obj: GrowthObjectiveView) => {
          const observed = obj.observed_value ?? obj.baseline_value
          const pct = stateProgress(obj.state)
          const overTarget = observed > obj.target_value
          return (
            <div class="p-4 border border-border rounded-lg bg-card">
              <div class="flex items-center justify-between gap-3">
                <strong class="text-sm font-semibold text-foreground">{obj.platform} · {obj.metric_key.replace(/_/g, ' ')}</strong>
                <div class="flex items-center gap-2">
                  <Badge variant={toneVariant(stateTone(obj.state))}>{stateLabel(obj.state)}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    writes
                    disabled={retiring() === obj.objective_id}
                    onClick={() => retireObjective(obj)}
                  >{retiring() === obj.objective_id ? 'Retiring…' : 'Retire'}</Button>
                </div>
              </div>
              <div class="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  class={`h-full rounded-full ${overTarget ? 'bg-destructive' : 'bg-primary'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div class="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>Baseline: {compactNumber(obj.baseline_value)}</span>
                <span>Observed: {obj.observed_value != null ? compactNumber(obj.observed_value) : '—'}</span>
                <span>Target: {compactNumber(obj.target_value)}</span>
                <span>{formatDeadline(obj.deadline)}</span>
              </div>
            </div>
          )
        }}</For>
      </div>
      <Show when={objectives.data!.length > MAX_VISIBLE}>
        <Button variant="ghost" size="sm" class="mt-3" onClick={() => setShowAll(s => !s)}>
          {showAll() ? 'Show fewer' : `Show all ${objectives.data!.length}`}
        </Button>
      </Show>
    </Show>

    {/* The palette's "set a growth goal" lands here — the form has to exist
        for the link to be honest. Declaring freezes the metric's current
        value as the baseline; the brain then measures every action against
        it. */}
    <Button variant="outline" size="sm" class="mt-3" writes onClick={() => { setError(null); setDeclaring(true) }}>
      <Plus aria-hidden="true" /> Declare an objective
    </Button>
    <FormDrawer
      open={declaring()}
      onOpenChange={setDeclaring}
      title="Declare an objective"
      description="The metric's current value becomes the baseline. The brain then measures every action against it."
      submitLabel="Declare objective"
      pendingLabel="Declaring…"
      pending={saving()}
      error={error()}
      onSubmit={() => void declareObjective()}
    >
      <Field label="Platform">
        <NativeSelect value={platform()} onChange={e => setPlatform(e.currentTarget.value)}>
          <For each={OBJECTIVE_PLATFORMS}>{p => <option value={p.value}>{p.label}</option>}</For>
        </NativeSelect>
      </Field>
      <Field label="Metric" hint="Pick a suggestion or type the metric's name.">
        <Input
          required type="text" list="objective-metric-keys" autocomplete="off"
          value={metricKey()}
          onInput={e => setMetricKey(e.currentTarget.value)}
          placeholder="followers"
        />
        <datalist id="objective-metric-keys">
          <For each={METRIC_KEY_SUGGESTIONS}>{k => <option value={k} />}</For>
        </datalist>
      </Field>
      <Field label="Target" hint="A whole number above zero.">
        <Input
          required type="number" min="1" step="1" inputmode="numeric"
          value={targetValue()}
          onInput={e => setTargetValue(e.currentTarget.value)}
          placeholder="5000"
        />
      </Field>
      <Field label="By" hint="The date the target should be reached.">
        <Input
          required type="date"
          value={deadline()}
          min={datePlusDays(1)}
          onChange={e => setDeadline(e.currentTarget.value)}
        />
      </Field>
    </FormDrawer>
  </Section>
}
