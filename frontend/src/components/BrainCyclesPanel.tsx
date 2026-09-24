import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { capability } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { authState } from '../lib/auth'
import { formatTimestamp } from '../lib/format'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Badge } from './app/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './app/table'

// The brain's last cycles — each run, what triggered it, what it decided and
// queued, which phases ran degraded and why it waited. Machinery, so it is
// shown to platform-level sessions only; the band reads the brief's
// self-assessment instead. Answers "what did the brain's last cycles do?"
// without the admin credential it used to need.

type Cycle = {
  cycle_id: string
  trigger: string
  started_at: string
  duration_ms: number
  outcome: string
  decisions_recorded: number
  actions_created: number
  degraded_phases: string[]
  wait_reason: string | null
}

export function BrainCyclesPanel(props: { slug: string }) {
  const cycles = useQuery(() => ({
    queryKey: ['surface', props.slug, 'brain-cycles'],
    queryFn: () => surface.read<{ cycles: Cycle[]; days_observed: number }>(props.slug, capability('cycles').read!.path, { limit: '10' }),
    enabled: authState.isPlatformLevel(),
    staleTime: 30_000,
    retry: 1,
  }))
  return (
    <Show when={authState.isPlatformLevel()}>
      <Section title="Recent cycles" icon={<SectionIcon name="history" />} description="The last ten runs: trigger, outcome, what each decided and queued, and any phase that ran degraded.">
        <Show when={!cycles.error} fallback={<p class="text-sm text-muted-foreground">Couldn't check the cycle log.</p>}>
          <Show when={cycles.data} fallback={<p class="text-sm text-muted-foreground">Checking…</p>}>
            <Show when={cycles.data!.cycles.length > 0} fallback={<p class="text-sm text-muted-foreground">No cycle has run yet.</p>}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead class="text-right">Decided</TableHead>
                    <TableHead class="text-right">Queued</TableHead>
                    <TableHead>Degraded / waited on</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <For each={cycles.data!.cycles}>{cycle => (
                    <TableRow>
                      <TableCell>{formatTimestamp(cycle.started_at)}</TableCell>
                      <TableCell>{cycle.trigger.replaceAll('_', ' ')}</TableCell>
                      <TableCell><Badge variant={cycle.degraded_phases.length > 0 ? 'warning' : 'muted'}>{cycle.outcome.replaceAll('_', ' ')}</Badge></TableCell>
                      <TableCell numeric>{cycle.decisions_recorded}</TableCell>
                      <TableCell numeric>{cycle.actions_created}</TableCell>
                      <TableCell class="text-xs text-muted-foreground">
                        {[cycle.degraded_phases.join(', '), cycle.wait_reason?.replaceAll('_', ' ')].filter(Boolean).join(' · ') || '—'}
                      </TableCell>
                    </TableRow>
                  )}</For>
                </TableBody>
              </Table>
            </Show>
          </Show>
        </Show>
      </Section>
    </Show>
  )
}
