import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import type { ExecutorCapabilityRow } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { SectionIcon } from './SectionIcon'
import { Card } from './app/card'
import { PanelTitle } from './layout'
import { CAPABILITY_LABELS, labelOr } from '../lib/opportunity-labels'

// N.9 — the registry the dispatch gate enforces, laid out per lane. The
// scorecard above counts capabilities; this names them: which lanes a worker
// is running, which are held, and which a parked action needs while nobody
// advertises them. Until this read existed the gap surfaced only as a
// refusal sentence at the moment somebody approved — the panel is that
// answer before the moment.
//
// Read-only by construction: nothing here mutates, and a tenant that cannot
// answer fails this panel alone — never the page around it.
//
// `missing` leads because it is the actionable set: approvals for those
// lanes park until an executor advertises. `blocked` is advertised but held
// — the repair is on the named executor, not the registry. `live` collapses:
// working lanes are the background, not the read.

/** The lane's name is the job it does, in the console's shared vocabulary;
 *  the raw registration key stays on the tooltip for the operator matching
 *  a manifest. */
const laneLabel = (capability: string) => labelOr(CAPABILITY_LABELS, capability)

function LaneRow(props: { row: ExecutorCapabilityRow }) {
  return (
    <li class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
      <span class="text-foreground" title={props.row.capability}>{laneLabel(props.row.capability)}</span>
      <Show when={props.row.executors.length > 0}>
        <span class="text-xs text-muted-foreground">{props.row.executors.join(', ')}</span>
      </Show>
      <Show when={props.row.awaiting > 0}>
        <span class="text-xs text-muted-foreground">· {props.row.awaiting} waiting</span>
      </Show>
    </li>
  )
}

export function ExecutorCapabilitiesPanel(props: { slug: string }) {
  // A plain proxy read, not a fan-out read model: the answer has no degraded
  // sections to poll for, and a tenant that cannot answer arrives as a query
  // error — the panel says so instead of reporting a fake zero lanes.
  const lanes = useQuery(() => ({
    queryKey: ['executor-capabilities', props.slug],
    queryFn: () => api.executorCapabilities(props.slug),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  }))

  const missing = () => (lanes.data?.capabilities ?? []).filter(row => row.state === 'missing')
  const blocked = () => (lanes.data?.capabilities ?? []).filter(row => row.state === 'blocked')
  const live = () => (lanes.data?.capabilities ?? []).filter(row => row.state === 'live')
  // The quiet states: nothing parked on a missing lane, nothing held. An
  // empty registry is its own honest line, not a wall of "missing".
  const quiet = () => missing().length === 0 && blocked().length === 0

  const badge = (): { status: string; tone: 'good' | 'warn' | 'bad' | 'muted' } | null => {
    const data = lanes.data
    if (!data) return null
    if (missing().length > 0) {
      return {
        status: authState.isPlatformLevel()
          ? `${missing().length} missing`
          : `${missing().length} can't run`,
        tone: 'bad',
      }
    }
    if (blocked().length > 0) return { status: `${blocked().length} held`, tone: 'warn' }
    if (!data.executors_registered) {
      return { status: authState.isPlatformLevel() ? 'none registered' : 'none yet', tone: 'muted' }
    }
    return { status: authState.isPlatformLevel() ? 'all live' : 'all running', tone: 'good' }
  }

  return (
    <Card flat>
      <div class="flex items-start justify-between gap-4 mb-1">
        <div>
          <PanelTitle icon={<SectionIcon name="server" />}>What can run</PanelTitle>
          <p class="mt-1 text-sm text-muted-foreground leading-relaxed">
            {authState.isPlatformLevel()
              ? "Every lane the workspace's executors advertise, and every lane a parked action is waiting on — the registry the dispatch gate enforces."
              : 'The kinds of work that can run right now, and the ones a waiting action needs but nothing can do yet.'}
          </p>
        </div>
        <Show when={badge()}>{b => <StatusBadge status={b().status} tone={b().tone} />}</Show>
      </div>

      <Show when={lanes.error}>
        <p class="mt-2 text-sm text-muted-foreground">The lane list could not be loaded.</p>
      </Show>
      <Show when={!lanes.data && !lanes.error}>
        <p class="mt-2 text-sm text-muted-foreground">Checking what can run…</p>
      </Show>

      <Show when={lanes.data}>{data => <>
        {/* No executor has ever heartbeated: the dispatcher fails open on an
            empty registry, so nothing is being gated — the honest line says
            that rather than letting the same rows read as a wall of missing. */}
        <Show when={!data().executors_registered}>
          <p class="mt-2 text-sm text-muted-foreground">
            {authState.isPlatformLevel()
              ? 'No executor has ever registered, so the capability gate is not enforcing — lanes appear here once one heartbeats.'
              : 'No worker has ever checked in — this list fills in once one does.'}
          </p>
        </Show>

        {/* The actionable set first. Approvals on these park — the row's
            waiting count is what the missing lane is costing right now. */}
        <Show when={missing().length > 0}>
          <div class="mt-3">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {authState.isPlatformLevel() ? 'Missing — nothing advertises these' : 'Nothing can do these yet'}
            </p>
            <ul class="mt-1.5 space-y-1">
              <For each={missing()}>{row => <LaneRow row={row} />}</For>
            </ul>
            <p class="mt-1.5 text-xs text-muted-foreground">
              {authState.isPlatformLevel()
                ? 'Approvals for these park until an executor advertises the lane.'
                : 'Approving these waits until a worker starts doing them.'}
            </p>
          </div>
        </Show>

        {/* Advertised but held: a worker claims the lane and something —
            breaker open, heartbeat or advertisement expired — is holding it.
            The named executor is where the check goes. */}
        <Show when={blocked().length > 0}>
          <div class="mt-3">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Advertised but held</p>
            <ul class="mt-1.5 space-y-1">
              <For each={blocked()}>{row => <LaneRow row={row} />}</For>
            </ul>
            <p class="mt-1.5 text-xs text-muted-foreground">
              {authState.isPlatformLevel()
                ? 'The named executor advertises each of these but is held — check its breaker and heartbeat.'
                : 'A worker says it can do these but is being held — check the worker.'}
            </p>
          </div>
        </Show>

        {/* Zero missing and zero held is one quiet line, not an empty panel —
            the scorecard's chips already name the live lanes. */}
        <Show when={quiet() && data().executors_registered}>
          <p class="mt-2 text-sm text-muted-foreground">
            {live().length > 0
              ? (authState.isPlatformLevel()
                  ? `Every lane this workspace needs is advertised — ${live().length} live, nothing held or missing.`
                  : 'Everything it needs to do has a worker that can do it.')
              : (authState.isPlatformLevel()
                  ? 'Executors are registered but none advertises a lane — nothing is waiting on one either.'
                  : 'Workers have checked in but none has said what it can do — nothing is waiting on one either.')}
          </p>
        </Show>

        {/* Working lanes are the background, not the read — collapsed, with
            the executor names kept for the operator matching a manifest. */}
        <Show when={!quiet() && live().length > 0}>
          <details class="mt-3">
            <summary class="cursor-pointer text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Working — {live().length} {live().length === 1 ? 'lane' : 'lanes'}
            </summary>
            <ul class="mt-1.5 space-y-1">
              <For each={live()}>{row => <LaneRow row={row} />}</For>
            </ul>
          </details>
        </Show>
      </>}</Show>
    </Card>
  )
}
