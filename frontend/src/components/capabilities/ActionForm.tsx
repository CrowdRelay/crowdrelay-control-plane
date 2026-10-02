import { For, Match, Show, Switch, createSignal, createUniqueId, type JSX } from 'solid-js'
import { failureLine, lowerFirst } from '../../lib/errors'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../../lib/api'
import { fillPath, pathParams, surface } from '../../lib/surface'
import type { CapabilityAction, Field, ParamSource } from '../../lib/capabilities'
import { Button } from '../app/button'
import { Checkbox } from '../app/checkbox'
import { Label } from '../app/label'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { NativeSelect } from '../ui/native-select'
import { Alert } from '../app/alert'
import { Spinner } from '../Spinner'
import { toast } from '../app/toast'
import { tokenLabel } from '../../lib/format'
import { cn } from '../../lib/cn'

type Values = Record<string, string | boolean>

const initialValues = (fields: Field[] | undefined): Values =>
  Object.fromEntries((fields ?? []).map((field): [string, string | boolean] => [
    field.name,
    typeof field.initial === 'number' ? String(field.initial) : field.initial ?? (field.kind === 'bool' ? false : ''),
  ]))

/** Turn the typed form into the JSON body upstream expects. Blank optional
 *  fields are omitted rather than sent as empty strings or zeros. */
export function buildBody(fields: Field[], values: Values): { body: Record<string, unknown> } | { error: string } {
  const body: Record<string, unknown> = {}
  for (const field of fields) {
    const raw = values[field.name]
    if (field.kind === 'bool') { body[field.name] = raw === true; continue }
    const text = typeof raw === 'string' ? raw.trim() : ''
    if (text === '') {
      if (field.required) return { error: `${field.label} is required` }
      continue
    }
    switch (field.kind) {
      case 'number': {
        const number = Number(text)
        if (!Number.isFinite(number)) return { error: `${field.label} must be a number` }
        body[field.name] = number
        break
      }
      case 'datetime': {
        const date = new Date(text)
        if (Number.isNaN(date.getTime())) return { error: `${field.label} is not a date` }
        body[field.name] = date.toISOString()
        break
      }
      case 'json': {
        try { body[field.name] = JSON.parse(text) } catch { return { error: `${field.label} is not valid JSON` } }
        break
      }
      case 'lines': {
        const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
        body[field.name] = field.lines === 'fans'
          ? lines.map(line => {
            const [email, display_name, locale] = line.split(',').map(part => part.trim())
            return { email, display_name: display_name || null, locale: locale || null }
          })
          : lines
        break
      }
      default:
        body[field.name] = text
    }
  }
  return { body }
}

function ParamInput(props: { name: string; source: ParamSource; slug: string; value: string; onInput: (value: string) => void }) {
  const shows = useQuery(() => ({
    queryKey: ['tenant-shows', props.slug],
    queryFn: () => api.shows(props.slug),
    enabled: props.source !== 'text',
    staleTime: 60_000,
  }))
  const id = createUniqueId()
  return (
    <div class="space-y-1.5">
      <Label for={id}>{props.source === 'text' ? tokenLabel(props.name) : 'Show'}</Label>
      <Show when={props.source !== 'text'} fallback={
        <Input id={id} required value={props.value} onInput={(event) => props.onInput(event.currentTarget.value)} placeholder={props.name.endsWith('_id') ? 'id (UUID)' : props.name} />
      }>
        <NativeSelect id={id} required value={props.value} onChange={(event) => props.onInput(event.currentTarget.value)}>
          <option value="">Choose a show…</option>
          <For each={shows.data?.events ?? []}>{(show) => (
            <option value={props.source === 'event_id' ? show.id : show.slug}>
              {show.title} · {new Date(show.starts_at).toLocaleDateString()}
            </option>
          )}</For>
        </NativeSelect>
      </Show>
    </div>
  )
}

function FieldInput(props: { field: Field; value: string | boolean; onInput: (value: string | boolean) => void }) {
  const text = () => (typeof props.value === 'string' ? props.value : '')
  // Every control is named by its visible label and points at its hint, so
  // a screen reader reads both and the browser can focus it on a failed submit.
  const id = createUniqueId()
  const hintId = `${id}-hint`
  const common = () => ({ id, required: props.field.required, 'aria-describedby': props.field.hint ? hintId : undefined })
  return (
    <div class="space-y-1.5">
      <Show when={props.field.kind !== 'bool'}>
        <Label for={id}>
          {props.field.label}
          <Show when={!props.field.required}> <span class="font-normal text-muted-foreground">(optional)</span></Show>
        </Label>
      </Show>
      <Switch fallback={<Input {...common()} autocomplete="off" value={text()} onInput={(event) => props.onInput(event.currentTarget.value)} />}>
        <Match when={props.field.kind === 'bool'}>
          <Checkbox label={props.field.label} checked={props.value === true} onChange={(checked: boolean) => props.onInput(checked)} />
        </Match>
        <Match when={props.field.kind === 'select'}>
          <NativeSelect {...common()} value={text()} onChange={(event) => props.onInput(event.currentTarget.value)}>
            <option value="">Choose…</option>
            <For each={props.field.options ?? []}>{(option) => <option value={option}>{tokenLabel(option)}</option>}</For>
          </NativeSelect>
        </Match>
        <Match when={props.field.kind === 'textarea' || props.field.kind === 'json' || props.field.kind === 'lines'}>
          <Textarea {...common()} rows={props.field.kind === 'textarea' ? 4 : 6} class={props.field.kind === 'json' ? 'font-mono text-xs' : undefined} value={text()} onInput={(event) => props.onInput(event.currentTarget.value)} />
        </Match>
        <Match when={props.field.kind === 'number'}>
          <Input {...common()} type="number" value={text()} onInput={(event) => props.onInput(event.currentTarget.value)} />
        </Match>
        <Match when={props.field.kind === 'datetime'}>
          <Input {...common()} type="datetime-local" value={text()} onInput={(event) => props.onInput(event.currentTarget.value)} />
        </Match>
      </Switch>
      <Show when={props.field.hint}>
        <p id={hintId} class="text-xs text-muted-foreground text-pretty">{props.field.hint}</p>
      </Show>
    </div>
  )
}

