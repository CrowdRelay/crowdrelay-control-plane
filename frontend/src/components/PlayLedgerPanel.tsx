import { For, Show, createSignal } from 'solid-js'
import { ChartLine } from 'lucide-solid'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { formatTimestamp, tokenLabel } from '../lib/format'
import type { PlayClaimView, PlayKindStanding, PlayLedgerEntry } from '../lib/types'
import { EmptyState } from './ui/empty-state'
import { Pill, Tile, Tiles, type Tone } from './ui/dash'
import { SkeletonRows } from './Skeleton'
import { SectionIcon } from './SectionIcon'
import { SectionFailureCard } from './SectionFailureCard'
import { Section } from './layout'
import { Button } from './app/button'
import { DataTable, type ColumnDef } from './app/data-table'
import { Dialog } from './Dialog'

// The play ledger — what the brain committed to, what it did, and what each
// number is allowed to prove. A play is an experiment: a hypothesis, steps
// sent to fans, and claims measured against a baseline. Each kind of play
// earns a standing from its record, and that standing sets how many fans
// its next step may reach.

const KIND_LABELS: Record<string, string> = {
  track_us_ask: 'Track us ask',
  listing_completeness_sweep: 'Listing sweep',
  follow_ask_ladder: 'Follow ladder',
  dormant_revival: 'Dormant revival',
  release_runway: 'Release runway',
}
const kindLabel = (kind: string) => KIND_LABELS[kind] ?? tokenLabel(kind)

// "Effect +5.2% on Spotify followers", not "improved · basis_points ·
// spotify / followers". The keys come straight from the decision row.
const CLAIM_LABELS: Record<string, string> = { basis_points: 'Effect', absolute: 'Change', count: 'Count' }
const claimLabel = (means: string) => CLAIM_LABELS[means] ?? tokenLabel(means)
const metricLabel = (claim: PlayClaimView) =>
  `${tokenLabel(claim.success_metric_platform)} · ${tokenLabel(claim.success_metric_key).toLowerCase()}`

const STATE_TONE: Record<string, Tone> = { completed: 'good', done: 'good', running: 'warn', active: 'warn', failed: 'bad', cancelled: 'bad' }
const LIVE_STATES = new Set(['running', 'active'])
const EFFECT_TONE: Record<string, Tone> = { improved: 'good', neutral: 'muted', worsened: 'bad' }

const percent = (basisPoints: number) => `${basisPoints > 0 ? '+' : ''}${(basisPoints / 100).toFixed(1)}%`

const standingText = (s: PlayKindStanding) => {
  const st = s.standing
  switch (st.standing) {
    case 'untested': return 'Untested'
    case 'weighted': return `Weighted ${Math.round(st.basis_points / 100)}%`
    case 'retired': return 'Retired'
  }
}
const standingNote = (s: PlayKindStanding) => {
  const st = s.standing
  return st.standing === 'retired' ? st.reason : `${st.measured} measured`
}
const standingTone = (s: PlayKindStanding): Tone => {
  const st = s.standing
  return st.standing === 'weighted' ? (st.basis_points >= 5000 ? 'good' : 'warn') : st.standing === 'retired' ? 'bad' : 'muted'
}
/** Retired last, then by weight — the kinds the brain trusts most first. */
const standingRank = (s: PlayKindStanding) =>
  s.standing.standing === 'weighted' ? 20_000 + s.standing.basis_points : s.standing.standing === 'untested' ? 10_000 : 0

const time = (iso: string | null) => {
  const t = iso ? new Date(iso).getTime() : NaN
  return Number.isNaN(t) ? 0 : t
}
const improvedClaims = (p: PlayLedgerEntry) => p.claims.filter(c => c.effect === 'improved').length
const worsenedClaims = (p: PlayLedgerEntry) => p.claims.filter(c => c.effect === 'worsened').length

