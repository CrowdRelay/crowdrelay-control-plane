import { For, Match, Show, Switch, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api, errorHeading } from '../../lib/api'
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
  return (
    <div class="space-y-1">
      <Label>{props.source === 'text' ? props.name.replace(/_/g, ' ') : 'Show'}</Label>
      <Show when={props.source !== 'text'} fallback={
        <Input value={props.value} onInput={(event) => props.onInput(event.currentTarget.value)} placeholder={props.name.endsWith('_id') ? 'id (UUID)' : props.name} />
      }>
        <NativeSelect value={props.value} onChange={(event) => props.onInput(event.currentTarget.value)}>
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
  return (
    <div class="space-y-1">
      <Show when={props.field.kind !== 'bool'}>
        <Label>{props.field.label}{props.field.required ? ' *' : ''}</Label>
      </Show>
      <Switch fallback={<Input value={text()} onInput={(event) => props.onInput(event.currentTarget.value)} />}>
        <Match when={props.field.kind === 'bool'}>
          <Checkbox label={props.field.label} checked={props.value === true} onChange={(checked: boolean) => props.onInput(checked)} />
        </Match>
        <Match when={props.field.kind === 'select'}>
          <NativeSelect value={text()} onChange={(event) => props.onInput(event.currentTarget.value)}>
            <option value="">—</option>
            <For each={props.field.options ?? []}>{(option) => <option value={option}>{option.replace(/_/g, ' ')}</option>}</For>
          </NativeSelect>
        </Match>
        <Match when={props.field.kind === 'textarea' || props.field.kind === 'json' || props.field.kind === 'lines'}>
          <Textarea rows={props.field.kind === 'textarea' ? 3 : 5} class={props.field.kind === 'json' ? 'font-mono text-xs' : undefined} value={text()} onInput={(event) => props.onInput(event.currentTarget.value)} />
        </Match>
        <Match when={props.field.kind === 'number'}>
          <Input type="number" value={text()} onInput={(event) => props.onInput(event.currentTarget.value)} />
        </Match>
        <Match when={props.field.kind === 'datetime'}>
          <Input type="datetime-local" value={text()} onInput={(event) => props.onInput(event.currentTarget.value)} />
        </Match>
      </Switch>
      <Show when={props.field.hint}>
        <p class="text-xs text-muted-foreground">{props.field.hint}</p>
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
      setError(errorHeading(caught, `${props.action.label} failed`))
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <div class="space-y-3 rounded-md border border-border p-3">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      <Show when={confirming()}>
        <Alert tone="warning" title="Before this goes out">{props.action.confirm}</Alert>
      </Show>
      <Show when={error()}>
        <Alert tone="destructive">{error()}</Alert>
      </Show>
      <div class="flex items-center gap-2">
        <Button size="sm" writes variant={props.action.method === 'DELETE' ? 'destructive' : undefined} disabled={busy()} onClick={() => void submit()}>
          <Show when={busy()}><Spinner /></Show>
          {confirming() ? `Yes, ${props.action.label.toLowerCase()}` : props.action.label}
        </Button>
        <Show when={props.onCancel}>
          <Button size="sm" variant="ghost" disabled={busy()} onClick={() => props.onCancel?.()}>Close</Button>
        </Show>
      </div>
    </div>
  )
}
