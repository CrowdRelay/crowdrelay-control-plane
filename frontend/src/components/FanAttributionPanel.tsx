import { For, Show } from 'solid-js'
import { KpiCard, KpiStrip, Section } from './layout'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { humanizeToken, relativeTime, timestampMillis } from '../lib/format'
import { SectionIcon } from './SectionIcon'
import { EmptyState } from './ui/empty-state'
import { SkeletonSection } from './Skeleton'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './app/table'
import { TrendingDown, TrendingUp, Users } from 'lucide-solid'
import type { FanSourceSnapshot, NorthStarShift } from '../lib/types'

// `/operations/fan-sources` answers the causal half of the north star — which
// templates and strategies produced fans, net of drift — where the channels
// panel above it answers the literal where. The same snapshot row also carries
// the CUSUM regime shifts over the North Star series: attribution says who,
// the shifts say when. Together they are the one sentence a band acts on.
//
// Two things this card deliberately does not do: it renders ineffective
// templates (a winners-only card is a vanity metric), and it never writes
// "because of X" under a shift — CUSUM says when the rate changed, not why.

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1))

const ShiftMarker = (props: { shift: NorthStarShift }) => (
  <li class="flex items-start gap-3 py-2 border-b border-border last:border-0">
    <span class={`mt-0.5 ${props.shift.direction === 'upward' ? 'text-emerald-400' : 'text-red-400'}`}>
      {props.shift.direction === 'upward' ? <TrendingUp class="size-4" /> : <TrendingDown class="size-4" />}
    </span>
    <div class="min-w-0">
      <p class="m-0 text-sm text-foreground">
        <strong>{props.shift.date}</strong>
        {' — '}
        rate moved from {fmt(props.shift.pre_mean)} to {fmt(props.shift.post_mean)} fans a day
      </p>
      <p class="m-0 mt-0.5 text-xs text-muted-foreground">
        sustained deviation {fmt(props.shift.magnitude)} — detected, not caused
      </p>
    </div>
  </li>
)

