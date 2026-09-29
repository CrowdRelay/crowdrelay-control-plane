import { For, Show, createSignal } from 'solid-js'
import { authState } from '../lib/auth'
import { cn } from '../lib/cn'
import { Button } from './app/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

// The draft under the approval — read it, fix it, approve it. One primitive
// for every surface a pending action's `revisable` map lands on: the Needs
// you inbox, the content queue, the relay spread. The caller owns the edited
// state so its approve button can ask `changedFields` what to send.

/// Human labels for the revisable fields upstream may publish. Platform
/// sessions also see the machine name in small text — the wire name is what
/// a refusal or an API doc calls it.
export const DRAFT_FIELD_LABEL: Record<string, string> = {
  subject: 'Subject',
  body: 'Message',
  draft_text: 'Draft',
  summary: 'Summary',
  task_title: 'Task',
  task_detail: 'Details',
  title: 'Title',
}

/// Fields that read as one line get an input; the rest get a textarea.
const SINGLE_LINE = new Set(['subject', 'task_title', 'title'])

/** The fields whose trimmed text moved — the `revision` payload approve
 *  forwards. `undefined` when nothing changed, so a plain approve stays
 *  byte-identical to what it was before drafts were editable. */
export function changedFields(
  original: Record<string, string>,
  edited: Record<string, string>,
): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(edited)) {
    if (value.trim() !== (original[key] ?? '').trim()) out[key] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** The human label of a field the operator blanked, or null. Upstream
 *  refuses an empty replacement, so the caller blocks approve and names the
 *  field instead of shipping a write that is known to fail. */
export function emptiedField(edited: Record<string, string>): string | null {
  for (const [key, value] of Object.entries(edited)) {
    if (value.trim() === '') return DRAFT_FIELD_LABEL[key] ?? key
  }
  return null
}

export function DraftEditor(props: {
  /// The `revisable` map — the fields upstream offers for edit, with their
  /// current text. Rendered exactly as given: never a field upstream did
  /// not name.
  fields: Record<string, string>
  /// The caller's edited copy, keyed the same way. Unedited fields fall
  /// back to `fields`.
  value: Record<string, string>
  onChange: (field: string, value: string) => void
  editing: boolean
  onToggle: () => void
  /// Per-field character ceilings (a Reddit title caps at 300). Displayed
  /// as a counter; the caller blocks approve on overflow.
  maxLength?: Record<string, number>
}) {
  const platform = () => authState.isPlatformLevel()
  return (
    <div class="mt-2 flex flex-col gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
      <For each={Object.keys(props.fields)}>
        {key => (
          <DraftField
            name={key}
            label={DRAFT_FIELD_LABEL[key] ?? key}
            platform={platform()}
            text={props.value[key] ?? props.fields[key] ?? ''}
            editing={props.editing}
            maxLength={props.maxLength?.[key]}
            onChange={value => props.onChange(key, value)}
          />
        )}
      </For>
      <Show when={props.editing}>
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs text-muted-foreground leading-relaxed">
            {platform()
              ? 'Edits are sent with the approval and measured as a distance from the draft — that is how the drafts learn your voice.'
              : 'Your edits go out instead of the draft, and teach it how you write.'}
          </p>
          <Button variant="ghost" size="sm" class="h-7 shrink-0 px-2 text-xs" onClick={props.onToggle}>
            Done
          </Button>
        </div>
      </Show>
    </div>
  )
}

function DraftField(props: {
  name: string
  label: string
  platform: boolean
  text: string
  editing: boolean
  maxLength?: number
  onChange: (value: string) => void
}) {
  const [showAll, setShowAll] = createSignal(false)
  // "Show all" earns its place only when the text actually overflows the
  // clamp — a six-line ceiling on a two-line field is furniture.
  const long = () => props.text.split('\n').length > 6 || props.text.length > 400
  const over = () => props.maxLength != null && props.text.length > props.maxLength
  return (
    <div class="flex flex-col gap-1">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-xs font-medium text-muted-foreground">
          {props.label}
          <Show when={props.platform}>
            <code class="ml-1.5 text-xs text-muted-foreground">{props.name}</code>
          </Show>
        </span>
        <Show when={props.editing && props.maxLength != null}>
          <span class={cn('text-xs tabular-nums', over() ? 'text-destructive' : 'text-muted-foreground')}>
            {props.text.length}/{props.maxLength}
          </span>
        </Show>
      </div>
      <Show
        when={props.editing}
        fallback={
          <>
            <p class={cn('whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground', !showAll() && 'line-clamp-6')}>
              {props.text}
            </p>
            <Show when={long()}>
              <Button
                variant="link"
                class="h-auto self-start p-0 text-xs font-normal"
                onClick={() => setShowAll(v => !v)}
              >
                {showAll() ? 'Show less' : 'Show all'}
              </Button>
            </Show>
          </>
        }
      >
        {SINGLE_LINE.has(props.name) ? (
          <Input
            class="h-8 text-xs"
            value={props.text}
            onInput={e => props.onChange(e.currentTarget.value)}
          />
        ) : (
          <Textarea
            rows={4}
            class="text-xs"
            value={props.text}
            onInput={e => props.onChange(e.currentTarget.value)}
          />
        )}
      </Show>
    </div>
  )
}