/** One write, as a form. `fixed` carries path parameters a row already
 *  supplied; the rest are asked for. */
export function ActionForm(props: {
  slug: string
  action: CapabilityAction
  fixed?: Record<string, string>
  /** Field values the place already knows — the show a QR code is for, the
   *  fan a code is minted for. Merged over the spec's own initial values. */
  initial?: Record<string, string | boolean>
  /** Fields the place supplies and the person should not retype. */
  hidden?: string[]
  onDone?: (response: unknown) => void
  onCancel?: () => void
  /** `sheet` when the form fills a side sheet: one column, a scrolling body
   *  and a footer pinned to the bottom, like `FormDrawer`. `inline` is the
   *  bordered box that expands in place. */
  layout?: 'inline' | 'sheet'
  /** The submit button's words when the place names the act better than
   *  the spec's label ("Add opportunity" for "I found one"). */
  submitLabel?: string
  /** Shown at the top of the body — what to know before filling it in. */
  intro?: JSX.Element
}) {
  const [values, setValues] = createSignal<Values>({ ...initialValues(props.action.fields), ...props.initial })
  const visibleFields = () => (props.action.fields ?? []).filter(field => !(props.hidden ?? []).includes(field.name))
  const [params, setParams] = createSignal<Record<string, string>>({ ...props.fixed })
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [confirming, setConfirming] = createSignal(false)
  const askFor = () => pathParams(props.action.path).filter(name => !(props.fixed && name in props.fixed))

  const submit = async () => {
    setError(null)
    const path = fillPath(props.action.path, params())
    if (!path) { setError('Fill in every identifier first'); return }
    const built = buildBody(props.action.fields ?? [], values())
    if ('error' in built) { setError(built.error); return }
    if (props.action.confirm && !confirming()) { setConfirming(true); return }
    setBusy(true)
    try {
      const hasBody = (props.action.fields ?? []).length > 0
      const response = await surface.write(props.slug, props.action.method, path, hasBody ? built.body : undefined)
      toast.success(`${props.action.label}: done`)
      props.onDone?.(response)
    } catch (caught) {
      setError(failureLine(`Couldn't ${lowerFirst(props.action.label)}`, caught))
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  const sheet = () => props.layout === 'sheet'
  const label = () => props.submitLabel ?? props.action.label
  const fields = (
    <div class={sheet() ? 'flex flex-col gap-4' : 'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
      <For each={askFor()}>{(name) => (
        <ParamInput
          name={name}
          source={props.action.paramSources?.[name] ?? 'text'}
          slug={props.slug}
          value={params()[name] ?? ''}
          onInput={(value) => setParams({ ...params(), [name]: value })}
        />
      )}</For>
      <For each={visibleFields()}>{(field) => (
        <FieldInput field={field} value={values()[field.name] ?? ''} onInput={(value) => setValues({ ...values(), [field.name]: value })} />
      )}</For>
    </div>
  )
  const notices = (
    <>
      <Show when={confirming()}>
        <Alert tone="warning" title="Before this goes out">{props.action.confirm}</Alert>
      </Show>
      <Show when={error()}>
        <Alert tone="destructive">{error()}</Alert>
      </Show>
    </>
  )
  const buttons = (
    <>
      <Show when={props.onCancel}>
        <Button type="button" size="sm" variant="ghost" disabled={busy()} onClick={() => props.onCancel?.()}>Cancel</Button>
      </Show>
      <Button type="submit" size="sm" writes variant={props.action.method === 'DELETE' ? 'destructive' : undefined} disabled={busy()}>
        <Show when={busy()}><Spinner /></Show>
        {confirming() ? `Yes, ${label().toLowerCase()}` : label()}
      </Button>
    </>
  )
  // A real form: Enter submits, and the browser checks required fields and
  // focuses the first empty one before anything is sent.
  const onSubmit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = (event) => {
    event.preventDefault()
    if (!busy()) void submit()
  }

  return (
    <Show
      when={sheet()}
      fallback={
        <form class="space-y-3 rounded-md border border-border p-3" onSubmit={onSubmit}>
          {fields}
          {notices}
          <div class="flex flex-row-reverse items-center justify-end gap-2">{buttons}</div>
        </form>
      }
    >
      <form class="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
        <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-4">
          <Show when={props.intro}><div class="text-sm text-muted-foreground text-pretty">{props.intro}</div></Show>
          {fields}
          {notices}
        </div>
        <div class={cn('flex shrink-0 flex-row flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4')}>
          {buttons}
        </div>
      </form>
    </Show>
  )
}