export function FanAttributionPanel(props: { slug: string }) {
  const model = useQuery(() => ({
    queryKey: ['fan-sources', props.slug],
    queryFn: () => api.fanSources(props.slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))
  // The brain's own verdict rides beside the shift list on purpose: a
  // proportional `regressing` over a base of one reads very differently next
  // to "detected shifts: none" than it does alone. Cached on the shared key
  // the brief tab already uses, so this costs no second request when both
  // tabs are open.
  const brief = useQuery(() => ({
    queryKey: ['intelligence-brief', props.slug],
    queryFn: () => api.intelligence(props.slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  const latest = (): FanSourceSnapshot | undefined => model.data?.snapshots[0]
  const attribution = () => latest()?.attribution
  const shifts = () => latest()?.north_star_shifts ?? []
  const brainState = () => brief.data?.brain.state

  return <Section
    title="What the growth came from"
    icon={<SectionIcon name="target" />}
    description={authState.isPlatformLevel()
      ? 'Fan growth attributed to the templates and strategies that produced it — observed, incremental (counterfactual-adjusted), and durable at 30 days — plus the regime shifts CUSUM detected in the North Star series.'
      : 'Where your fan growth came from: what the system did, what it actually produced, and when the rate changed.'}
  >
    <Show when={model.error}>
      <div class="p-4 mt-2.5 rounded-lg border border-border bg-background"><p class="m-0 text-sm text-muted-foreground">{authState.isPlatformLevel() ? 'Fan-source snapshots are not available on the connected CrowdRelay build.' : 'We cannot show where the fans came from on this setup yet.'}</p></div>
    </Show>

    <Show when={!model.error && model.isPending}><SkeletonSection titleWidth="200px" lines={4} minHeight="160px" /></Show>

    <Show
      when={latest()}
      fallback={<Show when={!model.error && !model.isPending}>
        <EmptyState icon={<Users />}
          label="No fan-source snapshots yet"
          hint={authState.isPlatformLevel() ? 'The worker writes one attribution snapshot an hour once a cycle has run. Until the first lands this ledger is honestly empty.' : 'Once the system has run a cycle, what brought your fans shows up here.'}
        />
      </Show>}
    >{snapshot => <>
      <p class="m-0 mt-4 text-xs text-muted-foreground">
        Captured {relativeTime(timestampMillis(snapshot().captured_at))} · {snapshot().resolved_observations.toLocaleString()} resolved observations
        <Show when={brainState()}>{state => <> · brain: {state()}</>}</Show>
        {' · detected shifts: '}{shifts().length}
      </p>

      <KpiStrip class="mt-2 mb-0">
        <KpiCard label="Observed fans" value={fmt(snapshot().total_observed_fans)} sub="everyone who arrived" />
        <KpiCard label="Incremental" value={fmt(snapshot().total_incremental_fans)} sub="beyond the counterfactual" />
        <KpiCard label="Durable · 30d" value={fmt(snapshot().total_durable_fans)} sub="still there a month later" />
      </KpiStrip>

      <Show when={shifts().length > 0}>
        <section class="mt-6 pt-4 border-t border-border">
          <h3 class="text-sm font-semibold text-foreground">When the rate changed</h3>
          <p class="m-0 mt-1 text-sm text-muted-foreground leading-relaxed">
            {authState.isPlatformLevel()
              ? 'CUSUM regime shifts over the 60-day North Star series. A shift says when the rate moved, never why — the templates below are what was running across the same window, not the cause.'
              : 'Sudden changes in your fan-growth rate over the last 60 days. A marker says when the rate moved — what produced it is the table below, not the marker.'}
          </p>
          <ul class="m-0 mt-2 p-0 list-none">
            <For each={shifts()}>{shift => <ShiftMarker shift={shift} />}</For>
          </ul>
        </section>
      </Show>

      <Show
        when={(attribution()?.by_template.length ?? 0) > 0}
        fallback={<EmptyState icon={<Users />}
          label="No attributed fan growth yet"
          hint={authState.isPlatformLevel() ? 'A template appears once a resolved outcome lands — a post measured, a link clicked, a fan counted. Until then the ledger is honest and empty.' : 'Once a post or link brings someone in, what brought them shows up here.'}
        />}
      >
        <Table class="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead class="text-right">Runs</TableHead>
              <TableHead class="text-right">Observed</TableHead>
              <TableHead class="text-right">Incremental</TableHead>
              <TableHead class="text-right">Durable</TableHead>
              <TableHead class="text-right">Per run</TableHead>
              <TableHead>Evidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* by_template arrives sorted by incremental fans — the ineffective
                ones are the point, so nothing is filtered here. */}
            <For each={attribution()!.by_template}>{t => (
              <TableRow>
                <TableCell class="whitespace-normal">
                  <strong class="text-foreground">{humanizeToken(t.template_id)}</strong>
                </TableCell>
                <TableCell numeric>{t.observations.toLocaleString()}</TableCell>
                <TableCell numeric>{fmt(t.observed_fans)}</TableCell>
                <TableCell numeric class={t.incremental_fans <= 0 ? 'text-muted-foreground' : 'font-semibold'}>
                  {fmt(t.incremental_fans)}
                </TableCell>
                <TableCell numeric>{fmt(t.durable_fans)}</TableCell>
                <TableCell numeric class="text-secondary-foreground">{fmt(t.mean_incremental_fans)}</TableCell>
                <TableCell class="text-muted-foreground">{t.best_quality.replace(/_/g, ' ')}</TableCell>
              </TableRow>
            )}</For>
          </TableBody>
        </Table>
      </Show>

      <Show when={(attribution()?.by_strategy.length ?? 0) > 0}>
        <section class="mt-6 pt-4 border-t border-border">
          <h3 class="text-sm font-semibold text-foreground">By strategy</h3>
          <Table class="mt-3">
            <TableHeader>
              <TableRow>
                <TableHead>Strategy</TableHead>
                <TableHead class="text-right">Observations</TableHead>
                <TableHead class="text-right">Observed</TableHead>
                <TableHead class="text-right">Incremental</TableHead>
                <TableHead class="text-right">Per observation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <For each={attribution()!.by_strategy}>{s => (
                <TableRow>
                  <TableCell class="whitespace-normal"><strong class="text-foreground">{s.strategy.replace(/_/g, ' ')}</strong></TableCell>
                  <TableCell numeric>{s.observations.toLocaleString()}</TableCell>
                  <TableCell numeric>{fmt(s.observed_fans)}</TableCell>
                  <TableCell numeric class={s.incremental_fans <= 0 ? 'text-muted-foreground' : 'font-semibold'}>{fmt(s.incremental_fans)}</TableCell>
                  <TableCell numeric class="text-secondary-foreground">{fmt(s.mean_incremental_fans)}</TableCell>
                </TableRow>
              )}</For>
            </TableBody>
          </Table>
        </section>
      </Show>
    </>}</Show>
  </Section>
}