export function PlayLedgerPanel(props: { slug: string }) {
  const ledger = useQuery(() => ({
    queryKey: ['play-ledger', props.slug],
    queryFn: () => api.playLedger(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))
  const [state, setState] = createSignal('all')
  const [viewing, setViewing] = createSignal<PlayLedgerEntry | null>(null)

  const plays = () => ledger.data?.plays ?? []
  const standings = () => ledger.data?.standings ?? []
  const states = () => [...new Set(plays().map(p => p.state))]
  const visible = () => state() === 'all' ? plays() : plays().filter(p => p.state === state())
  const claims = () => plays().flatMap(p => p.claims)
  const measured = () => claims().filter(c => c.effect != null).length

  const kindColumns: ColumnDef<PlayKindStanding, any>[] = [
    {
      id: 'kind', header: 'Kind', accessorFn: s => kindLabel(s.kind), meta: { class: 'whitespace-nowrap' },
      cell: c => <span class="font-medium text-foreground">{kindLabel(c.row.original.kind)}</span>,
    },
    {
      id: 'standing', header: 'Standing', accessorFn: standingRank,
      cell: c => <span class="inline-flex flex-col items-start gap-0.5">
        <Pill tone={standingTone(c.row.original)}>{standingText(c.row.original)}</Pill>
        <span class="max-w-56 text-xs text-muted-foreground text-pretty">{standingNote(c.row.original)}</span>
      </span>,
    },
    { id: 'improved', header: 'Improved', accessorFn: s => s.record.improved, meta: { numeric: true } },
    { id: 'neutral', header: 'No change', accessorFn: s => s.record.neutral, meta: { numeric: true } },
    {
      id: 'worsened', header: 'Worsened', accessorFn: s => s.record.worsened, meta: { numeric: true },
      cell: c => <span class={c.row.original.record.worsened > 0 ? 'text-error-foreground' : undefined}>{c.row.original.record.worsened}</span>,
    },
    { id: 'insufficient', header: 'Unclear', accessorFn: s => s.record.insufficient, meta: { numeric: true } },
    {
      id: 'cap', header: 'Step cap', accessorFn: s => s.effective_max_recipients_per_step, meta: { numeric: true },
    },
  ]

  const playColumns: ColumnDef<PlayLedgerEntry, any>[] = [
    {
      id: 'play', header: 'Play', accessorFn: p => kindLabel(p.kind), meta: { class: 'min-w-56' },
      cell: c => <>
        <span class="font-medium text-foreground">{kindLabel(c.row.original.kind)}</span>
        <Show when={c.row.original.hypothesis}>
          <span class="block max-w-sm text-muted-foreground text-pretty">{c.row.original.hypothesis}</span>
        </Show>
      </>,
    },
    {
      id: 'state', header: 'State', accessorFn: p => p.state,
      cell: c => <Pill tone={STATE_TONE[c.row.original.state] ?? 'muted'}>{tokenLabel(c.row.original.state)}</Pill>,
    },
    {
      id: 'started', header: 'Started', accessorFn: p => time(p.started_at), meta: { class: 'whitespace-nowrap' },
      cell: c => <>
        {formatTimestamp(c.row.original.started_at)}
        <Show when={c.row.original.completed_at}>
          <span class="block text-xs text-muted-foreground">ended {formatTimestamp(c.row.original.completed_at)}</span>
        </Show>
      </>,
    },
    {
      id: 'steps', header: 'Steps', accessorFn: p => p.steps_total ? p.steps_settled / p.steps_total : 0, meta: { numeric: true, class: 'whitespace-nowrap' },
      cell: c => <>
        {c.row.original.steps_settled}/{c.row.original.steps_total}
        <span class="block text-xs text-muted-foreground">{c.row.original.steps_skipped} skipped</span>
      </>,
    },
    { id: 'reached', header: 'Fans reached', accessorFn: p => p.recipients_reached, meta: { numeric: true } },
    {
      id: 'claims', header: 'Claims', accessorFn: improvedClaims, meta: { class: 'whitespace-nowrap' },
      cell: c => {
        const p = c.row.original
        return <Show when={p.claims.length > 0} fallback={<span class="text-muted-foreground">—</span>}>
          <span class="inline-flex flex-wrap gap-1">
            <Pill tone={improvedClaims(p) > 0 ? 'good' : 'muted'}>{improvedClaims(p)} improved</Pill>
            <Show when={worsenedClaims(p) > 0}><Pill tone="bad">{worsenedClaims(p)} worsened</Pill></Show>
          </span>
          <span class="mt-0.5 block text-xs text-muted-foreground">of {p.claims.length}</span>
        </Show>
      },
    },
    {
      id: 'actions', header: () => <span class="sr-only">Actions</span>, enableSorting: false, enableHiding: false,
      meta: { class: 'w-20 text-right' },
      cell: c => (
        <Show when={c.row.original.claims.length > 0}>
          <Button variant="ghost" size="sm" onClick={() => setViewing(c.row.original)}>
            Claims
            <span class="sr-only"> for {kindLabel(c.row.original.kind)}, started {formatTimestamp(c.row.original.started_at)}</span>
          </Button>
        </Show>
      ),
    },
  ]

  return (
    <Show when={!ledger.error} fallback={<SectionFailureCard error={ledger.error} title="Couldn't load the play ledger" onRetry={() => void ledger.refetch()} />}>
      <Show when={ledger.data} fallback={<SkeletonRows count={4} />}>
        <div class="space-y-6">
          <Tiles class="mb-6">
            <Tile
              label="Plays"
              value={plays().length}
              sub={`${plays().filter(p => LIVE_STATES.has(p.state)).length} running now`}
            />
            <Tile
              label="Fans reached"
              value={plays().reduce((sum, p) => sum + p.recipients_reached, 0).toLocaleString()}
              sub="across every play"
            />
            <Tile
              label="Claims that improved"
              value={claims().filter(c => c.effect === 'improved').length}
              valueTone={claims().some(c => c.effect === 'improved') ? 'good' : undefined}
              sub={`of ${measured()} measured`}
            />
            <Tile
              label="Kinds retired"
              value={standings().filter(s => s.standing.standing === 'retired').length}
              sub={`of ${standings().length} kinds`}
            />
          </Tiles>

          <div class="rounded-xl border border-border bg-card p-4 sm:p-5">
            <Section
              flush
              title="Play kinds"
              icon={<SectionIcon name="list-checks" />}
              count={standings().length}
              description="Each kind of play earns its standing from its record. The standing sets its step cap: how many fans its next step may reach. Unclear means too little data to call it either way."
            >
              <DataTable
                data={standings()}
                columns={kindColumns}
                getRowId={s => s.kind}
                bordered={false}
                initialSorting={[{ id: 'standing', desc: true }]}
                searchText={s => [kindLabel(s.kind), standingText(s), standingNote(s)].join(' ')}
                searchPlaceholder="Search kinds"
                empty={<EmptyState icon={<ChartLine />} label="No play kinds yet" hint="A kind earns a standing once its first play has been measured." />}
              />
            </Section>
          </div>

          <div class="rounded-xl border border-border bg-card p-4 sm:p-5">
            <Section
              flush
              title="Plays"
              icon={<SectionIcon name="play" />}
              count={plays().length}
              description={`What ${authState.isPlatformLevel() ? 'the agent' : 'the brain'} committed to and what it did. Each play is an experiment with claims, evidence and an effect assessment.`}
            >
              <DataTable
                data={visible()}
                columns={playColumns}
                getRowId={p => p.play_id}
                bordered={false}
                initialSorting={[{ id: 'started', desc: true }]}
                searchText={p => [kindLabel(p.kind), p.hypothesis, p.state, ...p.claims.map(metricLabel)].join(' ')}
                searchPlaceholder="Search by kind, hypothesis or metric"
                toolbar={
                  <Show when={states().length > 1}>
                    <div role="group" aria-label="State" class="flex flex-wrap items-center gap-1">
                      <For each={['all', ...states()]}>{id => (
                        <Button variant={state() === id ? 'secondary' : 'ghost'} size="sm" aria-pressed={state() === id} onClick={() => setState(id)}>
                          {id === 'all' ? 'All' : tokenLabel(id)}
                          <span class="tabular-nums text-muted-foreground">{id === 'all' ? plays().length : plays().filter(p => p.state === id).length}</span>
                        </Button>
                      )}</For>
                    </div>
                  </Show>
                }
                empty={
                  plays().length === 0
                    ? <EmptyState icon={<ChartLine />} label="No plays recorded" hint={authState.isPlatformLevel() ? 'The play ledger tracks every action the intelligence has executed. Plays appear here once the autopilot starts dispatching.' : 'The play ledger tracks every action it has run. Plays appear here once the brain starts handing out work.'} />
                    : <EmptyState icon={<ChartLine />} label="No plays here" hint="Nothing matches this filter.">
                        <Button variant="outline" size="sm" onClick={() => setState('all')}>Show all plays</Button>
                      </EmptyState>
                }
              />
            </Section>
          </div>
        </div>

        <Dialog
          open={viewing() !== null}
          onClose={() => setViewing(null)}
          label={viewing() ? `${kindLabel(viewing()!.kind)} claims` : 'Claims'}
          description={viewing() ? <>Started {formatTimestamp(viewing()!.started_at)} · {viewing()!.recipients_reached} fans reached</> : undefined}
        >
          <Show when={viewing()}>{play => <div class="space-y-3">
            <Show when={play().hypothesis}>
              <p class="text-sm text-muted-foreground text-pretty">Hypothesis: <span class="text-foreground">{play().hypothesis}</span></p>
            </Show>
            <ul class="divide-y divide-border rounded-lg border border-border">
              <For each={play().claims}>{claim => (
                <li class="space-y-1 px-3 py-2.5">
                  <div class="flex items-center justify-between gap-3">
                    <span class="flex min-w-0 items-center gap-2">
                      <Pill tone={EFFECT_TONE[claim.effect ?? ''] ?? 'muted'}>{tokenLabel(claim.effect ?? claim.status)}</Pill>
                      <span class="text-sm text-foreground">{metricLabel(claim)}</span>
                    </span>
                    <Show when={claim.delta_basis_points != null}>
                      <span class="shrink-0 text-sm font-medium tabular-nums text-foreground">{percent(claim.delta_basis_points!)}</span>
                    </Show>
                  </div>
                  <p class="text-xs text-muted-foreground">
                    {claimLabel(claim.claim_means)}
                    <Show when={time(claim.window_start) && time(claim.window_end)}> · {formatTimestamp(claim.window_start)} – {formatTimestamp(claim.window_end)}</Show>
                    <Show when={claim.recipients_reached != null}> · {claim.recipients_reached} fans</Show>
                  </p>
                  <Show when={claim.evidence_reason}>
                    <p class="text-xs text-muted-foreground text-pretty">{claim.evidence_reason}</p>
                  </Show>
                </li>
              )}</For>
            </ul>
          </div>}</Show>
        </Dialog>
      </Show>
    </Show>
  )
}
