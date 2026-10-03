import { Show, createUniqueId, type JSX } from 'solid-js'
import { Button } from '~/components/app/button'
import { Spinner } from '~/components/Spinner'
import { cn } from '~/lib/cn'

/**
 * Settings layout — every Settings sub-page is built from these three pieces,
 * after the Untitled UI settings pattern:
 *
 *   <SettingsSection title="Regional profile" description="…" actions={<SaveActions …/>}>
 *     <SettingsRow label="Country" hint="ISO 3166-1, e.g. DE."><Input … /></SettingsRow>
 *     <SettingsRow label="Timezone">…</SettingsRow>
 *   </SettingsSection>
 *
 * - A section is a heading, a sentence and its actions, then a rule. A form
 *   section's actions are Cancel and Save; they act on every row below it.
 * - A row is two columns from `md` up: what the setting is on the left, the
 *   control on the right. Below `md` they stack. Tables and lists span the
 *   right column the same way a field does.
 * - `tone="danger"` is for actions that cannot be undone: the heading turns
 *   destructive and the section is boxed so it reads apart from the rest.
 */
export function SettingsSection(props: {
  title: string
  description?: JSX.Element
  /** Right of the heading: Cancel / Save for a form, an Add button for a list. */
  actions?: JSX.Element
  tone?: 'danger'
  /** A single block (a table) instead of rows — drops the row dividers. */
  plain?: boolean
  id?: string
  class?: string
  children?: JSX.Element
}) {
  // Every section is a named region, so it is a landmark a screen reader can jump to.
  const uid = createUniqueId()
  const headingId = () => `${props.id ?? uid}-title`
  return (
    <section
      id={props.id}
      aria-labelledby={headingId()}
      class={cn(props.tone === 'danger' && 'rounded-lg border border-destructive/40 p-4', props.class)}
    >
      {/* The rule separates the heading from what it heads — a section that is
          only a heading and a link has nothing to separate. */}
      <div class={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4', props.children && 'border-b border-border pb-4')}>
        <div class="min-w-0">
          <h2 id={headingId()} class={cn('m-0 text-base font-semibold', props.tone === 'danger' ? 'text-destructive' : 'text-foreground')}>{props.title}</h2>
          <Show when={props.description}>
            <p class="m-0 mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{props.description}</p>
          </Show>
        </div>
        <Show when={props.actions}>
          <div class="flex shrink-0 flex-wrap items-center gap-2">{props.actions}</div>
        </Show>
      </div>
      <Show when={props.children}>
        <div class={props.plain ? 'pt-4' : 'divide-y divide-border'}>{props.children}</div>
      </Show>
    </section>
  )
}

/** One setting: label and hint on the left, the control on the right. */
export function SettingsRow(props: {
  label: JSX.Element
  hint?: JSX.Element
  /** The control's id, so the label clicks through to it. */
  for?: string
  children: JSX.Element
  class?: string
}) {
  return (
    <div class={cn('grid gap-2 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-8', props.class)}>
      <div class="min-w-0">
        <Show when={props.for} fallback={<div class="text-sm font-medium text-foreground">{props.label}</div>}>
          <label for={props.for} class="text-sm font-medium text-foreground">{props.label}</label>
        </Show>
        <Show when={props.hint}>
          <p class="m-0 mt-1 text-sm leading-relaxed text-muted-foreground">{props.hint}</p>
        </Show>
      </div>
      <div class="min-w-0 max-w-xl">{props.children}</div>
    </div>
  )
}

/**
 * Cancel / Save for a form section. Both stay put and disable while nothing
 * has changed, so the header never jumps; `blocked` says why Save is held
 * when the draft cannot be sent as it is.
 */
export function SaveActions(props: {
  dirty: boolean
  pending?: boolean
  onCancel: () => void
  onSave: () => void
  saveLabel?: string
  blocked?: string | null
  /** Shown beside the buttons after a save, until the next edit. */
  saved?: boolean
}) {
  return (
    <>
      <Show when={props.dirty && props.blocked}>
        <span class="text-xs text-warning-foreground" aria-live="polite">{props.blocked}</span>
      </Show>
      <Show when={!props.dirty && props.saved}>
        <span class="text-xs text-muted-foreground" aria-live="polite">Saved</span>
      </Show>
      <Button variant="outline" size="sm" disabled={!props.dirty || props.pending} onClick={props.onCancel}>Cancel</Button>
      <Button writes size="sm" disabled={!props.dirty || props.pending || Boolean(props.blocked)} onClick={props.onSave}>
        {props.pending && <Spinner />} {props.pending ? 'Saving…' : props.saveLabel ?? 'Save'}
      </Button>
    </>
  )
}
