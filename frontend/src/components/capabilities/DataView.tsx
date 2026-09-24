import { For, Show, createSignal, type JSX } from 'solid-js'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../app/table'
import { EmptyState } from '../ui/empty-state'

// A generic rendering of whatever a capability read returns — enough for a
// person to see what the system knows before a designed panel exists for it.
// Arrays of objects become tables, objects become label/value lists, and a
// missing value prints as a dash, never as 0: a zero here would be a number
// nobody measured.

type Row = Record<string, unknown>

const isRow = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isRows = (value: unknown): value is Row[] =>
  Array.isArray(value) && value.length > 0 && value.every(isRow)

const humanise = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')

export function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : '—'
  if (typeof value === 'string') {
    // Timestamps read as dates, not as RFC 3339.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
      const date = new Date(value)
      if (!Number.isNaN(date.getTime())) return date.toLocaleString()
    }
    return value.length > 120 ? `${value.slice(0, 117)}…` : value
  }
  if (Array.isArray(value)) return value.length === 0 ? 'none' : `${value.length} items`
  return '{…}'
}

const isScalar = (value: unknown) => value === null || typeof value !== 'object'

/** Scalar columns across the first rows, in first-seen order, capped so a
 *  wide record stays readable; the rest is one click away on the row. */
function columns(rows: Row[]): string[] {
  const seen: string[] = []
  for (const row of rows.slice(0, 25)) {
    for (const [key, value] of Object.entries(row)) {
      if (!seen.includes(key) && isScalar(value)) seen.push(key)
    }
  }
  return seen.slice(0, 8)
}

export function RowsTable(props: { rows: Row[]; actions?: (row: Row) => JSX.Element }) {
  const [all, setAll] = createSignal(false)
  const [open, setOpen] = createSignal<number | null>(null)
  const cols = () => columns(props.rows)
  const shown = () => (all() ? props.rows : props.rows.slice(0, 25))
  return (
    <div class="rounded-md border border-border">
      <Table maxHeight="32rem">
        <TableHeader>
          <TableRow>
            <For each={cols()}>{(col) => <TableHead class="whitespace-nowrap capitalize">{humanise(col)}</TableHead>}</For>
            <Show when={props.actions}><TableHead /></Show>
          </TableRow>
        </TableHeader>
        <TableBody>
          <For each={shown()}>{(row, index) => (
            <>
              <TableRow class="cursor-pointer" onClick={() => setOpen(open() === index() ? null : index())}>
                <For each={cols()}>{(col) => (
                  <TableCell numeric={typeof row[col] === 'number'} class="max-w-xs truncate">{formatScalar(row[col])}</TableCell>
                )}</For>
                <Show when={props.actions}>
                  <TableCell class="whitespace-nowrap" onClick={(event) => event.stopPropagation()}>{props.actions!(row)}</TableCell>
                </Show>
              </TableRow>
              <Show when={open() === index()}>
                <TableRow>
                  <TableCell colSpan={cols().length + (props.actions ? 1 : 0)}>
                    <ObjectView value={row} depth={1} />
                  </TableCell>
                </TableRow>
              </Show>
            </>
          )}</For>
        </TableBody>
      </Table>
      <Show when={props.rows.length > 25 && !all()}>
        <p class="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Showing 25 of {props.rows.length}.{' '}
          <span class="cursor-pointer text-primary underline underline-offset-2" onClick={() => setAll(true)}>Show all</span>
        </p>
      </Show>
    </div>
  )
}

function ObjectView(props: { value: Row; depth: number; actions?: (row: Row) => JSX.Element }) {
  const entries = () => Object.entries(props.value)
  const scalars = () => entries().filter(([, value]) => isScalar(value))
  const nested = () => entries().filter(([, value]) => !isScalar(value))
  return (
    <div class="space-y-3">
      <Show when={scalars().length > 0}>
        <dl class="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <For each={scalars()}>{([key, value]) => (
            <div class="flex min-w-0 gap-2">
              <dt class="shrink-0 capitalize text-muted-foreground">{humanise(key)}</dt>
              <dd class="min-w-0 truncate font-medium text-foreground">{formatScalar(value)}</dd>
            </div>
          )}</For>
        </dl>
      </Show>
      <For each={nested()}>{([key, value]) => (
        <div>
          <p class="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{humanise(key)}</p>
          <DataView value={value} depth={props.depth + 1} actions={props.actions} />
        </div>
      )}</For>
    </div>
  )
}

/** Render any JSON value. `actions` renders per row of the first table. */
export function DataView(props: { value: unknown; depth?: number; actions?: (row: Row) => JSX.Element }) {
  const depth = () => props.depth ?? 0
  return (
    <Show when={depth() < 4} fallback={<pre class="max-h-60 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(props.value, null, 2)}</pre>}>
      <Show when={!isRows(props.value)} fallback={<RowsTable rows={props.value as Row[]} actions={props.actions} />}>
        <Show when={isRow(props.value)} fallback={
          <Show when={Array.isArray(props.value)} fallback={<span class="text-sm text-foreground">{formatScalar(props.value)}</span>}>
            <Show when={(props.value as unknown[]).length > 0} fallback={<EmptyState label="Nothing here yet" />}>
              <p class="text-sm text-foreground">{(props.value as unknown[]).map(formatScalar).join(', ')}</p>
            </Show>
          </Show>
        }>
          <ObjectView value={props.value as Row} depth={depth()} actions={props.actions} />
        </Show>
      </Show>
    </Show>
  )
}
