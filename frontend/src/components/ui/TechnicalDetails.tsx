import { For, Show, createSignal, type JSX } from 'solid-js'
import { cn } from '../../lib/cn'

/** Machine identifiers — action ids, decision ids, trace ids, digests,
 *  deployment SHAs — are debugging handles, not content. They live behind a
 *  "Technical details" disclosure: the line a person reads carries the name
 *  of the thing, and the id is one click away, in full and copyable, when a
 *  log line or a support thread needs it. */

/** One labelled identifier row inside `TechnicalDetails`. The value renders
 *  in full — truncated visually by the container only — with a hover title
 *  and a copy action, so nobody has to read hex aloud or guess what `…`
 *  hid. */
export function TechId(props: { label: string; value: string | null | undefined }) {
  const [copied, setCopied] = createSignal(false)
  const copy = () => {
    const v = props.value
    if (!v) return
    void navigator.clipboard?.writeText(v).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => undefined)
  }
  return (
    <Show when={props.value}>
      <div class="flex items-baseline gap-2 text-xs">
        <span class="w-24 shrink-0 text-muted-foreground">{props.label}</span>
        <code class="min-w-0 flex-1 truncate font-mono text-muted-foreground" title={props.value ?? ''}>{props.value}</code>
        <button
          type="button"
          class="shrink-0 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={copy}
        >{copied() ? 'copied' : 'copy'}</button>
      </div>
    </Show>
  )
}

/** The disclosure itself. `label` defaults to "Technical details"; pass a
 *  shorter noun ("ids", "raw record") when the host line already says what
 *  the thing is. */
export function TechnicalDetails(props: { label?: string; children: JSX.Element; class?: string }) {
  return (
    <details class={cn('group', props.class)}>
      <summary class="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-secondary-foreground group-open:text-secondary-foreground">
        {props.label ?? 'Technical details'}
      </summary>
      <div class="mt-1.5 flex flex-col gap-1 border-l-2 border-border pl-3">
        {props.children}
      </div>
    </details>
  )
}

/** A details block that renders a labelled list of ids at once — the common
 *  shape for an event row that carries an action id, a decision id and a
 *  trace id. Empty values are skipped; nothing renders when every id is
 *  absent. */
export function TechIdList(props: { ids: { label: string; value: string | null | undefined }[]; label?: string; class?: string }) {
  const present = () => props.ids.filter(i => i.value != null && i.value !== '')
  return (
    <Show when={present().length > 0}>
      <TechnicalDetails label={props.label ?? 'ids'} class={props.class}>
        <For each={present()}>{id => <TechId label={id.label} value={id.value} />}</For>
      </TechnicalDetails>
    </Show>
  )
}
