import { For, Show } from 'solid-js'
import { ApiError, errorHeading } from '../lib/api'
import type { SectionVerdict } from '../lib/types'
import { cn } from '../lib/cn'
import { ErrorCard } from './layout'
import { Button } from './ui/button'

// When every section of a read-model fan-out fails, the backend returns a
// structured 503 with per-section verdicts (state + remediation). The old
// rendering path threw that away and showed the generic `detail` string —
// "tenant read-model channel returned no usable section" — so the operator
// had no idea *which* section failed *how*. This component renders the
// structured diagnosis instead.
//
// It is used by every page that loads a tenant read model: Operations,
// Portfolio, Audience, and Health. Each passes its own fallback heading so
// the card stays contextual when the error is not an AllSectionsFailed
// variant.

const stateLabel: Record<string, string> = {
  ok: 'ok',
  timeout: 'timed out',
  unreachable: 'unreachable',
  upstream_error: 'upstream error',
  unauthorized: 'credentials refused',
  absent: 'section not found',
  rejected: 'rejected',
  contract_mismatch: 'contract mismatch',
}

const stateTone = (state: string): 'bad' | 'warn' | 'muted' => {
  if (state === 'timeout' || state === 'unreachable') return 'warn'
  if (state === 'ok') return 'muted'
  return 'bad'
}

export function SectionFailureCard(props: { error: unknown; fallback: string; onRetry?: () => void }) {
  const error = () => props.error
  const isAllSectionsFailed = () =>
    error() instanceof ApiError && (error() as ApiError).code === 'all_sections_failed'

  const sections = (): Record<string, SectionVerdict> | undefined => {
    const e = error()
    if (!(e instanceof ApiError)) return undefined
    const body = e.body as { sections?: Record<string, SectionVerdict> } | undefined
    return body?.sections
  }

  const channel = (): string | undefined => {
    const e = error()
    if (!(e instanceof ApiError)) return undefined
    return (e.body as { channel?: string } | undefined)?.channel
  }

  // Non-AllSectionsFailed errors render as a plain error card with the
  // mapped heading. This keeps the component a drop-in replacement for the
  // old `<div class="error-card">{error.message}</div>` pattern.
  return <Show when={error()}>
    <Show when={isAllSectionsFailed()} fallback={
      <ErrorCard>
        {errorHeading(error(), props.fallback)}
        <Show when={props.onRetry}><Button variant="ghost" size="sm" class="mt-2.5" onClick={() => props.onRetry!()}>Retry</Button></Show>
      </ErrorCard>
    }>
      <ErrorCard>
        <strong class="block mb-1">{errorHeading(error(), props.fallback)}</strong>
        <Show when={channel()}>
          {ch => <p class="m-0 mb-2 text-sm text-muted-foreground">Channel: <code class="text-destructive-light">{ch()}</code></p>}
        </Show>
        <ul class="list-none m-2 mt-0 p-0 flex flex-col gap-1.5">
          <For each={Object.entries(sections() ?? {})}>
            {([name, verdict]) => (
              <li class="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 p-2 rounded-sm bg-surface-1">
                <span class="font-bold text-sm uppercase tracking-tight text-foreground">{name}</span>
                <span class={cn(
                  'text-xs px-2 py-0.5 rounded-sm font-semibold whitespace-nowrap',
                  stateTone(verdict.state) === 'bad' && 'bg-destructive/15 text-destructive-light',
                  stateTone(verdict.state) === 'warn' && 'bg-warning/15 text-warning-light',
                  stateTone(verdict.state) === 'muted' && 'bg-surface-4 text-muted-foreground',
                )}>{stateLabel[verdict.state] ?? verdict.state}</span>
                <Show when={verdict.remediation}>
                  <small class="basis-full text-sm text-secondary-foreground leading-relaxed mt-0.5 break-words">{verdict.remediation}</small>
                </Show>
              </li>
            )}
          </For>
        </ul>
        <Show when={props.onRetry}><Button variant="ghost" size="sm" class="mt-2.5" onClick={() => props.onRetry!()}>Retry</Button></Show>
      </ErrorCard>
    </Show>
  </Show>
}
