import { For, Show } from 'solid-js'
import { ApiError, errorHeading } from '../lib/api'
import type { SectionVerdict } from '../lib/types'

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

export function SectionFailureCard(props: { error: unknown; fallback: string }) {
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
      <div class="error-card" role="alert">{errorHeading(error(), props.fallback)}</div>
    }>
      <div class="error-card section-failure-card" role="alert">
        <strong>{errorHeading(error(), props.fallback)}</strong>
        <Show when={channel()}>
          {ch => <p class="section-failure-channel">Channel: <code>{ch()}</code></p>}
        </Show>
        <ul class="section-failure-list">
          <For each={Object.entries(sections() ?? {})}>
            {([name, verdict]) => (
              <li class={`section-failure-item tone-${stateTone(verdict.state)}`}>
                <span class="section-failure-name">{name}</span>
                <span class="section-failure-state">{stateLabel[verdict.state] ?? verdict.state}</span>
                <Show when={verdict.remediation}>
                  <small class="section-failure-remediation">{verdict.remediation}</small>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </div>
    </Show>
  </Show>
}
