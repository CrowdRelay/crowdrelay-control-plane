import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { capability } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { formatTimestamp } from '../lib/format'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Badge } from './app/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './app/table'

// "Are we going to make it, and what is in the way" — CrowdRelay's goal
// scoreboard (`/v1/control-plane/ops/goal`). Planned and actual are different
// units (expected Y30 fans against the objective's own series) and are shown
// side by side, never divided. The lanes table is the cut list: a lane with
// enough resolved outcomes and no fans is where the next weeks should not go.
// The Reddit block is the breaker the executor applies, read the same way.

type Lane = {
  context: string
  action_kind: string
  dispatched: number
  resolved: number
  fans: number
  cut_candidate: boolean
}

type Scoreboard = {
  objective: { metric_key: string; target_value: number; deadline: string } | null
  pace: { posture: string } | null
  since: string
  planned: { dispatches: number; expected_new_fans: number }
  actual: { travelled: number | null; observed_value: number | null; target_value: number | null }
  learning: { resolved_since: number; resolved_total: number; pending: number; target_resolved: number }
  approvals: {
    approved_by_people: number
    median_hours: number | null
    p90_hours: number | null
    awaiting: number
    oldest_awaiting_hours: number | null
  }
  lanes_60d: Lane[]
  reddit: {
    state: 'open' | 'halted'
    daily_cap: number | null
    halt_reason: string | null
    posted_24h: number
    posts_180d: number
    removed_by: string[]
  }
}

const hours = (value: number | null) => (value == null ? '—' : value < 48 ? `${value.toFixed(1)}h` : `${(value / 24).toFixed(1)}d`)
const words = (value: string) => value.replaceAll('_', ' ')

function Stat(props: { label: string; value: string; hint?: string }) {
  return (
    <div class="rounded-lg border border-border bg-background px-3 py-2">
      <p class="text-xs uppercase tracking-wide text-muted-foreground">{props.label}</p>
      <p class="text-lg font-semibold text-foreground">{props.value}</p>
      <Show when={props.hint}><p class="text-xs text-muted-foreground">{props.hint}</p></Show>
    </div>
  )
}

export function GoalScoreboardPanel(props: { slug: string }) {
  const board = useQuery(() => ({
    queryKey: ['surface', props.slug, 'goal'],
    queryFn: () => surface.read<Scoreboard>(props.slug, capability('goal').read!.path),
    staleTime: 60_000,
    retry: 1,
  }))

  return (
    <Section
      title="Goal scoreboard"
      icon={<SectionIcon name="trending-up" />}
      description="What the brain planned against what moved, how much it has learned, how long approvals take, which lanes produced no fans, and whether Reddit still trusts the account."
    >
      <Show when={!board.error} fallback={<p class="text-sm text-muted-foreground">Couldn't read the scoreboard.</p>}>
        <Show when={board.data} fallback={<p class="text-sm text-muted-foreground">Checking…</p>}>
          {data => (
            <div class="space-y-4">
              <p class="text-xs text-muted-foreground">
                <Show when={data().objective} fallback={<>No live objective — the numbers cover the last 21 days.</>}>
                  {objective => <>
                    Working toward <strong class="text-foreground">{words(objective().metric_key)} = {objective().target_value}</strong> by {formatTimestamp(objective().deadline)}
                    <Show when={data().pace}>{pace => <> · <Badge variant={pace().posture === 'behind' ? 'warning' : 'success'}>{words(pace().posture)}</Badge></>}</Show>
                  </>}
                </Show>
                {' '}Since {formatTimestamp(data().since)}.
              </p>
              <div class="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Stat label="Planned" value={`${data().planned.expected_new_fans.toFixed(1)} fans`} hint={`${data().planned.dispatches} dispatches expected this`} />
                <Stat
                  label="Moved"
                  value={data().actual.travelled == null ? '—' : `${data().actual.travelled}`}
                  hint={data().actual.observed_value == null ? 'series not read yet' : `now ${data().actual.observed_value} of ${data().actual.target_value ?? '—'}`}
                />
                <Stat
                  label="Learned from"
                  value={`${data().learning.resolved_total} / ${data().learning.target_resolved}`}
                  hint={`${data().learning.resolved_since} since start · ${data().learning.pending} pending`}
                />
                <Stat
                  label="Approvals"
                  value={hours(data().approvals.median_hours)}
                  hint={`median · ${data().approvals.awaiting} waiting, oldest ${hours(data().approvals.oldest_awaiting_hours)}`}
                />
              </div>

              <div class="rounded-lg border border-border bg-background px-4 py-3">
                <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reddit standing</p>
                <p class="mt-1 text-sm">
                  <Badge variant={data().reddit.state === 'open' ? 'success' : 'destructive'}>{data().reddit.state}</Badge>{' '}
                  <Show when={data().reddit.state === 'open'} fallback={<span class="text-destructive">{data().reddit.halt_reason}</span>}>
                    up to <strong>{data().reddit.daily_cap}</strong> post(s) a day · {data().reddit.posted_24h} in the last 24h · {data().reddit.posts_180d} in 180 days
                  </Show>
                </p>
                <Show when={data().reddit.removed_by.length > 0}>
                  <p class="mt-1 text-xs text-muted-foreground">Removed by moderators of {data().reddit.removed_by.map(name => `r/${name}`).join(', ')} — those communities get drafts for a person only.</p>
                </Show>
              </div>

              <Show when={data().lanes_60d.length > 0}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lane (60 days)</TableHead>
                      <TableHead class="text-right">Sent</TableHead>
                      <TableHead class="text-right">Resolved</TableHead>
                      <TableHead class="text-right">Fans</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <For each={data().lanes_60d}>{lane => (
                      <TableRow>
                        <TableCell>{words(lane.context)} · {lane.action_kind}</TableCell>
                        <TableCell class="text-right">{lane.dispatched}</TableCell>
                        <TableCell class="text-right">{lane.resolved}</TableCell>
                        <TableCell class="text-right">{lane.fans.toFixed(1)}</TableCell>
                        <TableCell>
                          <Show when={lane.cut_candidate}><Badge variant="warning">cut candidate</Badge></Show>
                        </TableCell>
                      </TableRow>
                    )}</For>
                  </TableBody>
                </Table>
              </Show>
            </div>
          )}
        </Show>
      </Show>
    </Section>
  )
}
