import { type Component, type JSX, splitProps } from 'solid-js'
import { cn } from '~/lib/cn'

/**
 * Table — dense, operator-console table primitives. Right-align numerics
 * with `tabular-nums` on the TableCell. Keep row height tight.
 *
 * Matches the former `.data-table` CSS: tight px-2 padding, text
 * truncation in cells, sticky headers, edge-aligned first/last columns.
 */

export const Table: Component<JSX.HTMLAttributes<HTMLTableElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div class="w-full overflow-auto">
      <table class={cn('w-full text-sm border-collapse', local.class)} {...rest} />
    </div>
  )
}

export const TableHeader: Component<JSX.HTMLAttributes<HTMLTableSectionElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <thead class={cn('[&_tr]:border-b [&_tr]:border-border', local.class)} {...rest} />
}

export const TableBody: Component<JSX.HTMLAttributes<HTMLTableSectionElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return <tbody class={cn('[&_tr:last-child]:border-0', local.class)} {...rest} />
}

export const TableRow: Component<JSX.HTMLAttributes<HTMLTableRowElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <tr
      class={cn('border-b border-border-subtle transition-colors hover:bg-surface-1', local.class)}
      {...rest}
    />
  )
}

export const TableHead: Component<JSX.ThHTMLAttributes<HTMLTableCellElement> & { class?: string }> = (props) => {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <th
      class={cn(
        'text-left text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-border py-1 px-2 first:pl-0 last:pr-0 sticky top-0 z-[1] bg-surface-2',
        local.class,
      )}
      {...rest}
    />
  )
}

export const TableCell: Component<JSX.TdHTMLAttributes<HTMLTableCellElement> & { class?: string; numeric?: boolean }> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'numeric'])
  return (
    <td
      class={cn(
        'py-2.5 px-2 first:pl-0 last:pr-0 text-foreground overflow-hidden text-ellipsis whitespace-nowrap align-middle',
        local.numeric && 'text-right tabular-nums',
        local.class,
      )}
      {...rest}
    />
  )
}
