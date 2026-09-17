import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { Measure, MeasurementClaim } from '../lib/types'
import { SectionTitle } from './layout'
import { SectionIcon } from './SectionIcon'
import { Card } from './app/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './app/table'
import { SkeletonSection } from './Skeleton'

const percent = (basisPoints: number) => `${(basisPoints / 100).toFixed(1)}%`

/** What a claim resolved to. `below_floor` shows the counts and the floor it
 *  needed — never a rate, and never a fabricated 0%. `unmeasured` says why. */
function MeasureValue(props: { measure: Measure; claimKey?: string }) {
  const m = () => props.measure
  return (
    <Show when={m()}>{measure => {
      const value = measure()
      if (value.state === 'rate') {
        return <>
          <strong class="tabular-nums">{percent(value.basis_points)}</strong>
          <span class="text-muted-foreground"> {value.numerator}/{value.denominator}</span>
        </>
      }
      if (value.state === 'below_floor') {
        return <>
          <strong class="tabular-nums">{value.numerator}/{value.denominator}</strong>
          <span class="text-muted-foreground"> too few to call — needs {value.floor}</span>
        </>
      }
      if (value.state === 'count') {
        return <>
          <strong class="tabular-nums">{value.value.toLocaleString()}</strong>
          <span class="text-muted-foreground"> {value.unit}</span>
          <Show when={props.claimKey === 'fans_gathered'}>
            <span class="text-muted-foreground"> · ÷3 ≈ {Math.round(value.value / 3)} per month</span>
          </Show>
        </>
      }
      if (value.state === 'minutes') {
        return <span class="tabular-nums">median {value.median.toFixed(1)} min over {value.n}</span>
      }
      if (value.state === 'days') {
        return <span class="tabular-nums">median {value.median.toFixed(1)} days over {value.n}</span>
      }
      return <>
        <span class="text-muted-foreground">not measurable yet</span>
        <span class="block text-xs text-muted-foreground">{value.reason}</span>
      </>
    }}</Show>
  )
}

/** One ledger row: the plan's words for the claim, the plan's words for how
 *  it is measured, and the number. `room_leak` is the master variable — its
 *  label carries section-title weight and nothing else differs. */
function ClaimRow(props: { claim: MeasurementClaim }) {
  const master = () => props.claim.key === 'room_leak'
  return <>
    <TableRow>
      <TableCell class={master() ? 'font-semibold tracking-tight text-foreground' : 'text-foreground'}>
        {props.claim.claim}
      </TableCell>
      <TableCell class="text-muted-foreground">
        {props.claim.measured_as}
        <Show when={props.claim.window_days === 0}>{' · all time'}</Show>
      </TableCell>
      <TableCell numeric>
        <MeasureValue measure={props.claim.measure} claimKey={props.claim.key} />
      </TableCell>
    </TableRow>
    <For each={props.claim.breakdown}>{row =>
      <TableRow>
        <TableCell class="pl-6 text-muted-foreground">{row.label}</TableCell>
        <TableCell />
        <TableCell numeric>
          <MeasureValue measure={row.measure} />
        </TableCell>
      </TableRow>
    }</For>
  </>
}

/**
 * The measurement ledger — the plan's fifteen claims in ledger order, each
 * with its number or the reason this build cannot produce one.
 */
export function MeasurementPanel(props: { slug: string }) {
  const model = useQuery(() => ({
    queryKey: ['measurement-ledger', props.slug],
    queryFn: () => api.measurement(props.slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    // This endpoint has no `degraded` fan-out — a failure is a 503 the query
    // retries on its own; `whileIncomplete` has nothing to key on here.
  }))

  const data = () => model.data

  return <Card flat>
    <SectionTitle
      eyebrow="MEASUREMENT LEDGER"
      title="Are we getting anywhere?"
      description="The plan's fifteen claims, judged on rates rather than totals over a 90-day window. A rate is stated only once enough rows exist to mean it."
      icon={<SectionIcon name="target" />}
    />

    <Show when={model.error}>
      <div class="mt-4 rounded-lg border border-warning-foreground/30 bg-warning-foreground/10 p-4 text-sm text-warning-foreground" role="status">
        {model.error instanceof Error ? model.error.message : 'The measurement ledger is temporarily unavailable.'}
      </div>
    </Show>

    <Show when={!model.error && model.isPending}><SkeletonSection lines={8} /></Show>

    <Show when={data()}>{d =>
      <Table class="mt-4">
        <TableHeader>
          <TableRow>
            <TableHead>The claim</TableHead>
            <TableHead>Measured as</TableHead>
            <TableHead class="text-right">The number</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <For each={d().claims}>{claim => <ClaimRow claim={claim} />}</For>
        </TableBody>
      </Table>
    }</Show>
  </Card>
}
