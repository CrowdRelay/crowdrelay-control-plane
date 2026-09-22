import { For, Show, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api, ApiError } from '../lib/api'
import { errorMessage, formatIsoAge } from '../lib/format'
import { Card } from './app/card'
import { Badge } from './app/badge'
import { Button } from './app/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './app/table'
import { NativeSelect } from './ui/native-select'
import { EmptyState } from './ui/empty-state'
import { ErrorCard, PanelTitle } from './layout'
import { SectionIcon } from './SectionIcon'
import { StatusBadge } from './StatusBadge'
import { Spinner } from './Spinner'
import type { ActionLedgerEntry, TraceTimeline } from '../lib/types'

const ACTION_STATES = ['PLANNED', 'AUTHORIZED', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'RECONCILING', 'CANCELLED', 'REVOKED'] as const

const stateTone = (state: string): 'good' | 'warn' | 'bad' | 'muted' => {
  switch (state) {
    case 'SUCCEEDED': return 'good'
    case 'QUEUED': case 'RUNNING': case 'RECONCILING': return 'warn'
    case 'FAILED': case 'UNKNOWN': return 'bad'
    default: return 'muted'
  }
}

const shortId = (id: string) => id.slice(0, 8)

/** The ViryaOS action ledger — every autopilot action and the state it is
 *  stuck in or finished in. Each row's trace_id opens the causal chain the
 *  upstream joins across the event tables (decision → action → outbox →
 *  delivery → evidence), fetched on demand so a 250-row list costs one
 *  request, not 250. */
export function ActionLedgerPanel(props: { slug: string }) {
  const [stateFilter, setStateFilter] = createSignal('')
  const ledger = useQuery(() => ({
    queryKey: ['operation-actions', props.slug, stateFilter()],
    queryFn: () => api.operationActions(props.slug, stateFilter() || undefined),
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  }))

  return <Card class="p-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <PanelTitle as="h3" icon={<SectionIcon name="history" />}>Action ledger</PanelTitle>
      <NativeSelect class="w-44" value={stateFilter()} onChange={(e) => setStateFilter(e.currentTarget.value)} aria-label="Filter by state">
        <option value="">All states</option>
        <For each={ACTION_STATES}>{s => <option value={s}>{s.replaceAll('_', ' ')}</option>}</For>
      </NativeSelect>
    </div>
    <p class="mt-1 text-sm text-muted-foreground">
      The durable execution intent behind every autopilot move — what was planned, approved, sent, and what reconciled after going dark.
    </p>
    <Show when={ledger.error}><ErrorCard class="mt-3">Action ledger unavailable: {errorMessage(ledger.error, 'Could not read the ledger. Try refreshing.')}</ErrorCard></Show>
    <Show when={ledger.isPending}><p class="mt-3 text-sm text-muted-foreground"><Spinner /> Loading…</p></Show>
    <Show when={ledger.data}>
      {data => <Show when={data().length > 0} fallback={
        <EmptyState label={stateFilter() ? `Nothing in state ${stateFilter()}` : 'No actions yet'} hint="Actions land here when the autopilot plans, approves and executes work. A filter that matches nothing is a quiet ledger, not a broken one." />
      }>
        <Table class="mt-3">
          <TableHeader><TableRow>
            <TableHead>State</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Entered</TableHead>
            <TableHead>Transitions</TableHead>
            <TableHead>Reconciliation</TableHead>
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            <For each={data()}>{entry => <ActionRow slug={props.slug} entry={entry} />}</For>
          </TableBody>
        </Table>
      </Show>}
    </Show>
  </Card>
}

function ActionRow(props: { slug: string; entry: ActionLedgerEntry }) {
  const [open, setOpen] = createSignal(false)
  const [trace, setTrace] = createSignal<TraceTimeline | 'none' | 'error' | null>(null)
  const [loading, setLoading] = createSignal(false)

  const loadTrace = async () => {
    const traceId = props.entry.trace_id
    if (!traceId || trace() !== null || loading()) return
    setLoading(true)
    try {
      setTrace(await api.operationTrace(props.slug, traceId))
    } catch (error) {
      setTrace(error instanceof ApiError && error.status === 404 ? 'none' : 'error')
    } finally {
      setLoading(false)
    }
  }

  const toggle = () => {
    const next = !open()
    setOpen(next)
    if (next) void loadTrace()
  }

  return <>
    <TableRow>
      <TableCell>
        <StatusBadge status={props.entry.state} tone={stateTone(props.entry.state)} />
        <Show when={props.entry.previous_state}>
          <span class="ml-1.5 text-xs text-muted-foreground">was {props.entry.previous_state}</span>
        </Show>
      </TableCell>
      <TableCell><code class="text-xs">{shortId(props.entry.action_id)}</code></TableCell>
      <TableCell><span class="text-xs text-muted-foreground">{formatIsoAge(props.entry.state_entered_at)}</span></TableCell>
      <TableCell>{props.entry.transition_count}</TableCell>
      <TableCell>
        <Show when={props.entry.reconciliation_count > 0 || props.entry.last_reconciliation_error} fallback="—">
          <span class="text-xs">
            {props.entry.reconciliation_count > 0 ? `${props.entry.reconciliation_count}×` : ''}
            <Show when={props.entry.last_reconciliation_error}>
              <span class="text-destructive"> {props.entry.last_reconciliation_error}</span>
            </Show>
          </span>
        </Show>
      </TableCell>
      <TableCell>
        <Show when={props.entry.trace_id} fallback={<span class="text-xs text-muted-foreground">no trace</span>}>
          <Button variant="link" size="sm" class="h-auto px-0" onClick={toggle}>
            {open() ? 'Hide trace' : 'Trace'}
          </Button>
        </Show>
      </TableCell>
    </TableRow>
    <Show when={open()}>
      <TableRow>
        <TableCell colSpan={6} class="bg-muted/40">
          <Show when={loading()}><span class="text-xs text-muted-foreground"><Spinner /> Tracing…</span></Show>
          <Show when={trace() === 'none'}>
            <span class="text-xs text-muted-foreground">No events carry this trace id — the action exists but left nothing to join yet.</span>
          </Show>
          <Show when={trace() === 'error'}>
            <span class="text-xs text-destructive">The trace could not be read — try again.</span>
          </Show>
          <Show when={trace() !== null && trace() !== 'none' && trace() !== 'error'}>
            {(() => { const t = trace() as TraceTimeline; return (
              <ol class="divide-y divide-border">
                <For each={t.events}>{event => <li class="py-2 text-sm">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <Badge variant="muted">{event.source}</Badge>
                    <Badge variant="outline">{event.kind}</Badge>
                    <Show when={event.state}><StatusBadge status={event.state!} tone={stateTone(event.state!)} /></Show>
                    <Badge variant="outline">{event.certainty}</Badge>
                  </div>
                  <p class="mt-1 text-muted-foreground">
                    {formatIsoAge(event.occurred_at)}
                    <Show when={event.action_id}> · action <code class="text-xs">{shortId(event.action_id!)}</code></Show>
                    <Show when={event.decision_id}> · decision <code class="text-xs">{shortId(event.decision_id!)}</code></Show>
                  </p>
                </li>}</For>
              </ol>
            ) })()}
          </Show>
        </TableCell>
      </TableRow>
    </Show>
  </>
}
