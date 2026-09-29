import { For, Show } from 'solid-js'
import { ApiError } from '../lib/api'
import { humanizeToken } from '../lib/format'
import { authState } from '../lib/auth'
import type { SectionVerdict } from '../lib/types'
import { cn } from '../lib/cn'
import { ErrorCard } from './layout'

// A tenant read model is a fan-out: the Control Plane asks the tenant for each
// section and assembles what it gets. When every section fails, the backend
// returns a structured 503 with per-section verdicts (state + remediation).
//
// The reader sees one plain line — what could not be loaded and that the rest
// of the page still works. The per-section diagnosis is an operator's tool,
// so it lives under Technical details and only platform-level accounts get it;
// to a band the whole read is one thing that could not be checked.
//
// Used by every page that loads a tenant read model. `title` names the
// surface from the reader's side: "Couldn't load your audience".

const stateLabel: Record<string, string> = {
  ok: 'answered',
  timeout: 'too slow to answer',
  unreachable: 'not reachable',
  upstream_error: 'answered with an error',
  unauthorized: 'sign-in refused',
  absent: 'not found',
  rejected: 'refused',
  contract_mismatch: 'answer not readable',
}

const stateTone = (state: string): 'bad' | 'warn' | 'muted' => {
  if (state === 'timeout' || state === 'unreachable') return 'warn'
  if (state === 'ok') return 'muted'
  return 'bad'
}

export function SectionFailureCard(props: { error: unknown; title: string; onRetry?: () => void }) {
  const sections = (): Record<string, SectionVerdict> | undefined => {
    const e = props.error
    if (!(e instanceof ApiError) || e.code !== 'all_sections_failed') return undefined
    return (e.body as { sections?: Record<string, SectionVerdict> } | undefined)?.sections
  }

  const diagnosis = () => {
    const entries = Object.entries(sections() ?? {})
    if (!authState.isPlatformLevel() || entries.length === 0) return undefined
    return (
      <ul class="m-0 mb-1 flex list-none flex-col gap-1.5 p-0">
        <For each={entries}>
          {([name, verdict]) => (
            <li class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
              <span class="font-medium text-foreground">{humanizeToken(name)}</span>
              <span class={cn(
                'rounded-full px-2 py-0.5 font-medium whitespace-nowrap',
                stateTone(verdict.state) === 'bad' && 'bg-destructive/10 text-destructive',
                stateTone(verdict.state) === 'warn' && 'bg-warning text-warning-foreground',
                stateTone(verdict.state) === 'muted' && 'bg-muted text-muted-foreground',
              )}>{stateLabel[verdict.state] ?? humanizeToken(verdict.state)}</span>
              <Show when={verdict.remediation}>
                <span class="basis-full text-muted-foreground text-pretty">{verdict.remediation}</span>
              </Show>
            </li>
          )}
        </For>
      </ul>
    )
  }

  return <Show when={props.error}>
    <ErrorCard
      title={props.title}
      error={props.error}
      onRetry={props.onRetry}
      recovery={props.onRetry
        ? 'The rest of the page still works. Try again, or wait — it usually comes back on its own.'
        : 'The rest of the page still works. It usually comes back on its own in a minute or two.'}
      details={diagnosis()}
    />
  </Show>
}
