import { For, Show, createSignal } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { errorHeading, request } from '../../lib/api'
import { fillPath, pathParams, surface } from '../../lib/surface'
import type { Capability, CapabilityAction } from '../../lib/capabilities'
import { Badge } from '../app/badge'
import { Button } from '../app/button'
import { Alert } from '../app/alert'
import { Input } from '../ui/input'
import { NativeSelect } from '../ui/native-select'
import { Label } from '../app/label'
import { SkeletonRows } from '../Skeleton'
import { ActionForm } from './ActionForm'
import { DataView } from './DataView'

/** A read whose path needs an identifier waits for one instead of firing a
 *  request that can only 400. */
function ReadParams(props: { names: string[]; values: Record<string, string>; onApply: (values: Record<string, string>) => void }) {
  const [draft, setDraft] = createSignal<Record<string, string>>({ ...props.values })
  return (
    <div class="flex flex-wrap items-end gap-2">
      <For each={props.names}>{(name) => (
        <div class="space-y-1">
          <Label>{name.replace(/_/g, ' ')}</Label>
          <Input class="h-9 w-72" value={draft()[name] ?? ''} onInput={(event) => setDraft({ ...draft(), [name]: event.currentTarget.value })} />
        </div>
      )}</For>
      <Button size="sm" variant="outline" onClick={() => props.onApply(draft())}>Load</Button>
    </div>
  )
}

export function CapabilityCard(props: { slug: string; capability: Capability; platformLevel: boolean; initiallyOpen?: boolean }) {
  const queryClient = useQueryClient()
  // Collapsed until opened: the page lists every capability, and reading all
  // of them at once would put dozens of requests on one tenant for a glance.
  const [expanded, setExpanded] = createSignal(props.initiallyOpen ?? false)
  const [open, setOpen] = createSignal<CapabilityAction | null>(null)
  const [rowAction, setRowAction] = createSignal<{ action: CapabilityAction; fixed: Record<string, string> } | null>(null)
  const [params, setParams] = createSignal<Record<string, string>>({})
  const [query, setQuery] = createSignal<Record<string, string>>({})
  const readPath = () => {
    if (props.capability.tenantRead) return props.capability.tenantRead.path
    return props.capability.read ? fillPath(props.capability.read.path, params()) : null
  }
  const readNames = () => (props.capability.read ? pathParams(props.capability.read.path) : [])
  const key = () => ['surface', props.slug, readPath(), query()]
  const data = useQuery(() => ({
    queryKey: key(),
    queryFn: () => (props.capability.tenantRead
      ? request<unknown>(`/tenants/${encodeURIComponent(props.slug)}/${props.capability.tenantRead.path}`)
      : surface.read(props.slug, readPath()!, query())),
    enabled: expanded() && readPath() !== null && (!props.capability.platformOnly || props.platformLevel),
    staleTime: 15_000,
    retry: 1,
  }))
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['surface', props.slug] })
  const rowActions = () => (props.capability.actions ?? []).filter(action => action.rowParams)
  const formActions = () => (props.capability.actions ?? []).filter(action => !action.rowParams)

  return (
    <article class="space-y-3 rounded-lg border border-border p-4">
      <header class="flex cursor-pointer flex-wrap items-start justify-between gap-2" onClick={() => setExpanded(!expanded())}>
        <div class="min-w-0">
          <h3 class="font-semibold text-foreground">{props.capability.title}</h3>
          <p class="mt-0.5 max-w-3xl text-sm text-muted-foreground">{props.capability.purpose}</p>
        </div>
        <div class="flex flex-wrap gap-1">
          <Show when={props.capability.read || props.capability.tenantRead}><Badge variant="outline">reads</Badge></Show>
          <Show when={(props.capability.actions ?? []).length > 0}><Badge variant="outline">writes</Badge></Show>
          <Show when={props.capability.platformOnly}><Badge variant="muted">platform only</Badge></Show>
        </div>
      </header>

      <Show when={expanded()}>
      <Show when={!props.capability.platformOnly || props.platformLevel} fallback={
        <p class="text-sm text-muted-foreground">Operator tooling — shown to platform-level sessions only.</p>
      }>
        <Show when={props.capability.read || props.capability.tenantRead}>
          <Show when={readNames().length > 0}>
            <ReadParams names={readNames()} values={params()} onApply={setParams} />
          </Show>
          <Show when={(props.capability.read?.query ?? []).length > 0}>
            <div class="flex flex-wrap items-end gap-2">
              <For each={props.capability.read!.query!}>{(field) => (
                <div class="space-y-1">
                  <Label>{field.label}</Label>
                  <Show when={field.kind === 'select'} fallback={
                    <Input class="h-9 w-40" value={query()[field.name] ?? ''} onChange={(event) => setQuery({ ...query(), [field.name]: event.currentTarget.value })} />
                  }>
                    <NativeSelect size="sm" class="w-40" value={query()[field.name] ?? ''} onChange={(event) => setQuery({ ...query(), [field.name]: event.currentTarget.value })}>
                      <option value="">any</option>
                      <For each={field.options ?? []}>{(option) => <option value={option}>{option}</option>}</For>
                    </NativeSelect>
                  </Show>
                </div>
              )}</For>
            </div>
          </Show>
          <Show when={readPath() !== null}>
            <Show when={!data.isLoading} fallback={<SkeletonRows count={3} />}>
              <Show when={!data.error} fallback={<Alert tone="destructive">{errorHeading(data.error, 'This read failed')}</Alert>}>
                <DataView
                  value={data.data}
                  actions={rowActions().length > 0 ? (row) => (
                    <div class="flex gap-1">
                      <For each={rowActions()}>{(action) => (
                        <Button size="xs" variant="outline" writes onClick={() => {
                          const fixed = Object.fromEntries(Object.entries(action.rowParams!).map(([param, field]) => [param, String(row[field] ?? '')]))
                          setRowAction({ action, fixed })
                        }}>{action.label}</Button>
                      )}</For>
                    </div>
                  ) : undefined}
                />
              </Show>
            </Show>
          </Show>
        </Show>

        <Show when={rowAction()} keyed>
          {(current) => (
            <div>
              <p class="mb-1 text-xs text-muted-foreground">{current.action.label} · {Object.values(current.fixed).join(' · ')}</p>
              <ActionForm slug={props.slug} action={current.action} fixed={current.fixed} onDone={refresh} onCancel={() => setRowAction(null)} />
            </div>
          )}
        </Show>

        <Show when={formActions().length > 0}>
          <div class="flex flex-wrap gap-2">
            <For each={formActions()}>{(action) => (
              <Button size="sm" variant={open() === action ? 'default' : 'outline'} writes onClick={() => setOpen(open() === action ? null : action)}>
                {action.label}
              </Button>
            )}</For>
          </div>
          <Show when={open()} keyed>
            {(action) => <ActionForm slug={props.slug} action={action} onDone={refresh} onCancel={() => setOpen(null)} />}
          </Show>
        </Show>
      </Show>
      </Show>
    </article>
  )
}
