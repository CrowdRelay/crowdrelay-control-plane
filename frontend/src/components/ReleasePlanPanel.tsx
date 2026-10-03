import { For, Show, createSignal } from 'solid-js'
import { CalendarDays, MoreHorizontal, Plus } from 'lucide-solid'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { capability, capabilityAction } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { authState } from '../lib/auth'
import { READ_ONLY_REASON } from '../lib/read-only'
import { formatTimestamp, tokenLabel } from '../lib/format'
import { cn } from '../lib/cn'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Badge } from './app/badge'
import { Button } from './app/button'
import { DataTable, type ColumnDef } from './app/data-table'
import { Pill, Steps } from './ui/dash'
import { EmptyState } from './ui/empty-state'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { SkeletonRows } from './Skeleton'
import { SectionFailureCard } from './SectionFailureCard'
import { ActionSheet, type OpenWrite } from './capabilities/ActionSheet'
import { Dialog } from './Dialog'

// P4 — release a record, R-28 → R+30. One row per release: how far along its
// ladder of milestones is (done, parked, due, upcoming), the one step only a
// person can close (the editorial pitch — nothing the agent reads would tell
// it the form was submitted), and the latest honest report the release
// produced: above trend, within noise, or insufficient evidence — never a
// quietly recomputed win. The whole ladder opens from the row.

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

type Filter = 'all' | 'upcoming' | 'out' | 'waiting'

const words = (value: string) => value.replaceAll('_', ' ')
const offset = (days: number) => (days === 0 ? 'R' : days < 0 ? `R${days}` : `R+${days}`)
const time = (iso: string) => {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : t
}

// Shape carries the state, colour only reinforces it: a filled dot is done,
// a thick ring is open (due or parked), a thin outline is still to come.
const DOT: Record<ReleaseStep['state'], string> = {
  done: 'border border-success-solid bg-success-solid',
  due: 'border-2 border-warning-solid',
  parked: 'border-2 border-warning-solid',
  upcoming: 'border border-muted-foreground/60',
  disabled: 'border border-dashed border-muted-foreground/40',
}

/** The ladder in the order it runs, whatever order the read returned. */
const ladder = (plan: ReleasePlan) => [...plan.timeline].sort((a, b) => a.offset_days - b.offset_days)
const doneCount = (plan: ReleasePlan) => plan.timeline.filter(s => s.state === 'done').length
const nextStep = (plan: ReleasePlan) => ladder(plan).find(s => s.state === 'due' || s.state === 'parked' || s.state === 'upcoming')

const pitchOpen = (plan: ReleasePlan) =>
  plan.editorial_pitch_completed_at == null &&
  plan.timeline.some(step => step.milestone === 'editorial_pitch' && (step.state === 'parked' || step.state === 'due'))
/** Two misses in a row at a tier and the next outward step waits for a person. */
const held = (plan: ReleasePlan) => plan.tier_release_miss_streak >= 2
const waitsOnYou = (plan: ReleasePlan) => pitchOpen(plan) || held(plan)

const verdictTone = (verdict: string) =>
  verdict.includes('above') ? 'good' as const : verdict.includes('below') ? 'bad' as const : 'muted' as const

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
  const outcomesFor = (releaseId: string) =>
    (outcomes.data ?? []).filter(o => o.release_id === releaseId).sort((a, b) => time(b.generated_at) - time(a.generated_at))

  // Planning a release and marking the pitch open beside the table, not
  // inside it.
  const [write, setWrite] = createSignal<OpenWrite | null>(null)
  const [viewing, setViewing] = createSignal<ReleasePlan | null>(null)
  const [show, setShow] = createSignal<Filter>('all')
  const readOnly = () => authState.readOnly()

  const planRelease = (): OpenWrite => ({
    title: 'Plan a release',
    description: 'The ladder — calendar, pitch, announcement, press, the day, the reports — starts from its date.',
    action: capabilityAction('releases', 'Plan a release'),
    initial: { expected_version: '0', active: true },
    hidden: ['expected_version'],
  })
  const pitchDone = (plan: ReleasePlan): OpenWrite => ({
    title: 'Editorial pitch submitted',
    description: plan.title,
    intro: 'The editorial pitch is a form only a person can send. Mark it once you have, and the ladder moves on.',
    action: capabilityAction('releases', 'Editorial pitch done'),
    fixed: { release_id: plan.release_id },
  })

  const all = () => plans.data ?? []
  const now = Date.now()
  const matches = (plan: ReleasePlan, filter: Filter) =>
    filter === 'all' ? true
    : filter === 'upcoming' ? time(plan.release_at) > now
    : filter === 'out' ? time(plan.release_at) <= now
    : waitsOnYou(plan)
  const visible = () => all().filter(p => matches(p, show()))
  const CHIPS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'out', label: 'Out' },
    { id: 'waiting', label: 'Waiting on you' },
  ]

  const columns: ColumnDef<ReleasePlan, any>[] = [
    {
      id: 'release', header: 'Release', accessorFn: p => p.title,
      cell: c => {
        const p = c.row.original
        return <span class="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span class="font-medium text-foreground">{p.title}</span>
          <Badge variant="outline" class="font-normal">{words(p.tier)}</Badge>
          <Show when={!p.active}><Badge variant="muted">Paused</Badge></Show>
        </span>
      },
    },
    {
      id: 'out', header: 'Out', accessorFn: p => time(p.release_at), meta: { class: 'whitespace-nowrap' },
      cell: c => formatTimestamp(c.row.original.release_at),
    },
    {
      id: 'stage', header: 'Stage', accessorFn: p => p.lifecycle, meta: { class: 'whitespace-nowrap' },
      cell: c => <span class="text-muted-foreground">{tokenLabel(c.row.original.lifecycle)}</span>,
    },
    {
      id: 'ladder', header: 'Ladder', accessorFn: p => p.timeline.length ? doneCount(p) / p.timeline.length : 0,
      cell: c => {
        const p = c.row.original
        const next = nextStep(p)
        return <div class="min-w-40 space-y-1">
          <div class="flex items-center gap-1" role="img" aria-label={`${doneCount(p)} of ${p.timeline.length} steps done`}>
            <For each={ladder(p)}>{step => (
              <span
                class={cn('inline-block size-2.5 shrink-0 rounded-full', DOT[step.state] ?? DOT.upcoming)}
                title={`${offset(step.offset_days)} ${words(step.milestone)} · ${words(step.state)}`}
              />
            )}</For>
            <span class="ml-1 text-xs tabular-nums text-muted-foreground">{doneCount(p)}/{p.timeline.length}</span>
          </div>
          <Show when={next} fallback={<p class="text-xs text-muted-foreground">Every step settled</p>}>
            {step => (
              <p class="text-xs text-muted-foreground">
                Next: <span class="text-foreground">{offset(step().offset_days)} {words(step().milestone)}</span>
                <Show when={step().state !== 'upcoming'}> · {words(step().state)}</Show>
              </p>
            )}
          </Show>
        </div>
      },
    },
    {
      id: 'waiting', header: 'Waiting on you', accessorFn: p => (pitchOpen(p) ? 2 : 0) + (held(p) ? 1 : 0),
      cell: c => {
        const p = c.row.original
        return <Show when={waitsOnYou(p)} fallback={<span class="text-muted-foreground">—</span>}>
          <span class="inline-flex flex-wrap gap-1">
            <Show when={pitchOpen(p)}><Pill tone="warn">Editorial pitch</Pill></Show>
            <Show when={held(p)}>
              <Pill tone="warn">Held · {p.tier_release_miss_streak} misses</Pill>
            </Show>
          </span>
        </Show>
      },
    },
    {
      id: 'result', header: 'Latest report', accessorFn: p => outcomesFor(p.release_id)[0]?.verdict ?? '',
      cell: c => {
        const latest = () => outcomesFor(c.row.original.release_id)[0]
        return <Show when={latest()} fallback={<span class="text-muted-foreground">—</span>}>
          {o => (
            <span class="inline-flex flex-col">
              <Pill tone={verdictTone(o().verdict)} class="self-start">{tokenLabel(o().verdict)}</Pill>
              <span class="mt-0.5 text-xs text-muted-foreground">{words(o().report_kind)} · {o().window_days} days</span>
            </span>
          )}
        </Show>
      },
    },
    {
      id: 'actions', header: () => <span class="sr-only">Actions</span>, enableSorting: false, enableHiding: false,
      meta: { class: 'w-12 text-right' },
      cell: c => (
        <DropdownMenu placement="bottom-end">
          <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="size-8">
            <span class="sr-only">Open menu for {c.row.original.title}</span>
            <MoreHorizontal aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent class="min-w-48">
            <DropdownMenuItem onSelect={() => setViewing(c.row.original)}>View the ladder</DropdownMenuItem>
            <Show when={pitchOpen(c.row.original)}>
              <DropdownMenuItem disabled={readOnly()} title={readOnly() ? READ_ONLY_REASON : undefined} onSelect={() => setWrite(pitchDone(c.row.original))}>
                We submitted the pitch
              </DropdownMenuItem>
            </Show>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <Section
      flush
      title="Release plan"
      icon={<SectionIcon name="play" />}
      count={plans.data?.length}
      description="Each release as a ladder from R-28 to R+30: what is done, what waits on you, and what the release measurably did."
    >
      <Show when={!plans.error} fallback={<SectionFailureCard error={plans.error} title="Couldn't check the release plan" onRetry={() => void plans.refetch()} />}>
        <Show when={plans.data} fallback={<SkeletonRows count={3} />}>
          <DataTable
            data={visible()}
            columns={columns}
            getRowId={p => p.release_id}
            bordered={false}
            initialSorting={[{ id: 'out', desc: true }]}
            searchText={p => [p.title, words(p.tier), words(p.lifecycle), ...p.timeline.map(s => words(s.milestone))].join(' ')}
            searchPlaceholder="Search releases"
            toolbar={
              <div role="group" aria-label="Show" class="flex flex-wrap items-center gap-1">
                <For each={CHIPS}>{chip => (
                  <Button variant={show() === chip.id ? 'secondary' : 'ghost'} size="sm" aria-pressed={show() === chip.id} onClick={() => setShow(chip.id)}>
                    {chip.label}
                    <span class="tabular-nums text-muted-foreground">{all().filter(p => matches(p, chip.id)).length}</span>
                  </Button>
                )}</For>
              </div>
            }
            actions={
              <Button writes size="sm" onClick={() => setWrite(planRelease())}>
                <Plus aria-hidden="true" /> Plan a release
              </Button>
            }
            empty={
              all().length === 0
                ? <EmptyState icon={<CalendarDays />} label="No release planned" hint="Plan the next release and the ladder — calendar, pitch, announcement, press, the day, the reports — starts from its date." />
                : <EmptyState
                    icon={<CalendarDays />}
                    label="No releases here"
                    hint="Nothing matches this filter."
                  >
                    <Button variant="outline" size="sm" onClick={() => setShow('all')}>Show all releases</Button>
                  </EmptyState>
            }
          />
        </Show>
      </Show>

      <ActionSheet
        slug={props.slug}
        write={write()}
        onClose={() => setWrite(null)}
        onDone={() => { setWrite(null); refresh() }}
      />

      <Dialog
        open={viewing() !== null}
        onClose={() => setViewing(null)}
        label={viewing()?.title ?? 'Release'}
        description={viewing() ? <>{words(viewing()!.tier)} · out {formatTimestamp(viewing()!.release_at)}</> : undefined}
      >
        <Show when={viewing()}>{plan => <div class="space-y-4">
          <Show when={held(plan())}>
            <p class="text-sm text-muted-foreground text-pretty">
              Held: the last {plan().tier_release_miss_streak} {words(plan().tier)} releases showed no lift, so the next outward step at this tier waits for a person.
            </p>
          </Show>
          <Steps steps={ladder(plan()).map(step => ({
            label: <><span class="tabular-nums text-muted-foreground">{offset(step.offset_days)}</span> {tokenLabel(step.milestone)}</>,
            state: step.state === 'parked' ? 'due' : step.state,
            note: step.completed_at ? `done ${formatTimestamp(step.completed_at)}` : `${words(step.state)} · due ${formatTimestamp(step.due_at)}`,
          }))} />
          <Show when={outcomesFor(plan().release_id).length > 0}>
            <div>
              <h3 class="mb-1 text-xs font-medium text-foreground">Reports</h3>
              <ul class="space-y-1 text-xs text-muted-foreground">
                <For each={outcomesFor(plan().release_id)}>{outcome => (
                  <li>
                    {words(outcome.report_kind)} over {outcome.window_days} days: <strong class="text-foreground">{words(outcome.verdict)}</strong>
                    {' '}· {formatTimestamp(outcome.generated_at)}
                  </li>
                )}</For>
              </ul>
            </div>
          </Show>
        </div>}</Show>
      </Dialog>
    </Section>
  )
}
